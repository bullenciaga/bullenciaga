(function () {
  'use strict';

  const root = document.documentElement;
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const page = root.dataset.bullenPage || file.replace(/\.html$/, '') || 'index';
  const labels = {
    index: 'Home',
    stats: 'Stats',
    tape: 'The Tape',
    chart: 'Chart',
    curve: 'Curve',
    transparency: 'Moderation',
    refer: 'Referrals',
    referrals: 'Admin',
    thedrop: 'The Drop',
    giveaways: 'Giveaways',
    objects: 'House Objects',
    patchnotes: 'House Record',
    lock: 'Burn Reserve',
    ledger: 'Living Ledger',
    passport: 'Wallet Passport',
    bullensaga: 'BULLENSAGA',
  };
  const destinations = [
    ['objects', '/objects.html'],
    ['giveaways', '/giveaways.html'],
    ['stats', '/stats.html'],
    ['tape', '/tape.html'],
    ['chart', '/chart.html'],
    ['curve', '/curve.html'],
    ['refer', '/refer.html'],
    ['thedrop', '/thedrop.html'],
    ['patchnotes', '/patchnotes.html'],
    ['lock', '/lock.html'],
    ['ledger', '/ledger.html'],
    ['passport', '/passport.html'],
    ['bullensaga', 'https://bullensaga.com/'],
  ];
  const navigationGroups = [
    ['House', ['objects', 'lock', 'patchnotes', 'giveaways']],
    ['Market', ['stats', 'chart', 'tape', 'curve']],
    ['Explore', ['refer', 'thedrop', 'ledger', 'passport']],
  ];
  const mobileNavigationKeys = ['objects', 'patchnotes', 'lock', 'stats', 'chart', 'tape', 'curve', 'refer', 'thedrop', 'ledger', 'passport'];
  const destinationByKey = new Map(destinations);

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

  const buildPublicNav = () => {
    const nav = document.createElement('nav');
    nav.className = 'bullen-site-nav';
    nav.setAttribute('aria-label', 'BULLENCIAGA public pages');
    const buildLink = (key) => {
      const href = destinationByKey.get(key);
      const link = document.createElement('a');
      link.href = href;
      link.textContent = labels[key];
      if (key === 'bullensaga') {
        link.className = 'bullen-site-sister';
        link.setAttribute('aria-label', 'Visit BULLENSAGA');
      }
      if (key === page) link.setAttribute('aria-current', 'page');
      return link;
    };
    for (const [label, keys] of navigationGroups) {
      const group = document.createElement('details');
      group.className = `bullen-nav-group${keys.includes(page) ? ' is-active' : ''}`;
      const summary = document.createElement('summary');
      summary.textContent = label;
      summary.setAttribute('aria-label', `${label} pages`);
      const menu = document.createElement('div');
      menu.className = 'bullen-nav-group-menu';
      for (const key of keys) menu.append(buildLink(key));
      group.append(summary, menu);
      nav.append(group);
    }
    const mobileDirectory = document.createElement('div');
    mobileDirectory.className = 'bullen-mobile-nav-directory';
    for (const key of mobileNavigationKeys) mobileDirectory.append(buildLink(key));
    nav.append(mobileDirectory);
    nav.append(buildLink('bullensaga'));
    return nav;
  };

  const buildBrand = () => {
    const brand = document.createElement('a');
    brand.className = 'bullen-site-brand';
    brand.href = '/';
    brand.innerHTML = `BULLENCIAGA <span>${labels[page] || 'Public record'}</span>`;
    if (page === 'index') brand.setAttribute('aria-current', 'page');
    return brand;
  };

  const buildPageJumpTo = () => {
    const widget = document.createElement('div');
    widget.className = 'jumpto-widget bullen-page-jumpto';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jumpto-btn';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = 'JUMP TO <svg class="jumpto-chevron" viewBox="0 0 8 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l5 5-5 5"/></svg>';

    const menu = document.createElement('div');
    menu.className = 'jumpto-menu';
    const menuId = `bullen-page-jumpto-${page}`;
    menu.id = menuId;
    button.setAttribute('aria-controls', menuId);

    const homeSections = [
      ['/#giveaway', 'Giveaway'],
      ['/#stats', 'Live Stats'],
      ['/#how-to-buy', 'How To Buy'],
      ['/#nft', 'The Herd Collection'],
      ['/#gallery', 'Browse The Herd'],
      ['/#roadmap', 'Roadmap'],
      ['/#faq', 'FAQ'],
    ];
    const elsewhere = [
      ['https://bullenciaga.com/jupiter_vrfd', 'Jupiter Verification'],
      ['https://x.com/bullenciagax', 'X Profile'],
      ['https://bullenciaga.com/chat', 'X Chat'],
      ['https://t.me/bullenciaga', 'Telegram'],
      ['https://pump.fun/profile/bullenciagax', 'pump.fun'],
      ['https://www.tensor.trade/trade/bullenciaga', 'Tensor'],
      ['https://magiceden.io/marketplace/bullenciaga', 'Magic Eden'],
      ['https://gravemarket.io/collection/bullenciaga', 'GraveMarket'],
      ['/whitepaper', 'Whitepaper'],
    ];
    const listings = [
      ['https://www.coingecko.com/coins/bullen', 'CoinGecko'],
      ['https://www.geckoterminal.com/solana/pools/9MP131fa3jir94azmVHZdwQww2Ma9aLtzQUG6CJdV6TZ', 'GeckoTerminal'],
      ['https://dexscreener.com/solana/9MP131fa3jir94azmVHZdwQww2Ma9aLtzQUG6CJdV6TZ', 'DexScreener'],
      ['https://www.dextools.io/app/token/bullenciaga', 'DEXTools'],
      ['https://coinpaprika.com/coin/bullen-bullenciaga/', 'CoinPaprika'],
      ['https://dexpaprika.com/solana/token/BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN', 'DexPaprika'],
      ['https://blockspot.io/coin/bullenciaga-bullen/', 'Blockspot'],
    ];

    const rebuild = () => {
      menu.replaceChildren();
      const appendGroup = (label, items, external = false) => {
        if (menu.children.length) {
          const divider = document.createElement('div');
          divider.className = 'jumpto-divider';
          menu.append(divider);
        }
        const groupLabel = document.createElement('div');
        groupLabel.className = 'jumpto-group-label';
        groupLabel.textContent = label;
        menu.append(groupLabel);
        for (const [href, text] of items) {
          const link = document.createElement('a');
          link.className = 'jumpto-item';
          link.href = href;
          link.textContent = text;
          if (external) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const mark = document.createElement('span');
            mark.className = 'jumpto-item-ext';
            mark.textContent = '↗';
            link.append(mark);
          }
          menu.append(link);
        }
      };
      appendGroup('On BULLENCIAGA', homeSections);
      appendGroup('Elsewhere', elsewhere, true);
      appendGroup('Listings & Data', listings, true);
    };

    const close = () => {
      widget.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    };
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = !widget.classList.contains('open');
      if (open) rebuild();
      widget.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) close();
    });
    document.addEventListener('click', (event) => {
      if (widget.classList.contains('open') && !widget.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    rebuild();
    widget.append(button, menu);
    return widget;
  };

  const mountResponsiveNav = (shell, bar, nav, extraControl) => {
    const actions = document.createElement('div');
    actions.className = 'bullen-site-actions';

    const navId = `bullen-public-nav-${page}`;
    nav.id = navId;
    actions.append(nav);

    const auxiliary = document.createElement('div');
    auxiliary.className = 'bullen-site-aux';
    if (extraControl) auxiliary.append(extraControl);
    actions.append(auxiliary);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'bullen-nav-toggle';
    toggle.setAttribute('aria-label', 'Open page navigation');
    toggle.setAttribute('aria-controls', navId);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    actions.append(toggle);
    bar.append(actions);

    const extraButton = extraControl ? extraControl.querySelector('button') : null;
    const closeExtraControl = () => {
      if (!extraControl) return;
      extraControl.classList.remove('open');
      if (extraButton) extraButton.setAttribute('aria-expanded', 'false');
    };

    const closeNav = () => {
      shell.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open page navigation');
    };

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = !shell.classList.contains('nav-open');
      if (open) closeExtraControl();
      shell.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close page navigation' : 'Open page navigation');
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeNav();
    });
    nav.addEventListener('toggle', (event) => {
      const opened = event.target;
      if (!opened.matches('.bullen-nav-group[open]')) return;
      closeExtraControl();
      for (const group of nav.querySelectorAll('.bullen-nav-group[open]')) {
        if (group !== opened) group.removeAttribute('open');
      }
    }, true);
    if (extraButton) extraButton.addEventListener('click', () => {
      closeNav();
      for (const group of nav.querySelectorAll('.bullen-nav-group[open]')) group.removeAttribute('open');
    });
    document.addEventListener('click', (event) => {
      if (shell.classList.contains('nav-open') && !shell.contains(event.target)) closeNav();
      if (!nav.contains(event.target)) {
        for (const group of nav.querySelectorAll('.bullen-nav-group[open]')) group.removeAttribute('open');
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeNav();
        for (const group of nav.querySelectorAll('.bullen-nav-group[open]')) group.removeAttribute('open');
      }
    });
  };

  const buildShell = (extraControl) => {
    const shell = document.createElement('header');
    shell.className = `bullen-site-shell${page === 'index' ? ' bullen-home-shell' : ''}${page === 'referrals' ? ' is-admin' : ''}`;

    const bar = document.createElement('div');
    bar.className = 'bullen-site-bar';
    bar.append(buildBrand());
    shell.append(bar);
    mountResponsiveNav(shell, bar, buildPublicNav(), extraControl);
    return shell;
  };

  const jumpTo = page === 'index' ? document.getElementById('jumpToWidget') : buildPageJumpTo();
  if (jumpTo) jumpTo.setAttribute('aria-label', `${labels[page] || 'Page'} section navigation`);
  skip.after(buildShell(jumpTo));

  for (const button of document.querySelectorAll('button:not([type])')) {
    button.type = 'button';
  }

  /* Warm same-origin page navigations as soon as a person indicates intent.
     Browsers that do not support document prefetch simply ignore the hint. */
  const prefetched = new Set();
  const prefetchPage = (event) => {
    const anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || url.href === location.href || prefetched.has(url.href)) return;
    if (!/^\/$|\.html$|^\/(?:objects|giveaways|stats|tape|chart|curve|refer|thedrop|patchnotes|lock|ledger|passport)\/?$/i.test(url.pathname)) return;
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

  /* Build the complete shell while only the page content is held at opacity
     zero, then reveal that content after the House fonts settle (or a short safety cap).
     The inline boot timer remains an independent fail-open path. */
  const reveal = () => {
    clearTimeout(window.__BULLEN_BOOT_TIMER);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.remove('bullen-booting');
      root.classList.add('bullen-ready');
    }));
  };
  const fontGate = document.fonts && document.fonts.ready
    ? document.fonts.ready.catch(() => undefined)
    : Promise.resolve();
  Promise.race([
    fontGate,
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]).then(reveal, reveal);
})();
