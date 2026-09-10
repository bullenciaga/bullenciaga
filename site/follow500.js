/* Public, wallet-only presentation of the follower giveaway coordinator. */
export const FOLLOW500_ENDPOINTS = Object.freeze({ status: '/entries/status', snapshot: '/entries/snapshot', result: '/entries/result', amendment: '/follow500-amendment-20260910.json' });
export const FOLLOW500_PRIZES = Object.freeze([
  [168, 'FyT11Fpt4rSxBnn5Cs8CinKmrgr9117G9SKHh6ox7nzE'],
  [495, '3vTeUbBjAcQq3ZBda2uvbo28LKbkio4k6mRRaESMP3fx'],
  [737, 'H5YbaVZCmws5G2ET4BzsUgNQSm5GaaaAfq1xXJkFaF8s'],
  [773, '71EtMMZWExVkU1bV8kD9rHd2qR5mwAYzo6gsiNu7rEn7'],
  [950, 'n1gpdW3mjMpa2CZZgpNXptHtMGUT7DxHDvd8V2d49wc'],
]);
const phases = new Set(['inactive', 'importing', 'armed', 'closed', 'committed', 'waiting-seed', 'drawn', 'review']);
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const address = (value) => typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const dateLabel = (value) => validDate(value) ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : null;

export function validateFollow500Status(value) {
  if (!value || value.ok !== true || value.campaign !== 'follow500' || !phases.has(value.phase)
      || typeof value.closed !== 'boolean' || typeof value.armed !== 'boolean'
      || value.target !== 500 || !count(value.entryCount)
      || !(value.eligibleCount === null || count(value.eligibleCount))
      || !value.followers || value.followers.account !== 'bullenciagax' || !(value.followers.count === null || count(value.followers.count))
      || !(value.followers.observedAt === null || validDate(value.followers.observedAt))) return false;
  if (['closed', 'committed', 'waiting-seed', 'drawn'].includes(value.phase) && value.closed !== true) return false;
  if (value.phase === 'armed' && (!value.armed || value.closed)) return false;
  return true;
}

export function validateFollow500Result(value) {
  return !!value && value.ok === true && value.campaign === 'follow500' && value.manualDelivery === true && value.payoutStatus === 'awaiting-owner'
    && hash(value.snapshotHash) && value.algorithm?.name === 'sha256-rank-v1'
    && value.seed?.chain === 'solana-mainnet-beta' && count(value.seed.slot) && count(value.seed.targetSlot)
    && value.seed.slot >= value.seed.targetSlot && address(value.seed.blockhash)
    && Array.isArray(value.winners) && value.winners.length === 5
    && new Set(value.winners.map((winner) => winner.wallet)).size === 5
    && value.winners.every((winner, index) => winner.rank === index + 1 && address(winner.wallet)
      && winner.prizeNumber === FOLLOW500_PRIZES[index][0] && winner.assetId === FOLLOW500_PRIZES[index][1]
      && hash(winner.score));
}

