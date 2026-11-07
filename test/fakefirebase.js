// Minimal in-memory stand-in for the Firebase compat SDK (app, auth, firestore) used by the page.
(function () {
  const SERVER_TS = { __ts: true }; const DELETE = { __del: true };
  class Timestamp { constructor(ms, ns) { this.ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = ns != null ? ns : (ms % 1000) * 1e6; } toMillis() { return this.ms; } toDate() { return new Date(this.ms); } static fromDate(d) { return new Timestamp(d.getTime()); } static now() { return new Timestamp(Date.now()); } }
  const store = new Map(); // path -> data
  const listeners = new Set();
  let autoId = 0; let failNext = null; let latency = 30;
  // optional security-rules stand-in: { get(path, user, store) -> bool, write(ops, user, before, after) -> bool }
  let rules = null;
  const denied = () => Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
  function afterOf(ops) { const after = new Map(store); ops.forEach(op => { const cur = after.get(op.path); if (op.type === 'delete') { after.delete(op.path); return; } const data = {}; for (const k of Object.keys(op.data)) if (op.data[k] !== DELETE) data[k] = op.data[k]; const next = op.type === 'set' && !op.merge ? data : Object.assign({}, cur || {}, data); for (const k of Object.keys(op.data)) if (op.data[k] === DELETE) delete next[k]; after.set(op.path, next); }); return after; }
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o, (k, v) => v instanceof Timestamp ? { __tsv: v.ms, __ns: v.nanoseconds } : v), (k, v) => v && typeof v === 'object' && '__tsv' in v ? new Timestamp(v.__tsv, v.__ns) : v);
  const pendingPaths = new Set();
  function resolveTs(data, now) { const o = {}; for (const k of Object.keys(data)) { const v = data[k]; o[k] = v === SERVER_TS ? new Timestamp(now) : v; } return o; }
  function snapDoc(path, data) {
    const id = path.split('/').pop();
    return { id, exists: data !== undefined, ref: { id, path }, metadata: { hasPendingWrites: pendingPaths.has(path), fromCache: false },
      data(opts) { if (data === undefined) return undefined; const o = clone(data); for (const k of Object.keys(o)) if (o[k] && o[k].__pending) o[k] = opts && opts.serverTimestamps === 'none' ? null : new Timestamp(o[k].__pending); return o; } };
  }
  function notify() { listeners.forEach(l => { try { l(); } catch (e) { console.error(e); } }); }
  function apply(ops) {
    if (failNext) { const e = failNext; failNext = null; return Promise.reject(e); }
    if (rules && rules.write) { let ok = false; try { ok = rules.write(ops, currentUser, store, afterOf(ops)); } catch (e) { ok = false; } if (!ok) { window.__fake.denials = (window.__fake.denials || []).concat([ops.map(o => o.type + ' ' + o.path)]); return denied(); } }
    const now = (window.__serverNow || Date.now)();
    // optimistic local write: mark pending, serverTimestamp estimated
    ops.forEach(op => {
      if (op.type === 'delete') return;
      const est = {}; for (const k of Object.keys(op.data)) if (op.data[k] !== DELETE) est[k] = op.data[k] === SERVER_TS ? { __pending: now } : op.data[k];
      const cur = store.get(op.path);
      if (op.type === 'update' && cur === undefined) return;
      const next = op.type === 'set' && !op.merge ? est : Object.assign({}, cur || {}, est);
      for (const k of Object.keys(op.data)) if (op.data[k] === DELETE) delete next[k];
      store.set(op.path, next);
      pendingPaths.add(op.path);
    });
    notify();
    return new Promise(res => setTimeout(() => {
      ops.forEach(op => {
        if (op.type === 'delete') { store.delete(op.path); return; }
        const cur = store.get(op.path) || {}; const fixed = {};
        for (const k of Object.keys(cur)) fixed[k] = cur[k] && cur[k].__pending ? new Timestamp(now) : cur[k];
        store.set(op.path, fixed); pendingPaths.delete(op.path);
      });
      notify(); res();
    }, latency));
  }
  function docRef(path) {
    const id = path.split('/').pop();
    return {
      id, path,
      collection: sub => colRef(path + '/' + sub),
      set: (data, opts) => apply([{ type: 'set', path, data, merge: !!(opts && opts.merge) }]),
      update: data => store.has(path) ? apply([{ type: 'update', path, data }]) : Promise.reject(Object.assign(new Error('No document to update'), { code: 'not-found' })),
      delete: () => apply([{ type: 'delete', path }]),
      get: () => { if (rules && rules.get) { let ok = false; try { ok = rules.get(path, currentUser, store); } catch (e) { ok = false; } if (!ok) { window.__fake.denials = (window.__fake.denials || []).concat([['get ' + path]]); return denied(); } } return Promise.resolve(snapDoc(path, store.get(path))); },
      onSnapshot(a, b, c) { const next = typeof a === 'function' ? a : b; const onErr = typeof a === 'function' ? b : c; if (rules && rules.get) { let ok = false; try { ok = rules.get(path, currentUser, store); } catch (e) { ok = false; } if (!ok) { window.__fake.denials = (window.__fake.denials || []).concat([['listen ' + path]]); setTimeout(() => onErr && onErr(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })), 5); return () => {}; } } const l = () => next(snapDoc(path, store.get(path))); listeners.add(l); setTimeout(l, 5); return () => listeners.delete(l); }
    };
  }
  function query(colPath, filters, order, lim) {
    const tsv = v => v && v.__pending ? v.__pending : (v && typeof v.toMillis === 'function' ? v.toMillis() : v);
    const docsNow = () => { let rows = [...store.keys()].filter(p => p.startsWith(colPath + '/') && p.split('/').length === colPath.split('/').length + 1)
      .map(p => [p, store.get(p)]).filter(([p, d]) => filters.every(([f, op, v]) => op === '==' ? d[f] === v : true));
      if (order) rows.sort((a, b) => { const x = tsv(a[1][order[0]]), y = tsv(b[1][order[0]]); const c = x == null ? (y == null ? 0 : 1) : (y == null ? -1 : (x < y ? -1 : (x > y ? 1 : 0))); return order[1] === 'desc' ? -c : c; });
      if (lim) rows = rows.slice(0, lim);
      return rows.map(([p, d]) => snapDoc(p, d)); };
    return {
      where: (f, op, v) => query(colPath, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f, dir) => query(colPath, filters, [f, dir || 'asc'], lim),
      limit: n => query(colPath, filters, order, n),
      get: () => { if (rules && rules.list) { let ok = false; try { ok = rules.list(colPath, currentUser, store); } catch (e) { ok = false; } if (!ok) { window.__fake.denials = (window.__fake.denials || []).concat([['list ' + colPath]]); return denied(); } } return Promise.resolve({ docs: docsNow() }); },
      onSnapshot(a, b, c) { const next = typeof a === 'function' ? a : b; const onErr = typeof a === 'function' ? b : c; if (rules && rules.list) { let ok = false; try { ok = rules.list(colPath, currentUser, store); } catch (e) { ok = false; } if (!ok) { window.__fake.denials = (window.__fake.denials || []).concat([['query ' + colPath]]); setTimeout(() => onErr && onErr(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })), 5); return () => {}; } } const l = () => next({ docs: docsNow(), metadata: { fromCache: false, hasPendingWrites: false } }); listeners.add(l); setTimeout(l, 5); return () => listeners.delete(l); }
    };
  }
  function colRef(path) { const q = query(path, []); return Object.assign(q, { path, doc: id => docRef(path + '/' + (id || ('auto' + (++autoId) + Math.random().toString(36).slice(2, 7)))) }); }
  const db = { collection: colRef, batch() { const ops = []; return { set(ref, data, opts) { ops.push({ type: 'set', path: ref.path, data, merge: !!(opts && opts.merge) }); }, update(ref, data) { ops.push({ type: 'update', path: ref.path, data }); }, delete(ref) { ops.push({ type: 'delete', path: ref.path }); }, commit: () => apply(ops) }; } };
  // ---- auth
  const authListeners = new Set(); let currentUser = null; let nextGoogleEmail = 'organizer@example.com'; let nextGoogleName = 'Organizer Person';
  const accounts = {}; let uidSeq = 0; let disabled = {};
  const err = (code) => Promise.reject(Object.assign(new Error(code), { code }));
  function mkUser(uid, email, name, provider) { const u = { uid, email, displayName: name || null, isAnonymous: false, providerData: [{ providerId: provider }], getIdToken: () => Promise.resolve('t'), updateProfile: async p => { u.displayName = p.displayName; if (accounts[email]) accounts[email].name = p.displayName; },
    reauthenticateWithCredential: async c => { const a = accounts[c.email]; if (!a || a.pw !== c.password) return err('auth/invalid-credential'); },
    updatePassword: async pw => { if (pw.length < 6) return err('auth/weak-password'); accounts[email].pw = pw; },
    reauthenticateWithPopup: async () => { window.__fake.reauthPopups = (window.__fake.reauthPopups || 0) + 1; },
    delete: async () => { delete accounts[email]; window.__fake.deletedUsers = (window.__fake.deletedUsers || []).concat([uid]); setUser(null); } }; return u; }
  function setUser(u) { currentUser = u; auth.currentUser = u; authListeners.forEach(l => setTimeout(() => l(u), 0)); }
  const auth = {
    currentUser: null,
    onAuthStateChanged(l) { authListeners.add(l); setTimeout(() => l(currentUser), 0); return () => authListeners.delete(l); },
    signInAnonymously() { return err('auth/should-not-be-used'); },
    signInWithPopup() { if (disabled.google) return err('auth/operation-not-allowed'); const e = nextGoogleEmail; if (!accounts[e]) accounts[e] = { uid: 'g' + (++uidSeq), name: nextGoogleName, provider: 'google.com' }; const u = mkUser(accounts[e].uid, e, accounts[e].name, 'google.com'); setUser(u); return Promise.resolve({ user: u }); },
    signInWithRedirect() { return auth.signInWithPopup(); },
    getRedirectResult() { return Promise.resolve({ user: null }); },
    createUserWithEmailAndPassword(e, pw) { if (disabled.password) return err('auth/operation-not-allowed'); if (accounts[e]) return err('auth/email-already-in-use'); if (pw.length < 6) return err('auth/weak-password'); accounts[e] = { uid: 'p' + (++uidSeq), pw, provider: 'password' }; const u = mkUser(accounts[e].uid, e, null, 'password'); setUser(u); return Promise.resolve({ user: u }); },
    signInWithEmailAndPassword(e, pw) { const a = accounts[e]; if (!a || a.pw !== pw) return err('auth/invalid-credential'); const u = mkUser(a.uid, e, a.name, 'password'); setUser(u); return Promise.resolve({ user: u }); },
    sendPasswordResetEmail(e) { window.__fake.resetSent = e; return Promise.resolve(); },
    signOut() { setUser(null); return Promise.resolve(); }
  };
  function GoogleAuthProvider() { this.setCustomParameters = () => {}; }
  const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
  const firestoreFn = () => db; firestoreFn.FieldValue = { serverTimestamp: () => SERVER_TS, delete: () => DELETE }; firestoreFn.Timestamp = Timestamp;
  const authFn = () => auth; authFn.GoogleAuthProvider = GoogleAuthProvider; authFn.EmailAuthProvider = EmailAuthProvider;
  window.firebase = { apps: [], initializeApp(c) { this.apps.push({ options: c }); window.__fbConfig = c; return this.apps[0]; }, app() { return this.apps[0]; }, firestore: firestoreFn, auth: authFn };
  window.__fake = {
    store, notify, Timestamp,
    seed(path, data) { store.set(path, data); notify(); },
    failNext(code) { failNext = Object.assign(new Error(code), { code }); },
    setGoogleEmail(e, n) { nextGoogleEmail = e; if (n) nextGoogleName = n; }, disable(k, v) { disabled[k] = v; }, setLatency(ms) { latency = ms; },
    setRules(r) { rules = r; }, isServerTs: v => v === SERVER_TS, isDelete: v => v === DELETE, get user() { return currentUser; },
    dump() { const o = {}; store.forEach((v, k) => { o[k] = clone(v); }); return o; }
  };
})();
