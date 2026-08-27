import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const publicPages = [
  'index.html', 'stats.html', 'chart.html', 'curve.html', 'proof.html',
  'transparency.html', 'refer.html', 'thedrop.html', 'giveaways.html',
];
const failures = [];

for (const name of [...publicPages, 'referrals.html']) {
  const source = fs.readFileSync(path.join(site, name), 'utf8');
  if (!source.includes('href="/bullen-ui.css"')) failures.push(`${name}: shared visual tokens missing`);
  if (!source.includes('src="/bullen-ui.js"')) failures.push(`${name}: shared shell/accessibility helper missing`);
  if (/<button(?![^>]*\btype=)[^>]*>/i.test(source)) failures.push(`${name}: button without an explicit type`);
}

const shell = fs.readFileSync(path.join(site, 'bullen-ui.js'), 'utf8');
if (!shell.includes("page === 'referrals'")) failures.push('admin page classification missing');
if (!shell.includes("if (page === 'index') return")) failures.push('homepage duplicate-navigation guard missing');
if (!shell.includes("aria-current")) failures.push('active-page navigation state missing');

const authority = JSON.parse(fs.readFileSync(path.join(site, 'giveaways.json'), 'utf8'));
if (authority.schema !== 'bullenciaga.giveaways.v1') failures.push('giveaway authority schema mismatch');
for (const id of ['follow500', 'mint-round-0', 'mint-round-1', 'mint-round-2', 'mint-round-3', 'mint-final']) {
  if (!authority.campaigns.some((campaign) => campaign.id === id)) failures.push(`giveaway authority missing ${id}`);
}
const round3 = authority.campaigns.find((campaign) => campaign.id === 'mint-round-3');
if (round3?.round !== 3 || round3?.trigger?.target !== 650 || round3?.status !== 'upcoming'
    || round3?.qualification?.minPieces !== 6 || round3?.qualification?.minTokens !== 1_000_000
    || round3.snapshot || round3.result) {
  failures.push('round 3 must remain visibly gated with no fabricated snapshot or result');
}
if (authority.finalCarryover?.wallets !== 32 || authority.finalCarryover?.bankedEntries !== 62) {
  failures.push('giveaway authority carryover is missing or incorrect');
}

const giveaways = fs.readFileSync(path.join(site, 'giveaways.html'), 'utf8');
for (const state of ['Active', 'Upcoming', 'Completed', 'Paid']) {
  if (!giveaways.includes(`'${state.toLowerCase()}', '${state}'`)) failures.push(`giveaways page missing ${state} state`);
}
if (!giveaways.includes('No draw or payment state is inferred')) failures.push('giveaways page does not fail closed');
if (!giveaways.includes("link(campaign.payoutProof, 'Payout proof')")) failures.push('giveaways page omits payout-proof links');

const home = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
if (!home.includes("{ id: 'giveaway', label: 'Giveaway' }")) failures.push('homepage Jump To menu omits the live giveaway');
if (!home.includes("{ url: 'giveaways.html', label: 'All Giveaways' }")) failures.push('homepage omits the campaign ledger link');
if (!home.includes("fetch('/giveaways.json'")) failures.push('homepage giveaway card is not driven by the campaign authority');
if (home.includes("const ENTRY_MESSAGE = 'bullenciaga giveaway entry")) failures.push('homepage duplicates the campaign signature message');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`standalone contract: ok (${publicPages.length} public pages + 1 unlisted admin page)`);
