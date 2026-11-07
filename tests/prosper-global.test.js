import assert from 'node:assert/strict';
import { parseProsperGlobalTenders } from '../src/sources/prosper_global.js';

// Matches the live Drupal layout on /tenders: each tender is a c-view__row
// with a titled link, a country field and two <time datetime="…"> tags for
// the open-to-close window.
const row = (title, href, country, openIso, closeIso) => `
<div  class="c-view__row">
  <div  class="c-button-box">
    <a href="${href}" class="c-button-box__link"><h3 class="c-button-box__title">${title}</h3></a>
    <div class="c-button-box__summary">
      <div  class="c-field c-field--name-field-countries c-field--type-entity-reference c-field--label-inline">
        <div  class="c-field__label is-inline">Country of destination</div>
        <div class="c-field__content">${country}</div>
      </div>
      <div  class="c-field c-field--name-field-date c-field--type-daterange c-field--label-inline">
        <div  class="c-field__label is-inline">Open date</div>
        <div class="c-field__content"><time datetime="${openIso}">open</time> to <time datetime="${closeIso}">close</time></div>
      </div>
    </div>
  </div>
</div>`;

const html = `<html><body><div class="c-view c-view--tenders c-view--display-default view">
  <div class="c-view__content">
    ${row('Intent to Bid REF# 2027-338 Piglets ProTierra - Colombia', '/tenders/colombia-piglets', 'Colombia', '2026-11-05T18:54:57Z', '2026-11-12T07:55:00Z')}
    ${row('Intent to Bid REF# PGK-NBO-LPT Laptops - Kenya', '/tenders/kenya-laptops', 'Kenya', '2026-11-03T00:07:41Z', '2026-11-07T01:00:00Z')}
    ${row('Intent to Bid REF# PR00126 SPiRiT Ethiopia Programme', '/tenders/ethiopia-spirit', 'Ethiopia', '2026-10-28T22:51:51Z', '2026-11-07T01:00:00Z')}
    ${row('Expired Uganda Tender', '/tenders/uganda-expired', 'Uganda', '2026-10-01T00:00:00Z', '2026-10-15T00:00:00Z')}
    ${row('Intent to Bid Jordan WASH', '/tenders/jordan-wash', 'Jordan', '2026-11-05T00:00:00Z', '2026-11-20T00:00:00Z')}
  </div>
  <div class="c-view__footer"></div>
</div></body></html>`;

const rows = parseProsperGlobalTenders(html, '2026-11-07');
assert.equal(rows.length, 2, `expected 2 open EA tenders, got ${rows.length}`);

const kenya = rows.find((r) => r.url.endsWith('/tenders/kenya-laptops'));
assert.ok(kenya, 'kenya row missing');
assert.equal(kenya.source, 'Prosper Global (formerly Mercy Corps)');
assert.equal(kenya.funder, 'Prosper Global');
assert.equal(kenya.type, 'tender');
assert.equal(kenya.deadline, '2026-11-07');
assert.equal(kenya.published_at, '2026-11-03');
assert.deepEqual(kenya.countries, ['Kenya']);
assert.ok(kenya.url.startsWith('https://www.prosperglobal.org/'), `absolute url expected, got ${kenya.url}`);
assert.ok(kenya.id && kenya.id.length > 0, 'id must be set');
assert.ok(/Country: Kenya/.test(kenya.summary), 'summary names country');

const ethiopia = rows.find((r) => r.url.endsWith('/tenders/ethiopia-spirit'));
assert.ok(ethiopia, 'ethiopia row missing');
assert.deepEqual(ethiopia.countries, ['Ethiopia']);
assert.equal(ethiopia.deadline, '2026-11-07');

// Expired Uganda and non-EA rows must be excluded.
assert.ok(!rows.some((r) => r.url.includes('uganda-expired')), 'expired tender leaked through');
assert.ok(!rows.some((r) => r.url.includes('colombia')), 'non-EA tender leaked through');
assert.ok(!rows.some((r) => r.url.includes('jordan')), 'non-EA tender leaked through');

// Layout-change guard: empty page must raise, not silently return [].
assert.throws(() => parseProsperGlobalTenders('<html></html>'), /no tender rows/);

console.log('prosper-global tests passed');
