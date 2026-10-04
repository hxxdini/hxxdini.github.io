import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUMMARY_PATH = process.env.SUMMARY_PATH || path.join(ROOT, '.run-summary.json');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RUN_URL, PAGES_OUTCOME } = process.env;

if (!process.env.DRY_RUN && (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)) {
  console.log('Telegram secrets not set — skipping notification.');
  process.exit(0);
}

const icon = (outcome) => outcome === 'success' ? '✅' : outcome === 'skipped' ? '⏭️' : '❌';

let lines = [`🛰 FundRadar pipeline run`];

if (fs.existsSync(SUMMARY_PATH)) {
  const s = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
  lines.push(`${s.totalNew} new opportunities — ${s.totalSeen} checked across ${s.perSource.length} sources`);
  lines.push(`DB: ${s.db.total} total | ${s.db.ea} EA-relevant | ${s.db.live} live on site`);

  const failed = s.perSource.filter(x => x.error);
  const withNew = s.perSource.filter(x => !x.error && x.added > 0);
  if (withNew.length) lines.push('', ...withNew.map(x => `  +${x.added} ${x.name}`));
  if (failed.length) lines.push('', '⚠️ Failed sources:', ...failed.map(x => `  ${x.name}: ${x.error.slice(0, 120)}`));
  if (s.staleSources?.length) lines.push('', '🕰 Stale (no fresh data >48h):', ...s.staleSources.map(x => `  ${x.source}: ${x.days}d`));
} else {
  lines.push('⚠️ No run summary found — ingestion step likely crashed before writing results. Check the Actions log.');
}

lines.push('', `Site deploy: ${icon(PAGES_OUTCOME)} ${PAGES_OUTCOME || 'unknown'}`);
if (RUN_URL) lines.push(RUN_URL);

const text = lines.join('\n');

if (process.env.DRY_RUN) {
  console.log(text);
  process.exit(0);
}

const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text,
    disable_web_page_preview: true,
  }),
});

if (!res.ok) {
  console.error(`Telegram notify failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log('Telegram notification sent.');
