// Names with Turkish (and other non-ASCII) letters, against the production-like data of 7 November:
// existing profiles without nameKey and claims under the plain-lowercase key, one claim already under the new
// key, accounts from before unique names. Runs the v21 page with the v21 rules under every lowercasing the
// rules engine might do ('ascii' is what it evidently does), then the cross-version cases.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SRC = '/home/claude/fbwork/v12/index.html';
const V20 = path.join(__dirname, 'v20-demo.html'); // build v20 as published
const FAKE = fs.readFileSync(path.join(__dirname, 'fakefirebase.js'), 'utf8');
const RULES = fs.readFileSync(path.join(__dirname, 'fakerules.js'), 'utf8');
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = '<script id="vb-config" type="application/json">{"firebase":{"apiKey":"k","projectId":"volley-test","appId":"1"}}</script>';
// production-like seed: profiles from builds v11–v20 (no nameKey), claims under the plain-lowercase key
const seedWorld = () => { if (window.top !== window) return;
  const f = window.__fake; const d = new Date(); d.setDate(d.getDate() + 3); const id = d.toISOString().slice(0, 10);
  f.seed('admins/gurkan@example.com', {});
  f.seed('config/app', { title: 'Volley Berlin | Beachvolleyball', organizer: 'Gürkan', pageUrl: 'https://koraykayir.github.io/volleyball/', currentSessionId: id });
  f.seed('sessions/' + id, { date: id, time: '19:00', place: 'Beach Mitte', venueType: 'outdoor', formats: '3v3 / 4v4', capacity: 12, benchCap: 4, price: '8 €', note: '', opensAt: '', opensAtTs: null, startsAtTs: new f.Timestamp(d.getTime()), duration: 120, status: 'open', playedAt: null, roster: null, summary: null, createdAt: new f.Timestamp(Date.now() - 86400e3) });
  const people = [['g1', 'Gürkan', 'gurkan@example.com', 'google.com'], ['p2', 'Doğukan', 'dogukan@example.com', 'password'], ['p3', 'Koray', 'koray@example.com', 'password'], ['g4', 'Talha Ocakçı', 'talha@example.com', 'google.com'], ['g5', 'Deniz Doga Caliskan', 'deniz@example.com', 'google.com'], ['p6', 'Jörg', 'joerg@example.com', 'password']];
  people.forEach(([uid, name, email, provider]) => { f.seed('players/' + uid, { name, level: 3, email, createdAt: new f.Timestamp(1) }); f.seed('names/' + name.toLowerCase(), { uid, name }); f.seedAccount(email, { uid, name, provider, pw: 'secret12' }); });
  // account from before unique names: profile, no claim
  f.seed('players/p7', { name: 'Tunç', level: 2, email: 'tunc@example.com', createdAt: new f.Timestamp(1) }); f.seedAccount('tunc@example.com', { uid: 'p7', name: 'Tunç', provider: 'password', pw: 'secret12' });
  // someone who registered "Jorg" with the new build already: claim under the new key, profile with nameKey
  f.seed('players/p8', { name: 'Jorg', level: 2, email: 'jorg@example.com', createdAt: new f.Timestamp(2), nameKey: 'jorg' }); f.seed('names/jorg', { uid: 'p8', name: 'Jorg' }); f.seedAccount('jorg@example.com', { uid: 'p8', name: 'Jorg', provider: 'password', pw: 'secret12' });
};
(async () => {
  const browser = await chromium.launch();
  async function boot({ src, version, lower, tag }) {
    const html = fs.readFileSync(src, 'utf8'); const p = path.join(__dirname, 'fb17-' + tag + '.html');
    fs.writeFileSync(p, html.replace('<script id="vb-config" type="application/json">{}</script>', CFG));
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await ctx.addInitScript(FAKE);
    await ctx.addInitScript(([version, lower]) => { if (window.top !== window) return; window.__rulesVersion = version; window.__rulesLower = lower; }, [version, lower]);
    await ctx.addInitScript(RULES);
    await ctx.addInitScript(seedWorld);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/cdn.jsdelivr.net/**', r => r.abort()); await page.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
    await page.goto('file://' + p); await sleep(300);
    const h = {
      ctx, page, errs,
      dump: () => page.evaluate(() => window.__fake.dump()),
      status: () => page.textContent('.status'),
      app: () => page.textContent('#app'),
      authErr: async () => { const el = await page.$('.authcard .note.bad'); return el ? (await el.textContent()).trim() : ''; },
      acErr: async () => { const el = await page.$('.authcard .note.bad, .authcard .note.ok'); return el ? (await el.textContent()).trim() : ''; },
      h3: async () => { const el = await page.$('.authcard h3'); return el ? (await el.textContent()).trim() : ''; },
      user: () => page.evaluate(() => window.__fake.user ? { uid: window.__fake.user.uid, email: window.__fake.user.email } : null),
      denials: () => page.evaluate(() => (window.__fake.denials || []).map(d => d.join(' + '))),
      clearDenials: () => page.evaluate(() => { window.__fake.denials = []; }),
      logout: async () => { if (await page.$('.status [data-act="logout"]')) { await page.click('.status [data-act="logout"]'); await sleep(150); } },
      openAuth: async (mode) => { await h.logout(); if (!(await page.$('.authcard'))) { await page.click(mode === 'register' ? '.status [data-act="auth-open"][data-mode="register"]' : '.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); } const want = mode === 'register' ? '#auName' : '#auEmail:not(#auName ~ *)'; if (mode === 'register' && !(await page.$('#auName'))) { await page.click('[data-act="auth-mode"][data-mode="register"]'); await sleep(60); } if (mode !== 'register' && (await page.$('#auName'))) { await page.click('[data-act="auth-mode"][data-mode="login"]'); await sleep(60); } },
      register: async ({ name, email, pw, level }) => { await h.openAuth('register'); await page.fill('#auName', name); await page.fill('#auEmail', email); await page.fill('#auPass', pw || 'secret12'); await page.click('.lvl[data-n="' + (level || 3) + '"]'); await page.click('[data-act="auth-register"]'); await sleep(450); },
      login: async (email, pw) => { await h.openAuth('login'); await page.fill('#auEmail', email); await page.fill('#auPass', pw || 'secret12'); await page.click('[data-act="auth-login"]'); await sleep(450); },
      google: async (email, name) => { await h.openAuth('login'); await page.evaluate(([e, n]) => window.__fake.setGoogleEmail(e, n), [email, name || 'Someone']); await page.click('[data-act="auth-google"]'); await sleep(450); },
      rename: async (name) => { await page.click('.status [data-act="account-open"]'); await sleep(200); await page.fill('#acName', name); await page.click('[data-act="account-rename"]'); await sleep(450); },
      join: async () => { await page.click('button[data-act="join"]'); await sleep(450); },
      claims: async () => { const d = await h.dump(); const o = {}; Object.keys(d).filter(k => k.startsWith('names/')).sort().forEach(k => { o[k.slice(6)] = d[k].uid; }); return o; },
      profile: async uid => (await h.dump())['players/' + uid]
    };
    return h;
  }

  for (const lower of ['ascii', 'full', 'simple']) {
    const t = await boot({ src: SRC, version: 'v21', lower, tag: 'v21-' + lower }); const L = `[v21 rules, ${lower} lower]`;
    // 1. Deniz: registered as "Deniz Doga Caliskan" with the old build; now wants the proper spelling
    await t.google('deniz@example.com', 'Deniz Doğa Çalışkan');
    check(`${L} Deniz logs in: ASCII profile untouched, claim unchanged, no refusals`, !('nameKey' in (await t.profile('g5'))) && (await t.claims())['deniz doga caliskan'] === 'g5' && (await t.denials()).length === 0, [await t.profile('g5'), await t.denials()]);
    await t.rename('Deniz Doğa Çalışkan');
    check(`${L} Deniz renames to the spelling with Turkish letters: same key, no new claim, no refusals`, (await t.profile('g5')).name === 'Deniz Doğa Çalışkan' && (await t.profile('g5')).nameKey === 'deniz doga caliskan' && Object.keys(await t.claims()).filter(k => k.startsWith('deniz')).length === 1 && (await t.denials()).length === 0 && !(await t.acErr()).match(/taken|refused/i), [await t.claims(), await t.denials(), await t.acErr()]);
    await t.page.click('[data-act="account-close"]'); await sleep(100); await t.join();
    check(`${L} Deniz joins with the new spelling`, (await t.app()).includes('Deniz Doğa Çalışkan') && (await t.denials()).length === 0);
    // 2. a second Deniz, typed with or without accents, is refused
    await t.google('deniz2@example.com', 'Deniz Doğa Çalışkan');
    await t.page.click('.lvl[data-n="2"]'); await t.page.click('[data-act="profile-save"]'); await sleep(300);
    check(`${L} another "Deniz Doğa Çalışkan" is refused as taken`, /already taken/.test(await t.authErr()), await t.authErr());
    await t.page.fill('#pfName', 'DENIZ DOGA CALISKAN'); await t.page.click('[data-act="profile-save"]'); await sleep(300);
    check(`${L} "DENIZ DOGA CALISKAN" is refused as taken too`, /already taken/.test(await t.authErr()), await t.authErr());
    await t.page.fill('#pfName', 'Deniz D.'); await t.page.click('[data-act="profile-save"]'); await sleep(400);
    check(`${L} "Deniz D." goes through`, (await t.claims())['deniz d.'] && !(await t.page.$('.authcard')) && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    // 3. the production failure: a new account whose name has an uppercase Turkish letter
    await t.register({ name: 'Çağla Öztürk', email: 'cagla@example.com' });
    let u = await t.user();
    check(`${L} "Çağla Öztürk" can register by email (the bug of 7 Nov)`, u && u.email === 'cagla@example.com' && (await t.claims())['cagla ozturk'] === u.uid && (await t.profile(u.uid)).nameKey === 'cagla ozturk' && (await t.denials()).length === 0, [await t.claims(), await t.denials(), await t.authErr()]);
    await t.join(); check(`${L} Çağla joins`, (await t.app()).includes('Çağla Öztürk') && (await t.denials()).length === 0);
    await t.google('ozlem@example.com', 'Özlem Ş.'); await t.page.click('.lvl[data-n="4"]'); await t.page.click('[data-act="profile-save"]'); await sleep(400);
    u = await t.user();
    check(`${L} "Özlem Ş." can register with Google`, u && (await t.claims())['ozlem s.'] === u.uid && !(await t.page.$('.authcard')) && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.register({ name: 'İrem', email: 'irem@example.com' }); u = await t.user();
    check(`${L} "İrem" registers under irem`, u && (await t.claims())['irem'] === u.uid && (await t.denials()).length === 0, await t.claims());
    await t.register({ name: 'IREM', email: 'irem2@example.com' });
    check(`${L} "IREM" is then taken`, /already taken/.test(await t.authErr()) && (await t.user()) === null, await t.authErr());
    // 4. existing accounts: claims move to the new key on their next visit; their old claim is removed
    await t.login('dogukan@example.com');
    check(`${L} Doğukan logs in: claim moved doğukan → dogukan, profile keyed, no refusals`, (await t.claims())['dogukan'] === 'p2' && !(await t.claims())['doğukan'] && (await t.profile('p2')).nameKey === 'dogukan' && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.join(); check(`${L} Doğukan joins`, (await t.app()).includes('Doğukan') && (await t.denials()).length === 0);
    await t.register({ name: 'Dogukan', email: 'dogukan2@example.com' });
    check(`${L} a new "Dogukan" is refused`, /already taken/.test(await t.authErr()) && (await t.user()) === null, await t.authErr());
    await t.google('gurkan@example.com', 'Gürkan');
    check(`${L} organizer Gürkan: claim moved, organizer panel there, no refusals`, (await t.claims())['gurkan'] === 'g1' && !(await t.claims())['gürkan'] && (await t.status()).includes('organizer') && !!(await t.page.$('[data-act="log-open"]')) && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.google('talha@example.com', 'Talha Ocakçı');
    check(`${L} Talha Ocakçı: claim moved to "talha ocakci"`, (await t.claims())['talha ocakci'] === 'g4' && !(await t.claims())['talha ocakçı'] && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.login('tunc@example.com');
    check(`${L} account from before unique names (Tunç): claim created under tunc`, (await t.claims())['tunc'] === 'p7' && (await t.profile('p7')).nameKey === 'tunc' && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.login('koray@example.com');
    check(`${L} plain-ASCII profile (Koray): nothing to move, nothing written`, (await t.claims())['koray'] === 'p3' && !('nameKey' in (await t.profile('p3'))) && (await t.denials()).length === 0, [await t.profile('p3'), await t.denials()]);
    await t.rename('Koray K.'); await t.page.click('[data-act="account-close"]'); await sleep(100);
    check(`${L} Koray renames: claim koray → "koray k.", no nameKey needed, no refusals`, (await t.claims())['koray k.'] === 'p3' && !(await t.claims())['koray'] && !('nameKey' in (await t.profile('p3'))) && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    // 5. the one case that cannot be merged: old "Jörg" while a new "Jorg" already holds the key
    await t.login('joerg@example.com');
    check(`${L} old Jörg while Jorg holds "jorg": keeps his old claim, no refusals, can join`, (await t.claims())['jörg'] === 'p6' && (await t.claims())['jorg'] === 'p8' && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.join(); check(`${L} Jörg joins`, (await t.app()).includes('Jörg') && (await t.denials()).length === 0);
    await t.rename('Jörg B.'); await t.page.click('[data-act="account-close"]'); await sleep(100);
    check(`${L} Jörg renames to "Jörg B.": new claim "jorg b.", old "jörg" freed`, (await t.claims())['jorg b.'] === 'p6' && !(await t.claims())['jörg'] && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    // 6. deleting a migrated account frees the claim
    await t.login('dogukan@example.com');
    // leaving is immediate only in the last 3 hours before the start: move the session there, leave, then delete
    await t.page.evaluate(() => { const f = window.__fake; const id = f.store.get('config/app').currentSessionId; const s = f.store.get('sessions/' + id); s.startsAtTs = new f.Timestamp(Date.now() + 3600e3); f.seed('sessions/' + id, s); }); await sleep(300);
    await t.page.click('[data-act="leave-ask"]'); await sleep(80); await t.page.click('[data-act="leave-yes"]'); await sleep(450);
    check(`${L} Doğukan leaves (last 3 hours: immediate), no refusals`, !(await t.page.$('[data-act="leave-ask"]')) && (await t.denials()).length === 0, await t.denials());
    await t.page.click('.status [data-act="account-open"]'); await sleep(200); await t.page.click('[data-act="account-delete-ask"]'); await sleep(80); await t.page.fill('#acDelPw', 'secret12'); await t.page.click('[data-act="account-delete-yes"]'); await sleep(500);
    check(`${L} Doğukan deletes his account: profile and claim gone, no refusals`, !(await t.profile('p2')) && !(await t.claims())['dogukan'] && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    check(`${L} no page errors`, t.errs.length === 0, t.errs);
    console.log('RULESTATS ' + JSON.stringify(await t.page.evaluate(() => window.__fake.ruleStats)));
    await t.ctx.close();
  }

  // ---- cross-version: the published v20 page with the v21 rules (the minutes between publishing rules and the deploy)
  {
    const t = await boot({ src: V20, version: 'v21', lower: 'ascii', tag: 'v20page-v21rules' }); const L = '[v20 page, v21 rules]';
    await t.register({ name: 'Ana', email: 'ana@example.com' });
    check(`${L} ASCII name registers`, (await t.user()) && (await t.claims())['ana'] && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.register({ name: 'Doğukan Two', email: 'd2@example.com' });
    check(`${L} lowercase Turkish letters register (as before)`, (await t.user()) && (await t.claims())['doğukan two'] && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.login('deniz@example.com'); await t.join();
    check(`${L} existing player logs in and joins`, (await t.app()).includes('Deniz Doga Caliskan') && (await t.denials()).length === 0, await t.denials());
    await t.rename('Deniz DC'); await t.page.click('[data-act="account-close"]'); await sleep(100);
    check(`${L} existing player renames`, (await t.claims())['deniz dc'] === 'g5' && (await t.denials()).length === 0, [await t.claims(), await t.denials()]);
    await t.ctx.close();
  }
  // ---- cross-version: the new page with the rules published before 7 Nov (if the rules are not updated first)
  {
    const t = await boot({ src: SRC, version: 'v19', lower: 'ascii', tag: 'v21page-v19rules' }); const L = '[v21 page, old rules]';
    await t.register({ name: 'Ana', email: 'ana@example.com' });
    check(`${L} ASCII name still registers (no nameKey field for ASCII names)`, (await t.user()) && (await t.claims())['ana'] && !!(await t.profile((await t.user()).uid)) && JSON.stringify(await t.denials()) === JSON.stringify(['get names/ana']), [await t.claims(), await t.denials()]);
    await t.register({ name: 'Çağla', email: 'cagla@example.com' });
    check(`${L} a Turkish name fails gracefully (profile step, "taken" message) until the rules are published`, /already taken/.test(await t.authErr()) && t.errs.length === 0, [await t.authErr(), t.errs]);
    await t.ctx.close();
  }
  await browser.close();
  console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all Turkish-name checks passed'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
