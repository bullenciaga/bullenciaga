import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.visual/mobile-navigation');
await fs.mkdir(output, { recursive:true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer(async (req, res) => {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') pathname = '/index.html';
  else if (!path.extname(pathname)) pathname += '.html';
  const file = path.resolve(root, 'site', '.' + pathname);
  if (!file.startsWith(path.join(root, 'site') + '/')) return res.writeHead(403).end();
  try {
    res.setHeader('content-type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.VISUAL_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH });
try {
  for (const width of [320, 390, 430]) {
    const context = await browser.newContext({ viewport:{width,height:844}, reducedMotion:'reduce' });
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.hostname === 'plugin.jup.ag') return route.fulfill({ contentType:'text/javascript', body:'' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return route.continue();
      if (u.origin === new URL(base).origin && (!path.extname(u.pathname) || /\.(html|css|js|woff2?|png|svg|jpg|webp)$/.test(u.pathname))) return route.continue();
      return route.abort();
    });
    for (const pathname of ['/', '/tape', '/thedrop', '/passport', '/ledger', '/objects', '/patchnotes', '/patchnotes-001', '/stats', '/chart', '/curve', '/refer', '/transparency', '/lock', '/giveaways']) {
      const page = await context.newPage();
      await page.goto(base + pathname, { waitUntil:'domcontentloaded' });
      await page.waitForSelector('html.bullen-ready');
      await page.evaluate(() => document.fonts.ready);
      const inspect = (panel, item) => page.evaluate(({ panel, item }) => {
        const e = document.querySelector(panel), link = document.querySelector(item);
        const p = getComputedStyle(e), s = getComputedStyle(link), b = e.getBoundingClientRect();
        const pick = (style, keys) => Object.fromEntries(keys.map(key => [key, style[key]]));
        return {
          rect:{ x:b.x, y:b.y, width:b.width },
          panel:pick(p, ['position','padding','borderWidth','backgroundColor','backdropFilter','boxShadow','maxHeight','overscrollBehavior']),
          row:pick(s, ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','padding','borderWidth','minHeight','textTransform']),
        };
      }, {panel,item});
      await page.locator('.jumpto-btn').click();
      await page.locator('.jumpto-widget.open .jumpto-menu').waitFor({ state:'visible' });
      const jump = await inspect('.jumpto-menu', '.jumpto-item');
      await page.locator('.bullen-nav-toggle').click();
      await page.locator('.bullen-site-shell.nav-open .bullen-site-nav').waitFor({ state:'visible' });
      const nav = await inspect('.bullen-site-nav', '.bullen-mobile-nav-directory a:not([aria-current])');
      assert.deepEqual(nav, jump, `${pathname} at ${width}: hamburger must match Jump To surface/type/insets`);
      assert.equal(await page.locator('.jumpto-btn').getAttribute('aria-expanded'), 'false', 'only one dropdown opens');
      const links = page.locator('.bullen-mobile-nav-directory a');
      assert.equal(await links.count(), 11);
      if (pathname === '/') await page.screenshot({ path:path.join(output, `hamburger-${width}.png`) });
      await page.locator('.bullen-site-nav > .bullen-site-sister').scrollIntoViewIfNeeded();
      assert(await page.locator('.bullen-site-nav > .bullen-site-sister').evaluate(link => {
        const b = link.getBoundingClientRect(), panel = link.closest('nav').getBoundingClientRect();
        return b.top >= panel.top && b.bottom <= panel.bottom + 1;
      }), 'last destination is reachable within the scrollable menu');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.bullen-nav-toggle').getAttribute('aria-expanded'), 'false');
      await page.close();
    }
    console.log(`PASS ${width}px: all 15 public pages use matching mobile dropdowns, complete directory, exclusive opening and Escape`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
