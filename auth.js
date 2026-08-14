/* Snap Rank Fantasy -- shared authentication layer.
   Loaded on every page (after the Supabase JS library), gives every page
   the same "Log In / Sign Up" sidebar widget and a consistent way to check
   who's currently logged in. */

const SUPABASE_URL = 'https://bvhdshuoyfijylbkfjjj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_54es0ODzo-a2JO3ftqhXFQ_emquv90Y';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;

async function initAuthWidget() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session ? session.user : null;
  renderAuthWidget();
  document.dispatchEvent(new CustomEvent('authReady', { detail: { user: currentUser } }));

  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session ? session.user : null;
    renderAuthWidget();
    document.dispatchEvent(new CustomEvent('authStateChanged', { detail: { event, user: currentUser } }));
  });
}

function renderAuthWidget() {
  const el = document.getElementById('authWidget');
  if (!el) return;

  if (currentUser) {
    const myRankingsLink = (typeof openMyRankingsModal === 'function')
      ? '<button class="authMyRankingsBtn" id="authMyRankingsBtn">My Rankings</button>'
      : '';
    el.innerHTML =
      '<div class="authLoggedIn">' +
        '<div class="authEmail" title="' + currentUser.email + '">' + currentUser.email + '</div>' +
        myRankingsLink +
        '<button class="authLogoutBtn" id="authLogoutBtn">Log out</button>' +
      '</div>';
    if (typeof openMyRankingsModal === 'function') {
      document.getElementById('authMyRankingsBtn').addEventListener('click', openMyRankingsModal);
    }
    document.getElementById('authLogoutBtn').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
    });
  } else {
    el.innerHTML = '<button class="sidebarNavLink authLoginLink" id="authOpenBtn" style="width:100%; text-align:left; border:none; background:none; cursor:pointer; font-family:inherit;">Log In / Sign Up</button>';
    document.getElementById('authOpenBtn').addEventListener('click', openAuthModal);
  }
}

/* ---------- Auth modal (reuses the .modalOverlay/.modalBox pattern from the Stats Hub) ---------- */

let authMode = 'login'; // 'login' | 'signup'

function openAuthModal() {
  let overlay = document.getElementById('authModalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'authModalOverlay';
    overlay.className = 'modalOverlay hidden';
    overlay.innerHTML =
      '<div class="modalBox" style="max-width:380px;">' +
        '<button class="modalCloseBtn" id="authModalCloseBtn">&times;</button>' +
        '<div id="authModalContent"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('authModalCloseBtn').addEventListener('click', closeAuthModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAuthModal(); });
  }
  authMode = 'login';
  renderAuthModalContent();
  overlay.classList.remove('hidden');
}

function closeAuthModal() {
  const overlay = document.getElementById('authModalOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function renderAuthModalContent(statusMsg, statusIsError) {
  const content = document.getElementById('authModalContent');
  const title = authMode === 'login' ? 'Log In' : 'Sign Up';
  const switchText = authMode === 'login'
    ? 'Don\u2019t have an account? <a href="#" id="authSwitchLink">Sign up</a>'
    : 'Already have an account? <a href="#" id="authSwitchLink">Log in</a>';
  const privacyNote = authMode === 'signup'
    ? '<p style="font-size:12px; margin-bottom:12px; color:var(--ink-faint);">Just your email and your rankings &mdash; see <a href="about.html#privacy" target="_blank">what that means</a>.</p>'
    : '';

  content.innerHTML =
    '<h2 class="display" style="font-size:1.6rem; margin-bottom:16px;">' + title + '</h2>' +
    '<form id="authForm">' +
      '<input type="email" id="authEmail" class="statsSearchInput" placeholder="Email" required style="width:100%; margin-bottom:10px;" autocomplete="email">' +
      '<input type="password" id="authPassword" class="statsSearchInput" placeholder="Password (min. 6 characters)" required minlength="6" style="width:100%; margin-bottom:14px;" autocomplete="' + (authMode === 'login' ? 'current-password' : 'new-password') + '">' +
      privacyNote +
      (statusMsg ? '<p style="font-size:13px; margin-bottom:12px; color:' + (statusIsError ? 'var(--oxblood)' : '#1a7a3c') + ';">' + statusMsg + '</p>' : '') +
      '<button type="submit" class="startBtn" style="width:100%;" id="authSubmitBtn">' + title + '</button>' +
    '</form>' +
    '<p style="font-size:13px; margin-top:14px; color:var(--ink-soft);">' + switchText + '</p>';

  document.getElementById('authSwitchLink').addEventListener('click', (e) => {
    e.preventDefault();
    authMode = authMode === 'login' ? 'signup' : 'login';
    renderAuthModalContent();
  });

  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const submitBtn = document.getElementById('authSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait\u2026';

    try {
      if (authMode === 'signup') {
        const { error } = await supabaseClient.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + '/index.html' }
        });
        if (error) throw error;
        renderAuthModalContent('Account created \u2014 check your email to confirm it before logging in.', false);
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeAuthModal();
      }
    } catch (err) {
      renderAuthModalContent(err.message || 'Something went wrong. Try again.', true);
    }
  });
}

initAuthWidget();
