import { fetchRetry } from '../http.js';
import { EA_COUNTRIES, enrich, makeId, stripHtml } from '../normalize.js';

const SEARCH_URL = 'https://api.grants.gov/v1/api/search2';
const DETAIL_URL = 'https://api.grants.gov/v1/api/fetchOpportunity';
const SOURCE = 'Grants.gov';
const MAX_ROWS = 100;
const MAX_DETAILS = 40;
const MAX_AGE_WITHOUT_DEADLINE_DAYS = 90;

const SEARCH_TERMS = [
  ...EA_COUNTRIES
    .filter((country) => country !== 'Congo, Democratic Republic of')
    .map((country) => ({ keyword: `"${country}"`, country })),
  { keyword: '"Democratic Republic of the Congo"', country: 'Congo, Democratic Republic of' },
  { keyword: '"East Africa"', region: 'East Africa' },
  { keyword: '"Eastern Africa"', region: 'Eastern Africa' },
  { keyword: '"Sub-Saharan Africa"', region: 'Sub-Saharan Africa' },
  { keyword: 'Africa', region: 'Africa' },
];

function toIsoDate(value) {
  if (!value) return null;
  const usDate = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    const date = new Date(Date.UTC(Number(usDate[3]), Number(usDate[1]) - 1, Number(usDate[2])));
    if (date.getUTCMonth() !== Number(usDate[1]) - 1 || date.getUTCDate() !== Number(usDate[2])) return null;
    return date.toISOString().slice(0, 10);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function applicantNames(value) {
  if (!Array.isArray(value)) return [];
  return value.map((applicant) => typeof applicant === 'string' ? applicant : applicant?.description).filter(Boolean);
}

function sourceKeywordSummary(matches) {
  const terms = [...new Set(matches.terms ?? [])];
  return terms.length
    ? `Grants.gov full-text match: ${terms.join(', ')}. Confirm geography and applicant eligibility in the official notice and attachments.`
    : 'Confirm geography and applicant eligibility in the official notice and attachments.';
}

export function mapGrantOpportunity(hit, detail, matches, today = new Date().toISOString().slice(0, 10)) {
  if (!hit?.id || String(hit.oppStatus ?? '').toLowerCase() !== 'posted') return null;

  const synopsis = detail?.synopsis ?? {};
  const closeDate = toIsoDate(hit.closeDate) ?? toIsoDate(synopsis.responseDate);
  const deadline = closeDate?.startsWith('2099-') ? null : closeDate;
  if (deadline && deadline < today) return null;

  const openDate = toIsoDate(hit.openDate) ?? toIsoDate(synopsis.postingDate);
  if (!deadline && openDate) {
    const oldestAllowed = new Date(`${today}T00:00:00Z`).getTime() - MAX_AGE_WITHOUT_DEADLINE_DAYS * 86400000;
    if (new Date(`${openDate}T00:00:00Z`).getTime() < oldestAllowed) return null;
  }

  const title = stripHtml(String(hit.title ?? detail?.opportunityTitle ?? '')).slice(0, 300);
  if (!title) return null;

  const description = stripHtml(String(synopsis.synopsisDesc ?? '')).slice(0, 1100);
  const applicantEligibility = stripHtml(String(synopsis.applicantEligibilityDesc ?? '')).slice(0, 450);
  const applicants = applicantNames(synopsis.applicantTypes);
  const matchNote = sourceKeywordSummary(matches);
  const summary = [
    description,
    applicantEligibility ? `Eligibility notes: ${applicantEligibility}` : null,
    applicants.length ? `Listed applicant types: ${applicants.join('; ')}` : null,
    matchNote,
  ].filter(Boolean).join(' ').slice(0, 2200);
  const matchedCountries = [...new Set(matches.countries ?? [])];
  const countryText = `${title} ${description} ${matchNote}`;
  const countries = [...new Set([...matchedCountries, ...EA_COUNTRIES.filter((country) => countryText.toLowerCase().includes(country.toLowerCase()))])];
  const amount = synopsis.estimatedFundingFormatted ?? synopsis.awardCeilingFormatted ?? null;
  const publishedAt = openDate ? `${openDate}T00:00:00.000Z` : null;
  const id = String(hit.id);

  return enrich({
    id: makeId(SOURCE, id),
    source: SOURCE,
    funder: hit.agency ?? synopsis.agencyName ?? null,
    title,
    url: `https://www.grants.gov/search-results-detail/${encodeURIComponent(id)}`,
    summary,
    type: 'grant',
    deadline,
    countries,
    amount,
    published_at: publishedAt,
    raw: {
      opportunityId: id,
      opportunityNumber: hit.number ?? detail?.opportunityNumber ?? null,
      status: hit.oppStatus,
      matchedTerms: [...new Set(matches.terms ?? [])],
      applicantTypes: applicants,
      fundingInstruments: synopsis.fundingInstruments ?? [],
    },
  });
}

async function postJson(url, payload) {
  const response = await fetchRetry(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, { retries: 2, backoffMs: 1000, timeoutMs: 30000 });
  if (!response.ok) throw new Error(`Grants.gov API HTTP ${response.status}`);
  const result = await response.json();
  if (result.errorcode && Number(result.errorcode) !== 0) throw new Error(`Grants.gov API: ${result.msg ?? result.errorcode}`);
  return result.data ?? {};
}

function titleMatchesTerm(title, term) {
  if (term.country) {
    if (term.country === 'Congo, Democratic Republic of') return /\b(?:democratic republic of (?:the )?congo|dr congo|drc)\b/i.test(title);
    return new RegExp(`\\b${term.country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title);
  }
  if (term.region === 'Africa') return /\bafrica\b/i.test(title);
  const escaped = term.region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(title);
}

function allowCandidateBySearchResult(hit, term, totalHits) {
  if (titleMatchesTerm(String(hit.title ?? ''), term)) return true;
  return Number(totalHits) <= 15;
}

export async function fetchGrantsGov() {
  const candidates = new Map();
  let completedSearches = 0;

  for (const term of SEARCH_TERMS) {
    try {
      const result = await postJson(SEARCH_URL, {
        rows: MAX_ROWS,
        startRecordNum: 0,
        keyword: term.keyword,
        oppStatuses: 'posted',
      });
      completedSearches += 1;
      const totalHits = Number(result.hitCount ?? 0);

      for (const hit of result.oppHits ?? []) {
        if (String(hit.oppStatus ?? '').toLowerCase() !== 'posted' || !allowCandidateBySearchResult(hit, term, totalHits)) continue;
        const id = String(hit.id ?? '');
        if (!id) continue;
        const candidate = candidates.get(id) ?? { hit, countries: new Set(), regions: new Set(), terms: new Set() };
        if (term.country) candidate.countries.add(term.country);
        if (term.region) candidate.regions.add(term.region);
        candidate.terms.add(term.keyword.replaceAll('"', ''));
        candidates.set(id, candidate);
      }
    } catch (error) {
      console.error(`  ! Grants.gov search failed (${term.keyword}): ${error.message}`);
    }
  }

  if (!completedSearches) throw new Error('All Grants.gov search queries failed');

  const records = [];
  for (const candidate of [...candidates.values()].slice(0, MAX_DETAILS)) {
    try {
      const detailResult = await postJson(DETAIL_URL, { opportunityId: Number(candidate.hit.id) });
      const matches = {
        countries: [...candidate.countries],
        regions: [...candidate.regions],
        terms: [...candidate.terms],
      };
      const record = mapGrantOpportunity(candidate.hit, detailResult, matches);
      if (record) records.push(record);
    } catch (error) {
      console.error(`  ! Grants.gov detail failed (${candidate.hit.id}): ${error.message}`);
      const record = mapGrantOpportunity(candidate.hit, null, {
        countries: [...candidate.countries],
        regions: [...candidate.regions],
        terms: [...candidate.terms],
      });
      if (record) records.push(record);
    }
  }

  return records;
}
