import { makeId, enrich, stripHtml, canonicalCountries } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Kenya Red Cross tender portal: a national NGO that buys consultancies,
// insurance, civil works and goods for projects across Kenya. The public page
// lists tenders as Elementor blocks with the title in an h2/h3, a "Posted:" and
// "Closing:" line in DD/MM/YYYY, and a SharePoint PDF link. Pagination is
// `?e-page-8d86569=N`; only page 1 holds open items in practice but we accept
// paginated HTML too so a future refresh doesn't need a parser change.
export const LIST_URL = 'https://redcross.or.ke/tenders/';
const SOURCE = 'Kenya Red Cross Society';

function ddmmyyyyToIso(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function detectType(title) {
  const t = title.toLowerCase();
  if (/\b(request for proposals?|rfp|evaluation|consultancy|baseline|end[\s-]*term)\b/.test(t)) return 'consultancy';
  return 'tender';
}

export function parseKenyaRedCross(html, today = new Date().toISOString().slice(0, 10)) {
  // Each tender block starts at an h2/h3 whose text precedes "Posted: … Closing: …"
  // and a SharePoint PDF link. Split on heading opens and keep blocks that contain
  // both a closing date and a SharePoint URL.
  const chunks = html.split(/(?=<h[23][^>]*>)/);
  if (chunks.length < 2) throw new Error('Kenya Red Cross: no tender list found (page layout changed?)');

  const out = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const pdf = chunk.match(/https:\/\/kenyaredcross-my\.sharepoint\.com\/[^"'\s<]+/);
    const closingRaw = chunk.match(/Closing:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
    if (!pdf || !closingRaw) continue;

    const headingHtml = chunk.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/)?.[1] ?? '';
    const title = stripHtml(headingHtml).replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const deadline = ddmmyyyyToIso(closingRaw);
    if (!deadline || deadline < today) continue;

    const postedIso = ddmmyyyyToIso(chunk.match(/Posted:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]);
    const pdfUrl = pdf[0].replace(/&amp;/g, '&');
    if (seen.has(pdfUrl)) continue;
    seen.add(pdfUrl);

    const rec = enrich({
      id: makeId('kenya_redcross', pdfUrl),
      source: SOURCE,
      funder: 'Kenya Red Cross Society',
      title: title.slice(0, 300),
      url: pdfUrl,
      summary: `Tender published by the Kenya Red Cross Society (national NGO). Download the full RFP/bid document from the Kenya Red Cross SharePoint link.`,
      countries: canonicalCountries(['Kenya']),
      type: detectType(title),
      deadline,
      published_at: postedIso,
      raw: { listing: LIST_URL },
    });
    out.push(rec);
  }
  return out;
}

export async function fetchKenyaRedCross() {
  // Only page 1 is worth fetching: pages 2+ are historical archives. If they
  // ever start carrying open items again, uncomment the paginated loop below.
  const res = await fetchRetry(LIST_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FundRadar/0.1)' } }, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseKenyaRedCross(await res.text());
}
