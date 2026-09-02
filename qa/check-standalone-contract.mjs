import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const publicPages = [
  'index.html', 'stats.html', 'chart.html', 'curve.html',
  'transparency.html', 'refer.html', 'thedrop.html', 'giveaways.html', 'objects.html', 'tape.html',
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
const homeSource = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const tapeSource = fs.readFileSync(path.join(site, 'tape.html'), 'utf8');
const mobileBuy = fs.readFileSync(path.join(site, 'mobile-buy.js'), 'utf8');
const mobileBuyCss = fs.readFileSync(path.join(site, 'mobile-buy.css'), 'utf8');
if (!shell.includes("page === 'referrals'")) failures.push('admin page classification missing');
if (!shell.includes("page === 'index' ? ' bullen-home-shell'")) failures.push('homepage top-shell navigation missing');
if (!shell.includes("bar.className = 'bullen-site-bar'")) failures.push('shared fixed-width header interior missing');
if (!shell.includes("toggle.className = 'bullen-nav-toggle'")) failures.push('responsive navigation toggle missing');
if (!shell.includes("document.getElementById('jumpToWidget')")) failures.push('homepage Jump To is not incorporated into the top shell');
if (!shell.includes('if (open) closeExtraControl();')) failures.push('hamburger does not close an already-open homepage Jump To panel');
if (!shell.includes('const buildPublicNav')) failures.push('shared public-navigation builder missing');
if (!shell.includes("['bullensaga', 'https://bullensaga.com/']")) failures.push('BULLENSAGA sister-site navigation missing');
if (!shell.includes("['tape', '/tape.html']")) failures.push('live market tape navigation missing');
if (!shell.includes("aria-current")) failures.push('active-page navigation state missing');
if (shell.includes("['transparency', '/transparency.html']")) failures.push('Telegram-only moderation page is exposed in public navigation');
if (shell.includes("['proof', '/proof.html']") || shell.includes("proof: 'Proof'")) failures.push('retired Proof page remains in public navigation');
if (!shell.includes('skip.after(buildShell())')) failures.push('standalone pages do not mount the same outward navigation shell');
if (!shellCss.includes('position: fixed;') || !shellCss.includes('backdrop-filter: blur(20px)')) failures.push('shared header is not fixed dark glass');
if (!shellCss.includes('background: var(--bullen-bg) !important;')) failures.push('standalone background color is not centrally unified');
if (!shellCss.includes('body[data-bullen-page="index"] .hero-mast { display: none !important; }')) failures.push('mobile homepage duplicate masthead remains visible');
if (!shellCss.includes('top: calc(var(--bullen-header-height) + env(safe-area-inset-top, 0px) + 1px)')) failures.push('Jump To panel is not anchored below the fixed header');
if (!shellCss.includes('height: 34px;') || !shellCss.includes('.bullen-home-shell .jumpto-menu')) failures.push('mobile Jump To does not share the hamburger control and panel geometry');
for (const [name, source] of [['index.html', homeSource], ['tape.html', tapeSource]]) {
  if (!source.includes('href="/mobile-buy.css"')) failures.push(`${name}: mobile wallet handoff styles missing`);
  if (!source.includes('src="/mobile-buy.js"')) failures.push(`${name}: mobile wallet handoff helper missing`);
  if (!source.includes('BullenMobileBuy.request')) failures.push(`${name}: buy action does not invoke the mobile wallet handoff`);
}
if (!mobileBuy.includes("'solana:101/address:' + mint")
    || !mobileBuy.includes("'https://phantom.app/ul/v1/swap/'")) {
  failures.push('mobile wallet handoff is missing the Phantom CAIP-19 direct swap');
}
if (!mobileBuy.includes("'https://solflare.com/ul/v1/browse/'")
    || !mobileBuy.includes('encodeURIComponent(jupiterUrl)')) {
  failures.push('mobile wallet handoff is missing the Solflare in-wallet Jupiter route');
}
if (!mobileBuy.includes("'https://pump.fun/coin/'") || !mobileBuy.includes('Copy contract')) {
  failures.push('mobile wallet handoff is missing its Pump.fun or contract-copy fallback');
}
for (const icon of ['assets/wallets/phantom.png', 'assets/wallets/solflare.png']) {
  if (!fs.existsSync(path.join(site, icon)) || !mobileBuy.includes(`/${icon}`)) {
    failures.push(`mobile wallet handoff is missing canonical ${icon}`);
  }
}
if (!mobileBuy.includes('bullen-mobile-buy__connected-icon')) {
  failures.push('mobile wallet handoff is missing its already-connected wallet mark');
}
if (!mobileBuy.includes("overlay.setAttribute('aria-describedby', 'bullen-mobile-buy-description')")
    || !mobileBuy.includes("event.key !== 'Tab'")
    || !mobileBuy.includes('focusableElements()')) {
  failures.push('mobile wallet handoff does not keep keyboard focus inside its modal');
}
if (!mobileBuyCss.includes('env(safe-area-inset-bottom, 0px)') || !mobileBuyCss.includes('100dvh')) {
  failures.push('mobile wallet handoff does not respect mobile safe areas and dynamic viewport height');
}
if (!mobileBuyCss.includes('place-items: center;') || !mobileBuyCss.includes('border-radius: 24px;')
    || mobileBuyCss.includes('border-bottom: 0;')) {
  failures.push('mobile wallet handoff must remain a fully enclosed, viewport-centered House panel');
}
if (!mobileBuyCss.includes('justify-content: center;') || !mobileBuyCss.includes('align-items: center;')) {
  failures.push('mobile wallet utility labels are no longer optically centered');
}

const authority = JSON.parse(fs.readFileSync(path.join(site, 'giveaways.json'), 'utf8'));
if (authority.schema !== 'bullenciaga.giveaways.v1') failures.push('giveaway authority schema mismatch');
for (const id of ['vturbo-trophy-699', 'follow500', 'herd-buy-hold-680-625-308', 'mint-round-0', 'mint-round-1', 'mint-round-2', 'mint-round-3', 'mint-final']) {
  if (!authority.campaigns.some((campaign) => campaign.id === id)) failures.push(`giveaway authority missing ${id}`);
}
const trophy = authority.campaigns.find((campaign) => campaign.id === 'vturbo-trophy-699');
if (trophy?.status !== 'active' || trophy?.kind !== 'skill' || trophy?.prizes?.positions?.[0] !== 699
    || trophy?.entry?.url !== 'https://x.com/bullenciagax/status/2093018896466923945'
    || trophy?.close?.afterUnlockHours !== 24 || trophy?.judging?.random !== false
    || trophy?.milestones?.length !== 3
    || trophy.milestones.some((milestone) => milestone.target !== 50 || milestone.current !== null)) {
  failures.push('vTURBO Trophy must remain an active manual skill campaign tied to the published 50/50/50 post');
}
const round3 = authority.campaigns.find((campaign) => campaign.id === 'mint-round-3');
if (round3?.round !== 3 || round3?.trigger?.target !== 650 || round3?.status !== 'upcoming'
    || round3?.qualification?.minPieces !== 6 || round3?.qualification?.minTokens !== 1_000_000
    || round3.snapshot || round3.result) {
  failures.push('round 3 must remain visibly gated with no fabricated snapshot or result');
}
const buyHold = authority.campaigns.find((campaign) => campaign.id === 'herd-buy-hold-680-625-308');
if (buyHold?.status !== 'active' || buyHold?.kind !== 'buy-hold'
    || buyHold?.displayOrder !== 0
    || buyHold?.qualification?.entryUnit !== 25_000 || buyHold?.qualification?.entryCap !== null
    || buyHold?.qualification?.mustHoldAtClose !== true || buyHold?.qualification?.transfersCount !== false
    || buyHold?.qualification?.salesReduceEntries !== true || buyHold?.qualification?.onePrizePerWallet !== true
    || buyHold?.draw?.activation !== 'active'
    || buyHold?.draw?.openedAt !== '2026-08-30T13:18:37.000Z'
    || buyHold?.draw?.closesAt !== '2026-09-02T13:18:37.000Z'
    || buyHold?.snapshot !== '/giveaway-buy-hold-open.json' || buyHold?.result
    || buyHold?.prizes?.positions?.join(',') !== '680,625,308') {
  failures.push('Buy + Hold draw must remain tied to its public 72-hour opening snapshot and fixed prize order');
}
const follower = authority.campaigns.find((campaign) => campaign.id === 'follow500');
if (follower?.displayOrder !== 20 || follower?.layout !== 'wide') {
  failures.push('500 follower giveaway must retain its intentional full-width desktop layout');
}
const buyHoldOpen = JSON.parse(fs.readFileSync(path.join(site, 'giveaway-buy-hold-open.json'), 'utf8'));
if (buyHoldOpen?.schema !== 'bullenciaga.buy-hold-open.v1'
    || buyHoldOpen?.campaign !== buyHold.id || buyHoldOpen?.status !== 'active'
    || buyHoldOpen?.openedAt !== buyHold.draw.openedAt || buyHoldOpen?.closesAt !== buyHold.draw.closesAt
    || buyHoldOpen?.windowHours !== 72 || buyHoldOpen?.rules?.entryUnit !== '25000'
    || buyHoldOpen?.rules?.entryCap !== null || buyHoldOpen?.rules?.onePrizePerWallet !== true
    || !Number.isInteger(buyHoldOpen?.openingReference?.finalizedSlot)
    || typeof buyHoldOpen?.openingReference?.blockhash !== 'string'
    || buyHoldOpen?.prizes?.map((prize) => prize.position).join(',') !== '680,625,308'
    || Object.keys(buyHoldOpen?.balancesRaw || {}).length !== buyHoldOpen?.totals?.owners) {
  failures.push('Buy + Hold opening snapshot is missing, incomplete or inconsistent with the campaign authority');
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
if (!giveaways.includes('Collective unlock targets') || !giveaways.includes("campaign.entry.url || campaign.entry.homepageAnchor")) failures.push('giveaways page does not render the vTURBO Trophy unlock and X entry action');
if (!giveaways.includes('safePrizeVideo') || !giveaways.includes('playsinline') || !giveaways.includes('campaign.prizes.alt')) failures.push('giveaways page does not render accessible trusted campaign video');
if (!giveaways.includes("campaign.layout === 'wide'") || !giveaways.includes('.sort((a, b) =>')) failures.push('giveaways page does not preserve campaign priority and wide-card layout');

const curve = fs.readFileSync(path.join(site, 'curve.html'), 'utf8');
if (!curve.includes('.wrap') || !curve.includes('max-width:900px')) failures.push('curve.html: record suite width drifted');
if (!curve.includes('font-size:clamp(21px,5.2vw,29px)') || !curve.includes('font-weight:400')) failures.push('curve.html: record suite heading typography drifted');
if (!curve.includes('Public burn ledger') || !curve.includes('ledgerMetrics')) failures.push('curve.html: merged Proof ledger is missing');
if (!curve.includes("fetch('/supply/history'") || !curve.includes("fetch('/supply/proof'")) failures.push('curve.html: supply history and transaction proof are not both authoritative');
if (!curve.includes('class="sig"') || !curve.includes('burned, evidenced') || !curve.includes('<b>Coverage.</b>')) failures.push('curve.html: Proof transaction details or reconciliation are missing');
if (curve.includes('<br class="wide">') || curve.includes('br.wide')) failures.push('curve.html: forced desktop prose breaks remain');

const redirects = fs.readFileSync(path.join(site, '_redirects'), 'utf8');
if (!/^\/proof\s+\/curve\s+301$/m.test(redirects) || !/^\/proof\.html\s+\/curve\s+301$/m.test(redirects)) failures.push('Proof URLs do not permanently redirect to Curve');
if (fs.existsSync(path.join(site, 'proof.html'))) failures.push('retired standalone Proof asset still exists');

for (const name of ['chart.html', 'refer.html', 'thedrop.html']) {
  const source = fs.readFileSync(path.join(site, name), 'utf8');
  if (/class=["'][^"']*\b(?:back|brand)\b[^"']*["'][^>]*href=["']\/["']/i.test(source)) failures.push(`${name}: redundant in-page home link remains`);
}

const home = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
if (!home.includes("{ id: 'giveaway', label: 'Giveaway' }")) failures.push('homepage Jump To menu omits the live giveaway');
if (home.includes('data-bullen-home-nav')) failures.push('homepage retains the redundant mid-hero navigation strip');
if (!home.includes("targetSelector === '#' || !targetSelector.startsWith('#')")) failures.push('homepage smooth scrolling can intercept the external mobile buy fallback');
for (const duplicate of ["giveaways.html', label: 'All Giveaways", "proof', label: 'Proof", "refer.html', label: 'Referrals", "thedrop', label: 'The Drop", "stats.html', label: 'Live Dashboard"]) {
  if (home.includes(duplicate)) failures.push(`homepage Jump To duplicates shared navigation: ${duplicate}`);
}
if (!home.includes("fetch('/giveaways.json'")) failures.push('homepage giveaway card is not driven by the campaign authority');
if (home.includes("const ENTRY_MESSAGE = 'bullenciaga giveaway entry")) failures.push('homepage duplicates the campaign signature message');
if (!home.includes('visibility:hidden') || !home.includes('opacity:0') || !home.includes('transition:')) failures.push('homepage Jump To no longer uses a quick fade');

const tape = fs.readFileSync(path.join(site, 'tape.html'), 'utf8');
if (!tape.includes("const REST_URL = API_ORIGIN + '/volume/tape'")) failures.push('tape.html: durable market snapshot endpoint missing');
if (!tape.includes("const WS_URL = API_ORIGIN.replace(/^http/, 'ws') + '/volume/tape/live'")) failures.push('tape.html: live market WebSocket endpoint missing');
if (!tape.includes('Data provided by <a href="https://www.coingecko.com/"')) failures.push('tape.html: CoinGecko attribution missing');
if (!tape.includes('Wallet identities are not published here')) failures.push('tape.html: public privacy boundary missing');
if (!tape.includes("event.kind!=='large_buy'") || !tape.includes("data.type==='large_buy'")) failures.push('tape.html: large-buy stream event missing');
if (!tape.includes('largeBuyGlow') || !tape.includes('large-buy-active')) failures.push('tape.html: large-buy gold pulse missing');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`standalone contract: ok (${publicPages.length} public pages + 1 unlisted admin page)`);
