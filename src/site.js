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
         applicant_type, school_eligible_uganda
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
  :root {
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Segoe UI Variable", system-ui, "Helvetica Neue", sans-serif;
    --display: var(--sans);
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, monospace;

    --bg: #F5F6FA; --surface: #FFFFFF; --surface2: #F1F3F9; --ink: #0D1220;
    --muted: #59637A; --line: #E5E8F1; --chip: #EDF0F7;
    --signal: #4F46E5; --signal-2: #7C3AED; --signal-ink: #FFFFFF; --signal-soft: rgba(79,70,229,0.10);
    --good: #15A34A; --warn: #D97706; --crit: #E11D48;
    --radius: 16px; --radius-md: 12px; --radius-sm: 9px;
    --shadow-sm: 0 1px 2px rgba(13,18,32,0.05), 0 1px 3px rgba(13,18,32,0.06);
    --shadow-md: 0 4px 14px rgba(13,18,32,0.07), 0 14px 32px rgba(13,18,32,0.08);
    --glass: rgba(245,246,250,0.75);
    --grad: linear-gradient(120deg, var(--signal), var(--signal-2));
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #090B10; --surface: #121620; --surface2: #181D28; --ink: #E8EBF3;
      --muted: #95A2B6; --line: #242B39; --chip: #1A2029;
      --signal: #818CF8; --signal-2: #A78BFA; --signal-ink: #0A0C11; --signal-soft: rgba(129,140,248,0.15);
      --good: #34D399; --warn: #FBBF24; --crit: #FB7185;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.38);
      --shadow-md: 0 6px 20px rgba(0,0,0,0.38), 0 18px 44px rgba(0,0,0,0.46);
      --glass: rgba(9,11,16,0.72);
    }
  }
  :root[data-theme="light"] {
    --bg: #F5F6FA; --surface: #FFFFFF; --surface2: #F1F3F9; --ink: #0D1220;
    --muted: #59637A; --line: #E5E8F1; --chip: #EDF0F7;
    --signal: #4F46E5; --signal-2: #7C3AED; --signal-ink: #FFFFFF; --signal-soft: rgba(79,70,229,0.10);
    --good: #15A34A; --warn: #D97706; --crit: #E11D48;
    --shadow-sm: 0 1px 2px rgba(13,18,32,0.05), 0 1px 3px rgba(13,18,32,0.06);
    --shadow-md: 0 4px 14px rgba(13,18,32,0.07), 0 14px 32px rgba(13,18,32,0.08);
    --glass: rgba(245,246,250,0.75);
  }
  :root[data-theme="dark"] {
    --bg: #090B10; --surface: #121620; --surface2: #181D28; --ink: #E8EBF3;
    --muted: #95A2B6; --line: #242B39; --chip: #1A2029;
    --signal: #818CF8; --signal-2: #A78BFA; --signal-ink: #0A0C11; --signal-soft: rgba(129,140,248,0.15);
    --good: #34D399; --warn: #FBBF24; --crit: #FB7185;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.38);
    --shadow-md: 0 6px 20px rgba(0,0,0,0.38), 0 18px 44px rgba(0,0,0,0.46);
    --glass: rgba(9,11,16,0.72);
  }

  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--ink); font: 15px/1.55 var(--sans); margin: 0;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    background-image: radial-gradient(1100px 480px at 88% -8%, var(--signal-soft), transparent 60%); }
  a { color: inherit; }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 30px 22px 80px; }

  /* ---------- masthead ---------- */
  header.mast { padding-bottom: 22px; margin-bottom: 8px; border-bottom: 1px solid var(--line); }
  .mast-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 11px; }
  .brand::before { content: ""; width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
    background: var(--grad); box-shadow: 0 6px 16px var(--signal-soft), inset 0 1px 0 rgba(255,255,255,0.35);
    -webkit-mask: radial-gradient(circle at 50% 50%, transparent 5px, #000 6px); mask: radial-gradient(circle at 50% 50%, transparent 5px, #000 6px); }
  .wordmark { font-family: var(--display); font-size: 30px; font-weight: 800; letter-spacing: -0.8px; margin: 0; }
  .wordmark .signal-text { background: var(--grad); -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: var(--signal); }
  .tagline { color: var(--muted); font-size: 13.5px; max-width: 52ch; margin: 10px 0 0; line-height: 1.5; }
  .theme-toggle { background: var(--surface); border: 1px solid var(--line); color: var(--ink);
    width: 42px; height: 42px; border-radius: 12px; font-size: 16px; cursor: pointer; flex-shrink: 0;
    box-shadow: var(--shadow-sm); transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease;
    display: flex; align-items: center; justify-content: center; }
  .theme-toggle:hover { border-color: var(--signal); transform: translateY(-1px); box-shadow: var(--shadow-md); }
  .theme-toggle:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

  .mast-bottom { display: flex; align-items: center; gap: 26px; margin-top: 24px; flex-wrap: wrap; }
  .hero { display: flex; flex-direction: column; gap: 0; padding-right: 8px; }
  .hero-num { font: 800 52px/1 var(--display); letter-spacing: -2px; font-variant-numeric: tabular-nums;
    background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .hero-label { font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 6px; font-weight: 600; }
  .stat-strip { display: flex; gap: 12px; }
  .stat { display: flex; flex-direction: column; gap: 3px; background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-md); padding: 12px 16px; box-shadow: var(--shadow-sm); min-width: 96px; }
  .stat b { font: 700 20px var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
  .stat span { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.7px; font-weight: 600; }
  .spark-wrap { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 12px 14px; box-shadow: var(--shadow-sm); }
  .spark-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
  .spark { display: block; }
  .spark-area { fill: var(--signal); opacity: 0.16; }
  .spark-line { fill: none; stroke: var(--signal); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
  .spark-dot { fill: var(--signal); opacity: 0; }
  .spark-dot:hover, .spark-dot:focus { opacity: 0.25; }
  .spark-end { fill: var(--signal); stroke: var(--surface); stroke-width: 2; }

  /* ---------- closing-soon rail ---------- */
  .rail-head { display: flex; align-items: baseline; justify-content: space-between; margin: 24px 0 10px; }
  .eyebrow { font: 700 10.5px var(--sans); text-transform: uppercase; letter-spacing: 1.5px; color: var(--muted); margin: 0; }
  .eyebrow .crit-dot { color: var(--crit); display: inline-block; margin-right: 3px; }
  .rail { display: flex; gap: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 4px 2px 16px; scroll-behavior: smooth; }
  .rail.snap { scroll-snap-type: x proximity; }
  .rail-card { scroll-snap-align: start; flex: 0 0 214px; background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-md); padding: 13px 15px; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 7px;
    box-shadow: var(--shadow-sm); position: relative; overflow: hidden;
    transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .rail-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--crit); opacity: .8; }
  .rail-card:hover { border-color: color-mix(in srgb, var(--crit) 55%, var(--line)); transform: translateY(-4px); box-shadow: var(--shadow-md); }
  .rail-days { font: 800 21px var(--display); color: var(--crit); font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
  .rail-title { font-size: 12.5px; font-weight: 600; line-height: 1.4; }
  .rail-meta { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rail-empty { color: var(--muted); font-size: 13px; padding: 12px 15px; background: var(--surface);
    border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }

  /* ---------- brief ---------- */
  .brief { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--signal); border-radius: var(--radius-md);
    padding: 15px 18px; margin: 20px 0 22px; box-shadow: var(--shadow-sm); }
  .brief .eyebrow { margin-bottom: 7px; }
  .brief p { font-size: 13.5px; margin: 0; max-width: 92ch; line-height: 1.6; }

  /* ---------- subscribe ---------- */
  .subscribe-card { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--signal); border-radius: var(--radius-md);
    padding: 15px 18px 4px; margin: 20px 0 8px; box-shadow: var(--shadow-sm); }
  .subscribe-card .eyebrow { margin-bottom: 4px; }
  .subscribe-card iframe { width: 100%; display: block; }

  /* ---------- controls ---------- */
  .controls { display: flex; gap: 9px; flex-wrap: wrap; align-items: center; position: sticky; top: 0;
    background: var(--glass); -webkit-backdrop-filter: saturate(180%) blur(14px); backdrop-filter: saturate(180%) blur(14px);
    padding: 12px 0; z-index: 20; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
  .search-wrap { flex: 1; min-width: 210px; position: relative; display: flex; align-items: center; }
  .search-wrap svg { position: absolute; left: 13px; width: 17px; height: 17px; color: var(--muted); pointer-events: none; }
  input[type=search] { flex: 1; width: 100%; background: var(--surface); color: var(--ink);
    border: 1px solid var(--line); border-radius: 11px; padding: 11px 13px 11px 38px; font-family: inherit; font-size: 16px;
    box-shadow: var(--shadow-sm); transition: border-color .18s ease, box-shadow .18s ease; }
  input[type=search]:focus-visible { outline: none; border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-soft); }
  select { background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 11px;
    padding: 9px 12px; font: 600 12.5px var(--sans); cursor: pointer; box-shadow: var(--shadow-sm); }
  select:focus-visible { outline: none; border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-soft); }
  .tabs { display: flex; gap: 3px; background: var(--chip); border-radius: 12px; padding: 3px; }
  .tabs button { background: transparent; border: none; color: var(--muted); padding: 8px 14px; border-radius: 9px;
    font: 600 12.5px var(--sans); cursor: pointer; letter-spacing: 0.2px; transition: color .18s ease, background .18s ease; }
  .tabs button:hover { color: var(--ink); }
  .tabs button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-sm); }
  .tabs button:focus-visible, .toggle:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }
  .toggle { background: var(--surface); border: 1px solid var(--line); color: var(--muted); border-radius: 11px;
    padding: 9px 13px; font: 600 12.5px var(--sans); cursor: pointer; box-shadow: var(--shadow-sm);
    transition: color .18s ease, border-color .18s ease, background .18s ease; }
  .toggle:hover { color: var(--ink); border-color: color-mix(in srgb, var(--signal) 40%, var(--line)); }
  .toggle[aria-pressed="true"] { background: var(--signal); color: var(--signal-ink); border-color: var(--signal); }
  .filter-btn { display: none; align-items: center; gap: 7px; }
  .filter-badge { background: var(--grad); color: #FFFFFF; border-radius: 20px; min-width: 17px;
    height: 17px; padding: 0 4px; font: 700 10px var(--mono); display: inline-flex; align-items: center; justify-content: center; }

  /* ---------- board: sidebar + results ---------- */
  .board { display: grid; grid-template-columns: 244px 1fr; gap: 24px; align-items: start; }
  @media (max-width: 860px) { .board { grid-template-columns: 1fr; } }
  aside.sidebar { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 74px; }
  .drawer-head { display: none; }
  .sidebar-backdrop { display: none; }
  @media (max-width: 860px) {
    aside.sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 50; width: min(324px, 86vw);
      background: var(--bg); margin: 0; padding: 18px; gap: 16px; overflow-y: auto;
      transform: translateX(-100%); transition: transform .24s cubic-bezier(.4,0,.2,1); box-shadow: var(--shadow-md); }
    aside.sidebar.open { transform: translateX(0); }
    .drawer-head { display: flex; align-items: center; justify-content: space-between;
      font: 700 12px var(--sans); text-transform: uppercase; letter-spacing: 1.3px; color: var(--muted);
      border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 2px; }
    .drawer-close { background: none; border: none; color: var(--ink); font-size: 26px; line-height: 1;
      cursor: pointer; padding: 0 2px; }
    .drawer-close:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
    .sidebar-backdrop { display: block; position: fixed; inset: 0; z-index: 49; background: rgba(6,8,14,0.5);
      -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
      opacity: 0; pointer-events: none; transition: opacity .24s ease; }
    .sidebar-backdrop.open { opacity: 1; pointer-events: auto; }
    .filter-btn { display: inline-flex; }
  }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 15px; box-shadow: var(--shadow-sm); }
  .panel h2 { font: 700 10.5px var(--sans); text-transform: uppercase; letter-spacing: 1.3px; color: var(--muted); margin: 0 0 12px; }
  .chips { display: flex; gap: 7px; flex-wrap: wrap; }
  .chips button { background: var(--chip); border: 1px solid transparent; color: var(--ink); border-radius: 999px;
    padding: 7px 13px; font: 600 12px var(--sans); cursor: pointer; min-height: 33px;
    transition: background .16s ease, color .16s ease, border-color .16s ease; }
  .chips button:hover { border-color: color-mix(in srgb, var(--signal) 35%, var(--line)); }
  .chips button[aria-pressed="true"] { background: var(--signal); color: var(--signal-ink); border-color: var(--signal); }
  .chips button:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

  .sbar-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 11px; border-radius: 8px; }
  .sbar-row:last-child { margin-bottom: 0; }
  .sbar-btn { background: none; border: none; padding: 0; margin: 0; width: 100%; text-align: left; cursor: pointer; color: inherit; }
  .sbar-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color .16s ease; }
  .sbar-btn:hover .sbar-label { color: var(--ink); }
  .sbar-row[aria-pressed="true"] .sbar-label { color: var(--signal); }
  .sbar-track { display: flex; align-items: center; gap: 8px; height: 13px; }
  .sbar-fill { height: 9px; background: var(--grad); border-radius: 999px; min-width: 4px; transition: filter .16s ease; }
  .sbar-btn:hover .sbar-fill { filter: brightness(1.08); }
  .sbar-row[aria-pressed="true"] .sbar-fill { box-shadow: 0 0 0 2px var(--signal-soft); }
  .sbar-row[data-other="1"] .sbar-fill { background: var(--muted); opacity: 0.45; }
  .sbar-val { font: 700 11.5px var(--mono); color: var(--ink); font-variant-numeric: tabular-nums; flex-shrink: 0; }

  main.results { display: flex; flex-direction: column; min-width: 0; }
  .count { color: var(--muted); font-size: 12.5px; margin: 0 2px 10px; }
  .count b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .viewport { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
    overflow-y: auto; -webkit-overflow-scrolling: touch; max-height: min(74vh, 800px); position: relative; box-shadow: var(--shadow-sm); }
  .pool { display: flex; flex-direction: column; }
  .row { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px;
    border-bottom: 1px solid var(--line); box-sizing: border-box; position: relative;
    transition: background-color .14s ease; }
  .row::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--signal);
    opacity: 0; transition: opacity .14s ease; }
  .row:last-child { border-bottom: none; }
  .row:hover { background: var(--surface2); }
  .row:hover::before { opacity: .55; }
  .live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--good); margin-right: 6px; flex-shrink: 0; }
  .star { background: none; border: none; cursor: pointer; font-size: 17px; color: var(--line); flex-shrink: 0;
    width: 30px; height: 30px; padding: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center;
    transition: color .16s ease, background .16s ease, transform .16s ease; }
  .star:hover { background: var(--chip); color: var(--muted); transform: scale(1.08); }
  .star.active { color: var(--signal); }
  .star.active:hover { color: var(--signal); }
  .star:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .row-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 5px; }
  .row-title-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; flex-wrap: wrap; }
  .row-title { font-weight: 650; font-size: 14.5px; line-height: 1.4; text-decoration: none; word-break: break-word; }
  .row-title:hover, .row-title:focus { color: var(--signal); text-decoration: underline; text-underline-offset: 2px; }
  .badge-new { font: 700 9px var(--sans); text-transform: uppercase; letter-spacing: 0.6px; color: var(--good);
    background: color-mix(in srgb, var(--good) 14%, transparent); border-radius: 5px; padding: 2px 6px; flex-shrink: 0; }
  .row-meta { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-meta .amt { color: var(--signal); font-weight: 700; }
  .tag-type { font: 700 9.5px var(--sans); text-transform: uppercase; letter-spacing: 0.6px; color: var(--signal);
    background: var(--signal-soft); border-radius: 6px; padding: 3px 7px; margin-right: 3px; flex-shrink: 0; }
  .row-when { text-align: right; flex-shrink: 0; font-family: var(--mono); font-variant-numeric: tabular-nums; width: 98px; }
  .row-when .rdate { display: block; font-size: 11.5px; color: var(--muted); }
  .row-when .rleft { display: block; font-size: 14px; font-weight: 700; margin-top: 2px; letter-spacing: -0.3px; }
  .row-when.warn .rleft { color: var(--warn); }
  .row-when.crit .rleft, .row-when.crit .rdate { color: var(--crit); }
  .empty { color: var(--muted); padding: 70px 0; text-align: center; }

  /* ---------- footer / ledger ---------- */
  footer { margin-top: 40px; padding-top: 22px; border-top: 1px solid var(--line); }
  .ledger-head { margin: 0 0 14px; }
  .ledger-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(228px, 1fr)); gap: 10px 22px; margin-bottom: 22px; }
  .ledger-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; box-shadow: var(--shadow-sm); }
  .lg-name { color: var(--ink); font-weight: 600; }
  .lg-meta { color: var(--muted); font-variant-numeric: tabular-nums; text-align: right; }
  .fine { color: var(--muted); font-size: 12.5px; max-width: 76ch; line-height: 1.6; }
  .fine b { color: var(--ink); }

  /* ---------- mobile ---------- */
  @media (max-width: 640px) {
    .wrap { padding: 20px 15px 64px; }
    .wordmark { font-size: 25px; }
    .tagline { max-width: 100%; }
    .mast-bottom { flex-direction: column; align-items: flex-start; gap: 16px; }
    .hero-num { font-size: 42px; }
    .stat-strip { gap: 10px; flex-wrap: wrap; }
    .stat { flex: 1; min-width: 0; }
    .spark-wrap { margin-left: 0; align-items: flex-start; width: 100%; }
    .spark { max-width: 100%; height: auto; }

    .rail-card { flex: 0 0 176px; }

    .search-wrap { flex: 1 1 100%; }
    .tabs { flex: 1 1 100%; }
    .tabs button { flex: 1; padding: 9px 4px; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    select, .toggle { flex: 1; }

    .row { gap: 9px; padding: 12px; }
    .tag-type { padding: 2px 6px; font-size: 9px; margin-right: 3px; }
    .row-title { font-size: 14px; }
    .row-meta { font-size: 11px; }
    .row-when { width: 70px; }
    .row-when .rdate { display: none; }
    .row-when .rleft { font-size: 13px; }
  }

  @media (prefers-reduced-motion: no-preference) {
    .row { animation: rise .2s ease both; }
    @keyframes rise { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    .rail-card { animation: rise .24s ease both; }
    .crit-dot, .live-dot { animation: pulse 1.8s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.8); } }
  }
