import assert from 'node:assert/strict';
import { mapGovUkEntry, parseGovUkFundingFeed } from '../src/sources/govuk_funding.js';
import { mapGrantOpportunity } from '../src/sources/grants_gov.js';
import { mapGppNotice, financialYears } from '../src/sources/uganda_gpp.js';
import { parseFeed, mapReliefWebJob, FEED_URL } from '../src/sources/reliefweb.js';

const today = '2026-09-27';

const individualCall = mapGovUkEntry({
  title: 'Individual Climate Research Fellowship',
  summary: 'Researchers in Uganda may apply by 30 September 2026.',
  updated: '2026-09-20T10:00:00Z',
  link: { '@_rel': 'alternate', '@_href': 'https://www.gov.uk/funding/climate-fellowship' },
}, today);
assert.equal(individualCall.type, 'fellowship');
assert.equal(individualCall.title, 'Individual Climate Research Fellowship');
assert.deepEqual(individualCall.countries, ['Uganda']);
assert.equal(individualCall.deadline, '2026-09-30');

const organizationCall = mapGovUkEntry({
  title: 'Community Health Innovation Grant',
  summary: 'Eligible NGOs and community groups across East Africa may apply by 15 October 2026.',
  updated: '2026-09-20T10:00:00Z',
  link: { '@_rel': 'alternate', '@_href': 'https://www.gov.uk/funding/community-health' },
}, today);
assert.equal(organizationCall.type, 'grant');
assert.deepEqual(organizationCall.countries, []);
assert.equal(organizationCall.ea_relevant, true);
assert.equal(mapGovUkEntry({
  title: 'Unrelated domestic programme',
  summary: 'For UK applicants only.',
  link: { '@_href': 'https://www.gov.uk/funding/domestic' },
}, today), null);

const feedXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Uganda Community Learning Grant</title>
    <summary>Eligible organizations in Uganda may apply by 30 September 2026.</summary>
    <updated>2026-09-20T10:00:00Z</updated>
    <link rel="alternate" href="https://www.gov.uk/funding/uganda-learning"/>
  </entry>
