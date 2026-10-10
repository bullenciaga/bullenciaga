(function () {
  'use strict';
  const root = document.documentElement;
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const page = root.dataset.bullenPage || file.replace(/\.html$/, '') || 'index';
  root.dataset.bullenPage = page;
  document.body.dataset.bullenPage = page;
  const mainTarget = document.querySelector('main, #stage, .wrap, h1');
  if (mainTarget) {
    if (!mainTarget.id) mainTarget.id = 'main-content';
    mainTarget.dataset.bullenMain = '';
    mainTarget.setAttribute('tabindex', '-1');
    if (!mainTarget.matches('main, h1')) mainTarget.setAttribute('role', 'main');
  }

  const skip = document.createElement('a');
  skip.className = 'bullen-skip';
  skip.href = mainTarget ? `#${mainTarget.id}` : '#';
  skip.textContent = 'Skip to content';
  document.body.prepend(skip);

  // Header markup is prerendered for every document; bullen-header.js binds
  // the same controls in place without moving or replacing the finished rail.
  for (const button of document.querySelectorAll('button:not([type])')) button.type = 'button';

  /* Warm same-origin page navigations as soon as a person indicates intent.
     Browsers that do not support document prefetch simply ignore the hint. */
  const prefetched = new Set();
  const prefetchPage = (event) => {
    const anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    url.hash = '';
    if (prefetched.has(url.href)) return;
    if (!/^\/$|\.html$|^\/(?:objects|giveaways|stats|tape|chart|curve|refer|thedrop|patchnotes|lock|ledger|passport|rooms)\/?$/i.test(url.pathname)) return;
    prefetched.add(url.href);
    const hint = document.createElement('link');
    hint.rel = 'prefetch';
    hint.as = 'document';
    hint.href = url.href;
    document.head.append(hint);
  };
  document.addEventListener('pointerover', prefetchPage, { passive: true });
  document.addEventListener('touchstart', prefetchPage, { passive: true });
  document.addEventListener('focusin', prefetchPage);

  /* Settle fonts before revealing the payload. If mobile font delivery times
     out, the inline reveal helper disables the font sheet for this document:
     a late face must never replace a fallback after content is visible.
     The independent boot deadline uses the same fallback if this script stalls. */
  const reveal = (fontsReady) => {
    clearTimeout(window.__BULLEN_BOOT_TIMER);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (window.__BULLEN_RESTORE_SCROLL) window.__BULLEN_RESTORE_SCROLL();
      window.__BULLEN_REVEAL(fontsReady);
    }));
  };
  const mobilePaint = matchMedia('(max-width: 820px)').matches;
  const fontGate = document.fonts && document.fonts.ready
    ? Promise.all(mobilePaint ? [
      document.fonts.load('600 12px Poppins'),
      document.fonts.load('400 11px "Space Mono"'),
      document.fonts.load('700 11px "Space Mono"'),
    ] : []).then(() => document.fonts.ready).then(() => true, () => false)
    : Promise.resolve(false);
  Promise.race([
    fontGate,
    new Promise((resolve) => setTimeout(() => resolve(false), mobilePaint ? 2500 : 500)),
  ]).then(reveal, () => reveal(false));
})();
