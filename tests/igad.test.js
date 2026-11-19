import assert from 'node:assert/strict';
import { parseIgadDate, parseIgadItem, parseIgadLocation } from '../src/sources/igad.js';

// parseIgadDate: IGAD item pages render deadlines as "November 30, 2026".
assert.equal(parseIgadDate('November 30, 2026'), '2026-11-30');
assert.equal(parseIgadDate('December 9, 2026'), '2026-12-09');
assert.equal(parseIgadDate('   May 1, 2027  '), '2027-05-01');
assert.equal(parseIgadDate('nope'), null);
assert.equal(parseIgadDate(null), null);

// parseIgadLocation: splits on commas, "and", "&"; non-EA pieces (Djibouti,
// Eritrea, Sudan) drop out because they aren't canonical EA countries.
assert.deepEqual(parseIgadLocation('Kenya'), ['Kenya']);
assert.deepEqual(parseIgadLocation('Djibouti, Ethiopia and Sudan'), ['Ethiopia']);
assert.deepEqual(parseIgadLocation('Djibouti, Ethiopia, Somalia and South Sudan'), ['Ethiopia', 'Somalia', 'South Sudan']);
assert.deepEqual(parseIgadLocation('Sudan, South Sudan and Djibouti'), ['South Sudan']);
assert.deepEqual(parseIgadLocation('Djibouti'), []); // not in canonical EA set
assert.deepEqual(parseIgadLocation(''), []);
assert.deepEqual(parseIgadLocation(null), []);

// parseIgadItem: primary signal is the WP Job Manager application-deadline
// list item on the detail page; fallback is a "Deadline: Month D, YYYY" line
// in the body.
const primary = `<ul class="meta">
<li class="date"><time datetime="2026-11-12">Posted on November 12, 2026</time></li>
<li class="application-deadline  "><label>Closes:</label> November 30, 2026</li>
</ul>`;
assert.equal(parseIgadItem(primary).deadline, '2026-11-30');

const fallback = `<div class="job_description"><p>Scope...</p><p>Deadline: December 15, 2026</p></div>`;
assert.equal(parseIgadItem(fallback).deadline, '2026-12-15');

const missing = `<div>no deadline here</div>`;
assert.equal(parseIgadItem(missing).deadline, null);

console.log('igad tests passed');
