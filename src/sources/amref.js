import { makeId, enrich, stripHtml, canonicalCountries, extractDeadline } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Amref Health Africa is the largest Africa-based health NGO, headquartered in
// Nairobi with country offices in Kenya, Uganda, Tanzania, Ethiopia and South
// Sudan. Its tenders page lists every current opportunity as an
// <li class="tender-card"> with a title (uppercased, often naming the country
// office or Kenyan county), a listing <time datetime> (publishing time) and a
// link to a detail page. The detail page carries submission instructions as
// plain prose. Deadlines appear there about half the time ("not later than
// 17:00hrs, 30th November, 2026", "Closing Date: October 7 th"); the rest
// live only inside the attached PDF. We fetch the detail page best-effort for
// a deadline and country hint but keep deadline-less records (first_seen
// within 14 days keeps them on the live site, like other NGO sources).
export const LIST_URL = 'https://amref.org/tenders/';
const SOURCE = 'Amref Health Africa';
const UA = 'Mozilla/5.0 (compatible; FundRadar/0.1)';
const CONCURRENCY = 3;
const ITEM_MAX_AGE_DAYS = 90;
// Items without a parseable deadline are assumed open while fresh. After
// NO_DEADLINE_MAX_AGE_DAYS they are treated as closed and dropped (the live
// site's own "live" count mirrors this cut-off at 14 days anyway).
const NO_DEADLINE_MAX_AGE_DAYS = 30;

// Map every EA country name and common Amref country-office phrasings to the
// canonical names. Tender titles carry the office ("in Kenya", "PEP Uganda")
// and Amref also lists county-level sub-grants in Kenya (Kilifi, Nakuru etc.).
const COUNTRY_HINTS = [
  [/\bin kenya\b|\bpep kenya\b|\bamref health africa kenya\b|\bkilifi\b|\bnakuru\b|\bmombasa\b|\bkisumu\b|\bgarissa\b|\bturkana\b|\bkajiado\b|\bmachakos\b|\bnairobi\b|\bkenya\b/i, 'Kenya'],
  [/\bin uganda\b|\bpep uganda\b|\bamref uganda\b|\bugerp\b|\bkampala\b|\buganda\b/i, 'Uganda'],
  [/\bin tanzania\b|\bamref tanzania\b|\btanzania\b|\btanzanian\b|\bdar es salaam\b/i, 'Tanzania'],
  [/\bin ethiopia\b|\bamref ethiopia\b|\bethiopia\b|\bethiopian\b|\baddis ababa\b/i, 'Ethiopia'],
  [/\bin south sudan\b|\bamref south sudan\b|\bsouth sudan\b|\bjuba\b/i, 'South Sudan'],
];

// Submission-deadline clauses as they appear on Amref detail pages. We prefer
// the first clause that names a tender/offer/proposal/bid submission.
const DEADLINE_CLAUSES = [
  /not later than[^.;]{3,200}/i,
  /closing date[^.;]{3,200}/i,
  /submission deadline[^.;]{3,200}/i,
  /deadline for submission[^.;]{3,200}/i,
  /should reach[^.;]{3,200}/i,
  /should be (?:submitted|received|sent)[^.;]{3,200}/i,
];

// normalize.js extractDeadline doesn't handle day-first ordinals ("30th"),
// which is Amref's standard phrasing. Strip the ordinal suffix entirely
// ("30th" / "30 th" / "30-th" → "30") before handing off.
function stripOrdinals(text) {
  return text.replace(/(\d{1,2})[\s-]?(?:st|nd|rd|th)\b/gi, '$1');
}

export function extractAmrefDeadline(text, today = new Date().toISOString().slice(0, 10)) {
  if (!text) return null;
  const normalised = stripOrdinals(text);
  for (const re of DEADLINE_CLAUSES) {
    const clause = normalised.match(re)?.[0];
    if (!clause) continue;
    const iso = extractDeadline(clause);
    if (iso && iso >= today) return iso;
    if (iso) return null; // explicit past deadline — skip
  }
  const iso = extractDeadline(normalised);
  return iso && iso >= today ? iso : null;
}

export function detectAmrefCountries(text) {
  const hits = new Set();
  for (const [re, country] of COUNTRY_HINTS) if (re.test(text)) hits.add(country);
  return [...hits];
}

