import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry, BROWSER_UA } from '../http.js';

// SomaliJobs tenders (somalijobs.com/tenders). Somalia's biggest jobs board also
// carries tender notices from the Federal Government, member states
// (Jubbaland, Puntland, Galmudug), Somaliland, local NGOs and INGOs: about 60
// live notices at a time, ~7 new a day. No other BidRadar source covers Somali
// buyers directly. No robots.txt (the path returns the site's 404 page).
//
// The /tenders page is a jQuery shell: it POSTs to /tenders/fetch/ with the
// page's own public `api_token` in a CSRF-Token header (plus the session
// cookie) and gets back 10 HTML cards per page; HTTP 203 "Pagination Finished"
// marks the end. The list only shows active notices, but has no deadline, so
// each notice's detail page is read for its "Expire date" (e.g. "Dec, 12").
//
// The expire date has no year. We take the current year (Nairobi date); if
// that lands more than 31 days in the past, the notice is for next year
// (a "Jan, 15" read in late November). Anything still before today is dropped.
//
// Country: the board is Somalia-only (Somaliland and the member states are
// filed as Somalia, as elsewhere in BidRadar). The location slug is kept in
// raw; locations that name another country are dropped, not guessed.
export const LIST_URL = 'https://somalijobs.com/tenders';
const FETCH_URL = 'https://somalijobs.com/tenders/fetch/';
const BASE = 'https://somalijobs.com';
const SOURCE = 'SomaliJobs tenders';
const MAX_PAGES = 12;
const PAUSE_MS = 1500;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const NON_SOMALI = /\b(kenya|nairobi|ethiopia|addis|djibouti|uganda|kampala|remote|international|worldwide|global)\b/i;

function decode(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;|&#160;/g, ' ');
}
const clean = (s) => decode(stripHtml(s)).replace(/\s+/g, ' ').trim();

export function extractToken(html) {
  return String(html ?? '').match(/var api_token\s*=\s*"([^"]+)"/)?.[1] ?? null;
}

// One card per <a class="jobs-listing-container">.
export function parseList(html) {
  const out = [];
  const re = /<a href="(\/tenders\/([^/"]+)\/(\d+)\/[^"]*)"\s+class="jobs-listing-container"[\s\S]*?<h2 class="jobs-listing-title">([\s\S]*?)<\/h2>[\s\S]*?<p class="jobs-listing-multiple-items[^"]*">([\s\S]*?)<\/p>/g;
  for (const m of String(html ?? '').matchAll(re)) {
    const meta = clean(m[5]).split('•').map((s) => s.trim());
    out.push({
      url: BASE + m[1],
      locationSlug: m[2],
      tenderId: m[3],
      title: clean(m[4]),
      buyer: meta[0] || null,
      location: meta[2] || null,
    });
  }
  return out;
}

// Sidebar items on the detail page: <h4 class="summary-title">X</h4><p class="summary-subtitle">Label</p>
export function parseDetail(html) {
  const s = String(html ?? '');
  const field = (label) => {
    const m = s.match(new RegExp(`<h4 class="summary-title">([^<]*)</h4>\\s*<p class="summary-subtitle">\\s*${label}\\s*</p>`, 'i'));
    return m ? clean(m[1]) : null;
  };
  return {
    title: (() => { const t = s.match(/<h1 class="detail-title">([\s\S]*?)<\/h1>/i)?.[1]; return t ? clean(t) : null; })(),
    expire: field('Expire date'),
    posted: field('Posted date'),
    location: field('Location') ?? s.match(/var tender_location\s*=\s*"([^"]*)"/)?.[1] ?? null,
    company: s.match(/var company_name\s*=\s*"([^"]*)"/)?.[1] ?? null,
  };
}

// "Dec, 12" (or "Dec, 12, 2026" / "Dec 12 2026") → ISO date, year resolved against today.
export function resolveExpire(text, today) {
  const m = String(text ?? '').trim().match(/^([A-Za-z]{3})[a-z]*,?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (!mon || day < 1 || day > 31) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y) => `${y}-${pad(mon)}-${pad(day)}`;
  if (m[3]) return iso(m[3]);
  const year = Number(today.slice(0, 4));
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 31);
  const thisYear = iso(year);
  return thisYear < cutoff.toISOString().slice(0, 10) ? iso(year + 1) : thisYear;
}

// The landing sets `_csrf` several times; like a browser, the last one wins.
export function cookieHeader(setCookies) {
  const jar = new Map();
  for (const c of setCookies ?? []) {
    const pair = c.split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nairobiToday() {
  return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
}

export async function fetchSomaliJobs(today = nairobiToday()) {
  const headers = { 'User-Agent': BROWSER_UA };
  const landing = await fetchRetry(LIST_URL, { headers }, { timeoutMs: 45000 });
  if (!landing.ok) throw new Error(`somalijobs landing HTTP ${landing.status}`);
  const token = extractToken(await landing.text());
  const cookie = cookieHeader(landing.cookies);
  if (!token) throw new Error('somalijobs: no api_token on /tenders (layout changed?)');

  const cards = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    await sleep(PAUSE_MS);
    const body = new URLSearchParams({
      page: String(page), filter_locations: '[]', filter_dateposted: '[]', filter_search: '', sortby: 'newest',
    }).toString();
    const res = await fetchRetry(FETCH_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'CSRF-Token': token,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: LIST_URL,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    }, { timeoutMs: 45000 });
    if (res.status === 203) break; // "Pagination Finished"
    if (!res.ok || res.status === 201) throw new Error(`somalijobs fetch page ${page} HTTP ${res.status}`);
    const html = await res.text();
    const rows = parseList(html);
    if (!rows.length) {
      if (page === 1) throw new Error('somalijobs: page 1 returned no tender cards (layout changed?)');
      break;
    }
    cards.push(...rows);
  }

  const seen = new Set();
  const out = [];
  let parsedDetails = 0;
  for (const c of cards) {
    if (seen.has(c.tenderId)) continue;
    seen.add(c.tenderId);
    if (NON_SOMALI.test(`${c.locationSlug} ${c.location ?? ''}`)) continue;
    await sleep(PAUSE_MS);
    let d;
    try {
      const res = await fetchRetry(c.url, { headers }, { timeoutMs: 45000, retries: 1 });
      if (!res.ok) continue;
      d = parseDetail(await res.text());
    } catch { continue; }
    if (d.expire) parsedDetails++;
    const deadline = resolveExpire(d.expire, today);
    if (!deadline || deadline < today) continue; // open only, real deadline only
    if (NON_SOMALI.test(d.location ?? '')) continue;
    const buyer = d.company || c.buyer || null;
    out.push(enrich({
      id: makeId('somalijobs', c.tenderId),
      source: SOURCE,
      funder: buyer ? buyer.replace(/\b\w/g, (ch) => ch.toUpperCase()) : 'Somali buyer',
      title: (d.title || c.title).slice(0, 300),
      url: c.url,
      summary: `Tender notice posted on SomaliJobs${buyer ? ` by ${buyer}` : ''}${d.location ? ` (${d.location})` : ''}.`,
      countries: ['Somalia'],
      type: 'tender',
      deadline,
      raw: { somalijobs_id: c.tenderId, location: d.location || c.location, expire_text: d.expire, posted_text: d.posted },
    }));
  }
  if (cards.length && !parsedDetails) throw new Error('somalijobs: no Expire date parsed on any detail page (layout changed?)');
  return out;
}
