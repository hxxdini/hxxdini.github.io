// Daily post to the public Telegram channel (@fundradarea): opportunities
// first found in the last 24 hours, grouped by country (Uganda first), each
// linking to its FundRadar lead page. Runs from .github/workflows/channel-post.yml.
//
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID (e.g. @fundradarea).
// DRY_RUN=1 prints the message instead of sending it.
import { openDb } from './db.js';
import { canonicalCountries, detectTenderCategory, tenderCategoryLabel } from './normalize.js';
import { CONTACT } from './config.js';

const BASE = 'https://hxxdini.github.io';
const ORDER = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'South Sudan', 'Ethiopia', 'Somalia', 'Burundi', 'DR Congo'];
const FLAGS = { Uganda: '🇺🇬', Kenya: '🇰🇪', Tanzania: '🇹🇿', Rwanda: '🇷🇼', 'South Sudan': '🇸🇸', Ethiopia: '🇪🇹', Somalia: '🇸🇴', Burundi: '🇧🇮', 'DR Congo': '🇨🇩' };
const PER_COUNTRY = 3;
const LIMIT = 3900; // Telegram allows 4096 characters

function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

function shortDate(iso) {
  if (!iso) return 'no deadline listed';
  const d = new Date(`${iso}T00:00:00Z`);
  return `closes ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
}

export function buildPost(rows, today = new Date().toISOString().slice(0, 10)) {
  // Skip calls closing in under 2 days: too late for most bidders to act on.
  const soonest = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
  const live = rows.filter((r) => !r.deadline || r.deadline >= soonest);
  const byCountry = new Map();
  for (const r of live) {
    const countries = canonicalCountries(JSON.parse(r.countries ?? '[]'));
    const home = ORDER.find((c) => countries.includes(c));
    if (!home) continue;
    if (!byCountry.has(home)) byCountry.set(home, []);
    byCountry.get(home).push(r);
  }
  const total = [...byCountry.values()].reduce((n, l) => n + l.length, 0);
  if (!total) return null;

  const lines = [`<b>🛰 ${total} new tenders &amp; grants in East Africa today</b>`, ''];
  for (const country of ORDER) {
    const list = byCountry.get(country);
    if (!list?.length) continue;
    lines.push(`${FLAGS[country]} <b>${esc(country)}</b> (${list.length} new)`);
    for (const r of list.sort((a, b) => (a.deadline ?? '9') .localeCompare(b.deadline ?? '9')).slice(0, PER_COUNTRY)) {
      const kind = r.type === 'tender' ? tenderCategoryLabel(detectTenderCategory(r.title, r.summary)) : (r.type ?? 'opportunity');
      const title = r.title.length > 110 ? `${r.title.slice(0, 107)}…` : r.title;
      lines.push(`• <a href="${BASE}/lead/${r.id}.html">${esc(title)}</a> — ${esc(kind)}, ${shortDate(r.deadline)}`);
    }
    if (list.length > PER_COUNTRY) lines.push(`  …and ${list.length - PER_COUNTRY} more`);
    lines.push('');
  }
  const footer = [
    `🔎 Find tenders for your business: ${BASE}/`,
    `✍️ Need help with a bid or proposal? ${BASE}/bid-desk.html · WhatsApp ${CONTACT.phoneDisplay}`,
  ];
  let text = lines.join('\n');
  // Trim whole country blocks from the end until it fits
  while (text.length + footer.join('\n').length + 2 > LIMIT && lines.length > 3) {
    lines.splice(lines.lastIndexOf('', lines.length - 2) + 1);
    text = lines.join('\n');
  }
  return `${text}\n${footer.join('\n')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  const rows = db.prepare(`SELECT id, title, summary, type, deadline, countries FROM opportunities
    WHERE ea_relevant = 1 AND first_seen >= datetime('now', '-24 hours') AND source != 'Web Radar (unverified lead)'`).all();
  db.close();
  const text = buildPost(rows);
  if (!text) { console.log('Channel post: nothing new in the last 24h.'); process.exit(0); }
  if (process.env.DRY_RUN) { console.log(text); process.exit(0); }
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID not set');
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Telegram channel post failed: ${res.status} ${body.slice(0, 300)}`);
  console.log(`Channel post sent (${text.length} chars).`);
}
