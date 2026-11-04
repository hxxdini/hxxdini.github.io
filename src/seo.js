import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { canonicalCountry, detectTenderCategory, tenderCategoryLabel, TENDER_CATEGORIES } from './normalize.js';
import { PICKER_CSS, tenderPickerHtml } from './tender-picker.js';
import { CONTACT, PRICES, channelLink, whatsappLink } from './config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const BASE = 'https://hxxdini.github.io';
const today = new Date().toISOString().slice(0, 10);
const picker = `<style>${PICKER_CSS}</style>${tenderPickerHtml()}`;

// Help-to-win box on lead and tender pages, pointing to the Bid Desk.
function helpBox(row) {
  const kind = row?.type === 'grant' || row?.type === 'fellowship' || row?.type === 'prize' ? 'application' : 'bid';
  const message = row ? `Hello FundRadar, I want help with this ${kind}: ${row.title} ${BASE}/lead/${row.id}.html` : 'Hello FundRadar, I want help with a bid or proposal.';
  return `<aside class="panel"><span class="kicker">FundRadar Bid Desk</span><h2>Want help to win this?</h2><p>We check or prepare your ${kind} documents so you submit a complete, compliant ${kind} on time. Bid check ${escapeHtml(PRICES.bidReview)} · bid preparation ${escapeHtml(PRICES.bidPrep)}.</p><p class="actions"><a class="cta" href="${escapeHtml(whatsappLink(message))}" rel="noopener">WhatsApp ${escapeHtml(CONTACT.phoneDisplay)} ↗</a><a class="cta ghost" href="/bid-desk.html">How the Bid Desk works</a></p></aside>`;
}
const channelBox = `<aside class="panel"><span class="kicker">Free daily alerts</span><h2>Get new tenders on Telegram every morning</h2><p>New tenders and grants across East Africa, posted at 7:30 every day.</p><p class="actions"><a class="cta" href="${channelLink}" rel="noopener">Join @${CONTACT.telegramChannel} ↗</a><a class="cta ghost" href="/alerts.html">Alerts for your business only</a></p></aside>`;
const labels = {
  'NGO': 'NGOs', 'firm/consultancy': 'firms', 'school/institution': 'schools',
  'individual/fellow': 'individuals', 'university staff': 'university staff',
  government: 'government bodies', unknown: 'applicants',
};
const kinds = { grant: 'Grants', tender: 'Tenders', loan: 'Loans', fellowship: 'Fellowships', prize: 'Prizes' };
const singular = { grant: 'Grant', tender: 'Tender', loan: 'Loan', fellowship: 'Fellowship', prize: 'Prize' };

