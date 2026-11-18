import assert from 'node:assert/strict';
import { computeStaleSources, STALE_HOURS } from '../src/stale.js';

// A freshly-ingested source with recent last_seen is never stale.
{
  const now = Date.parse('2026-11-19T00:00:00Z');
  const latest = [{ source: 'A', latest: '2026-11-18T22:00:00Z' }];
  const out = computeStaleSources(latest, [{ name: 'A', error: null }], now);
  assert.equal(out.length, 0);
}

// Classic rot: source hasn't written in weeks and did not fetch this run.
{
  const now = Date.parse('2026-11-19T00:00:00Z');
  const latest = [{ source: 'Rotten', latest: '2026-11-01T00:00:00Z' }];
  const out = computeStaleSources(latest, [{ name: 'Rotten', error: 'HTTP 500' }], now);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'Rotten');
  assert.ok(out[0].days > 17);
}

// The Prosper Global case: last confirmed EA data 10.9 days ago, but this run
// fetched cleanly (just with 0 EA rows). Must NOT be flagged.
{
  const now = Date.parse('2026-11-19T00:00:00Z');
  const latest = [{ source: 'Prosper Global', latest: '2026-11-08T03:12:00Z' }];
  const out = computeStaleSources(
    latest,
    [{ name: 'Prosper Global', fetched: 5, added: 0, error: null }],
    now,
  );
  assert.equal(out.length, 0);
}

// Threshold boundary: just under STALE_HOURS is not stale regardless of run outcome.
{
  const now = Date.parse('2026-11-19T00:00:00Z');
  const cutoff = new Date(now - (STALE_HOURS - 1) * 3600 * 1000).toISOString();
  const latest = [{ source: 'Edge', latest: cutoff }];
  const out = computeStaleSources(latest, [{ name: 'Edge', error: 'boom' }], now);
  assert.equal(out.length, 0);
}

console.log('stale test: passed');
