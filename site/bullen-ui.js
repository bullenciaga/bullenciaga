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

  // The homepage already has its own full navigation and brand masthead.
  if (page === 'index') return;

  const shell = document.createElement('header');
  shell.className = `bullen-site-shell${page === 'referrals' ? ' is-admin' : ''}`;

  const brand = document.createElement('a');
  brand.className = 'bullen-site-brand';
  brand.href = '/';
  brand.innerHTML = `BULLENCIAGA <span>${labels[page] || 'Public record'}</span>`;
  shell.append(brand);

  if (page === 'referrals') {
    const admin = document.createElement('span');
    admin.className = 'bullen-site-admin-label';
    admin.textContent = 'unlisted admin surface';
    shell.append(admin);
  } else {
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
    shell.append(nav);
  }

  if (page === 'stats') {
    const stage = document.getElementById('stage');
    if (stage) stage.prepend(shell);
    else skip.after(shell);
  } else {
    skip.after(shell);
  }

  for (const button of document.querySelectorAll('button:not([type])')) {
    button.type = 'button';
  }
})();
