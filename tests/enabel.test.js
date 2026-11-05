import assert from 'node:assert/strict';
import { parseEnabelDate, parseEnabelItem } from '../src/sources/enabel.js';

// parseEnabelDate: Enabel item pages show closing dates as "23 November 2026 12:00"
// or "7 November 2026"; both normalize to ISO yyyy-mm-dd.
assert.equal(parseEnabelDate('23 November 2026 12:00'), '2026-11-23');
assert.equal(parseEnabelDate('7 November 2026'), '2026-11-07');
assert.equal(parseEnabelDate('whatever'), null);
assert.equal(parseEnabelDate(null), null);

// parseEnabelItem: the item page is Enabel's authoritative source for country,
// deadline and open/closed status. We match on the plain-text block "Country :
// X ... Closing date : ... Status : Open". Everything else on the page
// (newsletter form, country list in the nav, SEO schema) is ignored.
const uganda = `
<h1>Some tender in Uganda</h1>
<p><strong>Country : </strong> Uganda</p>
<p class=""><strong>Closing date : </strong> 15 December 2026 12:00 </p>
<div>
  <p> <strong>Status :</strong> Open </p>
  <p><strong>Applicable legislation : </strong>Belge</p>
</div>`;
const u = parseEnabelItem(uganda);
assert.equal(u.country, 'Uganda');
assert.equal(u.deadline, '2026-12-15');
assert.equal(u.status, 'Open');

const burkina = `
<p><strong>Country : </strong> Burkina Faso</p>
<p><strong>Closing date : </strong> 23 November 2026 12:00 </p>
<p> <strong>Status :</strong> Open </p>`;
const b = parseEnabelItem(burkina);
assert.equal(b.country, 'Burkina Faso');
assert.equal(b.deadline, '2026-11-23');
assert.equal(b.status, 'Open');

// A page without the expected fields should return nulls rather than throwing;
// the fetcher filters them out, so one weirdly-templated item doesn't break
// the whole run.
const empty = parseEnabelItem('<html><body>nothing structured here</body></html>');
assert.equal(empty.country, null);
assert.equal(empty.deadline, null);
assert.equal(empty.status, null);

console.log('enabel tests passed');
