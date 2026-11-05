import { makeId, enrich, stripHtml, canonicalCountry } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Enabel is the Belgian government's international cooperation agency and a big
// donor-funded buyer in East Africa (Uganda, Rwanda, Tanzania, Burundi, DR
// Congo). Its WordPress REST exposes every published tender, but the country,
// deadline and open/closed status live only on the HTML item page — the `acf`
// and taxonomy fields are empty in the JSON. So we take the most-recent batch
// from the API, fetch each item page once, parse those three fields, and keep
// the open, East-African ones.
// 50 newest is about two weeks of Enabel tenders. Running every 4 hours, the
// DB upsert keeps older EA tenders alive until they close. Going higher costs
// one HTTPS fetch per item and starts to rate-limit from the GitHub runner.
export const API_URL = 'https://www.enabel.be/wp-json/wp/v2/tenders?per_page=50&orderby=date&order=desc';
const SOURCE = 'Enabel (Belgian development agency)';
const UA = 'Mozilla/5.0 (compatible; FundRadar/0.1)';
const CONCURRENCY = 3;

// Enabel labels tenders with its own country names; map the East African ones
// through the normalizer's canonical names.
const EA_COUNTRY_NAMES = new Set([
  'burundi', 'dr congo', 'drcongo', 'democratic republic of congo', 'rwanda',
  'uganda', 'tanzania', 'kenya', 'ethiopia', 'somalia', 'south sudan',
]);

// Date formats seen in item pages: "23 November 2026 12:00", "7 November 2026".
const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

export function parseEnabelDate(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
}

// Pulls country / deadline / status out of the item page's "Country : X" /
// "Closing date : ..." / "Status : Open" paragraph. Titles that name the
// country go through only when the Country field agrees — the item page is
// authoritative.
export function parseEnabelItem(html) {
  const text = stripHtml(html);
  const country = text.match(/Country\s*:\s*([A-Za-z][A-Za-z ,'-]{1,50}?)(?=\s+(?:Closing date|Status|Applicable legislation|Attachments|Opening date|$))/i)?.[1]?.trim() ?? null;
  const closing = text.match(/Closing date\s*:\s*(.{3,80}?)\s+(?:Status|Applicable|Attachments|Opening)\b/i)?.[1]?.trim() ?? null;
  const status = text.match(/Status\s*:\s*([A-Za-z]+)/i)?.[1]?.trim() ?? null;
  return { country, deadline: parseEnabelDate(closing), status };
}

async function fetchJson(url) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA } }, { timeoutMs: 45000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
  return JSON.parse(await res.text());
}

async function fetchItemHtml(url) {
  // Short per-item timeout; the pipeline runs every 4 hours and would rather
  // skip one tender than wait 45 s on a hung request.
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA } }, { timeoutMs: 15000, retries: 1 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Hand-rolled concurrency gate so one slow item page doesn't block everything.
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

export async function fetchEnabel(today = new Date().toISOString().slice(0, 10)) {
  const list = await fetchJson(API_URL);
  if (!Array.isArray(list) || !list.length) throw new Error('Enabel API returned no tenders');

  const items = list.map((t) => ({
    id: t.id,
    url: t.link,
    title: stripHtml(t?.title?.rendered ?? ''),
    published_at: typeof t.date === 'string' ? t.date.slice(0, 10) : null,
  })).filter((it) => it.url && it.title);

  let itemFetchErrors = 0;
  const details = await mapLimit(items, CONCURRENCY, async (it) => parseEnabelItem(await fetchItemHtml(it.url)));

  const out = [];
  for (let i = 0; i < items.length; i++) {
    const d = details[i];
    if (d?.__error) { itemFetchErrors++; continue; }
    if (!d) continue;
    if (d.status && !/open/i.test(d.status)) continue;
    if (d.deadline && d.deadline < today) continue;
    const countryKey = (d.country ?? '').toLowerCase().replace(/[.,]/g, '').trim();
    if (!EA_COUNTRY_NAMES.has(countryKey)) continue;
    const canonical = canonicalCountry(d.country);
    if (!canonical) continue;
    const it = items[i];
    out.push(enrich({
      id: makeId('enabel', it.url),
      source: SOURCE,
      funder: 'Enabel',
      title: it.title.slice(0, 300),
      url: it.url,
      summary: `Tender published by Enabel, Belgium's international cooperation agency. Country: ${canonical}.`,
      countries: [canonical],
      type: 'tender',
      deadline: d.deadline,
      published_at: it.published_at,
      raw: { enabel_country: d.country, enabel_status: d.status },
    }));
  }

  // Mark the batch as partial so the pipeline log captures it (same convention
  // as other sources). Item-fetch errors are only "partial" if we lost a real
  // chunk; one or two timeouts out of 50 are normal and not worth flagging.
  if (itemFetchErrors > items.length * 0.1) out.partial = `${itemFetchErrors}/${items.length} item pages failed`;
  return out;
}
