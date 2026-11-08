// Organizer deletes the current session: confirm step, sign-ups and session removed (in batches), config cleared,
// log line, page shows "No session scheduled yet", history unaffected, the organizer can start a new one; a played
// session can be deleted too; players are not offered the button; rules enforced throughout.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SRC = '/home/claude/fbwork/v12/index.html';
const FAKE = fs.readFileSync(path.join(__dirname, 'fakefirebase.js'), 'utf8'); const RULES = fs.readFileSync(path.join(__dirname, 'fakerules.js'), 'utf8');
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = '<script id="vb-config" type="application/json">{"firebase":{"apiKey":"k","projectId":"volley-test","appId":"1"}}</script>';
(async () => {
  const html = fs.readFileSync(SRC, 'utf8'); const p = path.join(__dirname, 'fb22.html'); fs.writeFileSync(p, html.replace('<script id="vb-config" type="application/json">{}</script>', CFG));
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(FAKE); await ctx.addInitScript(RULES);
  await ctx.addInitScript(() => { if (window.top !== window) return;
    const f = window.__fake; const d = new Date(); d.setDate(d.getDate() + 2); const id = d.toISOString().slice(0, 10);
    f.seed('admins/organizer@example.com', {}); f.seed('config/app', { title: 'T', organizer: 'Gürkan', currentSessionId: id });
    f.seed('sessions/' + id, { date: id, time: '19:00', place: 'Beach Mitte', capacity: 12, benchCap: 4, status: 'open', createdAt: new f.Timestamp(1), startsAtTs: new f.Timestamp(d.getTime()), duration: 120, roster: null, summary: null, playedAt: null });
    f.seed('sessions/2026-10-01', { date: '2026-10-01', time: '19:00', place: 'Old hall', capacity: 8, status: 'played', createdAt: new f.Timestamp(1), playedAt: new f.Timestamp(2), roster: null, summary: { attendees: [] } });
    f.seed('signups/2026-10-01_u0', { sessionId: '2026-10-01', name: 'Old Player', uid: 'u0', createdAt: new f.Timestamp(5), status: 'active', paid: true, noshow: false, guestOf: '', addedBy: 'self' });
    for (let i = 0; i < 23; i++) { const uid = 'u' + i, name = 'Player ' + String(i + 1).padStart(2, '0'); f.seed('players/' + uid, { name, level: 3, email: uid + '@example.com', createdAt: new f.Timestamp(1) }); f.seed('names/' + name.toLowerCase(), { uid, name }); f.seed('signups/' + id + '_' + uid, { sessionId: id, name, uid, createdAt: new f.Timestamp(1000 + i), status: 'active', paid: i % 2 === 0, noshow: false, guestOf: '', addedBy: 'self' }); }
    f.seedAccount('u1@example.com', { uid: 'u1', name: 'Player 02', provider: 'password', pw: 'secret12' });
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.route('**/cdn.jsdelivr.net/**', r => r.abort()); await page.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
  await page.goto('file://' + p); await sleep(300);
  const dump = () => page.evaluate(() => window.__fake.dump());
  const denials = () => page.evaluate(() => (window.__fake.denials || []).map(d => d.join(' + ')));
  const signupsOf = async sid => Object.keys(await dump()).filter(k => k.startsWith('signups/' + sid + '_')).length;
  const sid = await page.evaluate(() => window.__fake.store.get('config/app').currentSessionId);
  // a player sees no delete button
  await page.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); await page.fill('#auEmail', 'u1@example.com'); await page.fill('#auPass', 'secret12'); await page.click('[data-act="auth-login"]'); await sleep(400);
  check('player: no "Delete this session" anywhere', !(await page.$('[data-act="ev-delete-ask"]')) && (await page.textContent('.status')).includes('Player 02'));
  await page.click('.status [data-act="logout"]'); await sleep(200);
  // organizer
  await page.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); await page.evaluate(() => window.__fake.setGoogleEmail('organizer@example.com', 'Gürkan')); await page.click('[data-act="auth-google"]'); await sleep(400);
  if (await page.$('[data-act="profile-save"]')) { await page.click('.lvl[data-n="3"]'); await page.click('[data-act="profile-save"]'); await sleep(400); }
  check('organizer sees the delete button under the session', !!(await page.$('[data-act="ev-delete-ask"]')) && (await signupsOf(sid)) === 23);
  await page.click('[data-act="ev-delete-ask"]'); await sleep(100);
  check('confirm step names the consequences and the number of sign-ups', /Delete this session for good/.test(await page.textContent('.note.warn')) && /23 sign-ups will be deleted/.test(await page.textContent('.note.warn')) && !!(await page.$('[data-act="ev-delete-yes"]')));
  await page.click('[data-act="ev-delete-no"]'); await sleep(100);
  check('cancel keeps everything', !(await page.$('[data-act="ev-delete-yes"]')) && (await signupsOf(sid)) === 23);
  await page.click('[data-act="ev-delete-ask"]'); await sleep(100); await page.click('[data-act="ev-delete-yes"]'); await sleep(1200);
  const d = await dump();
  check('session and its 23 sign-ups deleted, config cleared, no refusals', !d['sessions/' + sid] && (await signupsOf(sid)) === 0 && d['config/app'].currentSessionId === '' && (await denials()).length === 0, [Object.keys(d).filter(k => k.startsWith('sessions/')), d['config/app'], await denials()]);
  check('the old played session and its sign-up are untouched', !!d['sessions/2026-10-01'] && !!d['signups/2026-10-01_u0']);
  check('one log line: deleted the session · … · 23 sign-ups', Object.values(d).some(v => v && v.type === 'session-delete' && /23 sign-ups/.test(v.detail) && v.sessionId === sid), Object.values(d).filter(v => v && v.type === 'session-delete'));
  check('page shows "No session scheduled yet", the form is ready for a new one', /No session scheduled yet/.test(await page.textContent('.band')) && !!(await page.$('[data-act="ev-new-ask"]')) && !(await page.$('[data-act="ev-delete-ask"]')), await page.textContent('.band'));
  check('history still lists the old session', (await page.textContent('#app')).includes('Previous sessions') && (await page.textContent('#app')).includes('1 Oct'));
  check('toast confirms', /Session deleted/.test(await page.evaluate(() => (document.querySelector('#vb-toast') || {}).textContent || '')));
  check('batches stayed within the rule look-up limits', (await page.evaluate(() => window.__fake.ruleStats.maxPerBatch)) <= 20, await page.evaluate(() => window.__fake.ruleStats));
  // start a new session, mark it played, delete that too
  await page.fill('#evDate', '24-12-2026'); await page.fill('#evTime', '19:00'); await page.fill('#evPlace', 'Hall'); await page.click('[data-act="ev-new-ask"]'); await sleep(100); if (await page.$('[data-act="ev-new-yes"]')) await page.click('[data-act="ev-new-yes"]'); await sleep(500);
  check('a new session can be started afterwards', (await page.evaluate(() => window.__fake.store.get('config/app').currentSessionId)) === '2026-12-24' && /24 December/.test(await page.textContent('.band')));
  await page.click('[data-act="done-ask"]'); await sleep(100); await page.click('[data-act="done-yes"]'); await sleep(500);
  check('played session still offers deletion', !!(await page.$('[data-act="ev-delete-ask"]')) && /Marked as played/.test(await page.textContent('#app')));
  await page.click('[data-act="ev-delete-ask"]'); await sleep(100); await page.click('[data-act="ev-delete-yes"]'); await sleep(800);
  const d2 = await dump();
  check('played session deleted as well, nothing refused', !d2['sessions/2026-12-24'] && d2['config/app'].currentSessionId === '' && (await denials()).length === 0, await denials());
  check('no page errors', errs.length === 0, errs);
  await browser.close(); console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all delete-session checks passed')); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