// The tenders list is a single <ul class="tender-grid"> with li.tender-card
// children. Each card has a link, a <time> element with the publish datetime
// and a title h2. There is no in-list deadline — the detail page carries it
// when it exists at all.
export function parseAmrefList(html) {
  const cards = html.match(/<li class="tender-card">[\s\S]*?<\/li>/g) ?? [];
  if (!cards.length) throw new Error('Amref: no tender cards found (page layout changed?)');
  const out = [];
  for (const card of cards) {
    const href = card.match(/class="tender-card__link"\s+href="([^"]+)"/)?.[1];
    const title = stripHtml(card.match(/class="tender-card__title">([\s\S]*?)<\/h2>/)?.[1] ?? '');
    const dt = card.match(/<time\s+datetime="([^"]+)"/)?.[1] ?? null;
    const excerpt = stripHtml(card.match(/class="tender-card__excerpt">([\s\S]*?)<\/p>/)?.[1] ?? '');
    if (!href || !title) continue;
    out.push({
      url: href,
      title: title.replace(/\s+/g, ' ').trim(),
      published_at: dt ? dt.slice(0, 10) : null,
      excerpt: excerpt.replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

// On the detail page the submission instructions sit between the "invites"
// phrase and the "Share this" social block. That slice is enough for the
// deadline sniffer and the country hint.
export function extractAmrefDetailBody(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ');
  text = stripHtml(text).replace(/\s+/g, ' ').trim();
  const start = text.search(/\binvite[sd]?\b/i);
  const slice = start >= 0 ? text.slice(start) : text;
  // Social/nav blocks that always sit immediately after the tender body on
  // Amref pages. Use anchors that don't appear in natural tender prose.
  const stopRe = /Share this:|\bLatest news\b|\bYou May Also Like\b/i;
  const end = slice.search(stopRe);
  return end >= 0 ? slice.slice(0, end) : slice.slice(0, 3000);
}

async function fetchText(url, timeoutMs = 20000, retries = 1) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA } }, { timeoutMs, retries });
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

export async function fetchAmref(today = new Date().toISOString().slice(0, 10)) {
  const html = await fetchText(LIST_URL, 60000, 2);
  const cards = parseAmrefList(html);

  // Pagination: /tenders/page/N/ exists for older items. The first page covers
  // ~2 months of activity, which is all we need for live tenders. Skip the
  // rest to keep runtime predictable.
  const recent = cards.filter((c) => {
    if (!c.published_at) return true; // keep if unknown and let staleness checks filter later
    const age = (Date.parse(today) - Date.parse(c.published_at)) / 86400000;
    return age <= ITEM_MAX_AGE_DAYS;
  });

  let itemFetchErrors = 0;
  const details = await mapLimit(recent, CONCURRENCY, async (c) => extractAmrefDetailBody(await fetchText(c.url)));

  const out = [];
  for (let i = 0; i < recent.length; i++) {
    const card = recent[i];
    const body = details[i];
    const bodyText = body && !body.__error ? body : '';
    if (body?.__error) itemFetchErrors++;

    const probe = `${card.title} ${card.excerpt} ${bodyText}`;
    const countries = canonicalCountries(detectAmrefCountries(probe));
    if (!countries.length) continue;

    const deadline = extractAmrefDeadline(bodyText, today);
    // Drop closed tenders. extractAmrefDeadline returns null for a parseable
    // past deadline, and for the (very common) "Closing Date: October 7 th"
    // phrasing that omits the year. Either way, a body that explicitly says
    // Closing Date / Submission deadline but no future date is closed. Also
    // drop deadline-less items older than NO_DEADLINE_MAX_AGE_DAYS so that
    // stale listings don't pile up as "recently seen".
    if (!deadline) {
      if (/closing date|submission deadline|not later than|deadline for/i.test(bodyText)) continue;
      const pubAge = card.published_at
        ? (Date.parse(today) - Date.parse(card.published_at)) / 86400000
        : Infinity;
      if (pubAge > NO_DEADLINE_MAX_AGE_DAYS) continue;
    }

    const location = countries.join(', ');
    const rec = enrich({
      id: makeId('amref', card.url),
      source: SOURCE,
      funder: 'Amref Health Africa',
      title: card.title.slice(0, 300),
      url: card.url,
      summary: card.excerpt
        ? `${card.excerpt} Country: ${location}.`
        : `Tender by Amref Health Africa (African health NGO). Country: ${location}.`,
      countries,
      type: 'tender',
      deadline,
      published_at: card.published_at,
      raw: { location, published_at: card.published_at },
    });
    // Amref tender titles embed the tender number as DD/MM/YYYY
    // ("AMREF/13/11/2026/023") which enrich() misreads as a deadline. The
    // detail-page deadline is authoritative: keep it, or keep null.
    rec.deadline = deadline;
    out.push(rec);
  }

  if (itemFetchErrors > recent.length * 0.2) {
    out.partial = `${itemFetchErrors}/${recent.length} Amref detail pages failed`;
  }
  return out;
}
