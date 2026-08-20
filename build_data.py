#!/usr/bin/env python3
"""
Snap Rank Fantasy -- automated data rebuild.

Pulls fresh player stats, schedule, draft, and roster data from nflverse
(CC-BY 4.0, no licensing restrictions) and regenerates data.js from scratch.
Designed to run unattended via GitHub Actions on a schedule.

To update for a new NFL season, change the two config values below --
everything else adapts automatically.
"""
import pandas as pd
import numpy as np
import json
import re
import time
import urllib.request

# ---------- Config: update these once per year ----------
STATS_SEASON = 2025    # most recently COMPLETED season (source of player stats)
SCHEDULE_SEASON = 2026 # the season currently being drafted for (source of matchups)
CURRENT_SEASON = 2026  # used for rookie-experience calculations (2026 draft class = 0 exp)
# ----------------------------------------------------------

POSITIONS = ['QB', 'RB', 'WR', 'TE']
TEAM_REMAP = {'JAX': 'JAC', 'LA': 'LAR', 'AZ': 'ARI'}

NICKNAMES = {
    'kenny':'kenneth','mike':'michael','josh':'joshua','matt':'matthew','chris':'christopher',
    'nick':'nicholas','alex':'alexander','tony':'anthony','dan':'daniel','danny':'daniel',
    'joe':'joseph','joey':'joseph','will':'william','bill':'william','billy':'william',
    'rob':'robert','bobby':'robert','bob':'robert','jim':'james','jimmy':'james',
    'ken':'kenneth','tom':'thomas','tommy':'thomas','sam':'samuel','sammy':'samuel',
    'zach':'zachary','zack':'zachary','ben':'benjamin','andy':'andrew','drew':'andrew',
    'greg':'gregory','steve':'steven','pat':'patrick','ed':'edward','eddie':'edward',
    'charlie':'charles','chuck':'charles','dave':'david','ronnie':'ronald','ron':'ronald',
}

