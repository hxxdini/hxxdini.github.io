import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, upsertOpportunity } from './db.js';
import { fetchWorldBank } from './sources/worldbank.js';
import { fetchEuSedia } from './sources/eu_sedia.js';
import { fetchFundsForNgos, fetchOpportunityDesk } from './sources/rss.js';
import { fetchUngm } from './sources/ungm.js';
import { fetchUgandaEgp } from './sources/uganda_egp.js';
import { fetchUgandaGpp } from './sources/uganda_gpp.js';
import { fetchRwandaUmucyo } from './sources/rwanda_umucyo.js';
import { fetchEthiopiaEgp } from './sources/ethiopia_egp.js';
import { fetchKenyaTenders } from './sources/kenya_tenders.js';
import { fetchWebRadar } from './sources/webradar.js';
import { fetchAecf } from './sources/aecf.js';
import { fetchReliefWeb } from './sources/reliefweb.js';
import { fetchGovUkFunding } from './sources/govuk_funding.js';
import { fetchGrantsGov } from './sources/grants_gov.js';
import { verifyFundsForNgos, verifyWebRadarFundsForNgos, isCallPost } from './sources/fundsforngos_verify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUMMARY_PATH = process.env.SUMMARY_PATH || path.join(ROOT, '.run-summary.json');

// UNDP export feed is dead (404) — see src/sources/undp.js; UNGM covers UNDP notices anyway.
const SOURCES = [
  ['World Bank Procurement', fetchWorldBank],
  ['EU Funding & Tenders', fetchEuSedia],
  ['fundsforNGOs', fetchFundsForNgos],
  ['Opportunity Desk', fetchOpportunityDesk],
  ['UNGM (UN agencies)', fetchUngm],
  ['Uganda eGP (PPDA)', fetchUgandaEgp],
  ['Uganda GPP (PPDA)', fetchUgandaGpp],
  ['Rwanda Umucyo (e-Procurement)', fetchRwandaUmucyo],
  ['Ethiopia e-GP (PPA)', fetchEthiopiaEgp],
  ['Kenya PPIP', fetchKenyaTenders],
  ['Web Radar', fetchWebRadar],
  ['AECF (Africa Enterprise Challenge Fund)', fetchAecf],
  ['ReliefWeb', fetchReliefWeb],
  ['UK International Development Funding Finder', fetchGovUkFunding],
  ['Grants.gov', fetchGrantsGov],
];

const db = openDb();
let totalNew = 0;
let totalSeen = 0;
const perSource = [];

for (const [name, fetcher] of SOURCES) {
  process.stdout.write(`→ ${name} ... `);
  try {
    const records = await fetcher();
    let added = 0;
    const before = db.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c;
    for (const rec of records) upsertOpportunity(db, rec);
    const after = db.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c;
    added = after - before;
    totalNew += added;
    totalSeen += records.length;
    perSource.push({ name, fetched: records.length, added, error: null });
    console.log(`${records.length} fetched, ${added} new`);
  } catch (e) {
    perSource.push({ name, fetched: 0, added: 0, error: e.message });
    console.log(`FAILED: ${e.message}`);
  }
}

// fundsforNGOs: drop non-calls already in the DB (sample proposals, guides,
// newsletters), then read the full article behind each teaser to confirm the
// deadline and find the funder's own call page or PDF.
const junk = db.prepare(`SELECT id, url FROM opportunities WHERE source = 'fundsforNGOs' AND ea_relevant = 1`).all()
  .filter((row) => !isCallPost(row.url));
const hide = db.prepare('UPDATE opportunities SET ea_relevant = 0 WHERE id = ?');
for (const row of junk) hide.run(row.id);
if (junk.length) console.log(`Hid ${junk.length} fundsforNGOs non-call posts`);

process.stdout.write('→ fundsforNGOs full-post check ... ');
try {
  const v = await verifyFundsForNgos(db);
  perSource.push({ name: 'fundsforNGOs full-post check', fetched: v.checked, added: 0, confirmed: v.confirmed, error: null });
  console.log(`${v.checked} checked, ${v.confirmed} deadlines confirmed${v.missing ? `, ${v.missing} not found` : ''}`);
} catch (e) {
  perSource.push({ name: 'fundsforNGOs full-post check', fetched: 0, added: 0, error: e.message });
  console.log(`FAILED: ${e.message}`);
}

// Web Radar picks up fundsforNGOs posts via Google News with only a headline;
// match them to the post and read it the same way.
process.stdout.write('→ Web Radar fundsforNGOs check ... ');
try {
  const v = await verifyWebRadarFundsForNgos(db);
  perSource.push({ name: 'Web Radar fundsforNGOs check', fetched: v.checked, added: 0, confirmed: v.confirmed, error: null });
  console.log(`${v.checked} checked, ${v.confirmed} deadlines confirmed${v.missing ? `, ${v.missing} not matched` : ''}`);
} catch (e) {
  perSource.push({ name: 'Web Radar fundsforNGOs check', fetched: 0, added: 0, error: e.message });
  console.log(`FAILED: ${e.message}`);
}

// "live" mirrors exactly what site.js/digest.js show as the live count: EA-relevant,
// plus either a future deadline or no parsed deadline but seen in the last 14 days.
// (Earlier this counted ANY row with a future deadline regardless of ea_relevant —
// inflated by hundreds of non-EA Kenya PPIP tenders — which made the Telegram
// summary disagree with the number on the site itself.)
const stats = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(ea_relevant) AS ea,
    SUM(CASE WHEN ea_relevant = 1 AND (deadline >= date('now') OR (deadline IS NULL AND first_seen >= datetime('now', '-14 days'))) THEN 1 ELSE 0 END) AS live
  FROM opportunities
`).get();

// Staleness watchdog: a source can rot silently (server outage, IP block) while
// every individual run still "succeeds" — Kenya PPIP went dark for 2.5 days with
// green CI before this existed. Flag any source whose newest last_seen is old.
const STALE_HOURS = 48;
const staleSources = db.prepare(`
  SELECT source, MAX(last_seen) AS latest FROM opportunities GROUP BY source
`).all()
  .map((r) => ({ source: r.source, hoursSince: (Date.now() - new Date(r.latest).getTime()) / 3600000 }))
  .filter((r) => r.hoursSince > STALE_HOURS)
  .map((r) => ({ source: r.source, days: Number((r.hoursSince / 24).toFixed(1)) }));

console.log(`\nRun complete: ${totalSeen} records processed, ${totalNew} new.`);
console.log(`Database: ${stats.total} opportunities | ${stats.ea} EA-relevant | ${stats.live} live on site.`);
for (const s of staleSources) console.log(`STALE: ${s.source} — no confirmed data for ${s.days} days`);

fs.writeFileSync(SUMMARY_PATH, JSON.stringify({
  ranAt: new Date().toISOString(),
  totalNew,
  totalSeen,
  perSource,
  staleSources,
  db: { total: stats.total, ea: stats.ea, live: stats.live },
}, null, 2));
