// Full-post verification for fundsforNGOs leads.
//
// The RSS feed only carries a teaser, and the post pages sit behind a Cloudflare
// challenge. But both WordPress REST APIs are open:
//   www  post  -> a short teaser that links to the full article on www2
//   www2 post  -> the full article: "Deadline:", "Funding organization:",
//                 "Grant size:" lines, and links to the funder's own call / PDF.
// We read the full article, pull out the deadline, funder, amount and official
// links, and record what we found so the site can say how a lead was checked.
import { fetchRetry } from '../http.js';
import { extractDeadline, detectCountries, classifyApplicant, EA_COUNTRIES } from '../normalize.js';

const WWW = 'https://www.fundsforngos.org';
const WWW2 = 'https://www2.fundsforngos.org';
const BATCH = 40;

// Only /how-to-apply/ posts (and old www2 article URLs) are calls. The rest of the
// feed is sample proposals, writing guides and newsletters.
const NON_CALL_SECTIONS = new Set(['all-proposals', 'how-to-write-a-proposal', 'newsletter', 'cat', 'all-listings']);

export function isCallPost(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const first = u.pathname.split('/').filter(Boolean)[0] ?? '';
  return !NON_CALL_SECTIONS.has(first);
}

function slugOf(url) {
  try { return new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? null; } catch { return null; }
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ndash;|&mdash;/g, '–');
}

// Rendered post HTML -> one logical line per paragraph / list item / heading.
export function postLines(html) {
  const text = decodeEntities(String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|li|h[1-6]|div|tr|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''));
  return text.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const NOT_GIVEN = /not (?:specified|available|stated|mentioned|provided|disclosed)|\bn\/a\b|^tbc|^tba/i;
const ROLLING = /rolling|ongoing|open until|no (?:fixed )?(?:closing )?(?:date|deadline)|continuous|year[- ]round/i;

function labelled(lines, labelRe) {
  const out = [];
  for (const line of lines) {
    const m = line.match(new RegExp(`^(?:[•\\-–*]\\s*)?(?:${labelRe.source})[^:]{0,40}:\\s*(.+)$`, 'i'));
    if (m) out.push(m[1].trim());
  }
  return out;
}

function clean(value, max) {
  const v = value.replace(/\s*\((?:as stated|amount per|typically|not specified)[^)]*\)\s*/gi, ' ').replace(/\s+/g, ' ').trim().replace(/[.;,]$/, '');
  return v.length > max ? `${v.slice(0, max).replace(/\s+\S*$/, '')}…` : v;
}

const MONEY = /(?:[$€£]|\b(?:USD|EUR|GBP|UGX|KES|TZS|RWF|ETB|CAD|AUD|CHF|SEK|NOK|DKK|INR|ZAR|JPY|US)\b)\s?\$?\s?\d|\d[\d,.]*\s?(?:million|billion)\b/i;

const SKIP_HOSTS = /(^|\.)(fundsforngos\.org|facebook\.com|twitter\.com|x\.com|linkedin\.com|whatsapp\.com|t\.me|instagram\.com|pinterest\.com|wa\.me|addtoany\.com)$/i;
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip)$/i;

export function postLinks(html) {
  const links = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try { u = new URL(decodeEntities(m[1])); } catch { continue; }
    if (!['http:', 'https:'].includes(u.protocol) || SKIP_HOSTS.test(u.hostname)) continue;
    for (const key of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/i.test(key)) u.searchParams.delete(key);
    const href = u.href;
    if (seen.has(href)) continue;
    seen.add(href);
    const label = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    links.push({ url: href, label: label.slice(0, 140), doc: DOC_EXT.test(u.pathname) });
  }
  return links;
}

// Parse a full fundsforNGOs article. Pure: takes rendered HTML, returns findings.
export function parsePost(html, today = new Date().toISOString().slice(0, 10)) {
  const lines = postLines(html);

  let deadline = null;
  let status = 'no-deadline';
  for (const value of labelled(lines, /(?:application |submission |proposal |final )?(?:deadline|closing date|applications? close)/)) {
    const date = extractDeadline(`Deadline: ${value}`);
    if (date) { deadline = date; status = 'deadline'; break; }
    if (ROLLING.test(value) && !NOT_GIVEN.test(value.replace(ROLLING, ''))) status = 'rolling';
  }
  if (!deadline && status !== 'rolling') {
    // Unlabelled prose: "Applications close on 12 October 2026."
    const prose = lines.find((l) => /(?:deadline|closes?|close on|submit (?:by|before))/i.test(l) && extractDeadline(l.replace(/.*?(deadline|close[sd]?|by|before)/i, 'Deadline: ')));
    if (prose) {
      deadline = extractDeadline(prose.replace(/.*?(deadline|close[sd]?|by|before)/i, 'Deadline: '));
      if (deadline) status = 'deadline';
    }
  }

  const funderRaw = labelled(lines, /provider|donor|funder|funding (?:organi[sz]ation|agency|body|partner)|grant(?:ing)? (?:organi[sz]ation|body)|grantor|organi[sz]ed by|organi[sz]er|awarding (?:body|organi[sz]ation)/)
    .find((v) => !NOT_GIVEN.test(v));
  const funder = funderRaw ? clean(funderRaw, 140) : null;

  const amountRaw = labelled(lines, /(?:total )?(?:grant|funding|award|prize)(?: size| amount| value)?(?: range)?|amount|budget|award range/)
    .find((v) => MONEY.test(v) && !NOT_GIVEN.test(v));
  const amount = amountRaw ? clean(amountRaw, 90) : null;

  const links = postLinks(html);
  const documents = links.filter((l) => l.doc).slice(0, 5);
  const officialUrl = (links.find((l) => !l.doc) ?? documents[0])?.url ?? null;

  const intro = lines.filter((l) => l.length > 60 && !/^the post .* first appeared on/i.test(l)).slice(0, 3).join(' ');
  return {
    deadline: deadline && deadline >= '2020-01-01' ? deadline : null,
    status,
    funder,
    amount,
    officialUrl,
    documents,
    summary: intro ? intro.slice(0, 1200) : null,
    countries: detectCountries(lines.join(' ')).filter((c) => EA_COUNTRIES.includes(c)),
    today,
  };
}

