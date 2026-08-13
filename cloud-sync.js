/* Snap Rank Fantasy -- cloud ranking sync.
   Extends the existing browser-local auto-save with cloud storage for
   logged-in users. Logged-out visitors are completely unaffected -- this
   file only does anything once `currentUser` (set by auth.js) is truthy.

   Design: cloud is authoritative once you're logged in. A ranking that
   exists only locally (started before logging in, or on a browser that's
   never synced) gets uploaded to become its cloud copy the first time it's
   saved after login -- there's no separate "migration" step, saving IS
   the migration, since upsert only creates a new cloud row when one
   doesn't already exist for that exact position/format/mode/week. */

const CLOUD_SEASON = 2026;

function cloudKeyForCurrentSession() {
  return {
    position: MODE === 'OVERALL' ? 'OVERALL' : selectedPos,
    format: sessionFormat,
    mode: sessionMode,
    season: CLOUD_SEASON,
    // 0 (not null) for Rest-of-Season -- Postgres treats every NULL as
    // distinct from every other NULL, which silently breaks the unique
    // constraint (and upsert's conflict detection) for any nullable
    // column. 0 is never a real NFL week number, so it's a safe stand-in
    // for "not applicable."
    week: sessionMode === 'WEEKLY' ? sessionWeek : 0,
  };
}

async function syncSessionToCloud(snapshot) {
  if (!currentUser || !MODE) return;
  const key = cloudKeyForCurrentSession();
  try {
    const { error } = await supabaseClient
      .from('user_rankings')
      .upsert({
        user_id: currentUser.id,
        position: key.position, format: key.format, mode: key.mode,
        season: key.season, week: key.week,
        session_data: snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,position,format,mode,season,week' });
    if (error) { console.warn('Cloud save failed:', error.message); return; }
    await syncRankingEntries(snapshot, key);
  } catch (e) {
    console.warn('Cloud save failed:', e);
  }
}

/* Keeps the one-row-per-player table in sync with the current ranked list,
   so "what does everyone think of this player" can be answered with a
   simple, fast query instead of unpacking every user's saved bundle.
   Strategy: clear out this exact ranking's old entries, then write the
   current order fresh -- simpler and safer than trying to patch individual
   rows when players can be added, removed, or reordered between saves. */
async function syncRankingEntries(snapshot, key) {
  try {
    await supabaseClient
      .from('ranking_entries')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('board', key.position)
      .eq('format', key.format)
      .eq('mode', key.mode)
      .eq('season', key.season)
      .eq('week', key.week);

    if (!snapshot.ranked || snapshot.ranked.length === 0) return;

    const entries = snapshot.ranked.map((p, i) => ({
      user_id: currentUser.id,
      player_uid: p.uid,
      player_name: p.name,
      player_pos: p.pos || key.position,
      board: key.position, rank: i + 1,
      format: key.format, mode: key.mode, season: key.season, week: key.week,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseClient.from('ranking_entries').insert(entries);
    if (error) console.warn('ranking_entries sync failed:', error.message);
  } catch (e) {
    console.warn('ranking_entries sync failed:', e);
  }
}

async function fetchMostRecentCloudRanking() {
  if (!currentUser) return null;
  try {
    const { data, error } = await supabaseClient
      .from('user_rankings')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) { console.warn('Cloud fetch failed:', error.message); return null; }
    return (data && data.length) ? data[0] : null;
  } catch (e) {
    console.warn('Cloud fetch failed:', e);
    return null;
  }
}

/* Called once auth state is known (page load, or right after a fresh
   login). Offers to resume a cloud-saved ranking the same way the
   existing local resume banner works -- and if there's no cloud copy yet
   but a local one exists, uploads it immediately so it stops being
   local-only right away rather than waiting for the next natural save. */
async function reconcileCloudOnAuthReady() {
  if (!currentUser) return;

  const cloudRow = await fetchMostRecentCloudRanking();
  const localSnap = loadActiveSession();

  if (cloudRow) {
    // Cloud is authoritative. Only offer to resume from it if there's
    // nothing already on screen (don't yank an active session out from
    // under someone mid-ranking).
    if (!MODE) {
      offerCloudResume(cloudRow);
    }
  } else if (localSnap) {
    // No cloud copy exists yet for anything -- push the local session up
    // so it stops being browser-only the moment we know who's logged in.
    await syncSessionToCloud(localSnap);
  }
}

function offerCloudResume(cloudRow) {
  const banner = document.getElementById('resumeBanner');
  const text = document.getElementById('resumeBannerText');
  if (!banner || !text) return;

  const snap = cloudRow.session_data;
  const label = snap.MODE === 'OVERALL' ? 'Overall' : snap.selectedPos;
  text.textContent = (snap.done
    ? 'You have a finished ' + label + ' ranking saved to your account.'
    : 'You have an unfinished ' + label + ' ranking saved to your account (' + snap.ranked.length + ' / ' + snap.TOTAL + ' locked).');
  banner.classList.remove('hidden');

  const resumeBtn = document.getElementById('resumeBtn');
  const discardBtn = document.getElementById('discardResumeBtn');
  const newResumeBtn = resumeBtn.cloneNode(true);
  resumeBtn.parentNode.replaceChild(newResumeBtn, resumeBtn);
  const newDiscardBtn = discardBtn.cloneNode(true);
  discardBtn.parentNode.replaceChild(newDiscardBtn, discardBtn);

  newResumeBtn.addEventListener('click', () => {
    banner.classList.add('hidden');
    resumeActiveSession(snap);
  }, { once: true });
  newDiscardBtn.addEventListener('click', () => {
    banner.classList.add('hidden');
  }, { once: true });
}

// React to auth.js's lifecycle events rather than auth.js needing to know
// anything about rankings -- keeps auth.js reusable on pages (Stats Hub,
// About) that don't have any ranking state at all.
document.addEventListener('authReady', (e) => {
  if (e.detail.user) reconcileCloudOnAuthReady();
});
document.addEventListener('authStateChanged', (e) => {
  if (e.detail.event === 'SIGNED_IN') reconcileCloudOnAuthReady();
});
