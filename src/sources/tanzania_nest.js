import { makeId, enrich } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Tanzania NeST (National e-Procurement System, run by PPRA) — every public
// buyer in Tanzania (ministries, councils, water authorities, parastatals,
// schools) publishes its tenders here. The public "Published Tenders" page is
// an Angular app that reads a public GraphQL endpoint; we call that endpoint
// directly with the same query the page sends (no login, no token).
//
// robots.txt allows /tenders/published-tenders and doesn't mention /gateway/.
// It disallows /tender-details, and the detail route carries no tender id in
// the URL anyway, so each record links to the public list page and quotes
// NeST's reference number so the reader can search it there.
export const API_URL = 'https://nest.go.tz/gateway/nest-app/graphql';
export const LIST_URL = 'https://nest.go.tz/tenders/published-tenders';
const SOURCE = 'Tanzania NeST (PPRA)';
const UA = 'Mozilla/5.0 (compatible; BidRadar/0.1)';
const PAGE_SIZE = 100;
const MAX_PAGES = 15;
const PAUSE_MS = 1500;

const QUERY = `query getPublishedEntityViewData($input: DataRequestInputInput, $withMetaData: Boolean) {
  items: getPublishedEntityViewData(input: $input, withMetaData: $withMetaData) {
    totalPages totalRecords currentPage hasNext
    rows: data {
      descriptionOfTheProcurement entityNumber entityStatus entitySubCategoryName entityType
      entityUuid invitationDate procurementCategoryName procuringEntityName
      submissionOrOpeningDate referenceNumber
    }
  }
}`;

export function buildRequest(page) {
  return JSON.stringify({
    operationName: 'getPublishedEntityViewData',
    variables: {
      input: {
        page,
        pageSize: PAGE_SIZE,
        fields: [{ fieldName: 'invitationDate', isSortable: true, orderDirection: 'DESC' }],
        mustHaveFilters: [{ fieldName: 'entityStatus', operation: 'IN', inValues: ['PUBLISHED'] }],
      },
    },
    query: QUERY,
  });
}

// "2026-11-27T14:00" → "2026-11-27". Anything else → null (never guess).
export function nestDate(value) {
  const m = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function titleCase(s) {
  // Many NeST titles and buyer names are ALL CAPS; soften them for reading.
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

const KIND_LABEL = { TENDER: 'Tender', FRAMEWORK: 'Framework agreement', PLANNED_TENDER: 'Tender' };

// One GraphQL row → one BidRadar record, or null when it isn't an open tender
// with a real deadline on or after `today`.
export function mapNestRow(r, today) {
  if (!r || r.entityStatus !== 'PUBLISHED') return null;
  const deadline = nestDate(r.submissionOrOpeningDate);
  if (!deadline || deadline < today) return null;
  const title = String(r.descriptionOfTheProcurement ?? '').replace(/\s+/g, ' ').trim();
  const key = r.entityUuid || r.referenceNumber || r.entityNumber;
  if (!title || !key) return null;
  const buyer = titleCase(String(r.procuringEntityName ?? '').trim()) || 'Government of Tanzania';
  const ref = r.referenceNumber || r.entityNumber || '';
  const kind = KIND_LABEL[r.entityType] ?? 'Tender';
  const category = r.procurementCategoryName ? ` (${r.procurementCategoryName})` : '';
  const close = String(r.submissionOrOpeningDate).replace('T', ' ');
  return enrich({
    id: makeId('tanzania_nest', key),
    source: SOURCE,
    funder: buyer,
    title: titleCase(title).slice(0, 300),
    url: LIST_URL,
    summary: `${kind}${category} by ${buyer}, Tanzania, on NeST. Reference ${ref}. Submission deadline ${close} EAT. Search the reference on the NeST Published Tenders page for documents.`,
    countries: ['Tanzania'],
    type: 'tender',
    deadline,
    published_at: nestDate(r.invitationDate),
    raw: {
      nest_uuid: r.entityUuid, nest_reference: ref, nest_type: r.entityType,
      nest_category: r.procurementCategoryName, nest_subcategory: r.entitySubCategoryName,
      nest_deadline: r.submissionOrOpeningDate,
    },
  });
}

export function parseNestPage(json, today) {
  const items = json?.data?.items;
  if (!items || !Array.isArray(items.rows)) {
    const err = json?.errors?.[0]?.message;
    throw new Error(`NeST GraphQL returned no rows${err ? `: ${err}` : ''}`);
  }
  return {
    records: items.rows.map((r) => mapNestRow(r, today)).filter(Boolean),
    hasNext: Boolean(items.hasNext),
    totalRecords: items.totalRecords ?? null,
  };
}

async function fetchPage(page) {
  const res = await fetchRetry(API_URL, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: buildRequest(page),
  }, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`NeST HTTP ${res.status}`);
  return JSON.parse(await res.text());
}

export async function fetchTanzaniaNest(today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    let parsed;
    try {
      parsed = parseNestPage(await fetchPage(page), today);
    } catch (e) {
      if (page === 1) throw e;
      out.partial = `page ${page} failed: ${e.message}`;
      break;
    }
    for (const rec of parsed.records) {
      if (seen.has(rec.id)) continue;
      seen.add(rec.id);
      out.push(rec);
    }
    if (!parsed.hasNext) break;
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  return out;
}
