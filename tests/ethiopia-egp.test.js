import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mapEgpLot, readableTitle, LIST_URL } from '../src/sources/ethiopia_egp.js';

const [tender, purchase, junk] = JSON.parse(fs.readFileSync(new URL('./fixtures/ethiopia-egp-lots.json', import.meta.url), 'utf8'));
const today = '2026-10-05';

const rec = mapEgpLot(tender, today);
assert.ok(rec, 'formal tender maps');
assert.equal(rec.source, 'Ethiopia e-GP (PPA)');
assert.equal(rec.title, 'Procurement of Building Renovation and Maintenance Work');
assert.equal(rec.deadline, '2026-10-13');
assert.equal(rec.published, '2026-08-04');
assert.equal(rec.type, 'tender');
assert.equal(rec.url, LIST_URL);
assert.deepEqual(rec.countries, ['Ethiopia']);
assert.equal(rec.ea_relevant, true);
assert.equal(rec.funder, 'Government of Ethiopia');
assert.match(rec.summary, /^Dire Dawa University — Works, national open tender\./);
assert.match(rec.summary, /Search e-GP for reference DDU-NCB-W-0109-2018-BID-Open\./);

// quotation purchases, implausible deadlines and closed lots are dropped
assert.equal(mapEgpLot(purchase, today), null);
assert.equal(mapEgpLot(junk, today), null);
assert.equal(mapEgpLot({ ...tender, submissionDeadline: '2026-10-01T06:00:00Z' }, today), null);
// Ethiopian-calendar style invitation dates are not trusted as "published"
assert.equal(mapEgpLot({ ...tender, invitationDate: '2007-03-03T05:30:00Z' }, today).published, null);

assert.equal(readableTitle('Water pump ግዥ'), 'Water pump ግዥ');
assert.equal(readableTitle('የተለያዩ መድሃኒቶች'), null);
assert.equal(readableTitle(' Procurement Of Lights '), 'Procurement Of Lights');

console.log('ethiopia-egp tests passed');
