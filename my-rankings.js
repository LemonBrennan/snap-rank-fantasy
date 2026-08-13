/* Snap Rank Fantasy -- "My Rankings" panel.
   Lets a logged-in user see every ranking they've saved to the cloud, and
   resume, restart, or delete each one. Only loaded on the ranking page
   (index.html), since auth.js checks for openMyRankingsModal's existence
   before showing the link at all -- Stats Hub and About don't get it. */

function openMyRankingsModal() {
  let overlay = document.getElementById('myRankingsOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'myRankingsOverlay';
    overlay.className = 'modalOverlay hidden';
    overlay.innerHTML =
      '<div class="modalBox" style="max-width:560px;">' +
        '<button class="modalCloseBtn" id="myRankingsCloseBtn">&times;</button>' +
        '<h2 class="display" style="font-size:1.6rem; margin-bottom:16px;">My Rankings</h2>' +
        '<div id="myRankingsList"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('myRankingsCloseBtn').addEventListener('click', closeMyRankingsModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMyRankingsModal(); });
  }
  overlay.classList.remove('hidden');
  loadMyRankingsList();
}

function closeMyRankingsModal() {
  const overlay = document.getElementById('myRankingsOverlay');
  if (overlay) overlay.classList.add('hidden');
}

async function loadMyRankingsList() {
  const listEl = document.getElementById('myRankingsList');
  listEl.innerHTML = '<p class="compNote">Loading&hellip;</p>';

  const { data, error } = await supabaseClient
    .from('user_rankings')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false });

  if (error) {
    listEl.innerHTML = '<p class="compNote">Couldn\u2019t load your rankings. Try again in a moment.</p>';
    return;
  }
  if (!data || data.length === 0) {
    listEl.innerHTML = '<p class="compNote">No saved rankings yet. Finish ranking a position while logged in and it\u2019ll show up here.</p>';
    return;
  }

  const formatLabel = f => f === 'ppr' ? 'PPR' : f === 'half' ? 'Half PPR' : 'Standard';

  listEl.innerHTML = data.map(row => {
    const snap = row.session_data;
    const posLabel = row.position === 'OVERALL' ? 'Overall' : row.position;
    const modeLabel = row.mode === 'WEEKLY' ? ('Week ' + row.week) : 'Rest of Season';
    const statusLabel = snap.done ? 'Finished' : (snap.ranked.length + ' / ' + snap.TOTAL + ' locked');
    const when = new Date(row.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    return '<div class="myRankingRow" data-id="' + row.id + '">' +
      '<div class="myRankingInfo">' +
        '<div class="myRankingTitle">' + posLabel + ' &middot; ' + formatLabel(row.format) + ' &middot; ' + modeLabel + '</div>' +
        '<div class="myRankingMeta">' + statusLabel + ' &middot; updated ' + when + '</div>' +
      '</div>' +
      '<div class="myRankingActions">' +
        '<button class="btn secondary myRankResumeBtn" data-id="' + row.id + '">Resume</button>' +
        '<button class="btn secondary myRankRestartBtn" data-id="' + row.id + '">Re-rank</button>' +
        '<button class="myRankDeleteBtn" data-id="' + row.id + '" title="Delete">&times;</button>' +
      '</div>' +
    '</div>';
  }).join('');

  const rowsById = {};
  data.forEach(r => { rowsById[r.id] = r; });

  listEl.querySelectorAll('.myRankResumeBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      closeMyRankingsModal();
      resumeActiveSession(rowsById[btn.dataset.id].session_data);
    });
  });

  listEl.querySelectorAll('.myRankRestartBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = rowsById[btn.dataset.id];
      closeMyRankingsModal();
      restartSavedRanking(row);
    });
  });

  listEl.querySelectorAll('.myRankDeleteBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this saved ranking? This can\u2019t be undone.')) return;
      const row = rowsById[btn.dataset.id];
      const { error } = await supabaseClient.from('user_rankings').delete().eq('id', row.id);
      if (error) { alert('Could not delete -- try again.'); return; }
      loadMyRankingsList();
    });
  });
}

/* Starts a completely fresh ranking using the same position/format/mode/week
   and player count as a previously-saved one -- for when someone wants to
   redo a board from scratch rather than continue where they left off. */
function restartSavedRanking(row) {
  selectedFormat = row.format;
  selectedMode = row.mode;
  selectedWeek = row.mode === 'WEEKLY' ? row.week : currentDefaultWeek();
  selectedCount = row.session_data.TOTAL;

  if (row.position === 'OVERALL') {
    startOverallRanking(selectedCount);
  } else {
    selectedPos = row.position;
    startRanking(row.position, selectedCount);
  }
}
