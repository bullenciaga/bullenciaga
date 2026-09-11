(function () {
  'use strict';
  // Local creative tools. Only artwork descriptors are persisted: never wallet
  // addresses, balances, signatures, or authority to transact.
  const STORAGE = 'bullenciaga.collector-shortlist.v1';
  const MAX_SAVED = 100;
  const MAX_PIECES = 9;
  // These five named editions belong to the canonical 1,000-piece manifest.
  // They have the same stable name keys as its numbered HERD editions.
  const NAMED_HERD = new Set(['BLACK MENACE','GOLDEN RELIC','MARBLE RELIC','OPAL KING','SUPER CYAN']);
  const isHerdName = name => /^HERD #(?:[1-9]\d{0,2}|1000)$/.test(name) || NAMED_HERD.has(name);
  // Keep public studio discovery aligned with the existing gallery Vault.
  const EXCLUDED_CUSTOMS = new Set(['EKqhtAKQFWzgkpQm6zNRxib3anUpZbtoZmnpWvkPSXaq','EDjR8XZshTmYdDR1GsoC1ZRHF7ys8xZQ9ZHvZ9ztA7oY']);
  const FORMAT = { banner: [3000, 1000], phone: [1440, 3120], print: [3600, 2400] };
  const PALETTES = {
    charcoal: { background: '#090909', ink: '#ead9aa', muted: '#998c72', line: '#302a20' },
    ivory: { background: '#eee9df', ink: '#25231f', muted: '#777061', line: '#c8beac' },
    oxblood: { background: '#251010', ink: '#ead9aa', muted: '#b79882', line: '#59382d' }
  };
  const escape = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const safeImage = value => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const u = new URL(value, location.origin);
      if (u.username || u.password) return '';
      return ((u.origin === location.origin && u.pathname.startsWith('/assets/')) ||
        (u.protocol === 'https:' && ['gateway.irys.xyz', 'arweave.net', 'bullenciaga.com', 'bullensaga.com'].includes(u.hostname))) ? u.href : '';
    } catch (_) { return ''; }
  };
  function cleanEntry(entry) {
    if (!entry || typeof entry.name !== 'string' || !entry.image) return null;
    const name = entry.name.slice(0, 100);
    const herd = isHerdName(name);
    const series = herd ? 'herd' : ['house-object', 'bullensaga', 'custom'].includes(entry.series) ? entry.series : '';
    const id = String(entry.id || '').slice(0, 60);
    if (!series || (!herd && !id)) return null;
    const image = safeImage(entry.image);
    if (!image) return null;
    return { key: herd ? name : `${series}:${id}`, name, id, image,
      originalImage: safeImage(entry.originalImage || ''), series,
      attributes: (Array.isArray(entry.attributes) ? entry.attributes : []).slice(0, 30).map(a => ({
        trait_type: String(a.trait_type || '').slice(0, 80), value: String(a.value || '').slice(0, 120)
      })) };
  }
  function parseSaved(raw) {
    try {
      const values = JSON.parse(raw);
      if (!Array.isArray(values)) return [];
      return [...new Map(values.map(cleanEntry).filter(Boolean).map(e => [e.key, e])).values()].slice(0, MAX_SAVED);
    } catch (_) { return []; }
  }
  function originalFor(entry) {
    if (entry.series === 'house-object') {
      const matched = [['signet','01-signet'],['cufflinks','02-cufflinks'],['key','03-key']].find(([word]) => new RegExp(`\\b${word}\\b`, 'i').test(entry.name));
      if (matched) return `/assets/house-objects/house-object-${matched[1]}.png`;
    }
    if (entry.series === 'bullensaga') {
      if (/\bpromise\b/i.test(entry.name)) return '/assets/collection-originals/promise-nft.png';
      if (/\btriad\b/i.test(entry.name)) return '/assets/collection-originals/triad-nft.png';
    }
    return entry.originalImage || entry.image;
  }
  // The layout is shared by the preview and full-size export. Artwork always
  // uses contain: none of the original composition is silently cropped.
  function layoutFor(width, height, count, layout) {
    const margin = Math.round(Math.min(width, height) * .065);
    const header = height > width ? height * .17 : height * .17;
    const bottom = height > width ? height * .14 : height * .10;
    const available = { x: margin, y: header, w: width - margin * 2, h: height - header - bottom };
    if (!count) return { margin, header, available, slots: [] };
    let cols = layout === 'row' ? (height > width ? Math.min(count, 2) : count) : Math.ceil(Math.sqrt(count * available.w / available.h));
    cols = Math.max(1, Math.min(count, cols));
    const rows = Math.ceil(count / cols);
    const gap = margin * .4;
    const cellW = (available.w - gap * (cols - 1)) / cols;
    const cellH = (available.h - gap * (rows - 1)) / rows;
    const label = Math.max(22, Math.min(width, height) * .037);
    const side = Math.max(1, Math.min(cellW, cellH - label));
    return { margin, header, available, slots: Array.from({ length: count }, (_, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, count - row * cols);
      const rowWidth = inRow * side + (inRow - 1) * gap;
      return { x: margin + (available.w - rowWidth) / 2 + (i % cols) * (side + gap),
        y: header + (available.h - (rows * (side + label) + (rows - 1) * gap)) / 2 + row * (side + label + gap),
        w: side, h: side, label };
    }) };
  }
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>';
  let bridge = null, saved = [], storageAvailable = true, shortlistDialog = null, studioDialog = null;
  let studioItems = [], selected = [], collectionLabel = 'Public artwork', studioRender = 0, studioLoad = 0, dirty = false;
  const imageCache = new Map(), reloadSources = new Set();
  let studioReady = 0, exporting = false, readyConfig = null;
  const ART_PROXY = 'https://bullenciaga-img-proxy.bullenciaga-e5c.workers.dev/';
  function proxyFor(url) {
    const source = new URL(url, location.origin);
    return ['gateway.irys.xyz','arweave.net'].includes(source.hostname)
      ? `${ART_PROXY}?url=${encodeURIComponent(source.href)}` : url;
  }
  try { saved = parseSaved(localStorage.getItem(STORAGE)); } catch (_) { storageAvailable = false; }
  const known = new Map(saved.map(e => [e.key, e]));
  const displayImage = entry => bridge?.imageUrl(entry.image) || entry.image;
  const savedKeys = () => new Set(saved.map(e => e.key));
  const normalized = entries => (entries || []).map(cleanEntry).filter(Boolean);
  const register = entries => normalized(entries).forEach(e => known.set(e.key, e));
  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(saved)); storageAvailable = true; }
    catch (_) { storageAvailable = false; }
    updateSavedControls();
  }
  function updateSavedControls() {
    const keys = savedKeys();
    document.querySelectorAll('[data-save-piece]').forEach(button => {
      const yes = keys.has(button.dataset.savePiece);
      button.setAttribute('aria-pressed', String(yes));
      button.setAttribute('aria-label', `${yes ? 'Remove' : 'Save'} ${known.get(button.dataset.savePiece)?.name || 'piece'} ${yes ? 'from' : 'to'} shortlist`);
      button.title = yes ? 'Remove from shortlist' : 'Save to shortlist';
    });
    document.querySelectorAll('[data-shortlist-count]').forEach(el => { el.textContent = String(saved.length); });
    document.querySelectorAll('[data-storage-note]').forEach(el => { el.textContent = storageAvailable ? 'Saved on this browser. No wallet connection needed.' : 'Browser storage is unavailable. Your shortlist will last for this visit only.'; });
  }
  function toggleSaved(entry) {
    const clean = cleanEntry(entry);
    if (!clean) return;
    known.set(clean.key, clean);
    const index = saved.findIndex(e => e.key === clean.key);
    if (index >= 0) saved.splice(index, 1);
    else if (saved.length < MAX_SAVED) saved.push(clean);
    else { showToast(`Your shortlist has ${MAX_SAVED} pieces. Remove one before saving another.`); return; }
    persist();
  }
  function showToast(message) {
    let status = document.getElementById('collector-toast');
    if (!status) { status = document.createElement('div'); status.id = 'collector-toast'; status.role = 'status'; status.className = 'collector-toast'; document.body.append(status); }
    const host = studioDialog?.open ? studioDialog : shortlistDialog?.open ? shortlistDialog : document.body;
    host.append(status);
    status.textContent = message;
    status.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { status.hidden = true; }, 5000);
  }
  function dialog(title, name, body) {
    const el = document.createElement('dialog');
    el.className = `collector-dialog ${name}`;
    el.setAttribute('aria-labelledby', `${name}-title`);
    el.innerHTML = `<header class="collector-dialog-head"><div><span class="collector-eyebrow">BULLENCIAGA · COLLECTOR TOOLS</span><h2 id="${name}-title">${title}</h2></div><button type="button" class="collector-close" aria-label="Close ${title}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>${body}`;
    document.body.append(el);
    let priorFocus;
    el.addEventListener('close', () => { if (priorFocus?.isConnected) priorFocus.focus(); });
    el.querySelector('.collector-close').onclick = () => el.close();
    el.addEventListener('click', event => { if (event.target === el) { const r = el.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) el.close(); } });
    el.showCollector = () => { priorFocus = document.activeElement; if (!el.open) el.showModal(); };
    return el;
  }
  function cardLabel(entry) {
    return ['house-object','bullensaga'].includes(entry.series)
      ? 'THE ' + entry.name.replace(/\s+#\d+\s*$/, '').replace(/^THE\s+/i, '').toUpperCase() : entry.name;
  }
  function attachCard(card, entry) {
    const clean = cleanEntry(entry);
    if (!clean) return;
    known.set(clean.key, clean);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'collector-save'; button.dataset.savePiece = clean.key;
    const yes = savedKeys().has(clean.key);
    button.setAttribute('aria-pressed', String(yes));
    button.setAttribute('aria-label', `${yes ? 'Remove' : 'Save'} ${clean.name} ${yes ? 'from' : 'to'} shortlist`);
    button.title = yes ? 'Remove from shortlist' : 'Save to shortlist';
    button.innerHTML = icon;
    button.addEventListener('click', event => { event.stopPropagation(); toggleSaved(clean); });
    const footer = card.querySelector('.gallery-card-name');
    if (footer) {
      const label = document.createElement('span'); label.className = 'collector-card-label';
      label.textContent = cardLabel(clean); label.title = clean.name;
      footer.textContent = ''; footer.append(label,button);
    } else card.append(button);
  }
  const getEntry = savedEntry => {
    const live = bridge?.entries().find(e => e.name === savedEntry.name && savedEntry.series === 'herd');
    return live ? cleanEntry(live) : savedEntry;
  };
  async function openShortlist() {
    if (!shortlistDialog) shortlistDialog = dialog('Your shortlist.', 'collector-shortlist', '<div class="collector-dialog-body" id="collector-shortlist-body"></div>');
    renderShortlist(); shortlistDialog.showCollector();
    if (bridge) { await bridge.refreshListings(); if (shortlistDialog.open) updateListingLabels(); }
  }
  function listingText(entry) {
    if (!['herd','custom'].includes(entry.series)) return 'Marketplace data not available here';
    const data = bridge?.market(entry);
    if (!data?.ready) return 'Listing data unavailable';
    const old = Date.now() - data.checkedAt > 120000;
    return data.listing ? `${Number(data.listing.price).toLocaleString('en', { maximumFractionDigits: 4 })} SOL${old ? ' · last seen' : ' · listed'}` : (old ? 'Listing status needs refreshing' : 'No active listing found');
  }
  function updateListingLabels() {
    shortlistDialog?.querySelectorAll('[data-listing-key]').forEach(el => { const entry = known.get(el.dataset.listingKey); if (entry) el.textContent = listingText(entry); });
  }
  function renderShortlist() {
    const entries = saved.map(getEntry); register(entries);
    const body = shortlistDialog.querySelector('#collector-shortlist-body');
    body.innerHTML = `<div class="collector-shortlist-intro"><p data-storage-note></p><p>Keep the pieces that catch your eye. Choose two or three to look closer.</p></div>
      ${entries.length ? `<div class="collector-shortlist-actions"><button type="button" class="collector-button primary" id="collector-compare" disabled>Compare selected <span>(0/3)</span></button><button type="button" class="collector-button" id="collector-shortlist-studio">Create an image</button></div><div class="collector-saved-grid">${entries.map(e => `<article class="collector-saved-piece"><div class="collector-saved-art"><img src="${escape(displayImage(e))}" alt="${escape(e.name)}" loading="lazy"><button type="button" class="collector-save" data-remove="${escape(e.key)}" aria-label="Remove ${escape(e.name)} from shortlist">×</button></div><h3>${escape(e.name)}</h3><p data-listing-key="${escape(e.key)}">${escape(listingText(e))}</p><label class="collector-check"><input type="checkbox" data-compare="${escape(e.key)}"> Compare</label></article>`).join('')}</div>` : '<div class="collector-empty">Your next favourite is waiting.<p>Tap the bookmark on a piece in the gallery to keep it here.</p><button type="button" class="collector-button primary" id="collector-back-gallery">Back to the gallery</button></div>'}`;
    updateSavedControls();
    body.querySelector('#collector-back-gallery')?.addEventListener('click', () => shortlistDialog.close());
    body.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { toggleSaved(known.get(button.dataset.remove)); renderShortlist(); });
    const checkedKeys = () => [...body.querySelectorAll('[data-compare]:checked')].map(el => el.dataset.compare);
    body.querySelectorAll('[data-compare]').forEach(box => box.onchange = () => {
      if (checkedKeys().length > 3) { box.checked = false; showToast('Compare up to three pieces at a time.'); }
      const count = checkedKeys().length, button = body.querySelector('#collector-compare');
      button.disabled = count < 2; button.querySelector('span').textContent = `(${count}/3)`;
    });
    body.querySelector('#collector-compare')?.addEventListener('click', () => renderCompare(checkedKeys().map(k => known.get(k))));
    body.querySelector('#collector-shortlist-studio')?.addEventListener('click', () => { shortlistDialog.close(); openStudio({ selectedItems: entries, label: 'Full artwork catalogue' }); });
  }
  function renderCompare(entries) {
    if (entries.length < 2 || entries.length > 3) return;
    const body = shortlistDialog.querySelector('#collector-shortlist-body');
    const traits = [...new Set(entries.flatMap(e => e.attributes.map(a => a.trait_type)))];
    const value = (e, trait) => e.attributes.find(a => a.trait_type === trait)?.value || '—';
    const differing = traits.filter(t => new Set(entries.map(e => value(e,t))).size > 1);
    body.innerHTML = `<div class="collector-shortlist-actions"><button type="button" class="collector-button" id="collector-compare-back">← Shortlist</button><label class="collector-check"><input type="checkbox" id="collector-differences"> Differences only</label></div><div class="collector-compare-wrap"><table class="collector-compare"><caption>Artwork, gallery rarity and marketplace listings</caption><thead><tr><th scope="col">The details</th>${entries.map(e => `<th scope="col"><img src="${escape(displayImage(e))}" alt="${escape(e.name)}"><strong>${escape(e.name)}</strong></th>`).join('')}</tr></thead><tbody><tr><th scope="row">Gallery rarity</th>${entries.map(e => `<td>${bridge?.rarity(e) || 'Not ranked'}</td>`).join('')}</tr><tr><th scope="row">Magic Eden</th>${entries.map(e => `<td data-listing-key="${escape(e.key)}">${escape(listingText(e))}</td>`).join('')}</tr>${traits.map(t => `<tr data-trait-row data-different="${differing.includes(t)}"><th scope="row">${escape(t)}</th>${entries.map(e => `<td>${escape(value(e,t))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="collector-small">Rarity follows the gallery’s curated tiers and trait-frequency ordering. Listing reads may be cached; confirm availability and price on the marketplace.</p><p class="collector-small">Saving a piece does not reserve it. Unclaimed HERD pieces remain part of the random mint.</p><button type="button" class="collector-button primary" id="collector-compare-studio">Create an image with these pieces</button>`;
    body.querySelector('#collector-compare-back').onclick = renderShortlist;
    body.querySelector('#collector-differences').onchange = event => body.querySelectorAll('[data-trait-row]').forEach(row => { row.hidden = event.target.checked && row.dataset.different === 'false'; });
    body.querySelector('#collector-compare-studio').onclick = () => { shortlistDialog.close(); openStudio({ selectedItems: entries, label: 'Full artwork catalogue' }); };
  }
  async function loadPublic() {
    if (bridge?.libraryEntries) return normalized(await bridge.libraryEntries());
    const response = await fetch('/gallery-manifest.json');
    if (!response.ok) throw new Error('The artwork catalogue could not be loaded. Please try again.');
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error('The artwork catalogue is unavailable.');
    // Read the same verified collection as the gallery's Vault. The static
    // 1,000-piece manifest stays separate from named on-chain custom pieces.
    const names = new Set(entries.map(e => e.name));
    try {
      for (let page=1; page<=5; page++) {
        const read = await fetch('/rpc', { method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(15000), body:JSON.stringify({jsonrpc:'2.0',id:'collector-public-art',method:'getAssetsByGroup',params:{groupKey:'collection',groupValue:'5GXF7Uug7mZy2pj5XDk4LP9yH7oA5oMQEbCT49ggQnVC',page,limit:1000}}) });
        const data = await read.json();
        if (!read.ok || data.error || !Array.isArray(data.result?.items)) throw new Error('Custom artwork unavailable');
        for (const asset of data.result.items) {
          const name=asset.content?.metadata?.name;
          if (!asset.burnt && !EXCLUDED_CUSTOMS.has(asset.id) && name && !names.has(name)) { entries.push({id:asset.id,name,image:asset.content?.links?.image || asset.content?.files?.[0]?.uri,attributes:asset.content?.metadata?.attributes||[],series:'custom'}); names.add(name); }
        }
        if (data.result.items.length < 1000) break;
      }
    } catch (_) { showToast('The standard collection is ready. Custom pieces are temporarily unavailable; reopen the studio to retry.'); }
    return normalized(entries);
  }
  function ensureStudio() {
    if (studioDialog) return;
    studioDialog = dialog('Make it yours.', 'collector-studio', `<div class="collector-studio-layout"><section class="collector-workspace" aria-label="Image preview"><div class="collector-canvas-wrap"><canvas id="collector-canvas" width="1500" height="500" aria-label="Your collection image preview"></canvas></div><div class="collector-preview-foot"><span id="collector-dimensions">3000 × 1000 PNG</span><span>Artwork kept whole</span></div><p id="collector-render-status" role="status" aria-live="polite"></p></section><div class="collector-controls"><section class="collector-arrangement" aria-label="Selected artwork"><div class="collector-order-head"><span class="collector-eyebrow">Your arrangement</span><span class="collector-small">Use arrows to reorder · up to 9 pieces</span></div><div id="collector-order" class="collector-order"></div></section><aside class="collector-settings"><div class="collector-setting"><label for="collector-format">Make a</label><select id="collector-format"><option value="banner">X banner · 3:1</option><option value="phone">Phone background · 6:13</option><option value="print">Collection print · 3:2</option></select></div><div class="collector-setting"><label for="collector-layout">Arrangement</label><select id="collector-layout"><option value="grid">Balanced grid</option><option value="row">Gallery row</option></select></div><fieldset class="collector-palette"><legend>Background</legend>${Object.entries(PALETTES).map(([key,p]) => `<label title="${key}" style="--swatch:${p.background}"><input type="radio" name="collector-palette" value="${key}" ${key === 'charcoal' ? 'checked' : ''}><span>${key}</span></label>`).join('')}</fieldset><div class="collector-display-options" role="group" aria-label="Image details"><label class="collector-check"><input type="checkbox" id="collector-labels" checked> Show piece names</label><label class="collector-check"><input type="checkbox" id="collector-brand" checked> House signature</label></div><div class="collector-setting"><label for="collector-caption">Collection title <span>optional</span></label><input type="text" id="collector-caption" maxlength="42" placeholder="A few favourites."></div><button type="button" id="collector-export" class="collector-button primary">Download PNG ↗</button><p class="collector-small">Created in your browser. Wallet addresses and balances never appear in the image.</p></aside><section class="collector-library"><div class="collector-library-head"><div><span class="collector-eyebrow" id="collector-library-label">Public artwork</span><h3>Choose your pieces.</h3></div><label class="collector-search-label"><span class="collector-sr-only">Find artwork</span><input id="collector-art-search" type="search" placeholder="Search a name or edition"></label></div><p id="collector-library-note" class="collector-small"></p><div id="collector-library-grid" class="collector-library-grid"></div><button type="button" class="collector-button" id="collector-library-more" hidden>Show more artwork</button></section></div></div>`);
    const rerender = () => { dirty = true; drawPreview(); };
    ['collector-format','collector-layout','collector-labels','collector-brand'].forEach(id => studioDialog.querySelector(`#${id}`).onchange = rerender);
    studioDialog.querySelectorAll('[name="collector-palette"]').forEach(el => el.onchange = rerender);
    studioDialog.querySelector('#collector-caption').oninput = rerender;
    studioDialog.querySelector('#collector-art-search').oninput = () => renderLibrary();
    studioDialog.querySelector('#collector-export').onclick = exportImage;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.id = 'collector-retry'; retry.className = 'collector-button';
    retry.textContent = 'Retry artwork'; retry.hidden = true; retry.onclick = drawPreview;
    studioDialog.querySelector('#collector-render-status').after(retry);
    studioDialog.addEventListener('close', () => { if (!studioDialog.open) { studioRender++; studioLoad++; } });
    studioDialog.querySelector('#collector-library-more').onclick = () => renderLibrary(studioDialog.querySelectorAll('[data-add-art]').length + 36);
  }
  async function openStudio(options = {}) {
    ensureStudio();
    const request = ++studioLoad;
    studioDialog.showCollector();
    studioDialog.scrollTop = 0;
    studioDialog.querySelector('.collector-controls').scrollTop = 0;
    const seeds = Array.isArray(options.selectedItems) ? normalized(options.selectedItems) : null;
    const supplied = Array.isArray(options.items) ? normalized(options.items) : null;
    const initial = supplied || seeds || [];
    studioItems = [...new Map(initial.map(e => [e.key,e])).values()]; register(studioItems);
    const wanted = options.selectedKey ? studioItems.find(e => e.key === options.selectedKey) : null;
    selected = wanted ? [wanted] : studioItems.slice(0, seeds ? MAX_PIECES : 3);
    dirty = false;
    collectionLabel = options.label || 'Public artwork';
    studioDialog.querySelector('#collector-library-label').textContent = collectionLabel;
    const note = studioDialog.querySelector('#collector-library-note');
    const catalogueNote = seeds
      ? `${seeds.length > MAX_PIECES ? 'Your first nine pieces are selected.' : 'Your chosen pieces are selected.'} Add any other artwork from the catalogue below, or remove pieces to change your arrangement.`
      : 'Browse the collection’s original art. Making an image does not imply ownership or reserve a piece.';
    note.textContent = supplied
      ? 'Artwork from the public wallet record you opened. Selection does not grant ownership.'
      : seeds ? `${catalogueNote} Loading the rest of the catalogue…` : 'Loading the artwork catalogue…';
    studioDialog.querySelector('#collector-art-search').value = '';
    renderLibrary(); renderOrder(); drawPreview();
    if (supplied) return;
    // Seed artwork is usable immediately. Discovery can fail independently
    // without preventing a saved composition from being edited or exported.
    let timeout;
    try {
      const items = await Promise.race([
        loadPublic(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('The artwork catalogue took too long to respond.')), 15000); })
      ]);
      if (request !== studioLoad || !studioDialog.open) return;
      studioItems = [...new Map([...studioItems,...items].map(e => [e.key,e])).values()]; register(studioItems);
      if (!seeds && !dirty) selected = studioItems.slice(0,3);
      else selected = selected.map(e => known.get(e.key) || e);
      note.textContent = catalogueNote;
      renderLibrary(); renderOrder(); drawPreview();
    } catch (_) {
      if (request !== studioLoad || !studioDialog.open) return;
      note.textContent = seeds
        ? 'Your chosen artwork is ready to use. The rest of the catalogue is temporarily unavailable; reopen the studio to retry.'
        : 'The artwork catalogue is temporarily unavailable. Please close and reopen the studio to try again.';
    } finally { clearTimeout(timeout); }
  }
  function renderLibrary(limit = 36) {
    const term = studioDialog.querySelector('#collector-art-search').value.trim().toLowerCase();
    const entries = studioItems.filter(e => e.name.toLowerCase().includes(term));
    const keys = new Set(selected.map(e => e.key));
    studioDialog.querySelector('#collector-library-grid').innerHTML = entries.slice(0,limit).map(e => `<button type="button" class="collector-art-option" data-add-art="${escape(e.key)}" aria-pressed="${keys.has(e.key)}" aria-label="${keys.has(e.key) ? 'Remove' : 'Add'} ${escape(e.name)}"><img src="${escape(displayImage(e))}" alt="" loading="lazy"><span>${escape(e.name)}</span><b aria-hidden="true">${keys.has(e.key) ? '✓' : '+'}</b></button>`).join('') || `<p class="collector-small">${studioItems.length ? 'No pieces match that search.' : 'There is no artwork in this selection yet.'}</p>`;
    studioDialog.querySelector('#collector-library-more').hidden = entries.length <= limit;
    studioDialog.querySelectorAll('[data-add-art]').forEach(button => button.onclick = () => {
      const i = selected.findIndex(e => e.key === button.dataset.addArt);
      if (i >= 0) selected.splice(i,1);
      else if (selected.length >= MAX_PIECES) { showToast('Nine pieces fit this arrangement. Remove one to make room.'); return; }
      else selected.push(known.get(button.dataset.addArt));
      dirty = true; renderOrder(); updateLibrarySelection(); drawPreview();
    });
  }
  function updateLibrarySelection() {
    const keys = new Set(selected.map(e => e.key));
    studioDialog.querySelectorAll('[data-add-art]').forEach(button => {
      const yes = keys.has(button.dataset.addArt);
      button.setAttribute('aria-pressed', String(yes));
      button.setAttribute('aria-label', `${yes ? 'Remove' : 'Add'} ${known.get(button.dataset.addArt)?.name || 'piece'}`);
      button.querySelector('b').textContent = yes ? '✓' : '+';
    });
  }
  function renderOrder() {
    const host = studioDialog.querySelector('#collector-order');
    const existing = new Map([...host.querySelectorAll('[data-order-key]')].map(node => [node.dataset.orderKey,node]));
    host.querySelector('.collector-small')?.remove();
    // Keep decoded image elements attached when adding/removing other pieces.
    // Replacing the entire list makes every image flash on slow connections.
    selected.forEach((e,i) => {
      let node = existing.get(e.key);
      if (!node) {
        node = document.createElement('div'); node.className = 'collector-order-piece'; node.dataset.orderKey = e.key;
        node.innerHTML = `<img src="${escape(displayImage(e))}" alt="${escape(e.name)}"><div><button type="button" data-direction="-1" aria-label="Move ${escape(e.name)} earlier">←</button><button type="button" data-direction="1" aria-label="Move ${escape(e.name)} later">→</button><button type="button" data-remove-order aria-label="Remove ${escape(e.name)}">×</button></div>`;
        node.querySelectorAll('[data-direction]').forEach(button => button.onclick = () => {
          const from = selected.findIndex(piece => piece.key === e.key), to = from + Number(button.dataset.direction);
          if (from < 0 || to < 0 || to >= selected.length) return;
          [selected[from], selected[to]] = [selected[to], selected[from]]; dirty = true; renderOrder(); drawPreview();
        });
        node.querySelector('[data-remove-order]').onclick = () => {
          selected = selected.filter(piece => piece.key !== e.key); dirty = true;
          renderOrder(); updateLibrarySelection(); drawPreview();
        };
      }
      node.querySelector('[data-direction="-1"]').disabled = i === 0;
      node.querySelector('[data-direction="1"]').disabled = i === selected.length - 1;
      if (host.children[i] !== node) host.insertBefore(node,host.children[i] || null);
      existing.delete(e.key);
    });
    existing.forEach(node => node.remove());
    if (!selected.length) { const note = document.createElement('p'); note.className = 'collector-small'; note.textContent = 'Choose a piece below to start your composition.'; host.append(note); }
  }
  function settings() {
    return { format: studioDialog.querySelector('#collector-format').value,
      layout: studioDialog.querySelector('#collector-layout').value,
      palette: studioDialog.querySelector('[name="collector-palette"]:checked').value,
      labels: studioDialog.querySelector('#collector-labels').checked,
      brand: studioDialog.querySelector('#collector-brand').checked,
      caption: studioDialog.querySelector('#collector-caption').value.trim(), entries: selected.slice() };
  }
  const CRC_TABLE = Array.from({length:256},(_,value) => {
    for (let bit=0;bit<8;bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  function imageType(bytes) {
    const fail = () => { throw new Error('The image response was incomplete or damaged.'); };
    const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const text = (at,size) => String.fromCharCode(...bytes.subarray(at,at+size));
    if (bytes.length >= 8 && bytes[0]===137 && text(1,7)==='PNG\r\n\x1a\n') {
      let at=8, sawHeader=false, sawData=false;
      while (at+12 <= bytes.length) {
        const size=view.getUint32(at), type=text(at+4,4), end=at+12+size;
        if (end>bytes.length) fail();
        let crc=0xffffffff;
        for (let i=at+4;i<end-4;i++) crc=CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);
        if (((crc^0xffffffff)>>>0)!==view.getUint32(end-4)) fail();
        if (!sawHeader) { if (type!=='IHDR'||size!==13||!view.getUint32(at+8)||!view.getUint32(at+12)) fail(); sawHeader=true; }
        if (type==='IDAT') sawData=true;
        if (type==='IEND') { if (size!==0||end!==bytes.length||!sawData) fail(); return 'image/png'; }
        at=end;
      }
      fail();
    }
    if (bytes.length>=12 && text(0,4)==='RIFF' && text(8,4)==='WEBP') {
      if (view.getUint32(4,true)+8!==bytes.length) fail();
      let at=12,sawImage=false;
      while(at+8<=bytes.length) { const size=view.getUint32(at+4,true),type=text(at,4); at+=8+size+(size&1); if(at>bytes.length)fail(); if(['VP8 ','VP8L','ANMF'].includes(type))sawImage=true; }
      if(at!==bytes.length||!sawImage)fail(); return 'image/webp';
    }
    if (bytes.length>=4 && bytes[0]===255 && bytes[1]===216) {
      let at=2,sawScan=false;
      while(at<bytes.length) {
        if(bytes[at++]!==255)fail(); while(bytes[at]===255)at++;
        const marker=bytes[at++];
        if(marker===217) { if(at!==bytes.length||!sawScan)fail(); return 'image/jpeg'; }
        if(marker===1)continue;
        if(at+2>bytes.length)fail(); const size=view.getUint16(at); if(size<2||at+size>bytes.length)fail(); at+=size;
        if(marker===218) {
          sawScan=true;
          while(at<bytes.length) { if(bytes[at]!==255){at++;continue;}const next=bytes[at+1];if(next===0||(next>=208&&next<=215)){at+=2;continue;}break; }
        }
      }
      fail();
    }
    if(bytes.length>=14 && ['GIF87a','GIF89a'].includes(text(0,6))) {
      let at=13+(bytes[10]&128 ? 3*(2**((bytes[10]&7)+1)) : 0),sawImage=false;
      const blocks=()=>{while(at<bytes.length){const size=bytes[at++];if(!size)return;at+=size;if(at>bytes.length)fail();}fail();};
      while(at<bytes.length){const block=bytes[at++];if(block===59){if(at!==bytes.length||!sawImage)fail();return 'image/gif';}if(block===33){at++;blocks();}else if(block===44){if(at+9>bytes.length)fail();const packed=bytes[at+8];at+=9+(packed&128?3*(2**((packed&7)+1)):0);at++;blocks();sawImage=true;}else fail();}
      fail();
    }
    throw new Error('This artwork format could not be verified for export.');
  }
  async function originalBytes(response) {
    if (!response.ok || !response.body) throw new Error('The original image host did not respond.');
    const reader=response.body.getReader(), chunks=[];
    let length=0;
    try {
      while(true) { const {done,value}=await reader.read(); if(done)break; length+=value.byteLength; if(length>32*1024*1024)throw new Error('The original image is too large.'); chunks.push(value); }
    } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return {bytes,type:imageType(bytes)};
  }
  async function loadImage(url) {
    if (imageCache.has(url)) return imageCache.get(url);
    // An <img> load/decode can succeed for a partial PNG. Validate complete
    // bytes before decoding or caching; a ready composition must be whole.
    const alternate = proxyFor(url), routes = [];
    const promise = new Promise((resolve,reject) => {
      let done = false, started = 0, failed = 0, hedge;
      const finish = (winner, error) => {
        if (done) return;
        done = true; clearTimeout(deadline); clearTimeout(hedge);
        routes.forEach(route => {
          route.controller.abort();
          if(!winner)reloadSources.add(route.source);
          if(route.image) { route.image.onload=route.image.onerror=null; if(route!==winner)route.image.src=''; }
          if(route.objectUrl)URL.revokeObjectURL(route.objectUrl);
        });
        if (winner) resolve(winner.image); else reject(error);
      };
      const deadline = setTimeout(() => finish(null,new Error('Artwork took too long to respond.')),16000);
      const start = async source => {
        started++;
        const route={controller:new AbortController(),source}; routes.push(route);
        try {
          const response=await fetch(source,{mode:'cors',credentials:'omit',cache:reloadSources.has(source)?'reload':'default',signal:route.controller.signal});
          const {bytes,type}=await originalBytes(response);
          if(done)return;
          route.objectUrl=URL.createObjectURL(new Blob([bytes],{type}));
          const image=route.image=new Image();
          await new Promise((resolve,reject)=>{
            image.onload=resolve; image.onerror=()=>reject(new Error('The original image could not be decoded.'));
            image.src=route.objectUrl;
          });
          if(image.decode)await image.decode();
          if(!image.naturalWidth||!image.naturalHeight)throw new Error('Empty artwork');
          reloadSources.delete(source);
          finish(route);
        } catch (_) {
          if(done)return;
          failed++; reloadSources.add(source);
          route.controller.abort();
          if(route.objectUrl)URL.revokeObjectURL(route.objectUrl);
          if(started===1 && alternate!==url){clearTimeout(hedge);start(alternate);}
          else if(failed===started)finish(null,new Error('The complete original image could not be loaded.'));
        }
      };
      if (alternate !== url) hedge = setTimeout(() => start(alternate),2000);
      start(url);
    });
    imageCache.set(url,promise);
    promise.catch(() => { if (imageCache.get(url) === promise) imageCache.delete(url); });
    return promise;
  }
  async function prepareFonts(config) {
    const fallback = { mono: 'monospace', sans: 'sans-serif' };
    if (!document.fonts?.load) return fallback;
    // Never wait for the whole page's FontFaceSet.ready: one unrelated stalled
    // face would block every canvas forever. Only request the text we draw.
    const requests = [], loaded = new Set();
    if (config.brand || config.labels) requests.push(['mono','400 24px "Space Mono"', `${config.brand ? 'BULLENCIAGA bullenciaga.com' : ''} ${config.labels ? config.entries.map(e => e.name).join(' ') : ''}`]);
    if (config.caption) requests.push(['sans','500 24px Poppins',config.caption]);
    let timer;
    try {
      await Promise.race([
        Promise.all(requests.map(async ([key,font,text]) => { const faces = await document.fonts.load(font,text); if (faces.length) loaded.add(key); })),
        new Promise(resolve => { timer = setTimeout(resolve,1200); })
      ]);
    } catch (_) { /* The declared system fallback fonts remain usable. */ }
    finally { clearTimeout(timer); }
    return { mono: loaded.has('mono') ? '"Space Mono", monospace' : fallback.mono,
      sans: loaded.has('sans') ? 'Poppins, sans-serif' : fallback.sans };
  }
  async function paint(canvas, config, scale = 1, progress = () => {}) {
    const [width,height] = FORMAT[config.format] || FORMAT.banner;
    let loaded = 0, active = true, images, fonts;
    try { [images,fonts] = await Promise.all([
      Promise.all(config.entries.map(async entry => {
        try { const image = await loadImage(originalFor(entry)); if (active) progress(++loaded,config.entries.length); return image; }
        catch (_) { throw new Error(`${entry.name} could not load. Retry artwork or remove that piece.`); }
      })),
      config.fonts || prepareFonts(config)
    ]); } finally { active = false; }
    config.fonts = fonts;
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d'); ctx.scale(scale,scale);
    const palette = PALETTES[config.palette] || PALETTES.charcoal;
    ctx.fillStyle = palette.background; ctx.fillRect(0,0,width,height);
    const layout = layoutFor(width,height,images.length,config.layout);
    const fontSize = Math.min(width,height) * .024;
    ctx.textAlign = 'left'; ctx.fillStyle = palette.ink;
    if (config.brand) { ctx.font = `400 ${fontSize}px ${fonts.mono}`; ctx.fillText('B U L L E N C I A G A',layout.margin,layout.margin * 1.25); }
    if (config.caption) { ctx.font = `500 ${fontSize * 1.35}px ${fonts.sans}`; ctx.fillText(config.caption,layout.margin,layout.header - fontSize * .6,width-layout.margin*2); }
    layout.slots.forEach((slot,i) => {
      const img = images[i], ratio = Math.min(slot.w / img.naturalWidth, slot.h / img.naturalHeight);
      const w = img.naturalWidth * ratio, h = img.naturalHeight * ratio;
      ctx.drawImage(img,slot.x + (slot.w-w)/2,slot.y + (slot.h-h)/2,w,h);
      if (config.labels) { ctx.fillStyle = palette.ink; ctx.textAlign = 'center'; ctx.font = `400 ${Math.min(fontSize*.78,slot.w*.075)}px ${fonts.mono}`; ctx.fillText(config.entries[i].name,slot.x+slot.w/2,slot.y+slot.h+slot.label*.68,slot.w); }
    });
    if (config.brand) {
      ctx.fillStyle = palette.muted; ctx.textAlign = 'right'; ctx.font = `400 ${fontSize*.7}px ${fonts.mono}`;
      ctx.fillText('bullenciaga.com',width-layout.margin,height-layout.margin*.65);
    }
    return images;
  }
  async function drawPreview() {
    const token = ++studioRender, config = settings(), status = studioDialog.querySelector('#collector-render-status');
    const button = studioDialog.querySelector('#collector-export');
    const [w,h] = FORMAT[config.format];
    studioDialog.querySelector('#collector-dimensions').textContent = `${w.toLocaleString()} × ${h.toLocaleString()} PNG`;
    button.disabled = true; studioReady = 0; readyConfig = null;
    const retry = studioDialog.querySelector('#collector-retry'); retry.hidden = true;
    if (!config.entries.length) { status.textContent = 'Choose at least one piece to create an image.'; const c=studioDialog.querySelector('canvas'); c.getContext('2d').clearRect(0,0,c.width,c.height); return; }
    status.textContent = 'Loading original artwork…';
    try {
      const next = document.createElement('canvas');
      const images = await paint(next,config,Math.min(1,1500/Math.max(w,h)),(loaded,total) => {
        if (token === studioRender && studioDialog.open) status.textContent = `Loading original artwork… ${loaded}/${total}`;
      });
      if (token !== studioRender || !studioDialog.open) return;
      const canvas = studioDialog.querySelector('#collector-canvas'); canvas.width=next.width; canvas.height=next.height;
      canvas.getContext('2d').drawImage(next,0,0);
      const slots = layoutFor(w,h,images.length,config.layout).slots;
      const upscaled = images.some((img,i) => Math.min(slots[i].w/img.naturalWidth,slots[i].h/img.naturalHeight) > 1.05);
      status.textContent = upscaled ? 'Ready. Some artwork will be enlarged for this format; no detail is invented.' : 'Ready to download. Original artwork, full composition.';
      studioReady = token; readyConfig = config; button.disabled = exporting;
    } catch (error) { if (token === studioRender && studioDialog.open) { status.textContent = error.message; retry.hidden = false; } }
  }
  async function exportImage() {
    const config = readyConfig, button = studioDialog.querySelector('#collector-export'), status = studioDialog.querySelector('#collector-render-status');
    if (!config?.entries.length || exporting || studioReady !== studioRender) return;
    const token = studioRender; exporting = true;
    button.disabled = true; button.textContent = 'Preparing PNG…';
    try {
      const canvas = document.createElement('canvas'); await paint(canvas,config);
      const blob = await new Promise((resolve,reject) => { try { canvas.toBlob(b => b ? resolve(b) : reject(new Error('This browser could not create the PNG.')), 'image/png'); } catch (_) { reject(new Error('The image host blocked export. Remove the unavailable piece and try again.')); } });
      if (token !== studioRender || !studioDialog.open) return;
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href=url; a.download=`BULLENCIAGA-${config.format}-${FORMAT[config.format].join('x')}.png`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),30000);
      status.textContent = 'PNG ready. On iPhone, save the downloaded image to Photos.'; dirty=false;
    } catch (error) {
      if (token === studioRender && studioDialog.open) { studioReady = 0; status.textContent = error.message; studioDialog.querySelector('#collector-retry').hidden = false; }
    } finally { exporting = false; button.disabled = studioReady !== studioRender; button.textContent='Download PNG ↗'; }
  }
  function mountGallery(api) {
    bridge=api;
    const target=document.querySelector('.gallery-tabs');
    if (!target || document.getElementById('collector-gallery-tools')) return;
    const bar=document.createElement('div'); bar.id='collector-gallery-tools'; bar.className='collector-gallery-tools';
    bar.innerHTML=`<button type="button" class="btn" id="collector-open-shortlist">${icon} Shortlist <span data-shortlist-count>0</span></button><button type="button" class="btn" id="collector-open-studio">Create an image</button>`;
    target.after(bar);
    bar.querySelector('#collector-open-shortlist').onclick=openShortlist;
    bar.querySelector('#collector-open-studio').onclick=async event => {
      const button=event.currentTarget; button.disabled=true; button.textContent='Opening studio…';
      try { const mine=await api.studioEntries(); await openStudio({items:mine.items,label:mine.label}); }
      catch (_) { showToast('The collection could not be loaded. Please try again.'); }
      finally { button.disabled=false; button.textContent='Create an image'; }
    };
    updateSavedControls();
  }
  function mountPassport(items, label = 'From this wallet’s collection') {
    register(items);
    document.querySelectorAll('[data-passport-studio]').forEach(button => { button.onclick = () => openStudio({items,label}); });
    document.querySelectorAll('[data-studio-piece]').forEach(button => { button.onclick = () => openStudio({items,label,selectedKey:button.dataset.studioPiece}); });
  }
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE && event.key !== null) return;
    saved=parseSaved(event.newValue); register(saved); updateSavedControls();
    if (shortlistDialog?.open) renderShortlist();
  });
  window.BullenCollectors = { attachCard, mountGallery, mountPassport, openStudio, openShortlist, cleanEntry, parseSaved, layoutFor, FORMAT, originalFor, isHerdName };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-public-studio]').forEach(button => button.onclick=() => openStudio());
  });
})();
