(() => {
  'use strict';
  const MINT = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
  const SOL = 'So11111111111111111111111111111111111111112';
  const SHARE_URL = 'https://bullenciaga.com/buy';
  const $ = id => document.getElementById(id);
  const handoff = window.BullenMobileBuy;
  const wallets = window.BullenWalletChooser?.wallets || [];
  const finite = value => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const positive = value => finite(value) > 0 ? Number(value) : null;
  const usd = value => finite(value) === null ? '—' : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(value);
  const price = value => positive(value) === null ? '—' : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumSignificantDigits:5 }).format(value);
  let noticeTimer;
  function notice(message) { $('copy-status').textContent = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('copy-status').textContent = ''; }, 4000); }
  $('copy-contract').addEventListener('click', async () => {
    try { await handoff.copyText(MINT); notice('Contract copied.'); }
    catch { notice('Copy unavailable. Select and copy the contract above.'); const range = document.createRange(); range.selectNodeContents($('bullen-contract')); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  });
  $('share-buy').addEventListener('click', async () => {
    try { if (navigator.share) await navigator.share({ title:'Buy $BULLEN', url:SHARE_URL }); else { await handoff.copyText(SHARE_URL); notice('Buy-page link copied.'); } }
    catch(error) { if (error.name !== 'AbortError') notice('Share bullenciaga.com/buy'); }
  });
  document.querySelectorAll('[data-route=jupiter]').forEach(link => { link.href = handoff.jupiterSwapUrl(MINT); });
  document.querySelectorAll('[data-route=pump]').forEach(link => { link.href = handoff.pumpUrl(MINT); });
  let started = false;
  let pluginScript;
  let pluginTimer;
  const loading = $('swap-loading');
  function failedSwap() {
    if (started) return;
    $('swap-status').textContent = 'The embedded swap is unavailable. You can still use Jupiter web or a wallet below.';
    $('retry-swap').hidden = false;
  }
  function mountSwap() {
    if (started || !window.Jupiter?.init) return false;
    try {
      window.Jupiter.init({
        displayMode:'integrated', integratedTargetId:'jupiter-buy', autoConnect:false,
        formProps:{ initialInputMint:SOL, initialOutputMint:MINT, fixedMint:MINT, fixedAmount:false, swapMode:'ExactIn' },
        branding:{ logoUri:'https://bullenciaga.com/logo-200.png', name:'BULLENCIAGA' },
        containerStyles:{ width:'100%', maxWidth:'100%', height:'430px' }
      });
      started = true;
      clearTimeout(pluginTimer);
      // Only remove our loading message, never the plugin's own content.
      loading.remove();
      return true;
    } catch { failedSwap(); return false; }
  }
  function loadSwap() {
    if (mountSwap()) return;
    pluginScript?.remove();
    pluginScript = document.createElement('script');
    pluginScript.src = 'https://plugin.jup.ag/plugin-v1.js';
    pluginScript.async = true;
    pluginScript.onload = () => { if (!mountSwap()) failedSwap(); };
    pluginScript.onerror = failedSwap;
    document.head.append(pluginScript);
    clearTimeout(pluginTimer);
    pluginTimer = setTimeout(failedSwap, 15000);
  }
  $('retry-swap').addEventListener('click', () => { $('swap-status').textContent = 'Loading the swap…'; $('retry-swap').hidden = true; loadSwap(); });
  function setupWallet(link, wallet) {
    link.href = wallet.id === 'phantom' ? handoff.phantomSwapUrl(MINT) : wallet.id === 'solflare' ? handoff.solflareTokenUrl(MINT) : wallet.link();
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (wallet.provider()) {
        event.preventDefault();
        $('swap-heading').setAttribute('tabindex','-1');
        $('swap-heading').focus({ preventScroll:true });
        $('swap-heading').scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start' });
        notice('Use Connect Wallet in the Jupiter swap to continue.');
        if (!started) loadSwap();
      }
    });
  }
  for (const wallet of wallets) {
    let link = document.querySelector('[data-wallet="' + wallet.id + '"]');
    if (!link) {
      link = document.createElement('a'); link.className = 'route-card'; link.dataset.wallet = wallet.id;
      const icon = document.createElement('img'); icon.src = wallet.icon; icon.alt = ''; icon.width = 32; icon.height = 32;
      const copy = document.createElement('span'); const name = document.createElement('strong'); name.textContent = wallet.name;
      const detail = document.createElement('small'); detail.textContent = 'Open this swap in the app'; copy.append(name, detail);
      const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true'); link.append(icon,copy,arrow);
      $('other-wallets').append(link);
    }
    setupWallet(link,wallet);
  }
  function refreshDetectedWallets() {
    const detected = wallets.filter(wallet => wallet.provider());
    for (const wallet of detected) { const link = document.querySelector('[data-wallet="' + wallet.id + '"]'); link.querySelector('small').textContent = 'Available here · use the swap above'; link.href = '#swap-heading'; }
    if (detected.length) $('wallet-guidance').textContent = 'Wallet detected in this browser. Use Connect Wallet in the swap above to continue here.';
  }
  refreshDetectedWallets();
  setTimeout(refreshDetectedWallets, 1200);
  window.addEventListener('focus',refreshDetectedWallets);
  loadSwap();

  async function json(path, signal) {
    const response = await fetch(path, { cache:'no-store', signal:signal || AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Data unavailable');
    return response.json();
  }
  let marketBusy = false;
  async function refreshMarket() {
    if (marketBusy) return;
    marketBusy = true;
    const [market, supply] = await Promise.allSettled([json('/volume'), json('/supply')]);
    if (market.status === 'fulfilled' && market.value.ok === true && positive(market.value.price) !== null) {
      const d = market.value;
      $('market-price').textContent = price(d.price);
      $('market-volume').textContent = finite(d.volume24h) >= 0 ? usd(d.volume24h) : '—';
      $('market-liquidity').textContent = positive(d.liquidityUsd) !== null ? usd(d.liquidityUsd) : '—';
      const s = supply.status === 'fulfilled' && supply.value.mint === MINT ? supply.value : {};
      $('market-cap').textContent = positive(s.circulatingSupply) !== null ? usd(d.price * s.circulatingSupply) : '—';
      $('market-fdv').textContent = positive(s.totalSupply) !== null ? usd(d.price * s.totalSupply) : '—';
      const stamp = positive(d.fetchedAt);
      const stale = d.marketStale || !stamp || Date.now() - stamp > 10 * 60 * 1000;
      $('market-status').textContent = (stale ? 'Delayed snapshot' : 'Updated') + (stamp ? ' · ' + new Date(stamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '') + (s.circulatingSupply ? '' : ' · supply unavailable');
    } else {
      for (const id of ['market-price','market-volume','market-liquidity','market-cap','market-fdv']) $(id).textContent = '—';
      $('market-status').textContent = 'Market data unavailable. Buying options remain available.';
    }
    marketBusy = false;
  }
  let range = 'all';
  let chartController;
  let chartRequest = 0;
  async function refreshChart() {
    chartController?.abort(); chartController = new AbortController();
    const controller = chartController;
    const request = ++chartRequest;
    const selectedRange = range;
    const rangeLabel = selectedRange === 'all' ? 'all time' : selectedRange;
    $('market-change').textContent = '— · ' + rangeLabel;
    $('market-change').className = '';
    $('price-chart').setAttribute('hidden',''); $('chart-empty').hidden = false; $('chart-empty').textContent = 'Loading price history…';
    const timer = setTimeout(() => controller.abort(),12000);
    try {
      const d = await json('/ohlcv?tf=' + selectedRange, controller.signal);
      if (request !== chartRequest) return;
      if (d.ok !== true || !Array.isArray(d.candles)) throw new Error();
      const byTime = new Map();
      for (const c of d.candles) if (Array.isArray(c) && positive(c[0]) !== null && positive(c[4]) !== null) byTime.set(Number(c[0]),Number(c[4]));
      const now = Date.now();
      const cutoff = selectedRange === 'all' ? 0 : now - (selectedRange === '7d' ? 7 : 1) * 86400000;
      const points = [...byTime].filter(([time]) => time >= cutoff && time <= now).sort((a,b) => a[0]-b[0]);
      if (points.length < 2) throw new Error();
      const start = points[0][0], end = points.at(-1)[0];
      // Use the same closing prices as the chart, independent of the market snapshot.
      const change = finite((points.at(-1)[1] / points[0][1] - 1) * 100);
      const roundedChange = change === null ? null : Number(change.toFixed(2));
      $('market-change').textContent = roundedChange === null ? rangeLabel + ' change unavailable' : (roundedChange > 0 ? '+' : '') + roundedChange.toFixed(2) + '% · ' + rangeLabel;
      $('market-change').className = roundedChange > 0 ? 'positive' : roundedChange < 0 ? 'negative' : '';
      const low = Math.min(...points.map(p=>p[1])), high = Math.max(...points.map(p=>p[1]));
      const span = high-low || high * .02;
      const coords = points.map(([t,v]) => [((t-start)/(end-start)*632+4).toFixed(2),(145-(v-low)/span*120).toFixed(2)]);
      const line = coords.map(([x,y],i) => (i?'L':'M') + x + ',' + y).join(' ');
      $('chart-line').setAttribute('d',line); $('chart-area').setAttribute('d',line + ' L636,170 L4,170 Z');
      $('chart-description').textContent = '$BULLEN USD price from ' + new Date(start).toLocaleString() + ' to ' + new Date(end).toLocaleString() + '. Low ' + price(low) + ', high ' + price(high) + '.';
      const format = t => new Date(t).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      $('chart-start').textContent = format(start); $('chart-end').textContent = format(end);
      $('price-chart').removeAttribute('hidden'); $('chart-empty').hidden = true;
    } catch {
      if (request !== chartRequest) return;
      $('market-change').textContent = rangeLabel + ' change unavailable';
      $('market-change').className = '';
      $('chart-empty').textContent = 'Price history unavailable for this range.';
      $('chart-start').textContent = '—'; $('chart-end').textContent = '—';
    } finally { clearTimeout(timer); }
  }
  document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
    range = button.dataset.range;
    document.querySelectorAll('[data-range]').forEach(item => item.setAttribute('aria-pressed',String(item === button)));
    refreshChart();
  }));
  refreshMarket(); refreshChart();
  setInterval(() => { if (!document.hidden) { refreshMarket(); refreshChart(); } },60000);
})();
