import assert from 'node:assert/strict';
import { parsePost, isCallPost, www2Link, postLinks, titleMatches } from '../src/sources/fundsforngos_verify.js';

// Shape of a www2 full article (trimmed from a real post).
const article = `
<p>The Uganda Communications Commission (UCC), through UCUSAF, invites eligible organisations to submit proposals to implement the Youth ICT and Multimedia Skilling Programme.</p>
<p><strong>Deadline:</strong> October 12, 2026</p>
<h2>Opportunity at a Glance</h2>
<ul>
<li><strong>Provider:</strong> Uganda Communications Commission (UCC)</li>
<li><strong>Programme name:</strong> Youth ICT Skilling Programme 2026/2027</li>
<li><strong>Total grant amount / amount per award:</strong> Not specified in the source</li>
<li><strong>Grant size:</strong> Up to UGX 200,000,000 (amount per award, as stated in the call)</li>
<li><strong>Eligible locations:</strong> Obongi, Agago, Alebtong</li>
</ul>
<p>Read the <a href="https://www.ucc.co.ug/wp-content/uploads/2026/09/CALL.pdf?utm_source=chatgpt.com">UCC Call for Proposals</a> and apply via <a href="https://www.ucc.co.ug/apply/">the UCC portal</a>.</p>
<p>Tags: <a href="https://www2.fundsforngos.org/tag/uganda/">Uganda</a> <a href="https://www.facebook.com/sharer.php?u=x">Share</a></p>
<p>The post <a href="https://www2.fundsforngos.org/x/">X</a> first appeared on fundsforNGOs.</p>`;

const found = parsePost(article);
assert.equal(found.deadline, '2026-10-12');
assert.equal(found.status, 'deadline');
assert.equal(found.funder, 'Uganda Communications Commission (UCC)');
assert.equal(found.amount, 'Up to UGX 200,000,000', 'skips "Not specified" and the programme name with a year');
assert.equal(found.officialUrl, 'https://www.ucc.co.ug/apply/');
assert.deepEqual(found.documents.map((d) => d.url), ['https://www.ucc.co.ug/wp-content/uploads/2026/09/CALL.pdf'], 'utm params stripped');
assert.deepEqual(found.countries, ['Uganda']);
assert.match(found.summary, /^The Uganda Communications Commission/);

// Rolling and unspecified deadlines don't invent a date.
const rolling = parsePost('<p><strong>Deadline:</strong> Rolling basis (no fixed closing date specified in the source)</p>');
assert.equal(rolling.deadline, null);
assert.equal(rolling.status, 'rolling');
const unknown = parsePost('<p><strong>Application deadline:</strong> Not specified in the source text</p>');
assert.equal(unknown.deadline, null);
assert.equal(unknown.status, 'no-deadline');

// Labelled variants and a time suffix.
assert.equal(parsePost('<li>Application Deadline: 31 October 2026 (time zone not specified)</li>').deadline, '2026-10-31');
assert.equal(parsePost('<li><b>Deadline</b>: 16-Oct-2026</li>').deadline, '2026-10-16');
assert.equal(parsePost('<li>Funding organization: Latrobe City Council</li>').funder, 'Latrobe City Council');

// Teaser on www links to the full article on www2 (not to tag/category pages).
assert.equal(www2Link('<a href="https://www2.fundsforngos.org/tag/impact/">t</a><a href="https://www2.fundsforngos.org/community-development-2/grant-x/">full</a>'),
  'https://www2.fundsforngos.org/community-development-2/grant-x/');
assert.equal(www2Link('<a href="https://www2.fundsforngos.org/tag/impact/">t</a>'), null);

// Only calls are kept; sample proposals, guides and newsletters are not opportunities.
assert.equal(isCallPost('https://www.fundsforngos.org/how-to-apply/grant-x/'), true);
assert.equal(isCallPost('https://www2.fundsforngos.org/community-development-2/grant-x/'), true);
assert.equal(isCallPost('https://www.fundsforngos.org/all-proposals/a-sample-grant-proposals-on-x/'), false);
assert.equal(isCallPost('https://www.fundsforngos.org/newsletter/30-fresh-global-grants/'), false);
assert.equal(isCallPost('https://www.fundsforngos.org/how-to-write-a-proposal/x/'), false);

assert.equal(postLinks('<a href="https://twitter.com/x">t</a><a href="mailto:a@b.c">m</a>').length, 0);

// Web Radar headlines match their post by exact title (Google News adds " - fundsforNGOs").
assert.equal(titleMatches('Call for Proposals: Uganda – TREES 4 KARAMOJA (T4K) Initiative - fundsforNGOs',
  'Call for Proposals: Uganda &#8211; TREES 4 KARAMOJA (T4K) Initiative'), true);
assert.equal(titleMatches('Open Call for Women’s Climate Action Grants (Uganda) - fundsforNGOs',
  'Funding Empowerment: Grants Opportunities for Women'), false, 'fuzzy search hits are rejected');
assert.equal(titleMatches('Call for Proposals: Forest Restoration and Community Conservation in Eastern... - fundsforNGOs',
  'Call for Proposals: Forest Restoration and Community Conservation in Eastern Uganda and Karamoja'), true, 'cut headline matches by prefix');
assert.equal(titleMatches('Call for... - fundsforNGOs', 'Call for Proposals: Anything'), false, 'too short a prefix to trust');

console.log('fundsforNGOs verification tests passed');
