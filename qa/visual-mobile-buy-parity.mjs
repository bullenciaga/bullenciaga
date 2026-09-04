// Compare the SAME shared picker in the real home, Tape and Drop documents.
// No wallet connection, signature, quote or trade; all API requests are blocked.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.visual/mobile-buy-parity');
await fs.mkdir(output, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const route = ({ '/': '/index.html', '/tape': '/tape.html', '/thedrop': '/thedrop.html' })[pathname] || pathname;
  const file = path.resolve(root, 'site', '.' + route);
  if (!file.startsWith(path.join(root, 'site') + '/')) return res.writeHead(403).end();
  try {
    res.setHeader('content-type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.VISUAL_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH });
try {
  const sizes = process.env.PARITY_DIAG ? [[390, 844]] : [[320, 700], [390, 844], [430, 932]];
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport:{ width, height }, reducedMotion:'reduce' });
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.hostname === 'plugin.jup.ag') return route.fulfill({ contentType:'text/javascript', body:'window.Jupiter={init(){throw new Error("Unexpected swap in picker parity test")}};' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return route.continue();
      if (u.origin === new URL(base).origin && (['/', '/tape', '/thedrop'].includes(u.pathname) || /\.(html|css|js|woff2?|png|svg|jpg|webp)$/.test(u.pathname))) return route.continue();
      return route.abort();
    });
    const snapshots = [];
    for (const route of ['/', '/tape', '/thedrop']) {
      const page = await context.newPage();
      await page.goto(base + route, { waitUntil:'domcontentloaded' });
      await page.waitForFunction(() => window.BullenMobileBuy);
      await page.waitForSelector('html.bullen-ready');
      // Invoke the canonical public component API to isolate page CSS from trigger code.
      await page.evaluate(() => BullenMobileBuy.request({
        mint:'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN',
        jupiterUrl:'https://jup.ag/swap/SOL-BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN',
        continueWithJupiter() { throw new Error('Unexpected trade'); }
      }));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForSelector('.bullen-mobile-buy.is-open');
      const snapshot = await page.evaluate(() => {
        const dialog = document.querySelector('.bullen-mobile-buy');
        return [dialog, ...dialog.querySelectorAll('*')].map(e => {
          const c = getComputedStyle(e), b = e.getBoundingClientRect();
          return { tag:e.tagName, cls:e.getAttribute('class'),
            // Page-wide reduced-motion resets differ but inactive animations
            // and zero-duration transitions do not affect the rendered picker.
            style:Object.fromEntries([...c].filter(k => !k.startsWith('--')
              && !(k === 'animation-duration' && c.animationName === 'none')
              && !(k === 'transition-property' && parseFloat(c.transitionDuration) <= 0.00001))
              .map(k => [k, c.getPropertyValue(k)])),
            rect:{ x:b.x, y:b.y, width:b.width, height:b.height } };
        });
      });
      snapshots.push(snapshot);
      const name = route === '/' ? 'home' : route.slice(1);
      await fs.writeFile(path.join(output, `${name}-${width}.json`), JSON.stringify(snapshot, null, 2));
      await page.locator('.bullen-mobile-buy__sheet').screenshot({ path:path.join(output, `${name}-${width}.png`) });
      await page.close();
    }
    for (let n = 1; n < snapshots.length; n++) {
      const differences = snapshots[0].flatMap((a, i) => {
        const b = snapshots[n][i];
        const diff = Object.fromEntries(Object.keys(a.style).filter(k => a.style[k] !== b.style[k]).map(k => [k, [a.style[k], b.style[k]]]));
        return Object.keys(diff).length || JSON.stringify(a.rect) !== JSON.stringify(b.rect)
          ? [{ element:a.cls || a.tag, rect:[a.rect, b.rect], diff }] : [];
      });
      if (process.env.PARITY_DIAG) console.log(JSON.stringify({ page:['home','tape','thedrop'][n], differences }, null, 2));
      else {
        const name = ['home','tape','thedrop'][n];
        assert.deepEqual(differences, [], `${name} must match home at ${width}px`);
        assert.deepEqual(await fs.readFile(path.join(output, `${name}-${width}.png`)),
          await fs.readFile(path.join(output, `home-${width}.png`)),
          `${name} picker pixels must match the original home picker at ${width}px`);
      }
    }
    if (!process.env.PARITY_DIAG) console.log(`PASS ${width}×${height}: home, Tape and Drop have identical computed picker styles and geometry`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
