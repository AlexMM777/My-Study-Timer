import { firebaseConfig } from './firebase-config.js';
import { addSpan, dayKey, shiftDay, mergeCoverage, EMPTY } from './metrics-core.mjs';
import { openLocal, readLocal, writeLocal } from './metrics-local.mjs';
import { cloudStore } from './metrics-cloud.mjs';
import { renderStats } from './metrics-view.mjs';

const $ = id => document.getElementById(id);
const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/';
const messages = {
  'auth/invalid-credential': 'Email or password was not recognized.',
  'auth/email-already-in-use': 'This email already has an account. Sign in with its existing method first.',
  'auth/credential-already-in-use': 'This sign-in belongs to another account. Sign in to that account instead.',
  'auth/account-exists-with-different-credential': 'Sign in with the original account method, then connect Google from your account panel.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups for this site and try again.',
  'auth/popup-closed-by-user': 'Sign-in window closed. You can keep using the timer.',
  'auth/network-request-failed': 'Cannot connect. Check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
  'auth/weak-password': 'Choose a stronger password with at least eight characters.',
  'auth/requires-recent-login': 'Sign out and sign in again before changing your account.'
};
export async function initMetrics(timer) {
  let user = null, state = null, store = null, local, ready = false, leader = false, release;
  let generation = 0, signup = false, saving = null, pauseSave, scheduled, lastSync = 0, signingOut = false;
  let stats = { days: [], hours: {}, base: {}, cursor: null, more: false }, statsLoaded = false;
  let localWrites = Promise.resolve(), localHealthy = true, readSequence = 0;
  const status = text => { $('metricsStatus').textContent = text; };
  const showError = error => { $('accountMessage').textContent = messages[error.code] || 'That action could not finish. Please try again.'; };
  for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => $(button.dataset.close).close();
  $('openAccount').onclick = () => $('accountDialog').showModal();
  $('openStats').onclick = () => { $('statsDialog').showModal(); void loadStats(); };
  $('accountMessage').textContent = 'Loading account services…';
  $('accountForm').onsubmit = event => event.preventDefault();
  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import(`${SDK}firebase-app.js`), import(`${SDK}firebase-auth.js`), import(`${SDK}firebase-firestore.js`)
  ]);
  const app = appSDK.initializeApp(firebaseConfig), auth = authSDK.getAuth(app);
  const db = dbSDK.initializeFirestore(app, { localCache: dbSDK.memoryLocalCache() });
  if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulators')) {
    authSDK.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    dbSDK.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  try { local = await openLocal(); } catch { status('Device storage unavailable · Tracking disabled'); }
  $('accountMessage').textContent = '';
  function paint() {
    if (user && state?.profile && statsLoaded && $('statsDialog').open) renderStats({ ...stats, profile: state.profile, queue: state.queue });
  }
  function persist() {
    if (!user || !state || !leader || !local) return Promise.resolve();
    const uid = user.uid;
    state.checkpoint = timer.getState();
    const copy = structuredClone(state);
    localWrites = localWrites.catch(() => {}).then(() => writeLocal(local, uid, copy));
    return localWrites.then(() => { localHealthy = true; }).catch(error => { localHealthy = false; status('Device storage full or unavailable · Keep this page open to sync'); throw error; });
  }
  function queueEventSave() {
    if (scheduled || !user || !leader) return;
    scheduled = setTimeout(() => { scheduled = null; void sync(); }, Math.max(2000, 60_000 - (Date.now() - lastSync)));
  }
  async function sync() {
    if (saving) return saving;
    if (!user || !state?.profile || !leader || !ready) return;
    const uid = user.uid, gen = generation, current = state, cloud = store;
    saving = (async () => {
      await persist().catch(() => {});
      if (generation !== gen || auth.currentUser?.uid !== uid) return;
      const pending = structuredClone(current.queue);
      if (!Object.keys(pending).length) return;
      if (!navigator.onLine) { status(localHealthy ? 'Saved on this device · Offline' : 'Progress is only in memory · Keep this page open'); return; }
      status('Syncing study time…');
      const writes = await cloud.sync(pending);
      if (generation !== gen || auth.currentUser?.uid !== uid) return;
      for (const [id, entry] of Object.entries(pending)) {
        if (stats.patternHours) stats.patternHours[id] = { ...entry,
          coverage: mergeCoverage(stats.patternHours[id]?.coverage || EMPTY, entry.coverage) };
        if (current.queue[id]?.coverage === entry.coverage) delete current.queue[id];
      }
      lastSync = Date.now();
      // Measured successful document writes, not the number of network requests.
      current.cloudWrites = (current.cloudWrites || 0) + writes;
      await persist();
      status(Object.keys(current.queue).length ? 'Saved on this device · More progress to sync' : 'Synced');
      if ($('statsDialog').open) await loadStats(); else statsLoaded = false;
    })().catch(error => {
      if (generation === gen) status(error.code === 'permission-denied' ? 'Cloud access denied · Progress kept on this device' : 'Saved on this device · Sync will retry at the next session event');
    }).finally(() => { saving = null; });
    return saving;
  }
  function accountUI() {
    const signed = !!user;
    $('openAccount').textContent = signed ? 'Account' : 'Sign in'; $('openStats').hidden = !signed;
    $('accountTitle').textContent = signed ? 'Your account' : signup ? 'Create your account' : 'Save your progress';
    $('accountDescription').textContent = signed ? 'Study history is private to this account.' : 'Sign in to track your study time. The timer is always free to use without an account.';
    $('accountIdentity').textContent = user?.email || '';
    const providers = user?.providerData.map(p => p.providerId) || [];
    $('googleAccount').hidden = providers.includes('google.com');
    $('googleAccount').textContent = signed ? 'Connect Google to this account' : 'Continue with Google';
    $('accountForm').hidden = signed && providers.includes('password');
    $('accountEmail').readOnly = signed; if (signed) $('accountEmail').value = user.email || '';
    $('emailAccount').textContent = signed ? 'Add email/password to this account' : signup ? 'Create account' : 'Sign in with email';
    $('accountPassword').autocomplete = signup || signed ? 'new-password' : 'current-password';
    $('accountPassword').minLength = signup || signed ? 8 : 6;
    $('toggleSignup').hidden = signed; $('toggleSignup').textContent = signup ? 'Use an existing account' : 'Create an account';
    $('resetPassword').hidden = signed; $('signOutAccount').hidden = !signed;
    $('verifyEmail').hidden = !signed || user.emailVerified;
  }
  async function act(action) {
    const buttons = [...$('accountDialog').querySelectorAll('button:not([data-close])')];
    buttons.forEach(b => { b.disabled = true; }); $('accountMessage').textContent = '';
    try { await action(); } catch (error) { showError(error); }
    finally { buttons.forEach(b => { b.disabled = false; }); accountUI(); }
  }
  $('toggleSignup').onclick = () => { signup = !signup; accountUI(); };
  $('googleAccount').onclick = () => act(async () => {
    const provider = new authSDK.GoogleAuthProvider();
    if (auth.currentUser) await authSDK.linkWithPopup(auth.currentUser, provider);
    else await authSDK.signInWithPopup(auth, provider);
    user = auth.currentUser; accountUI(); $('accountDialog').close();
  });
  $('accountForm').onsubmit = event => { event.preventDefault(); void act(async () => {
    const email = $('accountEmail').value.trim(), password = $('accountPassword').value;
    if (auth.currentUser) await authSDK.linkWithCredential(auth.currentUser, authSDK.EmailAuthProvider.credential(email, password));
    else if (signup) {
      const result = await authSDK.createUserWithEmailAndPassword(auth, email, password);
      await authSDK.sendEmailVerification(result.user);
      $('accountMessage').textContent = 'Account created. Check your email for a verification link.';
    } else await authSDK.signInWithEmailAndPassword(auth, email, password);
    $('accountPassword').value = ''; user = auth.currentUser; accountUI();
    if (!signup) $('accountDialog').close();
  }); };
  $('resetPassword').onclick = () => act(async () => {
    if (!$('accountEmail').value || !$('accountEmail').checkValidity()) { $('accountMessage').textContent = 'Enter your email address first.'; return; }
    await authSDK.sendPasswordResetEmail(auth, $('accountEmail').value.trim());
    $('accountMessage').textContent = 'If an account exists for this email, a reset link will arrive shortly.';
  });
  $('verifyEmail').onclick = () => act(async () => { await authSDK.sendEmailVerification(auth.currentUser); $('accountMessage').textContent = 'Verification email sent.'; });
  $('signOutAccount').onclick = () => act(async () => {
    timer.checkpoint(); signingOut = true; clearTimeout(pauseSave); clearTimeout(scheduled); scheduled = null;
    await persist().catch(() => {});
    await Promise.race([sync(), new Promise(resolve => setTimeout(resolve, 5000))]);
    await authSDK.signOut(auth); $('accountDialog').close();
  });
  timer.subscribe(event => {
    if (!ready || !leader || !user || !state?.profile || signingOut) return;
    if (event.kind === 'span') {
      addSpan(state.queue, event.span, state.profile.timeZone);
    } else {
      void persist().catch(() => {});
      if (['phase', 'jump', 'reset'].includes(event.kind)) queueEventSave();
      if (event.kind === 'pause') {
        clearTimeout(pauseSave); pauseSave = setTimeout(() => { pauseSave = null; queueEventSave(); }, 60_000);
      }
      if (['resume', 'reset', 'suspend'].includes(event.kind)) clearTimeout(pauseSave);
    }
  });
  async function becomeRecorder(gen) {
    if (gen !== generation || !user || leader || !local) return;
    if (!navigator.locks) { status('This browser cannot safely coordinate tracking · Try a current browser'); return; }
    const uid = user.uid;
    await navigator.locks.request(`study-metrics:${uid}`, { ifAvailable: true }, async lock => {
      if (!lock || gen !== generation) { if (!leader && user) status('Another tab is recording your activity'); return; }
      leader = true;
      try {
        const recovered = await readLocal(local, uid);
        if (gen !== generation) return;
        const zone = recovered.profile?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const cloud = cloudStore(dbSDK, db, uid);
        let profile = recovered.profile;
        if (navigator.onLine) {
          try { profile = await cloud.profile(zone); } catch (error) { if (!profile) throw error; }
        }
        if (gen !== generation) return;
        if (!profile) { status('Connect once to set up study tracking'); return; }
        state = { ...recovered, profile }; store = cloud;
        timer.checkpoint(); // Discard guest activity before enabling the recorder.
        if (state.checkpoint && timer.restore(state.checkpoint)) $('timerNotice').textContent = 'Recovered your last checkpoint. Press start when you are ready.';
        ready = true; signingOut = false;
        status(Object.keys(state.queue).length ? 'Saved on this device · Pending sync' : 'Tracking ready');
        await persist().catch(() => {});
        // A sign-out/account switch can happen while IndexedDB is finishing its checkpoint.
        if (gen !== generation) return;
        if (Object.keys(state.queue).length) void sync();
        await new Promise(resolve => { release = resolve; });
      } catch { status('Tracking could not start · Your timer still works'); }
      finally { if (gen === generation) { leader = false; ready = false; } }
    });
  }
  authSDK.onAuthStateChanged(auth, next => {
    // Invalidate all pending UI work before switching accounts. Never reuse another UID's queue.
    generation++; ready = false; release?.(); release = null; leader = false;
    clearTimeout(pauseSave); clearTimeout(scheduled); scheduled = null;
    user = next; state = null; store = null; statsLoaded = false;
    stats = { days: [], hours: {}, base: {}, cursor: null, more: false };
    $('statsDialog').close();
    for (const id of ['statsTotals','activityHistory','dailyChart','heatmap','hourChart','statsContext','statsMessage','streakText','goalText','calendarDetail','hourDetail','patternContext']) $(id).replaceChildren();
    $('goalForm').hidden = true;
    $('goalProgress').value = 0; $('weeklyGoal').value = 5; $('loadHistory').hidden = true;
    $('accountPassword').value = ''; $('accountEmail').value = ''; signingOut = false; accountUI();
    if (!user) status('Metrics off · Sign in to save your study time');
    else void becomeRecorder(generation);
  });
  async function loadStats(older = false, refreshPattern = false) {
    if (!user) return;
    const gen = generation, request = ++readSequence;
    $('statsMessage').textContent = 'Loading your history…';
    try {
      if (!leader && local) {
        const cached = await readLocal(local, user.uid);
        if (gen !== generation) return;
        if (cached.profile) { state = cached; store = cloudStore(dbSDK, db, user.uid); }
      }
      if (!state?.profile || !store) { $('statsMessage').textContent = 'Connect once to finish setting up your study account.'; return; }
      const cloud = store;
      const patternSince = shiftDay(dayKey(Date.now(), state.profile.timeZone), -29);
      const [days, page, base, profile, patternRows] = await Promise.all([
        older ? Promise.resolve(stats.days) : cloud.days(), cloud.hours(older ? stats.cursor : null), cloud.pendingBase(state.queue), cloud.settings(),
        !refreshPattern && stats.patternSince === patternSince ? Promise.resolve(null) : cloud.hoursSince(patternSince)
      ]);
      if (gen !== generation || request !== readSequence) return;
      if (profile) state.profile = profile;
      stats = { days, hours: { ...(older ? stats.hours : {}), ...Object.fromEntries(page.rows.map(row => [row.id, row])) },
        base, cursor: page.cursor, more: page.more, patternSince,
        patternHours: patternRows ? Object.fromEntries(patternRows.map(row => [row.id, row])) : stats.patternHours };
      statsLoaded = true; $('loadHistory').hidden = !page.more;
      $('weeklyGoal').value = state.profile.weeklyGoal / 3600;
      $('statsMessage').textContent = Object.keys(state.queue).length ? 'Includes progress saved on this device.' : 'Cloud history loaded.';
      paint();
    } catch { if (gen === generation && request === readSequence) $('statsMessage').textContent = 'Cloud history is unavailable. Activity is still tracked on this device; reconnect to refresh totals.'; }
  }
  $('refreshStats').onclick = () => void loadStats(false, true);
  $('loadHistory').onclick = () => void loadStats(true);
  $('editGoal').onclick = () => { $('goalForm').hidden = !$('goalForm').hidden; };
  $('goalForm').onsubmit = async event => {
    event.preventDefault(); if (!state?.profile || !store || !user) return;
    const goal = Number($('weeklyGoal').value) * 3600;
    if (!Number.isInteger(goal) || goal < 1800 || goal > 604800 || goal === state.profile.weeklyGoal) return;
    const gen = generation;
    try { await store.goal(goal); if (gen !== generation) return; state.profile.weeklyGoal = goal; await persist(); $('goalForm').hidden = true; paint(); $('statsMessage').textContent = 'Weekly goal saved.'; }
    catch { $('statsMessage').textContent = 'Goal could not save. Reconnect and try again.'; }
  };
  setInterval(() => {
    if (user && !leader) void becomeRecorder(generation);
    if (ready && leader) {
      void persist().catch(() => {}); paint();
      if (Object.keys(state.queue).length && !saving) status(localHealthy ? 'Saved on this device · Syncs at session events' : 'Progress is only in memory · Keep this page open');
    }
  }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) void persist().catch(() => {}); });
  window.addEventListener('pagehide', () => { void persist().catch(() => {}); });
  window.addEventListener('online', () => { if (ready) void sync(); else if (user) void becomeRecorder(generation); });
}
