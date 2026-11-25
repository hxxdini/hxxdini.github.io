import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry, BROWSER_UA } from '../http.js';
import { parseUgandaDistrict } from '../uganda-districts.js';

// Uganda e-Government Procurement portal (PPDA).
// Notice URLs are absolute: https://egpuganda.go.ug/index/{id}_egp
const BASE = 'https://egpuganda.go.ug';

export function isTruncatedSubject(subject) {
  return /(?:\.{3}|…)\s*$/u.test(String(subject ?? '').trim());
}

export function parseFullSubject(html) {
  const tables = String(html ?? '').match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) ?? [];
  for (const table of tables) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const header = rows.find((row) => /<th\b/i.test(row[1]));
    if (!header) continue;

    const headings = [...header[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
      .map((match) => stripHtml(match[1]).toLowerCase());
    const subjectColumn = headings.findIndex((heading) => /subject\s+of\s+procurement/.test(heading));
    if (subjectColumn < 0) continue;

    for (const row of rows) {
      if (/<th\b/i.test(row[1])) continue;
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
      const subjectHtml = cells[subjectColumn]?.[1];
      if (!subjectHtml) continue;
      const subject = stripHtml(subjectHtml
        .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"'));
      if (subject) return subject;
    }
  }
  return null;
}

export function completeSubject(subject, expandedSubject = null) {
  const original = String(subject ?? '').trim();
  if (!original) return null;
  const complete = isTruncatedSubject(original) ? String(expandedSubject ?? '').trim() : original;
  return complete && !isTruncatedSubject(complete) ? complete : null;
}

async function fetchFullSubject(noticeUrl) {
  try {
    const res = await fetchRetry(noticeUrl, {}, { timeoutMs: 60000 });
    if (!res.ok) return null;
    return parseFullSubject(await res.text());
  } catch {
    return null;
  }
}

// Since 2026-11-21 the /bid-notices tables are empty DataTables shells filled by
// a Laravel AJAX POST (needs the page's CSRF token + session cookie). One
// `scope=current` call covers all four procurement types.
const AJAX = '/public-bids/api-archived-notices/ajax';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export function parseCsrf(html) {
  // The current-bids table script: data: {scope: 'current', _token: "..."}
  return String(html ?? '').match(/scope:\s*'current',\s*_token:\s*"([^"]+)"/)?.[1]
    ?? String(html ?? '').match(/name="csrf-token"\s+content="([^"]+)"/)?.[1]
    ?? null;
}

export function parseEgpRows(json, today = new Date().toISOString().slice(0, 10)) {
  if (!json || !Array.isArray(json.data)) throw new Error('uganda-egp ajax: no data array');
  const out = [];
  const seen = new Set();
  for (const r of json.data) {
    const linkHtml = `${r.procuring_entity ?? ''} ${r.action_links ?? ''}`;
    const noticeUrl = linkHtml.match(/href="((?:https:\/\/egpuganda\.go\.ug)?\/index\/(\d+)_egp)"/)?.[1];
    const noticeId = noticeUrl?.match(/\/index\/(\d+)_egp/)?.[1];
    if (!noticeId || seen.has(noticeId)) continue;
    const deadline = /^\d{4}-\d{2}-\d{2}/.test(r.submission_deadline ?? '') ? r.submission_deadline.slice(0, 10) : null;
    if (deadline && deadline < today) continue;
    const subject = stripHtml(String(r.subject_procurement ?? '')).replace(/\s+/g, ' ').trim();
    if (subject.length < 8) continue;
    // Full subjects come in subject_procurement; a truncated one is expanded from the notice page later.
    const title = completeSubject(subject);
    seen.add(noticeId);
    const entity = stripHtml(String(r.procurement_name ?? '')).trim();
    const ref = String(r.procurement_ref ?? '').trim();
    const type = r.proc_types?.title ?? stripHtml(String(r.type ?? '')).trim();
    const published = /^\d{4}-\d{2}-\d{2}/.test(r.created_at ?? '') ? r.created_at.slice(0, 10) : null;
    out.push({ noticeId, subject, url: noticeUrl.startsWith('http') ? noticeUrl : `${BASE}${noticeUrl}`, title, entity, ref, type, deadline, published });
  }
  return out;
}

export async function fetchUgandaEgp() {
  const landing = await fetchRetry(`${BASE}/bid-notices`, { headers: { 'User-Agent': BROWSER_UA } }, { timeoutMs: 60000 });
  if (!landing.ok) throw new Error(`uganda-egp landing HTTP ${landing.status}`);
  const token = parseCsrf(await landing.text());
  const cookie = landing.cookies.map((c) => c.split(';', 1)[0]).join('; ');
  if (!token || !cookie) throw new Error('uganda-egp: no CSRF token/session on /bid-notices (layout changed?)');

  const rows = [];
  let total = Infinity;
  for (let page = 0; page < MAX_PAGES && page * PAGE_SIZE < total; page++) {
    const body = new URLSearchParams({ _token: token, scope: 'current', draw: String(page + 1), start: String(page * PAGE_SIZE), length: String(PAGE_SIZE) }).toString();
    const res = await fetchRetry(`${BASE}${AJAX}`, {
      method: 'POST',
      body,
      headers: {
        'User-Agent': BROWSER_UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        Referer: `${BASE}/bid-notices`,
        Cookie: cookie,
      },
    }, { timeoutMs: 60000 });
    if (!res.ok) throw new Error(`uganda-egp ajax HTTP ${res.status}`);
    let json;
    try { json = await res.json(); } catch { throw new Error('uganda-egp ajax: response is not JSON (session/CSRF rejected?)'); }
    total = Number(json.recordsFiltered ?? json.recordsTotal ?? 0);
    rows.push(...parseEgpRows(json));
    if (!json.data?.length) break;
  }
  // A non-zero total that parses to nothing means the row shape changed — say so instead of a quiet 0.
  if (total > 0 && rows.length === 0) throw new Error(`uganda-egp: ${total} notices listed but 0 parsed (row shape changed?)`);

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.noticeId)) continue;
    seen.add(r.noticeId);
    const title = r.title ?? completeSubject(r.subject, await fetchFullSubject(r.url));
    if (!title) continue;
    out.push(enrich({
      id: makeId('uganda-egp', r.noticeId),
      source: 'Uganda eGP (PPDA)',
      funder: 'Government of Uganda',
      title,
      url: r.url,
      summary: `${r.entity || r.ref} — ${r.type} tender`,
      type: 'tender',
      deadline: r.deadline,
      published: r.published,
      countries: ['Uganda'],
      raw: { noticeId: r.noticeId, ref: r.ref, entity: r.entity, type: r.type },
      ...parseUgandaDistrict(r.entity),
    }));
  }
  return out;
}
