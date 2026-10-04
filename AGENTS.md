# FundRadar East Africa (live repo)

Funding intelligence pipeline: open grants, tenders and opportunities for East
Africa, pulled from primary sources, classified, and published as a digest and
a static site at https://hxxdini.github.io. See `README.md` for sources and
design decisions.

## Which folder is which

- GitHub repo `hxxdini/hxxdini.github.io` (public) was renamed from
  `hxxdini/fundradar`. **This folder and `~/code/fundradar` are both clones of
  it.** This one is the working copy; `~/code/fundradar` is an older clone.
- A GitHub Actions bot (`.github/workflows/pipeline.yml`, every 4 hours at :07)
  runs the pipeline and commits `data/`, `out/` and `docs/` back to `main`.
  **Run `git pull --rebase` before any work**, or you will fight the bot.

## Stack

Plain Node (ESM), one dependency (`fast-xml-parser`), SQLite at
`data/fundradar.db`. HTTP goes through curl with retries (`src/http.js`).

## Commands

- `npm run pipeline` fetches every source into `data/fundradar.db`
- `npm run digest` writes `out/digest-YYYY-MM-DD.md`
- `node src/site.js` regenerates the site at `docs/index.html` (GitHub Pages)
- `npm run stats` prints a breakdown by source, type and country
- `gh workflow run fundradar-pipeline` triggers the bot by hand

## Layout

- `src/sources/` has one file per source. Add a source here.
- `src/normalize.js` holds East Africa scope and the keyword classifier.
- `src/notify-telegram.js` sends the Telegram notice.

## Rules

- A source must never fail silently. If it's blocked or returns junk, throw, so
  the run summary and Telegram show it. `pipeline.js` also flags any source with
  no fresh data for 48h as stale. ReliefWeb and Opportunity Desk block GitHub's
  runner IPs.
- Every digest item links to its primary source. Never publish a deadline you
  can't source.
- The repo is public. Never commit tokens. Telegram credentials come from
  GitHub Actions secrets.
- The bidder lead scraper (egpuganda bidders and suppliers) moved to the private
  repo `~/code/egp-leads` on 2026-10-04. Keep scraped contact data out of here.
