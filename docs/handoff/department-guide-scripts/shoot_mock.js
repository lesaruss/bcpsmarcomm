const { chromium } = require('playwright');
const B = '/tmp/claude-0/-home-user-bcpsmarcomm/9cd69df2-9574-5317-a1e6-9dedb578c0ca/scratchpad/ece-guide/';
(async () => {
  const b = await chromium.launch();
  const jobs = [['admin', 1440, 1100], ['wcm', 1440, 1100], ['staff', 1440, 900], ['director', 1440, 900], ['wcm', 1024, 1300], ['wcm', 390, 2000]];
  for (const [name, w, h] of jobs) {
    const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const p = await c.newPage();
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto('file://' + B + `mock-${name}.html`);
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
    const m = await p.evaluate(() => {
      const de = document.documentElement;
      const shot = document.querySelector('.guide-hero-shot')?.getBoundingClientRect();
      const tiles = [...document.querySelectorAll('.guide-tile')].map(t => Math.round(t.getBoundingClientRect().width));
      const links = [...document.querySelectorAll('.guide-tile ul.guide-links')].map(u => getComputedStyle(u).gridTemplateColumns.split(' ').length);
      return { overflow: Math.max(de.scrollWidth - de.clientWidth, document.body.scrollWidth - document.body.clientWidth), shot: shot && [Math.round(shot.width), Math.round(shot.height)], tiles, linkCols: links };
    });
    console.log(name, w, JSON.stringify(m));
    await p.screenshot({ path: B + `shot-${name}-${w}.png`, fullPage: false });
    await c.close();
  }
  await b.close();
})();
