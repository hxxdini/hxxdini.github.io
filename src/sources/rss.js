import { XMLParser } from 'fast-xml-parser';
import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';
import { isCallPost } from './fundsforngos_verify.js';

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchFeed(url) {
  const res = await fetchRetry(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FundRadar/0.1)' },

  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const xml = await res.text();
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

function rssToRecord(item, { source, funder, defaultType }) {
  const title = stripHtml(String(item.title ?? ''));
  const link = typeof item.link === 'string' ? item.link : item.link?.['#text'] ?? '';
  const desc = stripHtml(String(item.description ?? item['content:encoded'] ?? '')).slice(0, 1200);
  if (!title || !link) return null;

  let type = defaultType;
  const t = `${title} ${desc}`.toLowerCase();
  if (/fellowship|scholarship/.test(t)) type = 'fellowship';
  else if (/\baward\b|\bprize\b|competition|challenge/.test(t)) type = 'prize';
  else if (/tender|request for proposals|\brfp\b|procurement/.test(t)) type = 'tender';
  else if (/grant|call for proposals|funding/.test(t)) type = 'grant';

  let published = null;
  if (item.pubDate) {
    const d = new Date(item.pubDate);
    if (!isNaN(d.getTime())) published = d.toISOString();
  }

  return enrich({
    id: makeId(source, link),
    source, funder,
    title: title.slice(0, 300),
    url: link,
    summary: desc,
    type,
    published_at: published,
    raw: { categories: item.category ?? null },
  });
}

// fundsforNGOs — aggregator; the feed is a teaser, so funder/deadline/official link
// are filled in afterwards from the full article (see fundsforngos_verify.js)
export async function fetchFundsForNgos() {
  // www2 subdomain is stale (returns 1 item); www returns 25+
  // Africa feed items are explicitly Africa-scoped → force ea_relevant on those
  const feeds = [
    { url: 'https://www.fundsforngos.org/feed/', forceEa: false },
    { url: 'https://www.fundsforngos.org/feed/?cat=africa', forceEa: true },
  ];
  const out = [];
  const seen = new Set();
  for (const { url: f, forceEa } of feeds) {
    try {
      const items = await fetchFeed(f);
      for (const item of items) {
        const rec = rssToRecord(item, { source: 'fundsforNGOs', funder: null, defaultType: 'grant' });
        // Sample proposals, writing guides and newsletters share the feed; they aren't calls.
        if (!rec || seen.has(rec.id) || !isCallPost(rec.url)) continue;
        seen.add(rec.id);
        out.push(forceEa ? { ...rec, ea_relevant: 1 } : rec);
      }
    } catch (e) {
      console.error(`  ! feed failed ${f}: ${e.message}`);
    }
  }
  return out;
}

export async function fetchOpportunityDesk() {
  const SOURCE = 'Opportunity Desk';
  const out = [];
  // Both /feed/ (RSS) and /wp-json/ (REST API) return 403 — scrape HTML directly
  const url = 'https://opportunitydesk.org/';
  const res = await fetchRetry(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });
  // Cloudflare 403s cloud/CI IPs. Fail loudly — a silent empty return here made the
  // source look healthy in run summaries while it went 6 days without fresh data.
  if (res.status === 403) throw new Error('blocked (HTTP 403) — Cloudflare rejects this IP; data only refreshes from unblocked runs');
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const html = await res.text();

  // Extract article blocks: each post has an <h2> or <h3> with an <a href> inside, followed by excerpt text
  const articleRe = /<h[23][^>]*>\s*<a\s+href="(https:\/\/opportunitydesk\.org\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const deadlineRe = /Deadline:\s*([A-Za-z]+ \d{1,2},\s*\d{4})/;
  const seen = new Set();
  let match;

  while ((match = articleRe.exec(html)) !== null) {
    const link = match[1];
    const rawTitle = stripHtml(match[2]);
    if (!rawTitle || !link || seen.has(link)) continue;
    seen.add(link);

    // Grab a short window of text after the title for deadline/summary
    const afterTitle = stripHtml(html.slice(match.index, match.index + 800)).slice(0, 600);
    let deadline = null;
    const dlMatch = afterTitle.match(deadlineRe);
    if (dlMatch) {
      const d = new Date(dlMatch[1]);
      if (!isNaN(d.getTime())) deadline = d.toISOString().slice(0, 10);
    }
    const summary = afterTitle.replace(deadlineRe, '').replace(rawTitle, '').trim().slice(0, 400);

    let type = 'fellowship';
    const t = `${rawTitle} ${summary}`.toLowerCase();
    if (/\baward\b|\bprize\b|competition|challenge/.test(t)) type = 'prize';
    else if (/tender|request for proposals|\brfp\b|procurement/.test(t)) type = 'tender';
    else if (/grant|call for proposals|funding/.test(t)) type = 'grant';
    else if (/fellowship|scholarship/.test(t)) type = 'fellowship';

    const rec = enrich({
      id: makeId(SOURCE, link),
      source: SOURCE,
      funder: null,
      title: rawTitle.slice(0, 300),
      url: link,
      summary,
      type,
      deadline,
      published_at: null,
      raw: {},
    });
    if (rec) out.push(rec);
  }
  return out;
}
