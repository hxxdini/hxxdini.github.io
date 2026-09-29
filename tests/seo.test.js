import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const db = openDb();
const today = new Date().toISOString().slice(0, 10);
const live = db.prepare(`SELECT id, type, title FROM opportunities WHERE ea_relevant = 1
  AND (deadline >= ? OR (deadline IS NULL AND first_seen >= datetime('now', '-14 days')))` ).all(today);
db.close();
assert.equal(JSON.parse(fs.readFileSync(path.join(docs, 'for-you.json'), 'utf8')).total, live.length);
const sitemap = fs.readFileSync(path.join(docs, 'sitemap.xml'), 'utf8');
const indexedLeads = [...sitemap.matchAll(/<loc>https:\/\/hxxdini\.github\.io\/lead\/([\w-]+)\.html<\/loc>/g)];
assert.equal(indexedLeads.length, live.length, 'Sitemap lead count must equal live lead count');
assert.equal(new Set(indexedLeads.map((match) => match[1])).size, live.length);
for (const row of live) {
  const html = fs.readFileSync(path.join(docs, 'lead', `${row.id}.html`), 'utf8');
  assert.match(html, /<link rel="canonical"/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.doesNotMatch(html, /name="robots" content="noindex/);
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.equal(json.name, row.title);
  assert.equal(json['@type'], row.type === 'grant' ? 'MonetaryGrant' : row.type === 'loan' ? 'LoanOrCredit' : 'CreativeWork');
}
const indexedIds = new Set(indexedLeads.map((match) => match[1]));
for (const filename of fs.readdirSync(path.join(docs, 'lead')).filter((name) => name.endsWith('.html'))) {
  if (!indexedIds.has(filename.slice(0, -5))) {
    assert.match(fs.readFileSync(path.join(docs, 'lead', filename), 'utf8'), /name="robots" content="noindex,follow"/);
  }
}
assert.match(fs.readFileSync(path.join(docs, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/hxxdini\.github\.io\/sitemap\.xml/);
console.log(`SEO pages verified: ${live.length} live lead pages`);
