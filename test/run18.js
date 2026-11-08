// Edge inputs, with the rules enforced: odd names (whitespace, slashes, HTML, emoji, dots, 60 chars of Turkish
// letters), odd emails, the organizer's "add to list" with the same inputs, HTML in every place a name is shown
// (list, toasts, account page, announcement, copy text, activity log, CSV), CSV formula cells, PDF text fallback.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SRC = '/home/claude/fbwork/v12/index.html';
const FAKE = fs.readFileSync(path.join(__dirname, 'fakefirebase.js'), 'utf8'); const RULES = fs.readFileSync(path.join(__dirname, 'fakerules.js'), 'utf8');
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = '<script id="vb-config" type="application/json">{"firebase":{"apiKey":"k","projectId":"volley-test","appId":"1"}}</script>';
(async () => {
  const html = fs.readFileSync(SRC, 'utf8'); const p = path.join(__dirname, 'fb18.html'); fs.writeFileSync(p, html.replace('<script id="vb-config" type="application/json">{}</script>', CFG));
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(FAKE); await ctx.addInitScript(RULES);
  await ctx.addInitScript(() => { if (window.top !== window) return;
    const f = window.__fake; const d = new Date(); d.setDate(d.getDate() + 2); const id = d.toISOString().slice(0, 10);
    f.seed('admins/organizer@example.com', {}); f.seed('config/app', { title: 'Volley Berlin | Beachvolleyball', organizer: 'Gürkan', pageUrl: 'https://koraykayir.github.io/volleyball/', currentSessionId: id });
    f.seed('sessions/' + id, { date: id, time: '19:00', place: 'Beach Mitte', venueType: 'outdoor', formats: '4v4', capacity: 8, benchCap: 4, price: '8 €', status: 'open', createdAt: new f.Timestamp(1), startsAtTs: new f.Timestamp(d.getTime()), duration: 120, roster: null, summary: null, playedAt: null });
    f.seed('players/pd', { name: 'Doğukan', level: 3, email: 'dogukan@example.com', createdAt: new f.Timestamp(1) }); f.seed('names/doğukan', { uid: 'pd', name: 'Doğukan' }); f.seedAccount('dogukan@example.com', { uid: 'pd', name: 'Doğukan', provider: 'password', pw: 'secret12' });
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.route('**/cdn.jsdelivr.net/**', r => r.abort()); await page.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
  await page.goto('file://' + p); await sleep(300);
  const dump = () => page.evaluate(() => window.__fake.dump());
  const denials = () => page.evaluate(() => (window.__fake.denials || []).map(d => d.join(' + ')));
  const user = () => page.evaluate(() => window.__fake.user ? { uid: window.__fake.user.uid, email: window.__fake.user.email } : null);
  const authErr = async () => { const el = await page.$('.authcard .note.bad'); return el ? (await el.textContent()).trim() : ''; };
  const toastText = () => page.evaluate(() => { const t = document.querySelector('#vb-toast'); return t ? t.textContent : ''; });
  const logout = async () => { if (await page.$('.status [data-act="logout"]')) { await page.click('.status [data-act="logout"]'); await sleep(150); } };
  const openRegister = async () => { await logout(); if (!(await page.$('.authcard'))) { await page.click('.status [data-act="auth-open"][data-mode="register"]'); await sleep(80); } if (!(await page.$('#auName'))) { await page.click('[data-act="auth-mode"][data-mode="register"]'); await sleep(60); } };
  const register = async (name, email, pw) => { await openRegister(); await page.fill('#auName', name); await page.fill('#auEmail', email); await page.fill('#auPass', pw || 'secret12'); await page.click('.lvl[data-n="3"]'); await page.click('[data-act="auth-register"]'); await sleep(450); };
  const profileName = async () => { const u = await user(); const d = await dump(); return u && d['players/' + u.uid] ? d['players/' + u.uid].name : null; };
  const claims = async () => { const d = await dump(); return Object.keys(d).filter(k => k.startsWith('names/')).map(k => k.slice(6)).sort(); };

  // ---- names at registration
  await register('   Ana   Maria  ', 'ana@example.com');
  check('whitespace collapsed: "Ana Maria"', (await profileName()) === 'Ana Maria' && (await claims()).includes('ana maria'), await profileName());
  await register('Ben/Carl\\Dee', 'ben@example.com');
  check('slashes become spaces: "Ben Carl Dee"', (await profileName()) === 'Ben Carl Dee', await profileName());
  await register('.', 'dot@example.com');
  check('"." refused with a hint, no account', /at least one letter/.test(await authErr()) && (await user()) === null, await authErr());
  await register('__x__', 'x@example.com');
  check('"__x__" refused', /can’t be used|can't be used/.test(await authErr()) && (await user()) === null, await authErr());
  await register('🏐', 'ball@example.com');
  check('emoji only refused', /at least one letter/.test(await authErr()) && (await user()) === null, await authErr());
  await register('🏐 Emre', 'emre@example.com');
  check('emoji plus a name is fine', (await profileName()) === '🏐 Emre' && (await denials()).length === 0, [await profileName(), await denials()]);
  const long = 'Şükrü Çağrı Öztürk Karakaşoğlu Büyükçekmeceli İzmirlioğlu Gündüz'; // 64 chars, cut to 60 by the page
  await register(long, 'long@example.com');
  check('60-character Turkish name registers (cut to 60)', (await profileName()) === long.slice(0, 60).trim() && (await denials()).length === 0, [await profileName(), await denials()]);
  const xss = '<img src=x onerror="window.__xss=1"><b>Bob</b>'; const stored = '<img src=x onerror="window.__xss=1"><b>Bob< b>'; // the slash becomes a space
  await register(xss, 'bob@example.com');
  check('HTML in a name is stored as text (slash → space)', (await profileName()) === stored && (await denials()).length === 0, await profileName());
  check('…and never becomes markup (no img element, no script ran, shown verbatim)', !(await page.$('#app img[src="x"]')) && !(await page.evaluate(() => window.__xss)) && (await page.textContent('.status')).includes(stored));
  await page.click('button[data-act="join"]'); await sleep(400);
  check('list shows the HTML name as text', (await page.textContent('.row .n')).includes('<img src=x') && !(await page.$('.row img')));
  await page.click('.status [data-act="account-open"]'); await sleep(200);
  check('account page shows it as text', (await page.inputValue('#acName')) === stored && !(await page.$('.authcard img')));
  await page.click('[data-act="account-close"]'); await sleep(80);
  // ---- emails and passwords
  await register('Cem', '  Cem@Example.COM ');
  check('email trimmed and lowercased', (await user()) && (await user()).email === 'cem@example.com', await user());
  await register('Dan', 'dan@example');
  check('email without a domain ending refused', /doesn't look right/.test(await authErr()) && (await user()) === null, await authErr());
  await register('Dan', 'da n@example.com');
  check('email with a space refused', /doesn't look right/.test(await authErr()) && (await user()) === null, await authErr());
  await register('Dan', 'dan@example.com', '12345');
  check('5-character password refused', /at least 6/.test(await authErr()) && (await user()) === null, await authErr());
  await register('Dan', 'dan@example.com', '123456');
  check('6-character password accepted', (await user()) && (await user()).email === 'dan@example.com');
  // ---- organizer: add to list with odd inputs, duplicates without accents
  await logout(); await page.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); await page.evaluate(() => window.__fake.setGoogleEmail('organizer@example.com', 'Gürkan')); await page.click('[data-act="auth-google"]'); await sleep(300);
  if (await page.$('[data-act="profile-save"]')) { await page.click('.lvl[data-n="3"]'); await page.click('[data-act="profile-save"]'); await sleep(300); }
  await page.fill('#addName', ' Doğukan '); await page.click('[data-act="add-player"]'); await sleep(300);
  check('organizer adds Doğukan by hand (he has an account but is not on the list)', (await page.$$('.row')).length === 2 && (await denials()).length === 0, await denials());
  await page.fill('#addName', 'DOGUKAN'); await page.click('[data-act="add-player"]'); await sleep(200);
  check('adding "DOGUKAN" again is refused as a duplicate (accent-insensitive)', /already on the list/.test(await toastText()) && (await page.$$('.row')).length === 2, await toastText());
  await page.fill('#addName', '=1+1'); await page.click('[data-act="add-player"]'); await sleep(300);
  check('"=1+1" is accepted as a name (digits count); the CSV guard handles it', (await page.$$('.row')).length === 3 && (await denials()).length === 0, await toastText());
  await page.fill('#addName', '---'); await page.click('[data-act="add-player"]'); await sleep(200);
  check('"---" is refused (no letter or digit)', /at least one letter/.test(await toastText()) && (await page.$$('.row')).length === 3, await toastText());
  await page.fill('#addName', '=HYPERLINK("x")Eve'); await page.fill('#addEmail', 'EVE@Example.com '); await page.click('[data-act="add-player"]'); await sleep(300);
  const d1 = await dump(); const eve = Object.values(d1).find(v => v && v.name === '=HYPERLINK("x")Eve');
  check('name starting with "=" is allowed when it has letters; email normalised', !!eve && Object.keys(d1).some(k => k.startsWith('contacts/') && d1[k].email === 'eve@example.com'), eve);
  // ---- activity log + CSV
  await page.click('[data-act="log-open"]'); await sleep(400);
  const csv = await page.evaluate(() => window.__vb.logCSV(window.__vb.logRows ? window.__vb.logRows() : (window.__vb.S.data.log || [])));
  check('CSV: formula-looking cells are neutralised with a leading apostrophe', /"'=HYPERLINK\(""x""\)Eve"/.test(csv), csv.split('\n').find(l => l.includes('HYPERLINK')));
  check('CSV: HTML name kept verbatim, quotes doubled', csv.includes('<img src=x onerror=""window.__xss=1""><b>Bob< b>') && csv.includes('"\'=1+1'), csv.split('\n').find(l => l.includes('Bob')));
  check('log page shows HTML names as text', !(await page.$('.card img')) && (await page.textContent('.card')).includes('<b>Bob< b>'));
  await page.click('[data-act="log-close"]'); await sleep(100);
  // ---- announcement / copy text / PDF text fallback
  const ann = await page.evaluate(() => window.__vb.announceText(window.__vb.S.vm));
  const list = await page.evaluate(() => window.__vb.listText(window.__vb.S.vm));
  check('copy-list text carries names verbatim (plain text, nothing escaped)', list.includes(stored) && list.includes('Doğukan'), list);
  check('announcement unaffected by odd names', ann.startsWith('🏐 Volley Berlin | Beachvolleyball'), ann.split('\n')[0]);
  const pdfTxt = await page.evaluate(() => { const vb = window.__vb; return ['Doğukan Çalışkan', 'İrem Işık', 'Σοφία'].map(n => vb.toLatin1 ? vb.toLatin1(n) : 'n/a'); });
  check('PDF text fallback: Turkish letters simplified, not dropped', pdfTxt[0] === 'Dogukan Çaliskan' && pdfTxt[1] === 'Irem Isik', pdfTxt);
  check('no page errors', errs.length === 0, errs);
  console.log('RULESTATS ' + JSON.stringify(await page.evaluate(() => window.__fake.ruleStats)).slice(0, 160));
  await browser.close(); console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all edge-input checks passed')); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
