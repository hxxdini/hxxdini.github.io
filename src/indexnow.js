// Tell IndexNow search engines (Bing, Yandex, Seznam, Naver; Bing also feeds
// DuckDuckGo and ChatGPT search) about new pages in the sitemap. No account is
// needed: the key file at the site root proves ownership.
//
// Only URLs not submitted before are sent (state in data/indexnow-sent.json),
// because IndexNow asks callers not to resubmit unchanged pages.
// DRY_RUN=1 prints what would be sent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'hxxdini.github.io';
const KEY = 'a3f9c27e5d184b6f9e02c7d1b4a86e53';
const KEY_FILE = path.join(ROOT, 'docs', `${KEY}.txt`);
const STATE = path.join(ROOT, 'data', 'indexnow-sent.json');
const SITEMAP = path.join(ROOT, 'docs', 'sitemap.xml');
const BATCH = 10000;

if (!fs.existsSync(KEY_FILE) || fs.readFileSync(KEY_FILE, 'utf8').trim() !== KEY) {
  fs.writeFileSync(KEY_FILE, `${KEY}\n`);
}

const urls = [...fs.readFileSync(SITEMAP, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const sent = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const fresh = urls.filter((url) => !sent[url]);

if (!fresh.length) {
  console.log('IndexNow: nothing new to submit.');
  process.exit(0);
}
if (process.env.DRY_RUN) {
  console.log(`IndexNow dry run: would submit ${fresh.length} URLs, e.g.\n${fresh.slice(0, 5).join('\n')}`);
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
let ok = 0;
for (let i = 0; i < fresh.length; i += BATCH) {
  const urlList = fresh.slice(i, i + BATCH);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
  });
  // 200 = accepted, 202 = accepted, key validation pending
  if (res.status !== 200 && res.status !== 202) {
    console.log(`IndexNow: batch rejected with HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  for (const url of urlList) sent[url] = today;
  ok += urlList.length;
}

// Forget URLs that left the sitemap so they are resubmitted if they come back
const live = new Set(urls);
for (const url of Object.keys(sent)) if (!live.has(url)) delete sent[url];
fs.writeFileSync(STATE, `${JSON.stringify(sent, null, 0)}\n`);
console.log(`IndexNow: submitted ${ok} of ${fresh.length} new URLs.`);
