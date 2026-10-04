import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { upsertOpportunity } from '../src/db.js';
import { completeSubject, isTruncatedSubject, parseFullSubject } from '../src/sources/uganda_egp.js';

const readableTitle = "SUPPLY, INSTALLATION & TESTING OF SCHOOL LAB EQUIPMENT FOR CHILDREN'S LEARNING CENTERS – PHASE 2";
const longTitle = `${readableTitle} ${'Additional scope item '.repeat(15)}`.trim();
const detailHtml = `
  <table class="table table-bordered">
    <thead><tr><th>No #</th><th>Procurement Ref Number</th><th>Subject of Procurement</th></tr></thead>
    <tbody><tr><td>1</td><td>EDU/SUPLS/2026-2027/00001</td>
      <td>${longTitle.replace('&', '&amp;').replace("'", '&#039;')}</td>
    </tr></tbody>
  </table>
  <p>Dear All Supplier</p>
`;

assert.equal(parseFullSubject(detailHtml), longTitle);
assert.equal(parseFullSubject('<table><tr><th>Other field</th></tr><tr><td>Not a title</td></tr></table>'), null);

assert.equal(isTruncatedSubject('Supply of classroom equipment...'), true);
assert.equal(isTruncatedSubject('Supply of classroom equipment…'), true);
assert.equal(isTruncatedSubject(readableTitle), false);
assert.equal(completeSubject('Supply of classroom equipment...', longTitle), longTitle);
assert.equal(completeSubject('Supply of classroom equipment…', null), null);
assert.equal(completeSubject('Supply of classroom equipment...', 'Equipment for schools...'), null);
assert.equal(completeSubject(readableTitle, null), readableTitle);

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE opportunities (
    id TEXT PRIMARY KEY, source TEXT, funder TEXT, title TEXT NOT NULL, url TEXT,
    summary TEXT, type TEXT, deadline TEXT, countries TEXT, sectors TEXT,
    eligibility TEXT, amount TEXT, ea_relevant INTEGER, published_at TEXT,
    first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, raw TEXT,
    applicant_type TEXT, school_eligible_uganda INTEGER,
    official_url TEXT, documents TEXT, article_url TEXT, verify_status TEXT, verified_at TEXT
  )
`);

const opportunity = { id: 'title-regression', source: 'Uganda eGP (PPDA)', type: 'tender', countries: ['Uganda'] };
upsertOpportunity(db, { ...opportunity, title: 'Supply of classroom equipment...' });
upsertOpportunity(db, { ...opportunity, title: longTitle });
upsertOpportunity(db, { ...opportunity, title: 'Supply of classroom equipment...' });

assert.equal(db.prepare('SELECT title FROM opportunities WHERE id = ?').get(opportunity.id).title, longTitle);
db.close();

console.log('Uganda eGP title extraction, completeness guards, and persistence: 10 checks passed');
