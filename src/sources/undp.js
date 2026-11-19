import { XMLParser } from 'fast-xml-parser';
import { makeId, enrich, stripHtml, EA_COUNTRIES } from '../normalize.js';
import { fetchRetry } from '../http.js';

// UNDP procurement notices RSS export. Country names appear in item titles/descriptions.
const FEED = 'https://procurement-notices.undp.org/export_feed.cfm?type=rss';

export async function fetchUndp() {
  const res = await fetchRetry(FEED, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BidRadar/0.1)' },

  });
  if (!res.ok) throw new Error(`undp HTTP ${res.status}`);
  const xml = await res.text();
  const doc = new XMLParser({ ignoreAttributes: false }).parse(xml);
  let items = doc?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];

  const out = [];
  for (const item of items) {
    const title = stripHtml(String(item.title ?? ''));
    const desc = stripHtml(String(item.description ?? ''));
    const link = typeof item.link === 'string' ? item.link : item.link?.['#text'] ?? '';
    const text = `${title} ${desc}`;
    if (!EA_COUNTRIES.some((c) => text.includes(c.split(',')[0]))) continue;

    out.push(enrich({
      id: makeId('undp', link || title),
      source: 'UNDP Procurement',
      funder: 'UNDP',
      title: title.slice(0, 300),
      url: link,
      summary: desc.slice(0, 1200),
      type: 'tender',
      raw: null,
    }));
  }
  return out;
}
