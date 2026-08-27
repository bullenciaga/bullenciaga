(function () {
  'use strict';

  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const page = file.replace(/\.html$/, '') || 'index';
  const labels = {
    index: 'Home',
    stats: 'Stats',
    chart: 'Chart',
    curve: 'Supply',
    proof: 'Proof',
    transparency: 'Moderation',
    refer: 'Referrals',
    referrals: 'Admin',
    thedrop: 'The Drop',
    giveaways: 'Giveaways',
  };
  const destinations = [
    ['giveaways', '/giveaways.html'],
    ['stats', '/stats.html'],
    ['chart', '/chart.html'],
    ['curve', '/curve.html'],
    ['proof', '/proof.html'],
    ['transparency', '/transparency.html'],
    ['refer', '/refer.html'],
    ['thedrop', '/thedrop.html'],
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

  const mountResponsiveNav = (shell, nav, extraControl) => {
    const actions = document.createElement('div');
    actions.className = 'bullen-site-actions';

    const navId = `bullen-public-nav-${page}`;
    nav.id = navId;
    actions.append(nav);
    if (extraControl) actions.append(extraControl);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'bullen-nav-toggle';
    toggle.setAttribute('aria-label', 'Open page navigation');
    toggle.setAttribute('aria-controls', navId);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    actions.append(toggle);
    shell.append(actions);

    const closeNav = () => {
      shell.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open page navigation');
    };

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = !shell.classList.contains('nav-open');
      shell.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close page navigation' : 'Open page navigation');
    });
    nav.addEventListener('click', closeNav);
    if (extraControl) {
      const extraButton = extraControl.querySelector('button');
      if (extraButton) extraButton.addEventListener('click', closeNav);
    }
    document.addEventListener('click', (event) => {
      if (shell.classList.contains('nav-open') && !shell.contains(event.target)) closeNav();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNav();
    });
  };

  if (page === 'index') {
    const shell = document.createElement('header');
    shell.className = 'bullen-site-shell bullen-home-shell';
    shell.append(buildBrand());
    const jumpTo = document.getElementById('jumpToWidget');
    if (jumpTo) jumpTo.setAttribute('aria-label', 'Homepage section navigation');
    mountResponsiveNav(shell, buildPublicNav(), jumpTo);
    skip.after(shell);
  } else {
    const shell = document.createElement('header');
    shell.className = `bullen-site-shell${page === 'referrals' ? ' is-admin' : ''}`;
    shell.append(buildBrand());

    if (page === 'referrals') {
      const admin = document.createElement('span');
      admin.className = 'bullen-site-admin-label';
      admin.textContent = 'unlisted admin surface';
      shell.append(admin);
    } else {
      mountResponsiveNav(shell, buildPublicNav());
    }

    if (page === 'stats') {
      const stage = document.getElementById('stage');
      if (stage) stage.prepend(shell);
      else skip.after(shell);
    } else {
      skip.after(shell);
    }
  }

  for (const button of document.querySelectorAll('button:not([type])')) {
    button.type = 'button';
  }
})();
