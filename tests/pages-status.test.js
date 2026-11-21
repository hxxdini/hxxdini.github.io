import assert from 'node:assert';
import { pagesStatus } from '../src/pages-status.js';

const now = Date.parse('2026-11-21T21:45:00Z');
const sha = 'c7470efa0000000000000000000000000000abcd';
const opts = { sha, since: '2026-11-21T21:40:30Z', now };

// Real case from run 44952322805: errored twin + built twin, same commit, same second.
assert.strictEqual(pagesStatus([
  { created_at: '2026-11-21T21:40:41Z', status: 'built', commit: sha },
  { created_at: '2026-11-21T21:40:41Z', status: 'errored', commit: sha },
  { created_at: '2026-11-21T17:09:49Z', status: 'built', commit: 'f352652f' },
], opts), 'built');

// Errored twin listed first, other still building -> pending, not failure.
assert.strictEqual(pagesStatus([
  { created_at: '2026-11-21T21:40:41Z', status: 'errored', commit: sha },
  { created_at: '2026-11-21T21:40:41Z', status: 'building', commit: sha },
], opts), 'pending');

// Only an errored build, just created -> wait for a possible twin.
assert.strictEqual(pagesStatus([
  { created_at: '2026-11-21T21:44:30Z', status: 'errored', commit: sha },
], opts), 'pending');

// Only errored builds, past grace -> errored.
assert.strictEqual(pagesStatus([
  { created_at: '2026-11-21T21:40:41Z', status: 'errored', commit: sha },
  { created_at: '2026-11-21T21:40:42Z', status: 'errored', commit: sha },
], opts), 'errored');

// Old builds of other commits don't count, even if built.
assert.strictEqual(pagesStatus([
  { created_at: '2026-11-21T17:09:49Z', status: 'built', commit: 'f352652f' },
], opts), 'pending');

// A later push (e.g. relay) that built after we started counts.
assert.strictEqual(pagesStatus([
  { created_at: '2026-11-21T21:43:00Z', status: 'built', commit: 'deadbeef' },
  { created_at: '2026-11-21T21:40:41Z', status: 'errored', commit: sha },
], opts), 'built');

// Garbage input -> pending.
assert.strictEqual(pagesStatus(null, opts), 'pending');

console.log('pages-status tests passed');
