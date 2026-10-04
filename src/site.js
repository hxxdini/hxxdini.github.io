// Generates out/site.html (artifact fragment) and docs/index.html (full document
// for GitHub Pages) — a searchable console of live EA-relevant opportunities.
// Titles render in full (no truncation) — the list is not virtualized, since the
// live population is bounded by open deadlines rather than growing unbounded.
// All per-item text (titles, funders, summaries — scraped, untrusted)
// is rendered client-side through esc(); only literal source names and computed
// numbers/dates are ever interpolated server-side.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10);
const db = openDb();

const rows = db.prepare(`
  SELECT id, title, url, funder, source, type, deadline, countries, sectors, amount, first_seen,
         applicant_type, school_eligible_uganda, official_url, verify_status
  FROM opportunities
  WHERE ea_relevant = 1
    AND (deadline >= ? OR (deadline IS NULL AND first_seen >= datetime('now', '-14 days')))
  ORDER BY (deadline IS NULL), deadline ASC
`).all(today);

const items = rows.map((r) => ({
  id: r.id, t: r.title, u: r.url, f: r.funder ?? '', s: r.source,
  y: r.type === 'grant' ? 'grant' : r.type === 'tender' ? 'tender' : 'fellowship',
  d: r.deadline, c: JSON.parse(r.countries ?? '[]'), k: JSON.parse(r.sectors ?? '[]'),
  a: r.amount, n: r.first_seen.slice(0, 10), p: r.applicant_type ?? 'unknown',
  g: r.school_eligible_uganda === 1,
  o: r.official_url ?? null, v: r.verify_status ?? null,
}));

const nSources = db.prepare('SELECT COUNT(DISTINCT source) c FROM opportunities').get().c;
const nTotal = db.prepare('SELECT COUNT(*) c FROM opportunities').get().c;

// Daily discovery counts, last 14 days — for the sparkline. Full table (not just
// currently-live items), so an item that has since expired still counts on the
// day it was first found.
const dailyRaw = db.prepare(`
  SELECT substr(first_seen, 1, 10) d, COUNT(*) c
  FROM opportunities
  WHERE ea_relevant = 1 AND first_seen >= datetime('now', '-13 days', 'start of day')
  GROUP BY d
`).all();
const dailyMap = new Map(dailyRaw.map((r) => [r.d, r.c]));
const daily = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
  return { date: d, count: dailyMap.get(d) ?? 0 };
});

// Source ledger — names here are literal strings from our own fetcher code
// (e.g. "World Bank Procurement"), never scraped text, so safe to interpolate directly.
const sourceMeta = db.prepare(`
  SELECT source, COUNT(*) total, MAX(last_seen) latest FROM opportunities GROUP BY source ORDER BY total DESC
`).all();

function sparklineSvg(series) {
  const W = 220, H = 44, PAD = 3;
  const max = Math.max(1, ...series.map((d) => d.count));
  const stepX = (W - 2 * PAD) / (series.length - 1);
  const pts = series.map((d, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - (d.count / max) * (H - 2 * PAD),
    ...d,
  }));
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length - 1].x.toFixed(1)},${H - PAD} L${pts[0].x.toFixed(1)},${H - PAD} Z`;
  const last = pts[pts.length - 1];
  const dots = pts.map((p) =>
    `<circle class="spark-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6"><title>${p.date}: ${p.count} discovered</title></circle>`
  ).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Opportunities discovered per day, last 14 days">
    <path class="spark-area" d="${area}"></path>
    <path class="spark-line" d="${line}"></path>
    ${dots}
    <circle class="spark-end" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.5"></circle>
  </svg>`;
}

const json = JSON.stringify(items).replace(/</g, '\\u003c');

