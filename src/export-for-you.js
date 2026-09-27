import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10);
const db = openDb();

const rows = db.prepare(`
  SELECT id, title, source, deadline, url, applicant_type, countries
  FROM opportunities
  WHERE ea_relevant = 1
    AND (deadline >= ? OR (deadline IS NULL AND first_seen >= datetime('now', '-14 days')))
  ORDER BY (deadline IS NULL), deadline ASC, title COLLATE NOCASE ASC
`).all(today);

const leads = rows.map((row) => ({
  id: row.id,
  title: row.title,
  source: row.source,
  deadline: row.deadline,
  link: row.url,
  applicant: row.applicant_type ?? 'unknown',
  countries: JSON.parse(row.countries ?? '[]'),
}));

const outputPath = path.join(ROOT, 'docs', 'for-you.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  total: leads.length,
  leads,
})}\n`);
db.close();
console.log(`Applicant finder data written: ${outputPath} (${leads.length} live leads)`);
