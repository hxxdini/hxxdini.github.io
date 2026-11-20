import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nestDate, parseNestPage, buildRequest, LIST_URL } from '../src/sources/tanzania_nest.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/tanzania-nest.json'), 'utf8'));

assert.equal(nestDate('2026-11-27T14:00'), '2026-11-27');
assert.equal(nestDate(null), null);
assert.equal(nestDate('27 Nov 2026'), null);

const req = JSON.parse(buildRequest(2));
assert.equal(req.variables.input.page, 2);
assert.deepEqual(req.variables.input.mustHaveFilters[0].inValues, ['PUBLISHED']);

// Fixture: 3 live rows (framework goods, works tender, planned tender) +
// one expired, one with no deadline, one non-PUBLISHED. Only the 3 survive.
const { records, hasNext, totalRecords } = parseNestPage(fixture, '2026-11-20');
assert.equal(hasNext, true);
assert.equal(totalRecords, 254);
assert.equal(records.length, 3);
for (const r of records) {
  assert.deepEqual(r.countries, ['Tanzania']);
  assert.equal(r.type, 'tender');
  assert.equal(r.url, LIST_URL);
  assert.match(r.deadline, /^2026-11-2\d$/);
  assert.equal(r.ea_relevant, true);
}
assert.equal(records[0].deadline, '2026-11-27');
assert.equal(records[0].funder, 'Tanzania Broadcasting Corporation');
assert.match(records[0].summary, /FA\/2026\/2027\/286\/TR61\/G\/02/);
assert.ok(!records.some((r) => /Expired|No deadline/.test(r.title)));
// Ids are unique even though all records share the list URL.
assert.equal(new Set(records.map((r) => r.id)).size, 3);

// Same day as the deadline still counts as open; a day later it doesn't.
assert.equal(parseNestPage(fixture, '2026-11-27').records.length, 3);
assert.equal(parseNestPage(fixture, '2026-11-28').records.length, 0);

// GraphQL error payloads throw so the pipeline marks the source failed.
assert.throws(() => parseNestPage({ errors: [{ message: 'boom' }] }, '2026-11-20'), /boom/);

console.log('tanzania-nest tests passed');
