import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsrf, parseEgpRows } from '../src/sources/uganda_egp.js';

// 2026-11-21: egpuganda.go.ug moved its bid tables to a DataTables AJAX POST.
const landing = readFileSync(new URL('./fixtures/uganda-egp-landing.html', import.meta.url), 'utf8');
assert.equal(parseCsrf(landing), 'TESTTOKEN123');
assert.equal(parseCsrf('<table id="current_bid_notices"><tbody></tbody></table>'), null);

const json = JSON.parse(readFileSync(new URL('./fixtures/uganda-egp-ajax.json', import.meta.url), 'utf8'));
const rows = parseEgpRows(json, '2026-11-22');
// 4 rows: 2 open, 1 expired, 1 duplicate of the first.
assert.equal(rows.length, 2);
assert.deepEqual(rows[0], {
  noticeId: '427579196',
  subject: 'FEASIBILITY STUDY AND ENGINEERING DESIGNS FOR THE UPGRADE AND EXPANSION OF ARUA AIRPORT',
  url: 'https://egpuganda.go.ug/index/427579196_egp',
  title: 'FEASIBILITY STUDY AND ENGINEERING DESIGNS FOR THE UPGRADE AND EXPANSION OF ARUA AIRPORT',
  entity: 'Uganda Civil Aviation Authority',
  ref: 'UCAA/WRKS/2025-2026/00035',
  type: 'Works',
  deadline: '2026-12-04',
  published: '2026-11-20',
});
assert.equal(rows[1].title, 'Procurement of Mechanized Road Sweepers'); // double space collapsed
assert.equal(rows[1].entity, 'Kampala Capital City Authority');

// Truncated subject: kept with title null so the fetcher expands it from the notice page.
const trunc = parseEgpRows({ data: [{ ...json.data[0], subject_procurement: 'SUPPLY OF DESKS FOR...' }] }, '2026-11-22');
assert.equal(trunc[0].title, null);
assert.equal(trunc[0].subject, 'SUPPLY OF DESKS FOR...');

// Shape change must throw, not return a quiet 0.
assert.throws(() => parseEgpRows({ error: 'CSRF token mismatch' }), /no data array/);
assert.deepEqual(parseEgpRows({ data: [] }), []);

console.log('uganda-egp ajax tests passed');