</style>
<div class="wrap">
  <header class="mast">
    <div class="mast-top">
      <div>
        <div class="brand">
          <h1 class="wordmark">FundRadar<span class="signal-text">·EA</span></h1>
        </div>
        <p class="tagline">Signals intelligence for East African funding — every open grant, tender and call, watched daily so you don't have to.</p>
      </div>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle color theme" title="Toggle color theme"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"></path></svg></button>
    </div>
    <div class="mast-bottom">
      <div class="hero"><b class="hero-num" id="statLive">${items.length}</b><span class="hero-label">Live opportunities</span></div>
      <div class="stat-strip">
        <div class="stat"><b>${nSources}</b><span>Sources watched</span></div>
        <div class="stat"><b>${nTotal.toLocaleString()}</b><span>Ever tracked</span></div>
        <div class="stat"><b><span class="live-dot"></span>${today}</b><span>Last swept</span></div>
      </div>
      <div class="spark-wrap">
        <span class="spark-label">New discoveries · 14 days</span>
        ${sparklineSvg(daily)}
      </div>
    </div>
  </header>

  <div class="subscribe-card">
    <p class="eyebrow">Get the weekly digest</p>
    <iframe src="https://fundradar.substack.com/embed?transparent=1" width="480" height="150" style="border:0; background:transparent;" frameborder="0" scrolling="no"></iframe>
  </div>

  <div class="rail-head">
    <p class="eyebrow"><span class="crit-dot">&#9679;</span> Closing within 7 days</p>
  </div>
  <div class="rail" id="rail"></div>

  <div class="brief">
    <p class="eyebrow">Situation brief</p>
    <p>The money didn't disappear this year; the <em>map</em> did. With USAID gone and several European donors
    cutting budgets, what remains is scattered across portals nobody has time to check. We check them —
    government e-procurement systems, multilateral tender platforms, and web-wide discovery feeds — every day.
    Every deadline below links to its primary source.</p>
  </div>

  <div class="controls">
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
      <input type="search" id="q" placeholder="Search title, funder, sector, applicant… (press / to focus)" aria-label="Search opportunities">
    </div>
    <div class="tabs" role="group" aria-label="Filter by type">
      <button data-type="all" aria-pressed="true">All</button>
      <button data-type="grant" aria-pressed="false">Grants</button>
      <button data-type="tender" aria-pressed="false">Tenders</button>
      <button data-type="fellowship" aria-pressed="false">Fellowships</button>
    </div>
    <select id="sort" aria-label="Sort order">
      <option value="deadline_asc">Deadline · soonest</option>
      <option value="deadline_desc">Deadline · latest</option>
      <option value="new_desc">Newest discovered</option>
    </select>
    <button class="toggle" id="newToggle" aria-pressed="false">&#10022; New (<span id="newCount">0</span>)</button>
    <button class="toggle" id="schoolToggle" aria-pressed="false" aria-label="Filter for schools eligible in Uganda">For schools in Uganda (<span id="schoolCount">0</span>)</button>
    <button class="toggle" id="shortlistToggle" aria-pressed="false">&#9734; Shortlist (<span id="shortlistCount">0</span>)</button>
    <button class="toggle filter-btn" id="filterBtn" aria-expanded="false" aria-controls="sidebar"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="10" y1="17" x2="14" y2="17"></line></svg> Filters<span class="filter-badge" id="filterBadge" hidden></span></button>
  </div>

  <div class="board">
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    <aside class="sidebar" id="sidebar">
      <div class="drawer-head"><span>Filters</span><button class="drawer-close" id="drawerClose" aria-label="Close filters">&times;</button></div>
      <div class="panel">
        <h2>Country</h2>
        <div class="chips" id="countryChips"></div>
      </div>
      <div class="panel">
        <h2>Sector (live)</h2>
        <div id="sectorChart"></div>
      </div>
    </aside>
    <main class="results">
      <p class="count" id="count"></p>
      <div class="viewport" id="viewport" tabindex="0">
        <div class="pool" id="pool" role="list" aria-label="Opportunities"></div>
      </div>
    </main>
  </div>

  <footer>
    <p class="eyebrow ledger-head">Source ledger — last confirmed check</p>
    <div class="ledger-grid">
      ${sourceMeta.map((s) => `<div class="ledger-row"><span class="lg-name">${s.source}</span><span class="lg-meta">${s.total} tracked · ${s.latest.slice(0, 16).replace('T', ' ')}</span></div>`).join('')}
    </div>
    <p class="fine">FundRadar monitors government e-procurement portals, multilateral tender systems and web-wide
    discovery feeds daily. Sector and eligibility tags are automated; deadlines come from structured source data
    where available. <b>Always verify against the linked source before applying.</b> Spotted an error?
    Corrections ship within 24 hours.</p>
  </footer>
