// Isolated browser QA. No wallet connection, signature, quote or trade.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.visual/drop-buy');
await fs.mkdir(output, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, 'site', '.' + (pathname === '/thedrop' ? '/thedrop.html' : pathname));
  if (!file.startsWith(path.join(root, 'site') + '/')) return res.writeHead(403).end();
  try { res.setHeader('content-type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' })[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.VISUAL_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
try {
  for (const width of [320, 390, 820, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'plugin.jup.ag') return route.fulfill({ contentType: 'text/javascript', body: 'window.__swaps=[];window.Jupiter={init:c=>window.__swaps.push(c)};' });
      if (url.pathname === '/drop') return route.fulfill({ json: { verified:true,round:1,potSol:.82100202825,targetSol:2.5,pct:32.84008113,wallets:48,tickets:670,txs:[] } });
      if (url.origin === new URL(base).origin || /fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(base + '/thedrop', { waitUntil: 'networkidle' });
    assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
    await page.locator('#buyBullen').click();
    if (width <= 767) {
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      assert.equal(await page.evaluate(() => window.__swaps.length), 0);
      assert.equal(await dialog.getByRole('button', { name: /Phantom/ }).count(), 1);
      assert.equal(await dialog.getByRole('button', { name: /Solflare/ }).count(), 1);
      const bounds = await dialog.locator('.bullen-mobile-buy__sheet').boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
      assert(bounds.y >= 0 && bounds.y + bounds.height <= 1000);
      assert((await dialog.getByRole('link', { name: 'Jupiter web' }).getAttribute('href')).endsWith('BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN'));
      await page.screenshot({ path:path.join(output, `wallet-picker-${width}.png`) });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state:'hidden' });
      assert.equal(await page.evaluate(() => document.activeElement.id), 'buyBullen');
      await page.locator('#buyBullen').click();
      await dialog.getByRole('button', { name:/Already inside a wallet/ }).click();
      await page.waitForFunction(() => window.__swaps.length === 1);
    } else {
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.evaluate(() => window.__swaps.length), 1);
      assert.equal(await page.evaluate(() => window.__swaps[0].displayMode), 'modal');
      assert.equal((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--jupiter-plugin-primary'))).trim(), '199, 168, 105');
    }
    console.log(`PASS ${width}px: layout, correct buy route, theme, mobile dismissal/continuation`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
