(function () {
  'use strict';

  var root = document.documentElement;
  var reviewMode = root.dataset.objectsReview === 'true';
  var apiBase = (root.dataset.objectsApi || 'https://bullensaga.com').replace(/\/$/, '');
  var selectedId = 'house-object-01-signet';
  var provider = null;
  var wallet = '';
  var availability = {};
  var names = {
    'house-object-01-signet': 'THE SIGNET',
    'house-object-02-cufflinks': 'THE CUFFLINKS'
  };
  var $ = function (id) { return document.getElementById(id); };

  function setStatus(message, isError) {
    $('claimStatus').textContent = message;
    $('claimStatus').style.color = isError ? '#e0685f' : '';
  }

  function activateStep(name, done) {
    var items = Array.prototype.slice.call(document.querySelectorAll('.claim-steps li'));
    var index = items.findIndex(function (item) { return item.dataset.step === name; });
    items.forEach(function (item, itemIndex) {
      item.classList.toggle('is-done', done ? itemIndex <= index : itemIndex < index);
      item.classList.toggle('is-active', !done && itemIndex === index);
    });
  }

  function selectObject(id) {
    var selector = document.querySelector('[data-select-object="' + id + '"]');
    if (selector && selector.disabled) return;
    selectedId = id;
    $('selectedName').textContent = names[id];
    document.querySelectorAll('[data-select-object]').forEach(function (button) {
      button.classList.toggle('is-selected', button.dataset.selectObject === id);
    });
    $('claimResult').hidden = true;
    updateClaimButton();
  }

  function updateClaimButton() {
    $('beginClaim').disabled = !wallet || availability[selectedId] === 0;
  }

  function getProvider() {
    if (window.phantom && window.phantom.solana) return window.phantom.solana;
    if (window.solflare) return window.solflare;
    if (window.solana) return window.solana;
    return null;
  }

  async function connectWallet() {
    try {
      setStatus('Connecting to the wallet…');
      var selected = window.BullenWalletChooser
        ? await window.BullenWalletChooser.connect()
        : null;
      if (!selected) {
        provider = getProvider();
        if (!provider) return setStatus('Choose a Solana wallet to continue.', true);
        await provider.connect();
        wallet = provider.publicKey && provider.publicKey.toString ? provider.publicKey.toString() : String(provider.publicKey || '');
      } else {
        provider = selected.provider;
        wallet = selected.address;
      }
      if (!wallet) throw new Error('Wallet did not return an address');
      $('walletAddress').textContent = wallet;
      updateClaimButton();
      activateStep('wallet', true);
      setStatus('Wallet proved. The selected object is ready to reserve.');
    } catch (error) { setStatus((error && error.message) || 'Connection cancelled.', true); }
  }

  function previewWallet() {
    if (!reviewMode) return;
    wallet = 'GV7XDVAkra3Kjr4b2f2nyYrhL9gqEx5gvevdkTBzyYmd';
    $('walletAddress').textContent = wallet + ' · REVIEW WALLET';
    updateClaimButton();
    activateStep('wallet', true);
    setStatus('Review wallet loaded. No chain call or allocation will be made.');
  }

  function base58(bytes) {
    var alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    var digits = [0];
    for (var i = 0; i < bytes.length; i += 1) {
      var carry = bytes[i];
      for (var j = 0; j < digits.length; j += 1) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    var output = '';
    for (var zero = 0; zero < bytes.length && bytes[zero] === 0; zero += 1) output += '1';
    for (var index = digits.length - 1; index >= 0; index -= 1) output += alphabet[digits[index]];
    return output;
  }

  async function post(path, body) {
    var response = await fetch(apiBase + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The House ledger refused the request.');
    return result;
  }

  async function beginClaim() {
    if (!wallet) return;
    $('beginClaim').disabled = true;
    $('claimResult').hidden = true;
    try {
      if (reviewMode) {
        activateStep('reserve', true); setStatus('Review: numbered slot held for 20 minutes.');
        activateStep('escrow', true); setStatus('Review: exact 100,000 $BULLEN escrow transfer signed.');
        activateStep('verify', true); setStatus('Review complete. The slot reached the mint queue without touching chain or inventory.');
        $('claimSerial').textContent = selectedId === 'house-object-01-signet' ? '#001' : '#002';
        $('claimResult').hidden = false;
        return;
      }
      if (!provider || !provider.signMessage || !provider.signAndSendTransaction || !window.solanaWeb3) throw new Error('This wallet cannot complete the claim in this browser.');

      activateStep('wallet', false); setStatus('Approve the free wallet-proof signature…');
      var challenge = await post('/api/house-objects/challenges', { solWalletAddress: wallet });
      var proof = await provider.signMessage(new TextEncoder().encode(challenge.message), 'utf8');
      var proofBytes = proof && proof.signature ? proof.signature : proof;

      activateStep('reserve', false); setStatus('Holding the lowest available number…');
      var reservation = await post('/api/house-objects/reservations', {
        collectibleId: selectedId,
        solWalletAddress: wallet,
        challengeId: challenge.challengeId,
        challengeSignature: base58(proofBytes)
      });

      activateStep('escrow', false); setStatus('Approve the exact 100,000 $BULLEN transfer to the public burn escrow…');
      var bytes = Uint8Array.from(atob(reservation.escrowTransactionBase64), function (character) { return character.charCodeAt(0); });
      var transaction = window.solanaWeb3.Transaction.from(bytes);
      var sent = await provider.signAndSendTransaction(transaction);
      var signature = sent && sent.signature ? sent.signature : String(sent || '');

      activateStep('verify', false); setStatus('Waiting for Solana confirmation and verifying the escrow deposit…');
      var claim = await post('/api/house-objects/claims', {
        reservationId: reservation.reservationId,
        collectibleId: selectedId,
        solWalletAddress: wallet,
        escrowTransactionSignature: signature
      });
      activateStep('verify', true);
      $('claimSerial').textContent = '#' + String(claim.slot.serialNumber).padStart(3, '0');
      $('claimResultCopy').textContent = 'Escrow deposit verified. This numbered unit is allocated to the connected wallet and is now in the mint queue.';
      $('claimResult').hidden = false;
      setStatus('Escrow deposit verified. Your permanent mint record is being prepared.');
      loadInventory();
    } catch (error) {
      setStatus((error && error.message) || 'The claim could not be completed.', true);
    } finally { updateClaimButton(); }
  }

  async function loadInventory() {
    if (reviewMode) return;
    try {
      var response = await fetch(apiBase + '/api/house-objects/inventory', { cache: 'no-store' });
      if (!response.ok) return;
      var data = await response.json();
      document.querySelectorAll('[data-object-id]').forEach(function (card) {
        var live = data.collectibles && data.collectibles[card.dataset.objectId];
        if (!live) return;
        var soldOut = live.available === 0;
        var button = card.querySelector('[data-select-object]');
        availability[card.dataset.objectId] = live.available;
        card.querySelector('[data-available]').textContent = live.available;
        card.classList.toggle('is-sold-out', soldOut);
        button.disabled = soldOut;
        button.textContent = soldOut ? 'FULLY ALLOCATED' : card.dataset.objectId === 'house-object-01-signet' ? 'SELECT THE SIGNET' : 'SELECT THE CUFFLINKS';
        if (card.dataset.objectId === selectedId && soldOut) {
          $('beginClaim').disabled = true;
          setStatus(names[selectedId] + ' is fully allocated. Select another available object.', true);
        }
      });
      updateClaimButton();
      $('reviewRibbon').textContent = data.access.phase === 'holders'
        ? 'VERIFIED HOLDER WINDOW · PUBLIC IN 48 HOURS'
        : data.access.phase === 'public'
          ? 'PUBLIC CLAIM WINDOW'
          : 'HOUSE OBJECTS · CLAIM WINDOW NOT OPEN';
    } catch (error) { /* the static issue counts remain visible */ }
  }

  document.querySelectorAll('[data-select-object]').forEach(function (button) { button.addEventListener('click', function () { selectObject(button.dataset.selectObject); }); });
  $('connectWallet').addEventListener('click', connectWallet);
  $('previewWallet').addEventListener('click', previewWallet);
  $('beginClaim').addEventListener('click', beginClaim);
  if (!reviewMode) $('previewWallet').hidden = true;
  loadInventory();
  if (!reviewMode) window.setInterval(loadInventory, 15_000);
})();
