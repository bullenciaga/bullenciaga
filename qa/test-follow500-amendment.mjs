import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  FOLLOW500_ENDPOINTS, FOLLOW500_PRIZES, follow500View, loadFollow500,
  renderFollow500Details, verifyFollow500Proof, verifyFollow500Amendment,
  installFollow500Verifier,
} from '../site/follow500.js';

// Synthetic public-looking inputs. No submitted handles or private entry data.
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const now = Date.parse('2026-09-10T03:00:00.000Z');
const wallets = [
  ...FOLLOW500_PRIZES.map(([, assetId]) => assetId),
  '1'.repeat(32), '2'.repeat(32), '3'.repeat(32),
].sort();
const payload = {
  campaign: 'follow500', wallets, count: wallets.length,
  seedCommitment: { targetSlot: 440000100 },
};
const snapshotHash = sha256(JSON.stringify(payload));
const snapshot = { ...payload, snapshotHash, hashEncoding: 'fixture JSON property order' };
const seed = { chain: 'solana-mainnet-beta', targetSlot: 440000100, slot: 440000101, blockhash: '4'.repeat(44) };
// Independently calculate all reserve ranks, not just the first five.
const ranked = wallets.map((wallet) => ({
  wallet, score: sha256(`follow500-v1\n${snapshotHash}\n${seed.blockhash}\n${wallet}\n`),
})).sort((a, b) => a.score < b.score ? -1 : a.score > b.score ? 1 : a.wallet.localeCompare(b.wallet));
const result = {
  ok: true, campaign: 'follow500', manualDelivery: true, payoutStatus: 'awaiting-owner',
  snapshotHash, seed, algorithm: { name: 'sha256-rank-v1' },
  winners: ranked.slice(0, 5).map((row, index) => ({
    ...row, rank: index + 1, prizeNumber: FOLLOW500_PRIZES[index][0], assetId: FOLLOW500_PRIZES[index][1],
  })),
};
const amendment = {
  schema: 'bullenciaga.follow500.amendment.v1', campaign: 'follow500', revision: 1,
  snapshotHash, seedBlockhash: seed.blockhash, amendedAt: '2026-09-10T02:00:00.000Z',
  type: 'owner-authorized-exception',
  reason: 'Owner-authorized replacement after the original selected wallet had zero BULLEN at a post-draw balance check.',
  ruleDisclosure: 'The original campaign required 100,000 BULLEN when entering. This is an owner exception after the draw, not a change to the original snapshot or ranking.',
  replacement: {
    prizeNumber: 737, assetId: FOLLOW500_PRIZES[2][1],
    previousWallet: ranked[2].wallet, wallet: ranked[5].wallet,
    originalRank: 6, score: ranked[5].score,
  },
  manualDelivery: true, payoutStatus: 'awaiting-owner',
};
const status = {
  ok: true, campaign: 'follow500', phase: 'drawn', armed: true, closed: true,
  followers: { count: 500, observedAt: '2026-09-10T00:00:00.000Z', target: 500, account: 'bullenciagax' },
  target: 500, entryCount: 10, eligibleCount: 8,
  closedAt: '2026-09-10T00:00:00.000Z', drawnAt: '2026-09-10T00:10:00.000Z', error: null,
};
const before = JSON.stringify({ snapshot, result, amendment });
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
async function rejects(value, message) {
  await assert.rejects(() => verifyFollow500Amendment(snapshot, result, value), undefined, message);
  checks++;
}
const amended = await verifyFollow500Amendment(snapshot, result, amendment);
check(amended.winners.length === 5, 'amendment keeps exactly five recipients');
check(new Set(amended.winners.map((winner) => winner.wallet)).size === 5, 'no recipient can receive two prizes');
check(amended.winners[2].wallet === ranked[5].wallet && amended.winners[2].originalRank === 6,
  'HERD 737 goes to the independently calculated next reserve, original rank six');
check(amended.winners[2].rank === 6 && amended.winners[2].amended === true,
  'replacement retains random rank six while occupying the third prize slot');
