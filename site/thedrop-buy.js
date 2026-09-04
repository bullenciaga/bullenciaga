(() => {
  'use strict';

  const button = document.getElementById('buyBullen');
  if (!button) return;
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const BULLEN_MINT = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
  const JUPITER_FALLBACK = 'https://jup.ag/swap?buy=' + BULLEN_MINT + '&sell=' + SOL_MINT;

  // Same swap configuration as the home page and The Tape. The shared House
  // stylesheet supplies Jupiter's palette; mobile-buy owns wallet selection.
  function openJupiterSwap() {
    if (!window.Jupiter || typeof window.Jupiter.init !== 'function') {
      window.open(JUPITER_FALLBACK, '_blank', 'noopener,noreferrer');
      return;
    }
    window.Jupiter.init({
      displayMode: 'modal',
      formProps: {
        initialInputMint: SOL_MINT,
        initialOutputMint: BULLEN_MINT,
        fixedMint: BULLEN_MINT,
        fixedAmount: false,
        swapMode: 'ExactIn'
      },
      branding: { logoUri: 'https://bullenciaga.com/logo-200.png', name: 'BULLENCIAGA' }
    });
  }

  button.addEventListener('click', event => {
    // Preserve the real prefilled href for deliberate new-tab navigation.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (window.BullenMobileBuy && window.BullenMobileBuy.request({
      mint: BULLEN_MINT,
      jupiterUrl: JUPITER_FALLBACK,
      continueWithJupiter: openJupiterSwap
    })) return;
    openJupiterSwap();
  });
})();
