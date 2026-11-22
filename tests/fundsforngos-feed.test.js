import assert from 'node:assert/strict';
import { fetchFundsForNgos } from '../src/sources/rss.js';
import { RELAY_SOURCES } from '../src/relay.js';

const item = (slug) => ({
  title: `Call for Proposals: ${slug}`,
  link: `https://www.fundsforngos.org/how-to-apply/${slug}/`,
  description: 'Grants for NGOs in Uganda and Kenya.',
  pubDate: 'Sun, 22 Nov 2026 10:00:00 +0000',
});
const quiet = console.error;
console.error = () => {};
try {
  // Both feeds blocked (Cloudflare 403 on GitHub runners): must throw, not return a silent 0.
  const blocked = async (url) => { throw new Error(`${url} HTTP 403`); };
  await assert.rejects(fetchFundsForNgos({ feedFetcher: blocked }), /all fundsforNGOs feeds failed: .*HTTP 403/);

  // One feed blocked: keep the other feed's records, flag partial.
  const half = async (url) => {
    if (url.includes('cat=africa')) throw new Error(`${url} HTTP 403`);
    return [item('call-for-proposals-water-uganda')];
  };
  const partial = await fetchFundsForNgos({ feedFetcher: half });
  assert.equal(partial.length, 1);
  assert.match(partial.partial, /1\/2 feeds failed .*HTTP 403/);

  // Both feeds fine: duplicates merged, no partial flag, Africa feed forces ea_relevant.
  const ok = async (url) => (url.includes('cat=africa')
    ? [item('call-for-proposals-water-uganda'), item('call-for-proposals-youth-kenya')]
    : [item('call-for-proposals-water-uganda')]);
  const full = await fetchFundsForNgos({ feedFetcher: ok });
  assert.equal(full.length, 2);
  assert.equal(full.partial, undefined);
  assert.equal(full.find((r) => r.url.includes('youth-kenya')).ea_relevant, 1);
} finally {
  console.error = quiet;
}

// The Mac relay must fetch fundsforNGOs so the pipeline has a fallback.
assert.equal(RELAY_SOURCES.fundsforngos, fetchFundsForNgos);
console.log('fundsforngos feed tests passed');
