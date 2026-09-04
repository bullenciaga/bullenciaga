// Local browser QA: supply an existing Playwright module and Chromium binary.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const output = path.join(root, '.visual/house-record-002');
await fs.mkdir(output, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(site, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(`${site}/`)) { res.writeHead(403).end(); return; }
  const target = path.extname(file) ? file : `${file}.html`;
  try { const data = await fs.readFile(target); res.writeHead(200, { 'content-type': types[path.extname(target)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.VISUAL_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
const results = [];
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  // Never execute swap plugins or query live wallet/API services in local UI QA.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const measure = () => page.locator('.bullen-site-shell .jumpto-btn').evaluate(button => {
    const box = button.getBoundingClientRect(), css = getComputedStyle(button);
    const icon = button.querySelector('svg').getBoundingClientRect();
    const hamburger = document.querySelector('.bullen-nav-toggle').getBoundingClientRect();
    const brand = document.querySelector('.bullen-site-brand').getBoundingClientRect();
    return { width: box.width, height: box.height, font: css.fontSize, rightPadding: box.right - icon.right,
      gap: hamburger.left - box.right, brandGap: box.left - brand.right, viewport: innerWidth,
      right: hamburger.right, documentWidth: document.documentElement.scrollWidth, justify: css.justifyContent };
  });
  const goto = async route => {
    await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html.bullen-ready');
    await page.evaluate(() => document.fonts.ready);
  };
  for (const width of [320, 375, 390, 430, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await goto('/patchnotes');
    await page.getByRole('heading', { level: 1, name: 'More to explore. More to verify.' }).waitFor();
    const data = await measure();
    assert(data.documentWidth <= width, `Record overflows ${width}: ${JSON.stringify(data)}`);
    if (width <= 820) {
      assert.equal(data.width, 112); assert.equal(data.height, 44); assert.equal(data.font, '11px');
      assert(data.rightPadding >= 12); assert(data.gap >= 8); assert(data.brandGap >= 0, JSON.stringify(data)); assert(data.right <= width);
    }
    results.push({ page: 'patchnotes', ...data });
    if ([375, 1440].includes(width)) {
      await page.screenshot({ path: path.join(output, `edition-002-${width}.png`), fullPage: true });
      await page.screenshot({ path: path.join(output, `edition-002-top-${width}.png`) });
    }
    if (width <= 820) {
      const jump = page.locator('.jumpto-btn');
      await jump.click();
      await page.locator('.jumpto-widget.open .jumpto-menu').waitFor({ state: 'visible' });
      assert.equal(await jump.getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await jump.getAttribute('aria-expanded'), 'false');
      await page.locator('.bullen-nav-toggle').click();
      await page.locator('.bullen-site-shell.nav-open').waitFor();
      const labels = await page.locator('.bullen-mobile-nav-directory a').allTextContents();
      assert.deepEqual(labels, ['House Objects', 'House Record', 'Burn Reserve', 'Stats', 'Chart', 'The Tape', 'Curve', 'Referrals', 'The Drop', 'Living Ledger', 'Wallet Passport']);
      await page.locator('.bullen-nav-toggle').click();
    }
    await page.locator('.record-archive-card').click();
    await page.waitForURL('**/patchnotes-001');
    await page.getByRole('heading', { level: 1, name: '48 hours inside the House.' }).waitFor();
    assert(await page.locator('.record-archive-notice').isVisible());
    assert.equal(await page.locator('html').getAttribute('data-bullen-page'), 'patchnotes');
    assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
    if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(output, `archive-001-top-${width}.png`) });
    await page.locator('.record-archive-notice a').click();
    await page.waitForURL('**/patchnotes');
  }
  // Every existing public shared-shell page, including the home page's own control.
  await page.setViewportSize({ width: 375, height: 850 });
  for (const route of ['/', '/objects', '/lock', '/giveaways', '/stats', '/chart', '/tape', '/curve', '/refer', '/thedrop', '/ledger', '/passport', '/transparency', '/referrals']) {
    await goto(route);
    const data = await measure();
    assert.equal(data.width, 112, route); assert.equal(data.font, '11px', route);
    assert(data.rightPadding >= 12 && data.gap >= 8 && data.brandGap >= 0 && data.right <= 375, `${route}: controls overlap ${JSON.stringify(data)}`);
    results.push({ page: route, ...data });
    if (route === '/') await page.screenshot({ path: path.join(output, 'home-mobile-375.png') });
  }
  // Compare the desktop button with the unmodified release's CSS in the same browser.
  if (!process.env.VISUAL_BASE_URL) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await goto('/patchnotes');
    const after = await measure();
    const beforeCss = execFileSync('git', ['show', '0bad30a:site/bullen-ui.css'], { cwd: root, encoding: 'utf8' });
    await page.route('**/bullen-ui.css', route => route.fulfill({ contentType: 'text/css', body: beforeCss }));
    await goto('/patchnotes');
    assert.deepEqual(await measure(), after, 'Desktop Jump To styling must remain unchanged');
    results.push({ desktopUnchanged: true });
  }
  await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ pass: true, checks: results.length, output }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
