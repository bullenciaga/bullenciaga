(function () {
  'use strict';
  const feed = document.getElementById('ledger-feed');
  if (!feed) return;
  const state = document.getElementById('ledger-state');
  const updated = document.getElementById('ledger-updated');
  const tabs = Array.from(document.querySelectorAll('[data-filter]'));
  let events = [];
  let filter = 'all';

  const short = (value) => value ? `${String(value).slice(0, 6)}…${String(value).slice(-6)}` : '';
  const fmtTime = (value) => new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw', timeZoneName: 'short',
  }).format(new Date(value));
  const escape = (value) => String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

  function render() {
    const visible = filter === 'all' ? events : events.filter((item) => item.kind === filter);
    feed.classList.remove('is-loading');
    feed.setAttribute('aria-busy', 'false');
    if (!visible.length) {
      feed.innerHTML = '<div class="intel-empty">No events in this lane yet. An empty lane is reported as empty—not filled with estimates.</div>';
    } else {
      feed.innerHTML = visible.map((item) => {
        const href = item.url || (item.signature ? `https://solscan.io/tx/${encodeURIComponent(item.signature)}` : '');
        const source = href ? `<a href="${escape(href)}" target="_blank" rel="noreferrer">${escape(item.source || short(item.signature) || 'Open receipt')} ↗</a>` : escape(item.source || 'Public record');
        return `<article class="intel-event" data-kind="${escape(item.kind)}">
          <div><time datetime="${escape(item.at)}">${escape(fmtTime(item.at))}</time><div class="intel-event-id">${source}</div></div>
          <div><span class="intel-event-kind">${escape(item.kind)}</span><h2>${escape(item.title)}</h2><p>${escape(item.detail)}</p></div>
          <div class="intel-event-amount">${escape(item.amount || '')}</div>
        </article>`;
      }).join('');
    }
    document.getElementById('metric-events').textContent = String(visible.length).padStart(2, '0');
    document.getElementById('metric-supply').textContent = String(visible.filter((event) => event.kind === 'supply').length).padStart(2, '0');
    document.getElementById('metric-collectibles').textContent = String(visible.filter((event) => event.kind === 'collectible').length).padStart(2, '0');
    document.getElementById('metric-sources').textContent = String(new Set(visible.map((event) => event.source).filter(Boolean)).size).padStart(2, '0');
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    filter = tab.dataset.filter || 'all';
    tabs.forEach((item) => item.setAttribute('aria-pressed', String(item === tab)));
    render();
  }));

  async function load() {
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    try {
      const response = await fetch(local ? '/ledger-preview.json' : '/volume/ledger?limit=80', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`record returned ${response.status}`);
      const payload = await response.json();
      events = Array.isArray(payload.events) ? payload.events : [];
      state.textContent = payload.preview ? 'Predeploy dataset' : 'Live record';
      state.classList.toggle('is-preview', Boolean(payload.preview));
      updated.textContent = `Updated ${fmtTime(payload.updatedAt || Date.now())}`;
      render();
    } catch (error) {
      updated.textContent = 'Ledger unavailable';
      feed.classList.remove('is-loading');
      feed.setAttribute('aria-busy', 'false');
      feed.innerHTML = `<div class="intel-empty">The public event service is unavailable. Nothing has been substituted. ${escape(error.message)}</div>`;
    }
  }
  load();
})();
