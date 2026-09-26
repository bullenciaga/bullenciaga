(() => {
  const row = document.getElementById('athRecord');
  if (!row) return;
  const value = document.getElementById('athPrice');
  const date = document.getElementById('athDate');
  const reading = row.querySelector('.ath-reading');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let busy = false, expires = 0, expiryTimer, revision = 0, shown = '';
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function present(text, stamp, state, title = '') {
    const key = [text, stamp, state].join('|');
    if (key === shown) return;
    const version = ++revision;
    reading.classList.add('is-changing');
    if (!reduced.matches) await pause(160);
    if (version !== revision) return;
    value.textContent = text;
    value.dataset.reading = state;
    date.textContent = stamp;
    row.title = title;
    shown = key;
    reading.setAttribute('aria-busy', 'false');
    reading.classList.remove('is-changing');
  }
  function unavailable() {
    expires = 0;
    clearTimeout(expiryTimer);
    return present('Unavailable', '', 'unavailable', 'CoinGecko’s ATH record is temporarily unavailable. Use the source link to check.');
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const response = await fetch('/volume/ath', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      const now = Date.now(), at = Date.parse(data.athAt), fetched = Date.parse(data.fetchedAt), end = Date.parse(data.expiresAt);
      if (data.ok !== true || data.source !== 'CoinGecko' || typeof data.priceUsd !== 'number' || !Number.isFinite(data.priceUsd) || data.priceUsd <= 0 ||
          !Number.isFinite(at) || at <= 0 || at > now + 120000 || !Number.isFinite(fetched) || fetched > now + 120000 ||
          !Number.isFinite(end) || end <= now || end > fetched + 600000 || fetched < now - 600000) throw new Error('Invalid record');
      expires = end;
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(unavailable, Math.max(0, end - now));
      const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 6 }).format(data.priceUsd);
      const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(at);
      await present(usd, day + ' · UTC', 'ready', 'CoinGecko-reported ATH · checked ' + new Date(fetched).toUTCString());
    } catch { await unavailable(); }
    finally { busy = false; }
  }
  function resume() {
    if (expires && expires <= Date.now()) void unavailable();
    void refresh();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  addEventListener('pageshow', event => { if (event.persisted) resume(); });
  addEventListener('online', resume);
  setInterval(refresh, 300000);
  void refresh();
})();
