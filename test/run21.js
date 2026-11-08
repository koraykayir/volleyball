// Typing into the session form on the demo page: numeric fields keep the caret while the page re-renders
// (38 stays 38), dates and times are typed as DD-MM-YYYY / HH:MM / DD-MM-YYYY HH:MM with separators added
// as you type, invalid values are flagged and block saving, the native pickers still work, presets and saving
// store ISO values, and the roster court counts behave the same way.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const SRC = '/home/claude/fbwork/v12/index.html';
const OUT = '/tmp/claude-0/-home-claude/82e4117e-3441-59d5-9fb9-4e4b0005f9db/scratchpad';
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.route('**/cdn.jsdelivr.net/**', r => r.abort()); await page.route('**/maps.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
  await page.addInitScript(() => { if (window.top !== window) return; if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('vb.localdb', JSON.stringify({ example: false, config: { title: 'T', organizer: 'G', currentSessionId: '' }, sessions: {}, signups: {}, contacts: {}, ratings: {}, players: {}, accounts: {}, pairs: { together: '', apart: '' }, log: {} })); localStorage.setItem('vb.localAdmin', 'true'); });
  await page.goto('file://' + SRC); await sleep(300);
  const typeInto = async (sel, text) => { await page.click(sel); await page.keyboard.press('End'); for (const ch of text) { await page.keyboard.type(ch); await sleep(40); } };
  const clearField = async sel => { await page.click(sel); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await sleep(40); };
  const val = sel => page.inputValue(sel);
  const caretAtEnd = sel => page.$eval(sel, el => document.activeElement === el && el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
  const ui = () => page.evaluate(() => { const u = window.__vb.S.ui; return { ev: u.ev, raw: u.evRaw, bad: u.evBad, dirty: u.evDirty }; });
  check('session form open with text-based numeric fields', (await page.$eval('#evCap', el => el.type)) === 'text' && (await page.$eval('#evBench', el => el.type)) === 'text' && (await page.$eval('#evDuration', el => el.type)) === 'text');
  // numeric fields: caret stays at the end while the form re-renders on every keystroke
  await clearField('#evCap'); await typeInto('#evCap', '38');
  check('roster count: typing 3 then 8 gives 38, caret at the end', (await val('#evCap')) === '38' && (await caretAtEnd('#evCap')), await val('#evCap'));
  await clearField('#evBench'); await typeInto('#evBench', '15');
  check('bench: typing 1 then 5 gives 15', (await val('#evBench')) === '15' && (await caretAtEnd('#evBench')), await val('#evBench'));
  await clearField('#evDuration'); await typeInto('#evDuration', '150');
  check('duration: 150 typed in order', (await val('#evDuration')) === '150' && (await caretAtEnd('#evDuration')), await val('#evDuration'));
  check('previews follow: 38 players, up to 15 on the bench', (await page.textContent('#capPreview')) === '38' && /up to 15/.test(await page.textContent('#benchPrevie' + 'w')));
  // date: digits only, separators appear by themselves
  await clearField('#evDate'); await typeInto('#evDate', '14112026');
  check('date: "14112026" becomes 14-11-2026 while typing', (await val('#evDate')) === '14-11-2026' && (await caretAtEnd('#evDate')), await val('#evDate'));
  check('date stored as ISO 2026-11-14', (await ui()).ev.date === '2026-11-14' && !(await ui()).bad.evDate, (await ui()).ev);
  await clearField('#evTime'); await typeInto('#evTime', '2100');
  check('time: "2100" becomes 21:00, stored as 21:00', (await val('#evTime')) === '21:00' && (await ui()).ev.time === '21:00', [await val('#evTime'), (await ui()).ev.time]);
  await clearField('#evOpensAt'); await typeInto('#evOpensAt', '101120262000');
  check('opens at: "101120262000" becomes 10-11-2026 20:00, stored as 2026-11-10T20:00', (await val('#evOpensAt')) === '10-11-2026 20:00' && (await ui()).ev.opensAt === '2026-11-10T20:00', [await val('#evOpensAt'), (await ui()).ev.opensAt]);
  // deleting does not re-add separators
  await page.click('#evDate'); await page.keyboard.press('End'); for (let i = 0; i < 5; i++) { await page.keyboard.press('Backspace'); await sleep(30); }
  check('date: five backspaces leave "14-11" (no separator re-added)', (await val('#evDate')) === '14-11', await val('#evDate'));
  await page.keyboard.press('Backspace'); await sleep(30);
  check('…and one more leaves "14-1"', (await val('#evDate')) === '14-1', await val('#evDate'));
  check('an incomplete date is flagged and blocks saving', (await ui()).bad.evDate === true && (await page.$('#evDate.bad')) && /DD-MM-YYYY/.test(await page.textContent('.fhint.bad')) && (await page.$eval('[data-act="ev-new-ask"]', el => el.disabled)));
  // typing with own separators and single digits
  await clearField('#evDate'); await typeInto('#evDate', '9-3-2027');
  check('date typed as 9-3-2027 is accepted → 2027-03-09', (await val('#evDate')) === '9-3-2027' && (await ui()).ev.date === '2027-03-09' && !(await ui()).bad.evDate, [await val('#evDate'), (await ui()).ev]);
  await clearField('#evDate'); await typeInto('#evDate', '31-02-2026');
  check('31-02-2026 is refused (no such day)', (await ui()).bad.evDate === true && (await ui()).ev.date === '', await ui());
  await clearField('#evDate'); await typeInto('#evDate', '14.11.2026');
  check('dots as separators are accepted too', (await ui()).ev.date === '2026-11-14', (await ui()).ev);
  await clearField('#evTime'); await typeInto('#evTime', '9:05');
  check('time 9:05 → stored 09:05', (await ui()).ev.time === '09:05' && !(await ui()).bad.evTime, (await ui()).ev);
  await clearField('#evTime'); await typeInto('#evTime', '25:00');
  check('25:00 is refused', (await ui()).bad.evTime === true && (await page.$eval('[data-act="ev-new-ask"]', el => el.disabled)));
  await clearField('#evTime'); await typeInto('#evTime', '1900');
  // native pickers behind the icons
  check('each field has a hidden native picker of the right type', (await page.$eval('#evDatePick', el => el.type)) === 'date' && (await page.$eval('#evTimePick', el => el.type)) === 'time' && (await page.$eval('#evOpensAtPick', el => el.type)) === 'datetime-local' && (await page.$eval('#evDatePick', el => el.value)) === '2026-11-14');
  await page.$eval('#evDatePick', el => { el.value = '2026-12-24'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(100);
  check('picker choice shows as 24-12-2026 and is stored as ISO', (await val('#evDate')) === '24-12-2026' && (await ui()).ev.date === '2026-12-24', [await val('#evDate'), (await ui()).ev.date]);
  await page.$eval('#evOpensAtPick', el => { el.value = '2026-12-20T18:30'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(100);
  check('opens-at picker choice shows as 20-12-2026 18:30', (await val('#evOpensAt')) === '20-12-2026 18:30' && (await ui()).ev.opensAt === '2026-12-20T18:30', await val('#evOpensAt'));
  // preset
  await page.click('.chip[data-act="ev-open-preset"][data-p="d3"]'); await sleep(100);
  check('preset "3 days before" fills 21-12-2026 20:00', (await val('#evOpensAt')) === '21-12-2026 20:00' && (await ui()).ev.opensAt === '2026-12-21T20:00', await val('#evOpensAt'));
  await page.screenshot({ path: path.join(OUT, 'form-eu.png'), clip: { x: 0, y: 0, width: 390, height: 900 } });
  // save: the session carries the ISO values, the band shows the date
  await page.fill('#evPlace', 'East61');
  await page.click('[data-act="ev-new-ask"]'); await sleep(80); if (await page.$('[data-act="ev-new-yes"]')) { await page.click('[data-act="ev-new-yes"]'); } await sleep(400);
  const ev = await page.evaluate(() => window.__vb.S.vm.event);
  check('saved session: date 2026-12-24, time 19:00, opens 2026-12-21T20:00, capacity 38, bench 15, duration 150', ev && ev.date === '2026-12-24' && ev.time === '19:00' && ev.opensAt === '2026-12-21T20:00' && ev.capacity === 38 && ev.benchCap === 15 && ev.duration === 150, ev);
  check('band shows Thursday 24 December · 19:00', /Thursday 24 December/.test(await page.textContent('.band')) && /19:00/.test(await page.textContent('.band')), await page.textContent('.band'));
  check('form shows the saved values in EU format', (await val('#evDate')) === '24-12-2026' && (await val('#evTime')) === '19:00' && (await val('#evOpensAt')) === '21-12-2026 20:00');
  // roster court counts: same caret behaviour
  await page.evaluate(() => { const f = window.__vb; const d = JSON.parse(localStorage.getItem('vb.localdb')); const id = d.config.currentSessionId; d.sessions[id].opensAt = ''; for (let i = 0; i < 38; i++) { const uid = 'p' + i; d.players[uid] = { name: 'P' + i, level: 1 + i % 5, email: '' }; d.signups[id + '_' + uid] = { id: id + '_' + uid, sessionId: id, name: 'P' + i, uid, createdAt: Date.now() + i, status: 'active', paid: true, noshow: false, guestOf: '', addedBy: 'self' }; } localStorage.setItem('vb.localdb', JSON.stringify(d)); });
  await page.reload(); await sleep(400);
  if (!(await page.$('[data-act="roster-open"]'))) console.log('ORG BUTTONS', await page.$$eval('.org [data-act]', els => [...new Set(els.map(e => e.dataset.act))].join(' ')));
  const ro = await page.waitForSelector('[data-act="roster-open"]', { timeout: 5000 }).catch(() => null);
  if (!ro || await ro.evaluate(el => el.disabled)) console.log('ROSTER BUTTON', ro ? await ro.evaluate(el => el.outerHTML) : 'missing', '| rows', (await page.$$('.row')).length, '| band', (await page.textContent('.band')).slice(0, 80));
  await page.click('[data-act="roster-open"]'); await sleep(200);
  const rcSel = (await page.$('#rc4v4')) ? '#rc4v4' : (await page.$$eval('input[id^="rc"]', els => els[0] && '#' + els[0].id));
  await clearField(rcSel); await typeInto(rcSel, '12');
  check('court count: typing 1 then 2 gives 12 with the caret at the end', (await val(rcSel)) === '12' && (await caretAtEnd(rcSel)), await val(rcSel));
  check('no page errors', errs.length === 0, errs);
  await browser.close(); console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all form-typing checks passed')); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
