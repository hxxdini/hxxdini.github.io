import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, parseDetail, resolveExpire, extractToken, cookieHeader } from '../src/sources/somalijobs.js';

// Fixture: /tenders/fetch/ page 1 captured 2026-11-22 (10 cards).
const list = fs.readFileSync(new URL('./fixtures/somalijobs-list.html', import.meta.url), 'utf8');
const rows = parseList(list);
assert.equal(rows.length, 10);
assert.equal(rows[0].tenderId, '5178583561353599');
assert.equal(rows[0].locationSlug, 'luuq');
assert.equal(rows[0].location, 'Luuq');
assert.equal(rows[0].buyer, 'federal government of somalia');
assert.match(rows[0].url, /^https:\/\/somalijobs\.com\/tenders\/luuq\/5178583561353599\//);
assert.match(rows[0].title, /kormari primary school/);
assert.ok(rows.every((r) => r.title && r.tenderId && r.url.startsWith('https://somalijobs.com/tenders/')));

// Fixture: the detail page of that notice.
const detail = parseDetail(fs.readFileSync(new URL('./fixtures/somalijobs-detail.html', import.meta.url), 'utf8'));
assert.equal(detail.expire, 'Dec, 12');
assert.equal(detail.location, 'Luuq');
assert.equal(detail.company, 'Federal Government Of Somalia');
assert.match(detail.title, /^TENDER NOTICE FOR-CONSTRUCTION OF CLASSROOMS/);
assert.equal(extractToken('<script>var api_token = "abc-123"</script>'), 'abc-123');

// Year-less expire dates resolve against today; never invented.
assert.equal(resolveExpire('Dec, 12', '2026-11-22'), '2026-12-12');
assert.equal(resolveExpire('Jan, 05', '2026-11-22'), '2027-01-05');
assert.equal(resolveExpire('Nov, 10', '2026-11-22'), '2026-11-10'); // recently expired stays past → dropped
assert.equal(resolveExpire('Dec, 3, 2027', '2026-11-22'), '2027-12-03');
assert.equal(resolveExpire('Yesterday', '2026-11-22'), null);
assert.equal(resolveExpire('', '2026-11-22'), null);
assert.equal(resolveExpire(null, '2026-11-22'), null);

// Repeated Set-Cookie: last value wins.
assert.equal(cookieHeader(['_csrf=a; Path=/', '_csrf=b; Path=/', '__cf_bm=x; HttpOnly']), '_csrf=b; __cf_bm=x');

console.log('somalijobs tests passed');
