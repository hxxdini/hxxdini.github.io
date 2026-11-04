import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Danish Refugee Council (DRC) public tender portal: an international NGO that
// buys goods, works and consultancies across East Africa (Kenya, Somalia, South
// Sudan, Uganda, Ethiopia). The page lists every tender as an <article> with
// data-country / data-deadline / data-status attributes; only status "current"
// is open. HQ tenders (Copenhagen/Geneva) are kept only when the title names
// an East African country or the region.
export const LIST_URL = 'https://drc.ngo/en/tenders/';
const SOURCE = 'Danish Refugee Council (DRC)';
const EA = {
  uganda: 'Uganda', kenya: 'Kenya', tanzania: 'Tanzania', rwanda: 'Rwanda', burundi: 'Burundi',
  'south sudan': 'South Sudan', ethiopia: 'Ethiopia', somalia: 'Somalia',
  'democratic republic of congo': 'Congo, Democratic Republic of', 'dr congo': 'Congo, Democratic Republic of',
};

function attr(block, name) {
  return stripHtml(block.match(new RegExp(`data-${name}="([^"]*)"`))?.[1] ?? '');
}

function isoDate(yyyymmdd) {
  const m = String(yyyymmdd).match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseDrcTenders(html, today = new Date().toISOString().slice(0, 10)) {
  const blocks = html.match(/<article class="tenderList__item"[\s\S]*?<\/article>/g) ?? [];
  if (!blocks.length) throw new Error('DRC: no tender list found (page layout changed?)');
  const out = [];
  for (const block of blocks) {
    if (attr(block, 'status') !== 'current') continue;
    const title = stripHtml(block.match(/tenderList__item__title">([\s\S]*?)<\/span>/)?.[1] ?? '');
    const href = block.match(/href="([^"]+)"/)?.[1];
    const location = attr(block, 'country');
    const deadline = isoDate(block.match(/data-deadline="(\d{8})"/)?.[1]);
    if (!title || !href || (deadline && deadline < today)) continue;
    const where = `${location} ${title}`.toLowerCase();
    const countries = [...new Set(Object.entries(EA).filter(([k]) => where.includes(k)).map(([, v]) => v))];
    if (!countries.length && !/east africa/.test(where)) continue;
    const url = new URL(href, LIST_URL).href;
    const rec = enrich({
      id: makeId('drc', url),
      source: SOURCE,
      funder: 'Danish Refugee Council',
      title: title.slice(0, 300),
      url,
      summary: `Tender by the Danish Refugee Council (international NGO). Location: ${location}.`,
      countries,
      type: 'tender',
      deadline,
      published_at: isoDate(block.match(/data-published="(\d{8})"/)?.[1]),
      raw: { location },
    });
    // "DRC" in titles means the Danish Refugee Council, not DR Congo, so the
    // portal's own location field decides the country, not text detection.
    rec.countries = countries;
    out.push(rec);
  }
  return out;
}

export async function fetchDrc() {
  const res = await fetchRetry(LIST_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FundRadar/0.1)' } }, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseDrcTenders(await res.text());
}
