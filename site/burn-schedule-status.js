/* Completion is established by burn receipts, never inferred from trading volume. */
(function () {
  'use strict';
  const tranches = [12500000, 25000000, 37500000, 62500000, 112500000];
  let pending;
  async function load() {
    if (pending) return pending;
    pending = (async () => {
      const response = await fetch('/supply/proof', {cache:'no-store', signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error('Burn receipts unavailable');
      const data = await response.json();
      if (data.ok !== true || !Array.isArray(data.burns) || data.count !== data.burns.length) throw new Error('Incomplete burn receipts');
      const seen = new Set();
      for (const row of data.burns) {
        if (typeof row.sig !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(row.sig) || seen.has(row.sig) || !Number.isFinite(row.amount) || row.amount <= 0) throw new Error('Invalid burn receipt');
        seen.add(row.sig);
      }
      const tiers = data.burns.filter(row => row.kind === 'tier').map(row => row.amount).sort((a,b) => a-b);
      if (tiers.length > tranches.length || tiers.some((amount,i) => amount !== tranches[i])) throw new Error('Unrecognized schedule receipts');
      return {count:tiers.length, burned:tiers.reduce((sum,n)=>sum+n,0), checkedAt:Date.now()};
    })();
    try { return await pending; } finally { pending = null; }
  }
  window.BullenBurnSchedule = {load};
})();