export function follow500View(status = null, result = null, now = Date.now()) {
  const unavailable = { available: false, phase: 'unavailable', group: 'pending', label: 'Status unavailable', canEnter: false, entryLabel: 'STATUS UNAVAILABLE', count: null, entryCount: null, eligibleCount: null, observedAt: null, closedAt: null, snapshot: false, result: null, note: 'The live giveaway status could not be verified. Entry is paused here until it can be checked.' };
  if (!validateFollow500Status(status)) return unavailable;
  const view = { ...unavailable, available: true, phase: status.phase, count: status.followers.count, entryCount: status.entryCount, eligibleCount: status.eligibleCount, observedAt: status.followers.observedAt, closedAt: status.closedAt, snapshot: ['committed', 'waiting-seed', 'drawn'].includes(status.phase) };
  if (status.phase === 'drawn') {
    if (!validateFollow500Result(result)) return { ...view, label: 'Result awaiting verification', entryLabel: 'ENTRIES CLOSED', note: 'Entries are closed. The draw service reports completion, but its public result could not be verified on this page. Check the public record or return shortly.' };
    return { ...view, group: 'completed', label: 'Winners selected', entryLabel: 'ENTRIES CLOSED', result, note: 'Five distinct winning wallets have been selected. Prize delivery is handled manually by the owner and remains pending.' };
  }
  if (status.phase === 'review') return { ...view, label: 'Draw paused for review', entryLabel: status.closed ? 'ENTRIES CLOSED' : 'ENTRY PAUSED', note: 'The automatic process is paused for review. No winner or delivery is inferred; the existing campaign records are preserved.' };
  if (status.phase === 'inactive' || status.phase === 'importing') return { ...view, label: 'Preparing automation', entryLabel: 'ENTRY PAUSED', note: 'The existing entries are being preserved and the automatic cutoff is being prepared. Entry is paused here until readiness is verified.' };
  if (status.phase === 'closed') return { ...view, label: 'Entries closed', entryLabel: 'ENTRIES CLOSED', note: status.error ? 'The cutoff is recorded. Eligibility checks are waiting for a complete verification before the public snapshot can be committed.' : 'The cutoff is recorded. The entered usernames are being checked against the official follower list before the eligible wallets are frozen.' };
  if (status.phase === 'committed' || status.phase === 'waiting-seed') return { ...view, label: 'Snapshot fixed · Draw pending', entryLabel: 'ENTRIES CLOSED', note: 'The eligible wallet snapshot and future seed slot are fixed. Selection waits for the committed Solana block to finalize; retries use the same commitment.' };
  const age = now - Date.parse(status.followers.observedAt);
  const fresh = status.followers.count !== null && Number.isFinite(age) && age >= -60_000 && age <= 5 * 60_000;
  if (status.error || !fresh || status.followers.count >= 500) return { ...view, label: 'Status check pending', entryLabel: 'ENTRY PAUSED', note: 'Entry availability is being checked. The last observed follower count is shown below; no open state is assumed while verification is pending.' };
  return { ...view, group: 'active', label: 'Entries open · Automatic cutoff armed', canEnter: true, entryLabel: 'CONNECT WALLET', note: 'Entries close automatically at the first verified count of 500 followers. Five distinct wallets are selected from the published eligible snapshot using a future finalized Solana block.' };
}

