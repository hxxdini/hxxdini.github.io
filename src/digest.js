import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');

const db = openDb();
const today = new Date().toISOString().slice(0, 10);

function daysLeft(deadline) {
  if (!deadline) return null;
  return Math.round((new Date(deadline) - new Date(today)) / 86400000);
}

// Live EA-relevant opportunities: future deadline, or recently-seen with no deadline parsed
const rows = db.prepare(`
  SELECT * FROM opportunities
  WHERE ea_relevant = 1
    AND (deadline >= ? OR (deadline IS NULL AND first_seen >= datetime('now', '-14 days')))
  ORDER BY (deadline IS NULL), deadline ASC
`).all(today);
const schoolItems = rows.filter((row) => row.school_eligible_uganda === 1);

const sections = {
  grant: { title: 'Grants & Funding Calls', items: [] },
  tender: { title: 'Tenders & Consultancies', items: [] },
  fellowship: { title: 'Fellowships, Prizes & Individual Opportunities', items: [] },
};
for (const r of rows) {
  const bucket = r.type === 'grant' ? 'grant' : r.type === 'tender' ? 'tender' : 'fellowship';
  sections[bucket].items.push(r);
}
// Tenders can flood the digest — cap at the 20 nearest deadlines
sections.tender.items = sections.tender.items.slice(0, 20);

const editorsNotePath = path.join(OUT, 'editors-note.md');
const editorsNote = fs.existsSync(editorsNotePath) ? fs.readFileSync(editorsNotePath, 'utf8').trim() : null;

function itemMd(r) {
  const dl = daysLeft(r.deadline);
  const deadlineStr = r.deadline
    ? `**Deadline: ${r.deadline}**${dl != null ? ` (${dl} days left)` : ''}`
    : '_Deadline: see source_';
  const countries = JSON.parse(r.countries ?? '[]');
  const sectors = JSON.parse(r.sectors ?? '[]');
  const meta = [
    r.funder,
    countries.length ? countries.join(', ') : null,
    sectors.length ? sectors.slice(0, 3).join(' · ') : null,
    r.applicant_type && r.applicant_type !== 'unknown' ? `Applicant: ${r.applicant_type}` : null,
    r.amount,
  ].filter(Boolean).join(' | ');
  return `- **[${r.title}](${r.url})**\n  ${deadlineStr}${meta ? ` — ${meta}` : ''}\n  <sub>via ${r.source}</sub>`;
}

// ---------- Markdown ----------
let md = `# FundRadar East Africa — Weekly Digest\n\n`;
md += `**Issue #1 · ${today}** · ${rows.length} live opportunities tracked across ${db.prepare('SELECT COUNT(DISTINCT source) c FROM opportunities').get().c} sources\n\n`;
md += `> Every open grant, tender and opportunity relevant to East African organizations — verified against the primary source, every week.\n\n`;
if (editorsNote) md += `## Editor's note\n\n${editorsNote}\n\n`;
md += `## For schools in Uganda (${schoolItems.length})\n\n`;
if (schoolItems.length) {
  md += schoolItems.map(itemMd).join('\n\n') + '\n\n';
} else {
  md += `_No current live calls clearly identify schools or educational institutions as eligible applicants in Uganda. The automated flag is conservative; verify the full call before acting._\n\n`;
}
for (const s of Object.values(sections)) {
  if (s.items.length === 0) continue;
  md += `## ${s.title} (${s.items.length})\n\n`;
  md += s.items.map(itemMd).join('\n\n') + '\n\n';
}
md += `---\n\n*FundRadar tracks ${db.prepare('SELECT COUNT(*) c FROM opportunities').get().c} opportunities from World Bank, EU Funding & Tenders, UNGM and more. Every deadline links to its primary source — always verify before applying. Spotted an error? Reply and we fix it within 24h.*\n`;

fs.mkdirSync(OUT, { recursive: true });
const mdPath = path.join(OUT, `digest-${today}.md`);
fs.writeFileSync(mdPath, md);

console.log(`Digest written: ${mdPath}`);
console.log(`  ${sections.grant.items.length} grants | ${sections.tender.items.length} tenders | ${sections.fellowship.items.length} fellowships/prizes`);
