import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const BASE = 'https://hxxdini.github.io';
const today = new Date().toISOString().slice(0, 10);
const labels = {
  'NGO': 'NGOs', 'firm/consultancy': 'firms', 'school/institution': 'schools',
  'individual/fellow': 'individuals', 'university staff': 'university staff',
  government: 'government bodies', unknown: 'applicants',
};
const kinds = { grant: 'Grants', tender: 'Tenders', loan: 'Loans', fellowship: 'Fellowships', prize: 'Prizes' };
const singular = { grant: 'Grant', tender: 'Tender', loan: 'Loan', fellowship: 'Fellowship', prize: 'Prize' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function slug(value) {
  return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function countryName(value) {
  if (/^Congo, (?:The )?Democratic Republic of/i.test(value)) return 'DR Congo';
  return value;
}

function leadPath(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Unsafe lead ID: ${id}`);
  return `lead/${id}.html`;
}

function summary(row) {
  const clean = String(row.summary ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return 'FundRadar has no verified summary for this listing. Check the original source for the full notice and eligibility.';
  if (clean.length <= 350) return clean;
  return `${clean.slice(0, 350).replace(/\s+\S*$/, '')}…`;
}

function jsonLd(row, canonical, description) {
  const type = row.type === 'grant' ? 'MonetaryGrant' : row.type === 'loan' ? 'LoanOrCredit' : 'CreativeWork';
  const data = {
    '@context': 'https://schema.org', '@type': type, name: row.title,
    description, url: canonical,
    ...(row.funder ? { funder: { '@type': 'Organization', name: row.funder } } : {}),
    ...(safeUrl(row.url) ? { sameAs: safeUrl(row.url) } : {}),
  };
  if (type === 'CreativeWork') delete data.funder;
  if (type === 'CreativeWork' && row.funder) data.publisher = { '@type': 'Organization', name: row.funder };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const css = `:root{--ink:#102522;--muted:#65736e;--paper:#f3f5ef;--surface:#fff;--line:#dce4dd;--green:#176c57;--lime:#d5f36b;--serif:Iowan Old Style,"Palatino Linotype",Georgia,serif;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 var(--sans)}a{color:var(--green)}a:focus-visible{outline:3px solid var(--lime);outline-offset:3px}.shell{width:min(100% - 32px,1000px);margin:auto}.mast{background:var(--ink);color:white}.bar{display:flex;justify-content:space-between;align-items:center;gap:20px;min-height:74px;border-bottom:1px solid #ffffff30}.brand{color:white;font-weight:800;letter-spacing:-.04em;text-decoration:none}.mark{display:inline-grid;place-items:center;width:32px;height:32px;margin-right:8px;border-radius:10px;background:var(--lime);color:var(--ink)}.bar a:last-child{color:white;font-size:13px}.hero{padding:44px 0 50px}.eyebrow{color:var(--lime);font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}h1{max-width:850px;margin:12px 0;font:500 clamp(34px,7vw,62px)/1.07 var(--serif);letter-spacing:-.045em;overflow-wrap:anywhere}.hero p{max-width:680px;color:#c4d0c8}main{padding:30px 0 64px}.panel,.card{padding:clamp(18px,4vw,30px);margin-bottom:15px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}h2{margin:0 0 10px;font:600 27px/1.2 var(--serif)}.details{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;margin:0 0 24px}.details dt,.kicker{color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.details dd{margin:4px 0 0;overflow-wrap:anywhere}.cta{display:inline-block;padding:12px 18px;border-radius:9px;background:var(--green);color:white;font-weight:750;text-decoration:none}.cta:hover{background:#10523f}.notice{color:var(--muted);font-size:13px}.list{display:grid;gap:10px}.card{margin:0;padding:18px}.card h2{font:600 20px/1.3 var(--sans);overflow-wrap:anywhere}.card p{margin:6px 0 0;color:var(--muted);font-size:13px}.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.links a{padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:white;text-decoration:none}footer{padding:22px 0;border-top:1px solid var(--line);color:var(--muted);font-size:12px}@media(max-width:600px){.bar{min-height:64px}.hero{padding:34px 0}.details{grid-template-columns:1fr 1fr}}`;

function document({ title, description, canonical, body, structured, noindex = false }) {
  const text = escapeHtml(title);
  const descriptionText = escapeHtml(description);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#102522"><title>${text} · FundRadar EA</title><meta name="description" content="${descriptionText}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:title" content="${text} · FundRadar EA"><meta property="og:description" content="${descriptionText}"><meta property="og:url" content="${escapeHtml(canonical)}">${noindex ? '<meta name="robots" content="noindex,follow">' : ''}${structured ? `<script type="application/ld+json">${structured}</script>` : ''}<style>${css}</style></head><body><header class="mast"><div class="shell bar"><a class="brand" href="/index.html"><span class="mark">F</span>FundRadar EA</a><a href="/for-you.html">Find calls for you ↗</a></div><div class="shell hero">${body.hero}</div></header><main class="shell">${body.main}</main><footer><div class="shell">FundRadar is a discovery guide. Verify deadlines, terms and eligibility with the original source. <a href="/index.html">Full feed</a> · <a href="/funding/index.html">Browse by country and audience</a></div></footer></body></html>\n`;
}

function write(relative, content) {
  const output = path.join(DOCS, relative);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, content);
}

function leadPage(row) {
  const relative = leadPath(row.id);
  const canonical = `${BASE}/${relative}`;
  const description = summary(row);
  const eligibility = JSON.parse(row.eligibility ?? '[]');
  const countries = JSON.parse(row.countries ?? '[]').map(countryName);
  const applicant = labels[row.applicant_type] ?? 'applicants';
  const source = safeUrl(row.url);
  const kind = kinds[row.type] ?? 'Opportunities';
  const details = [
    ['Type', singular[row.type] ?? 'Opportunity'], ['Funder', row.funder || 'Not specified'],
    ['Deadline', row.deadline || 'Not listed by source'],
    ['Who can apply', row.applicant_type === 'unknown' ? 'Not confirmed' : `${applicant} (automated tag; check source)`],
    ['Countries', countries.join(', ') || 'Regional / not specified'],
  ];
  const main = `<article class="panel"><dl class="details">${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><h2>About this opportunity</h2><p>${escapeHtml(description)}</p>${eligibility.length ? `<p class="notice">Eligibility labels: ${escapeHtml(eligibility.join(', '))}. Confirm with the source.</p>` : ''}${source ? `<p><a class="cta" href="${escapeHtml(source)}" rel="noopener noreferrer">View source listing ↗</a></p>` : '<p class="notice">Source link unavailable; verify before applying.</p>'}<p class="notice">Source: ${escapeHtml(row.source)}. FundRadar links to the source listing; it does not accept applications.</p></article>`;
  write(relative, document({ title: row.title, description, canonical,
    structured: jsonLd(row, canonical, description), body: {
      hero: `<span class="eyebrow">${escapeHtml(singular[row.type] ?? 'Opportunity')} · ${escapeHtml(row.source)}</span><h1>${escapeHtml(row.title)}</h1><p>${escapeHtml(row.funder || row.source)}</p>`, main,
    },
  }));
  return relative;
}

function landingPage(relative, title, rows, intro) {
  const canonical = `${BASE}/${relative}`;
  const description = `${title}: ${rows.length} current FundRadar listings. Confirm each opportunity with its original source.`;
  const cards = rows.map((row) => `<article class="card"><span class="kicker">${escapeHtml(kinds[row.type] ?? 'Opportunities')} · ${escapeHtml(row.source)}</span><h2><a href="/${leadPath(row.id)}">${escapeHtml(row.title)}</a></h2><p>${escapeHtml(row.funder || 'Funder not specified')} · Deadline: ${escapeHtml(row.deadline || 'not listed')}</p></article>`).join('');
  write(relative, document({ title, description, canonical, body: {
    hero: `<span class="eyebrow">Explore funding · East Africa</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p>`,
    main: `<section aria-label="Current listings"><h2>${rows.length} current ${rows.length === 1 ? 'listing' : 'listings'}</h2><p class="notice">Applicant labels are automated discovery hints, not eligibility guarantees. Confirm details at the original source.</p><div class="list">${cards}</div></section>`,
  } }));
  return relative;
}

const db = openDb();
const rows = db.prepare(`SELECT id, title, url, summary, funder, source, type, deadline, countries, eligibility, applicant_type
  FROM opportunities WHERE ea_relevant = 1
    AND (deadline >= ? OR (deadline IS NULL AND first_seen >= datetime('now', '-14 days')))
  ORDER BY (deadline IS NULL), deadline, title COLLATE NOCASE`).all(today);
db.close();
const live = new Set(rows.map((row) => row.id));
const leadPaths = rows.map(leadPage);
const leadDir = path.join(DOCS, 'lead');
for (const file of fs.readdirSync(leadDir).filter((name) => name.endsWith('.html'))) {
  const id = file.slice(0, -5);
  if (live.has(id)) continue;
  const relative = `lead/${file}`;
  write(relative, document({ title: 'Opportunity no longer current', description: 'This listing is no longer in the current FundRadar feed.', canonical: `${BASE}/${relative}`, noindex: true,
    body: { hero: '<span class="eyebrow">Closed / unverified</span><h1>This opportunity is no longer current.</h1>', main: '<div class="panel"><p>Its deadline passed or it is no longer in our recent feed. Check the original publisher before acting.</p><a class="cta" href="/for-you.html">Find current calls ↗</a></div>' },
  }));
}

const groups = new Map();
const countryGroups = new Map();
for (const row of rows) {
  for (const country of new Set(JSON.parse(row.countries ?? '[]').map(countryName))) {
    if (!country || country === 'Africa') continue;
    if (!countryGroups.has(country)) countryGroups.set(country, []);
    countryGroups.get(country).push(row);
    const key = `${row.type}|${row.applicant_type}|${country}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
}
const landingPaths = [];
for (const [country, group] of countryGroups) {
  landingPaths.push(landingPage(`funding/${slug(country)}.html`, `Funding opportunities in ${country}`, group,
    `Browse current grants, tenders and other calls tagged for ${country}. A country tag is not proof of eligibility; check each publisher's notice.`));
}
for (const [key, group] of groups) {
  const [type, applicant, country] = key.split('|');
  const audience = labels[applicant] ?? 'applicants';
  const kind = kinds[type] ?? 'Opportunities';
  const title = `${kind} for ${audience} in ${country}`;
  landingPaths.push(landingPage(`funding/${slug(type)}-${slug(applicant)}-${slug(country)}.html`, title, group,
    `Current ${kind.toLowerCase()} tagged for ${audience} in ${country}. These automated tags help discovery; the original notice determines actual eligibility.`));
}
const directory = [...countryGroups.keys()].sort().map((country) => `<a href="/funding/${slug(country)}.html">${escapeHtml(country)}</a>`).join('');
write('funding/index.html', document({ title: 'Browse funding by country and audience', description: 'Explore FundRadar funding listings by country and applicant type.', canonical: `${BASE}/funding/index.html`, body: {
  hero: '<span class="eyebrow">Explore funding · East Africa</span><h1>Find a starting point.</h1><p>Browse current calls by country, then follow each lead to its original publisher.</p>',
  main: `<section class="panel"><h2>Countries</h2><div class="links">${directory}</div><p class="notice">Country and audience pages reflect only currently tagged leads. Eligibility must be verified with the publisher.</p></section>`,
} }));
landingPaths.push('funding/index.html');
const currentLandings = new Set(landingPaths.map((relative) => path.basename(relative)));
for (const file of fs.readdirSync(path.join(DOCS, 'funding')).filter((name) => name.endsWith('.html'))) {
  if (currentLandings.has(file)) continue;
  const relative = `funding/${file}`;
  write(relative, document({ title: 'No current listings', description: 'This FundRadar category has no current listings.', canonical: `${BASE}/${relative}`, noindex: true,
    body: { hero: '<span class="eyebrow">Category update</span><h1>No current listings here.</h1>', main: '<div class="panel"><p>These listings are no longer current. Browse other categories for live opportunities.</p><a class="cta" href="/funding/index.html">Browse current categories ↗</a></div>' },
  }));
}
const sitemapPaths = ['index.html', 'for-you.html', ...leadPaths, ...landingPaths];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map((relative) => `  <url><loc>${BASE}/${escapeHtml(relative)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`SEO pages: ${leadPaths.length} live leads, ${landingPaths.length} landing pages, ${sitemapPaths.length} sitemap URLs`);
