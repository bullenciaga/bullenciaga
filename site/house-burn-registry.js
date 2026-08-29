(function houseBurnRegistry(){
  'use strict';

  const productionEndpoint = 'https://bullensaga.com/api/house-objects/burns';
  // The static BULLENCIAGA review stays on 4177; BULLENSAGA owns the ledger
  // API and runs beside it on 4178 during local review.
  const localEndpoint = 'http://127.0.0.1:4178/api/house-objects/burns';
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const endpoint = isLocal ? localEndpoint : productionEndpoint;
  let pending = null;

  const format = value => Number(value || 0).toLocaleString('en-US');
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  function read(path, payload){
    return path.split('.').reduce((value, key) => value && value[key], payload);
  }

  function displayValue(path, value){
    if (path === 'totals.committedBullen') return format(value) + ' $BULLEN';
    if (/available|reserved|issuedAllSources|burnClaims|editionCap/.test(path)) return format(value);
    return value == null ? '--' : String(value);
  }

  function render(root, payload){
    root.dataset.state = 'ready';
    root.querySelectorAll('[data-house-burn-value]').forEach(node => {
      const path = node.dataset.houseBurnValue;
      node.textContent = displayValue(path, read(path, payload));
    });
    const status = root.querySelector('[data-house-burn-status]');
    if (status) status.textContent = payload.totals.burnClaims
      ? 'verified Token-2022 deposits committed to the public burn escrow'
      : 'registry live · no public House Object burn claims yet';
  }

  function renderRecent(root, payload){
    const rows = Array.isArray(payload.recent) ? payload.recent : [];
    if (!rows.length) {
      root.innerHTML = '<li class="housecommitrow housecommit-empty"><span class="k house">Registry</span><span class="entry"><span class="lbl">No public House Object burn claims yet.</span></span><span class="when">--</span><span class="amt">0 committed</span></li>';
      return;
    }
    root.innerHTML = rows.map(row => {
      const label = row.collectibleId === 'house-object-01-signet' ? 'The Signet' : 'The Cufflinks';
      const serial = String(row.serialNumber).padStart(3, '0');
      const signature = String(row.escrowDepositSignature || '');
      const when = new Date(row.committedAt);
      const date = Number.isNaN(when.getTime()) ? '--' : when.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
      const time = Number.isNaN(when.getTime()) ? '' : when.toISOString().slice(11,16) + ' UTC';
      return '<li class="housecommitrow">'
        + '<span class="k house">Committed</span>'
        + '<span class="entry"><span class="lbl">' + escapeHtml(label + ' #' + serial) + '</span>'
        + '<a class="sig" href="https://solscan.io/tx/' + encodeURIComponent(signature) + '" target="_blank" rel="noopener" title="Open escrow deposit on Solscan">' + escapeHtml(signature) + '</a></span>'
        + '<span class="when">' + escapeHtml(date) + '<small>' + escapeHtml(time) + '</small></span>'
        + '<span class="amt">' + format(row.committedBullen) + ' to escrow</span>'
        + '</li>';
    }).join('');
  }

  function load(){
    if (!pending) pending = fetch(endpoint, {cache:'no-store'})
      .then(response => {
        if (!response.ok) throw new Error('HOUSE_BURN_REGISTRY_HTTP_' + response.status);
        return response.json();
      })
      .then(payload => {
        if (!payload || payload.schemaVersion !== 1 || !payload.totals) throw new Error('HOUSE_BURN_REGISTRY_INVALID');
        document.querySelectorAll('[data-house-burn-registry]').forEach(root => render(root, payload));
        document.querySelectorAll('[data-house-burn-recent]').forEach(root => renderRecent(root, payload));
        window.dispatchEvent(new CustomEvent('bullen:house-burns', {detail:payload}));
        return payload;
      })
      .catch(error => {
        document.querySelectorAll('[data-house-burn-registry]').forEach(root => {
          root.dataset.state = 'unavailable';
          const status = root.querySelector('[data-house-burn-status]');
          if (status) status.textContent = isLocal
            ? 'start the local BULLENSAGA review server on port 4178 to load the registry'
            : 'registry temporarily unavailable · on-chain supply figures remain authoritative';
        });
        throw error;
      });
    return pending;
  }

  window.BullenHouseBurns = { load, endpoint };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { load().catch(() => {}); });
  else load().catch(() => {});
})();