export async function loadFollow500(fetcher = fetch, now = Date.now()) {
  try {
    const response = await fetcher(FOLLOW500_ENDPOINTS.status, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('status unavailable');
    const status = await response.json();
    if (!validateFollow500Status(status)) throw new Error('invalid status');
    let result = null;
    if (status.phase === 'drawn') {
      try {
        const resultResponse = await fetcher(FOLLOW500_ENDPOINTS.result, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
        if (resultResponse.ok) result = await resultResponse.json();
      } catch (_) { /* A closed campaign remains closed when proof cannot be loaded. */ }
    }
    const view = follow500View(status, result, now);
    if (!view.result) return view;
    try {
      const [snapshot, amendment] = await Promise.all([FOLLOW500_ENDPOINTS.snapshot, FOLLOW500_ENDPOINTS.amendment].map(async (url) => {
        const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error('amendment unavailable');
        return response.json();
      }));
      const verified = await verifyFollow500Amendment(snapshot, result, amendment);
      return { ...view, selectedWinners: verified.winners, amendment: verified.amendment, label: 'Winners selected · Owner amendment', note: 'Five prize recipients are listed below. HERD #737 has an owner-authorized replacement from the original random ranking. Manual delivery remains pending.' };
    } catch (_) {
      // Never fall back to the superseded recipient list when amendment proof
      // is unavailable or inconsistent with the immutable original draw.
      return { ...view, group: 'pending', result: null, label: 'Amended result awaiting verification', note: 'Entries are closed. The amended recipient list could not be verified. Check the public amendment and original draw records, or return shortly.' };
    }
  } catch (_) { return follow500View(); }
}

export function renderFollow500Details(view, { compact = false } = {}) {
  const observed = dateLabel(view.observedAt);
  const closed = dateLabel(view.closedAt);
  const stats = [
    `<div><b>${view.count === null ? '—' : view.count.toLocaleString()} <small>/ 500</small></b><span>Verified X followers</span></div>`,
    `<div><b>${view.entryCount === null ? '—' : view.entryCount.toLocaleString()}</b><span>Wallets entered</span></div>`,
    ...(view.eligibleCount !== null ? [`<div><b>${view.eligibleCount.toLocaleString()}</b><span>Eligible wallets</span></div>`] : []),
  ].join('');
  const result = view.result;
  const amendment = view.amendment;
  const recipients = view.selectedWinners || result?.winners;
  const winners = result && !compact ? `<div class="f500-winners"><h4>${amendment ? 'The five selected prize recipients' : 'The five winning wallets'}</h4><p>Delivery pending. The owner will send each prize directly to its selected wallet.</p><ol>${recipients.map((winner) => `<li><span class="f500-prize">HERD #${winner.prizeNumber}${winner.amended ? '<small>Owner replacement</small>' : ''}</span><a href="https://solscan.io/account/${winner.wallet}" target="_blank" rel="noopener noreferrer" aria-label="View selected wallet for HERD ${winner.prizeNumber}">${winner.wallet}</a></li>`).join('')}</ol></div>` : '';
  const proof = view.snapshot ? `<div class="f500-proof"><a href="${FOLLOW500_ENDPOINTS.snapshot}" target="_blank" rel="noopener">Snapshot &amp; seed commitment ↗</a>${result || view.phase === 'drawn' ? `<a href="${FOLLOW500_ENDPOINTS.result}" target="_blank" rel="noopener">Original draw result ↗</a><a href="${FOLLOW500_ENDPOINTS.amendment}" target="_blank" rel="noopener">Public amendment ↗</a>` : ''}${result && compact ? '<a href="/giveaways#follow500">See the five selected wallets ↗</a>' : ''}</div>` : '';
  const amendmentNote = amendment && !compact ? `<details class="f500-amendment"><summary>HERD #${amendment.replacement.prizeNumber} · Owner-authorized replacement</summary><p>Recorded ${escapeHtml(dateLabel(amendment.amendedAt))}. ${escapeHtml(amendment.reason)}</p><p>${escapeHtml(amendment.ruleDisclosure)}</p><p>Original recipient: <a href="https://solscan.io/account/${amendment.replacement.previousWallet}" target="_blank" rel="noopener noreferrer">${amendment.replacement.previousWallet}</a>.</p><p>The replacement above was next in the original random ranking, at rank ${amendment.replacement.originalRank}. The original five winners were excluded from replacement selection. The other four recipients, snapshot and seed are unchanged.</p></details>` : '';
  return `<div class="f500-details" data-phase="${escapeHtml(view.phase)}"><p class="f500-label">${escapeHtml(view.label)}</p><div class="f500-stats">${stats}</div><p class="f500-note">${escapeHtml(view.note)}</p>${observed ? `<p class="f500-time">Follower count observed ${escapeHtml(observed)}.</p>` : ''}${closed ? `<p class="f500-time">Entries closed ${escapeHtml(closed)}.</p>` : ''}${proof}${winners}${amendmentNote}${result && !compact ? `<details class="f500-method"><summary>How to check the draw${amendment ? ' and amendment' : ''}</summary><p>Each eligible wallet had one chance in the original draw. Wallets are ranked by the SHA-256 digest of the campaign tag, snapshot hash, finalized blockhash and wallet address. The lowest five scores selected the original winners.${amendment ? ' The owner amendment separately assigns HERD #737 to the next wallet in that same ranking, rank 6.' : ''}</p><p>Snapshot SHA-256: <code>${result.snapshotHash}</code></p><p>Committed target slot: ${result.seed.targetSlot.toLocaleString()}. Finalized seed slot: <a href="https://solscan.io/block/${result.seed.slot}" target="_blank" rel="noopener noreferrer">${result.seed.slot.toLocaleString()}</a>.</p><p>The original input format, winners and scores remain in the original draw result. X usernames are kept private.</p><button type="button" class="f500-verify" data-follow500-verify>Verify original draw &amp; replacement</button><p data-follow500-verification aria-live="polite"></p></details>` : ''}</div>`;
}

export async function verifyFollow500Proof(snapshot, result, digest = crypto.subtle) {
  if (!validateFollow500Result(result) || !snapshot || snapshot.campaign !== 'follow500'
      || !Array.isArray(snapshot.wallets) || snapshot.wallets.length < 5 || snapshot.count !== snapshot.wallets.length
      || !snapshot.wallets.every(address) || new Set(snapshot.wallets).size !== snapshot.wallets.length
      || snapshot.wallets.join('\n') !== [...snapshot.wallets].sort().join('\n')
      || snapshot.seedCommitment?.targetSlot !== result.seed.targetSlot) throw new Error('The public snapshot or result does not match the draw contract.');
  const sha256 = async (text) => Array.from(new Uint8Array(await digest.digest('SHA-256', new TextEncoder().encode(text))), (byte) => byte.toString(16).padStart(2, '0')).join('');
  // Property order is part of the published JSON hash encoding. Parse the
  // original response, then remove only these two non-payload hash fields.
  const { snapshotHash, hashEncoding, ...payload } = snapshot;
  const computed = await sha256(JSON.stringify(payload));
  if (computed !== snapshotHash || computed !== result.snapshotHash) throw new Error('The published snapshot hash does not match its contents.');
  const ranked = await Promise.all(snapshot.wallets.map(async (wallet) => ({ wallet, score: await sha256(`follow500-v1\n${computed}\n${result.seed.blockhash}\n${wallet}\n`) })));
  ranked.sort((a, b) => a.score < b.score ? -1 : a.score > b.score ? 1 : a.wallet < b.wallet ? -1 : 1);
  if (!result.winners.every((winner, index) => winner.wallet === ranked[index].wallet && winner.score === ranked[index].score)) throw new Error('The published winning wallets do not match the committed seed and snapshot.');
  return { snapshotHash: computed, walletsChecked: ranked.length, winnersChecked: 5, ranked };
}

export async function verifyFollow500Amendment(snapshot, result, amendment, digest = crypto.subtle) {
  const proof = await verifyFollow500Proof(snapshot, result, digest);
  const replacement = amendment?.replacement;
  const original = result.winners.find((winner) => winner.prizeNumber === replacement?.prizeNumber);
  const reserve = proof.ranked.find((row) => !result.winners.some((winner) => winner.wallet === row.wallet));
  if (amendment?.schema !== 'bullenciaga.follow500.amendment.v1' || amendment.campaign !== 'follow500'
      || amendment.revision !== 1 || amendment.type !== 'owner-authorized-exception'
      || amendment.manualDelivery !== true || amendment.payoutStatus !== 'awaiting-owner'
      || amendment.snapshotHash !== result.snapshotHash || amendment.seedBlockhash !== result.seed.blockhash
      || !validDate(amendment.amendedAt)
      || typeof amendment.reason !== 'string' || !amendment.reason.trim() || amendment.reason.length > 1000
      || typeof amendment.ruleDisclosure !== 'string' || !amendment.ruleDisclosure.trim() || amendment.ruleDisclosure.length > 1000
      || !original || !reserve || replacement.prizeNumber !== 737 || replacement.previousWallet !== original.wallet
      || replacement.assetId !== original.assetId || replacement.wallet !== reserve.wallet
      || replacement.originalRank !== 6 || replacement.score !== reserve.score) {
    throw new Error('The owner amendment does not match the original draw and next reserve wallet.');
  }
  const winners = result.winners.map((winner) => winner === original
    ? { ...winner, wallet: reserve.wallet, score: reserve.score, rank: replacement.originalRank, originalRank: replacement.originalRank, amended: true }
    : { ...winner });
  return { winners, amendment, proof };
}

export function installFollow500Verifier(root, fetcher = fetch) {
  root.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-follow500-verify]');
    if (!button || !root.contains(button) || button.disabled) return;
    const output = button.parentElement.querySelector('[data-follow500-verification]');
    button.disabled = true;
    output.textContent = 'Recomputing the public snapshot hash and all wallet scores…';
    try {
      const [snapshot, result, amendment] = await Promise.all([FOLLOW500_ENDPOINTS.snapshot, FOLLOW500_ENDPOINTS.result, FOLLOW500_ENDPOINTS.amendment].map(async (url) => {
        const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error('Public proof is temporarily unavailable. Try again shortly.');
        return response.json();
      }));
      const { proof } = await verifyFollow500Amendment(snapshot, result, amendment);
      output.textContent = `Verified: the original snapshot and five original winners match the published seed. The separate owner replacement for HERD #${amendment.replacement.prizeNumber} is the next wallet in that ranking, rank ${amendment.replacement.originalRank}. ${proof.walletsChecked} eligible wallets checked. This verifies the published calculations, not the owner's exception decision or prize delivery. The linked Solana block provides the chain record.`;
    } catch (error) { output.textContent = error.message || 'The public proof could not be verified.'; }
    finally { button.disabled = false; }
  });
}
