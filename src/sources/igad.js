import { makeId, enrich, stripHtml, canonicalCountries } from '../normalize.js';
import { fetchRetry } from '../http.js';

// IGAD is an East African regional body (members: Djibouti, Eritrea, Ethiopia,
// Kenya, Somalia, South Sudan, Sudan, Uganda) that buys a lot across those
// countries. Its WordPress REST exposes every published "job listing", which
// covers three kinds of posts: tenders, consultancies and staff vacancies.
// We keep tenders and consultancies, drop vacancies (not opportunities), and
// require at least one canonical East African country on the item's location
// field — Djibouti/Eritrea/Sudan aren't in BidRadar's EA scope.
//
// The deadline sits only on the item HTML (the plugin keeps it out of REST
// meta), so this fetcher follows Enabel's pattern: list from the API, then
// a short per-item fetch for the `<li class="application-deadline">` block.
export const API_URL = 'https://igad.int/wp-json/wp/v2/job-listings?per_page=50&orderby=date&order=desc';
const SOURCE = 'IGAD (Intergovernmental Authority on Development)';
const UA = 'Mozilla/5.0 (compatible; BidRadar/0.1)';
const CONCURRENCY = 3;

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

// "Closes: November 30, 2026" → 2026-11-30. Returns null on anything else.
export function parseIgadDate(text) {
  if (!text) return null;
  const m = String(text).match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
}

// The item page has a stable fragment:
//   <li class="application-deadline"><label>Closes:</label> November 30, 2026</li>
// Fallback: a "Deadline: ..." mention in the body, which some older posts use.
export function parseIgadItem(html) {
  const closes = html.match(/<li[^>]*class="[^"]*application-deadline[^"]*"[^>]*>[\s\S]*?<\/li>/i)?.[0];
  if (closes) {
    const inner = stripHtml(closes).replace(/^Closes:\s*/i, '').trim();
    return { deadline: parseIgadDate(inner) };
  }
  const text = stripHtml(html);
  const m = text.match(/Deadline\s*:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
  return { deadline: m ? parseIgadDate(m[1]) : null };
}

// IGAD writes locations as "Djibouti, Ethiopia and Sudan" or "Kenya". Split on
// commas and "and"/"&" and canonicalize each piece; non-EA pieces (Djibouti,
// Eritrea, Sudan) silently drop.
export function parseIgadLocation(loc) {
  if (!loc) return [];
  const parts = String(loc).split(/\s*(?:,|\band\b|&)\s*/i).map((s) => s.trim()).filter(Boolean);
  return canonicalCountries(parts);
}

// IGAD's WP Job Manager uses three post classes:
//   job-type-tender         → tender
//   job-type-consultancies  → consultancy (treated as tender for the pipeline)
//   job-type-vacancies      → staff job, skip
function kindFromClassList(classList) {
  if (!Array.isArray(classList)) return null;
  if (classList.includes('job-type-tender')) return 'tender';
  if (classList.includes('job-type-consultancies')) return 'tender';
  return null;
}

async function fetchJson(url) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA } }, { timeoutMs: 45000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
  return JSON.parse(await res.text());
}

async function fetchItemHtml(url) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA } }, { timeoutMs: 15000, retries: 1 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await fn(items[idx], idx); }
      catch (e) { results[idx] = { __error: e.message }; }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchIgad(today = new Date().toISOString().slice(0, 10)) {
  const list = await fetchJson(API_URL);
  if (!Array.isArray(list)) throw new Error('IGAD API returned non-array');

  const items = list.map((t) => {
    const kind = kindFromClassList(t.class_list);
    if (!kind) return null;
    const countries = parseIgadLocation(t?.meta?._job_location);
    if (!countries.length) return null;
    return {
      kind,
      url: t.link,
      title: stripHtml(t?.title?.rendered ?? ''),
      location: t?.meta?._job_location ?? '',
      company: t?.meta?._company_name ?? '',
      countries,
      published_at: typeof t.date === 'string' ? t.date.slice(0, 10) : null,
    };
  }).filter((it) => it && it.url && it.title);

  let itemFetchErrors = 0;
  const details = await mapLimit(items, CONCURRENCY, async (it) => parseIgadItem(await fetchItemHtml(it.url)));

  const out = [];
  for (let i = 0; i < items.length; i++) {
    const d = details[i];
    if (d?.__error) { itemFetchErrors++; continue; }
    const it = items[i];
    const deadline = d?.deadline ?? null;
    if (deadline && deadline < today) continue;
    out.push(enrich({
      id: makeId('igad', it.url),
      source: SOURCE,
      funder: it.company || 'IGAD',
      title: it.title.slice(0, 300),
      url: it.url,
      summary: `Tender by ${it.company || 'IGAD'}, an East African regional body. Location: ${it.location}.`,
      countries: it.countries,
      type: it.kind,
      deadline,
      published_at: it.published_at,
      raw: { igad_location: it.location, igad_company: it.company },
    }));
  }

  if (itemFetchErrors > items.length * 0.1) out.partial = `${itemFetchErrors}/${items.length} item pages failed`;
  return out;
}
