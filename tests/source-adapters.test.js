import assert from 'node:assert/strict';
import { mapGovUkEntry, parseGovUkFundingFeed } from '../src/sources/govuk_funding.js';
import { mapGrantOpportunity } from '../src/sources/grants_gov.js';

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

console.log('Source adapter tests: GOV.UK feed and Grants.gov mapping passed');
