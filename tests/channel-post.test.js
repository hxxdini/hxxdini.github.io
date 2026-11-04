import assert from 'node:assert/strict';
import { buildPost } from '../src/channel-post.js';

const row = (id, title, countries, deadline, type = 'tender') => ({ id, title, summary: '', type, deadline, countries: JSON.stringify(countries) });
const text = buildPost([
  row('a1', 'Construction of a classroom block', ['Uganda'], '2026-11-20'),
  row('a2', 'Supply of laptops', ['Kenya'], '2026-11-25'),
  row('a3', 'Closes tomorrow so skipped', ['Uganda'], '2026-11-05'),
  row('a4', 'Brazzaville only so skipped', ['Congo, Republic of'], '2026-11-30'),
  row('a5', 'Tanzania <ICT> & more', ['Tanzania, United Republic of'], null),
], '2026-11-04');
assert.match(text, /3 new tenders &amp; grants/);
assert.ok(text.indexOf('Uganda') < text.indexOf('Kenya'), 'Uganda first');
assert.match(text, /lead\/a1\.html/);
assert.doesNotMatch(text, /a3|a4/);
assert.match(text, /Tanzania &lt;ICT&gt; &amp; more/); // HTML-escaped for parse_mode HTML
assert.match(text, /Construction &amp; Civil Works, closes 20 Nov/);
assert.equal(buildPost([], '2026-11-04'), null);
const many = Array.from({ length: 400 }, (_, i) => row(`k${i}`, `Kenya tender number ${i} with a fairly long descriptive title for padding`, ['Kenya'], '2026-12-01'));
assert.ok(buildPost(many, '2026-11-04').length <= 4096);
console.log('channel post tests passed');
