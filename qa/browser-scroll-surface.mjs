// Functional checks for the iPhone Chrome body-scroll surface.
// Requires Playwright. Desktop browser engines do not reproduce native iOS UI.
// Requests outside the target origin and all non-GET/HEAD requests are blocked.
// No real wallet is connected, signed with, or used for a transaction.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8798').replace(/\/$/, '');
const origin = new URL(base).origin;
const evidence = process.env.SCROLL_EVIDENCE || '/tmp/bullen-scroll-surface.json';
const engines = (process.env.CHECK_ENGINES || 'chromium,webkit').split(',');
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.8010.24 Mobile/15E148 Safari/604.1';
const results = [];
const persist = async () => {
  await fs.mkdir(path.dirname(evidence), { recursive: true });
  await fs.writeFile(evidence, JSON.stringify({
    base,
    nativeIPhoneVerified: false,
    limitations: 'Functional browser-engine checks only. Keyboard uses viewport resizing; mobile WebKit has no wheel gesture emulation. Third-party services are blocked.',
    results,
  }, null, 2));
};

for (const engine of engines) {
  assert(['chromium', 'webkit'].includes(engine), 'CHECK_ENGINES must contain chromium or webkit');
  const browser = await (engine === 'webkit'
    ? webkit.launch()
    : chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE }));
  try {
    const context = await browser.newContext({
      viewport: { width: 440, height: 766 },
      userAgent,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    await context.route('**/*', route => {
      const request = route.request();
      return new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method())
        ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6500);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => {
      const header = document.querySelector('header[data-bullen-shell]').getBoundingClientRect();
      return {
        url: location.href,
        windowY: window.scrollY,
        rootY: document.documentElement.scrollTop,
        bodyY: document.body.scrollTop,
        rootHeight: document.documentElement.scrollHeight,
        bodyHeight: document.body.scrollHeight,
        clientHeight: document.body.clientHeight,
        innerHeight,
        overflow: getComputedStyle(document.body).overflowY,
        header: { y: header.y, height: header.height },
      };
    });
    const ready = () => page.waitForFunction(() => document.documentElement.classList.contains('bullen-ready'));
    const load = async route => {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await ready();
      await page.waitForTimeout(230);
    };
    const scroll = top => page.evaluate(y => document.body.scrollTo({ top: y, behavior: 'instant' }), top);
    const check = async (test, run) => {
      try { results.push({ engine, test, ...await run() }); }
      catch (error) { results.push({ engine, test, pass: false, error: error.message }); }
      await persist();
    };

    await check('home custom anchor easing', async () => {
      await load('/');
      const before = await state();
      await page.locator('#contractBtn').click();
      await page.waitForTimeout(400);
      const middle = await state();
      await page.waitForTimeout(1200);
      const after = await state();
      const targetY = await page.locator('#nft').evaluate(element => element.getBoundingClientRect().top);
      return { before, middle, after, targetY, pass: middle.bodyY > 0 && after.bodyY > middle.bodyY && after.windowY === 0 && Math.abs(targetY) < 3 };
    });
    await check('initial gallery hash', async () => {
      await load('/#gallery');
      await page.waitForTimeout(1400);
      const current = await state();
      const targetY = await page.locator('#gallery').evaluate(element => element.getBoundingClientRect().top);
      return { state: current, targetY, pass: current.bodyY > 100 && current.windowY === 0 && targetY >= 0 && targetY < 120 };
    });
    await check('menu while body scrolled', async () => {
      await page.locator('.bullen-nav-toggle').click();
      const visible = await page.locator('.bullen-mobile-nav-directory a[href="/buy"]').isVisible();
      const current = await state();
      return { state: current, visible, pass: visible && current.header.y === 0 && current.windowY === 0 };
    });
    await check('focused input and simulated keyboard viewport', async () => {
      await page.locator('.bullen-nav-toggle').click();
      await page.locator('#gallerySearch').fill('123');
      try {
        await page.setViewportSize({ width: 440, height: 420 });
        await page.locator('#gallerySearch').evaluate(element => element.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(350);
        const current = await state();
        const rect = await page.locator('#gallerySearch').boundingBox();
        const focused = await page.locator('#gallerySearch').evaluate(element => element === document.activeElement);
        return { state: current, rect, focused, pass: focused && current.windowY === 0 && current.header.y === 0 && rect.y >= 58 && rect.y + rect.height <= 420 };
      } finally { await page.setViewportSize({ width: 440, height: 766 }); }
    });
    await check('buy detected-wallet scrollIntoView without connecting', async () => {
      await load('/buy');
      // Presence-only test double: it has no connect/sign methods or keys.
      await page.evaluate(() => { window.phantom = { solana: { isPhantom: true } }; });
      await page.locator('[data-wallet="phantom"]').click();
      await page.waitForTimeout(1200);
      const current = await state();
      const targetY = await page.locator('#swap-heading').evaluate(element => element.getBoundingClientRect().top);
      return { state: current, targetY, notice: await page.locator('#copy-status').textContent(), pass: current.windowY === 0 && targetY >= 55 && targetY < 130 };
    });
    await check('mobile buy modal locks body', async () => {
      await load('/patchnotes');
      await page.locator('#buyBullen').click();
      await page.waitForTimeout(300);
      const locked = await state();
      const shown = await page.locator('.bullen-mobile-buy').isVisible();
      await page.mouse.move(25, 600);
      // WebKit mobile cannot generate wheel gestures. Its check verifies the
      // scroll-lock styles; this does not claim a native finger-gesture test.
      if (engine === 'chromium') await page.mouse.wheel(0, 450);
      await page.waitForTimeout(250);
      const afterWheel = await state();
      await page.locator('.bullen-mobile-buy__close').click();
      await page.waitForTimeout(250);
      const unlocked = await state();
      return { locked, afterWheel, unlocked, shown, pass: shown && locked.overflow === 'hidden' && afterWheel.bodyY === locked.bodyY && unlocked.overflow === 'auto' };
    });
    await check('back-forward body scroll restoration', async () => {
      await load('/patchnotes');
      await scroll(1200);
      await page.waitForTimeout(300);
      const from = await state();
      await page.locator('.bullen-nav-toggle').click();
      await page.locator('.bullen-mobile-nav-directory a[href="/buy"]').click();
      await ready();
      await scroll(500);
      await page.waitForTimeout(300);
      const to = await state();
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await ready();
      await page.waitForTimeout(350);
      const back = await state();
      await page.goForward({ waitUntil: 'domcontentloaded' });
      await ready();
      await page.waitForTimeout(350);
      const forward = await state();
      return { from, to, back, forward, pass: Math.abs(back.bodyY - from.bodyY) < 3 && Math.abs(forward.bodyY - to.bodyY) < 3 && back.windowY === 0 && forward.windowY === 0 };
    });
    await check('reload body position and unrelated history state', async () => {
      await load('/patchnotes');
      await page.evaluate(() => {
        history.replaceState({ ...history.state, unrelated: 'preserve' }, '');
        document.body.scrollTo({ top: 1100, behavior: 'instant' });
      });
      const before = await state();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      await page.waitForTimeout(300);
      const after = await state();
      const historyState = await page.evaluate(() => history.state);
      return { before, after, historyState, pass: Math.abs(before.bodyY - after.bodyY) < 3 && historyState?.unrelated === 'preserve' && after.windowY === 0 };
    });
    await check('record CSS anchor smoothness and same-document Back', async () => {
      await load('/patchnotes');
      await page.locator('.record-sections').scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      const before = await state();
      await page.locator('.record-sections a[href="#archive"]').click();
      await page.waitForTimeout(130);
      const middle = await state();
      await page.waitForTimeout(1100);
      const after = await state();
      await page.goBack();
      await page.waitForTimeout(1100);
      const back = await state();
      const smooth = middle.bodyY > before.bodyY && middle.bodyY < after.bodyY;
      return { before, middle, after, back, smooth, pass: smooth && Math.abs(back.bodyY - before.bodyY) < 3 && back.windowY === 0 };
    });
    await check('chart plot and body scroll isolation', async () => {
      await load('/chart');
      await scroll(200);
      await page.waitForTimeout(200);
      const before = await state();
      const plot = await page.locator('#plotWrap').boundingBox();
      await page.mouse.move(15, 700);
      if (engine === 'chromium') await page.mouse.wheel(0, 300);
      else await scroll(before.bodyY + 300);
      await page.waitForTimeout(300);
      const after = await state();
      return { before, after, plot, pass: before.windowY === 0 && after.windowY === 0 && after.header.y === 0 && plot.width > 0 };
    });
    await check('tape page independent body scroll', async () => {
      await load('/tape');
      await scroll(400);
      const before = await state();
      const tape = await page.locator('#tradeTape').evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflow: getComputedStyle(element).overflowY }));
      await page.mouse.move(20, 700);
      if (engine === 'chromium') await page.mouse.wheel(0, 500);
      else await scroll(before.bodyY + 500);
      await page.waitForTimeout(350);
      const after = await state();
      return { before, after, tape, pass: after.bodyY > before.bodyY && after.windowY === 0 && after.header.y === 0 };
    });
    for (const width of [320, 440]) {
      await check('transparent stats ' + width, async () => {
        await page.setViewportSize({ width, height: 766 });
        await load('/stats?transparent=1');
        await scroll(250);
        const current = await state();
        const transparent = await page.evaluate(() => ({
          root: getComputedStyle(document.documentElement).backgroundColor,
          body: getComputedStyle(document.body).backgroundColor,
          rootClass: document.documentElement.className,
          bodyClass: document.body.className,
          rootWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        return { state: current, transparent, pass: current.windowY === 0 && current.rootHeight === current.innerHeight && transparent.root === 'rgba(0, 0, 0, 0)' && transparent.body === 'rgba(0, 0, 0, 0)' && transparent.rootWidth === transparent.clientWidth };
      });
    }
    results.push({ engine, pageErrors: errors });
    await persist();
  } finally { await browser.close(); }
}
const checks = results.filter(result => 'test' in result);
const failures = checks.filter(result => result.pass !== true);
console.log(JSON.stringify({ checks: checks.length, passed: checks.length - failures.length, failures, evidence }, null, 2));
assert.equal(failures.length, 0, 'scroll surface interaction checks failed; see evidence');
