(function () {
  'use strict';

  function canonicalUrl() {
    var origin = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? 'https://bullenciaga.com' : location.origin;
    return origin + location.pathname + location.search;
  }
  function encodedUrl() { return encodeURIComponent(canonicalUrl()); }
  function encodedRef() { return encodeURIComponent('https://bullenciaga.com'); }

  var wallets = [
    { id:'phantom', name:'Phantom', provider:function(){ return window.phantom && window.phantom.solana || (window.solana && window.solana.isPhantom ? window.solana : null); }, link:function(){ return 'https://phantom.app/ul/browse/' + encodedUrl() + '?ref=' + encodedRef(); }, install:'https://phantom.app/' },
    { id:'solflare', name:'Solflare', provider:function(){ return window.solflare && typeof window.solflare.connect === 'function' ? window.solflare : null; }, link:function(){ return 'https://solflare.com/ul/v1/browse/' + encodedUrl() + '?ref=' + encodedRef(); }, install:'https://solflare.com/' },
    { id:'backpack', name:'Backpack', provider:function(){ return window.backpack && typeof window.backpack.connect === 'function' ? window.backpack : null; }, link:function(){ return 'https://backpack.app/ul/v1/browse/' + encodedUrl() + '?ref=' + encodedRef(); }, install:'https://backpack.app/' },
    { id:'coinbase', name:'Coinbase Wallet', provider:function(){ return window.coinbaseSolana || (window.coinbaseWalletExtension && window.coinbaseWalletExtension.solana) || null; }, link:function(){ return 'https://go.cb-w.com/dapp?cb_url=' + encodedUrl(); }, install:'https://www.coinbase.com/wallet' },
    { id:'trust', name:'Trust Wallet', provider:function(){ return window.trustwallet && window.trustwallet.solana || (window.solana && window.solana.isTrust ? window.solana : null); }, link:function(){ return 'https://link.trustwallet.com/open_url?coin_id=501&url=' + encodedUrl(); }, install:'https://trustwallet.com/' },
    { id:'okx', name:'OKX Wallet', provider:function(){ return window.okxwallet && window.okxwallet.solana || null; }, link:function(){ return 'https://web3.okx.com/download?deeplink=' + encodeURIComponent('okx://wallet/dapp/url?dappUrl=' + encodedUrl()); }, install:'https://www.okx.com/web3' },
    { id:'glow', name:'Glow', provider:function(){ return window.glow || window.glowSolana || null; }, link:function(){ return 'https://glow.app/link/browse/' + encodedUrl(); }, install:'https://glow.app/' }
  ];

  function injectStyle() {
    if (document.getElementById('bullenWalletChooserStyle')) return;
    var style = document.createElement('style');
    style.id = 'bullenWalletChooserStyle';
    style.textContent = '.bwc{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Space Mono,monospace}.bwc[hidden]{display:none}.bwc-back{position:absolute;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(10px)}.bwc-card{position:relative;width:min(430px,100%);border:1px solid rgba(199,168,105,.45);background:#080706;color:#f5f3ee;box-shadow:0 40px 120px #000}.bwc-head{display:flex;align-items:center;justify-content:space-between;padding:22px 24px;border-bottom:1px solid rgba(199,168,105,.2)}.bwc-head b{color:#e8d9ae;font-size:10px;letter-spacing:.18em;font-weight:400}.bwc-close{border:0;background:none;color:#918d85;font-size:24px;cursor:pointer}.bwc-list{display:grid;padding:10px}.bwc-row{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:12px;min-height:58px;padding:0 12px;border:1px solid transparent;background:transparent;color:#f5f3ee;text-decoration:none;text-align:left;cursor:pointer}.bwc-row:hover{border-color:rgba(199,168,105,.36);background:rgba(199,168,105,.06)}.bwc-icon{display:grid;place-items:center;width:28px;height:28px;border:1px solid rgba(199,168,105,.42);border-radius:50%;color:#c7a869;font-size:10px}.bwc-name{font-size:11px;letter-spacing:.08em}.bwc-state{color:#77736c;font-size:7px;letter-spacing:.13em;text-transform:uppercase}.bwc-foot{padding:15px 22px 20px;color:#77736c;font-size:8px;line-height:1.65;text-align:center}';
    document.head.appendChild(style);
  }

  function publicKeyOf(provider, response) {
    var key = provider && provider.publicKey || response && response.publicKey;
    return key && key.toString ? key.toString() : String(key || '');
  }

  function connectWallet(wallet) {
    var provider = wallet.provider();
    if (!provider) return Promise.reject(new Error(wallet.name + ' is not available in this browser.'));
    return Promise.resolve(provider.connect()).then(function (response) {
      var address = publicKeyOf(provider, response);
      if (!address) throw new Error('Wallet did not return an address.');
      return { id:wallet.id, name:wallet.name, provider:provider, address:address };
    });
  }

  function choose(options) {
    options = options || {};
    injectStyle();
    var detected = wallets.filter(function (wallet) { return wallet.provider(); });
    if (detected.length === 1) return connectWallet(detected[0]);

    return new Promise(function (resolve, reject) {
      var mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
      var modal = document.createElement('div');
      modal.className = 'bwc';
      modal.innerHTML = '<div class="bwc-back"></div><div class="bwc-card" role="dialog" aria-modal="true" aria-label="Choose a Solana wallet"><div class="bwc-head"><b>CHOOSE A SOLANA WALLET</b><button type="button" class="bwc-close" aria-label="Close">&times;</button></div><div class="bwc-list"></div><div class="bwc-foot">Your wallet signs locally. BULLENCIAGA never receives a private key.</div></div>';
      document.body.appendChild(modal);
      var close = function () { modal.remove(); resolve(null); };
      modal.querySelector('.bwc-close').addEventListener('click', close);
      modal.querySelector('.bwc-back').addEventListener('click', close);
      var list = modal.querySelector('.bwc-list');
      wallets.forEach(function (wallet) {
        var provider = wallet.provider();
        var row = document.createElement(mobile && !provider ? 'a' : 'button');
        row.className = 'bwc-row';
        if (row.tagName === 'BUTTON') row.type = 'button';
        if (row.tagName === 'A') { row.href = wallet.link(); row.rel = 'noopener'; }
        row.innerHTML = '<span class="bwc-icon">' + wallet.name.charAt(0) + '</span><span class="bwc-name">' + wallet.name + '</span><span class="bwc-state">' + (provider ? 'detected' : (mobile ? 'open app' : 'install')) + '</span>';
        if (row.tagName === 'BUTTON') row.addEventListener('click', function () {
          if (!provider) { window.open(wallet.install, '_blank', 'noopener'); return; }
          row.disabled = true;
          connectWallet(wallet).then(function (result) { modal.remove(); resolve(result); }).catch(function (error) { modal.remove(); reject(error); });
        });
        list.appendChild(row);
      });
    });
  }

  window.BullenWalletChooser = { connect:choose, wallets:wallets };
}());