check(amended.winners[2].prizeNumber === 737 && amended.winners[2].assetId === FOLLOW500_PRIZES[2][1],
  'only the intended prize is amended');
for (const index of [0, 1, 3, 4]) {
  assert.deepEqual(amended.winners[index], result.winners[index], 'other four prize-wallet records stay byte-for-byte equivalent');
  checks++;
}
check(amended.amendment?.replacement.wallet === ranked[5].wallet, 'verified amendment accompanies displayed recipients');
check(amended.proof?.snapshotHash === snapshotHash, 'amendment retains original verified snapshot proof');
check(JSON.stringify({ snapshot, result, amendment }) === before, 'verification never mutates immutable draw inputs');

for (const [field, value] of [
  ['schema', 'other.schema'], ['campaign', 'other'], ['revision', 2],
  ['snapshotHash', 'f'.repeat(64)], ['seedBlockhash', '5'.repeat(44)],
  ['amendedAt', 'not a date'], ['type', 'redraw'], ['manualDelivery', false], ['payoutStatus', 'sent'],
]) await rejects({ ...amendment, [field]: value }, `invalid ${field} rejected`);
await rejects(null, 'missing amendment rejected');
await rejects({ ...amendment, replacement: null }, 'missing replacement rejected');
for (const [field, value] of [
  ['previousWallet', ranked[1].wallet], ['wallet', ranked[3].wallet],
  ['wallet', '6'.repeat(32)], ['assetId', FOLLOW500_PRIZES[0][1]], ['prizeNumber', 495],
  ['originalRank', 3], ['score', 'f'.repeat(64)], ['wallet', '"><img src=x onerror=alert(1)>'],
]) await rejects({ ...amendment, replacement: { ...amendment.replacement, [field]: value } }, `invalid replacement ${field} rejected`);
await rejects({ ...amendment, replacement: {
  ...amendment.replacement, wallet: ranked[6].wallet, originalRank: 7, score: ranked[6].score,
} }, 'a genuine but later reserve cannot skip the next ranked wallet');
await rejects({ ...amendment, replacement: {
  ...amendment.replacement, prizeNumber: 495,
  assetId: result.winners[1].assetId, previousWallet: result.winners[1].wallet,
} }, 'a coherent amendment for a different prize cannot change the owner-authorized HERD 737 exception');
await assert.rejects(() => verifyFollow500Amendment({ ...snapshot, changed: true }, result, amendment)); checks++;
await assert.rejects(() => verifyFollow500Amendment(snapshot, {
  ...result, winners: result.winners.map((winner, index) => index === 2 ? { ...winner, score: 'f'.repeat(64) } : winner),
}, amendment)); checks++;
const originalProof = await verifyFollow500Proof(snapshot, result);
check(originalProof.winnersChecked === 5 && originalProof.walletsChecked === 8, 'original draw independently remains verifiable');
check(originalProof.ranked?.[5].wallet === ranked[5].wallet, 'original verifier supplies full independently checked reserve ranking');

check(typeof FOLLOW500_ENDPOINTS.amendment === 'string' && FOLLOW500_ENDPOINTS.amendment.startsWith('/follow500-'),
  'public amendment URL stays outside immutable API routes');
const records = new Map([
  [FOLLOW500_ENDPOINTS.status, status], [FOLLOW500_ENDPOINTS.result, result],
  [FOLLOW500_ENDPOINTS.snapshot, snapshot], [FOLLOW500_ENDPOINTS.amendment, amendment],
]);
const requested = [];
const fetcher = async (url, options = {}) => {
  requested.push(url);
  assert.ok(!options.method || options.method === 'GET', 'presentation performs no request mutations');
  return { ok: records.has(url), json: async () => structuredClone(records.get(url)) };
};
const loaded = await loadFollow500(fetcher, now);
check(loaded.group === 'completed' && !loaded.canEnter, 'amended public campaign stays completed and closed');
check(loaded.selectedWinners?.[2].wallet === ranked[5].wallet && loaded.amendment?.revision === 1,
  'normal live loader displays the verified amended selection');
