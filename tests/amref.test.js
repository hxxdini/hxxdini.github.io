import assert from 'node:assert/strict';
import {
  parseAmrefList,
  extractAmrefDeadline,
  detectAmrefCountries,
  extractAmrefDetailBody,
} from '../src/sources/amref.js';

// Three cards taken verbatim from https://amref.org/tenders/ on 2026-11-18:
// Uganda consultancy, Kenya HQ supply tender, Kenya sub-grant RFP.
const LIST_HTML = `
<ul class="tender-grid">
  <li class="tender-card">
    <a class="tender-card__link" href="https://amref.org/tenders/consultancy-to-assess-restore-upgrade-and-strengthen-the-amref-learning-management-system-lms-for-pep-uganda/">
      <p class="tender-card__meta">
        <time datetime="2026-11-17T14:02:48+03:00">17 Nov 2026</time>
      </p>
      <h2 class="tender-card__title">CONSULTANCY TO ASSESS, RESTORE, UPGRADE AND STRENGTHEN THE AMREF LEARNING MANAGEMENT SYSTEM (LMS) FOR PEP UGANDA</h2>
      <p class="tender-card__excerpt">Amref Health Africa Uganda invites applications from interested Individuals (including current service providers) for provision of Consultancy services to assess, restore, upgrade&hellip;</p>
    </a>
  </li>
  <li class="tender-card">
    <a class="tender-card__link" href="https://amref.org/tenders/supply-and-delivery-of-dignity-kits-amref-health-africa-in-kenya-tender-no-amref-13-11-2026-023/">
      <p class="tender-card__meta">
        <time datetime="2026-11-13T06:28:37+03:00">13 Nov 2026</time>
      </p>
      <h2 class="tender-card__title">SUPPLY AND DELIVERY OF DIGNITY KITS Amref Health Africa in Kenya TENDER NO. AMREF /13/11/2026/023</h2>
      <p class="tender-card__excerpt">Amref Health Africa invites sealed bids from eligible candidates for the supply and delivery of dignity kits to Amref Health Africa, Kenya&hellip;</p>
    </a>
  </li>
  <li class="tender-card">
    <a class="tender-card__link" href="https://amref.org/tenders/some-old-closed-tender/">
      <p class="tender-card__meta">
        <time datetime="2026-08-15T06:28:37+03:00">15 Aug 2026</time>
      </p>
      <h2 class="tender-card__title">OLD TENDER NAIROBI KENYA</h2>
      <p class="tender-card__excerpt">Old sample tender.</p>
    </a>
  </li>
</ul>`;

const cards = parseAmrefList(LIST_HTML);
assert.equal(cards.length, 3);
assert.equal(cards[0].url, 'https://amref.org/tenders/consultancy-to-assess-restore-upgrade-and-strengthen-the-amref-learning-management-system-lms-for-pep-uganda/');
assert.match(cards[0].title, /CONSULTANCY TO ASSESS/);
assert.equal(cards[0].published_at, '2026-11-17');
assert.match(cards[0].excerpt, /Amref Health Africa Uganda/);

// Country detection from titles + excerpts
assert.deepEqual(detectAmrefCountries(cards[0].title + ' ' + cards[0].excerpt).sort(), ['Uganda']);
assert.deepEqual(detectAmrefCountries(cards[1].title + ' ' + cards[1].excerpt).sort(), ['Kenya']);
// Kenyan county names map to Kenya
assert.deepEqual(detectAmrefCountries('Sub-grant in Kilifi County').sort(), ['Kenya']);
assert.deepEqual(detectAmrefCountries('Sub-grant in Nakuru County').sort(), ['Kenya']);
// No EA country => empty
assert.deepEqual(detectAmrefCountries('Random boilerplate'), []);

// Deadline extraction: standard "not later than 17:00hrs, 30th November, 2026"
// (with the word-pasted stray space inside "30 th")
const uganda_body = 'Submission should be made through Ugerp.tender@amref.org not later than 17:00hrs, 30 th November, 2026. All clarifications and questions should be addressed to eprequalification.uganda@amref.org not later than 12:00hrs, 27 th November 2026.';
assert.equal(extractAmrefDeadline(uganda_body, '2026-11-18'), '2026-11-30');

// "Closing Date: October 7 th at 12Noon EAT." — past at 2026-11-18, returns null
const past = 'invites proposals from eligible civil society organizations. Closing Date: October 7 th at 12Noon EAT.';
assert.equal(extractAmrefDeadline(past, '2026-11-18'), null);

// Body with no deadline clause => null (we keep the record via first_seen)
assert.equal(extractAmrefDeadline('Amref Health Africa invites sealed bids for delivery of laptops.', '2026-11-18'), null);

// Future "Closing date: 20 December 2026"
assert.equal(extractAmrefDeadline('Closing date: 20 December 2026', '2026-11-18'), '2026-12-20');

// extractAmrefDetailBody isolates the submission text between "invites" and "Share this"
const detail_html = `<html><body><h1>Title</h1>
<script>var x=1;</script>
<main>
  <article class="tender">
    <p>Amref Health Africa Uganda invites applications from service providers.
    Submission should be made through Ugerp.tender@amref.org not later than 17:00hrs, 30 th November, 2026.</p>
    <p>Share this: Tweet Print WhatsApp</p>
    <p>Previous: another tender</p>
  </article>
</main>
</body></html>`;
const body = extractAmrefDetailBody(detail_html);
assert.match(body, /invites applications from service providers/);
assert.match(body, /not later than 17:00hrs, 30 th November, 2026/);
assert.ok(!/Share this/.test(body));
assert.ok(!/Previous:/.test(body));
// Deadline extraction on the body returns the correct ISO date
assert.equal(extractAmrefDeadline(body, '2026-11-18'), '2026-11-30');

// Empty list should throw
assert.throws(() => parseAmrefList('<html></html>'), /no tender cards/);

console.log('amref tests passed');
