/* Read-only entry lookup for the completed campaign. Final awards are static HTML;
   the original draw API remains a separate, immutable historical record. */
(() => {
  const form = document.getElementById('h777-form');
  if (!form) return;
  const input = document.getElementById('h777-wallet');
  const output = document.getElementById('h777-result');
  const button = form.querySelector('button');
  const snapshotHash = 'e891262f5867a95222719f92cbd4d1e9d9ddbb8f9d2e011fe8523f8484d14081';
  let requestId = 0, controller;
  function validAddress(value) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let n = 0n, bytes = 0;
    for (const character of value) n = n * 58n + BigInt(alphabet.indexOf(character));
    for (; n > 0; n >>= 8n) bytes++;
    return bytes + (value.match(/^1*/)?.[0].length || 0) === 32;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    controller?.abort();
    const id = ++requestId, wallet = input.value.trim();
    output.dataset.result = '';
    button.disabled = false;
    if (!validAddress(wallet)) {
      output.textContent = 'Enter a complete Solana wallet address.';
      input.focus();
      return;
    }
    controller = new AbortController();
    button.disabled = true;
    output.textContent = 'Checking the sealed closing entries…';
    try {
      const response = await fetch('/herd777-api/entries?wallet=' + encodeURIComponent(wallet), {
        cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
      });
      const data = await response.json();
      if (id !== requestId) return;
      if (!response.ok || data.campaign !== 'herd777-250m' || data.ready !== true || data.phase !== 'drawn' ||
          data.snapshotHash !== snapshotHash || data.observedSlot !== 455416504 || data.wallet !== wallet ||
          typeof data.entries !== 'string' || !/^\d+$/.test(data.entries)) throw Error('Unverified closing entries');
      output.textContent = BigInt(data.entries).toLocaleString('en-US') + ' entries recorded at closing. This campaign is completed.';
      output.dataset.result = 'ready';
    } catch {
      if (id !== requestId) return;
      output.textContent = 'The closing entry record could not be loaded. Please try again. The final awards above are unchanged.';
    } finally {
      if (id === requestId) button.disabled = false;
    }
  });
  addEventListener('pagehide', () => { ++requestId; controller?.abort(); button.disabled = false; });
  addEventListener('pageshow', event => {
    if (event.persisted && output.dataset.result !== 'ready') output.textContent = 'Read-only check. No connection. No signature.';
  });
})();