async function wpPosts(base, slugs) {
  const found = new Map();
  for (let i = 0; i < slugs.length; i += BATCH) {
    const chunk = slugs.slice(i, i + BATCH);
    const url = `${base}/wp-json/wp/v2/posts?per_page=100&_fields=slug,link,content&slug=${chunk.join(',')}`;
    const res = await fetchRetry(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${base} REST API HTTP ${res.status}`);
    let posts;
    try { posts = await res.json(); } catch { throw new Error(`${base} REST API returned non-JSON (blocked?)`); }
    if (!Array.isArray(posts)) throw new Error(`${base} REST API returned unexpected payload`);
    for (const post of posts) found.set(post.slug, post);
  }
  return found;
}

// The www teaser links to its full article on www2: /<category>/<slug>/ (not /tag/ or /category/).
export function www2Link(teaserHtml) {
  for (const m of String(teaserHtml).matchAll(/href="(https:\/\/www2\.fundsforngos\.org\/[^"]+)"/g)) {
    const parts = new URL(m[1]).pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && !['tag', 'category', 'author'].includes(parts[0])) return m[1];
  }
  return null;
}

// Resolve and parse full articles for a list of lead URLs. Returns Map(url -> findings | null).
export async function fetchFullPosts(urls) {
  const results = new Map();
  const wwwSlugs = [];
  const www2ForUrl = new Map();
  for (const url of urls) {
    const slug = slugOf(url);
    if (!slug) { results.set(url, null); continue; }
    if (url.startsWith(WWW2)) www2ForUrl.set(url, slug);
    else wwwSlugs.push([url, slug]);
  }

  const teasers = wwwSlugs.length ? await wpPosts(WWW, [...new Set(wwwSlugs.map(([, s]) => s))]) : new Map();
  const directContent = new Map();
  for (const [url, slug] of wwwSlugs) {
    const teaser = teasers.get(slug);
    if (!teaser) { results.set(url, null); continue; }
    const full = www2Link(teaser.content?.rendered);
    if (full) www2ForUrl.set(url, slugOf(full));
    else directContent.set(url, teaser.content?.rendered ?? '');
  }

  const articles = www2ForUrl.size ? await wpPosts(WWW2, [...new Set(www2ForUrl.values())]) : new Map();
  for (const [url, slug] of www2ForUrl) {
    const post = articles.get(slug);
    results.set(url, post ? { ...parsePost(post.content?.rendered ?? ''), articleUrl: post.link } : null);
  }
  for (const [url, html] of directContent) results.set(url, { ...parsePost(html), articleUrl: url });
  return results;
}

// Web Radar finds fundsforNGOs posts through Google News, which hides the post URL
// behind a redirect. The headline ("<post title> - fundsforNGOs") is all we get, so
// find the post by title. WordPress search is fuzzy, so only an exact match counts.
const FFN_SUFFIX = /\s+[-–|]\s+fundsforngos\s*$/i;

export function normTitle(title) {
  return decodeEntities(String(title ?? '')).replace(FFN_SUFFIX, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Google News cuts long headlines with "..."; a cut title matches by prefix.
export function titleMatches(leadTitle, postTitle) {
  const cut = /(\.\.\.|…)\s*(?:[-–|]\s+fundsforngos\s*)?$/i.test(String(leadTitle ?? ''));
  const want = normTitle(leadTitle);
  const got = normTitle(postTitle);
  if (!want || !got) return false;
  return cut ? want.length >= 20 && got.startsWith(want) : got === want;
}

async function findPostByTitle(title) {
  const query = normTitle(title);
  if (!query) return null;
  for (const base of [WWW2, WWW]) {
    const url = `${base}/wp-json/wp/v2/posts?per_page=10&_fields=link,title&search=${encodeURIComponent(query)}`;
    const res = await fetchRetry(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${base} REST API HTTP ${res.status}`);
    let posts;
    try { posts = await res.json(); } catch { throw new Error(`${base} REST API returned non-JSON (blocked?)`); }
    const hit = Array.isArray(posts) && posts.find((p) => titleMatches(title, p.title?.rendered));
    if (hit) return hit.link;
  }
  return null;
}

