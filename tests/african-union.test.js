import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAuBids, countryFromBidNumber, hasNextPage } from '../src/sources/african_union.js';

// Bid-number ISO prefix → canonical EA country; anything else drops.
assert.deepEqual(countryFromBidNumber('ET-AUC-569896-CS-QCBS'), ['Ethiopia']);
assert.deepEqual(countryFromBidNumber('KE-AUC-1-GO-RFQ'), ['Kenya']);
assert.deepEqual(countryFromBidNumber('CD-AUC-1'), ['DR Congo']);
assert.deepEqual(countryFromBidNumber('ZA-AUC-1'), []);
assert.deepEqual(countryFromBidNumber('AUC/PRC/2026/01'), []);
assert.deepEqual(countryFromBidNumber(''), []);

// Fixture: live au.int/en/bids table captured 2026-11-21 (2 open bids).
const html = fs.readFileSync(new URL('./fixtures/african-union-bids.html', import.meta.url), 'utf8');
const rows = parseAuBids(html);
assert.equal(rows.length, 2);
assert.equal(rows[0].bidNumber, 'ET-AUC-569896-CS-QCBS');
assert.equal(rows[0].published_at, '2026-11-19');
assert.equal(rows[0].deadline, '2026-12-03');
assert.equal(rows[0].bidType, 'Procurement/ Bids');
assert.match(rows[0].url, /^https:\/\/au\.int\/en\/bids\/20261119\//);
assert.match(rows[0].title, /^Consultancy Service to Assess the Economic Implications/);
assert.equal(rows[1].deadline, '2026-12-02');
assert.equal(rows[1].bidNumber, 'ET-AUC-579035-CS-CQS');
assert.equal(hasNextPage(html), false);

// A row with a single date has no trustworthy deadline.
const single = `<table><tr><td class="views-field views-field-field-date"><time datetime="2026-11-19T07:00:00Z">x</time></td>
<td class="views-field views-field-title"><a href="/en/bids/20261119/foo">Foo</a></td>
<td class="views-field views-field-field-text-bidnumber">ET-AUC-1</td></tr></table>`;
assert.equal(parseAuBids(single)[0].deadline, null);

console.log('african union tests passed');
