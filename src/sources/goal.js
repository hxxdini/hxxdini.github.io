import { makeId, enrich, stripHtml, canonicalCountries } from '../normalize.js';
import { fetchRetry } from '../http.js';

// GOAL is an Irish international NGO. The Open Tenders page is a single
// Beaver-Builder stack: a country heading ("GOAL Uganda") followed by an
// accordion of tenders for that country office. Every visible accordion item
// is open — closed tenders are pulled from the page — so no status flag needs
// decoding. Uganda is GOAL's biggest East Africa office and every current scan
// shows multiple Ugandan tenders, usually plus one or two from other GOAL
// offices (Ireland, Zimbabwe, Niger, Sierra Leone, Syria). East Africa ones
// are kept, the rest dropped.
export const LIST_URL = 'https://www.goalglobal.org/tenders/';
const SOURCE = 'GOAL Global';
const UA = 'Mozilla/5.0 (compatible; FundRadar/0.1)';

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07',
  aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

// GOAL's country headings read "GOAL Uganda", "GOAL Niger", etc. Map the East
// African ones through the normalizer's canonical names.
const EA_HEADINGS = {
  uganda: 'Uganda', kenya: 'Kenya', tanzania: 'Tanzania', rwanda: 'Rwanda',
  burundi: 'Burundi', 'south sudan': 'South Sudan', ethiopia: 'Ethiopia',
  somalia: 'Somalia',
};

// Word-pasted prose sprinkles stray spaces inside tokens: "Novem ber", "202 6",
// "5 th". The deadline regex matches those variants directly instead of
// pre-collapsing the line, which would eat legitimate spaces like "date and
// time" and break the "closing date" search.
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length);
const MONTH_RE = MONTH_NAMES.map((name) => name.split('').join('\\s?')).join('|');
const DATE_RE = new RegExp(
  `(\\d{1,2})\\s?(?:st|nd|rd|th)?\\s+(${MONTH_RE})[,\\s]+(\\d\\s?\\d\\s?\\d\\s?\\d)`,
  'i',
);

export function parseGoalDeadline(text, today = new Date().toISOString().slice(0, 10)) {
  // The accordion body is Word-pasted prose: "Closing date and time for receipt
  // of tenders: 29th November 2026 at 17:00 EAT". After stripHtml the day,
  // month and year line up on one line. We prefer "tenders"/"offers" lines
  // over "clarifications", which closes earlier.
  if (!text) return null;
  const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const tenderLine = lines.find((l) => /closing date[^\n]*(?:tenders?|offers?|bids?|proposals?|receipt)/i.test(l));
  const clarifLine = lines.find((l) => /closing date[^\n]*clarif/i.test(l));
  const anyClose = lines.find((l) => /closing date|closing time|receipt of/i.test(l));
  const source = tenderLine ?? anyClose ?? clarifLine;
  if (!source) return null;
  const m = source.match(DATE_RE);
  if (!m) return null;
  const monthKey = m[2].replace(/\s+/g, '').toLowerCase();
  const month = MONTHS[monthKey];
  if (!month) return null;
  const year = m[3].replace(/\s+/g, '');
  const iso = `${year}-${month}-${m[1].padStart(2, '0')}`;
  if (iso < today) return null;
  return iso;
}

export function parseGoalTenders(html, today = new Date().toISOString().slice(0, 10)) {
  // Each tender is a <div class="fl-accordion-item"> whose button carries the
  // title and whose body carries the Closing date line. The country heading
  // "GOAL Country" appears upstream in the document as a sibling <h3>, so we
  // scan both heading and item positions in order.
  const marks = [];
  const headingRe = /<h3[^>]*class="fl-heading"[^>]*>\s*<span class="fl-heading-text">([^<]+?)<\/span>\s*<\/h3>/g;
  let m;
  while ((m = headingRe.exec(html)) !== null) {
    marks.push({ pos: m.index, kind: 'heading', value: stripHtml(m[1]).trim() });
  }
  const itemRe = /<div class="fl-accordion-item">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  while ((m = itemRe.exec(html)) !== null) {
    marks.push({ pos: m.index, kind: 'item', value: m[1] });
  }
  if (!marks.some((x) => x.kind === 'item')) {
    throw new Error('GOAL: no accordion items found (page layout changed?)');
  }
  marks.sort((a, b) => a.pos - b.pos);

  const out = [];
  let country = null;
  for (const mark of marks) {
    if (mark.kind === 'heading') {
      const key = mark.value.toLowerCase().replace(/^goal\s+/, '').trim();
      country = EA_HEADINGS[key] ?? null;
      continue;
    }
    // Item: skip if the preceding heading was outside East Africa
    if (!country) continue;
    const titleMatch = mark.value.match(/<a class="fl-accordion-button-label"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const title = stripHtml(titleMatch[1]).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const ref = title.match(/Ref[:\s]*([A-Z0-9][A-Z0-9_\-/]{3,40})/i)?.[1]
      ?? title.match(/\(([A-Z]{2,5}-[A-Z0-9]{2,6}-\d{3,6})\)/)?.[1]
      ?? null;
    const body = stripHtml(mark.value).replace(/\s+/g, ' ').trim();
    // Rebuild line breaks around "Closing date" phrases for the deadline parser.
    const bodyLines = body.replace(/(Closing date|Tender opening|ITT Publication|RFO Publication|Proposed Timelines)/g, '\n$1').trim();
    const deadline = parseGoalDeadline(bodyLines, today);
    if (!deadline) continue;
    const rec = enrich({
      id: makeId('goal', ref ?? title),
      source: SOURCE,
      funder: 'GOAL Global',
      title: title.slice(0, 300),
      url: LIST_URL,
      summary: `Tender by GOAL Global (Irish international NGO). Country office: GOAL ${country}.${ref ? ` Ref: ${ref}.` : ''}`,
      countries: [country],
      type: 'tender',
      deadline,
      raw: { ref, country_office: country },
    });
    rec.countries = canonicalCountries(rec.countries);
    if (!rec.countries.length) continue;
    out.push(rec);
  }
  return out;
}

export async function fetchGoal() {
  const res = await fetchRetry(LIST_URL, { headers: { 'User-Agent': UA } }, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`GOAL HTTP ${res.status}`);
  return parseGoalTenders(await res.text());
}
