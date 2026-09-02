(function () {
  'use strict';

  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const page = file.replace(/\.html$/, '') || 'index';
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
    ['lock', '/lock.html'],
    ['bullensaga', 'https://bullensaga.com/'],
  ];

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
    for (const [key, href] of destinations) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = labels[key];
      if (key === 'bullensaga') {
        link.className = 'bullen-site-sister';
        link.setAttribute('aria-label', 'Visit BULLENSAGA');
      }
      if (key === page) link.setAttribute('aria-current', 'page');
      nav.append(link);
    }
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
    nav.addEventListener('click', closeNav);
    if (extraButton) extraButton.addEventListener('click', closeNav);
    document.addEventListener('click', (event) => {
      if (shell.classList.contains('nav-open') && !shell.contains(event.target)) closeNav();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNav();
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

  if (page === 'index') {
    const jumpTo = document.getElementById('jumpToWidget');
    if (jumpTo) jumpTo.setAttribute('aria-label', 'Homepage section navigation');
    skip.after(buildShell(jumpTo));
  } else {
    skip.after(buildShell());
  }

  for (const button of document.querySelectorAll('button:not([type])')) {
    button.type = 'button';
  }
})();
