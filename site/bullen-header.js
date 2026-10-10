(() => {
  'use strict';
  const shell = document.querySelector('[data-bullen-header]');
  if (!shell) return;
  const root = document.documentElement;
  const exploreButton = shell.querySelector('#bullen-explore-button');
  const explorePanel = shell.querySelector('#bullen-explore-panel');
  const contentsButton = shell.querySelector('#bullen-contents-button');
  const contentsPanel = shell.querySelector('#bullen-contents-panel');
  const panels = [[exploreButton, explorePanel], [contentsButton, contentsPanel]].filter(([button,panel]) => button && panel);
  let lastTrigger = null;
  const returnFocus = button => {
    if (!button) return;
    const keyboard = root.dataset.focusNavigation === 'keyboard';
    button.focus({preventScroll:true});
    if (keyboard) root.dataset.focusNavigation = 'keyboard';
  };
  const closePanels = (restore = false) => {
    const trigger = lastTrigger;
    panels.forEach(([button,panel]) => { panel.hidden = true; button.setAttribute('aria-expanded','false'); });
    lastTrigger = null;
    if (restore) returnFocus(trigger);
  };
  panels.forEach(([button,panel]) => {
    button.addEventListener('click', () => {
      const opening = panel.hidden;
      closePanels();
      if (!opening) return;
      panel.hidden = false;
      panel.scrollTop = 0;
      button.setAttribute('aria-expanded','true');
      lastTrigger = button;
    });
    panel.addEventListener('click', event => { if (event.target.closest('a[href]')) closePanels(); });
  });
  shell.querySelector('.bullen-header-close').addEventListener('click', () => closePanels(true));
  document.addEventListener('pointerdown', event => { if (!shell.contains(event.target)) closePanels(); }, {passive:true});
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open], .bwc')) return;
    if (panels.some(([,panel]) => !panel.hidden)) { event.preventDefault(); closePanels(true); }
  });
  shell.addEventListener('focusout', () => requestAnimationFrame(() => {
    if (!shell.contains(document.activeElement)) closePanels();
  }));
  const compact = matchMedia('(max-width:820px)');
  const adapt = () => {
    const focusedInside = panels.some(([,panel]) => panel.contains(document.activeElement));
    closePanels(focusedInside);
    shell.querySelectorAll('.bullen-header-group').forEach((group,index) => { group.open = !compact.matches || index === 0; });
  };
  compact.addEventListener('change',adapt);
  // Desktop groups stay expanded; small screens keep them genuine disclosures.
  shell.querySelectorAll('.bullen-header-group > summary').forEach(summary => summary.addEventListener('click', event => {
    if (!compact.matches) event.preventDefault();
  }));
  adapt();
  addEventListener('pagehide',()=>closePanels());
  addEventListener('pageshow',()=>closePanels());
  // Do not leave a fixed directory over a wallet or native page dialog.
  new MutationObserver(() => {
    if (!panels.some(([,panel]) => !panel.hidden)) return;
    if (document.querySelector('dialog[open], .bwc') || document.body.matches('.vault-open,.lightbox-open,.wallet-modal-open,.bullen-mobile-buy-open,.explorer-expanded')) closePanels();
  }).observe(document.body,{attributes:true,attributeFilter:['class','open'],childList:true,subtree:true});
  const contentsLinks = contentsPanel ? [...contentsPanel.querySelectorAll('a[href^="#"]')] : [];
  let scheduled = false;
  const markSection = () => {
    scheduled = false;
    const threshold = shell.getBoundingClientRect().bottom + 100;
    let active = '';
    for (const link of contentsLinks) {
      const target = document.getElementById(link.hash.slice(1));
      if (target?.getClientRects().length && target.getBoundingClientRect().top <= threshold) active = link.hash;
    }
    for (const link of contentsLinks) {
      if (link.hash === active) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    }
  };
  document.addEventListener('scroll',()=>{if (!scheduled) {scheduled=true;requestAnimationFrame(markSection);}}, {passive:true,capture:true});
  markSection();
  shell.dataset.bullenHydrated = 'true';
})();
