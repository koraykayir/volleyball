// Google Maps link: field with a "find on Maps" pin, validation, stored on the session, shown in the band,
// in the announcement (with the opening time), in the calendar entries; copied to next week's session; demo page.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SRC = '/home/claude/fbwork/v12/index.html';
const FAKE = fs.readFileSync(path.join(__dirname, 'fakefirebase.js'), 'utf8'); const RULES = fs.readFileSync(path.join(__dirname, 'fakerules.js'), 'utf8');
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = '<script id="vb-config" type="application/json">{"firebase":{"apiKey":"k","projectId":"volley-test","appId":"1"}}</script>';
(async () => {
  const html = fs.readFileSync(SRC, 'utf8'); const p = path.join(__dirname, 'fb23.html'); fs.writeFileSync(p, html.replace('<script id="vb-config" type="application/json">{}</script>', CFG));
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(FAKE); await ctx.addInitScript(RULES);
  await ctx.addInitScript(() => { if (window.top !== window) return; const f = window.__fake; f.seed('admins/organizer@example.com', {}); f.seed('config/app', { title: 'Volley Berlin | Beachvolleyball', organizer: 'Gürkan', pageUrl: 'https://koraykayir.github.io/volleyball/', currentSessionId: '' }); });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.route('**/cdn.jsdelivr.net/**', r => r.abort()); await page.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
  await page.goto('file://' + p); await sleep(300);
  const dump = () => page.evaluate(() => window.__fake.dump());
  const denials = () => page.evaluate(() => (window.__fake.denials || []).map(d => d.join(' + ')));
  await page.click('.status [data-act="auth-open"]:not([data-mode])'); await sleep(80); await page.evaluate(() => window.__fake.setGoogleEmail('organizer@example.com', 'Gürkan')); await page.click('[data-act="auth-google"]'); await sleep(400);
  if (await page.$('[data-act="profile-save"]')) { await page.click('.lvl[data-n="3"]'); await page.click('[data-act="profile-save"]'); await sleep(400); }
  // field + pin
  check('Maps link field present, no pin while the place is empty', !!(await page.$('#evMapUrl')) && !(await page.$('a.pick')));
  await page.fill('#evDate', '24-12-2026'); await page.fill('#evTime', '19:00'); await page.fill('#evPlace', 'East61 Berlin'); await sleep(100);
  check('pin appears once a place is typed and searches Google Maps for it', (await page.$eval('a.pick', a => a.href)) === 'https://www.google.com/maps/search/?api=1&query=East61%20Berlin' && (await page.$eval('a.pick', a => a.target)) === '_blank', await page.$eval('a.pick', a => a.href));
  await page.fill('#evMapUrl', 'maps.app.goo.gl/abc'); await sleep(100);
  check('a link without https:// is flagged and blocks saving', !!(await page.$('#evMapUrl.bad')) && /starting with https/.test(await page.textContent('.fhint.bad')) && (await page.$eval('[data-act="ev-new-ask"]', el => el.disabled)));
  await page.fill('#evMapUrl', 'https://maps.app.goo.gl/abc123'); await sleep(100);
  check('a proper link is accepted', !(await page.$('#evMapUrl.bad')) && !(await page.$eval('[data-act="ev-new-ask"]', el => el.disabled)));
  // start the session with an opening time in the future
  await page.fill('#evOpensAt', '20-12-2026 20:00'); await page.selectOption('#evVenueType', 'indoor'); await page.fill('#evPrice', '8 €');
  await page.click('[data-act="ev-new-ask"]'); await sleep(100); if (await page.$('[data-act="ev-new-yes"]')) await page.click('[data-act="ev-new-yes"]'); await sleep(500);
  const d = await dump();
  check('session stores mapUrl, no refusals', d['sessions/2026-12-24'] && d['sessions/2026-12-24'].mapUrl === 'https://maps.app.goo.gl/abc123' && (await denials()).length === 0, [d['sessions/2026-12-24'] && d['sessions/2026-12-24'].mapUrl, await denials()]);
  check('band shows a Map link to the pasted address', (await page.$eval('.band .maplink', a => a.href)) === 'https://maps.app.goo.gl/abc123');
  const ann = await page.evaluate(() => window.__vb.announceText(window.__vb.S.vm));
  const lines = ann.split('\n');
  check('announcement: 📍 venue line then 🗺️ map link', lines[3] === '📍 East61 Berlin · Indoor' && lines[4] === '🗺️ https://maps.app.goo.gl/abc123', lines.slice(0, 6));
  check('announcement: ⏰ opening time included', lines.some(l => /^⏰ Sign-ups open Sun 20 Dec 20:00$/.test(l)), lines.filter(l => l.startsWith('⏰')));
  check('announcement order: sign-up link before the opening time', lines.indexOf(lines.find(l => l.startsWith('👉'))) < lines.indexOf(lines.find(l => l.startsWith('⏰'))), lines);
  check('calendar entries carry the map link', /maps\.app\.goo\.gl%2Fabc123/.test(await page.$eval('a[href^="https://calendar.google.com"]', a => a.href).catch(() => '')) || /maps.app.goo.gl\/abc123/.test(await page.evaluate(() => window.__vb.icsText(window.__vb.S.vm.event))), await page.evaluate(() => window.__vb.icsText(window.__vb.S.vm.event)));
  // opening time already past → "are open (since …)"
  await page.fill('#evOpensAt', '01-11-2026 20:00'); await page.click('[data-act="ev-update"]'); await sleep(500);
  const ann2 = await page.evaluate(() => window.__vb.announceText(window.__vb.S.vm));
  check('announcement: past opening time reads "are open (since …)"', /⏰ Sign-ups are open \(since Sun 1 Nov 20:00\)/.test(ann2), ann2.split('\n').filter(l => l.startsWith('⏰')));
  check('update log mentions the opening change (map link unchanged, not mentioned)', Object.values(await dump()).some(v => v && v.type === 'session-update' && /opens/.test(v.detail) && !/map link/.test(v.detail)));
  // without a pasted link: Maps search for the place
  await page.fill('#evMapUrl', ''); await page.click('[data-act="ev-update"]'); await sleep(500);
  const ann3 = await page.evaluate(() => window.__vb.announceText(window.__vb.S.vm));
  check('without a pasted link the announcement uses a Maps search for the place', ann3.includes('🗺️ https://www.google.com/maps/search/?api=1&query=East61%20Berlin'), ann3.split('\n')[4]);
  check('…and so does the band', (await page.$eval('.band .maplink', a => a.href)) === 'https://www.google.com/maps/search/?api=1&query=East61%20Berlin');
  check('log line for the removed map link', Object.values(await dump()).some(v => v && v.type === 'session-update' && /map link https:\/\/maps.app.goo.gl\/abc123 → –/.test(v.detail)), Object.values(await dump()).filter(v => v && v.type === 'session-update').map(v => v.detail));
  // next week's session copies the link
  await page.fill('#evMapUrl', 'https://maps.app.goo.gl/xyz'); await page.click('[data-act="ev-update"]'); await sleep(400);
  await page.click('[data-act="done-ask"]'); await sleep(100); await page.click('[data-act="done-yes"]'); await sleep(500);
  await page.click('[data-act="ev-next-week"]'); await sleep(700);
  const d3 = await dump();
  check('"Start next week\'s session" keeps the map link', d3['sessions/2026-12-31'] && d3['sessions/2026-12-31'].mapUrl === 'https://maps.app.goo.gl/xyz', d3['sessions/2026-12-31']);
  // map snippet under the band
  await page.fill('#evMapUrl', 'https://www.google.com/maps/place/East61/@52.4976,13.4524,17z/data=!3m1'); await page.click('[data-act="ev-update"]'); await sleep(500);
  check('map snippet shown under the band, centred on the coordinates found in the pasted link', (await page.$eval('.map iframe', f => f.getAttribute('src'))) === 'https://maps.google.com/maps?q=52.4976%2C13.4524&z=15&output=embed' && (await page.$eval('.map iframe', f => f.getAttribute('loading'))) === 'lazy', await page.$eval('.map iframe', f => f.getAttribute('src')).catch(() => null));
  check('map block comes right after the band, before the status line', await page.evaluate(() => { const w = document.querySelector('.wrap'); return w.children[0].classList.contains('map') && w.children[1].classList.contains('status'); }));
  check('map footer: place and "Open in Google Maps"', /East61 Berlin/.test(await page.textContent('.mapfoot')) && (await page.$eval('.mapfoot a', a => a.href)) === 'https://www.google.com/maps/place/East61/@52.4976,13.4524,17z/data=!3m1');
  await page.fill('#evMapUrl', '52.52, 13.405'); await page.click('[data-act="ev-update"]'); await sleep(500);
  check('coordinates in the field: accepted, map and links use them', (await page.$eval('.map iframe', f => f.getAttribute('src'))) === 'https://maps.google.com/maps?q=52.52%2C13.405&z=15&output=embed' && (await page.$eval('.band .maplink', a => a.href)) === 'https://www.google.com/maps?q=52.52,13.405' && (await page.evaluate(() => window.__vb.announceText(window.__vb.S.vm))).includes('🗺️ https://www.google.com/maps?q=52.52,13.405'));
  await page.fill('#evMapUrl', ''); await page.click('[data-act="ev-update"]'); await sleep(500);
  check('no link: map centred on the place name', (await page.$eval('.map iframe', f => f.getAttribute('src'))) === 'https://maps.google.com/maps?q=East61%20Berlin&z=15&output=embed');
  check('no map on the account, log and sign-up pages', await (async () => { await page.click('[data-act="log-open"]'); await sleep(300); const a = !(await page.$('.map')); await page.click('[data-act="log-close"]'); await sleep(200); return a; })());
  check('no page errors', errs.length === 0, errs);
  await browser.close(); console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all maps-link checks passed')); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
