(() => {
  'use strict';

  const PHANTOM_SWAP_BASE = 'https://phantom.app/ul/v1/swap/';
  const SOLFLARE_BROWSE_BASE = 'https://solflare.com/ul/v1/browse/';
  const SITE_URL = 'https://bullenciaga.com';
  let overlay = null;
  let returnFocus = null;
  let continueWithJupiter = null;

  function isMobileDevice() {
    const ua = navigator.userAgent || '';
    const touchMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac;
    const coarseTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return mobileUa || window.innerWidth <= 767 || (coarseTouch && window.innerWidth <= 1024);
  }

  function phantomSwapUrl(mint) {
    const buy = encodeURIComponent('solana:101/address:' + mint);
    return PHANTOM_SWAP_BASE + '?buy=' + buy + '&sell=';
  }

  function solflareBrowseUrl(jupiterUrl) {
    return SOLFLARE_BROWSE_BASE + encodeURIComponent(jupiterUrl) +
      '?ref=' + encodeURIComponent(SITE_URL);
  }

  function pumpUrl(mint) {
    return 'https://pump.fun/coin/' + encodeURIComponent(mint);
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value);
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error('Copy failed'));
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    document.body.classList.remove('bullen-mobile-buy-open');
    window.setTimeout(() => {
      overlay.hidden = true;
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
      returnFocus = null;
    }, 190);
  }

  function makeChoice(className, mark, title, detail, handler) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'bullen-mobile-buy__choice ' + className;
    choice.innerHTML =
      '<span class="bullen-mobile-buy__mark" aria-hidden="true">' + mark + '</span>' +
      '<span class="bullen-mobile-buy__choice-copy"><strong>' + title + '</strong><small>' + detail + '</small></span>' +
      '<span class="bullen-mobile-buy__arrow" aria-hidden="true">↗</span>';
    choice.addEventListener('click', handler);
    return choice;
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'bullen-mobile-buy';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bullen-mobile-buy-title');
    overlay.innerHTML =
      '<section class="bullen-mobile-buy__sheet">' +
        '<header class="bullen-mobile-buy__head">' +
          '<div><p class="bullen-mobile-buy__eyebrow">Mobile trade handoff</p>' +
          '<h2 class="bullen-mobile-buy__title" id="bullen-mobile-buy-title">Choose where to buy</h2></div>' +
          '<button class="bullen-mobile-buy__close" type="button" aria-label="Close">×</button>' +
        '</header>' +
        '<p class="bullen-mobile-buy__intro">We will open the trade inside your wallet so it can sign the swap. The $BULLEN contract is already filled in.</p>' +
        '<div class="bullen-mobile-buy__choices"></div>' +
        '<p class="bullen-mobile-buy__section-title">Other routes</p>' +
        '<div class="bullen-mobile-buy__utilities">' +
          '<a class="bullen-mobile-buy__utility" data-buy-pump target="_blank" rel="noopener noreferrer">Open Pump.fun</a>' +
          '<button class="bullen-mobile-buy__utility" data-buy-copy type="button">Copy contract</button>' +
          '<a class="bullen-mobile-buy__utility" data-buy-jupiter target="_blank" rel="noopener noreferrer">Jupiter web</a>' +
          '<button class="bullen-mobile-buy__utility" data-buy-cancel type="button">Not now</button>' +
        '</div>' +
        '<p class="bullen-mobile-buy__note">Using another wallet? Open bullenciaga.com inside its in-app browser, then choose “Already inside a wallet”. Never paste a seed phrase into this site.</p>' +
      '</section>';
    document.body.append(overlay);

    overlay.querySelector('.bullen-mobile-buy__close').addEventListener('click', close);
    overlay.querySelector('[data-buy-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay && !overlay.hidden) close();
    });
    return overlay;
  }

  function request(options) {
    if (!isMobileDevice()) return false;
    if (!options || !options.mint || !options.jupiterUrl) return false;

    const root = ensureOverlay();
    const choices = root.querySelector('.bullen-mobile-buy__choices');
    choices.replaceChildren();
    continueWithJupiter = typeof options.continueWithJupiter === 'function'
      ? options.continueWithJupiter
      : null;

    choices.append(
      makeChoice('bullen-mobile-buy__choice--phantom', 'P', 'Phantom', 'Open a native swap with $BULLEN selected', () => {
        window.location.assign(phantomSwapUrl(options.mint));
      }),
      makeChoice('bullen-mobile-buy__choice--solflare', 'S', 'Solflare', 'Open the Jupiter trade inside Solflare', () => {
        window.location.assign(solflareBrowseUrl(options.jupiterUrl));
      }),
      makeChoice('bullen-mobile-buy__choice--jupiter', 'J', 'Already inside a wallet', 'Use the embedded Jupiter swap here', () => {
        close();
        window.setTimeout(() => {
          if (continueWithJupiter) continueWithJupiter();
        }, 210);
      })
    );

    root.querySelector('[data-buy-pump]').href = pumpUrl(options.mint);
    root.querySelector('[data-buy-jupiter]').href = options.jupiterUrl;
    const copy = root.querySelector('[data-buy-copy]');
    copy.textContent = 'Copy contract';
    copy.onclick = () => {
      copyText(options.mint).then(() => {
        copy.textContent = 'Contract copied';
        window.setTimeout(() => { copy.textContent = 'Copy contract'; }, 1600);
      }).catch(() => {
        copy.textContent = 'Copy failed';
        window.setTimeout(() => { copy.textContent = 'Copy contract'; }, 1600);
      });
    };

    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('bullen-mobile-buy-open');
    root.hidden = false;
    window.requestAnimationFrame(() => {
      root.classList.add('is-open');
      root.querySelector('.bullen-mobile-buy__choice').focus();
    });
    return true;
  }

  window.BullenMobileBuy = { close, isMobileDevice, request };
})();
