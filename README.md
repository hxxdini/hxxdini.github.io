# FundRadar East Africa

Funding intelligence pipeline for East African organizations: every open grant, tender and opportunity, pulled from primary sources, classified, and published as a weekly digest.

## How it works

```
sources (APIs/RSS/scrapers) → normalize + classify → SQLite → weekly digest (md)
```

- `npm run pipeline` — fetch all sources, upsert into `data/fundradar.db`
- `npm run digest` — generate `out/digest-YYYY-MM-DD.md` from live EA-relevant records (prepends `out/editors-note.md` if present)
- `npm run stats` — database breakdown by source/type/country

## Applicant signals

Each opportunity receives a deterministic `applicant_type` label from its title, summary and eligibility tags. The `school_eligible_uganda` flag is set only when a funding call explicitly names schools or educational institutions as applicants and the available text shows Uganda or a broad regional/global scope. Tenders, fellowships and prizes are not flagged as school grants. Records without clear applicant evidence remain `unknown`; confirm all eligibility against the primary source.

The digest places matching calls in a `For schools in Uganda` section, and the dashboard has a matching filter. The curated labeled sample and rule checks run with `npm test`.

## Sources (v1)

| Source | Method | Notes |
|---|---|---|
| World Bank procurement | JSON API v2 | filtered to EA countries, live deadlines |
| EU Funding & Tenders (SEDIA) | multipart search API | open + forthcoming calls, EN |
| UNGM (all UN agencies) | POST search, HTML rows | filtered to EA countries |
| Uganda eGP (PPDA) | HTML tables, 4 tabs | micro-procurement windows are ~1 day; mostly empty on weekends |
| Kenya PPIP (tenders.go.ke) | JSON API | aggressive rate limiting — slow paging + 429 retries |
| Web Radar | Google News RSS + Bing RSS, 7 queries | broad discovery; **unverified leads**, labeled as such |
| AECF (Africa Enterprise Challenge Fund) | HTML, single curated page | low volume (single digits) but current and directly EA-relevant; no published deadlines (rolling windows) |
| fundsforNGOs | RSS | feed capped at 1 item by site — needs page scraper (backlog) |
| Opportunity Desk | RSS | fellowships/prizes |

Dead/backlog: UNDP export feed (404 — UNGM covers UNDP notices), fundsforNGOs category pages (JS-rendered), AfDB, FCDO DevTracker, Tanzania NeST, Rwanda Umucyo, foundation pages (Mastercard, Segal, Hilton), Global Fund, GCF.

## Auto-update

A GitHub Actions workflow (`.github/workflows/daily.yml`) runs the full pipeline **daily at 07:00 EAT**, regenerates the digest and site, and commits `data/` + `out/` back to the repo — the repo is the database, with full history of every change ("git scraping"). Trigger manually with `gh workflow run daily-pipeline`. GitHub runners also dodge the local sandbox's flaky DNS.

## Design decisions

- **East Africa scope**: Uganda, Kenya, Tanzania, Rwanda, Burundi, South Sudan, Ethiopia, Somalia, DRC (`src/normalize.js`).
- **Classification** is keyword-heuristic for now (sectors, eligibility, deadlines, amounts extracted from text). A Claude API enrichment pass is the planned upgrade — the heuristics deliberately live in one file so they can be swapped.
- **Accuracy rule**: every digest item links to its primary source; deadlines come from structured fields where available, text extraction otherwise. Never publish a deadline we can't source.
- **HTTP via curl** with retries (`src/http.js`) — Node's resolver flaked for some hosts in sandboxed local runs; curl is also what a cron VPS will use happily.

## Roadmap

1. More sources (target 40): AfDB, FCDO DevTracker, foundations, embassy small grants
2. Claude API classification pass (better sectors/eligibility, funder name extraction from aggregator posts)
3. Deadline re-verification job (re-fetch source pages within 7 days of publish)
4. Beehiiv integration → weekly send
5. Web app: searchable database + matched alerts (paid tier)
