# Changelog

All notable changes to Snap Rank Fantasy, in plain English, newest first.

## v0.03 — 2026-08-13

- **New: Stats Hub** (`stats.html`) — search any player, filter by position, click through to a full profile
- **Season-by-season history** with a dropdown to browse any year a player's played
- **Color-coded stat ranks** (green = elite, red = poor) for every stat, computed against the full league at that position that season
- **Veteran comp tool** — for any established player/season, shows 5 real historical players at the same position and career stage with a similar per-game rate, and what they *actually* did the following year (verified: real 9th-year RB comps all showing realistic decline, not cherry-picked outcomes)
- **Rookie comp tool** — for anyone with no NFL stats yet, shows real historical players drafted around the same slot and what they did as rookies (verified against Jeremiyah Love, pick 3 — real comps include both hits like Ezekiel Elliott and busts like Cedric Benson)
- Known limitation: the three new data files powering this (`player-history.js`, `comp-pool.js`, `rookie-comp-pool.js`) are static snapshots, not yet part of the automated weekly refresh — a follow-up task, not forgotten

## v0.02 — 2026-08-12

- **Removed Sleeper entirely** — the last remaining commercial-licensing question mark in the project. Rookie/current-team data now comes from nflverse's roster feed instead (CC-BY 4.0, fully commercial-safe), verified accurate against real trades and free-agent departures
- **Player headshots** added to every card, sourced from nflverse (99%+ coverage), with a graceful fallback if an image ever fails to load
- **Automated weekly data refresh** — a GitHub Action (`build_data.py` + `.github/workflows/refresh-data.yml`) now rebuilds `data.js` from fresh nflverse data every Tuesday automatically, with retry logic for transient network hiccups. No more manual rebuilds needed to keep stats/rosters current through the season
- Logo, sidebar, and About page from the previous round, now fully integrated
- Data foundation laid for the upcoming Stats Hub (player history + veteran comp pool), not yet wired into a page

## v0.01 — 2026-08-12

First versioned release. Includes everything built up to this point:

- Head-to-head ranking tool for RB / QB / WR / TE, plus a merged Overall board
- Real 2025 stats and 2026 schedule (nflverse), live rosters (Sleeper)
- Scoring format toggle (PPR / Half PPR / Standard)
- Rest-of-Season and Weekly (matchup-adjusted) ranking modes
- Tiers, undo, skip player, remove player, drag-and-drop reordering
- Search to add a missing player mid-session
- Rookie draft-capital seeding, with historical range shown on the card
- Downloadable rankings (text, PDF cheat sheet, Excel workbook)
- Progress auto-saves in the browser; resumable if you close the tab
- SEO basics (meta tags, sitemap, robots.txt, structured data)
- Cloudflare Web Analytics
- Legal disclaimer footer
- New: sidebar navigation with logo, persistent format/ranking-type controls
- New: About page (why the site exists, how it works, data credits)
- New: shared `styles.css` and `data.js`, so every page pulls from one source of truth instead of duplicating the design or the player data
