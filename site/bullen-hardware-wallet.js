(function () {
  'use strict';
  var preference = false;
  try { preference = localStorage.getItem('bullen.ledger-mode.v1') === 'on'; } catch (_) {}
  var sdkPromise;
  function enabled() { return preference; }
  function setEnabled(value) {
    preference = Boolean(value);
    try { localStorage.setItem('bullen.ledger-mode.v1', preference ? 'on' : 'off'); } catch (_) {}
    document.querySelectorAll('[data-ledger-toggle]').forEach(function (input) { input.checked = preference; });
  }
  function assertAccount(provider, wallet) {
    if (!provider || !provider.publicKey || String(provider.publicKey) !== wallet) {
      throw new Error('The selected wallet changed or disconnected. Reconnect the intended account and try again.');
    }
  }
  function guidance(action) {
    return enabled() ? action + ' Unlock your Ledger, open the Solana app and review on the device.' : action;
  }
  function errorMessage(error) {
    var message = String(error && error.message || 'The wallet could not complete this request.');
    if (error && error.code === 4001 || /reject|declin|cancel|denied/i.test(message)) return 'Request cancelled. Nothing will be retried automatically.';
    if (/blockhash|expired/i.test(message)) return 'This request expired. Check your wallet activity before starting a fresh request.';
    if (enabled() && /not support|not implement|blind|0x6[89]|device|ledger|disconnected/i.test(message)) {
      return 'Ledger could not sign this request. Unlock it, open the Solana app and check the connected account. If your wallet asks for blind signing, enable it only after reviewing the action. ' + message;
    }
    return message;
  }
  function loadSdk() {
    if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
    if (!sdkPromise) sdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/vendor/solana-web3-1.98.4.min.js';
      script.onload = function () { window.solanaWeb3 ? resolve(window.solanaWeb3) : reject(new Error('Wallet library unavailable. Reload the page.')); };
      script.onerror = function () { sdkPromise = null; reject(new Error('Wallet library could not load. Reload the page.')); };
      document.head.appendChild(script);
    });
    return sdkPromise;
  }
  async function signProof(provider, wallet, message) {
    assertAccount(provider, wallet);
    var useLedger = enabled();
    var format = await import('/wallet-proof-format.mjs?v=20260920');
    try {
      if (!useLedger) {
        if (typeof provider.signMessage !== 'function') throw new Error('This wallet cannot sign messages here. For a Ledger account, turn on “Using Ledger?” and try again.');
        var result = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
        assertAccount(provider, wallet);
        var raw = result && result.signature ? result.signature : result;
        if (raw instanceof ArrayBuffer) raw = new Uint8Array(raw);
        else if (ArrayBuffer.isView(raw)) raw = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
        else if (Array.isArray(raw)) raw = Uint8Array.from(raw);
        if (!(raw instanceof Uint8Array) || raw.length !== 64) throw new Error('The wallet returned an invalid signature.');
        return format.hwBase58Encode(raw);
      }
      if (typeof provider.signTransaction !== 'function') throw new Error('This wallet does not support offline Ledger proofs. Try your Ledger account through Phantom, Solflare or Backpack in a supported browser.');
      var sdk = await loadSdk();
      var issued = String(Date.now());
      var nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      var bytes = format.hardwareProofMessage(wallet, message, issued, nonce);
      var transaction = sdk.Transaction.populate(sdk.Message.from(bytes));
      assertAccount(provider, wallet);
      // SIGN ONLY. Never submit ownership proofs to Solana. The invalid blockhash
      // prevents this memo from becoming an executable transaction even if copied.
      var signed = await provider.signTransaction(transaction);
      assertAccount(provider, wallet);
      var returned = signed.serializeMessage();
      if (returned.length !== bytes.length || returned.some(function (b, i) { return b !== bytes[i]; })) throw new Error('The wallet changed the ownership proof. Nothing was submitted.');
      var entry = signed.signatures.find(function (item) { return String(item.publicKey) === wallet; });
      if (!entry || !entry.signature || entry.signature.length !== 64 || !signed.verifySignatures()) throw new Error('The wallet did not return a valid ownership signature.');
      var proof = 'ledger-v1:' + issued + ':' + nonce + ':' + format.hwBase58Encode(entry.signature);
      format.walletProofPayload(wallet, proof, message); // Detect device approval after expiry.
      return proof;
    } catch (error) { throw new Error(errorMessage(error)); }
  }
  function mount(container) {
    if (!container || container.querySelector('[data-ledger-toggle]')) return;
    var details = document.createElement('details');
    details.className = 'bullen-ledger';
    details.innerHTML = '<summary>Using Ledger?</summary><label><input type="checkbox" data-ledger-toggle> Ledger compatibility</label><p>Connect your Ledger account through your wallet. Unlock the device and open its Solana app.</p><p>Ownership proofs are signed offline and never submitted. A wallet may display an estimated fee; this proof does not charge it. Mints, trades and transfers still have their normal costs.</p><p>Device and mobile support depend on your wallet. <a href="https://help.phantom.com/articles/4406388670483" target="_blank" rel="noopener noreferrer">Setup help ↗</a></p>';
    var input = details.querySelector('input');
    input.checked = enabled();
    input.addEventListener('change', function () { setEnabled(input.checked); });
    container.appendChild(details);
  }
  function init() {
    var style = document.createElement('style');
    style.textContent = '.bullen-ledger{margin:12px 0;color:#aaa69e;font:11px/1.6 monospace;text-align:left;max-width:440px}.bullen-ledger summary{cursor:pointer;color:#c7a869;list-style-position:inside}.bullen-ledger label{display:flex;align-items:center;gap:9px;margin-top:12px;color:#f5f3ee;cursor:pointer}.bullen-ledger input{accent-color:#c7a869;width:16px;height:16px}.bullen-ledger p{font:11px/1.6 monospace;margin:9px 0!important;color:#aaa69e!important}.bullen-ledger a{color:#c7a869}.bwc-ledger-settings>.bullen-ledger{margin:12px 22px}.bullen-ledger summary:focus-visible,.bullen-ledger a:focus-visible,.bullen-ledger input:focus-visible{outline:2px solid #c7a869;outline-offset:4px}';
    document.head.appendChild(style);
    document.querySelectorAll('[data-ledger-settings]').forEach(mount);
  }
  window.BullenHardwareWallet = { enabled:enabled, setEnabled:setEnabled, mount:mount, signProof:signProof, assertAccount:assertAccount, guidance:guidance, errorMessage:errorMessage };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
