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
