// Decide whether the GitHub Pages build for our push has landed.
//
// Why: a pipeline push triggers one Pages build and the workflow POSTs a
// second. GitHub often creates both in the same second for the same commit;
// one of them errors ("Page build failed", a duplicate) while the twin builds
// fine. `pages/builds/latest` can return the errored twin, which failed run
// 44952322805 on 2026-11-21 even though the site was built.
//
// Rule: look at every build for our commit, or created at/after we started
// waiting (a later push from the relay also contains our content).
//   any built                 -> "built"
//   any queued/building       -> "pending"
//   only errored, all older than graceMs -> "errored"
//   otherwise (none yet, or errored but a twin may still appear) -> "pending"

export function pagesStatus(builds, { sha, since, now = Date.now(), graceMs = 120000 } = {}) {
  const sinceMs = since ? Date.parse(since) : NaN;
  const ours = (builds || []).filter((b) => {
    const commit = b.commit || '';
    if (sha && commit && (commit.startsWith(sha) || sha.startsWith(commit))) return true;
    const t = Date.parse(b.created_at);
    return !Number.isNaN(sinceMs) && !Number.isNaN(t) && t >= sinceMs;
  });
  if (ours.some((b) => b.status === 'built')) return 'built';
  if (ours.some((b) => b.status === 'queued' || b.status === 'building')) return 'pending';
  const errored = ours.filter((b) => b.status === 'errored');
  if (errored.length && errored.every((b) => now - Date.parse(b.created_at) >= graceMs)) return 'errored';
  return 'pending';
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Usage: gh api repos/OWNER/REPO/pages/builds | node src/pages-status.js <sha> <sinceISO>
  const [sha, since] = process.argv.slice(2);
  let raw = '';
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    let builds = [];
    try { builds = JSON.parse(raw); } catch { builds = []; }
    process.stdout.write(pagesStatus(Array.isArray(builds) ? builds : [], { sha, since }) + '\n');
  });
}
