const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (n, c, x) => { if (c) console.log('ok   ' + n); else { fails++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); } };
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); await p.route('**/cdn.jsdelivr.net/**', r => r.abort()); await p.route('**/fonts.googleapis.com/**', r => r.abort());
  // the built demo page links to ../guide/, the live page to guide/
  await p.goto('file:///home/claude/volleyball/demo/index.html'); await sleep(250);
  check('visitor: no guide link', !(await p.$('a[href$="guide/"]')));
  await p.click('[data-act="org-open"]'); await p.click('[data-act="org-demo"]'); await sleep(200);
  const hrefs = await p.$$eval('a[href$="guide/"]', as => as.map(a => a.getAttribute('href') + '|' + a.getAttribute('target')));
  check('demo organizer: Guide links (panel header + settings) point one level up, open in a new tab', hrefs.length === 2 && hrefs.every(h => h === '../guide/|_blank'), hrefs);
  // (a file:// directory URL has no index.html; GitHub Pages serves guide/index.html for guide/)
  const guidePage = await ctx.newPage(); await guidePage.route('**/fonts.googleapis.com/**', r => r.abort());
  await guidePage.goto('file:///home/claude/volleyball/guide/index.html'); await sleep(300);
  check('guide opens from the demo and renders with all images', (await guidePage.title()).includes('Organizer guide') && (await guidePage.$$eval('img', imgs => imgs.every(i => i.complete && i.naturalWidth > 0))) && (await guidePage.$$('section.s')).length === 18);
  check('guide: back link returns to the page', (await guidePage.$eval('a.back', a => a.getAttribute('href'))) === '../');
  check('guide: 18 contents entries, each pointing at an existing section with a heading', (await guidePage.$$eval('nav.toc a', as => as.map(a => a.getAttribute('href')))).length === 18 && (await guidePage.evaluate(() => [...document.querySelectorAll('nav.toc a')].every(a => { const s = document.querySelector(a.getAttribute('href')); return s && s.querySelector('h2'); }))));
  check('guide: 22 screenshots, all with alt text and captions', (await guidePage.$$eval('figure', fs => fs.length)) === 22 && (await guidePage.$$eval('figure', fs => fs.every(f => f.querySelector('img').getAttribute('alt') && f.querySelector('figcaption').textContent.trim().length > 0))));
  check('guide: no horizontal overflow on a phone', !(await guidePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  check('guide: covers the key topics', (await guidePage.textContent('body')).includes('3 hours') && (await guidePage.textContent('body')).includes('admins') && (await guidePage.textContent('body')).includes('Mark as played') && (await guidePage.textContent('body')).includes('Download CSV') && (await guidePage.textContent('body')).includes('#countdown'));
  await guidePage.emulateMedia({ colorScheme: 'dark' }); await sleep(100);
  check('guide: dark mode renders (dark background)', (await guidePage.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== 'rgb(242, 244, 248)');
  await guidePage.close();
  await p.goto('file:///home/claude/fbwork/v12/index.html'); await sleep(250);
  if (await p.$('[data-act="org-open"]')) { await p.click('[data-act="org-open"]'); await p.click('[data-act="org-demo"]'); await sleep(200); }
  check('source page (not under /demo/): Guide link is guide/', (await p.$eval('.orghead a[href$="guide/"]', a => a.getAttribute('href'))) === 'guide/');
  await browser.close(); console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
