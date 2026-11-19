import assert from 'node:assert/strict';
import { UNGM_HEADERS } from '../src/sources/ungm.js';
import { BROWSER_UA } from '../src/http.js';

// UNGM's WAF 403s bot-style agents (BidRadar/0.1, curl) since 2026-11-19 — every
// UNGM request must go out with a plain desktop-browser User-Agent.
{
  const ua = UNGM_HEADERS['User-Agent'];
  assert.equal(ua, BROWSER_UA);
  assert.match(ua, /^Mozilla\/5\.0 \(Macintosh;.*Chrome\/\d+/);
  assert.doesNotMatch(ua, /compatible;|bot|curl/i);
}

// The source file must not hard-code the old bot UA anywhere.
{
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/sources/ungm.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /BidRadar\/0\.1/);
  assert.match(src, /fetchRetry\('https:\/\/www\.ungm\.org\/Public\/Notice', \{ headers: UNGM_HEADERS \}\)/);
}

console.log('ungm.test.js ok');
