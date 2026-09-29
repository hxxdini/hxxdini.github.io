import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feed = JSON.parse(fs.readFileSync(path.join(root, 'docs/for-you.json'), 'utf8'));
const homepage = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
const finder = fs.readFileSync(path.join(root, 'docs/for-you.html'), 'utf8');
const count = homepage.match(/id="statLive">([\d,]+)<\/b>/)?.[1];

assert.ok(Array.isArray(feed.leads), 'For You feed must contain a lead array');
assert.equal(feed.total, feed.leads.length, 'For You total must match its lead array');
assert.ok(count, 'Homepage live count must be present');
assert.equal(Number(count.replaceAll(',', '')), feed.total, 'Homepage and For You counts must agree');
assert.match(finder, /fetch\('\.\/for-you\.json'/, 'Finder must request its published feed');
assert.match(homepage, new RegExp(`${feed.generatedAt.slice(0, 10)}<\\/b><span>Last swept`), 'Homepage sweep date must match the generated feed');

console.log(`Published site data checks passed: ${feed.total} leads on both pages`);