assert.deepEqual(loaded.result, result, 'normal loader preserves original result object'); checks++;
check([...records.keys()].every((url) => requested.includes(url)), 'normal loader checks status, original snapshot/result and amendment');

for (const failedUrl of [FOLLOW500_ENDPOINTS.snapshot, FOLLOW500_ENDPOINTS.amendment]) {
  const failed = await loadFollow500(async (url, options) => url === failedUrl ? { ok: false } : fetcher(url, options), now);
  check(!failed.canEnter && !failed.result && !failed.selectedWinners, 'missing amendment evidence never silently presents superseded winners');
  check(/amendment|updated|recipient|review|verif/i.test(`${failed.label} ${failed.note}`), 'unverified amendment has a visible pending explanation');
}
const invalidAmendment = await loadFollow500(async (url, options) => url === FOLLOW500_ENDPOINTS.amendment
  ? { ok: true, json: async () => ({ ...amendment, snapshotHash: 'f'.repeat(64) }) } : fetcher(url, options), now);
check(!invalidAmendment.canEnter && !invalidAmendment.result && !invalidAmendment.selectedWinners,
  'mismatched amendment fails closed instead of restoring old recipients');
const brokenJSON = await loadFollow500(async (url, options) => url === FOLLOW500_ENDPOINTS.amendment
  ? { ok: true, json: async () => { throw new SyntaxError('malformed JSON'); } } : fetcher(url, options), now);
check(!brokenJSON.result && !brokenJSON.canEnter, 'malformed amendment response cannot reopen or falsely complete the display');

const html = renderFollow500Details(loaded);
const winnerRows = html.match(/<ol>([\s\S]*?)<\/ol>/)?.[1] || '';
check((winnerRows.match(/class="f500-prize"/g) || []).length === 5, 'amended UI displays exactly five prize rows');
check(winnerRows.includes(ranked[5].wallet) && !winnerRows.includes(ranked[2].wallet),
  'main recipient table contains the replacement and excludes superseded recipient');
check(/owner|exception/i.test(html) && /amend/i.test(html), 'owner exception is expressly disclosed');
check(/original/i.test(html) && /rank.{0,20}6|6.{0,20}rank/i.test(html), 'replacement original rank six is visible');
check(html.includes(ranked[2].wallet), 'superseded wallet remains in public amendment history');
check(/when entering|at entry|on entry/i.test(html), 'published entry-time balance rule remains accurately disclosed');
check(html.includes(FOLLOW500_ENDPOINTS.result) && html.includes(FOLLOW500_ENDPOINTS.snapshot)
  && html.includes(FOLLOW500_ENDPOINTS.amendment), 'original proof and amendment each have public links');
check(!html.includes('The lowest five scores win, in the prize order shown above.'), 'amended table is not falsely described as original top-five output');
check(!html.includes('@') && !/xuser|username\s*:/i.test(html), 'private submitted handles never appear');
check(/pending/i.test(html) && !/prizes (?:sent|delivered)/i.test(html), 'manual delivery is not confused with completed draw');
const compact = renderFollow500Details(loaded, { compact: true });
check(/amend/i.test(compact), 'homepage compact summary also discloses amendment');
check(!compact.includes('class="f500-prize"'), 'homepage does not duplicate recipient table');

let click;
const output = { textContent: '' };
const button = { disabled: false, parentElement: { querySelector: () => output } };
const root = { addEventListener: (name, callback) => { if (name === 'click') click = callback; }, contains: () => true };
installFollow500Verifier(root, fetcher);
await click({ target: { closest: () => button } });
check(/verified/i.test(output.textContent) && /original/i.test(output.textContent),
  'interactive verification states that original draw is what the seed proves');
check(button.disabled === false, 'interactive verifier unlocks after completion');
check(JSON.stringify({ snapshot, result, amendment }) === before, 'all public read paths leave original inputs untouched');

console.log(`follower500 public amendment: ${checks} checks passed`);
