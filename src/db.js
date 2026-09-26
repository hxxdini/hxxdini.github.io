import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { classifyApplicant } from './normalize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = path.join(ROOT, 'data', 'fundradar.db');

export function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id            TEXT PRIMARY KEY,
      source        TEXT NOT NULL,
      funder        TEXT,
      title         TEXT NOT NULL,
      url           TEXT,
      summary       TEXT,
      type          TEXT,              -- grant | tender | fellowship | prize | other
      deadline      TEXT,              -- ISO date if known
      countries     TEXT,              -- JSON array
      sectors       TEXT,              -- JSON array
      eligibility   TEXT,              -- JSON array
      applicant_type TEXT,
      school_eligible_uganda INTEGER DEFAULT 0,
      amount        TEXT,
      ea_relevant   INTEGER DEFAULT 0, -- 1 = relevant to East Africa
      published_at  TEXT,
      first_seen    TEXT NOT NULL,
      last_seen     TEXT NOT NULL,
      raw           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_opp_deadline ON opportunities(deadline);
    CREATE INDEX IF NOT EXISTS idx_opp_source ON opportunities(source);
    CREATE INDEX IF NOT EXISTS idx_opp_ea ON opportunities(ea_relevant);
  `);

  const columns = new Set(db.prepare('PRAGMA table_info(opportunities)').all().map((column) => column.name));
  if (!columns.has('applicant_type')) db.exec('ALTER TABLE opportunities ADD COLUMN applicant_type TEXT');
  if (!columns.has('school_eligible_uganda')) db.exec('ALTER TABLE opportunities ADD COLUMN school_eligible_uganda INTEGER DEFAULT 0');

  const unclassified = db.prepare(`
    SELECT id, title, summary, eligibility, countries, type
    FROM opportunities
    WHERE applicant_type IS NULL
  `).all();
  const updateClassification = db.prepare(`
    UPDATE opportunities
    SET applicant_type = ?, school_eligible_uganda = ?
    WHERE id = ?
  `);
  for (const row of unclassified) {
    const classification = classifyApplicant(row);
    updateClassification.run(classification.applicantType, classification.schoolEligibleUganda ? 1 : 0, row.id);
  }

  return db;
}

export function upsertOpportunity(db, o) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO opportunities
      (id, source, funder, title, url, summary, type, deadline, countries, sectors,
       eligibility, amount, ea_relevant, published_at, first_seen, last_seen, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      last_seen = excluded.last_seen,
      title     = CASE WHEN excluded.title LIKE '%...' AND opportunities.title NOT LIKE '%...' THEN opportunities.title ELSE excluded.title END,
      deadline  = COALESCE(excluded.deadline, opportunities.deadline),
      summary   = COALESCE(excluded.summary, opportunities.summary),
      amount    = COALESCE(excluded.amount, opportunities.amount)
  `);
  const info = stmt.run(
    o.id, o.source, o.funder ?? null, o.title, o.url ?? null, o.summary ?? null,
    o.type ?? 'other', o.deadline ?? null,
    JSON.stringify(o.countries ?? []), JSON.stringify(o.sectors ?? []),
    JSON.stringify(o.eligibility ?? []), o.amount ?? null,
    o.ea_relevant ? 1 : 0, o.published_at ?? null, now, now,
    o.raw ? JSON.stringify(o.raw).slice(0, 20000) : null
  );
  const current = db.prepare(`
    SELECT title, summary, eligibility, countries, type
    FROM opportunities
    WHERE id = ?
  `).get(o.id);
  const classification = classifyApplicant(current);
  db.prepare(`
    UPDATE opportunities
    SET applicant_type = ?, school_eligible_uganda = ?
    WHERE id = ?
  `).run(classification.applicantType, classification.schoolEligibleUganda ? 1 : 0, o.id);
  return info.changes > 0 && info.lastInsertRowid !== undefined;
}
