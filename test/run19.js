// 1. The self-update check over HTTP (version.txt newer / same / garbage; reload exactly once).
// 2. Two devices at once on the shared stand-in: organizer and player see each other's changes live.
// 3. Narrow phone (320 px) with long names, venue and note, light and dark: screenshots + overflow check.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SRC = '/home/claude/fbwork/v12/index.html';
const OUT = '/tmp/claude-0/-home-claude/82e4117e-3441-59d5-9fb9-4e4b0005f9db/scratchpad';
const FAKE = fs.readFileSync(path.join(__dirname, 'fakefirebase.js'), 'utf8'); const RULES = fs.readFileSync(path.join(__dirname, 'fakerules.js'), 'utf8');
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = '<script id="vb-config" type="application/json">{"firebase":{"apiKey":"k","projectId":"volley-test","appId":"1"}}</script>';
(async () => {
  const html = fs.readFileSync(SRC, 'utf8').replace('<script id="vb-config" type="application/json">{}</script>', CFG);
  const browser = await chromium.launch();
  // ---------- 1. update check
  const CUR = /const APP_VERSION = '(v\d+)'/.exec(html)[1]; const NEXT = 'v' + (parseInt(CUR.slice(1), 10) + 1);
  for (const [label, versionBody, expectReloads] of [['same build', CUR + '\n', 0], ['newer build', NEXT + '\n', 1], ['garbage (404 page)', '<!doctype html><title>404</title>', 0], ['older build', 'v9\n', 1]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); await ctx.addInitScript(FAKE); await ctx.addInitScript(RULES);
    let loads = 0; let versionHits = 0;
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (/\/volleyball\/version\.txt/.test(u)) { versionHits++; return r.fulfill({ status: 200, contentType: 'text/plain', body: versionBody }); }
      if (/\/volleyball\/(index\.html)?(\?.*)?$/.test(u)) { loads++; return r.fulfill({ status: 200, contentType: 'text/html', body: html }); }
      return r.abort();
    });
    const page = await ctx.newPage(); await page.goto('https://test.example/volleyball/'); await sleep(900);
    check(`update check, ${label}: version.txt fetched, page reloaded ${expectReloads}×`, versionHits >= 1 && loads === 1 + expectReloads, { versionHits, loads });
    if (expectReloads) { await page.reload(); await sleep(600); check(`update check, ${label}: no reload loop on the next load`, loads === 2 + expectReloads, loads); }
    await ctx.close();
  }
  // ---------- 2. two devices
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } }); await ctx.addInitScript(FAKE); await ctx.addInitScript(RULES);
    await ctx.addInitScript(() => { if (window.top !== window) return; const f = window.__fake; const d = new Date(); d.setDate(d.getDate() + 2); const id = d.toISOString().slice(0, 10); f.seed('admins/organizer@example.com', {}); f.seed('config/app', { title: 'T', organizer: 'Gürkan', pageUrl: 'https://koraykayir.github.io/volleyball/', currentSessionId: id }); f.seed('sessions/' + id, { date: id, time: '19:00', place: 'Beach Mitte', capacity: 2, benchCap: 2, status: 'open', createdAt: new f.Timestamp(1), startsAtTs: new f.Timestamp(d.getTime()), duration: 120, roster: null, summary: null, playedAt: null }); });
    const fp = path.join(__dirname, 'fb19.html'); fs.writeFileSync(fp, html);
    const A = await ctx.newPage(), B = await ctx.newPage(); const errs = []; [A, B].forEach(p => { p.on('pageerror', e => errs.push(e.message)); });
    for (const p of [A, B]) { await p.route('**/cdn.jsdelivr.net/**', r => r.abort()); await p.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' })); await p.goto('file://' + fp); await sleep(300); }
    const rows = p => p.$$eval('.row', rs => rs.map(r => r.querySelector('.pos').textContent + ':' + r.querySelector('.n').textContent.trim()));
    // A: player registers and joins
    await A.click('.status [data-act="auth-open"][data-mode="register"]'); await sleep(80); await A.fill('#auName', 'Ana'); await A.fill('#auEmail', 'ana@example.com'); await A.fill('#auPass', 'secret12'); await A.click('.lvl[data-n="3"]'); await A.click('[data-act="auth-register"]'); await sleep(500);
    await A.click('button[data-act="join"]'); await sleep(500);
    check('device B (logged out) sees Ana join without refresh', JSON.stringify(await rows(B)) === JSON.stringify(['1:Ana']), await rows(B));
    // B: organizer logs in, adds two people by hand → A sees them, Ana stays first
    await B.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); await B.evaluate(() => window.__fake.setGoogleEmail('organizer@example.com', 'Gürkan')); await B.click('[data-act="auth-google"]'); await sleep(400);
    if (await B.$('[data-act="profile-save"]')) { await B.click('.lvl[data-n="3"]'); await B.click('[data-act="profile-save"]'); await sleep(400); }
    await B.fill('#addName', 'Ben'); await B.click('[data-act="add-player"]'); await sleep(400); await B.fill('#addName', 'Cem'); await B.click('[data-act="add-player"]'); await sleep(500);
    check('device A sees the organizer\'s additions live (Cem on the bench)', JSON.stringify(await rows(A)) === JSON.stringify(['1:Ana', '2:Ben', 'B1:Cem']), await rows(A));
    // A: Ana asks to leave → B sees the request, approves → A sees it and Cem moves up on both
    await A.click('[data-act="leave-ask"]'); await sleep(80); await A.click('[data-act="leave-yes"]'); await sleep(600);
    check('device B sees the leave request', !!(await B.$('[data-act="leave-approve"]')) && (await B.textContent('#app')).includes('Ana'));
    await B.click('[data-act="leave-approve"]'); await sleep(700);
    check('after approval both devices show Ben #1, Cem #2', JSON.stringify(await rows(A)) === JSON.stringify(['1:Ben', '2:Cem']) && JSON.stringify(await rows(B)) === JSON.stringify(['1:Ben', '2:Cem']), [await rows(A), await rows(B)]);
    check('device A tells Ana she is off the list', !!(await A.$('button[data-act="join"]')) || /left|removed|not on the list/i.test(await A.textContent('.card')));
    // A: Ana rejoins (back of the queue, bench) and renames → B's list follows
    await A.click('button[data-act="join"]'); await sleep(600);
    check('rejoin lands on the bench on both devices', JSON.stringify(await rows(B)) === JSON.stringify(['1:Ben', '2:Cem', 'B1:Ana']), await rows(B));
    await A.click('.status [data-act="account-open"]'); await sleep(200); await A.fill('#acName', 'Ana K.'); await A.click('[data-act="account-rename"]'); await sleep(700);
    check('rename shows on the organizer\'s device at once', JSON.stringify(await rows(B)) === JSON.stringify(['1:Ben', '2:Cem', 'B1:Ana K.']), await rows(B));
    // B: organizer changes capacity to 4 (must be even) → A's Ana moves up to #3
    await B.fill('#evCap', '4'); await B.click('[data-act="ev-update"]'); await sleep(700);
    await A.click('[data-act="account-close"]'); await sleep(200);
    check('capacity change moves Ana up on her own device', JSON.stringify(await rows(A)) === JSON.stringify(['1:Ben', '2:Cem', '3:Ana K.']), await rows(A));
    check('two devices: no page errors, no refused writes', errs.length === 0 && (await A.evaluate(() => (window.__fake.denials || []).length)) === 0 && (await B.evaluate(() => (window.__fake.denials || []).length)) === 0, [errs, await A.evaluate(() => window.__fake.denials), await B.evaluate(() => window.__fake.denials)]);
    await ctx.close();
  }
  // ---------- 3. narrow layout
  {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2, colorScheme: scheme });
      const page = await ctx.newPage(); await page.route('**/cdn.jsdelivr.net/**', r => r.abort()); await page.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' })); await page.route('**/fonts.googleapis.com/**', r => r.abort());
      await page.addInitScript(() => { if (window.top !== window) return;
        const d = new Date(); d.setDate(d.getDate() + 2); const id = d.toISOString().slice(0, 10);
        const names = ['Şükrü Çağrı Öztürk Karakaşoğlu Büyükçekmeceli', 'Ana', 'Maximilian-Alexander von Hohenzollern-Sigmaringen', 'Deniz Doğa Çalışkan', '<img src=x onerror=alert(1)> Bob', 'Cem', 'Dia'];
        const db = { example: false, config: { title: 'Volley Berlin | Beachvolleyball Mixed Open Training', organizer: 'Gürkan', currentSessionId: id, pageUrl: 'https://koraykayir.github.io/volleyball/' }, sessions: {}, signups: {}, contacts: {}, ratings: {}, players: {}, accounts: {}, pairs: { together: '', apart: '' }, log: {} };
        db.sessions[id] = { id, date: id, time: '19:00', place: 'Beachvolleyballanlage am Olympiastadion, Hanns-Braun-Straße, Berlin-Westend', venueType: 'outdoor', formats: '2v2 / 3v3 / 4v4', capacity: 4, benchCap: 4, price: '8 €', note: 'Bring water. We meet at the north entrance; the courts are behind the big hall. Parking is scarce, come by bike or S-Bahn.', opensAt: '', duration: 120, status: 'open', playedAt: null, roster: null, summary: null, createdAt: 1 };
        names.forEach((n, i) => { db.players['u' + i] = { name: n, level: 3, email: '' }; db.signups[id + '_u' + i] = { id: id + '_u' + i, sessionId: id, name: n, uid: 'u' + i, createdAt: 100 + i, status: 'active', paid: i % 2 === 0, noshow: false, guestOf: '', addedBy: 'self' }; });
        localStorage.setItem('vb.localdb', JSON.stringify(db)); localStorage.setItem('vb.localAdmin', 'true');
      });
      await page.goto('file://' + SRC); await sleep(400);
      const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      check(`320px ${scheme}: no horizontal overflow as a visitor`, over <= 0, over);
      await page.screenshot({ path: path.join(OUT, `narrow-${scheme}-list.png`), fullPage: false });
      if (await page.$('[data-act="org-open"]')) { await page.click('[data-act="org-open"]'); await sleep(100); } if (await page.$('[data-act="org-demo"]')) { await page.click('[data-act="org-demo"]'); await sleep(300); }
      check(`320px ${scheme}: organizer panel open`, !!(await page.$('.org')));
      const over2 = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      check(`320px ${scheme}: no horizontal overflow as organizer`, over2 <= 0, over2);
      await page.evaluate(() => { const el = document.querySelector('.org'); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 10); }); await sleep(100);
      await page.screenshot({ path: path.join(OUT, `narrow-${scheme}-org.png`), fullPage: false });
      await ctx.close();
    }
  }
  await browser.close(); console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all update/sync/layout checks passed')); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
