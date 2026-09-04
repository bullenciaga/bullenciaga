// Real home document, no wallet/trade. Compare against the reviewed base commit.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.visual/contract-copy');
await fs.mkdir(output, { recursive:true });
const baseline = execFileSync('git', ['show', '28963cb:site/index.html'], { cwd:root, maxBuffer:10_000_000 });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, 'site', '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(path.join(root, 'site') + '/')) return res.writeHead(403).end();
  try {
    res.setHeader('content-type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg' })[path.extname(file)] || 'application/octet-stream');
    res.end(url.searchParams.has('baseline') ? baseline : await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.VISUAL_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH });
try {
  for (const [width, height] of [[320,700], [390,844], [430,932], [440,956], [768,1024], [1440,1000]]) {
    const context = await browser.newContext({ viewport:{width,height}, reducedMotion:'reduce' });
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.hostname === 'plugin.jup.ag') return route.fulfill({ contentType:'text/javascript', body:'' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return route.continue();
      if (u.origin === new URL(base).origin && (u.pathname === '/' || /\.(html|css|js|woff2?|png|svg|jpg|webp)$/.test(u.pathname))) return route.continue();
      return route.abort();
    });
    const records = [];
    for (const before of process.env.VISUAL_BASE_URL ? [false] : [true, false]) {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.copiedText = null;
        Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText: async text => { window.copiedText = text; } } });
      });
      await page.goto(base + (before ? '/?baseline=1' : '/'), { waitUntil:'domcontentloaded' });
      await page.waitForSelector('html.bullen-ready');
      await page.evaluate(() => document.fonts.ready);
      // Deterministic public labels, matching the supplied mobile screenshot.
      await page.evaluate(() => {
        document.getElementById('jupVerifyLink').style.display = 'inline-flex';
        document.getElementById('badgeMintText').textContent = 'Mint Authority — Revoked';
        document.getElementById('badgeFreezeText').textContent = 'Freeze Authority — Revoked';
        document.getElementById('dropBtn').textContent = 'The Drop · 32%';
      });
      const geometry = () => page.evaluate(() => {
        const rect = selector => {
          const e = document.querySelector(selector), b = e.getBoundingClientRect();
          return { x:b.x, y:b.y, width:b.width, height:b.height };
        };
        return { hero:rect('.hero'), main:rect('.hero main'), cta:rect('.cta'), row:rect('.contract-row'), address:rect('#contractValue'),
          overflow:document.documentElement.scrollWidth > innerWidth };
      });
      const initial = await geometry();
      assert.equal(initial.overflow, false, `no horizontal overflow at ${width}`);
      records.push(initial);
      await page.screenshot({ path:path.join(output, `${before ? 'before' : 'after'}-${width}.png`) });
      if (!before) {
        if (width <= 820) {
          assert.equal(await page.locator('#copyBtn').isVisible(), false, 'no separate copy box on mobile');
          assert((await page.locator('#contractCopy').boundingBox()).height >= 44, '44px touch target');
        } else assert.equal(await page.locator('#copyBtn').isVisible(), true);
        await page.locator('#contractCopy').click();
        assert.equal(await page.evaluate(() => window.copiedText), 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN');
        assert.equal(await page.locator('#contractCopyStatus').textContent(), 'Contract copied ✓');
        assert.deepEqual(await geometry(), initial, 'copy feedback must not move the hero');
        await page.evaluate(() => window.copiedText = null);
        await page.locator('#contractCopy').press('Enter');
        assert.equal(await page.evaluate(() => window.copiedText), 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN');
        await page.evaluate(() => window.copiedText = null);
        await page.locator('#contractCopy').press('Space');
        assert.equal(await page.evaluate(() => window.copiedText), 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN');
        await page.screenshot({ path:path.join(output, `copied-${width}.png`) });
      }
      await page.close();
    }
    if (records.length === 2) {
      const [before, after] = records;
      if (width <= 480) assert(after.main.height <= before.main.height - 40, 'remove the extra copy row from mobile hero');
      if (width > 820) assert.deepEqual(after, before, 'desktop geometry unchanged');
    }
    console.log(JSON.stringify({ width, records }));
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
