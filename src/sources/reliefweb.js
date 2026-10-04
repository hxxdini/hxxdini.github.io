import { XMLParser } from 'fast-xml-parser';
import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';

// ReliefWeb — humanitarian consultancies in East Africa, read from the public RSS feed.
// The JSON API is no longer usable keyless: v1 was decommissioned (HTTP 410) and v2
// requires a pre-approved appname (403 otherwise). The RSS feed takes the same
// advanced-search filter as the website and needs no key.
//
// Only consultancy jobs are ingested: they are applyable and carry a real closing date.
// Reports (appeals, evaluations, manuals) are not opportunities, and the text date
// extractor turned their titles ("September 2026 Update") into fake deadlines.
//
// advanced-search syntax: (A.B) = A OR B, (X)_(Y) = X AND Y. Codes are ReliefWeb
// term IDs, read from the site's own filter links (TY264 = Consultancy).
const FEED_BASE = 'https://reliefweb.int/jobs/rss.xml';
const EA_COUNTRY_CODES = {
  C240: 'Uganda', C131: 'Kenya', C244: 'Tanzania', C198: 'Rwanda', C47: 'Burundi',
  C8657: 'South Sudan', C87: 'Ethiopia', C216: 'Somalia', C75: 'Democratic Republic of the Congo',
};
export const FEED_URL = `${FEED_BASE}?advanced-search=${encodeURIComponent(`(TY264)_(${Object.keys(EA_COUNTRY_CODES).join('.')})`)}`;

// Descriptions are entity-escaped HTML; long ones trip fast-xml-parser's entity
// expansion limit, so parse with entities off and decode them ourselves.
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });

function decodeEntities(str) {
  return String(str ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

export function parseFeed(xml) {
  const items = parser.parse(xml)?.rss?.channel?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

// Each item description starts with tag divs:
//   <div class="tag country">Country: South Sudan</div>
//   <div class="tag source">Organization: CTG</div>
//   <div class="date closing">Closing date: 11 Oct 2026</div>
function tagText(html, cls) {
  const m = html.match(new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`));
  return m ? stripHtml(m[1]).replace(/^[^:]*:\s*/, '').trim() : null;
}

function isoDate(str) {
  if (!str) return null;
  const d = new Date(`${str} UTC`);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function mapReliefWebJob(item, today) {
  const title = stripHtml(decodeEntities(item?.title)).trim();
  const url = typeof item?.link === 'string' ? decodeEntities(item.link).trim() : '';
  if (!title || !url) return null;

  const html = decodeEntities(item.description);
  const deadline = isoDate(tagText(html, 'date closing'));
  if (deadline && deadline < today) return null;

  const countries = (tagText(html, 'tag country') ?? '').split(/,\s*/).filter(Boolean);
  const org = tagText(html, 'tag source') || null;
  const body = stripHtml(html.replace(/<div class="(?:tag|date)[^"]*">[\s\S]*?<\/div>/g, '')).slice(0, 1200);
  const pub = item.pubDate ? new Date(item.pubDate) : null;

  return enrich({
    id: makeId('ReliefWeb', url),
    source: 'ReliefWeb',
    funder: org,
    title: title.slice(0, 300),
    url,
    summary: body,
    type: 'tender',
    deadline,
    countries,
    published_at: pub && !isNaN(pub.getTime()) ? pub.toISOString() : null,
    raw: { rw_type: 'consultancy' },
  });
}

export async function fetchReliefWeb() {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetchRetry(FEED_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FundRadar/0.1)' } });
  if (!res.ok) throw new Error(`reliefweb rss HTTP ${res.status}`);
  return parseFeed(await res.text()).map((item) => mapReliefWebJob(item, today)).filter(Boolean);
}
