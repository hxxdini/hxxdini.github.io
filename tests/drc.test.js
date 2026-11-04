import assert from 'node:assert/strict';
import { parseDrcTenders } from '../src/sources/drc.js';

const item = (title, country, deadline, status = 'current') => `<article class="tenderList__item" data-title="${title.toLowerCase()}" data-country="${country}" data-published="20261020" data-deadline="${deadline}" data-status="${status}"> <span class="tenderList__item__title">${title}</span> <a class="casper" href="/en/tenders/${deadline}-${status}/"></a> </article>`;
const html = [
  item('Provision of Medical Insurance Cover Services to DRC National staff South Sudan.', 'east africa &amp; great lakes | south sudan', '20261109'),
  item('Borehole drilling in Ifo camp', 'east africa &amp; great lakes | kenya', '20240124', 'archived'),
  item('Multi-Country Learning Review', 'hq | copenhagen', '20261109'),
  item('Rehabilitation of boreholes', 'middle east | syria', '20261110'),
  item('Expired but marked current', 'east africa &amp; great lakes | uganda', '20261001'),
].join('');
const rows = parseDrcTenders(html, '2026-11-04');
assert.equal(rows.length, 1);
assert.equal(rows[0].type, 'tender');
assert.equal(rows[0].deadline, '2026-11-09');
assert.deepEqual(rows[0].countries, ['South Sudan']); // "DRC" is the NGO, not DR Congo
assert.equal(rows[0].url, 'https://drc.ngo/en/tenders/20261109-current/');
assert.throws(() => parseDrcTenders('<html></html>'), /no tender list/);
console.log('drc tests passed');