</div>
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
  var themeToggle = document.getElementById('themeToggle');
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

  // ---------- theme toggle ----------
  var storedTheme = null;
  try { storedTheme = localStorage.getItem('fundradar_theme'); } catch (e) {}
  if (storedTheme) document.documentElement.setAttribute('data-theme', storedTheme);
  themeToggle.addEventListener('click', function () {
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var current = document.documentElement.getAttribute('data-theme') || (mql.matches ? 'dark' : 'light');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('fundradar_theme', next); } catch (e) {}
  });

  // ---------- filters drawer (mobile) ----------
  function isMobile() { return window.matchMedia('(max-width: 860px)').matches; }
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
      return '<a class="rail-card" href="' + esc(o.u) + '" target="_blank" rel="noopener">' +
        '<span class="rail-days">' + (dl === 0 ? 'today' : dl + 'd') + '</span>' +
        '<span class="rail-title">' + esc(o.t) + '</span>' +
        '<span class="rail-meta">' + esc(o.f || o.s) + '</span></a>';
    }).join('');
  } else {
    var soonest = DATA.filter(function (o) { return o.d; }).sort(function (a, b) { return daysLeft(a.d) - daysLeft(b.d); })[0];
    railEl.outerHTML = '<p class="rail-empty">Nothing closing within 7 days right now' +
      (soonest ? ' — the nearest deadline is in ' + daysLeft(soonest.d) + ' days.' : '.') + '</p>';
  }

  // ---------- rail auto-scroll (paused on hover/touch/focus, off for reduced-motion) ----------
  if (closing.length > 2 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var railPaused = false, railResuming = null;
    (function railTick() {
      if (!railPaused) {
        var max = railEl.scrollWidth - railEl.clientWidth;
        if (max > 1) {
          if (railEl.scrollLeft >= max - 1) {
            railPaused = true;
            railResuming = setTimeout(function () {
              railEl.scrollTo({ left: 0, behavior: 'smooth' });
              railResuming = setTimeout(function () { railPaused = false; }, 600);
            }, 1400);
          } else {
            railEl.scrollLeft += 0.55;
          }
        }
      }
      requestAnimationFrame(railTick);
    })();
    ['mouseenter', 'focusin', 'touchstart'].forEach(function (ev) {
      railEl.addEventListener(ev, function () {
        railPaused = true;
        railEl.classList.add('snap');
        if (railResuming) { clearTimeout(railResuming); railResuming = null; }
      }, { passive: true });
    });
    ['mouseleave', 'focusout'].forEach(function (ev) {
      railEl.addEventListener(ev, function () {
        railEl.classList.remove('snap');
        railPaused = false;
      }, { passive: true });
    });
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

  function rowHtml(o, idx) {
    var when = '<span class="rdate">no date</span><span class="rleft">see source</span>', cls = '';
    if (o.d) {
      var dl = daysLeft(o.d);
      cls = dl <= 7 ? ' crit' : dl <= 21 ? ' warn' : '';
      when = '<span class="rdate">' + o.d + '</span><span class="rleft">' + (dl <= 0 ? 'today' : dl + 'd left') + '</span>';
    }
    var meta = [o.f, o.c.map(function (c) { return c.split(',')[0]; }).join(', '), o.k[0], o.p !== 'unknown' ? 'Applicant: ' + o.p : null, o.g ? 'School eligible · Uganda' : null].filter(Boolean).join(' · ');
    var isNew = o.n === BUILD_DATE;
    var starred = shortlist.has(o.id);
    return '<div class="row" role="listitem" aria-posinset="' + (idx + 1) + '" aria-setsize="' + current.length + '">' +
      '<button class="star' + (starred ? ' active' : '') + '" data-id="' + esc(o.id) + '" aria-pressed="' + starred + '" aria-label="Add to shortlist">' + (starred ? '★' : '☆') + '</button>' +
      '<div class="row-main">' +
        '<div class="row-title-line"><span class="tag-type">' + o.y + '</span>' +
        '<a class="row-title" href="' + esc(o.u) + '" target="_blank" rel="noopener">' + esc(o.t) + '</a>' +
        (isNew ? '<span class="badge-new">New</span>' : '') + '</div>' +
        '<div class="row-meta" title="' + esc(meta + ' · via ' + o.s) + '">' + esc(meta) + (o.a ? ' · <span class="amt">' + esc(o.a) + '</span>' : '') + ' · via ' + esc(o.s) + '</div>' +
      '</div>' +
      '<div class="row-when' + cls + '">' + when + '</div>' +
    '</div>';
  }

  function renderList() {
    if (!current.length) {
      pool.innerHTML = state.schoolOnly && !DATA.some(function (o) { return o.g; })
        ? '<p class="empty">No current opportunities are confidently tagged as open to Uganda schools. Check the full call text and revisit after the next pipeline run.</p>'
        : '<p class="empty">Nothing matches — widen the filters.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < current.length; i++) html += rowHtml(current[i], i);
    pool.innerHTML = html;
  }

  function refilter() {
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
<meta name="theme-color" content="#4F46E5">
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
