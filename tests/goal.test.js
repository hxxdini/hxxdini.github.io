import assert from 'node:assert/strict';
import { parseGoalDeadline, parseGoalTenders } from '../src/sources/goal.js';

// parseGoalDeadline: GOAL's accordion body is Word-pasted prose like "Closing
// date and time for receipt of tenders: 29th November 2026 at 17:00 EAT".
// "Closing date for clarifications" is ignored in favor of the receipt line,
// because clarifications close earlier than the tender itself.
assert.equal(
  parseGoalDeadline('Closing date for clarifications: 20th November 2026\nClosing date and time for receipt of tenders: 29th November 2026 at 17:00 EAT', '2026-11-08'),
  '2026-11-29',
);
assert.equal(
  parseGoalDeadline('Closing date and time for receipt of offers: 23rd November 2026', '2026-11-08'),
  '2026-11-23',
);
// Falls back to the clarifications line only when the receipt line is missing.
assert.equal(
  parseGoalDeadline('Closing date for clarifications: 20th December 2026', '2026-11-08'),
  '2026-12-20',
);
// Expired dates are dropped so stale accordion items don't resurface.
assert.equal(
  parseGoalDeadline('Closing date and time for receipt of tenders: 1st October 2024', '2026-11-08'),
  null,
);
assert.equal(parseGoalDeadline(null, '2026-11-08'), null);
assert.equal(parseGoalDeadline('nothing here', '2026-11-08'), null);

// parseGoalTenders: real GOAL layout is a series of <h3 class="fl-heading">
// country labels followed by Beaver Builder accordion items. The country for
// each tender is its nearest preceding "GOAL <Country>" heading. Items under
// non-East-Africa headings (Ireland, Niger, Sierra Leone, Zimbabwe, Syria)
// are dropped.
const body = (dateLine) => `
  <div class="fl-accordion-content fl-clearfix">
    <p><strong>Process:</strong> Invitation to Tender (ITT)</p>
    <p><strong>Reference:</strong> KLA-BS-54074</p>
    <p><strong>Proposed Timelines:</strong></p>
    <ol>
      <li><strong>ITT Publication:</strong> 5th November 2026</li>
      <li><strong>Closing date for clarifications:</strong> 20th November 2026</li>
      <li><strong>${dateLine}</strong></li>
    </ol>
  </div>
`;
const item = (title, closeLine) => `<div class="fl-accordion-item">
  <div class="fl-accordion-button">
    <a class="fl-accordion-button-label">${title}</a>
  </div>
  ${body(closeLine)}
</div></div></div>`;

const html = [
  '<h3 class="fl-heading"><span class="fl-heading-text">GOAL Ireland</span></h3>',
  item('Office Cleaning Services, Dublin (DUB-ADD-54724)', 'Closing date and time for receipt of offers: 23rd November 2026'),
  '<h3 class="fl-heading"><span class="fl-heading-text">GOAL Uganda</span></h3>',
  item('GOAL Uganda: Invitation to Tender (ITT) for Group Life insurance Ref: KLA-BS-54074', 'Closing date and time for receipt of tenders: 29th November 2026 at 17:00 EAT'),
  item('GOAL Uganda: Borehole works Ref: MBL-UN7-54947', 'Closing date and time for receipt of tenders: 15th January 2024'),
  '<h3 class="fl-heading"><span class="fl-heading-text">GOAL Niger</span></h3>',
  item("GOAL Niger: Cost of Diet Assessment REF: ZIN-M26-55370", 'Closing date and time for receipt of offers: 28th November 2026'),
].join('');

const rows = parseGoalTenders(html, '2026-11-08');
// Kept: one Uganda row with a future deadline. Dropped: Dublin (Ireland head),
// Uganda row with an expired deadline, Niger (not East Africa).
assert.equal(rows.length, 1);
const r = rows[0];
assert.equal(r.type, 'tender');
assert.equal(r.deadline, '2026-11-29');
assert.deepEqual(r.countries, ['Uganda']);
assert.equal(r.source, 'GOAL Global');
assert.ok(r.title.includes('KLA-BS-54074'));
assert.equal(r.raw.country_office, 'Uganda');
assert.equal(r.raw.ref, 'KLA-BS-54074');
assert.equal(r.url, 'https://www.goalglobal.org/tenders/');

assert.throws(() => parseGoalTenders('<html></html>'), /no accordion items/);

console.log('goal tests passed');
