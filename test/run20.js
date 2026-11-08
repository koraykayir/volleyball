// Bulk organizer actions with a full session (16 players): "Mark all as paid", "Confirm I've-paid claims" and
// no-shows at "Mark as played" write one batch each. Firestore allows at most 20 rule document-access calls per
// batched write (the rules port enforces that), so these must be split into small batches.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SRC = process.env.SRC || '/home/claude/fbwork/v12/index.html';
const FAKE = fs.readFileSync(path.join(__dirname, 'fakefirebase.js'), 'utf8'); const RULES = fs.readFileSync(path.join(__dirname, 'fakerules.js'), 'utf8');
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = '<script id="vb-config" type="application/json">{"firebase":{"apiKey":"k","projectId":"volley-test","appId":"1"}}</script>';
(async () => {
  const html = fs.readFileSync(SRC, 'utf8'); const p = path.join(__dirname, 'fb20.html'); fs.writeFileSync(p, html.replace('<script id="vb-config" type="application/json">{}</script>', CFG));
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(FAKE); await ctx.addInitScript(RULES);
  await ctx.addInitScript(() => { if (window.top !== window) return;
    const f = window.__fake; const d = new Date(); d.setDate(d.getDate() + 1); const id = d.toISOString().slice(0, 10);
    f.seed('admins/organizer@example.com', {}); f.seed('config/app', { title: 'T', organizer: 'Gürkan', currentSessionId: id });
    f.seed('sessions/' + id, { date: id, time: '19:00', place: 'X', capacity: 16, benchCap: 4, status: 'open', createdAt: new f.Timestamp(1), startsAtTs: new f.Timestamp(d.getTime()), duration: 120, roster: null, summary: null, playedAt: null });
    for (let i = 0; i < 18; i++) { const uid = 'u' + i, name = 'Player ' + String(i + 1).padStart(2, '0'); f.seed('players/' + uid, { name, level: 1 + (i % 5), email: uid + '@example.com', createdAt: new f.Timestamp(1) }); f.seed('names/' + name.toLowerCase(), { uid, name });
      f.seed('signups/' + id + '_' + uid, Object.assign({ sessionId: id, name, uid, createdAt: new f.Timestamp(1000 + i), status: 'active', paid: false, noshow: false, guestOf: '', addedBy: 'self' }, i < 12 ? { paidClaimedAt: new f.Timestamp(2000 + i) } : {})); }
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.route('**/cdn.jsdelivr.net/**', r => r.abort()); await page.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
  await page.goto('file://' + p); await sleep(300);
  const dump = () => page.evaluate(() => window.__fake.dump());
  const denials = () => page.evaluate(() => (window.__fake.denials || []).map(d => d.join(' + ')));
  const stats = () => page.evaluate(() => window.__fake.ruleStats);
  const paidCount = async () => { const d = await dump(); return Object.keys(d).filter(k => k.startsWith('signups/')).filter(k => d[k].paid).length; };
  const noshowCount = async () => { const d = await dump(); return Object.keys(d).filter(k => k.startsWith('signups/')).filter(k => d[k].noshow).length; };
  const logs = async type => { const d = await dump(); return Object.keys(d).filter(k => k.startsWith('log/')).map(k => d[k]).filter(e => !type || e.type === type); };
  // organizer in
  await page.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); await page.evaluate(() => window.__fake.setGoogleEmail('organizer@example.com', 'Gürkan')); await page.click('[data-act="auth-google"]'); await sleep(300);
  if (await page.$('[data-act="profile-save"]')) { await page.click('.lvl[data-n="3"]'); await page.click('[data-act="profile-save"]'); await sleep(300); }
  check('organizer logged in, 16 playing + 2 bench, 12 claims', (await page.textContent('.status')).includes('organizer') && (await page.$$('.row')).length === 18);
  // 1. confirm the 12 "I've paid" claims in one go
  await page.click('[data-act="claims-confirm"]'); await sleep(900);
  check('confirm 12 claims: all 12 marked paid, 12 log entries, no refusal', (await paidCount()) === 12 && (await logs('paid')).length === 12 && (await denials()).length === 0, [await paidCount(), (await logs('paid')).length, await denials()]);
  // 2. mark everyone else as paid (4 playing unpaid)
  await page.click('[data-act="allpaid-ask"]'); await sleep(80); await page.click('[data-act="allpaid-yes"]'); await sleep(900);
  check('all paid: 16 playing paid, no refusal', (await paidCount()) === 16 && (await denials()).length === 0, [await paidCount(), await denials()]);
  // 3. undo: everyone unpaid again via the organizer (seed), then all paid at once with 16 unpaid
  await page.evaluate(() => { const f = window.__fake; [...f.store.keys()].filter(k => k.startsWith('signups/')).forEach(k => { const s = f.store.get(k); s.paid = false; f.seed(k, s); }); }); await sleep(300);
  await page.click('[data-act="allpaid-ask"]'); await sleep(80); await page.click('[data-act="allpaid-yes"]'); await sleep(1200);
  check('all paid with 16 unpaid at once: 16 paid, 16 log entries more, no refusal', (await paidCount()) === 16 && (await denials()).length === 0, [await paidCount(), await denials()]);
  // 4. mark as played with 14 no-shows
  await page.click('[data-act="done-ask"]'); await sleep(100);
  const picks = await page.$$('input[type="checkbox"][data-act="noshow-sel"]');
  for (let i = 0; i < Math.min(14, picks.length); i++) await picks[i].click();
  await page.click('[data-act="done-yes"]'); await sleep(1500);
  const d = await dump(); const sid = d['config/app'].currentSessionId;
  check('mark played with 14 no-shows: session played, no-shows stored, no refusal', d['sessions/' + sid].status === 'played' && (await noshowCount()) === Math.min(14, picks.length) && (await denials()).length === 0, [d['sessions/' + sid].status, await noshowCount(), picks.length, await denials()]);
  console.log('RULESTATS ' + JSON.stringify(await stats()));
  check('no page errors', errs.length === 0, errs);
  await browser.close(); console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all bulk checks passed')); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
