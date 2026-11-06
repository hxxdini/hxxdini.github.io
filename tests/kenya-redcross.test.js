import assert from 'node:assert/strict';
import { parseKenyaRedCross } from '../src/sources/kenya_redcross.js';

// Matches the live Elementor layout: h2/h3 title, "Posted: … Closing: …" text,
// and a SharePoint PDF link, in no fixed sibling order.
const card = (title, posted, closing, pdfSlug) => `
<h2 class="elementor-heading-title"> ${title} </h2>
<div class="elementor-widget-container"><p>Posted: ${posted}</p></div>
<div class="elementor-widget-container"><p>Closing: ${closing}</p></div>
<div class="elementor-widget-container"><a href="https://kenyaredcross-my.sharepoint.com/:b:/g/personal/tenders_redcross_or_ke/${pdfSlug}?e=abc" target="_blank">Download</a></div>
`;

const html = `<html><body>
${card('Request For Proposals To Conduct An End-Term Evaluation', '03/11/2026', '24/11/2026', 'IQ_OPEN_1')}
${card('REQUEST FOR PROPOSAL FOR PROVISION OF GROUP LIFE INSURANCE', '27/10/2026', '10/11/2026', 'IQ_OPEN_2')}
${card('CIVIL WORKS FOR REHABILITATION OF GANGEISA BOREHOLE', '20/08/2026', '02/09/2026', 'IQ_EXPIRED')}
<h2>Not a tender (no PDF, no closing)</h2>
<p>Random newsroom heading.</p>
</body></html>`;

const rows = parseKenyaRedCross(html, '2026-11-06');
assert.equal(rows.length, 2, `expected 2 open tenders, got ${rows.length}`);

const first = rows.find(r => r.url.includes('IQ_OPEN_1'));
assert.ok(first, 'first open tender missing');
assert.equal(first.deadline, '2026-11-24');
assert.equal(first.published_at, '2026-11-03');
assert.equal(first.source, 'Kenya Red Cross Society');
assert.equal(first.funder, 'Kenya Red Cross Society');
assert.equal(first.type, 'consultancy'); // RFP/End-Term Evaluation
assert.deepEqual(first.countries, ['Kenya']);
assert.ok(first.url.startsWith('https://kenyaredcross-my.sharepoint.com/'), `url: ${first.url}`);
assert.ok(first.id && first.id.length > 0, 'id must be set');

const second = rows.find(r => r.url.includes('IQ_OPEN_2'));
assert.equal(second.type, 'consultancy'); // "Request for Proposal"
assert.equal(second.deadline, '2026-11-10');

// Civil works: not "RFP/consultancy" wording
const works = parseKenyaRedCross(
  card('CIVIL WORKS FOR BOREHOLE REHABILITATION', '01/10/2026', '30/11/2026', 'IQ_WORKS'),
  '2026-11-06'
);
assert.equal(works.length, 1);
assert.equal(works[0].type, 'tender');

// Dedup on PDF URL
const dupe = parseKenyaRedCross(
  card('A', '01/10/2026', '30/11/2026', 'IQ_SAME') + card('A again', '02/10/2026', '30/11/2026', 'IQ_SAME'),
  '2026-11-06'
);
assert.equal(dupe.length, 1, 'duplicate PDF URLs should collapse');

// Expired filter
const past = parseKenyaRedCross(card('Old', '01/01/2026', '02/09/2026', 'IQ_X'), '2026-11-06');
assert.equal(past.length, 0);

// Layout-break guard
assert.throws(() => parseKenyaRedCross('<html></html>'), /no tender list/);

console.log('kenya-redcross tests passed');
