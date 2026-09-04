// Controlled mobile startup regression; no wallet, API or trade activity.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const output = path.join(root, '.visual/mobile-first-paint');
await fs.mkdir(output, { recursive:true });
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : path.extname(pathname) ? pathname : pathname + '.html'));
  if (!file.startsWith(site + '/')) return res.writeHead(403).end();
  try {
    const body = process.env.QA_BASELINE && /\.(html|css|js)$/.test(file)
      ? execFileSync('git', ['show', `${process.env.QA_BASELINE}:site/${path.relative(site, file)}`], { cwd:root })
      : await fs.readFile(file);
    res.setHeader('content-type', ({ '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.VISUAL_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH });
const allowed = u => /fonts\.(googleapis|gstatic)\.com/.test(u.hostname)
  || u.origin === new URL(base).origin && (u.pathname === '/' || /\.(html|css|js|png|jpg|svg|webp)$/.test(u.pathname) || !path.extname(u.pathname) && ['tape','thedrop','passport','ledger','objects','lock','stats','curve','chart','refer','giveaways','patchnotes','transparency','referrals','patchnotes-001'].includes(u.pathname.slice(1)));
try {
  // A delayed swap vendor must never hold the navigation hostage.
  for (const route of ['/', '/tape', '/passport', '/thedrop']) {
    let releasePlugin;
    const pluginGate = new Promise(resolve => { releasePlugin = resolve; });
    const context = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
    await context.route('**/*', async request => {
      const u = new URL(request.request().url());
      if (u.hostname === 'plugin.jup.ag') { await pluginGate; return request.fulfill({ contentType:'text/javascript', body:'window.Jupiter={init(){}};' }); }
      return allowed(u) ? request.continue() : request.abort();
    });
    const page = await context.newPage();
    try {
      await page.goto(base + route, { waitUntil:'commit' });
      await page.waitForSelector('.bullen-site-shell', { timeout:1800 });
      assert.equal(await page.locator('.bullen-site-shell').count(), 1);
      const box = await page.locator('.bullen-site-shell').boundingBox();
      assert.equal(box.y, 0); assert.equal(box.height, 58);
      await page.locator('.bullen-nav-toggle').click();
      await page.waitForSelector('.bullen-site-shell.nav-open');
      console.log(`PASS ${route}: fixed mobile navigation works while Jupiter is still blocked`);
    } finally { releasePlugin(); await context.close(); }
  }

  // Hold real font binaries beyond the old 500ms deadline. The content stays
  // hidden while the fixed rail retains its geometry, then fades in once.
  const context = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  let releaseFonts;
  const fontGate = new Promise(resolve => { releaseFonts = resolve; });
  let fontRequests = 0;
  await context.route('**/*', async request => {
    const u = new URL(request.request().url());
    if (u.hostname === 'fonts.gstatic.com') { fontRequests++; await fontGate; return request.continue(); }
    if (u.hostname === 'plugin.jup.ag') return request.fulfill({ contentType:'text/javascript', body:'window.Jupiter={init(){}};' });
    return allowed(u) ? request.continue() : request.abort();
  });
  const page = await context.newPage();
  try {
    await page.goto(base + '/thedrop', { waitUntil:'domcontentloaded' });
    await page.waitForSelector('.bullen-site-shell');
    const before = await page.locator('.bullen-site-shell').boundingBox();
    await page.waitForTimeout(650);
    assert(fontRequests > 0, 'Test must actually delay real House fonts');
    assert(await page.locator('html.bullen-booting').count(), 'Mobile must not reveal fallback type at the old 500ms deadline');
    assert.equal(await page.locator('.wrap').evaluate(e => getComputedStyle(e).visibility), 'hidden');
    releaseFonts();
    await page.waitForSelector('html.bullen-ready');
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(await page.locator('.bullen-site-shell').boundingBox(), before);
    assert.equal(await page.locator('.wrap').evaluate(e => getComputedStyle(e).transitionDuration), '0.15s');
    console.log('PASS delayed fonts: content waits, fixed header does not move, content-only 150ms fade');
  } finally { releaseFonts(); await context.close(); }

  // Every shared-shell document, small + large phones; compare with desktop.
  const pages = (await fs.readdir(site)).filter(name => name.endsWith('.html') && name !== 'referrals.html' && name !== 'transparency.html');
  for (const width of [320, 390, 430, 1440]) {
    const ctx = await browser.newContext({ viewport:{ width, height:1000 }, reducedMotion:'reduce' });
    await ctx.route('**/*', r => {
      const u = new URL(r.request().url());
      if (u.hostname === 'plugin.jup.ag') return r.fulfill({ contentType:'text/javascript', body:'window.Jupiter={init(){}};' });
      return allowed(u) ? r.continue() : r.abort();
    });
    const p = await ctx.newPage();
    for (const name of pages) {
      if (!(await fs.readFile(path.join(site, name), 'utf8')).includes('href="/bullen-ui.css')) continue;
      await p.goto(`${base}/${name === 'index.html' ? '' : name}`, { waitUntil:'domcontentloaded' });
      await p.waitForSelector('html.bullen-ready');
      await p.evaluate(() => document.fonts.ready);
      const shell = await p.locator('.bullen-site-shell').boundingBox();
      assert.equal(shell.y, 0, name); assert.equal(shell.height, width < 821 ? 58 : 64, name);
      assert.equal(await p.locator('.bullen-site-shell').count(), 1);
      if (width < 821) {
        const jump = await p.locator('.jumpto-btn').boundingBox();
        assert.equal(jump.width, 112, name); assert.equal(jump.height, 44, name);
        await p.locator('.bullen-nav-toggle').click();
        await p.waitForSelector('.bullen-site-shell.nav-open');
        await p.keyboard.press('Escape');
        assert.equal(await p.locator('.bullen-site-shell.nav-open').count(), 0);
      }
      if (width === 390 && ['index.html','thedrop.html','patchnotes.html'].includes(name)) await p.screenshot({ path:path.join(output, name + '.png') });
    }
    await ctx.close();
    console.log(`PASS ${width}px: all public page headers and controls have consistent geometry`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
