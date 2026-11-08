// Registration flow on the Firebase stand-in WITH the security rules enforced (fakerules.js):
// email/password sign-up (validation, name taken, email in use, no profile-step flash, join right after),
// Google sign-up with the profile step, log in / wrong password, forgot password, names with the Turkish İ,
// the "Create an account" link in the status bar, and the old build to prove the test catches the bug Koray hit.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SRC = '/home/claude/fbwork/v12/index.html';
const OLD = path.join(__dirname, 'v19-demo.html'); // build v19 as published (git show 9eb0e8a^:demo/index.html)
const FAKE = fs.readFileSync(path.join(__dirname, 'fakefirebase.js'), 'utf8');
const RULES = fs.readFileSync(path.join(__dirname, 'fakerules.js'), 'utf8');
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = '<script id="vb-config" type="application/json">{"firebase":{"apiKey":"k","projectId":"volley-test","appId":"1"}}</script>';
(async () => {
  const browser = await chromium.launch();
  async function boot({ src, legacy, lower, seed, tag }) {
    const html = fs.readFileSync(src, 'utf8'); const p = path.join(__dirname, 'fb16-' + tag + '.html');
    fs.writeFileSync(p, html.replace('<script id="vb-config" type="application/json">{}</script>', CFG));
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await ctx.addInitScript(FAKE);
    await ctx.addInitScript(([legacy, lower]) => { if (window.top !== window) return; window.__rulesLegacy = legacy; window.__rulesLower = lower; }, [!!legacy, lower || 'full']);
    await ctx.addInitScript(RULES);
    await ctx.addInitScript(() => { if (window.top !== window) return; window.__fake.seed('admins/organizer@example.com', {}); window.__fake.seed('config/app', { title: 'Volley Berlin | Beachvolleyball', organizer: 'Gürkan', pageUrl: 'https://koraykayir.github.io/volleyball/' }); });
    if (seed) await ctx.addInitScript(seed);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/cdn.jsdelivr.net/**', r => r.abort()); await page.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
    await page.goto('file://' + p); await sleep(300);
    const h = {
      ctx, page, errs,
      dump: () => page.evaluate(() => window.__fake.dump()),
      app: () => page.textContent('#app'),
      status: () => page.textContent('.status'),
      authErr: async () => { const el = await page.$('.authcard .note.bad'); return el ? (await el.textContent()).trim() : ''; },
      h3: async () => { const el = await page.$('.authcard h3'); return el ? (await el.textContent()).trim() : ''; },
      user: () => page.evaluate(() => window.__fake.user ? { uid: window.__fake.user.uid, email: window.__fake.user.email } : null),
      logout: async () => { if (await page.$('.status [data-act="logout"]')) { await page.click('.status [data-act="logout"]'); await sleep(150); } },
      openRegister: async () => { await h.logout(); if (!(await page.$('.authcard'))) { await page.click('.status [data-act="auth-open"][data-mode="register"]'); await sleep(80); } if (!(await page.$('#auName'))) { await page.click('[data-act="auth-mode"][data-mode="register"]'); await sleep(60); } },
      fillRegister: async ({ name, email, pw, level }) => { if (name != null) await page.fill('#auName', name); if (email != null) await page.fill('#auEmail', email); if (pw != null) await page.fill('#auPass', pw); if (level) await page.click('.lvl[data-n="' + level + '"]'); },
      register: async (o) => { await h.openRegister(); await h.fillRegister(o); await page.click('[data-act="auth-register"]'); await sleep(400); },
      login: async (email, pw) => { await h.logout(); if (!(await page.$('.authcard'))) { await page.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); } if (await page.$('#auName')) { await page.click('[data-act="auth-mode"][data-mode="login"]'); await sleep(60); } await page.fill('#auEmail', email); await page.fill('#auPass', pw); await page.click('[data-act="auth-login"]'); await sleep(300); },
      watchProfileStep: () => page.evaluate(() => { window.__sawProfileStep = false; new MutationObserver(() => { if ([...document.querySelectorAll('h3')].some(x => /One more step/.test(x.textContent))) window.__sawProfileStep = true; }).observe(document.querySelector('#app'), { childList: true, subtree: true }); }),
      sawProfileStep: () => page.evaluate(() => !!window.__sawProfileStep),
      denials: () => page.evaluate(() => (window.__fake.denials || []).map(d => d.join(' + '))),
      logs: async type => { const d = await h.dump(); return Object.keys(d).filter(k => k.startsWith('log/')).map(k => d[k]).filter(e => !type || e.type === type); }
    };
    return h;
  }
  const seedSession = () => { if (window.top !== window) return; const f = window.__fake; const d = new Date(); d.setDate(d.getDate() + 3); const id = d.toISOString().slice(0, 10); f.seed('sessions/' + id, { date: id, time: '19:00', place: 'Beach Mitte', venueType: 'outdoor', formats: '2v2', capacity: 4, benchCap: 2, price: '8 €', note: '', opensAt: '', opensAtTs: null, startsAtTs: new f.Timestamp(d.getTime()), duration: 120, status: 'open', playedAt: null, roster: null, summary: null, createdAt: new f.Timestamp(Date.now() - 86400e3) }); const c = f.store.get('config/app'); c.currentSessionId = id; f.seed('config/app', c); };

  // ---------- 0. the published build (v19) with the published rules: the bug Koray hit
  {
    const t = await boot({ src: OLD, legacy: true, tag: 'old' });
    await t.page.click('.status [data-act="auth-open"]'); await sleep(80); await t.page.click('[data-act="auth-mode"][data-mode="register"]'); await sleep(60);
    await t.fillRegister({ name: 'KK', email: 'koray@example.com', pw: 'secret12', level: 4 }); await t.page.click('[data-act="auth-register"]'); await sleep(400);
    check('v19 + published rules: sign-up fails with the organizer message (the reported bug)', /Firebase refused this change\. Are you signed in as an organizer\?/.test(await t.authErr()), await t.authErr());
    check('v19: the refused read was names/kk while logged out', (await t.denials()).includes('get names/kk'), await t.denials());
    check('v19: no account was created', (await t.user()) === null);
    await t.ctx.close();
  }

  // ---------- 1. the new build with the published (old) rules: sign-up works again
  {
    const t = await boot({ src: SRC, legacy: true, tag: 'legacy', seed: seedSession });
    await t.watchProfileStep();
    await t.register({ name: 'KK', email: 'koray@example.com', pw: 'secret12', level: 4 });
    const d = await t.dump(); const u = await t.user();
    check('v20 + old rules: account created and logged in', u && u.email === 'koray@example.com', u);
    check('v20 + old rules: profile, name claim and register log written', u && d['players/' + u.uid] && d['players/' + u.uid].name === 'KK' && d['players/' + u.uid].level === 4 && d['players/' + u.uid].email === 'koray@example.com' && d['names/kk'] && d['names/kk'].uid === u.uid && (await t.logs('register')).length === 1 && (await t.logs('register'))[0].by === u.uid, Object.keys(d));
    check('v20 + old rules: the only refusal was the harmless pre-check', JSON.stringify(await t.denials()) === JSON.stringify(['get names/kk']), await t.denials());
    check('v20 + old rules: status bar shows the name, sign-up card closed', (await t.status()).includes('KK') && !(await t.page.$('.authcard')));
    check('no "One more step" flash during sign-up', !(await t.sawProfileStep()));
    await t.page.click('button[data-act="join"]'); await sleep(400);
    const d2 = await t.dump(); const sid = d2['config/app'].currentSessionId;
    check('can join right after signing up (rules: name == profile name)', d2['signups/' + sid + '_' + u.uid] && d2['signups/' + sid + '_' + u.uid].status === 'active' && (await t.app()).includes('KK'), Object.keys(d2).filter(k => k.startsWith('signups/')));
    // a second person with a name that is taken: the account is created (old rules cannot pre-check), then the profile step asks for another name
    await t.register({ name: 'kk', email: 'second@example.com', pw: 'secret12', level: 2 });
    check('old rules, taken name: account exists, profile step shown with the name-taken message', (await t.user()) && (await t.user()).email === 'second@example.com' && /One more step/.test(await t.h3()) && /already taken/.test(await t.authErr()), [await t.h3(), await t.authErr()]);
    check('old rules, taken name: the typed name and level carried over to the profile step', (await t.page.inputValue('#pfName')) === 'kk' && !!(await t.page.$('.lvl.sel[data-n="2"]')));
    await t.page.fill('#pfName', 'KK 2'); await t.page.click('[data-act="profile-save"]'); await sleep(400);
    const d3 = await t.dump(); const u2 = await t.user();
    check('old rules, taken name: picking another name on the profile step completes the sign-up', d3['players/' + u2.uid] && d3['players/' + u2.uid].name === 'KK 2' && d3['names/kk 2'] && !(await t.page.$('.authcard')) && (await t.status()).includes('KK 2'), Object.keys(d3));
    check('no page errors (old rules run)', t.errs.length === 0, t.errs);
    await t.ctx.close();
  }

  // ---------- 2. the new build with the new rules (public claim lookup, İ folding)
  for (const lower of ['full', 'simple']) {
    const t = await boot({ src: SRC, legacy: false, lower, tag: 'new-' + lower, seed: seedSession });
    const P = t.page;
    // status bar
    check(`[${lower}] logged out: status bar offers Log in · Create an account`, !!(await P.$('.status .authlinks [data-act="auth-open"]:not([data-mode])')) && !!(await P.$('.status .authlinks [data-act="auth-open"][data-mode="register"]')) && /Log in.*Create an account/.test(await t.status()), await t.status());
    await P.click('.status [data-act="auth-open"][data-mode="register"]'); await sleep(80);
    check(`[${lower}] "Create an account" opens the sign-up form`, (await t.h3()) === 'Create your account', await t.h3());
    await P.click('[data-act="auth-close"]'); await sleep(60);
    await P.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80);
    check(`[${lower}] "Log in" opens the log-in form`, (await t.h3()) === 'Log in to join', await t.h3());
    await P.click('[data-act="auth-mode"][data-mode="register"]'); await sleep(60);
    // validation
    await t.fillRegister({ name: '', email: 'a@b.co', pw: 'secret12', level: 3 }); await P.click('[data-act="auth-register"]'); await sleep(80);
    check(`[${lower}] validation: name required`, /Enter the name/.test(await t.authErr()), await t.authErr());
    await t.fillRegister({ name: 'Ana', email: 'not-an-email' }); await P.click('[data-act="auth-register"]'); await sleep(80);
    check(`[${lower}] validation: email format`, /email doesn't look right/.test(await t.authErr()), await t.authErr());
    await t.fillRegister({ email: 'ana@example.com', pw: '12345' }); await P.click('[data-act="auth-register"]'); await sleep(80);
    check(`[${lower}] validation: password length`, /at least 6 characters/.test(await t.authErr()), await t.authErr());
    await P.fill('#auPass', 'secret12'); await P.evaluate(() => { window.__vb.S.ui.auLevel = 0; }); await P.click('[data-act="auth-register"]'); await sleep(80);
    check(`[${lower}] validation: level required`, /Pick your level/.test(await t.authErr()), await t.authErr());
    check(`[${lower}] validation never touched the backend`, (await t.user()) === null && (await t.denials()).length === 0, await t.denials());
    // success
    await t.watchProfileStep();
    await P.click('.lvl[data-n="3"]'); await P.focus('#auPass'); await P.keyboard.press('Enter'); await sleep(400); // Enter in the password field submits
    let u = await t.user(); let d = await t.dump();
    check(`[${lower}] Enter in the password field creates the account`, u && u.email === 'ana@example.com' && d['players/' + u.uid] && d['names/ana'] && d['names/ana'].uid === u.uid, u);
    check(`[${lower}] no refusals at all with the new rules`, (await t.denials()).length === 0, await t.denials());
    check(`[${lower}] no "One more step" flash`, !(await t.sawProfileStep()));
    check(`[${lower}] logged in: sign-up card gone, name in the status bar, Join offered`, !(await P.$('.authcard')) && (await t.status()).includes('Ana') && !!(await P.$('button[data-act="join"]')));
    // same email again → log in instead
    await t.register({ name: 'Someone', email: 'ana@example.com', pw: 'secret12', level: 1 });
    check(`[${lower}] same email again: "log in instead" message, still logged out`, /already an account with this email/.test(await t.authErr()) && (await t.user()) === null, await t.authErr());
    // taken name (different case) → refused BEFORE the account is created
    await t.register({ name: 'ANA', email: 'ana2@example.com', pw: 'secret12', level: 1 });
    check(`[${lower}] taken name (other case): refused before any account is created`, /already taken/.test(await t.authErr()) && (await t.user()) === null && (await t.h3()) === 'Create your account', [await t.authErr(), await t.user()]);
    // Turkish İ
    await t.register({ name: 'İrem', email: 'irem@example.com', pw: 'secret12', level: 2 });
    u = await t.user(); d = await t.dump();
    check(`[${lower}] İrem can sign up; claim stored under names/irem`, u && d['players/' + u.uid] && d['players/' + u.uid].name === 'İrem' && d['names/irem'] && d['names/irem'].uid === u.uid && (await t.denials()).length === 0, [Object.keys(d).filter(k => k.startsWith('names/')), await t.denials()]);
    await t.register({ name: 'IREM', email: 'irem2@example.com', pw: 'secret12', level: 2 });
    check(`[${lower}] IREM / irem is then taken`, /already taken/.test(await t.authErr()) && (await t.user()) === null, await t.authErr());
    // rename to a name with İ on the account page (players rule looks the claim up with nameKeyOf)
    await t.login('irem@example.com', 'secret12');
    await P.click('.status [data-act="account-open"]'); await sleep(200); await P.fill('#acName', 'İlker'); await P.click('[data-act="account-rename"]'); await sleep(400);
    d = await t.dump(); u = await t.user();
    check(`[${lower}] rename İrem → İlker: new claim names/ilker, old one freed`, d['players/' + u.uid].name === 'İlker' && d['names/ilker'] && !d['names/irem'] && (await t.denials()).length === 0, [Object.keys(d).filter(k => k.startsWith('names/')), await t.denials()]);
    await P.click('[data-act="account-close"]'); await sleep(80);
    // log in: wrong password, then right one
    await t.login('ana@example.com', 'nope123');
    check(`[${lower}] wrong password: clear message, still logged out`, /Wrong email or password/.test(await t.authErr()) && (await t.user()) === null, await t.authErr());
    await P.fill('#auPass', 'secret12'); await P.click('[data-act="auth-login"]'); await sleep(300);
    check(`[${lower}] right password: logged in as Ana`, (await t.user()) && (await t.user()).email === 'ana@example.com' && (await t.status()).includes('Ana'));
    // forgot password
    await t.logout(); await P.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); await P.click('[data-act="auth-mode"][data-mode="reset"]'); await sleep(60);
    await P.fill('#auEmail', ''); await P.click('[data-act="auth-reset"]'); await sleep(80);
    check(`[${lower}] reset: email required`, /Enter your email/.test(await t.authErr()), await t.authErr());
    await P.fill('#auEmail', 'Ana@Example.com'); await P.click('[data-act="auth-reset"]'); await sleep(200);
    const sent = await P.evaluate(() => window.__fake.resetSent);
    check(`[${lower}] reset: link sent to the normalised email, neutral confirmation`, sent === 'ana@example.com' && /If there is an account for ana@example.com/.test(await P.textContent('.authcard')), sent);
    // Google sign-up with the profile step
    await P.click('[data-act="auth-mode"][data-mode="login"]'); await sleep(60);
    await P.evaluate(() => window.__fake.setGoogleEmail('gustav@example.com', 'Gustav Google'));
    await P.click('[data-act="auth-google"]'); await sleep(300);
    check(`[${lower}] Google, new account: profile step with the Google name prefilled`, /One more step/.test(await t.h3()) && (await P.inputValue('#pfName')) === 'Gustav Google' && /Signed in as gustav@example.com/.test(await P.textContent('.authcard')), await t.h3());
    await P.click('[data-act="profile-save"]'); await sleep(80);
    check(`[${lower}] profile step: level required`, /Pick your level/.test(await t.authErr()), await t.authErr());
    await P.fill('#pfName', 'ana'); await P.click('.lvl[data-n="5"]'); await P.click('[data-act="profile-save"]'); await sleep(300);
    check(`[${lower}] profile step: taken name refused, still on the step`, /already taken/.test(await t.authErr()) && /One more step/.test(await t.h3()), await t.authErr());
    await P.fill('#pfName', 'Gustav'); await P.click('[data-act="profile-save"]'); await sleep(400);
    u = await t.user(); d = await t.dump();
    check(`[${lower}] profile step done: profile + claim + log, main view with Join`, d['players/' + u.uid] && d['players/' + u.uid].name === 'Gustav' && d['players/' + u.uid].level === 5 && d['players/' + u.uid].email === 'gustav@example.com' && d['names/gustav'] && (await t.logs('register')).some(e => e.name === 'Gustav' && e.by === u.uid) && !(await P.$('.authcard')) && !!(await P.$('button[data-act="join"]')), Object.keys(d).filter(k => k.startsWith('players/')));
    await P.click('button[data-act="join"]'); await sleep(400);
    d = await t.dump(); const sid = d['config/app'].currentSessionId;
    check(`[${lower}] Google account joins the list`, d['signups/' + sid + '_' + u.uid] && d['signups/' + sid + '_' + u.uid].name === 'Gustav');
    // Google again on an existing account: straight in, no profile step
    await t.logout(); await P.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); await P.click('[data-act="auth-google"]'); await sleep(300);
    check(`[${lower}] Google, existing account: no profile step, name shown`, !(await P.$('.authcard')) && (await t.status()).includes('Gustav'));
    // log out clears the leftover profile-step fields
    await t.logout();
    check(`[${lower}] after logout the profile-step fields are reset`, await P.evaluate(() => window.__vb.S.ui.pfName === null && window.__vb.S.ui.pfLevel === 0));
    check(`[${lower}] no page errors`, t.errs.length === 0, t.errs);
    await t.ctx.close();
  }
  await browser.close();
  console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all registration checks passed'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
