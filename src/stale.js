// Decide which sources look rotten: newest last_seen older than STALE_HOURS AND
// the run itself didn't successfully fetch from them. A source that cleanly
// served non-EA data today is healthy, not stale (Prosper Global tripped this
// for 10.9 days while its /tenders page kept returning Colombia/Jordan rows).
export const STALE_HOURS = 48;

export function computeStaleSources(latestBySource, perSource, now = Date.now()) {
  const okThisRun = new Set(perSource.filter((p) => p.error === null).map((p) => p.name));
  return latestBySource
    .map((r) => ({ source: r.source, hoursSince: (now - new Date(r.latest).getTime()) / 3600000 }))
    .filter((r) => r.hoursSince > STALE_HOURS && !okThisRun.has(r.source))
    .map((r) => ({ source: r.source, days: Number((r.hoursSince / 24).toFixed(1)) }));
}

// Silent zero: a source that fetched more than SILENT_ZERO_MIN records in each
// of its last SILENT_ZERO_RUNS runs and now returns 0 with no error. Uganda eGP
// sat at 0 for two runs (2026-11-22) and fundsforNGOs did the same after a
// swallowed Cloudflare 403; both looked healthy in the run summary.
// `history` maps source name -> fetched counts of earlier runs, newest first.
export const SILENT_ZERO_MIN = 20;
export const SILENT_ZERO_RUNS = 3;

export function computeSilentZeros(history, perSource) {
  return perSource
    .filter((p) => p.error === null && p.fetched === 0)
    .map((p) => ({ source: p.name, prior: (history[p.name] ?? []).slice(0, SILENT_ZERO_RUNS) }))
    .filter((r) => r.prior.length === SILENT_ZERO_RUNS && r.prior.every((n) => n > SILENT_ZERO_MIN))
    .map((r) => ({ source: r.source, prior: r.prior }));
}
