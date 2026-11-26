import { makeId, enrich, stripHtml, canonicalCountries } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Welthungerhilfe (WHH) is a German INGO with big country offices in Ethiopia,
// Uganda, Kenya, Somalia/Somaliland, South Sudan, Burundi and DR Congo. Its
// "Current calls for tender" page is a server-rendered TYPO3 feed of the
// eu-supply eTender portal: one <div class="tender__list__item"> per open call,
// with publication date, title + eu-supply link, "Contracting Authority:
// Welthungerhilfe <Country>" and "Response Deadline (CET): dd.mm.yyyy hh:mm".
// The feed only lists current calls; we still drop anything past its deadline.
// Country comes only from the contracting-authority field. Items with an empty
// authority are skipped (we don't guess from titles). robots.txt allows /.
export const LIST_URL = 'https://www.welthungerhilfe.org/tenders';
const SOURCE = 'Welthungerhilfe';
const UA = 'Mozilla/5.0 (compatible; BidRadar/0.1)';

function decode(s = '') {
  return s
    .replace(/&shy;/g, '')
    .replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"');
}

function field(block, cls) {
  const m = block.match(new RegExp(`<div class="tender__list__item__${cls}">([\\s\\S]*?)</div>`));
  return m ? stripHtml(decode(m[1])).trim() : '';
}

// "Response Deadline (CET): 13.12.2026 11:12" -> "2026-12-13". The time part is
// unreliable on the page (the minutes echo the month), so only the date is used.
export function parseWhhDeadline(text) {
  const m = (text ?? '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// "Contracting Authority: Welthungerhilfe Ethiopia" / "Welthungerhilfe, Pakistan"
export function parseWhhCountry(text) {
  const m = (text ?? '').match(/Contracting Authority:\s*Welthungerhilfe[\s,]+(.+)$/i);
  if (!m) return null;
  return m[1].trim() || null;
}

export function parseWhhTenders(html, today = new Date().toISOString().slice(0, 10)) {
  if (!/class="tender__list"/.test(html)) {
    throw new Error('Welthungerhilfe: tender list container not found (page layout changed?)');
  }
  const parts = html.split('<div class="tender__list__item">').slice(1);
  const out = [];
  for (const block of parts) {
    const titleM = block.match(/<div class="tender__list__item__title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleM) continue;
    const url = decode(titleM[1]).replace(/&amp;/g, '&');
    const title = stripHtml(decode(titleM[2])).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const office = parseWhhCountry(field(block, 'client'));
    if (!office) continue;
    const countries = canonicalCountries([office]);
    if (!countries.length) continue; // outside East Africa
    const deadline = parseWhhDeadline(field(block, 'deadline'));
    if (!deadline || deadline < today) continue;
    const published = parseWhhDeadline(field(block, 'date'));
    const pid = url.match(/[?&]PID=(\d+)/)?.[1] ?? null;
    const rec = enrich({
      id: makeId('welthungerhilfe', pid ?? `${title}|${office}`),
      source: SOURCE,
      funder: `Welthungerhilfe ${office}`,
      title: title.slice(0, 300),
      url,
      summary: `Call for tender by Welthungerhilfe (German NGO), country office ${office}. Published ${published ?? 'n/a'}. Bids go through the eu-supply eTender portal (free supplier registration).`,
      countries,
      type: 'tender',
      deadline,
      raw: { pid, office, published },
    });
    rec.countries = countries;
    out.push(rec);
  }
  return out;
}

export async function fetchWelthungerhilfe() {
  const res = await fetchRetry(LIST_URL, { headers: { 'User-Agent': UA } }, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`Welthungerhilfe HTTP ${res.status}`);
  return parseWhhTenders(await res.text());
}
