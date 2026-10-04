(() => {
  'use strict';
  const install = () => {
    // Keep previously shared tutorial links useful after moving buying to /buy.
    const redirectLegacyBuy = () => {
      if (!['/', '/index.html'].includes(location.pathname) || location.hash !== '#how-to-buy') return false;
      location.replace('/buy' + location.search);
      return true;
    };
    if (redirectLegacyBuy()) return;
    const root = document.documentElement;
    const markEntry = () => {
      const state = history.state;
      if (!state || (typeof state === 'object' && !Array.isArray(state))) {
        const position = getComputedStyle(root).getPropertyValue('--bullen-scroll-surface').trim() === 'body'
          ? true : { y: window.scrollY };
        history.replaceState({ ...state, __bullenFragmentNavigation: position }, '');
      }
    };
    if (!history.state?.__bullenFragmentNavigation) markEntry();
    /* One fragment navigator for static links and the rebuilt Jump To menus.
       Explicit instant writes avoid starting a second CSS smooth-scroll on
       every animation frame. Keep a destination aligned through late fonts,
       images and gallery data, but surrender immediately to user interaction. */
    const fragmentTarget = (hash) => {
      if (!hash || hash === '#') return null;
      try { return document.getElementById(decodeURIComponent(hash.slice(1))); }
      catch (_) { return null; }
    };
    const scrollSurface = () => getComputedStyle(root).getPropertyValue('--bullen-scroll-surface').trim() === 'body'
      ? document.body : window;
    const scrollY = () => scrollSurface() === window ? window.scrollY : document.body.scrollTop;
    const writeScroll = (top) => scrollSurface().scrollTo({ top, behavior: 'instant' });
    const destinationY = (target) => {
      const shell = document.querySelector('header[data-bullen-shell], header');
      const railBottom = shell && ['fixed', 'sticky'].includes(getComputedStyle(shell).position) ? shell.getBoundingClientRect().bottom : 0;
      const clearance = Math.max(railBottom + 12,
        (parseFloat(getComputedStyle(root).scrollPaddingTop) || 0) + (parseFloat(getComputedStyle(target).scrollMarginTop) || 0));
      const surface = scrollSurface() === window ? document.scrollingElement : document.body;
      const height = scrollSurface() === window ? innerHeight : surface.clientHeight;
      return Math.max(0, Math.min(target.getBoundingClientRect().top + scrollY() - clearance, surface.scrollHeight - height));
    };
    let destination = null, animation = 0, alignment = 0, observer = null;
    const cancelFragment = () => {
      cancelAnimationFrame(animation);
      cancelAnimationFrame(alignment);
      animation = alignment = 0;
      observer?.disconnect();
      observer = null;
      destination = null;
    };
    const alignFragment = () => {
      if (!destination || animation || alignment) return;
      alignment = requestAnimationFrame(() => {
        alignment = 0;
        if (!destination?.isConnected || !destination.getClientRects().length) return;
        const top = destinationY(destination);
        if (Math.abs(scrollY() - top) > 1) writeScroll(top);
      });
    };
    const followFragment = (target, animate) => {
      cancelFragment();
      if (!target || !target.getClientRects().length) return;
      destination = target;
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(alignFragment);
        // Body itself has a fixed height on iPhone Chrome. Observe the sections
        // above the destination as well, including the asynchronously filled grid.
        for (let element = target; element && element !== root; element = element.parentElement) {
          observer.observe(element);
          for (let previous = element.previousElementSibling; previous; previous = previous.previousElementSibling) {
            observer.observe(previous);
          }
        }
      }
      if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        writeScroll(destinationY(target));
        return;
      }
      const from = scrollY(), started = performance.now(), duration = 240;
      const step = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        const ease = 1 - Math.pow(1 - progress, 3);
        writeScroll(from + (destinationY(target) - from) * ease);
        animation = progress < 1 ? requestAnimationFrame(step) : 0;
      };
      animation = requestAnimationFrame(step);
    };
    for (const event of ['wheel', 'touchstart', 'pointerdown']) {
      document.addEventListener(event, cancelFragment, { passive: true, capture: true });
    }
    document.addEventListener('click', markEntry, true);
    document.addEventListener('keydown', (event) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab', 'Escape'].includes(event.key)) cancelFragment();
    }, true);
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      let url;
      try { url = new URL(anchor.href, location.href); } catch (_) { return; }
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
      const target = fragmentTarget(url.hash);
      if (!target) return; // Leave wallet/chart fragments and non-section links alone.
      event.preventDefault();
      window.__CLOSE_PAGE_OVERLAYS__?.();
      if (url.hash !== location.hash) {
        const state = history.state;
        const next = scrollSurface() === document.body && (!state || (typeof state === 'object' && !Array.isArray(state)))
          ? { ...state, __bullenScroll: { x: document.body.scrollLeft, y: destinationY(target) } } : state;
        history.pushState(next, '', url.href);
      }
      followFragment(target, true);
      // Keyboard users should continue from the section, not the closed menu.
      if (event.detail === 0) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
    let restoringHistory = false, checkpoint = 0;
    addEventListener('scroll', () => {
      if (restoringHistory || scrollSurface() !== window || checkpoint) return;
      checkpoint = setTimeout(() => { checkpoint = 0; if (!restoringHistory) markEntry(); }, 500);
    }, { passive: true });
    addEventListener('popstate', (event) => {
      cancelFragment();
      clearTimeout(checkpoint);
      checkpoint = 0;
      // Assigning location.hash also fires popstate, with a new unmarked entry.
      // Only traversal to an entry we have seen should restore a reading position.
      restoringHistory = Boolean(event.state?.__bullenFragmentNavigation);
      const saved = event.state?.__bullenFragmentNavigation;
      requestAnimationFrame(() => {
        // Stop native CSS smooth scrolling during Back/Forward. The existing
        // iPhone helper restores its independent body-scroll checkpoint.
        if (scrollSurface() === window && Number.isFinite(saved?.y)) writeScroll(saved.y);
        requestAnimationFrame(() => { restoringHistory = false; });
      });
    });
    addEventListener('hashchange', () => {
      if (redirectLegacyBuy()) return;
      if (!restoringHistory) followFragment(fragmentTarget(location.hash), false);
      if (!restoringHistory) markEntry();
    });
    addEventListener('pagehide', () => { clearTimeout(checkpoint); checkpoint = 0; restoringHistory = false; cancelFragment(); });
    addEventListener('resize', alignFragment);
    // The browser may resolve an initial fragment again after our first frame.
    // User scroll gestures already cancel following before their scroll event.
    document.addEventListener('scroll', alignFragment, { passive: true, capture: true });
    document.addEventListener('load', alignFragment, true);
    document.fonts?.ready.then(alignFragment);
    // Back/reload retain the reader's position, even after they scrolled away
    // from a fragment. A new document visit follows its requested destination.
    const navigationType = performance.getEntriesByType('navigation')[0]?.type;
    if (navigationType !== 'back_forward' && navigationType !== 'reload') {
      followFragment(fragmentTarget(location.hash), false);
    }

  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
