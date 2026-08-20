/* Snap Rank Fantasy -- manual Draft Tool.
   No external draft-site integration (deliberately manual, see project
   notes on Sleeper's commercial API licensing) -- you click each pick as
   it happens and this tracks best available, needs, and value against
   your own rankings. */

/* ---------- Verified pick-order logic (reused from the Mock Draft Board
   PDF feature -- unit-tested there against hand-derived expected
   sequences for snake, 3RR, and linear before ever being trusted). ---------- */
function getRoundOrder(roundNum, numTeams, draftType, use3RR) {
  const forward = Array.from({ length: numTeams }, (_, i) => i);
  const backward = forward.slice().reverse();
  if (draftType === 'linear') return forward;
  if (!use3RR) {
    return (roundNum % 2 === 1) ? forward : backward;
  } else {
    if (roundNum <= 2) return forward;
    return (roundNum % 2 === 1) ? backward : forward;
  }
}

let settings = null; // { format, numTeams, draftType, use3RR, mySlot, roster: {QB,RB,WR,TE,FLEX,BENCH} }
let board = null;    // board[roundIdx][teamIdx] = player object or null
let draftedUids = new Set();
let myPool = [];     // ordered by the user's own ranking (or stats fallback)
let pendingCell = null; // {round, teamIdx} awaiting a player pick

/* ---------- Setup ---------- */
function populateSlotDropdown() {
  const numTeams = parseInt(document.getElementById('setupTeams').value, 10) || 12;
  const sel = document.getElementById('setupSlot');
  const current = sel.value;
  sel.innerHTML = Array.from({ length: numTeams }, (_, i) => '<option value="' + (i + 1) + '">Team ' + (i + 1) + '</option>').join('');
  if (current && parseInt(current, 10) <= numTeams) sel.value = current;
}
document.getElementById('setupTeams').addEventListener('input', populateSlotDropdown);
document.getElementById('setupType').addEventListener('change', () => {
  document.getElementById('setup3RRRow').style.display = document.getElementById('setupType').value === 'linear' ? 'none' : 'grid';
});
populateSlotDropdown();

document.getElementById('startDraftBtn').addEventListener('click', async () => {
  const roster = {
    QB: parseInt(document.getElementById('rosterQB').value, 10) || 0,
    RB: parseInt(document.getElementById('rosterRB').value, 10) || 0,
    WR: parseInt(document.getElementById('rosterWR').value, 10) || 0,
    TE: parseInt(document.getElementById('rosterTE').value, 10) || 0,
    FLEX: parseInt(document.getElementById('rosterFLEX').value, 10) || 0,
    BENCH: parseInt(document.getElementById('rosterBENCH').value, 10) || 0,
  };
  settings = {
    format: document.getElementById('setupFormat').value,
    numTeams: parseInt(document.getElementById('setupTeams').value, 10) || 12,
    draftType: document.getElementById('setupType').value,
    use3RR: document.getElementById('setupType').value === 'snake' && document.getElementById('setup3RR').checked,
    mySlot: parseInt(document.getElementById('setupSlot').value, 10) || 1,
    roster: roster,
  };
  const totalRounds = roster.QB + roster.RB + roster.WR + roster.TE + roster.FLEX + roster.BENCH;
  if (totalRounds < 1) { alert('Add at least one roster spot.'); return; }

  board = Array.from({ length: totalRounds }, () => new Array(settings.numTeams).fill(null));
  draftedUids = new Set();

  document.getElementById('startDraftBtn').textContent = 'Loading your rankings\u2026';
  myPool = await loadMyRankedPool(settings.format);

  document.getElementById('draftSetup').classList.add('hidden');
  document.getElementById('draftLive').classList.remove('hidden');
  renderBoard();
  renderAllPanels();
});

/* ---------- Player pool: your own cloud ranking if available, else a
   reasonable stats-based fallback ---------- */