function escapeHtml(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[&<>"']/g, (character) => ({
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
  return canonicalCountry(value);
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

const css = `:root{--ink:#102522;--muted:#65736e;--paper:#f3f5ef;--surface:#fff;--line:#dce4dd;--green:#176c57;--lime:#d5f36b;--serif:Iowan Old Style,"Palatino Linotype",Georgia,serif;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 var(--sans)}a{color:var(--green)}a:focus-visible{outline:3px solid var(--lime);outline-offset:3px}.shell{width:min(100% - 32px,1000px);margin:auto}.mast{background:var(--ink);color:white}.bar{display:flex;justify-content:space-between;align-items:center;gap:20px;min-height:74px;border-bottom:1px solid #ffffff30}.brand{color:white;font-weight:800;letter-spacing:-.04em;text-decoration:none}.mark{display:inline-grid;place-items:center;width:32px;height:32px;margin-right:8px;border-radius:10px;background:var(--lime);color:var(--ink)}.bar a:last-child{color:white;font-size:13px}.hero{padding:44px 0 50px}.eyebrow{color:var(--lime);font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}h1{max-width:850px;margin:12px 0;font:500 clamp(34px,7vw,62px)/1.07 var(--serif);letter-spacing:-.045em;overflow-wrap:anywhere}.hero p{max-width:680px;color:#c4d0c8}main{padding:30px 0 64px}.panel,.card{padding:clamp(18px,4vw,30px);margin-bottom:15px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}h2{margin:0 0 10px;font:600 27px/1.2 var(--serif)}.details{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;margin:0 0 24px}.details dt,.kicker{color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.details dd{margin:4px 0 0;overflow-wrap:anywhere}.cta{display:inline-block;padding:12px 18px;border-radius:9px;background:var(--green);color:white;font-weight:750;text-decoration:none}.cta:hover{background:#10523f}.cta.ghost{background:transparent;color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}.cta.ghost:hover{background:#e7f1ea}.actions{display:flex;flex-wrap:wrap;gap:10px}.docs{padding-left:20px;overflow-wrap:anywhere}.docs li{margin:6px 0}.notice{color:var(--muted);font-size:13px}.list{display:grid;gap:10px}.card{margin:0;padding:18px}.card h2{font:600 20px/1.3 var(--sans);overflow-wrap:anywhere}.card p{margin:6px 0 0;color:var(--muted);font-size:13px}.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.links a{padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:white;text-decoration:none}footer{padding:22px 0;border-top:1px solid var(--line);color:var(--muted);font-size:12px}@media(max-width:600px){.bar{min-height:64px}.hero{padding:34px 0}.details{grid-template-columns:1fr 1fr}.actions .cta{flex:1 1 100%;text-align:center}}`;

function document({ title, description, canonical, body, structured, noindex = false }) {
  const text = escapeHtml(title);
  const descriptionText = escapeHtml(description);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#102522"><title>${text} · FundRadar EA</title><meta name="description" content="${descriptionText}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:title" content="${text} · FundRadar EA"><meta property="og:description" content="${descriptionText}"><meta property="og:url" content="${escapeHtml(canonical)}">${noindex ? '<meta name="robots" content="noindex,follow">' : ''}${structured ? `<script type="application/ld+json">${structured}</script>` : ''}<style>${css}</style></head><body><header class="mast"><div class="shell bar"><a class="brand" href="/index.html"><span class="mark">F</span>FundRadar EA</a><a href="/for-you.html">Find calls for you ↗</a></div><div class="shell hero">${body.hero}</div></header><main class="shell">${body.main}</main><footer><div class="shell">FundRadar is a discovery guide. Verify deadlines, terms and eligibility with the original source. <a href="/index.html">Full feed</a> · <a href="/funding/index.html">Browse by country and audience</a> · <a href="/tenders/index.html">Tenders by category</a> · <a href="/bid-desk.html">Bid Desk</a> · <a href="/alerts.html">Alerts</a></div></footer></body></html>\n`;
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
  const countries = [...new Set(JSON.parse(row.countries ?? '[]').map(countryName).filter(Boolean))];
  const applicant = labels[row.applicant_type] ?? 'applicants';
  const source = safeUrl(row.url);
  const official = safeUrl(row.official_url);
  const documents = JSON.parse(row.documents ?? '[]').filter((doc) => safeUrl(doc.url));
  const kind = kinds[row.type] ?? 'Opportunities';
  const details = [
    ['Type', singular[row.type] ?? 'Opportunity'], ['Funder', row.funder || 'Not specified'],
    ['Deadline', row.verify_status === 'rolling' && !row.deadline ? 'Rolling / no fixed closing date'
      : row.deadline ? `${row.deadline}${row.verify_status === 'deadline' ? ' (confirmed in full call text)' : ''}` : 'Not listed by source'],
    ...(row.amount ? [['Amount', row.amount]] : []),
    ['Who can apply', row.applicant_type === 'unknown' ? 'Not confirmed' : `${applicant} (automated tag; check source)`],
    ['Countries', countries.join(', ') || 'Regional / not specified'],
  ];
  const main = `<article class="panel"><dl class="details">${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><h2>About this opportunity</h2><p>${escapeHtml(description)}</p>${eligibility.length ? `<p class="notice">Eligibility labels: ${escapeHtml(eligibility.join(', '))}. Confirm with the source.</p>` : ''}${documents.length ? `<h2>Call documents</h2><ul class="docs">${documents.map((doc) => `<li><a href="${escapeHtml(safeUrl(doc.url))}" rel="noopener noreferrer">${escapeHtml(doc.label || 'Document')}</a></li>`).join('')}</ul>` : ''}<p class="actions">${official ? `<a class="cta" href="${escapeHtml(official)}" rel="noopener noreferrer">Official call ↗</a>` : ''}${source ? `<a class="${official ? 'cta ghost' : 'cta'}" href="${escapeHtml(source)}" rel="noopener noreferrer">View source listing ↗</a>` : ''}</p>${!official && !source ? '<p class="notice">Source link unavailable; verify before applying.</p>' : ''}${row.verified_at ? `<p class="notice">Checked ${escapeHtml(row.verified_at.slice(0, 10))}: FundRadar read the full call text${official ? ' and found the funder\'s own page' : ''}. Still confirm details with the funder before applying.</p>` : ''}<p class="notice">Source: ${escapeHtml(row.source)}. FundRadar links to the source listing; it does not accept applications.</p></article>${helpBox(row)}`;
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
    main: `<section aria-label="Current listings"><h2>${rows.length} current ${rows.length === 1 ? 'listing' : 'listings'}</h2><p class="notice">Applicant labels are automated discovery hints, not eligibility guarantees. Confirm details at the original source.</p><div class="list">${cards}</div></section><div style="margin-top:15px">${channelBox}${helpBox(null)}</div>`,
  } }));
  return relative;
}