</feed>`;
assert.equal(parseGovUkFundingFeed(feedXml, today).length, 1);

const grantMatch = mapGrantOpportunity({
  id: 123456,
  title: 'Community Health Partnership Award',
  oppStatus: 'posted',
  openDate: '09/01/2026',
  closeDate: '10/15/2026',
  agency: 'Example Federal Agency',
}, {
  synopsis: {
    synopsisDesc: 'Funding supports public health partners in Uganda.',
    applicantEligibilityDesc: 'Nonprofits, universities and eligible individuals may apply.',
    applicantTypes: [{ description: 'Nonprofits' }, { description: 'Individuals' }],
    fundingInstruments: [{ description: 'Grant' }],
  },
}, { countries: ['Uganda'], terms: ['Uganda'] }, today);
assert.ok(grantMatch);
assert.equal(grantMatch.title, 'Community Health Partnership Award');
assert.match(grantMatch.summary, /Nonprofits, universities and eligible individuals may apply/);
assert.deepEqual(grantMatch.raw.applicantTypes, ['Nonprofits', 'Individuals']);
assert.deepEqual(grantMatch.countries, ['Uganda']);

const withoutDeadline = mapGrantOpportunity({
  id: 123457,
  title: 'Global Research Opportunity',
  oppStatus: 'posted',
  closeDate: '01/01/2099',
}, { synopsis: { synopsisDesc: 'Open to researchers worldwide.' } }, {
  countries: [], terms: ['Africa'],
}, today);
assert.ok(withoutDeadline);
assert.equal(withoutDeadline.deadline, null);
assert.equal(withoutDeadline.ea_relevant, true);

assert.equal(mapGrantOpportunity({ id: 123458, title: 'Expired Uganda Grant', oppStatus: 'posted', closeDate: '09/01/2026' }, null, { countries: ['Uganda'] }, today), null);
assert.equal(mapGrantOpportunity({ id: 123459, title: 'Draft Uganda Grant', oppStatus: 'forecasted', closeDate: '10/15/2026' }, null, { countries: ['Uganda'] }, today), null);

const gppNotice = mapGppNotice({
  id: 98439,
  title: 'Acquisition of an IT Service Management Tool',
  estimatedValue: 1010000000,
  entity_id: 478,
  procurement_type: 'Non-Consultancy Services',
  entity: 'Uganda Revenue Authority',
  sector: 'Accountability',
  deadline: '2026-10-21 00:00:00',
  financial_year: '2026-2027',
}, today);
assert.ok(gppNotice);
assert.equal(gppNotice.source, 'Uganda GPP (PPDA)');
assert.equal(gppNotice.type, 'tender');
assert.equal(gppNotice.deadline, '2026-10-21');
assert.equal(gppNotice.url, 'https://gpp.ppda.go.ug/public/bid-invitations/tender-notice/98439');
assert.equal(gppNotice.amount, 'UGX 1,010,000,000 (estimate)');
assert.match(gppNotice.summary, /Uganda Revenue Authority — Non-Consultancy Services tender/);
assert.deepEqual(gppNotice.countries, ['Uganda']);
assert.equal(gppNotice.ea_relevant, true);
assert.equal(mapGppNotice({ id: 1, title: 'Closed tender for road works', deadline: '2026-09-01 00:00:00' }, today), null);
assert.equal(mapGppNotice({ id: 2, title: 'Tender without a deadline' }, today), null);
assert.equal(mapGppNotice({ id: 3, title: 'Supply of chalk', deadline: '2026-10-01 00:00:00', estimatedValue: 0 }, today).amount, null);
assert.deepEqual(financialYears('2026-10-04'), ['2026-2027', '2025-2026']);
assert.deepEqual(financialYears('2026-03-15'), ['2025-2026', '2024-2025']);

// ReliefWeb RSS: descriptions are entity-escaped HTML; a long one must not trip the
// XML parser's entity-expansion limit.
const longBody = '&lt;p&gt;Scope &amp;amp; terms&lt;/p&gt;'.repeat(400);
const rwXml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel>
  <item>
    <title>National HLP Legal Associate</title>
    <link>https://reliefweb.int/job/4232398/national-hlp-legal-associate</link>
    <pubDate>Fri, 02 Oct 2026 12:43:15 +0000</pubDate>
    <description>&lt;div class="tag country"&gt;Country: South Sudan&lt;/div&gt;
      &lt;div class="tag source"&gt;Organization: CTG (Committed To Good)&lt;/div&gt;
      &lt;div class="date closing"&gt;Closing date: 11 Oct 2026&lt;/div&gt;
      &lt;p&gt;Overview of position&lt;/p&gt;${longBody}</description>
  </item>
  <item>
    <title>Closed consultancy</title>
    <link>https://reliefweb.int/job/1/closed</link>
    <description>&lt;div class="tag country"&gt;Country: Kenya&lt;/div&gt;&lt;div class="date closing"&gt;Closing date: 1 Sep 2026&lt;/div&gt;</description>
  </item>
</channel></rss>`;
const rwItems = parseFeed(rwXml);
assert.equal(rwItems.length, 2);
const rwJob = mapReliefWebJob(rwItems[0], today);
assert.equal(rwJob.title, 'National HLP Legal Associate');
assert.equal(rwJob.url, 'https://reliefweb.int/job/4232398/national-hlp-legal-associate');
assert.equal(rwJob.funder, 'CTG (Committed To Good)');
assert.equal(rwJob.deadline, '2026-10-11');
assert.deepEqual(rwJob.countries, ['South Sudan']);
assert.equal(rwJob.type, 'tender');
assert.equal(rwJob.ea_relevant, true);
assert.match(rwJob.summary, /^Overview of position Scope & terms/);
assert.doesNotMatch(rwJob.summary, /Closing date|Organization:/);
assert.equal(mapReliefWebJob(rwItems[1], today), null);
assert.match(FEED_URL, /^https:\/\/reliefweb\.int\/jobs\/rss\.xml\?advanced-search=\(TY264\)_\(C240\./);

console.log('Source adapter tests: GOV.UK feed, Grants.gov, Uganda GPP and ReliefWeb RSS mapping passed');
