import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWhhTenders, parseWhhDeadline, parseWhhCountry } from '../src/sources/welthungerhilfe.js';

// Deadline: date only (the page's time part is unreliable).
assert.equal(parseWhhDeadline('Response Deadline (CET): ­13.12.2026 11:12'), '2026-12-13');
assert.equal(parseWhhDeadline('Response Deadline (CET): 9.1.2027 04:01'), '2027-01-09');
assert.equal(parseWhhDeadline('Response Deadline (CET): '), null);
assert.equal(parseWhhDeadline('31.13.2026'), null);

// Country office comes from the contracting-authority field only.
assert.equal(parseWhhCountry('Contracting Authority: Welthungerhilfe Uganda'), 'Uganda');
assert.equal(parseWhhCountry('Contracting Authority: Welthungerhilfe, Pakistan'), 'Pakistan');
assert.equal(parseWhhCountry('Contracting Authority:'), null);

// Fixture: live page 2026-11-26, 15 calls (Ethiopia 2, Uganda 2, 4 with an
// empty authority, rest Haiti/Burkina Faso/Lebanon/Mali/Pakistan).
const html = readFileSync(new URL('./fixtures/welthungerhilfe-tenders.html', import.meta.url), 'utf8');
const recs = parseWhhTenders(html, '2026-11-26');
assert.equal(recs.length, 4);
assert.deepEqual(recs.map((r) => r.countries[0]).sort(), ['Ethiopia', 'Ethiopia', 'Uganda', 'Uganda']);
for (const r of recs) {
  assert.equal(r.type, 'tender');
  assert.equal(r.source, 'Welthungerhilfe');
  assert.match(r.url, /^https:\/\/eu\.eu-supply\.com\/.*PID=\d+/);
  assert.ok(!r.url.includes('&amp;'));
  assert.match(r.deadline, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.countries.length, 1);
}
const borehole = recs.find((r) => /Boreholes/.test(r.title));
assert.equal(borehole.deadline, '2026-12-08');
assert.equal(borehole.funder, 'Welthungerhilfe Uganda');

// Expired calls are dropped.
assert.equal(parseWhhTenders(html, '2026-12-01').length, 3);
// Missing container = layout change, not a silent zero.
assert.throws(() => parseWhhTenders('<html></html>'), /layout changed/);
// Empty list container is a clean zero.
assert.deepEqual(parseWhhTenders('<div class="tender__list"></div>'), []);

console.log('welthungerhilfe tests passed');
