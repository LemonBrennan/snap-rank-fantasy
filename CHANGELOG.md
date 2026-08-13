# Changelog

All notable changes to Snap Rank Fantasy, in plain English, newest first.

## v0.12 — 2026-08-14

- **New: rankings now seed from real community consensus, not just 2025 PPG, once there's enough data** — a player the crowd genuinely rates highly now surfaces near the top of the pool even if their raw stats look quiet, exactly the "underrated by the numbers, rated by real people" case this was built for
- **Confidence threshold**: a player needs 5+ real community rankings before consensus overrides the stats-based order; below that, seeding works exactly as it always has, so one or two early opinions can't distort what anyone else sees
- Scoped to Rest-of-Season rankings for now (Weekly matchup mode still uses stats-based seeding only, since consensus data doesn't have a weekly breakdown yet)
- Verified directly: a statistically quiet player with 8 confident community rankings jumped from where their stats alone would place them (deep in the pack) to right near their real consensus rank. The identical stat line with only 2 rankers correctly stayed exactly where the stats-based model would put it
- A real ordering bug was caught and fixed while building this: `auth.js` (which sets up the database connection) loads *after* the main script block, so the consensus data fetch was initially wired to run before that connection existed. Fixed using the same "wait for the ready signal" pattern already used elsewhere in the site, rather than assuming load order

## v0.11 — 2026-08-14

- **New: Community Consensus page** (`consensus.html`) — shows real aggregated rankings pulled from everyone's submitted data, not just one person's board
- Filter by format (PPR/Half/Standard) and board (Overall, RB, QB, WR, TE)
- Each player shows their average community rank, the range of ranks they've received (best-worst), and how many people have ranked them
- **Players with too few rankers get flagged** rather than hidden or silently trusted — under 5 rankers shows a warning, since a rank built on 2 people's opinions isn't a real consensus yet
- On the Overall board specifically, each player's own position-specific consensus rank shows alongside their overall one, when available
- Publicly viewable by anyone, logged in or not — reads from the `community_averages` view, which only ever exposes averaged numbers, never which individual person ranked what
- Added to the sidebar nav on every page
- Tested against realistic seed data: correct sorting, correct thin-sample flagging, and a genuinely empty board (Overall, since no Overall ranking has been submitted yet) shows an honest "no data yet" message instead of breaking or showing nothing

## v0.10 — 2026-08-14

- **New: "Add More Players"** — once a ranking is finished, a new button lets you extend it with the next batch of recommended players (you choose how many) instead of redoing everything or hunting for them one at a time via search
- Every newly added player gets compared against your **entire existing list**, not just against each other or appended at the end — verified directly: added a rookie in a test run and it correctly slotted in at #1 based on comparisons against all 5 already-ranked players, exactly as if it had been part of the original ranking
- Works for both single-position and Overall rankings. For Overall specifically, verified new players still respect within-position ordering (new WRs land among the WRs, new RBs among the RBs), matching how the initial merge already works
- The button only appears when there's actually more to add — hidden once you've ranked every available player at that position
- Fully tested against real ranking state, not just visually: confirmed correct player counts, zero duplicates, and comparisons correctly resuming mid-flow with the right progress counter

## v0.09.1 — 2026-08-13

- **Fixed: 128 players were showing stale teams** — the automated data build only used the current-roster file to *add* brand-new players (rookies), but never used it to *update* the team of anyone who already had 2025 stats. So anyone traded or signed elsewhere since their 2025 season kept showing their old team indefinitely. Caught via three real examples (Travis Etienne → now correctly New Orleans, Rico Dowdle → Pittsburgh, Kenny Gainwell → Tampa Bay) and fixed for everyone, not just those three
- **A second bug found while fixing the first**: Kenny Gainwell specifically still showed the wrong team even after the first fix, because the correction logic matched names literally ("Kenny" vs. the roster's "Kenneth") instead of using the nickname-aware matching already used elsewhere in the pipeline. Fixed the same way draft-info matching already handles this
- Verified: 128 corrections applied, a stable player with no real move (Christian McCaffrey) confirmed unaffected, and all team codes still valid
- `data.js` regenerated with the fix; `build_data.py` updated so future automated refreshes won't reintroduce this

## v0.09 — 2026-08-13

- **New: `ranking_entries` table** (`supabase-schema-ranking-entries.sql`) — one row per player per ranking, instead of everyone's picks being buried inside one big bundle each. This is what makes "what does everyone think of this player" a fast, simple question instead of an impossible one
- **New: `community_averages` view** — a safe, public-readable aggregate (average rank, number of rankers, best/worst rank per player) that never exposes which individual user picked what. This is the actual data source the future "community average" display will read from
- Save logic now populates this automatically alongside the existing save — no separate action needed, it just happens
- **Verified re-saving doesn't duplicate**: finished a 5-player ranking (5 entries created), then reordered it — still exactly 5 entries afterward, correctly reflecting the new order, not 10
- This table alone doesn't change anything visible on the site yet — it's the data plumbing the community-average feature will be built on top of next

## v0.08 — 2026-08-13

- **New: "My Rankings" panel** (`my-rankings.js`) — a link next to Log Out (only shown once logged in) opens a list of every ranking you've saved to your account
- Each saved ranking shows its position/format/mode, whether it's finished or still in progress, and when it was last updated
- **Resume** — continue exactly where you left off, including using "search to add a missing player" the same way as any other ranking, since resuming reuses the exact same mechanism as everywhere else on the site
- **Re-rank** — start that same position/format/mode completely fresh, if you'd rather redo it than continue it
- **Delete** — remove a saved ranking permanently, with a confirmation prompt first
- Tested end-to-end against a simulated backend: seeded two saved rankings, verified the list displays both correctly, then verified Resume, Re-rank, and Delete each work correctly against the database, including two real gaps caught and fixed in the test mock along the way (it wasn't matching how the real Supabase client resolves queries or handles deletes) so this was a genuine test, not a false pass

## v0.07.1 — 2026-08-13

- **Fixed: every save created a duplicate row instead of updating one** — the `week` column was `NULL` for Rest-of-Season rankings, and Postgres never treats two `NULL`s as equal, so the "prevent duplicates" rule silently never applied. Fixed by using `0` (never a real week number) instead of `NULL`. Verified: 6 saves to the same ranking now correctly produce 1 row instead of 6
- **`cleanup-duplicates.sql`** — new one-time script to remove the duplicate rows already created by this bug and normalize existing data to match the fix. Run once in the SQL Editor, then this won't be needed again

## v0.07 — 2026-08-13

- **New: cloud-saved rankings** — logged-in users' rankings now save to their account (Supabase), not just their browser. Requires running `supabase-schema.sql` once in your Supabase SQL Editor before this works (creates the `user_rankings` table with Row Level Security, so each user can only ever see their own data)
- **Cloud is authoritative once logged in** — if you have a ranking saved to your account, that's what loads, on any device or browser
- **Automatic one-time upload** — if you ranked something before logging in (or on a browser that's never synced), logging in immediately uploads it to become your cloud copy, rather than requiring a second save
- **Fixed: account email overflowing the sidebar** — the truncation CSS was missing a width to actually truncate against
- Tested against a full simulated Supabase backend (auth + the database query layer): verified an anonymous ranking correctly uploads on login, and a cloud-saved ranking correctly offers to resume and restores exactly on a fresh page load (simulating a new device)
- Not yet tested against the real Supabase project — same honest caveat as the accounts feature, please confirm once deployed

## v0.06.1 — 2026-08-13

- **Fixed: email confirmation links pointed to localhost instead of the real site** — Supabase projects default to `http://localhost:3000` as the "Site URL," which is why confirmation emails were sending people to a page that doesn't exist for them. Two changes: `auth.js` now explicitly tells Supabase where to redirect (`window.location.origin`, so it always matches wherever the site is actually running), and **the Supabase dashboard's Site URL / Redirect URLs need to be updated to `https://snap-rank-fantasy.com` manually** — this is a one-time dashboard setting, not something deploying new code fixes on its own

## v0.06 — 2026-08-13

- **New: accounts** — Log In / Sign Up available from the sidebar on every page (`auth.js`, powered by Supabase). Sign up, confirm your email, log in, log out — all working
- This is the foundation everything else builds on: cloud-saved rankings, community averages, and the ad-removal payment will all check the same "is this user logged in" state this sets up
- Tested end-to-end against a simulated Supabase backend (sign-up, login, logout, and the auth-state-driven UI update all verified) since the real Supabase domain isn't reachable from my build environment — **please confirm actual sign-up/login works once deployed**, since this is the one part of this update I couldn't test against the real service
- Nothing else changed for existing users — no accounts required to use any part of the site as before

## v0.05 — 2026-08-13

- **Fixed: Stats Hub was silently locked to PPR everywhere** — added a real Full PPR / Half PPR / Standard selector (on the browse grid, and again inside the player profile modal since the modal covers the page and the outer selector isn't clickable while it's open)
- This wasn't just a label swap — **ranks now genuinely recompute per format**, since a player's rank shifts between scoring systems (verified: Christian McCaffrey's 2025 season is #1 in PPG for PPR and Half PPR, but #2 in Standard, because removing reception value changes his standing relative to other backs)
- The veteran comp tool now matches and displays using whichever format is selected, not a hardcoded PPR number
- Team-color player cards and the "(2025)" season label added to the Stats Hub grid and profile modal
- Fixed player headshots not displaying — switched from NFL.com's CDN to ESPN's, which is more reliably embeddable on third-party sites

## v0.04 — 2026-08-13

- **New: Stats Hub** (`stats.html`) — search any player, filter by position, click through to a full profile
- **Season-by-season history** with a dropdown to browse any year a player's played
- **Color-coded stat ranks** (green = elite, red = poor) for every stat, computed against the full league at that position that season
- **Veteran comp tool** — for any established player/season, shows 5 real historical players at the same position and career stage with a similar per-game rate, and what they *actually* did the following year (verified: real 9th-year RB comps all showing realistic decline, not cherry-picked outcomes)
- **Rookie comp tool** — for anyone with no NFL stats yet, shows real historical players drafted around the same slot and what they did as rookies (verified against Jeremiyah Love, pick 3 — real comps include both hits like Ezekiel Elliott and busts like Cedric Benson)
- **Fixed: player headshots not displaying** — switched from NFL.com's image CDN to ESPN's (95.9% coverage in the current pool, NFL.com kept as fallback), since ESPN's CDN is the one most third-party fantasy sites use specifically because it embeds reliably elsewhere. Not independently verified in a live browser (I can't load external images from my build environment) — please confirm this actually fixed it once deployed
- Known limitation: the three new data files powering the Stats Hub (`player-history.js`, `comp-pool.js`, `rookie-comp-pool.js`) are static snapshots, not yet part of the automated weekly refresh — a follow-up task, not forgotten

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
