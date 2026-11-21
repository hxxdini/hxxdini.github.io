import { makeId, enrich, stripHtml, canonicalCountries } from '../normalize.js';
import { fetchRetry } from '../http.js';

// African Union Commission bids (au.int/en/bids). The AU is headquartered in
// Addis Ababa and buys consultancies, goods and works for the Commission and
// its organs (Africa CDC, AUDA-NEPAD ...). The list is a server-rendered
// Drupal view table: published - deadline (<time datetime>), title + link,
// bid type, bid number. robots.txt allows `*` (search=yes).
//
// Country comes from the bid number's own ISO-2 prefix, e.g.
// "ET-AUC-569896-CS-QCBS" (ET = Ethiopia, the procuring country in the
// World Bank STEP style reference). Bids without a recognisable East African
// prefix are dropped rather than guessed.
export const LIST_URL = 'https://au.int/en/bids';
const BASE = 'https://au.int';
const SOURCE = 'African Union Commission';
const UA = 'Mozilla/5.0 (compatible; BidRadar/0.1)';
const MAX_PAGES = 5;

const ISO2 = {
  ET: 'Ethiopia', KE: 'Kenya', UG: 'Uganda', TZ: 'Tanzania', RW: 'Rwanda',
  BI: 'Burundi', SS: 'South Sudan', SO: 'Somalia', CD: 'DR Congo',
};

export function countryFromBidNumber(bidNumber) {
  const m = String(bidNumber ?? '').trim().match(/^([A-Z]{2})-/);
  if (!m || !ISO2[m[1]]) return [];
  return canonicalCountries([ISO2[m[1]]]);
}

function decode(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

// Rows of the bids view table. Only rows that link to /en/bids/<date>/<slug>
// count; the header row and other blocks on the page are ignored.
export function parseAuBids(html) {
  const out = [];
  const rows = String(html).match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const link = row.match(/<a href="(\/en\/bids\/\d{8}\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const dateCell = row.match(/views-field-field-date[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '';
    const times = [...dateCell.matchAll(/datetime="(\d{4}-\d{2}-\d{2})T[^"]*"/g)].map((m) => m[1]);
    const cell = (cls) => {
      const c = row.match(new RegExp(`${cls}[^>]*>([\\s\\S]*?)<\\/td>`, 'i'))?.[1];
      return c == null ? '' : decode(stripHtml(c)).replace(/\s+/g, ' ').trim();
    };
    out.push({
      url: BASE + link[1],
      title: decode(stripHtml(link[2])).replace(/\s+/g, ' ').trim(),
      published_at: times.length > 1 ? times[0] : null,
      // A single date is ambiguous (could be the post date), so only trust the
      // second <time> of a "published - deadline" range.
      deadline: times.length > 1 ? times[times.length - 1] : null,
      bidType: cell('views-field-field-tags-documents'),
      bidNumber: cell('views-field-field-text-bidnumber'),
    });
  }
  return out;
}

export function hasNextPage(html) {
  return /pager__item--next/.test(String(html));
}

async function fetchPage(url) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA } }, { timeoutMs: 45000 });
  if (!res.ok) throw new Error(`African Union HTTP ${res.status} at ${url}`);
  return res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchAfricanUnion(today = new Date().toISOString().slice(0, 10)) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const html = await fetchPage(page ? `${LIST_URL}?page=${page}` : LIST_URL);
    if (page === 0 && !/view-id-bids|view-bids/.test(html)) throw new Error('African Union bids view missing');
    rows.push(...parseAuBids(html));
    if (!hasNextPage(html)) break;
    await sleep(1500);
  }

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    if (!r.deadline || r.deadline < today) continue; // open only, real deadline only
    const countries = countryFromBidNumber(r.bidNumber);
    if (!countries.length) continue;
    out.push(enrich({
      id: makeId('african-union', r.url),
      source: SOURCE,
      funder: 'African Union Commission',
      title: r.title.slice(0, 300),
      url: r.url,
      summary: `African Union bid ${r.bidNumber}${r.bidType ? ` (${r.bidType})` : ''}.`,
      countries,
      type: 'tender',
      deadline: r.deadline,
      published_at: r.published_at,
      raw: { au_bid_number: r.bidNumber, au_bid_type: r.bidType },
    }));
  }
  return out;
}
