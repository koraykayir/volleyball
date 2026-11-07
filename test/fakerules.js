// JavaScript port of firestore.rules for the in-memory stand-in (fakefirebase.js), so tests run with the
// permission checks the real database applies. Options (set before this script runs):
//   window.__rulesLegacy = true   → the rules as published before build v20 (names: get needs a login, key == name.lower())
//   window.__rulesLower = 'simple' → the engine lowercases İ (U+0130) to a plain i; 'full' (default) → to "i̇" like JavaScript
(function () {
  const F = window.__fake;
  const lowerMode = window.__rulesLower || 'full';
  const lower = s => lowerMode === 'simple' ? String(s).replace(/İ/g, 'i').toLowerCase() : String(s).toLowerCase();
  const legacy = !!window.__rulesLegacy;
  const nameKeyOf = n => legacy ? lower(n) : lower(String(n).replace(/İ/g, 'i'));
  const now = () => (window.__serverNow || Date.now)();
  const ms = v => v && v.__pending ? v.__pending : (v && typeof v.toMillis === 'function' ? v.toMillis() : (v == null ? null : v));
  const signedIn = u => !!u && !u.isAnonymous;
  const isAdmin = (u, store) => signedIn(u) && !!u.email && store.has('admins/' + u.email); // email_verified assumed for Google accounts
  const validName = n => typeof n === 'string' && n.length > 0 && n.length <= 60 && !/\//.test(n);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sessionOpen = (store, id) => { const s = store.get('sessions/' + id); if (!s) throw new Error('no session'); return s.status === 'open' && (ms(s.opensAtTs) == null || now() >= ms(s.opensAtTs)); };
  const leaveIsFree = (store, id) => { const s = store.get('sessions/' + id); if (!s) throw new Error('no session'); return ms(s.startsAtTs) != null && now() >= ms(s.startsAtTs) - 3 * 3600e3; };
  function get(path, u, store) {
    const [col, id] = path.split('/');
    if (col === 'admins') return signedIn(u) && u.email === id;
    if (col === 'config' || col === 'sessions' || col === 'signups') return true;
    if (col === 'clock') return signedIn(u) && u.uid === id;
    if (col === 'names') return legacy ? signedIn(u) : true;
    if (col === 'players') return isAdmin(u, store) || (signedIn(u) && u.uid === id);
    if (col === 'ratings' || col === 'contacts' || col === 'log') return isAdmin(u, store);
    return false;
  }
  function writeOne(op, u, before, after) {
    const [col, id] = op.path.split('/'); const cur = before.get(op.path); const next = after.get(op.path); const data = op.data || {};
    const keys = Object.keys(data); const hasOnly = allowed => keys.every(k => allowed.includes(k));
    const admin = isAdmin(u, before);
    const profileAfter = () => { const p = after.get('players/' + u.uid); if (!p) throw new Error('no profile after'); return p; };
    const changed = () => (cur && next) ? Object.keys(next).filter(k => !same(next[k], cur[k])).concat(Object.keys(cur).filter(k => !(k in next))) : [];
    if (col === 'admins') return false;
    if (col === 'config' || col === 'sessions' || col === 'ratings' || col === 'contacts') return admin;
    if (col === 'clock') return signedIn(u) && u.uid === id && hasOnly(['t']) && F.isServerTs(data.t);
    if (col === 'names') {
      if (op.type === 'delete') return admin || (signedIn(u) && !!cur && cur.uid === u.uid && (!after.has('players/' + u.uid) || nameKeyOf(profileAfter().name) !== id));
      if (cur !== undefined) return false;
      return signedIn(u) && hasOnly(['uid', 'name']) && data.uid === u.uid && validName(data.name) && id === nameKeyOf(data.name) && nameKeyOf(profileAfter().name) === id;
    }
    if (col === 'players') {
      if (op.type === 'delete') return admin || (signedIn(u) && u.uid === id);
      if (cur === undefined) return signedIn(u) && u.uid === id && hasOnly(['name', 'level', 'email', 'createdAt']) && validName(data.name)
        && Number.isInteger(data.level) && data.level >= 1 && data.level <= 5 && data.email === (u.email || '') && F.isServerTs(data.createdAt);
      const ch = changed();
      if (admin && ch.every(k => ['level', 'name'].includes(k)) && Number.isInteger(next.level) && next.level >= 1 && next.level <= 5 && validName(next.name)) return true;
      if (signedIn(u) && u.uid === id && ch.every(k => k === 'name') && validName(next.name)) { const claim = after.get('names/' + nameKeyOf(next.name)); if (!claim) throw new Error('no claim after'); return claim.uid === id; }
      return false;
    }
    if (col === 'signups') {
      if (op.type === 'delete') return admin;
      if (cur === undefined) return admin || (signedIn(u) && id === data.sessionId + '_' + u.uid
        && hasOnly(['sessionId', 'name', 'uid', 'createdAt', 'status', 'paid', 'noshow', 'guestOf', 'addedBy'])
        && data.uid === u.uid && before.has('players/' + u.uid) && validName(data.name) && data.name === profileAfter().name
        && data.status === 'active' && data.paid === false && data.noshow === false && data.guestOf === '' && data.addedBy === 'self'
        && F.isServerTs(data.createdAt) && sessionOpen(before, data.sessionId));
      if (admin) return true;
      if (!(signedIn(u) && cur.uid === u.uid && cur.addedBy === 'self')) return false;
      const ch = changed(); const only = ks => ch.every(k => ks.includes(k));
      const sessOpen = () => { const s = before.get('sessions/' + cur.sessionId); if (!s) throw new Error('no session'); return s.status === 'open'; };
      return (only(['name']) && next.name === profileAfter().name)
        || (cur.status === 'active' && sessOpen() && only(['status', 'leftAt']) && next.status === 'left' && F.isServerTs(data.leftAt) && leaveIsFree(before, cur.sessionId))
        || (cur.status === 'active' && sessOpen() && only(['status', 'leaveRequestedAt']) && next.status === 'leaving' && F.isServerTs(data.leaveRequestedAt))
        || ((cur.status === 'active' || cur.status === 'leaving') && only(['paidClaimedAt']) && (!('paidClaimedAt' in next) || F.isServerTs(data.paidClaimedAt)))
        || (cur.status === 'leaving' && only(['status']) && next.status === 'active')
        || (cur.status === 'left' && only(['status', 'createdAt', 'name']) && next.status === 'active' && F.isServerTs(data.createdAt) && next.name === profileAfter().name && sessionOpen(before, cur.sessionId));
    }
    if (col === 'log') {
      if (op.type !== 'set' || cur !== undefined) return false;
      const signupAfter = sid => { const s = after.get('signups/' + sid + '_' + u.uid); if (!s) throw new Error('no signup after'); return s; };
      const selfLogOk = e => (['join', 'rejoin'].includes(e.type) && signupAfter(e.sessionId).status === 'active')
        || (e.type === 'leave' && signupAfter(e.sessionId).status === 'left')
        || (e.type === 'leave-request' && signupAfter(e.sessionId).status === 'leaving')
        || (e.type === 'leave-cancel' && signupAfter(e.sessionId).status === 'active')
        || (e.type === 'paid-claim' && 'paidClaimedAt' in signupAfter(e.sessionId))
        || (e.type === 'paid-unclaim' && !('paidClaimedAt' in signupAfter(e.sessionId)))
        || (['register', 'rename'].includes(e.type) && profileAfter().name === e.name)
        || (e.type === 'account-delete' && !after.has('players/' + u.uid));
      return signedIn(u) && hasOnly(['sessionId', 'at', 'type', 'name', 'uid', 'key', 'detail', 'by', 'byName']) && F.isServerTs(data.at) && data.by === u.uid
        && (admin || (data.uid === u.uid && selfLogOk(data)));
    }
    return false;
  }
  F.setRules({ get, write: (ops, u, before, after) => ops.every(op => { try { return writeOne(op, u, before, after); } catch (e) { return false; } }) });
})();
