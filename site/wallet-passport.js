(function () {
  'use strict';
  const form = document.getElementById('passport-form');
  if (!form) return;
  const input = document.getElementById('passport-address');
  const notice = document.getElementById('passport-notice');
  const record = document.getElementById('passport-record');
  const groups = document.getElementById('passport-groups');
  const loadButton = document.getElementById('passport-load');
  const connectButton = document.getElementById('passport-connect');
  const exampleButton = document.getElementById('passport-example');
  const state = document.getElementById('passport-state');
  const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  const escape = (value) => String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const compact = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: Number(value) >= 1e6 ? 'compact' : 'standard' }).format(Number(value) || 0);
  const short = (value) => `${String(value).slice(0, 6)}…${String(value).slice(-6)}`;
  const groupNames = { herd: 'The Herd', houseObjects: 'House Objects', bullensaga: 'BULLENSAGA Founding Records' };

  function pieceCard(item, kind) {
    const image = item.image ? `<img src="${escape(item.image)}" alt="" loading="lazy">` : '';
    return `<article class="passport-piece">${image}<div class="passport-piece-copy"><small>${escape(groupNames[kind])}</small><strong>${escape(item.name || short(item.id))}</strong><a href="https://solscan.io/token/${encodeURIComponent(item.id)}" target="_blank" rel="noreferrer">${escape(short(item.id))} ↗</a></div></article>`;
  }

  function render(payload) {
    const collections = payload.collections || {};
    document.getElementById('passport-title').textContent = payload.preview ? 'Predeploy example' : 'Wallet record';
    document.getElementById('passport-wallet').textContent = payload.wallet;
    document.getElementById('passport-bullen').textContent = compact(payload.bullen && payload.bullen.balance);
    document.getElementById('passport-herd').textContent = String((collections.herd || []).length);
    document.getElementById('passport-objects').textContent = String((collections.houseObjects || []).length);
    document.getElementById('passport-saga').textContent = String((collections.bullensaga || []).length);
    groups.innerHTML = Object.keys(groupNames).map((kind) => {
      const items = collections[kind] || [];
      return `<section><header class="passport-section-head"><h3>${escape(groupNames[kind])}</h3><span>${items.length} VERIFIED</span></header>${items.length ? `<div class="passport-grid">${items.map((item) => pieceCard(item, kind)).join('')}</div>` : '<div class="intel-empty">No pieces from this collection in the wallet.</div>'}</section>`;
    }).join('');
    record.hidden = false;
    state.textContent = payload.preview ? 'Predeploy example' : (payload.cached ? 'Cached chain read' : 'Fresh chain read');
    state.classList.toggle('is-preview', Boolean(payload.preview));
    notice.textContent = payload.preview ? 'Representative predeploy data. No ownership claim is being made.' : `Read-only record refreshed ${new Date(payload.updatedAt).toLocaleString()}.`;
    notice.classList.remove('is-error');
    record.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  async function load(wallet, preview) {
    loadButton.disabled = true;
    connectButton.disabled = true;
    notice.textContent = 'Reading the public record…';
    notice.classList.remove('is-error');
    try {
      const url = preview ? '/passport-preview.json' : `/rpc/passport?wallet=${encodeURIComponent(wallet)}`;
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || `passport returned ${response.status}`);
      render(payload);
    } catch (error) {
      notice.textContent = error.message || 'The passport could not be read.';
      notice.classList.add('is-error');
    } finally {
      loadButton.disabled = false;
      connectButton.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const wallet = input.value.trim();
    if (!addressPattern.test(wallet)) {
      notice.textContent = 'Enter a complete Solana wallet address.';
      notice.classList.add('is-error');
      return;
    }
    load(wallet, false);
  });

  exampleButton.addEventListener('click', () => load('', true));
  connectButton.addEventListener('click', async () => {
    const provider = window.phantom && window.phantom.solana ? window.phantom.solana : window.solana;
    if (!provider || typeof provider.connect !== 'function') {
      notice.textContent = 'No compatible browser wallet was found. Paste the public address instead.';
      notice.classList.add('is-error');
      return;
    }
    try {
      const result = await provider.connect({ onlyIfTrusted: false });
      const wallet = String((result && result.publicKey) || provider.publicKey || '');
      if (!addressPattern.test(wallet)) throw new Error('The wallet did not return an address.');
      input.value = wallet;
      load(wallet, false);
    } catch (error) {
      notice.textContent = error.message || 'Wallet connection was cancelled.';
      notice.classList.add('is-error');
    }
  });
})();