const db = openDb();
const rows = db.prepare(`SELECT id, title, url, summary, funder, source, type, deadline, countries, eligibility, applicant_type,
    amount, official_url, documents, verify_status, verified_at
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
  main: `${picker}<section class="panel"><h2>Countries</h2><div class="links">${directory}</div><p class="notice">Country and audience pages reflect only currently tagged leads. Eligibility must be verified with the publisher.</p></section>`,
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
// Tender category pages: "Construction tenders in Uganda" etc. These match
// what suppliers actually search for.
const tenderGroups = new Map();
const tenderCategoryTotals = new Map();
for (const row of rows) {
  if (row.type !== 'tender') continue;
  const category = detectTenderCategory(row.title, row.summary);
  tenderCategoryTotals.set(category, (tenderCategoryTotals.get(category) ?? 0) + 1);
  for (const country of new Set(JSON.parse(row.countries ?? '[]').map(countryName))) {
    if (!country || country === 'Africa') continue;
    const key = `${category}|${country}`;
    if (!tenderGroups.has(key)) tenderGroups.set(key, []);
    tenderGroups.get(key).push(row);
  }
}
const tenderPaths = [];
const tenderLinks = new Map();
const pickerData = { generatedAt: new Date().toISOString(), countries: {} };
for (const [key, group] of [...tenderGroups].sort((a, b) => a[0].localeCompare(b[0]))) {
  const [category, country] = key.split('|');
  const label = tenderCategoryLabel(category);
  const relative = `tenders/${slug(category)}-${slug(country)}.html`;
  tenderPaths.push(landingPage(relative, `${label} tenders in ${country}`, group,
    `Open ${label.toLowerCase()} tenders in ${country}, collected from official procurement portals and agencies and refreshed every four hours. Categories are assigned automatically from the tender title; always read the full notice.`));
  if (!tenderLinks.has(country)) tenderLinks.set(country, []);
  tenderLinks.get(country).push(`<a href="/${relative}">${escapeHtml(label)} (${group.length})</a>`);
  (pickerData.countries[country] ??= []).push({ key: category, label, count: group.length, url: `/${relative}` });
}
for (const list of Object.values(pickerData.countries)) list.sort((a, b) => (a.key === 'other') - (b.key === 'other') || b.count - a.count);
write('tenders/pages.json', `${JSON.stringify(pickerData)}\n`);
const tenderDirectory = [...tenderLinks.keys()].sort().map((country) => `<section class="panel"><h2>${escapeHtml(country)}</h2><div class="links">${tenderLinks.get(country).join('')}</div></section>`).join('');
write('tenders/index.html', document({ title: 'Open tenders in East Africa by category', description: 'Browse open government, UN and donor tenders in East Africa by category and country: construction, ICT, medical, supplies, consultancy and more.', canonical: `${BASE}/tenders/index.html`, body: {
  hero: '<span class="eyebrow">Tenders · East Africa</span><h1>Find tenders in your line of business.</h1><p>Open tenders from official procurement portals and agencies across East Africa, grouped by what they buy.</p>',
  main: `${picker}${tenderDirectory}<p class="notice">Categories: ${TENDER_CATEGORIES.map(([k, l]) => `${escapeHtml(l)} (${tenderCategoryTotals.get(k) ?? 0})`).join(' · ')}. Automated from tender titles; check each notice.</p>`,
} }));
tenderPaths.push('tenders/index.html');
const currentTenders = new Set(tenderPaths.map((relative) => path.basename(relative)));
for (const file of fs.readdirSync(path.join(DOCS, 'tenders')).filter((name) => name.endsWith('.html'))) {
  if (currentTenders.has(file)) continue;
  const relative = `tenders/${file}`;
  write(relative, document({ title: 'No open tenders here right now', description: 'This FundRadar tender category has no open listings.', canonical: `${BASE}/${relative}`, noindex: true,
    body: { hero: '<span class="eyebrow">Category update</span><h1>No open tenders here right now.</h1>', main: '<div class="panel"><p>These tenders have closed. Browse other categories for open tenders.</p><a class="cta" href="/tenders/index.html">Browse open tenders ↗</a></div>' },
  }));
}


// Paid services. Contact and prices live in src/config.js.
const steps = (items) => `<ol class="docs">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
const waBid = whatsappLink('Hello FundRadar Bid Desk, I want help with a tender/grant. Link: ');
write('bid-desk.html', document({ title: 'Bid Desk: help writing tenders and grant proposals', description: `FundRadar Bid Desk checks and prepares tender bids and grant proposals for businesses, schools and NGOs in Uganda and East Africa. WhatsApp ${CONTACT.phoneDisplay}.`, canonical: `${BASE}/bid-desk.html`, body: {
  hero: `<span class="eyebrow">FundRadar Bid Desk</span><h1>Found a tender or grant? Let us help you win it.</h1><p>Many bids are rejected for a missing form, a wrong format or a late submission, not for price. We make sure yours is complete, compliant and on time.</p><p class="actions"><a class="cta" style="background:#d5f36b;color:#102522" href="${escapeHtml(waBid)}" rel="noopener">WhatsApp ${escapeHtml(CONTACT.phoneDisplay)} ↗</a></p>`,
  main: `<section class="list">
<article class="card"><span class="kicker">${escapeHtml(PRICES.bidReview)}</span><h2>Bid check</h2><p>You prepare the bid; we review every document against the tender's requirements and evaluation criteria, and send a list of fixes within 48 hours.</p></article>
<article class="card"><span class="kicker">${escapeHtml(PRICES.bidPrep)}</span><h2>Bid preparation</h2><p>We prepare the bid with you: compliance checklist, completed forms, technical proposal or method statement, work plan and price schedule template. Ideal for construction, supplies, ICT and consultancy tenders.</p></article>
<article class="card"><span class="kicker">${escapeHtml(PRICES.proposal)}</span><h2>Grant proposal</h2><p>For NGOs, CBOs and schools: eligibility check, concept note or full proposal, budget and results framework, written to the funder's template.</p></article>
</section>
<section class="panel" style="margin-top:15px"><h2>How it works</h2>${steps([
  `Send the tender or grant link and a short profile of your business or organisation on WhatsApp (<a href="${escapeHtml(waBid)}">${escapeHtml(CONTACT.phoneDisplay)}</a>) or by email (<a href="mailto:${escapeHtml(CONTACT.email)}">${escapeHtml(CONTACT.email)}</a>).`,
  'We confirm what the call requires, whether you qualify, and send a fixed quote. Larger or complex bids are quoted individually.',
  `Pay by ${escapeHtml(CONTACT.momoDisplay)} to start. We confirm receipt on WhatsApp.`,
  'You receive the drafts with one round of revisions, well before the deadline. You sign and submit.',
])}<p class="notice">Send requests at least 5 working days before the deadline. We help you submit a stronger bid; the buyer decides the award, so no result can be guaranteed. Your documents stay confidential.</p></section>
<section class="panel"><h2>Find a tender first</h2><p>Browse open tenders by country and line of business, or get new ones every morning on Telegram.</p><p class="actions"><a class="cta" href="/tenders/index.html">Open tenders</a><a class="cta ghost" href="${channelLink}" rel="noopener">Join @${CONTACT.telegramChannel} ↗</a></p></section>`,
} }));

const waAlerts = whatsappLink('Hello FundRadar, I want tender alerts. My business: ... Categories: ... Country/district: ...');
write('alerts.html', document({ title: 'Tender alerts for your business', description: 'Free daily East Africa tender alerts on Telegram, or paid alerts matched to your line of business and area.', canonical: `${BASE}/alerts.html`, body: {
  hero: `<span class="eyebrow">FundRadar alerts</span><h1>Never miss a tender in your line of business.</h1><p>Start free on Telegram, or get alerts matched to exactly what you supply.</p>`,
  main: `<section class="list">
<article class="card"><span class="kicker">Free</span><h2>Daily channel</h2><p>Every morning at 7:30: new tenders and grants across East Africa, grouped by country, with links to each notice.</p><p class="actions" style="margin-top:12px"><a class="cta" href="${channelLink}" rel="noopener">Join @${CONTACT.telegramChannel} ↗</a></p></article>
<article class="card"><span class="kicker">${escapeHtml(PRICES.alertsMonthly)} · ${escapeHtml(PRICES.alertsYearly)}</span><h2>Matched alerts</h2><p>Only the tenders that fit you: your categories (e.g. construction, ICT, medical supplies), your countries and districts. Sent the same day they appear, with a reminder 3 days before each deadline.</p><p class="actions" style="margin-top:12px"><a class="cta" href="${escapeHtml(waAlerts)}" rel="noopener">Request on WhatsApp ↗</a></p></article>
</section>
<section class="panel" style="margin-top:15px"><h2>How to sign up for matched alerts</h2>${steps([
  `WhatsApp <a href="${escapeHtml(waAlerts)}">${escapeHtml(CONTACT.phoneDisplay)}</a> with what you supply and where you work.`,
  `Pay by ${escapeHtml(CONTACT.momoDisplay)}. Monthly or yearly.`,
  'Your alerts start the same day.',
])}<p class="notice">Every alert links to the original notice. Always confirm the details and deadline with the buyer.</p></section>`,
} }));
const offerPaths = ['bid-desk.html', 'alerts.html'];

const sitemapPaths = ['index.html', 'for-you.html', ...offerPaths, ...leadPaths, ...landingPaths, ...tenderPaths];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map((relative) => `  <url><loc>${BASE}/${escapeHtml(relative)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`SEO pages: ${leadPaths.length} live leads, ${landingPaths.length} landing pages, ${tenderPaths.length} tender category pages, ${sitemapPaths.length} sitemap URLs`);