def normalize(name):
    s = str(name).lower()
    s = re.sub(r"[.'\u2019-]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def normalize_nick(name):
    base = normalize(name)
    parts = base.split(' ')
    if parts and parts[0] in NICKNAMES:
        parts[0] = NICKNAMES[parts[0]]
    return ' '.join(parts)

def fetch_csv(url, dest, retries=4):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
            with open(dest, 'wb') as f:
                f.write(data)
            return pd.read_csv(dest, low_memory=False)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise  # permanent -- the file genuinely doesn't exist yet, retrying won't help
            last_err = e
            wait = 5 * (attempt + 1)
            print(f'  fetch failed ({e}), retrying in {wait}s... (attempt {attempt+1}/{retries})')
            time.sleep(wait)
        except Exception as e:
            last_err = e
            wait = 5 * (attempt + 1)
            print(f'  fetch failed ({e}), retrying in {wait}s... (attempt {attempt+1}/{retries})')
            time.sleep(wait)
    raise RuntimeError(f'Failed to fetch {url} after {retries} attempts: {last_err}')

print(f'Building data.js for {SCHEDULE_SEASON} season using {STATS_SEASON} stats...')

# ---------- 1. Player stats for the most recent completed season ----------
stats = fetch_csv(
    f'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{STATS_SEASON}.csv',
    'stats_current.csv'
)
stats = stats[stats['season_type'] == 'REG']
stats = stats[stats['position'].isin(POSITIONS)]
stats['team'] = stats['team'].replace(TEAM_REMAP)

grouped = stats.groupby(['player_display_name', 'position', 'team']).agg(
    games=('week', 'nunique'), total_pts=('fantasy_points_ppr', 'sum'),
    rushing_yards=('rushing_yards', 'sum'), rushing_tds=('rushing_tds', 'sum'), carries=('carries', 'sum'),
    receptions=('receptions', 'sum'), targets=('targets', 'sum'),
    receiving_yards=('receiving_yards', 'sum'), receiving_tds=('receiving_tds', 'sum'),
    passing_yards=('passing_yards', 'sum'), passing_tds=('passing_tds', 'sum'),
    passing_interceptions=('passing_interceptions', 'sum'),
    completions=('completions', 'sum'), attempts=('attempts', 'sum'),
    sacks_suffered=('sacks_suffered', 'sum'),
).reset_index()

position_data = {pos: [] for pos in POSITIONS}
for _, row in grouped.iterrows():
    g = max(row['games'], 1)
    pos = row['position']
    if pos != 'QB':
        s = {
            'rushAtt': round(row['carries']/g,1), 'rushYds': round(row['rushing_yards']/g,1), 'rushTds': round(row['rushing_tds']/g,1),
            'tgt': round(row['targets']/g,1), 'rec': round(row['receptions']/g,1), 'recYds': round(row['receiving_yards']/g,1), 'recTds': round(row['receiving_tds']/g,1),
        }
    else:
        pass_pct = round(row['completions']/row['attempts']*100,1) if row['attempts']>0 else 0
        s = {
            'passComp': round(row['completions']/g,1), 'passAtt': round(row['attempts']/g,1), 'passPct': str(pass_pct),
            'passYds': round(row['passing_yards']/g,1), 'passTds': round(row['passing_tds']/g,1), 'passInt': round(row['passing_interceptions']/g,1),
            'rushAtt': round(row['carries']/g,1), 'rushYds': round(row['rushing_yards']/g,1), 'rushTds': round(row['rushing_tds']/g,1),
            'sacks': round(row['sacks_suffered']/g,1),
        }
    position_data[pos].append({'name': row['player_display_name'], 'team': row['team'], 'hasStats': True, 'stats': s, '_totalPts': row['total_pts']})

for pos in POSITIONS:
    position_data[pos].sort(key=lambda p: p['_totalPts'], reverse=True)
    for p in position_data[pos]:
        del p['_totalPts']

print('Player stats:', {pos: len(v) for pos, v in position_data.items()})

# ---------- 2. Defense vs position (matchup difficulty) ----------
allowed = stats.groupby(['opponent_team','position','week'])['fantasy_points'].sum().reset_index()
allowed_avg = allowed.groupby(['opponent_team','position'])['fantasy_points'].mean().reset_index()
league_avg = allowed_avg.groupby('position')['fantasy_points'].mean().to_dict()
allowed_avg['factor'] = allowed_avg.apply(lambda r: round(r['fantasy_points']/league_avg[r['position']],3), axis=1)
def_vs_position = {}
for _, row in allowed_avg.iterrows():
    team = TEAM_REMAP.get(row['opponent_team'], row['opponent_team'])
    def_vs_position.setdefault(team, {})[row['position']] = row['factor']

# ---------- 3. Schedule ----------
games = fetch_csv('https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv', 'games.csv')
games_season = games[(games['season'] == SCHEDULE_SEASON) & (games['game_type'] == 'REG')]
team_schedule = {}
week_dates = {}
for _, g in games_season.iterrows():
    wk = int(g['week'])
    home, away = TEAM_REMAP.get(g['home_team'], g['home_team']), TEAM_REMAP.get(g['away_team'], g['away_team'])
    team_schedule.setdefault(home, {})[wk] = away
    team_schedule.setdefault(away, {})[wk] = home
    if wk not in week_dates or g['gameday'] < week_dates[wk]:
        week_dates[wk] = g['gameday']
max_week = max(week_dates.keys())
for team in team_schedule:
    for wk in range(1, max_week+1):
        team_schedule[team].setdefault(wk, None)

# ---------- 4. Draft picks -> draft info + rookie seed models ----------
draft = fetch_csv('https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv', 'draft_picks.csv')
draft_all = draft[draft['position'].isin(POSITIONS)].copy()
draft_all['norm_name'] = draft_all['pfr_player_name'].apply(normalize_nick)

draft_lookup = {}
for _, row in draft_all.sort_values('season').iterrows():
    key = row['norm_name'] + '|' + row['position']
    draft_lookup[key] = {
        'year': int(row['season']), 'round': int(row['round']), 'pick': int(row['pick']),
        'college': row['college'] if pd.notna(row['college']) else None,
    }

# Attach draft info to current stats-based players
matched = 0
for pos, players in position_data.items():
    for p in players:
        key = normalize_nick(p['name']) + '|' + pos
        p['draft'] = draft_lookup.get(key)
        if p['draft']: matched += 1
print(f'Draft info matched: {matched} of {sum(len(v) for v in position_data.values())}')

# Rookie seed model: historical draft-pick -> rookie-year positional finish (2000-2024)
old_stats = fetch_csv(
    'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv',
    'player_stats_history.csv'
)
old_stats_reg = old_stats[old_stats['season_type']=='REG']
season_totals = old_stats_reg.groupby([old_stats_reg['player_display_name'].apply(normalize),'position','season'])['fantasy_points_ppr'].sum().reset_index()
season_totals.columns = ['norm_name','position','season','fantasy_points_ppr']
season_totals['pos_rank'] = season_totals.groupby(['position','season'])['fantasy_points_ppr'].rank(ascending=False, method='min')

hist_draft = draft_all[(draft_all['season']>=2000) & (draft_all['season']<=2024)]
merged = hist_draft.merge(season_totals, on=['norm_name','position','season'], how='inner')

BUCKETS = [(1,5),(6,10),(11,15),(16,20),(21,32),(33,45),(46,64),(65,90),(91,130),(131,180),(181,300)]
def bucket_label(pick):
    for lo, hi in BUCKETS:
        if lo <= pick <= hi: return f'{lo}-{hi}'
    return '300+'
merged['pick_bucket'] = merged['pick'].apply(bucket_label)

rookie_seed_model = {}
for pos in POSITIONS:
    rookie_seed_model[pos] = {}
    sub = merged[merged['position']==pos]
    for bucket, grp in sub.groupby('pick_bucket'):
        if len(grp) >= 5:
            rookie_seed_model[pos][bucket] = {'low': int(grp['pos_rank'].quantile(0.25)), 'high': int(grp['pos_rank'].quantile(0.75)), 'median': int(grp['pos_rank'].median()), 'n': len(grp)}

rookie_round_model = {}
for pos in POSITIONS:
    rookie_round_model[pos] = {}
    sub = merged[merged['position']==pos]
    for rnd, grp in sub.groupby('round'):
        if len(grp) >= 5:
            rookie_round_model[pos][str(rnd)] = {'low': int(grp['pos_rank'].quantile(0.25)), 'high': int(grp['pos_rank'].quantile(0.75)), 'median': int(grp['pos_rank'].median()), 'n': len(grp)}

# Recent draft classes for matching against current roster (rookie lookups)
recent_draft = {k: v for k, v in draft_lookup.items() if v['year'] >= CURRENT_SEASON - 3}

# ---------- 5. Current roster (replaces need for any live client-side fetch) ----------
roster = fetch_csv(
    f'https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{SCHEDULE_SEASON}.csv',
    'roster_current.csv'
)
roster = roster[roster['position'].isin(POSITIONS)]
roster['team'] = roster['team'].replace(TEAM_REMAP)

# ---------- 6. Player headshots ----------
# ESPN's headshot CDN is used as the primary source rather than NFL.com's --
# NFL's static image CDN has been unreliable for third-party embedding
# (hotlink restrictions), while ESPN's is the CDN most fantasy sites use
# specifically because it embeds reliably elsewhere. NFL.com's URL (if
# present) is kept as a fallback for the small number of players with no
# ESPN ID.
players_master = fetch_csv('https://github.com/nflverse/nflverse-data/releases/download/players/players.csv', 'players.csv')
headshot_by_pos = {}
headshot_by_name = {}
for _, row in players_master.iterrows():
    espn_id = row.get('espn_id')
    nfl_headshot = row.get('headshot')
    url = None
    if pd.notna(espn_id):
        url = f'https://a.espncdn.com/i/headshots/nfl/players/full/{int(espn_id)}.png'
    elif pd.notna(nfl_headshot):
        url = nfl_headshot
    if url:
        headshot_by_pos[normalize(row['display_name']) + '|' + str(row.get('position',''))] = url
        headshot_by_name[normalize(row['display_name'])] = url

def get_headshot(name, pos):
    return headshot_by_pos.get(normalize(name) + '|' + pos) or headshot_by_name.get(normalize(name))

hs_matched = 0
for pos, players in position_data.items():
    for p in players:
        p['headshot'] = get_headshot(p['name'], pos)
        if p['headshot']: hs_matched += 1
print(f'Headshots matched to stats pool: {hs_matched}')

# Build a current-team lookup from the roster file (this is "as of now,"
# unlike the stats-derived team above, which reflects whoever a player
# played for during the 2025 season -- stale for anyone traded or signed
# elsewhere since). Used to correct every matching player's team, not just
# to add brand-new ones.
current_team_lookup = {}
for _, r in roster.iterrows():
    current_team_lookup[normalize_nick(r['full_name']) + '|' + r['position']] = r['team']

team_corrections = 0
for pos, players in position_data.items():
    for p in players:
        current_team = current_team_lookup.get(normalize_nick(p['name']) + '|' + pos)
        if current_team and current_team != p['team']:
            team_corrections += 1
            p['team'] = current_team
print(f'Team corrections applied (player moved since their 2025 stats): {team_corrections}')

# ---------- Injuries (official weekly NFL injury report) ----------
# Uses SCHEDULE_SEASON since injury reports are filed for whichever season
# is currently being played, not the completed season stats are built from.
# Before the season starts, this file genuinely doesn't exist yet -- that's
# expected, not an error, so this degrades gracefully rather than failing
# the whole build.
injury_matched = 0
try:
    injuries = fetch_csv(
        f'https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{SCHEDULE_SEASON}.csv',
        'injuries_current.csv'
    )
    max_week = injuries['week'].max()
    latest_injuries = injuries[injuries['week'] == max_week].copy()
    injury_lookup = {}
    for _, r in latest_injuries.iterrows():
        key = normalize(r['full_name']) + '|' + r['position']
        injury_lookup[key] = {
            'status': r['report_status'] if pd.notna(r['report_status']) else None,
            'practice': r['practice_status'] if pd.notna(r['practice_status']) else None,
            'injury': r['report_primary_injury'] if pd.notna(r['report_primary_injury']) else (
                r['practice_primary_injury'] if pd.notna(r.get('practice_primary_injury')) else None
            ),
        }
    for pos, players in position_data.items():
        for p in players:
            info = injury_lookup.get(normalize(p['name']) + '|' + pos)
            if info:
                p['injury'] = info
                injury_matched += 1
    print(f'Injury statuses attached (week {max_week}): {injury_matched}')
except Exception as e:
    print(f'No injury data available yet this season (expected before Week 1): {e}')

# ---------- Current-season (in-progress) stats ----------
# Once real SCHEDULE_SEASON games have been played, a player's current-year
# performance is a better predictor than last year's -- this replaces the
# STATS_SEASON baseline with real current-season rate stats (for players
# with enough games to trust, matching the same confidence-threshold
# philosophy already used elsewhere on the site), and separately records
# their most recent single week for "Last Week" display. Before the season
# starts this file doesn't exist yet, which is expected, not an error.
MIN_GAMES_FOR_CURRENT_SEASON = 2
current_season_replacements = 0
last_week_attached = 0
try:
    current_stats = fetch_csv(
        f'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{SCHEDULE_SEASON}.csv',
        'stats_current_season.csv'
    )
    current_stats = current_stats[current_stats['season_type'] == 'REG']
    current_stats = current_stats[current_stats['position'].isin(POSITIONS)]
    current_stats['team'] = current_stats['team'].replace(TEAM_REMAP)

    cur_grouped = current_stats.groupby(['player_display_name', 'position']).agg(
        games=('week', 'nunique'),
        rushing_yards=('rushing_yards', 'sum'), rushing_tds=('rushing_tds', 'sum'), carries=('carries', 'sum'),
        receptions=('receptions', 'sum'), targets=('targets', 'sum'),
        receiving_yards=('receiving_yards', 'sum'), receiving_tds=('receiving_tds', 'sum'),
        passing_yards=('passing_yards', 'sum'), passing_tds=('passing_tds', 'sum'),
        passing_interceptions=('passing_interceptions', 'sum'),
        completions=('completions', 'sum'), attempts=('attempts', 'sum'),
    ).reset_index()

    def build_stat_line(row, g, pos):
        if pos != 'QB':
            return {
                'rushAtt': round(row['carries']/g,1), 'rushYds': round(row['rushing_yards']/g,1), 'rushTds': round(row['rushing_tds']/g,1),
                'tgt': round(row['targets']/g,1), 'rec': round(row['receptions']/g,1), 'recYds': round(row['receiving_yards']/g,1), 'recTds': round(row['receiving_tds']/g,1),
            }
        pass_pct = round(row['completions']/row['attempts']*100,1) if row['attempts']>0 else 0
        return {
            'passComp': round(row['completions']/g,1), 'passAtt': round(row['attempts']/g,1), 'passPct': str(pass_pct),
            'passYds': round(row['passing_yards']/g,1), 'passTds': round(row['passing_tds']/g,1), 'passInt': round(row['passing_interceptions']/g,1),
            'rushAtt': round(row['carries']/g,1), 'rushYds': round(row['rushing_yards']/g,1), 'rushTds': round(row['rushing_tds']/g,1),
        }

    current_rate_lookup = {}
    for _, row in cur_grouped.iterrows():
        if row['games'] < MIN_GAMES_FOR_CURRENT_SEASON:
            continue
        key = normalize(row['player_display_name']) + '|' + row['position']
        current_rate_lookup[key] = build_stat_line(row, row['games'], row['position'])

    for pos, players in position_data.items():
        for p in players:
            key = normalize(p['name']) + '|' + pos
            if key in current_rate_lookup:
                p['stats'] = current_rate_lookup[key]
                current_season_replacements += 1

    # Last Week: each player's most recent single-week actual stat line
    last_week_num = current_stats['week'].max()
    last_week_rows = current_stats[current_stats['week'] == last_week_num]
    for _, row in last_week_rows.iterrows():
        pos = row['position']
        line = build_stat_line(row, 1, pos)
        line['week'] = int(last_week_num)
        key = normalize(row['player_display_name']) + '|' + pos
        for p in position_data.get(pos, []):
            if normalize(p['name']) + '|' + pos == key:
                p['lastWeek'] = line
                last_week_attached += 1
                break

    print(f'Current-season ({SCHEDULE_SEASON}) stats replaced baseline for: {current_season_replacements} players (2+ games played)')
    print(f'Last Week (week {int(last_week_num)}) attached for: {last_week_attached} players')
except Exception as e:
    print(f'No current-season stats available yet (expected before Week 1 finishes): {e}')

# Merge in current-roster players not already in the stats pool (rookies, etc.)
added = 0
for pos in POSITIONS:
    existing = set(normalize(p['name']) for p in position_data[pos])
    seen = set()
    for _, r in roster[roster['position']==pos].iterrows():
        norm = normalize(r['full_name'])
        if norm in existing or norm in seen:
            continue
        seen.add(norm)
        draft_key = normalize_nick(r['full_name']) + '|' + pos
        position_data[pos].append({
            'name': r['full_name'], 'team': r['team'], 'stats': None, 'hasStats': False,
            'draft': recent_draft.get(draft_key), 'headshot': get_headshot(r['full_name'], pos),
            'depthOrder': 99,
        })
        added += 1
print(f'New players merged from current roster: {added}')

for pos, players in position_data.items():
    for i, p in enumerate(players):
        p['id'] = i

# ---------- 7. Static reference data (doesn't change season to season) ----------
TEAM_COLORS = {
  "ARI": ["#97233F", "#000000"], "ATL": ["#A71930", "#000000"], "BAL": ["#241773", "#9E7C0C"],
  "BUF": ["#00338D", "#C60C30"], "CAR": ["#0085CA", "#101820"], "CHI": ["#0B162A", "#C83803"],
  "CIN": ["#FB4F14", "#000000"], "CLE": ["#311D00", "#FF3C00"], "DAL": ["#003594", "#869397"],
  "DEN": ["#FB4F14", "#002244"], "DET": ["#0076B6", "#B0B7BC"], "GB": ["#203731", "#FFB612"],
  "HOU": ["#03202F", "#A71930"], "IND": ["#002C5F", "#A2AAAD"], "JAC": ["#101820", "#D7A22A"],
  "KC": ["#E31837", "#FFB81C"], "LAC": ["#0080C6", "#FFC20E"], "LAR": ["#003594", "#FFA300"],
  "LV": ["#000000", "#A5ACAF"], "MIA": ["#008E97", "#FC4C02"], "MIN": ["#4F2683", "#FFC62F"],
  "NE": ["#002244", "#C60C30"], "NO": ["#D3BC8D", "#101820"], "NYG": ["#0B2265", "#A71930"],
  "NYJ": ["#125740", "#000000"], "PHI": ["#004C54", "#A5ACAF"], "PIT": ["#FFB612", "#101820"],
  "SEA": ["#002244", "#69BE28"], "SF": ["#AA0000", "#B3995D"], "TB": ["#D50A0A", "#34302B"],
  "TEN": ["#0C2340", "#4B92DB"], "WAS": ["#5A1414", "#FFB612"], "FA": ["#8A8580", "#5C5852"],
}
POSITION_LABELS = {"RB": "Running backs", "QB": "Quarterbacks", "WR": "Wide receivers", "TE": "Tight ends"}
POSITION_ORDER = ["RB", "QB", "WR", "TE"]
MIN_POSITIONS_FOR_OVERALL = 2

# ---------- Write data.js ----------
# NOTE: the app's JS code (index.html) references TEAM_SCHEDULE_2026 / WEEK_DATES_2026
# by that literal name. If SCHEDULE_SEASON above ever moves to a different year,
# these variable names -- and the matching references inside index.html -- need
# to be updated together, not just this config value.
with open('data.js', 'w') as f:
    f.write('/* Snap Rank Fantasy -- shared data layer. Auto-generated, do not hand-edit. */\n\n')
    f.write('const POSITION_DATA = ' + json.dumps(position_data) + ';\n')
    f.write('const TEAM_COLORS = ' + json.dumps(TEAM_COLORS) + ';\n')
    f.write('const DEF_VS_POSITION = ' + json.dumps(def_vs_position) + ';\n')
    f.write('const TEAM_SCHEDULE_2026 = ' + json.dumps(team_schedule) + ';\n')
    f.write('const WEEK_DATES_2026 = ' + json.dumps(week_dates) + ';\n')
    f.write('const ROOKIE_SEED_MODEL = ' + json.dumps(rookie_seed_model) + ';\n')
    f.write('const ROOKIE_SEED_ROUND_MODEL = ' + json.dumps(rookie_round_model) + ';\n')
    f.write('const DRAFT_INFO_RECENT = ' + json.dumps(recent_draft) + ';\n')
    f.write('const NICKNAME_MAP = ' + json.dumps(NICKNAMES) + ';\n')
    f.write('const POSITION_LABELS = ' + json.dumps(POSITION_LABELS) + ';\n')
    f.write(f'const CURRENT_SEASON = {CURRENT_SEASON};\n')
    f.write('const POSITION_ORDER = ' + json.dumps(POSITION_ORDER) + ';\n')
    f.write(f'const MIN_POSITIONS_FOR_OVERALL = {MIN_POSITIONS_FOR_OVERALL};\n')

import os
print(f'\ndata.js written: {os.path.getsize("data.js")} bytes')
print('Done.')
