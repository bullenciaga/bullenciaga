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
  const ids = [...source.matchAll(/\bid=["']([^"']+)/g)]
    .map((match) => match[1]).filter((id) => !id.includes('${'));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) failures.push(`${name}: duplicate ids ${duplicateIds.join(', ')}`);
}

const shell = fs.readFileSync(path.join(site, 'bullen-ui.js'), 'utf8');
const shellCss = fs.readFileSync(path.join(site, 'bullen-ui.css'), 'utf8');
if (!shell.includes("page === 'referrals'")) failures.push('admin page classification missing');
if (!shell.includes("page === 'index' ? ' bullen-home-shell'")) failures.push('homepage top-shell navigation missing');
if (!shell.includes("bar.className = 'bullen-site-bar'")) failures.push('shared fixed-width header interior missing');
if (!shell.includes("toggle.className = 'bullen-nav-toggle'")) failures.push('responsive navigation toggle missing');
if (!shell.includes("document.getElementById('jumpToWidget')")) failures.push('homepage Jump To is not incorporated into the top shell');
if (!shell.includes('const buildPublicNav')) failures.push('shared public-navigation builder missing');
if (!shell.includes("aria-current")) failures.push('active-page navigation state missing');
if (shell.includes("['transparency', '/transparency.html']")) failures.push('Telegram-only moderation page is exposed in public navigation');
if (!shell.includes('skip.after(buildShell())')) failures.push('standalone pages do not mount the same outward navigation shell');
if (!shellCss.includes('position: fixed;') || !shellCss.includes('backdrop-filter: blur(20px)')) failures.push('shared header is not fixed dark glass');
if (!shellCss.includes('background: var(--bullen-bg) !important;')) failures.push('standalone background color is not centrally unified');
if (!shellCss.includes('body[data-bullen-page="index"] .hero-mast { display: none !important; }')) failures.push('mobile homepage duplicate masthead remains visible');
if (!shellCss.includes('top: calc(var(--bullen-header-height) + env(safe-area-inset-top, 0px) + 1px)')) failures.push('Jump To panel is not anchored below the fixed header');
if (!shellCss.includes('height: 34px;') || !shellCss.includes('.bullen-home-shell .jumpto-menu')) failures.push('mobile Jump To does not share the hamburger control and panel geometry');

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
for (const state of ['Active', 'Upcoming', 'Completed']) {
  if (!giveaways.includes(`'${state.toLowerCase()}', '${state}'`)) failures.push(`giveaways page missing ${state} state`);
}
if (giveaways.includes("['paid', 'Paid'") || giveaways.includes('campaign.payoutStatus')) failures.push('giveaways page still exposes payout bookkeeping');
if (!giveaways.includes('No draw or result state is inferred')) failures.push('giveaways page does not fail closed');

const curve = fs.readFileSync(path.join(site, 'curve.html'), 'utf8');
const proof = fs.readFileSync(path.join(site, 'proof.html'), 'utf8');
for (const [name, source] of [['curve.html', curve], ['proof.html', proof]]) {
  if (!source.includes('.wrap') || !source.includes('max-width:900px')) failures.push(`${name}: record suite width drifted`);
  if (!source.includes('font-size:clamp(21px,5.2vw,29px)') || !source.includes('font-weight:400')) failures.push(`${name}: record suite heading typography drifted`);
}

const home = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
if (!home.includes("{ id: 'giveaway', label: 'Giveaway' }")) failures.push('homepage Jump To menu omits the live giveaway');
if (home.includes('data-bullen-home-nav')) failures.push('homepage retains the redundant mid-hero navigation strip');
for (const duplicate of ["giveaways.html', label: 'All Giveaways", "proof', label: 'Proof", "refer.html', label: 'Referrals", "thedrop', label: 'The Drop", "stats.html', label: 'Live Dashboard"]) {
  if (home.includes(duplicate)) failures.push(`homepage Jump To duplicates shared navigation: ${duplicate}`);
}
if (!home.includes("fetch('/giveaways.json'")) failures.push('homepage giveaway card is not driven by the campaign authority');
if (home.includes("const ENTRY_MESSAGE = 'bullenciaga giveaway entry")) failures.push('homepage duplicates the campaign signature message');
if (!home.includes('visibility:hidden') || !home.includes('opacity:0') || !home.includes('transition:')) failures.push('homepage Jump To no longer uses a quick fade');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`standalone contract: ok (${publicPages.length} public pages + 1 unlisted admin page)`);