// Fill in Web Radar leads that point at a fundsforNGOs post (deadline, funder,
// amount, official link), the same way as the fundsforNGOs feed's own leads.
// www2 search takes ~10s a query, so check a few per run, newest first. A title that
// didn't match won't match later, so 'not-found' isn't re-checked.
export async function verifyWebRadarFundsForNgos(db, { limit = 15 } = {}) {
  const rows = db.prepare(`
    SELECT id, url, title FROM opportunities
    WHERE source LIKE 'Web Radar%' AND (title LIKE '%fundsforNGOs' OR url LIKE '%fundsforngos.org%')
      AND first_seen >= datetime('now', '-60 days')
      AND (verified_at IS NULL OR (verify_status = 'no-deadline' AND verified_at < datetime('now', '-3 days')))
    ORDER BY first_seen DESC LIMIT ?
  `).all(limit);
  if (!rows.length) return { checked: 0, confirmed: 0, missing: 0 };

  for (const row of rows) {
    row.postUrl = /^https?:\/\/(www2?\.)?fundsforngos\.org\//i.test(row.url ?? '') ? row.url : await findPostByTitle(row.title);
  }
  const calls = rows.filter((row) => row.postUrl && isCallPost(row.postUrl));
  const findings = calls.length ? await fetchFullPosts(calls.map((row) => row.postUrl)) : new Map();
  const result = applyFindings(db, rows, (row) => (row.postUrl ? findings.get(row.postUrl) : null));
  if (result.missing === rows.length && rows.length >= 5) throw new Error(`could not match any of ${rows.length} Web Radar leads to a fundsforNGOs post`);
  return result;
}

// Verify unchecked fundsforNGOs leads in the DB. Re-checks leads that had no
// deadline after 3 days, since fundsforNGOs often updates posts.
export async function verifyFundsForNgos(db, { limit = 120 } = {}) {
  const rows = db.prepare(`
    SELECT id, url, deadline, funder, amount FROM opportunities
    WHERE source = 'fundsforNGOs' AND url IS NOT NULL
      AND first_seen >= datetime('now', '-60 days')
      AND (verified_at IS NULL OR (verify_status IN ('no-deadline', 'not-found') AND verified_at < datetime('now', '-3 days')))
    ORDER BY first_seen DESC LIMIT ?
  `).all(limit).filter((row) => isCallPost(row.url));
  if (!rows.length) return { checked: 0, confirmed: 0 };

  const findings = await fetchFullPosts(rows.map((row) => row.url));
  const result = applyFindings(db, rows, (row) => findings.get(row.url));
  if (result.missing === rows.length) throw new Error(`could not locate any of ${rows.length} full posts via the REST APIs`);
  return result;
}

// Write full-post findings onto their rows. findingFor(row) -> findings | null.
function applyFindings(db, rows, findingFor) {
  const now = new Date().toISOString();
  const update = db.prepare(`
    UPDATE opportunities SET
      deadline = COALESCE(?, deadline), funder = COALESCE(?, funder), amount = COALESCE(?, amount),
      summary = COALESCE(?, summary), official_url = ?, documents = ?, article_url = ?,
      verify_status = ?, verified_at = ?
    WHERE id = ?
  `);
  const markMissing = db.prepare(`UPDATE opportunities SET verify_status = 'not-found', verified_at = ? WHERE id = ?`);
  const addCountries = db.prepare(`SELECT countries FROM opportunities WHERE id = ?`);
  const setCountries = db.prepare(`UPDATE opportunities SET countries = ?, ea_relevant = 1 WHERE id = ?`);
  const reread = db.prepare(`SELECT title, summary, eligibility, countries, type FROM opportunities WHERE id = ?`);
  const reclassify = db.prepare(`UPDATE opportunities SET applicant_type = ?, school_eligible_uganda = ? WHERE id = ?`);

  let confirmed = 0;
  let missing = 0;
  for (const row of rows) {
    const f = findingFor(row);
    if (!f) { missing++; markMissing.run(now, row.id); continue; }
    if (f.status === 'deadline') confirmed++;
    update.run(f.deadline, f.funder, f.amount, f.summary, f.officialUrl,
      JSON.stringify(f.documents), f.articleUrl ?? null, f.status, now, row.id);
    if (f.countries.length) {
      const current = JSON.parse(addCountries.get(row.id).countries ?? '[]');
      const merged = [...new Set([...current, ...f.countries])];
      if (merged.length !== current.length) setCountries.run(JSON.stringify(merged), row.id);
    }
    const c = classifyApplicant(reread.get(row.id));
    reclassify.run(c.applicantType, c.schoolEligibleUganda ? 1 : 0, row.id);
  }
  return { checked: rows.length, confirmed, missing };
}
