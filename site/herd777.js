/* Public, read-only live campaign view. No wallet connection or client-side scoring. */
(() => {
  const form = document.getElementById('h777-form');
  if (!form) return;
  const el = id => document.getElementById('h777-' + id);
  const input = el('wallet'), output = el('result'), button = form.querySelector('button');
  let wallet = '', requestId = 0, timer, latestSlot = 0, ready = false, destroyed = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const integer = value => typeof value === 'string' && /^\d+$/.test(value);
  function validAddress(value) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let n = 0n, bytes = 0;
    for (const character of value) n = n * 58n + BigInt(alphabet.indexOf(character));
    for (; n > 0; n >>= 8n) bytes++;
    return bytes + (value.match(/^1*/)?.[0].length || 0) === 32;
  }
  function tokens(raw) {
    const n = BigInt(raw), whole = (n / 1000000n).toLocaleString('en-US');
    const fraction = String(n % 1000000n).padStart(6, '0').replace(/0+$/, '');
    return whole + (fraction ? '.' + fraction : '');
  }
  const date = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' UTC';
  async function display(data, id) {
    if (data.campaign !== 'herd777-250m' || data.targetRaw !== '250000000000000' || data.entryUnitRaw !== '1000000') throw Error('Unexpected campaign');
    if (!data.ready) {
      el('status').textContent = data.phase === 'not-started' ? 'The campaign count is being prepared. Check back shortly.' : 'Verifying the full history. The count will appear when reconciliation is complete.';
      if (wallet) output.textContent = 'Entries are being verified. Please check again shortly; no total is assumed.';
      return;
    }
    if (!integer(data.buyRaw) || !integer(data.remainingRaw) || !Number.isSafeInteger(data.observedSlot) || !Number.isSafeInteger(data.observedAt) || (wallet && (!integer(data.entries) || data.wallet !== wallet))) throw Error('Unverified response');
    if (data.observedSlot < latestSlot) return;
    latestSlot = data.observedSlot;
    const bought = el('bought');
    if (!ready && !reduced.matches) {
      bought.style.opacity = '0';
      await new Promise(resolve => setTimeout(resolve, 150));
      if (id !== requestId || destroyed) { bought.style.opacity = ''; return; }
    }
    const amount = Number(data.buyRaw) / 1000000, percent = amount / 250000000 * 100;
    bought.classList.remove('h777-loading');
    bought.textContent = amount >= 1000000 ? (amount / 1000000).toFixed(2) + 'M' : tokens(data.buyRaw);
    bought.style.opacity = '';
    el('percent').textContent = Math.min(percent, 100).toFixed(2) + '%';
    el('bar').value = Math.min(amount, 250000000);
    el('remaining').textContent = tokens(data.buyRaw) + ' bought · ' + tokens(data.remainingRaw) + ' to go';
    el('observed').textContent = 'Verified · ' + date(data.observedAt);
    el('progress').setAttribute('aria-busy', 'false');
    el('status').textContent = data.phase === 'drawn' ? 'Complete. The five winning wallets are below.' : ['sealed', 'committed'].includes(data.phase) ? 'Target reached. Entries are sealed; the draw is being verified.' : data.phase === 'review' ? 'Selection is paused for verification. The sealed entries are unchanged.' : data.catchingUp ? 'Verification is catching up. Showing the last verified count.' : 'Counting qualifying buys. Wallet entries update with each verified snapshot.';
    if (data.snapshotHash) el('snapshot-link').hidden = false;
    if (wallet) {
      output.textContent = BigInt(data.entries).toLocaleString('en-US') + ' entries · ' + date(data.observedAt) + '. ' + (data.phase === 'live' ? 'Keep qualifying tokens in this wallet through the closing snapshot.' : 'These are the entries recorded at closing.') + (data.catchingUp ? ' A fresh verification is pending.' : '');
      output.dataset.result = 'ready';
    }
    if (data.phase === 'drawn' && Array.isArray(data.winners) && data.winners.length === 5) {
      const list = el('winner-list'); list.replaceChildren();
      for (const winner of data.winners) {
        if (![777, 703, 159, 31, 959].includes(winner.position) || !validAddress(winner.wallet)) throw Error('Invalid draw record');
        const li = document.createElement('li'), link = document.createElement('a');
        link.href = 'https://solscan.io/account/' + winner.wallet;
        link.textContent = winner.wallet; link.target = '_blank'; link.rel = 'noopener noreferrer';
        li.append('HERD #' + winner.position + ' → ', link); list.append(li);
      }
      el('winners').hidden = false;
    }
    ready = true;
  }
  async function refresh() {
    clearTimeout(timer);
    if (destroyed || document.hidden) return;
    const id = ++requestId; let delay = 30000;
    try {
      const response = await fetch('/herd777-api/' + (wallet ? 'entries?wallet=' + encodeURIComponent(wallet) : 'status'), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (id !== requestId || destroyed) return;
      if (!response.ok && !(response.status === 503 && data.ready === false)) throw Error('Unavailable');
      await display(data, id);
    } catch {
      if (id !== requestId || destroyed) return;
      delay = 60000;
      el('status').textContent = ready ? 'Refresh unavailable. Showing the last verified count; retrying shortly.' : 'Verification is temporarily unavailable. Retrying shortly.';
      if (!ready) { el('bought').textContent = 'awaiting data'; el('remaining').textContent = 'No unverified total is displayed.'; }
      if (wallet) { output.textContent = 'A verified entry total could not be loaded. Please try again.'; output.dataset.result = ''; }
    } finally {
      if (id === requestId && !destroyed) { button.disabled = false; timer = setTimeout(refresh, delay); }
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!validAddress(value)) { output.textContent = 'Enter a complete Solana wallet address.'; input.focus(); return; }
    wallet = value; button.disabled = true; output.dataset.result = '';
    output.textContent = 'Checking the latest verified entries…'; refresh();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else refresh(); });
  addEventListener('pagehide', () => { destroyed = true; clearTimeout(timer); });
  addEventListener('pageshow', event => { if (event.persisted) { destroyed = false; refresh(); } });
  refresh();
})();
