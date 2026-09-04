// Real page triggers and handoff URLs in fresh, disconnected browser contexts.
// Wallet launches are intercepted. No connection, amount, quote or trade.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const mint = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
const sol = 'So11111111111111111111111111111111111111112';
const expected = `https://jup.ag/swap?buy=${mint}&sell=${sol}`;
const routes = ['/', '/tape', '/thedrop', '/patchnotes', '/patchnotes-001'];
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer(async (req, res) => {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (routes.includes(pathname)) pathname = pathname === '/' ? '/index.html' : pathname + '.html';
  const file = path.resolve(root, 'site', '.' + pathname);
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
  for (const route of routes) {
    const context = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, reducedMotion:'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', request => {
      const url = new URL(request.request().url());
      if (url.hostname === 'solflare.com') return request.fulfill({ contentType:'text/plain', body:'Wallet handoff intercepted for QA.' });
      if (url.hostname === 'plugin.jup.ag') return request.fulfill({ contentType:'text/javascript', body:'window.__swaps=[];window.Jupiter={init:c=>window.__swaps.push(c)};' });
      if (url.origin === new URL(base).origin && (routes.includes(url.pathname) || /\.(html|css|js|woff2?|png|svg|jpg|webp)$/.test(url.pathname))) return request.continue();
      return request.abort();
    });
    const page = await context.newPage();
    await page.goto(base + route, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.BullenMobileBuy && window.Jupiter);
    await page.waitForSelector('html.bullen-ready');
    await page.locator(route === '/' ? '#buyBtn' : '#buyBullen').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => window.__swaps.length), 0);
    assert.equal(await dialog.getByRole('link', { name:'Jupiter web' }).getAttribute('href'), expected);
    const [handoff] = await Promise.all([
      page.waitForRequest(req => new URL(req.url()).hostname === 'solflare.com'),
      dialog.getByRole('button', { name:/Solflare/ }).click(),
    ]);
    const outer = new URL(handoff.url());
    assert.equal(outer.searchParams.get('ref'), 'https://bullenciaga.com');
    assert.equal(decodeURIComponent(outer.pathname.slice('/ul/v1/browse/'.length)), expected);
    console.log(`PASS ${route}: actual Buy → Solflare click preserves SOL → BULLEN; no wallet launched`);
    await context.close();
  }
  // Optional read-only check of Jupiter itself, not a mock of its URL parser.
  if (process.env.VERIFY_JUPITER_LIVE === '1') {
    const context = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
    const page = await context.newPage();
    await page.goto(expected, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => /Sell\s+SOL\s+Buy\s+BULLEN/.test(document.body.innerText));
    await page.waitForTimeout(3000);
    assert.match(await page.locator('body').innerText(), /Sell\s+SOL\s+Buy\s+BULLEN/, 'prefill must survive token-data hydration');
    assert.equal(new URL(page.url()).searchParams.get('buy'), mint);
    assert.equal(new URL(page.url()).searchParams.get('sell'), sol);
    const output = path.join(root, '.visual/buy-links');
    await fs.mkdir(output, { recursive:true });
    await page.screenshot({ path:path.join(output, 'jupiter-sol-bullen-mobile.png') });
    console.log('PASS live Jupiter: rendered Sell SOL / Buy BULLEN in a fresh disconnected browser; token warnings untouched');
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