const html = `<title>FundRadar EA — Funding &amp; Tender Intelligence</title>
<style>
  /* Same palette, type and masthead as the lead, funding and for-you pages (src/seo.js, docs/for-you.html). */
  :root {
    color-scheme: light;
    --ink: #102522; --muted: #65736e; --paper: #f3f5ef; --surface: #ffffff; --surface2: #f7f9f5;
    --line: #dce4dd; --chip: #eef2ec; --green: #176c57; --green-dark: #10523f; --mint: #dff4e9;
    --lime: #d5f36b; --amber: #a35e18; --amber-soft: #fff4e2; --crit: #b42318; --crit-soft: #fdecea;
    --on-dark: #f8fbf5; --on-dark-muted: #c4d0c8;
    --shadow: 0 12px 34px rgba(16, 37, 34, .07); --shadow-sm: 0 1px 3px rgba(16, 37, 34, .06);
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --serif: Iowan Old Style, "Palatino Linotype", "Book Antiqua", Georgia, serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.5 var(--sans); -webkit-font-smoothing: antialiased; }
  a { color: inherit; }
  button, select, input { font: inherit; }
  [hidden] { display: none !important; }
  .skip-link { position: absolute; top: -60px; left: 16px; z-index: 60; padding: 10px 14px; background: var(--lime); color: var(--ink); border-radius: 8px; }
  .skip-link:focus { top: 12px; }
  .shell { width: min(100% - 32px, 1160px); margin: 0 auto; }
  :focus-visible { outline: 3px solid #9bcf70; outline-offset: 2px; }

  /* ---------- masthead ---------- */
  .masthead { background: var(--ink); color: var(--on-dark); position: relative; overflow: hidden; }
  .masthead::after { position: absolute; right: -90px; bottom: -230px; width: 440px; height: 440px; border: 1px solid rgba(213,243,107,.18); border-radius: 50%;
    box-shadow: 0 0 0 36px rgba(213,243,107,.035), 0 0 0 78px rgba(213,243,107,.025); content: ""; pointer-events: none; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 64px; border-bottom: 1px solid rgba(255,255,255,.18); position: relative; z-index: 1; }
  .brand { display: inline-flex; gap: 10px; align-items: center; color: inherit; font-size: 17px; font-weight: 800; letter-spacing: -.04em; text-decoration: none; }
  .brand-mark { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 10px; background: var(--lime); color: var(--ink); font-size: 14px; font-weight: 900; }
  .brand small { color: #aabeb3; font-size: 10px; letter-spacing: .14em; }
  .top-links { display: flex; gap: 8px; }
  .pill-link { display: inline-flex; align-items: center; min-height: 40px; padding: 8px 13px; border: 1px solid rgba(255,255,255,.22); border-radius: 999px;
    color: var(--on-dark); font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap; }
  .pill-link:hover { background: rgba(255,255,255,.1); }
  .pill-link.primary { background: var(--lime); border-color: var(--lime); color: var(--ink); }
  .pill-link.primary:hover { background: #e2f794; }
  .intro { position: relative; z-index: 1; padding: 34px 0 30px; display: grid; gap: 24px; }
  .eyebrow { display: inline-flex; align-items: center; gap: 8px; margin: 0; color: var(--lime); font-size: 11px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
  .eyebrow::before { width: 7px; height: 7px; border-radius: 50%; background: var(--lime); content: ""; }
  h1 { max-width: 760px; margin: 14px 0 11px; font: 500 clamp(36px, 9vw, 64px)/1.0 var(--serif); letter-spacing: -.05em; }
  h1 em { color: var(--lime); font-weight: 500; }
  .intro-copy { max-width: 580px; margin: 0; color: var(--on-dark-muted); font-size: 16px; }
  .intro-links { display: none; }
  .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .fact { padding: 13px 14px; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; background: rgba(255,255,255,.04); }
  .fact b { display: block; font: 600 26px/1.1 var(--serif); letter-spacing: -.03em; font-variant-numeric: tabular-nums; color: var(--on-dark); }
  .fact.hero-fact b { color: var(--lime); font-size: 34px; }
  .fact span { display: block; margin-top: 3px; color: var(--on-dark-muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .live-dot { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: var(--lime); vertical-align: middle; }
  .spark-fact { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .spark { display: block; width: 100%; max-width: 220px; height: auto; }
  .spark-area { fill: var(--lime); opacity: .14; }
  .spark-line { fill: none; stroke: var(--lime); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
  .spark-dot { fill: var(--lime); opacity: 0; }
  .spark-dot:hover { opacity: .3; }
  .spark-end { fill: var(--lime); stroke: var(--ink); stroke-width: 2; }

  main { padding: 22px 0 56px; }
  .section-kicker { margin: 0 0 4px; color: var(--green); font-size: 10px; font-weight: 850; letter-spacing: .15em; text-transform: uppercase; }
  h2 { margin: 0; font: 600 24px/1.15 var(--serif); letter-spacing: -.03em; }
  .panel { padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-sm); }

  /* ---------- closing-soon rail ---------- */
  .rail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 6px 0 10px; }
  .rail-head .section-kicker { color: var(--crit); }
  .rail { display: flex; gap: 10px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 2px 2px 12px; margin: 0 -2px; scroll-snap-type: x mandatory; scrollbar-width: thin; }
  .rail-card { scroll-snap-align: start; flex: 0 0 min(76vw, 236px); display: flex; flex-direction: column; gap: 6px; padding: 13px 14px; position: relative; overflow: hidden;
    border: 1px solid var(--line); border-radius: 13px; background: var(--surface); text-decoration: none; color: inherit; box-shadow: var(--shadow-sm); }
  .rail-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--crit); }
  .rail-card:hover { border-color: #e4b3ad; }
  .rail-days { font: 600 22px/1 var(--serif); color: var(--crit); font-variant-numeric: tabular-nums; }
  .rail-title { font-size: 13.5px; font-weight: 700; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .rail-meta { font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rail-empty { margin: 0 0 12px; padding: 13px 15px; border: 1px dashed var(--line); border-radius: 12px; color: var(--muted); font-size: 13px; }

  /* ---------- subscribe + brief ---------- */
  .pair { display: grid; gap: 12px; margin: 12px 0 22px; }
  .subscribe-card iframe { width: 100%; max-width: 480px; display: block; margin-top: 6px; }
  .brief p:not(.section-kicker) { margin: 6px 0 0; color: #34463f; font-size: 14px; line-height: 1.6; }

  /* ---------- controls ---------- */
  .controls { position: sticky; top: 0; z-index: 20; display: flex; gap: 8px; align-items: center; padding: 10px 0;
    background: rgba(243,245,239,.92); -webkit-backdrop-filter: saturate(160%) blur(12px); backdrop-filter: saturate(160%) blur(12px); border-bottom: 1px solid var(--line); }
  .search-wrap { flex: 1; min-width: 0; position: relative; display: flex; align-items: center; }
  .search-wrap svg { position: absolute; left: 13px; width: 17px; height: 17px; color: var(--muted); pointer-events: none; }
  input[type=search] { width: 100%; min-height: 46px; padding: 10px 13px 10px 38px; border: 1px solid var(--line); border-radius: 12px;
    background: var(--surface); color: var(--ink); font-size: 16px; -webkit-appearance: none; appearance: none; }
  input[type=search]:focus-visible { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px rgba(23,108,87,.15); }
  .quick { display: flex; gap: 8px; align-items: center; padding: 10px 0 4px; margin-bottom: 14px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .quick::-webkit-scrollbar { display: none; }
  .quick > * { flex-shrink: 0; }
  .tabs { display: flex; gap: 3px; padding: 3px; border-radius: 12px; background: var(--chip); }
  .tabs button { min-height: 38px; padding: 7px 13px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 700; cursor: pointer; }
  .tabs button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-sm); }
  .select-wrap { position: relative; }
  .select-wrap::after { position: absolute; top: 50%; right: 12px; transform: translateY(-58%); color: var(--green); content: "⌄"; font-size: 17px; pointer-events: none; }
  select { min-height: 44px; padding: 8px 34px 8px 12px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); color: var(--ink);
    font-size: 16px; font-weight: 600; cursor: pointer; -webkit-appearance: none; appearance: none; }
  .toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 8px 13px; border: 1px solid var(--line); border-radius: 999px;
    background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .toggle:hover { border-color: #82b39f; }
  .toggle[aria-pressed="true"] { border-color: var(--green); background: var(--mint); color: var(--green-dark); box-shadow: inset 0 0 0 1px var(--green); }
  .filter-btn { flex-shrink: 0; }
  .filter-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px;
    background: var(--green); color: #fff; font: 800 10px var(--mono); }

  /* ---------- board ---------- */
  .board { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
  aside.sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 50; width: min(330px, 88vw); display: flex; flex-direction: column; gap: 14px;
    padding: 18px; overflow-y: auto; background: var(--paper); box-shadow: var(--shadow); transform: translateX(-102%); transition: transform .24s cubic-bezier(.4,0,.2,1); }
  aside.sidebar.open { transform: none; }
  .drawer-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid var(--line);
    color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
  .drawer-close { width: 44px; height: 44px; border: 0; background: none; color: var(--ink); font-size: 28px; line-height: 1; cursor: pointer; }
  .sidebar-backdrop { position: fixed; inset: 0; z-index: 49; background: rgba(16,37,34,.45); opacity: 0; pointer-events: none; transition: opacity .24s ease; }
  .sidebar-backdrop.open { opacity: 1; pointer-events: auto; }
  .panel h3 { margin: 0 0 11px; color: var(--muted); font-size: 10.5px; font-weight: 850; letter-spacing: .13em; text-transform: uppercase; }
  .chips { display: flex; flex-wrap: wrap; gap: 7px; }
  .chips button { min-height: 38px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 650; cursor: pointer; }
  .chips button[aria-pressed="true"] { border-color: var(--green); background: var(--mint); color: var(--green-dark); box-shadow: inset 0 0 0 1px var(--green); }
  .sbar-row { margin-bottom: 8px; border-radius: 8px; }
  .sbar-row:last-child { margin-bottom: 0; }
  .sbar-btn { display: flex; flex-direction: column; gap: 4px; width: 100%; min-height: 40px; padding: 4px 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
  .sbar-label { overflow: hidden; color: var(--muted); font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .sbar-row[aria-pressed="true"] .sbar-label { color: var(--green); }
  .sbar-track { display: flex; align-items: center; gap: 8px; height: 12px; width: 100%; }
  .sbar-fill { height: 8px; min-width: 4px; border-radius: 99px; background: var(--green); opacity: .75; }
  .sbar-row[aria-pressed="true"] .sbar-fill { opacity: 1; box-shadow: 0 0 0 2px var(--mint); }
  .sbar-row[data-other="1"] .sbar-fill { background: var(--muted); opacity: .35; }
  .sbar-row[data-other="1"] { display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
  .sbar-val { flex-shrink: 0; font: 700 11.5px var(--mono); color: var(--ink); }

  main .results { min-width: 0; }
  .count { margin: 0 2px 10px; color: var(--muted); font-size: 13px; }
  .count b { color: var(--ink); }
  .pool { display: grid; gap: 10px; }
  .row { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "when star" "main main"; gap: 6px 10px; padding: 14px 14px 15px;
    border: 1px solid var(--line); border-radius: 13px; background: var(--surface); }
  .row:hover { border-color: #b9d3c6; }
  .row-main { grid-area: main; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
  .row-title-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 8px; }
  .row-title { font-size: 16px; font-weight: 760; line-height: 1.32; text-decoration: none; overflow-wrap: anywhere; }
  .row-title:hover { color: var(--green-dark); text-decoration: underline; text-decoration-color: #9bcdb7; text-underline-offset: 3px; }
  .tag-type { padding: 3px 7px; border-radius: 6px; background: var(--chip); color: #4e6259; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .badge-new { padding: 2px 7px; border-radius: 6px; background: var(--lime); color: var(--ink); font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
  .row-meta { color: var(--muted); font-size: 12.5px; line-height: 1.45; overflow-wrap: anywhere; }
  .row-meta .amt { color: var(--green-dark); font-weight: 750; }
  .row-meta a { color: var(--green-dark); font-weight: 700; text-decoration: none; }
  .row-meta a:hover { text-decoration: underline; }
  .row-when { grid-area: when; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; align-self: center; font-variant-numeric: tabular-nums; }
  .row-when .rleft { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px; background: var(--mint); color: var(--green-dark); font-size: 11.5px; font-weight: 800; }
  .row-when .rleft::before { width: 5px; height: 5px; border-radius: 50%; background: currentColor; content: ""; }
  .row-when .rdate { color: var(--muted); font-size: 12px; font-weight: 600; }
  .row-when .rcheck { color: var(--green); font-size: 11px; font-weight: 800; }
  .row-when.warn .rleft { background: var(--amber-soft); color: var(--amber); }
  .row-when.crit .rleft { background: var(--crit-soft); color: var(--crit); }
  .row-when.none .rleft { background: #f0f2ee; color: #617068; }
  .star { grid-area: star; width: 44px; height: 44px; margin: -10px -8px -10px 0; padding: 0; border: 0; border-radius: 10px; background: none; color: #b3c2ba; font-size: 20px; cursor: pointer; }
  .star:hover { background: var(--chip); }
  .star.active { color: var(--amber); }
  .more-btn { display: block; width: 100%; min-height: 48px; margin-top: 12px; border: 1px solid var(--green); border-radius: 12px;
    background: var(--surface); color: var(--green-dark); font-size: 15px; font-weight: 750; cursor: pointer; }
  .more-btn:hover { background: var(--mint); }
  .empty { margin: 0; padding: 40px 18px; border: 1px dashed var(--line); border-radius: 13px; color: var(--muted); text-align: center; }

  /* ---------- footer ---------- */
  footer { margin-top: 36px; padding: 20px 0 30px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12.5px; }
  footer a { color: var(--green-dark); font-weight: 700; text-decoration: none; }
  .ledger summary { cursor: pointer; padding: 10px 0; color: var(--ink); font-weight: 750; }
  .ledger-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; margin: 6px 0 18px; }
  .ledger-row { display: flex; justify-content: space-between; gap: 10px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 12px; }
  .lg-name { color: var(--ink); font-weight: 650; }
  .lg-meta { text-align: right; font-variant-numeric: tabular-nums; }
  .fine { max-width: 76ch; line-height: 1.6; }
  .fine b { color: var(--ink); }

  /* ---------- tablet / desktop ---------- */
  @media (min-width: 620px) {
    .shell { width: min(100% - 48px, 1160px); }
    .topbar { min-height: 74px; }
    .intro { padding: 50px 0 46px; }
    .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .pair { grid-template-columns: 1fr 1fr; }
    .panel { padding: 18px 20px; }
    .row { grid-template-columns: auto 1fr auto; grid-template-areas: "star main when"; align-items: start; padding: 15px 16px; }
    .star { margin: -8px 0 0 -8px; }
    .row-when { flex-direction: column; align-items: flex-end; align-self: start; text-align: right; }
  }
  @media (min-width: 960px) {
    .intro { grid-template-columns: 1.35fr 1fr; align-items: end; }
    .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .controls { flex-wrap: nowrap; }
    .quick { flex-wrap: wrap; overflow: visible; }
    .board { grid-template-columns: 250px 1fr; gap: 24px; }
    aside.sidebar { position: sticky; top: 80px; z-index: auto; width: auto; padding: 0; overflow: visible; background: none; box-shadow: none; transform: none; transition: none; }
    .drawer-head, .sidebar-backdrop, .filter-btn { display: none; }
  }
  @media (max-width: 380px) {
    .top-links .pill-link:not(.primary) { display: none; }
    .fact b { font-size: 22px; }
    .fact.hero-fact b { font-size: 30px; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .live-dot { animation: pulse 1.8s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation: none !important; }
  }
</style>
<a class="skip-link" href="#results">Skip to opportunities</a>
<header class="masthead">
  <div class="shell topbar">
    <a class="brand" href="./index.html" aria-label="FundRadar EA home"><span class="brand-mark" aria-hidden="true">F</span><span>FundRadar <small>EA</small></span></a>
    <nav class="top-links" aria-label="Site">
      <a class="pill-link" href="./funding/index.html">By country</a>
      <a class="pill-link primary" href="./for-you.html">For you <span aria-hidden="true">↗</span></a>
    </nav>
  </div>
  <div class="shell intro">
    <div>
      <span class="eyebrow">East Africa · live funding feed</span>
      <h1>Every open grant &amp; tender, <em>in one place.</em></h1>
      <p class="intro-copy">Government e-procurement portals, multilateral tender systems and funder sites, checked several times a day. Every deadline links back to its source.</p>
    </div>
    <div class="facts">
      <div class="fact hero-fact"><b id="statLive">${items.length}</b><span>Live opportunities</span></div>
      <div class="fact"><b>${nSources}</b><span>Sources watched</span></div>
      <div class="fact"><b>${nTotal.toLocaleString()}</b><span>Ever tracked</span></div>
      <div class="fact"><b><span class="live-dot"></span>${today}</b><span>Last swept</span></div>
      <div class="fact spark-fact"><span>New finds · 14 days</span>${sparklineSvg(daily)}</div>
    </div>
  </div>
</header>

<main class="shell" id="main">
  <div class="rail-head">
    <p class="section-kicker">Closing within 7 days</p>
  </div>
  <div class="rail" id="rail"></div>

  <div class="pair">
    <section class="panel brief">
      <p class="section-kicker">Situation brief</p>
      <h2>The money moved. We track where.</h2>
      <p>With USAID gone and several European donors cutting budgets, what remains is scattered across portals nobody has time to check. We check them every day, and every listing links to its primary source.</p>
    </section>
    <section class="panel subscribe-card">
      <p class="section-kicker">Weekly digest</p>
      <h2>Get new calls by email</h2>
      <iframe src="https://fundradar.substack.com/embed?transparent=1" title="Subscribe to the FundRadar weekly digest" height="150" style="border:0; background:transparent;" frameborder="0" scrolling="no" loading="lazy"></iframe>
    </section>
  </div>

  <div class="controls" id="results">
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
      <input type="search" id="q" placeholder="Search title, funder, sector…" aria-label="Search opportunities" enterkeyhint="search">
    </div>
    <button class="toggle filter-btn" id="filterBtn" aria-expanded="false" aria-controls="sidebar"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="10" y1="17" x2="14" y2="17"></line></svg> Filters<span class="filter-badge" id="filterBadge" hidden></span></button>
  </div>
  <div class="quick" role="group" aria-label="Quick filters">
    <div class="tabs" role="group" aria-label="Filter by type">
      <button data-type="all" aria-pressed="true">All</button>
      <button data-type="grant" aria-pressed="false">Grants</button>
      <button data-type="tender" aria-pressed="false">Tenders</button>
      <button data-type="fellowship" aria-pressed="false">Fellowships</button>
    </div>
    <div class="select-wrap">
      <select id="sort" aria-label="Sort order">
        <option value="deadline_asc">Closing soonest</option>
        <option value="deadline_desc">Closing latest</option>
        <option value="new_desc">Newest found</option>
      </select>
    </div>
    <button class="toggle" id="newToggle" aria-pressed="false">New (<span id="newCount">0</span>)</button>
    <button class="toggle" id="schoolToggle" aria-pressed="false" aria-label="Filter for schools eligible in Uganda">Uganda schools (<span id="schoolCount">0</span>)</button>
    <button class="toggle" id="shortlistToggle" aria-pressed="false">&#9734; Saved (<span id="shortlistCount">0</span>)</button>
  </div>

  <div class="board">
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    <aside class="sidebar" id="sidebar" aria-label="Filters">
      <div class="drawer-head"><span>Filters</span><button class="drawer-close" id="drawerClose" aria-label="Close filters">&times;</button></div>
      <div class="panel">
        <h3>Country</h3>
        <div class="chips" id="countryChips"></div>
      </div>
      <div class="panel">
        <h3>Sector (live)</h3>
        <div id="sectorChart"></div>
      </div>
    </aside>
    <div class="results">
      <p class="count" id="count" aria-live="polite"></p>
      <div class="viewport" id="viewport">
        <div class="pool" id="pool" role="list" aria-label="Opportunities"></div>
      </div>
      <button class="more-btn" id="moreBtn" type="button" hidden>Show more</button>
    </div>
  </div>
</main>

<footer>
  <div class="shell">
    <details class="ledger">
      <summary>Source ledger: ${sourceMeta.length} sources, last confirmed check</summary>
      <div class="ledger-grid">
        ${sourceMeta.map((s) => `<div class="ledger-row"><span class="lg-name">${s.source}</span><span class="lg-meta">${s.total} tracked · ${s.latest.slice(0, 16).replace('T', ' ')}</span></div>`).join('')}
      </div>
    </details>
    <p class="fine">FundRadar monitors government e-procurement portals, multilateral tender systems and web-wide
    discovery feeds daily. Sector and eligibility tags are automated; deadlines come from structured source data or the full
    call text where available. <b>Always verify against the linked source before applying.</b>
    <a href="./for-you.html">Find calls for you</a> · <a href="./funding/index.html">Browse by country and audience</a></p>
  </div>
</footer>
<script>var BUILD_DATE = "${today}";</script>
<script type="application/json" id="data">${json}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById('data').textContent);
  var q = document.getElementById('q');
  var sortSel = document.getElementById('sort');
  var newBtn = document.getElementById('newToggle');
  var newCountEl = document.getElementById('newCount');
  var schoolBtn = document.getElementById('schoolToggle');
  var schoolCountEl = document.getElementById('schoolCount');
  var shortlistBtn = document.getElementById('shortlistToggle');
  var shortlistCountEl = document.getElementById('shortlistCount');
  var countryChipsEl = document.getElementById('countryChips');
  var sectorChartEl = document.getElementById('sectorChart');
  var countEl = document.getElementById('count');
  var railEl = document.getElementById('rail');
  var viewport = document.getElementById('viewport');
  var pool = document.getElementById('pool');
  var filterBtn = document.getElementById('filterBtn');
  var filterBadge = document.getElementById('filterBadge');
  var sidebar = document.getElementById('sidebar');
  var sidebarBackdrop = document.getElementById('sidebarBackdrop');
  var drawerClose = document.getElementById('drawerClose');

  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  var state = { type: 'all', country: 'all', sector: 'all', query: '', sort: 'deadline_asc', shortlistOnly: false, newOnly: false, schoolOnly: false };
  newCountEl.textContent = DATA.filter(function (o) { return o.n === BUILD_DATE; }).length;
  schoolCountEl.textContent = DATA.filter(function (o) { return o.g; }).length;
  var current = [];

  // ---------- shortlist (localStorage) ----------
  var shortlist;
  try { shortlist = new Set(JSON.parse(localStorage.getItem('fundradar_shortlist') || '[]')); }
  catch (e) { shortlist = new Set(); }
  function saveShortlist() {
    try { localStorage.setItem('fundradar_shortlist', JSON.stringify(Array.from(shortlist))); } catch (e) {}
    shortlistCountEl.textContent = shortlist.size;
  }
  saveShortlist();

  // ---------- filters drawer (mobile) ----------
  function isMobile() { return window.matchMedia('(max-width: 959px)').matches; }
  function openDrawer() {
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('open');
    filterBtn.setAttribute('aria-expanded', 'true');
    drawerClose.focus();
  }
  function closeDrawer() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('open');
    filterBtn.setAttribute('aria-expanded', 'false');
  }
  filterBtn.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  sidebarBackdrop.addEventListener('click', closeDrawer);
  function updateFilterBadge() {
    var n = (state.country !== 'all' ? 1 : 0) + (state.sector !== 'all' ? 1 : 0) + (state.schoolOnly ? 1 : 0);
    if (n) { filterBadge.textContent = n; filterBadge.hidden = false; }
    else { filterBadge.hidden = true; }
  }

  // ---------- date math ----------
  var TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  function daysLeft(d) { return Math.round((new Date(d + 'T00:00:00') - TODAY) / 86400000); }

  // ---------- facets (country / sector), computed once from the live dataset ----------
  var countryCounts = {};
  DATA.forEach(function (o) { o.c.forEach(function (c) { var n = c.split(',')[0]; countryCounts[n] = (countryCounts[n] || 0) + 1; }); });
  var countryEntries = Object.entries(countryCounts).sort(function (a, b) { return b[1] - a[1]; });
  countryChipsEl.innerHTML = '<button data-c="all" aria-pressed="true">All</button>' +
    countryEntries.map(function (e) { return '<button data-c="' + esc(e[0]) + '" aria-pressed="false">' + esc(e[0]) + ' (' + e[1] + ')</button>'; }).join('') +
    '<button data-c="regional" aria-pressed="false">Regional / Global</button>';

  var sectorCounts = {};
  DATA.forEach(function (o) { o.k.forEach(function (k) { sectorCounts[k] = (sectorCounts[k] || 0) + 1; }); });
  var sectorEntries = Object.entries(sectorCounts).sort(function (a, b) { return b[1] - a[1]; });
  var TOP_N = 7;
  var sectorTop = sectorEntries.slice(0, TOP_N);
  var sectorRest = sectorEntries.slice(TOP_N).reduce(function (s, e) { return s + e[1]; }, 0);
  var maxSector = Math.max(1, sectorTop.length ? sectorTop[0][1] : 1, sectorRest);
  var sectorHtml = sectorTop.map(function (e) {
    var pct = Math.max(6, Math.round((e[1] / maxSector) * 100));
    return '<div class="sbar-row" data-sector="' + esc(e[0]) + '" aria-pressed="false">' +
      '<button class="sbar-btn" type="button">' +
      '<span class="sbar-label">' + esc(e[0]) + '</span>' +
      '<span class="sbar-track"><span class="sbar-fill" style="width:' + pct + '%"></span><span class="sbar-val">' + e[1] + '</span></span>' +
      '</button></div>';
  }).join('');
  if (sectorRest > 0) {
    var pctO = Math.max(6, Math.round((sectorRest / maxSector) * 100));
    sectorHtml += '<div class="sbar-row" data-other="1"><span class="sbar-label">Other</span>' +
      '<span class="sbar-track"><span class="sbar-fill" style="width:' + pctO + '%"></span><span class="sbar-val">' + sectorRest + '</span></span></div>';
  }
  sectorChartEl.innerHTML = sectorHtml;

  // ---------- closing-soon rail (static, computed once) ----------
  var closing = DATA.filter(function (o) { return o.d && daysLeft(o.d) >= 0 && daysLeft(o.d) <= 7; })
    .sort(function (a, b) { return daysLeft(a.d) - daysLeft(b.d); }).slice(0, 14);
  if (closing.length) {
    railEl.innerHTML = closing.map(function (o) {
      var dl = daysLeft(o.d);
      return '<a class="rail-card" href="./lead/' + encodeURIComponent(o.id) + '.html">' +
        '<span class="rail-days">' + (dl === 0 ? 'Today' : dl === 1 ? '1 day' : dl + ' days') + '</span>' +
        '<span class="rail-title">' + esc(o.t) + '</span>' +
        '<span class="rail-meta">' + esc(o.f || o.s) + '</span></a>';
    }).join('');
  } else {
    var soonest = DATA.filter(function (o) { return o.d; }).sort(function (a, b) { return daysLeft(a.d) - daysLeft(b.d); })[0];
    railEl.outerHTML = '<p class="rail-empty">Nothing closing within 7 days right now' +
      (soonest ? ' — the nearest deadline is in ' + daysLeft(soonest.d) + ' days.' : '.') + '</p>';
  }

  // ---------- filter + sort ----------
  function matches(o) {
    if (state.type !== 'all' && o.y !== state.type) return false;
    if (state.country === 'regional' && o.c.length > 0) return false;
    if (state.country !== 'all' && state.country !== 'regional' && !o.c.some(function (c) { return c.indexOf(state.country) === 0; })) return false;
    if (state.sector !== 'all' && o.k.indexOf(state.sector) === -1) return false;
    if (state.newOnly && o.n !== BUILD_DATE) return false;
    if (state.schoolOnly && !o.g) return false;
    if (state.shortlistOnly && !shortlist.has(o.id)) return false;
    if (state.query) {
      var hay = (o.t + ' ' + o.f + ' ' + o.s + ' ' + o.k.join(' ') + ' ' + o.c.join(' ') + ' ' + o.p).toLowerCase();
      var words = state.query.toLowerCase().split(/\s+/);
      for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) === -1) return false; }
    }
    return true;
  }
  function sortFn(a, b) {
    if (state.sort === 'new_desc') return a.n < b.n ? 1 : a.n > b.n ? -1 : 0;
    var ad = a.d || '9999', bd = b.d || '9999';
    return state.sort === 'deadline_desc' ? (ad < bd ? 1 : ad > bd ? -1 : 0) : (ad < bd ? -1 : ad > bd ? 1 : 0);
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(d) { var p = d.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function safeHref(u) { return /^https?:[/][/]/i.test(u || '') ? u : null; }

  function rowHtml(o, idx) {
    var when = '<span class="rleft">No date · see source</span>', cls = ' none';
    if (o.d) {
      var dl = daysLeft(o.d);
      cls = dl <= 7 ? ' crit' : dl <= 21 ? ' warn' : '';
      when = '<span class="rleft">' + (dl <= 0 ? 'Closes today' : dl === 1 ? '1 day left' : dl + ' days left') + '</span><span class="rdate">' + fmtDate(o.d) + '</span>' +
        (o.v === 'deadline' ? '<span class="rcheck" title="Deadline confirmed in the full call text">✓ checked</span>' : '');
    } else if (o.v === 'rolling') {
      when = '<span class="rleft">Rolling deadline</span>';
    }
    var meta = [o.f, o.c.map(function (c) { return c.split(',')[0]; }).join(', '), o.k[0], o.p !== 'unknown' ? 'Applicant: ' + o.p : null, o.g ? 'School eligible · Uganda' : null].filter(Boolean).join(' · ');
    var isNew = o.n === BUILD_DATE;
    var starred = shortlist.has(o.id);
    var official = safeHref(o.o), source = safeHref(o.u);
    var links = official
      ? ' · <a href="' + esc(official) + '" target="_blank" rel="noopener noreferrer">Official call ↗</a>'
      : source ? ' · <a href="' + esc(source) + '" target="_blank" rel="noopener noreferrer">Original source ↗</a>' : '';
    return '<article class="row" role="listitem" aria-posinset="' + (idx + 1) + '" aria-setsize="' + current.length + '">' +
      '<button class="star' + (starred ? ' active' : '') + '" data-id="' + esc(o.id) + '" aria-pressed="' + starred + '" aria-label="' + (starred ? 'Remove from saved' : 'Save') + '">' + (starred ? '★' : '☆') + '</button>' +
      '<div class="row-main">' +
        '<div class="row-title-line"><span class="tag-type">' + o.y + '</span>' + (isNew ? '<span class="badge-new">New</span>' : '') + '</div>' +
        '<a class="row-title" href="./lead/' + encodeURIComponent(o.id) + '.html">' + esc(o.t) + '</a>' +
        '<div class="row-meta">' + esc(meta) + (o.a ? ' · <span class="amt">' + esc(o.a) + '</span>' : '') + ' · via ' + esc(o.s) + links + '</div>' +
      '</div>' +
      '<div class="row-when' + cls + '">' + when + '</div>' +
    '</article>';
  }

  function renderList() {
    if (!current.length) {
      pool.innerHTML = state.schoolOnly && !DATA.some(function (o) { return o.g; })
        ? '<p class="empty">No current opportunities are confidently tagged as open to Uganda schools. Check the full call text and revisit after the next pipeline run.</p>'
        : '<p class="empty">Nothing matches — widen the filters.</p>';
      return;
    }
    var html = '';
    var upto = Math.min(shown, current.length);
    for (var i = 0; i < upto; i++) html += rowHtml(current[i], i);
    pool.innerHTML = html;
    moreBtn.hidden = upto >= current.length;
    moreBtn.textContent = 'Show more (' + (current.length - upto) + ' left)';
  }

  // Render in pages: most visitors are on phones, and 800 cards at once is slow on them.
  var PAGE = 40, shown = PAGE;
  var moreBtn = document.getElementById('moreBtn');
  moreBtn.addEventListener('click', function () { shown += PAGE; renderList(); });

  function refilter() {
    shown = PAGE;
    current = DATA.filter(matches).sort(sortFn);
    countEl.innerHTML = '<b>' + current.length + '</b> of ' + DATA.length + ' live opportunities';
    updateFilterBadge();
    viewport.scrollTop = 0;
    renderList();
  }

  // ---------- wiring ----------
  var searchTimer;
  q.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.query = q.value.trim(); refilter(); }, 140);
  });
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.type = b.dataset.type;
      document.querySelectorAll('.tabs button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      refilter();
    });
  });
  sortSel.addEventListener('change', function () { state.sort = sortSel.value; refilter(); });
  newBtn.addEventListener('click', function () {
    state.newOnly = !state.newOnly;
    newBtn.setAttribute('aria-pressed', state.newOnly);
    refilter();
  });
  schoolBtn.addEventListener('click', function () {
    state.schoolOnly = !state.schoolOnly;
    schoolBtn.setAttribute('aria-pressed', state.schoolOnly);
    refilter();
  });
  shortlistBtn.addEventListener('click', function () {
    state.shortlistOnly = !state.shortlistOnly;
    shortlistBtn.setAttribute('aria-pressed', state.shortlistOnly);
    refilter();
  });
  countryChipsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.country = b.dataset.c;
    countryChipsEl.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    refilter();
    if (isMobile()) closeDrawer();
  });
  sectorChartEl.addEventListener('click', function (e) {
    var row = e.target.closest('.sbar-row'); if (!row || row.dataset.other) return;
    var sector = row.dataset.sector;
    var already = row.getAttribute('aria-pressed') === 'true';
    sectorChartEl.querySelectorAll('.sbar-row').forEach(function (r) { r.setAttribute('aria-pressed', 'false'); });
    state.sector = already ? 'all' : sector;
    if (!already) row.setAttribute('aria-pressed', 'true');
    refilter();
    if (isMobile()) closeDrawer();
  });
  pool.addEventListener('click', function (e) {
    var star = e.target.closest('.star'); if (!star) return;
    var id = star.dataset.id;
    if (shortlist.has(id)) shortlist.delete(id); else shortlist.add(id);
    saveShortlist();
    renderList();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) { closeDrawer(); filterBtn.focus(); return; }
    if (e.key !== '/') return;
    var t = document.activeElement, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault(); q.focus();
  });

  refilter();

  // ---------- hero number count-up ----------
  var statLiveEl = document.getElementById('statLive');
  if (statLiveEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var target = parseInt(statLiveEl.textContent, 10) || 0;
    var start = null, dur = 700;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      statLiveEl.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
})();
</script>
`;

fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const outPath = path.join(ROOT, 'out', 'site.html');
fs.writeFileSync(outPath, html);
console.log(`Site written: ${outPath} (${items.length} live items embedded)`);

// Full standalone document for GitHub Pages (the artifact host supplies its own shell)
const styleEnd = html.indexOf('</style>') + '</style>'.length;
const fullDoc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="FundRadar EA — every open grant, tender and opportunity relevant to East African organizations, tracked from primary sources and updated daily.">
<meta name="theme-color" content="#102522">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📡</text></svg>">
${html.slice(0, styleEnd)}
</head>
<body>
${html.slice(styleEnd)}
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'index.html'), fullDoc);
console.log('Pages doc written: docs/index.html');
