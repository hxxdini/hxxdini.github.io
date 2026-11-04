import { XMLParser } from 'fast-xml-parser';
import { fetchRetry } from '../http.js';
import { detectCountries, enrich, extractDeadline, makeId, stripHtml } from '../normalize.js';

const FEED_URL = 'https://www.gov.uk/international-development-funding.atom';
const SOURCE = 'UK International Development Funding Finder';
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
const TARGET_SCOPE = /\b(?:east(?:ern)? africa|sub[-\s]?saharan africa|africa[-\s-]?wide|across africa|throughout africa|african countries|worldwide|global(?:ly)?|international applicants)\b/i;
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value?.['#text'] == null ? '' : String(value['#text']);
}

function parsedIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function deadlineFromText(text, updatedAt) {
  const explicit = extractDeadline(text);
  if (explicit) return explicit;

  const match = text.match(/\b(?:by|deadline(?:\s+date)?|due(?:\s+date)?|closing(?:\s+date)?|apply\s+by)\s+(?:(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})|([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?)(?:,?\s+(\d{4}))?\b/i);
  if (!match) return null;

  const day = Number(match[1] ?? match[4]);
  const monthName = (match[2] ?? match[3]).slice(0, 3).toLowerCase();
  const month = MONTHS[monthName];
  const updatedDate = updatedAt ? new Date(updatedAt) : new Date();
  let year = Number(match[5] ?? updatedDate.getUTCFullYear());
  if (month == null || day < 1 || day > 31) return null;

  if (!match[5]) {
    const candidate = new Date(Date.UTC(year, month, day));
    const updatedDay = new Date(Date.UTC(updatedDate.getUTCFullYear(), updatedDate.getUTCMonth(), updatedDate.getUTCDate()));
    if (candidate.getTime() < updatedDay.getTime() - 180 * 86400000) year += 1;
  }

  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function inferredType(text) {
  if (/tender|request for proposals|\brfp\b|procurement/.test(text)) return 'tender';
  if (/fellowship|scholarship/.test(text)) return 'fellowship';
  if (/\baward\b|\bprize\b|competition|challenge/.test(text)) return 'prize';
  return 'grant';
}

function hasTargetScope(text) {
  return detectCountries(text).length > 0 || TARGET_SCOPE.test(text);
}

export function mapGovUkEntry(entry, today = new Date().toISOString().slice(0, 10)) {
  const title = stripHtml(textValue(entry.title));
  const summary = stripHtml(textValue(entry.summary)).slice(0, 1800);
  const updatedAt = parsedIsoDate(textValue(entry.updated));
  const linkEntries = asArray(entry.link);
  const preferredLink = linkEntries.find((link) => link?.['@_rel'] === 'alternate') ?? linkEntries[0];
  const url = typeof preferredLink === 'string' ? preferredLink : preferredLink?.['@_href'] ?? '';
  if (!title || !url || /^closed\s*:/i.test(summary) || !hasTargetScope(`${title} ${summary}`)) return null;

  const deadline = deadlineFromText(summary, updatedAt);
  if (deadline && deadline < today) return null;

  return enrich({
    id: makeId(SOURCE, url),
    source: SOURCE,
    funder: null,
    title: title.slice(0, 300),
    url,
    summary,
    type: inferredType(`${title} ${summary}`.toLowerCase()),
    deadline,
    published_at: updatedAt,
    raw: { feed: 'GOV.UK Atom' },
  });
}

export function parseGovUkFundingFeed(xml, today = new Date().toISOString().slice(0, 10)) {
  const feed = parser.parse(xml);
  const entries = asArray(feed?.feed?.entry);
  return entries.map((entry) => mapGovUkEntry(entry, today)).filter(Boolean);
}

// The Atom feed only carries the newest 50 notices (mostly closed) and its
// summaries rarely name countries, so open multi-country funds were missed.
// The GOV.UK search API filters to open funds and carries structured
// location tags, which is what we match East Africa against.
const SEARCH_URL = 'https://www.gov.uk/api/search.json?filter_format=international_development_fund&filter_fund_state=open&count=500&fields=title,link,description,location,fund_state,eligible_entities,public_timestamp,development_sector';
const EA_LOCATIONS = {
  uganda: 'Uganda', kenya: 'Kenya', tanzania: 'Tanzania', rwanda: 'Rwanda', burundi: 'Burundi',
  'south-sudan': 'South Sudan', ethiopia: 'Ethiopia', somalia: 'Somalia',
  'democratic-republic-of-congo': 'Congo, Democratic Republic of',
};

export function mapGovUkSearchResult(result, today = new Date().toISOString().slice(0, 10)) {
  const title = stripHtml(String(result?.title ?? ''));
  const summary = stripHtml(String(result?.description ?? '')).slice(0, 1800);
  const url = result?.link ? new URL(result.link, 'https://www.gov.uk').href : '';
  const states = asArray(result?.fund_state);
  if (!title || !url || (states.length && !states.includes('open'))) return null;
  const countries = asArray(result?.location).map((slug) => EA_LOCATIONS[slug]).filter(Boolean);
  if (!countries.length && !hasTargetScope(`${title} ${summary}`)) return null;
  const publishedAt = parsedIsoDate(result?.public_timestamp);
  const deadline = deadlineFromText(summary, publishedAt);
  if (deadline && deadline < today) return null;
  return enrich({
    id: makeId(SOURCE, url),
    source: SOURCE,
    funder: 'UK Government (FCDO)',
    title: title.slice(0, 300),
    url,
    summary,
    countries,
    type: inferredType(`${title} ${summary}`.toLowerCase()),
    deadline,
    published_at: publishedAt,
    raw: { feed: 'GOV.UK search API', eligible: asArray(result?.eligible_entities) },
  });
}

export function parseGovUkSearch(json, today) {
  const results = asArray(json?.results);
  if (!Array.isArray(json?.results)) throw new Error('GOV.UK search: unexpected response shape');
  return results.map((result) => mapGovUkSearchResult(result, today)).filter(Boolean);
}

export async function fetchGovUkFunding() {
  const response = await fetchRetry(SEARCH_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`GOV.UK funding search HTTP ${response.status}`);
  return parseGovUkSearch(await response.json());
}
