import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);

// HTTP layer with retries + backoff. curl is primary (Node's resolver flakes for some
// hosts in sandboxed/local runs; curl is universally reliable), native fetch is fallback.
// Returns a minimal Response-like object: { ok, status, text(), json() }.
//
// options: { method, headers: {}, body: string, form: { name: jsonString }, insecureTls: bool }
// `insecureTls` skips certificate checks (curl -k). Only for public, read-only pages on a
// host whose certificate is broken server-side; say why at the call site.
// `form` sends multipart/form-data with each field typed application/json (SEDIA-style).
export async function fetchRetry(url, options = {}, { retries = 3, backoffMs = 2000, timeoutMs = 45000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await curlFetch(url, options, timeoutMs);
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e;
      // Native fetch verifies TLS, so it can't stand in for an insecureTls host.
      if (options.insecureTls) {
        lastErr = new Error(describe('curl', e));
      } else {
        // curl unavailable or failed hard — try native fetch once per attempt
        try {
          return await nativeFetch(url, options, timeoutMs);
        } catch (e2) {
          // Keep both causes: "fetch failed" alone hides blocks, resets and TLS errors.
          lastErr = new Error(`${describe('curl', e)}; ${describe('fetch', e2)}`);
        }
      }
    }
    await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
  }
  throw lastErr;
}

async function curlFetch(url, options, timeoutMs) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fundradar-'));
  const bodyFile = path.join(dir, 'body');
  const headerFile = path.join(dir, 'headers');
  const args = ['-sS', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-D', headerFile, '-o', bodyFile, '-w', '%{http_code}'];

  if (options.insecureTls) args.push('-k');
  args.push('-A', options.headers?.['User-Agent'] ?? 'Mozilla/5.0 (compatible; FundRadar/0.1)');
  if (options.method && options.method !== 'GET') args.push('-X', options.method);
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    if (k.toLowerCase() !== 'user-agent') args.push('-H', `${k}: ${v}`);
  }
  if (options.form) {
    for (const [name, json] of Object.entries(options.form)) {
      args.push('-F', `${name}=${json};type=application/json`);
    }
  } else if (options.body) {
    args.push('--data-binary', options.body);
  }
  args.push(url);

  try {
    const { stdout } = await exec('curl', args, { maxBuffer: 64 * 1024 * 1024 });
    const status = Number(stdout.trim());
    if (!status) throw new Error(`curl gave no status for ${url}`);
    const raw = await readFile(bodyFile, 'utf8').catch(() => '');
    const headers = await readFile(headerFile, 'utf8').catch(() => '');
    const lastResponse = headers.split(/\r?\n\r?\n/).filter((block) => /^HTTP\//.test(block)).at(-1) ?? '';
    const cookies = [...lastResponse.matchAll(/^set-cookie:\s*([^\r\n]+)/gim)].map((match) => match[1]);
    return makeRes(status, raw, cookies);
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function describe(label, err) {
  const detail = String(err?.stderr ?? '').trim().split('\n').pop() || err?.cause?.code || err?.cause?.message || err?.message || String(err);
  return `${label}${err?.code && typeof err.code === 'number' ? ` (${err.code})` : ''}: ${detail}`.slice(0, 300);
}

async function nativeFetch(url, options, timeoutMs) {
  const { insecureTls, ...rest } = options;
  const opts = { ...rest, signal: AbortSignal.timeout(timeoutMs) };
  if (options.form) {
    const fd = new FormData();
    for (const [name, json] of Object.entries(options.form)) {
      fd.append(name, new Blob([json], { type: 'application/json' }));
    }
    opts.body = fd;
    delete opts.form;
  }
  const res = await fetch(url, opts);
  const raw = await res.text();
  return makeRes(res.status, raw, res.headers.getSetCookie());
}

function makeRes(status, raw, cookies = []) {
  return {
    status,
    ok: status >= 200 && status < 300,
    cookies,
    text: async () => raw,
    json: async () => JSON.parse(raw),
  };
}
