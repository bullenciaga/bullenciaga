import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FOLLOW500_PRIZES, validateFollow500Status, validateFollow500Result, follow500View, loadFollow500, renderFollow500Details, verifyFollow500Proof } from '../site/follow500.js';

const now = Date.parse('2026-09-09T20:00:00Z');
const base = {
  ok: true, campaign: 'follow500', phase: 'armed', armed: true, closed: false,
  followers: { count: 498, observedAt: new Date(now).toISOString(), target: 500, account: 'bullenciagax' },
  target: 500, entryCount: 32, eligibleCount: null, closedAt: null, drawnAt: null,
  proofURLs: { snapshot: 'https://bullenciaga.com/entries/snapshot', result: 'https://bullenciaga.com/entries/result' }, error: null,
};
// Public-looking fixture wallets, never production entrants.
const wallets = FOLLOW500_PRIZES.map(([, assetId]) => assetId);
const result = {
  ok: true, campaign: 'follow500', manualDelivery: true, payoutStatus: 'awaiting-owner',
  snapshotHash: 'a'.repeat(64),
  seed: { chain: 'solana-mainnet-beta', targetSlot: 440000100, slot: 440000101, blockhash: '4'.repeat(44), selection: 'first-produced-slot-at-or-after-target' },
  algorithm: { name: 'sha256-rank-v1' },
  winners: FOLLOW500_PRIZES.map(([prizeNumber, assetId], index) => ({ rank: index + 1, wallet: wallets[index], prizeNumber, assetId, score: String(index + 1).repeat(64) })),
};
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
check(validateFollow500Status(base), 'current coordinator contract accepted');
const open = follow500View(base, null, now);
check(open.canEnter && open.group === 'active', 'current armed state enables entry');
check(renderFollow500Details(open).includes('498 <small>/ 500'), 'verified count is displayed');
check(!renderFollow500Details(open).includes('seed commitment ↗'), 'no snapshot link before commitment');
for (const invalid of [null, {}, { ...base, campaign: 'other' }, { ...base, closed: 'false' }, { ...base, phase: 'unknown' }, { ...base, entryCount: -1 }]) {
  check(!follow500View(invalid, null, now).canEnter, 'invalid or absent status cannot enable entry');
}
for (const phase of ['inactive', 'importing', 'review']) {
  const view = follow500View({ ...base, phase, armed: false }, null, now);
  check(!view.canEnter && view.group === 'pending', `${phase} does not claim open or completed`);
}
for (const phase of ['closed', 'committed', 'waiting-seed']) {
  const view = follow500View({ ...base, phase, closed: true, closedAt: new Date(now).toISOString(), eligibleCount: 28 }, null, now);
  check(!view.canEnter && view.group === 'pending', `${phase} preserves cutoff`);
  check(renderFollow500Details(view).includes('Entries closed'), `${phase} shows the cutoff timestamp`);
  check(!renderFollow500Details(view).includes('winning wallets</h4>'), `${phase} does not fabricate winners`);
}
check(!follow500View({ ...base, error: 'x_unavailable' }, null, now).canEnter, 'provider error pauses entry display');
check(!follow500View(base, null, now + 5 * 60_000 + 1).canEnter, 'stale follower count never keeps entry open');
check(!follow500View({ ...base, followers: { ...base.followers, count: 500 } }, null, now).canEnter, 'observed threshold cannot display open');
check(!follow500View({ ...base, followers: { ...base.followers, count: null } }, null, now).canEnter, 'unknown count does not become zero');
check(validateFollow500Result(result), 'complete result contract accepted');
const drawnStatus = { ...base, phase: 'drawn', closed: true, eligibleCount: 28, closedAt: new Date(now).toISOString(), drawnAt: new Date(now).toISOString() };
const drawn = follow500View(drawnStatus, result, now);
check(drawn.group === 'completed' && !drawn.canEnter, 'complete result moves campaign to completed');
const html = renderFollow500Details(drawn);
check((html.match(/class="f500-prize"/g) || []).length === 5, 'five prize-wallet rows rendered');
check(html.includes('Delivery pending.') && !html.includes('prizes sent'), 'selection is distinguished from delivery');
check(html.includes('/entries/snapshot') && html.includes('/entries/result'), 'both public proof links available');
check(!html.includes('@') && !html.includes('xuser'), 'no entrant username fields rendered');
check(!renderFollow500Details(drawn, { compact: true }).includes('class="f500-prize"'), 'compact rendering links to winners without a duplicated table');
for (const edit of [
  { ...result, winners: result.winners.slice(0, 4) },
  { ...result, winners: result.winners.map((winner) => ({ ...winner, wallet: wallets[0] })) },
  { ...result, winners: [...result.winners].reverse() },
  { ...result, seed: { ...result.seed, slot: result.seed.targetSlot - 1 } },
  { ...result, manualDelivery: false },
  { ...result, winners: [{ ...result.winners[0], wallet: '"><img src=x onerror=alert(1)>' }, ...result.winners.slice(1)] },
]) {
  const view = follow500View(drawnStatus, edit, now);
  check(!view.canEnter && !view.result && view.group === 'pending', 'malformed or inconsistent winner records are not rendered');
}
const networkFailure = await loadFollow500(async () => { throw new Error('offline'); }, now);
check(!networkFailure.canEnter && networkFailure.label === 'Status unavailable', 'network failure visibly fails closed');
const statusFailure = await loadFollow500(async () => ({ ok: false, json: async () => base }), now);
check(!statusFailure.canEnter, 'non-success HTTP status does not unlock entry');
const resultFailure = await loadFollow500(async (url) => url.endsWith('/status') ? { ok: true, json: async () => drawnStatus } : { ok: false }, now);
check(!resultFailure.result && !resultFailure.canEnter, 'missing proof after draw never reopens entries');

const payload = { campaign: 'follow500', wallets: [...wallets].sort(), count: 5, seedCommitment: { targetSlot: result.seed.targetSlot } };
const snapshotHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const snapshot = { ...payload, snapshotHash, hashEncoding: 'fixture' };
const ranked = payload.wallets.map(wallet => ({ wallet, score: createHash('sha256').update(`follow500-v1\n${snapshotHash}\n${result.seed.blockhash}\n${wallet}\n`).digest('hex') })).sort((a, b) => a.score < b.score ? -1 : 1);
const computedResult = { ...result, snapshotHash, winners: ranked.map((row, index) => ({ ...row, rank: index + 1, prizeNumber: FOLLOW500_PRIZES[index][0], assetId: FOLLOW500_PRIZES[index][1] })) };
const verified = await verifyFollow500Proof(snapshot, computedResult);
check(verified.walletsChecked === 5 && verified.winnersChecked === 5, 'browser verifier reproduces independently hashed snapshot and ranking');
await assert.rejects(() => verifyFollow500Proof({ ...snapshot, count: 6 }, computedResult)); checks++;
await assert.rejects(() => verifyFollow500Proof({ ...snapshot, changed: true }, computedResult)); checks++;
await assert.rejects(() => verifyFollow500Proof(snapshot, { ...computedResult, winners: computedResult.winners.map((row,index) => ({ ...row, wallet: wallets[index] })) })); checks++;
console.log(`follower500 public UI: ${checks} checks passed`);
