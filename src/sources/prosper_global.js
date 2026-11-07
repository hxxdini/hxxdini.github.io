import { makeId, enrich, stripHtml, canonicalCountry } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Prosper Global is the rebranded Mercy Corps (mercycorps.org 301s here as of
// November 2026). Its /tenders page lists every active "Intent to Bid" with
// the destination country and an open/close date range as ISO <time> tags,
// so the list page alone has every field FundRadar needs — no detail fetch.
// Only rows whose country canonicalizes into East Africa are kept; archived
// or expired rows (deadline before today) fall out.
export const LIST_URL = 'https://www.prosperglobal.org/tenders';
const SOURCE = 'Prosper Global (formerly Mercy Corps)';

// One row on /tenders is a <div class="c-view__row"> containing title, href,
// country text and two <time> tags (open, close). We walk rows in order and
// treat the second datetime attribute as the close date.
export function parseProsperGlobalTenders(html, today = new Date().toISOString().slice(0, 10)) {
  const rows = html.match(/<div\s+class="c-view__row">[\s\S]*?(?=<div\s+class="c-view__row">|<div\s+class="c-view__footer"|<\/main)/g);
  if (!rows || !rows.length) throw new Error('Prosper Global: no tender rows found (page layout changed?)');
  const out = [];
  for (const row of rows) {
    const titleRaw = row.match(/<h3 class="c-button-box__title">([\s\S]*?)<\/h3>/)?.[1];
    const href = row.match(/<a href="([^"]+)" class="c-button-box__link"/)?.[1];
    const countryRaw = row.match(/c-field--name-field-countries[\s\S]*?<div class="c-field__content">([\s\S]*?)<\/div>/)?.[1];
    const times = [...row.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
    if (!titleRaw || !href || !countryRaw || times.length < 2) continue;
    const title = stripHtml(titleRaw).replace(/\s+/g, ' ').trim();
    const country = stripHtml(countryRaw).trim();
    const canonical = canonicalCountry(country);
    if (!canonical) continue;
    const openIso = times[0];
    const closeIso = times[times.length - 1];
    const deadline = closeIso.slice(0, 10);
    if (deadline < today) continue;
    const url = new URL(href, LIST_URL).href;
    out.push(enrich({
      id: makeId('prosperglobal', url),
      source: SOURCE,
      funder: 'Prosper Global',
      title: title.slice(0, 300),
      url,
      summary: `Tender ("Intent to Bid") published by Prosper Global (the rebranded Mercy Corps), an international NGO. Country: ${canonical}.`,
      countries: [canonical],
      type: 'tender',
      deadline,
      published_at: openIso.slice(0, 10),
      raw: { prosper_country: country, open_at: openIso, close_at: closeIso },
    }));
  }
  return out;
}

export async function fetchProsperGlobal() {
  const res = await fetchRetry(LIST_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FundRadar/0.1)' } }, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseProsperGlobalTenders(await res.text());
}