async function loadMyRankedPool(format) {
  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined') {
    try {
      const { data, error } = await supabaseClient
        .from('user_rankings')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('position', 'OVERALL')
        .eq('format', format)
        .eq('season', 2026)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (!error && data && data.length && data[0].session_data && data[0].session_data.ranked) {
        return data[0].session_data.ranked.map(p => ({ ...p, uid: p.uid || (p.pos + '-' + normalizeNameLocal(p.name)) }));
      }
    } catch (e) {
      console.warn('Could not load personal Overall ranking, using stats fallback:', e);
    }
  }
  // Fallback: simple stats-based merge across all positions, in case the
  // user isn't logged in or hasn't completed an Overall ranking yet.
  const all = [];
  POSITION_ORDER.forEach(pos => {
    (POSITION_DATA[pos] || []).forEach(p => {
      if (p.hasStats === false) return;
      all.push({ ...p, pos, uid: pos + '-' + normalizeNameLocal(p.name), _pts: computePointsLocal(p.stats, format) });
    });
  });
  all.sort((a, b) => (b._pts || 0) - (a._pts || 0));
  return all;
}
function normalizeNameLocal(name) {
  return (name || '').toLowerCase().replace(/[.'\u2019-]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
}
function computePointsLocal(stats, format) {
  if (!stats) return 0;
  const pprMult = format === 'ppr' ? 1 : format === 'half' ? 0.5 : 0;
  const rec = stats.rec || 0;
  return (stats.passYds||0)/25 + (stats.passTds||0)*4 - (stats.passInt||0)*2 +
         (stats.rushYds||0)/10 + (stats.rushTds||0)*6 +
         (stats.recYds||0)/10 + (stats.recTds||0)*6 + rec*pprMult;
}

/* ---------- Board rendering ---------- */
function totalPicksMade() {
  return draftedUids.size;
}
function currentPickNumber() {
  return totalPicksMade() + 1;
}

function renderBoard() {
  const table = document.getElementById('draftGridTable');
  const numTeams = settings.numTeams;
  let html = '<tr><th>Rd</th>';
  for (let t = 0; t < numTeams; t++) {
    html += '<th class="' + (t === settings.mySlot - 1 ? 'mine' : '') + '">Team ' + (t + 1) + (t === settings.mySlot - 1 ? ' (You)' : '') + '</th>';
  }
  html += '</tr>';

  board.forEach((round, rIdx) => {
    const order = getRoundOrder(rIdx + 1, numTeams, settings.draftType, settings.use3RR);
    const dir = order[0] === 0 ? '\u2192' : '\u2190';
    html += '<tr><td style="background:var(--parchment); font-weight:700;">R' + (rIdx + 1) + '<div class="rd">' + dir + '</div></td>';
    for (let t = 0; t < numTeams; t++) {
      const p = round[t];
      const mineCls = t === settings.mySlot - 1 ? ' mine-col' : '';
      if (p) {
        html += '<td class="filled' + mineCls + '"><div class="pname">' + p.name + '</div><div class="pmeta">' + p.pos + ' - ' + p.team + '</div></td>';
      } else {
        html += '<td class="' + mineCls.trim() + '" data-round="' + rIdx + '" data-team="' + t + '"><span class="claimLabel">CLAIM</span></td>';
      }
    }
    html += '</tr>';
  });
  table.innerHTML = html;

  table.querySelectorAll('td[data-round]').forEach(td => {
    td.addEventListener('click', () => openPlayerPick(parseInt(td.dataset.round, 10), parseInt(td.dataset.team, 10)));
  });

  document.getElementById('draftMeta').textContent = totalPicksMade() + ' picks made \u2014 click any open cell to record who was taken';
}

/* ---------- Claim a pick ---------- */
function openPlayerPick(round, teamIdx) {
  pendingCell = { round, teamIdx };
  document.getElementById('playerPickTitle').textContent = 'Round ' + (round + 1) + ', Team ' + (teamIdx + 1) + (teamIdx === settings.mySlot - 1 ? ' (You)' : '');
  document.getElementById('playerPickSearch').value = '';
  renderPlayerPickResults('');
  document.getElementById('playerPickOverlay').classList.remove('hidden');
  document.getElementById('playerPickSearch').focus();
}
document.getElementById('playerPickCloseBtn').addEventListener('click', () => {
  document.getElementById('playerPickOverlay').classList.add('hidden');
});
document.getElementById('playerPickOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'playerPickOverlay') document.getElementById('playerPickOverlay').classList.add('hidden');
});
document.getElementById('playerPickSearch').addEventListener('input', (e) => {
  renderPlayerPickResults(e.target.value.trim());
});

function renderPlayerPickResults(query) {
  const resultsEl = document.getElementById('playerPickResults');
  let pool = [];
  POSITION_ORDER.forEach(pos => {
    (POSITION_DATA[pos] || []).forEach(p => {
      const uid = pos + '-' + normalizeNameLocal(p.name);
      if (draftedUids.has(uid)) return;
      pool.push({ ...p, pos, uid });
    });
  });
  if (query) {
    const q = query.toLowerCase();
    pool = pool.filter(p => p.name.toLowerCase().includes(q));
  }
  pool = pool.slice(0, 30);
  resultsEl.innerHTML = pool.map(p =>
    '<div class="compRow2" style="cursor:pointer;" data-uid="' + p.uid + '"><span class="compName">' + p.name + '</span><span class="compDetail">' + p.pos + ' - ' + p.team + '</span></div>'
  ).join('') || '<p class="compNote">No matching undrafted players.</p>';
  resultsEl.querySelectorAll('[data-uid]').forEach(el => {
    el.addEventListener('click', () => assignPick(el.dataset.uid));
  });
}

function assignPick(uid) {
  const [pos] = uid.split('-');
  const player = (POSITION_DATA[pos] || []).find(p => (pos + '-' + normalizeNameLocal(p.name)) === uid);
  if (!player || !pendingCell) return;
  board[pendingCell.round][pendingCell.teamIdx] = { ...player, pos, uid };
  draftedUids.add(uid);
  pendingCell = null;
  document.getElementById('playerPickOverlay').classList.add('hidden');
  renderBoard();
  renderAllPanels();
}

/* ---------- Analysis panels ---------- */
function renderAllPanels() {
  renderBestAvailable();
  renderBestByPosition();
  renderTeamNeeds();
  renderReachTargets();
}

function availablePool() {
  return myPool.filter(p => !draftedUids.has(p.uid));
}

function renderBestAvailable() {
  const avail = availablePool();
  const pick = currentPickNumber();
  const html = avail.slice(0, 12).map((p, i) => {
    const overallRank = myPool.indexOf(p) + 1;
    const fellBy = pick - overallRank;
    const isValue = fellBy >= 8;
    return '<div class="draftPanelRow' + (isValue ? ' value' : '') + '"><span>' + (overallRank) + '. ' + p.name + ' <span class="tm">' + p.pos + '</span></span>' +
      (isValue ? '<span class="needBadge" style="background:#1a7a3c;">Value +' + fellBy + '</span>' : '') + '</div>';
  }).join('');
  document.getElementById('bestAvailablePanel').innerHTML = html || '<p class="compNote">All drafted.</p>';
}

let bestByPosCurrent = 'RB';
function renderBestByPosition() {
  const avail = availablePool().filter(p => p.pos === bestByPosCurrent);
  const html = avail.slice(0, 10).map((p) => {
    const overallRank = myPool.indexOf(p) + 1;
    return '<div class="draftPanelRow"><span>' + p.name + '</span><span class="tm">#' + overallRank + ' overall</span></div>';
  }).join('');
  document.getElementById('bestByPositionPanel').innerHTML = html || '<p class="compNote">None left.</p>';
}
document.getElementById('bestByPosTabs').querySelectorAll('.countChip').forEach(chip => {
  chip.addEventListener('click', () => {
    bestByPosCurrent = chip.dataset.pos;
    document.querySelectorAll('#bestByPosTabs .countChip').forEach(c => c.classList.toggle('selected', c === chip));
    renderBestByPosition();
  });
});

function myTeamPicks() {
  const picks = [];
  board.forEach(round => { if (round[settings.mySlot - 1]) picks.push(round[settings.mySlot - 1]); });
  return picks;
}

function renderTeamNeeds() {
  const picks = myTeamPicks();
  const remaining = { ...settings.roster };
  const flexEligible = ['RB', 'WR', 'TE'];
  picks.forEach(p => {
    if (remaining[p.pos] > 0) { remaining[p.pos]--; return; }
    if (flexEligible.includes(p.pos) && remaining.FLEX > 0) { remaining.FLEX--; return; }
    if (remaining.BENCH > 0) { remaining.BENCH--; return; }
  });
  const labels = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'FLEX', BENCH: 'Bench' };
  const html = Object.keys(labels).map(key =>
    '<div class="draftPanelRow"><span>' + labels[key] + '</span>' + (remaining[key] > 0 ? '<span class="needBadge">' + remaining[key] + ' needed</span>' : '<span class="tm">filled</span>') + '</div>'
  ).join('');
  document.getElementById('teamNeedsPanel').innerHTML = html;
}

function renderReachTargets() {
  const picks = myTeamPicks();
  const remaining = { ...settings.roster };
  const flexEligible = ['RB', 'WR', 'TE'];
  picks.forEach(p => {
    if (remaining[p.pos] > 0) { remaining[p.pos]--; return; }
    if (flexEligible.includes(p.pos) && remaining.FLEX > 0) { remaining.FLEX--; return; }
    if (remaining.BENCH > 0) { remaining.BENCH--; return; }
  });
  const neededPositions = ['QB','RB','WR','TE'].filter(pos => remaining[pos] > 0 || (flexEligible.includes(pos) && remaining.FLEX > 0));
  const avail = availablePool();
  const html = neededPositions.map(pos => {
    const best = avail.find(p => p.pos === pos);
    if (!best) return '';
    const overallRank = myPool.indexOf(best) + 1;
    return '<div class="draftPanelRow"><span>' + pos + ': ' + best.name + '</span><span class="tm">#' + overallRank + '</span></div>';
  }).join('');
  document.getElementById('reachPanel').innerHTML = html || '<p class="compNote">No immediate needs.</p>';
}
