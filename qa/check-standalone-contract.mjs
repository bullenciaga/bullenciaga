import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const publicPages = [
  'index.html', 'buy.html', 'stats.html', 'deepdive.html', 'chart.html', 'curve.html',
  'transparency.html', 'refer.html', 'thedrop.html', 'giveaways.html', 'objects.html', 'tape.html',
  'patchnotes.html', 'patchnotes-001.html', 'patchnotes-002.html', 'patchnotes-003.html', 'patchnotes-004.html', 'patchnotes-005.html', 'lock.html', 'ledger.html', 'passport.html',
  'rooms.html',
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
const focusCss = fs.readFileSync(path.join(site, 'bullen-focus.css'), 'utf8');
const marketCss = fs.readFileSync(path.join(site, 'market-surfaces.css'), 'utf8');
const homeSource = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const tapeSource = fs.readFileSync(path.join(site, 'tape.html'), 'utf8');
const mobileBuy = fs.readFileSync(path.join(site, 'mobile-buy.js'), 'utf8');
const mobileBuyCss = fs.readFileSync(path.join(site, 'mobile-buy.css'), 'utf8');
const patchnotesSource = fs.readFileSync(path.join(site, 'patchnotes.html'), 'utf8');
const archiveSource = fs.readFileSync(path.join(site, 'patchnotes-001.html'), 'utf8');
const lockSource = fs.readFileSync(path.join(site, 'lock.html'), 'utf8');
// Shared navigation now renders from one deterministic source across all HTML.
// Runtime hydration binds controls in place; it does not build replacement rails.
const headerData = fs.readFileSync(path.join(root, 'qa/header-data.mjs'), 'utf8');
const headerJs = fs.readFileSync(path.join(site, 'bullen-header.js'), 'utf8');
const headerCss = fs.readFileSync(path.join(site, 'bullen-header.css'), 'utf8');
for (const name of fs.readdirSync(site).filter(name => name.endsWith('.html'))) {
  const source = fs.readFileSync(path.join(site, name), 'utf8');
  if (!source.includes('data-bullen-header=""') || !source.includes('src="/bullen-header.js"') || !source.includes('href="/bullen-header.css"')) failures.push(`${name}: shared navigation missing`);
}
if (!headerData.includes("['goods','world','platform','flywheel']")) failures.push('featured destinations are out of approved order');
if (!headerData.includes("['The House',['bullensaga','objects','patchnotes','lock','ledger','whitepaper']]")) failures.push('House directory is incomplete');
if (!headerData.includes("['Community',['giveaways','thedrop','refer','passport','rooms']]")) failures.push('community directory is incomplete');
for (const required of ['closePanels(true)', "event.key !== 'Escape'", "button.setAttribute('aria-expanded','true')", 'shell.contains(document.activeElement)']) {
  if (!headerJs.includes(required)) failures.push(`shared navigation interaction missing: ${required}`);
}
if (!headerCss.includes('position:fixed') || !headerCss.includes('max-width:1600px')) failures.push('fixed shared header geometry missing');
for (const variable of ['--jupiter-plugin-primary', '--jupiter-plugin-background', '--jupiter-plugin-primaryText', '--jupiter-plugin-warning', '--jupiter-plugin-interactive', '--jupiter-plugin-module']) {
  if (!shellCss.includes(variable)) failures.push(`shared Jupiter modal theme is missing ${variable}`);
}
if (!shellCss.includes('background: var(--bullen-bg) !important;')) failures.push('standalone background color is not centrally unified');
if (marketCss.includes('.market-curve header {')) failures.push('Curve page-level header rule can override the shared House navigation header');
if (!shellCss.includes('html[data-bullen-page="index"] body .hero-mast { display: none !important; }')) failures.push('mobile homepage duplicate masthead remains visible');
for (const required of ['min-height:44px', 'grid-template-rows:56px 48px', '--bullen-header-height:104px', '--nav-teal:#81c5bf', 'max-height:calc(100dvh']) {
  if (!headerCss.includes(required)) failures.push(`responsive navigation missing: ${required}`);
}
for (const [name, source] of [['index.html', homeSource], ['tape.html', tapeSource]]) {
  if (!source.includes('href="/mobile-buy.css"')) failures.push(`${name}: mobile wallet handoff styles missing`);
  if (!source.includes('src="/mobile-buy.js"')) failures.push(`${name}: mobile wallet handoff helper missing`);
  if (!source.includes('BullenMobileBuy.request')) failures.push(`${name}: buy action does not invoke the mobile wallet handoff`);
}
if (!patchnotesSource.includes('BullenMobileBuy.request')
    || !patchnotesSource.includes('href="/mobile-buy.css"')
    || !patchnotesSource.includes('src="/mobile-buy.js"')) {
  failures.push('patchnotes.html: public release CTA does not preserve the mobile wallet handoff');
}
for (const section of ['MOBILE BUYING', 'ONE HOUSE', 'THE TAPE', 'HOUSE DESK', 'TWO BOTS', 'CONTROL ROOM', 'BULLENSAGA', 'RESERVE CUSTODY']) {
  if (!archiveSource.includes(section)) failures.push(`patchnotes-001.html: archived public release record omits ${section}`);
}
for (const proof of [
  'https://lock.jup.ag/escrow/Fbw46U6eRhWwkEfABXFhNBR5yS4JVx7GU67Uhf9T6dLz',
  'https://lock.jup.ag/escrow/5uquyi4cQ4PV6bLUpBBp5rhuV3kMDjv8pGFKkKm4JmH1',
  '25,000,000', '212,500,000', 'Vesting rate', 'Can cancel',
]) {
  if (!lockSource.includes(proof)) failures.push(`lock.html: public reserve record omits ${proof}`);
}
if (!mobileBuy.includes("'solana:101/address:' + mint")
    || !mobileBuy.includes("'https://phantom.app/ul/v1/swap/'")) {
  failures.push('mobile wallet handoff is missing the Phantom CAIP-19 direct swap');
}
if (!mobileBuy.includes("'https://www.solflare.com/prices/bullenciaga/'")
    || !mobileBuy.includes('solflareTokenUrl(options.mint)')
    || mobileBuy.includes('solflare.com/ul/v1/browse/')) {
  failures.push('mobile wallet handoff must use the confirmed native Solflare token page');
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
if (!mobileBuy.includes('focusWithoutRecommendation')
    || !mobileBuy.includes("classList.add('bullen-auto-focus-neutral')")
    || !mobileBuy.includes("classList.remove('bullen-auto-focus-neutral')")
    || !focusCss.includes('html:not([data-focus-navigation="keyboard"]) :focus')
    || !mobileBuyCss.includes('.bullen-auto-focus-neutral:focus')) {
  failures.push('automatic modal focus can look like an endorsed or preselected action');
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
const golden = authority.campaigns.find(c => c.id === 'golden-jacket-699-613-517-61-961');
if (trophy?.status !== 'completed' || trophy?.display !== false || trophy?.replacedBy !== golden?.id || !trophy?.originalEligibility?.length
    || trophy?.trigger?.url !== 'https://x.com/bullenciagax/status/2093018896466923945'
    || golden?.prizes?.positions?.join(',') !== '517,613,699,61,961' || typeof golden?.automation?.enabled !== 'boolean') {
  failures.push('Golden Jacket replacement must preserve naming-campaign history and prize order');
}
const finalRecipients = [
  [517, 'BkcjSkdwzbswMUPuaPtu1tPPTbs5XrXN2Y1JgxUrqQep'],
  [613, 'EQ3P1ueeu171Kq7wd5KURJ413FqyaS97nwWaJem42rzf'],
  [699, 'At6eLYvJEaC65uBD6wTn4std4mSaEFGxs9tkuyu1wPgn'],
  [61, 'BY2cjrXeqMnPkinCLZqkrTyos8njFyUZj1E3wgwXaUum'],
  [961, '3AgyXSNoPZrKQW2gK6oEQPubouCJsUjQ3MWQjoLbh5Er'],
];
if (golden?.status !== 'completed' || golden?.finalResults?.length !== finalRecipients.length
    || finalRecipients.some(([position, wallet], index) => golden.finalResults[index]?.position !== position
      || golden.finalResults[index]?.wallet !== wallet)) {
  failures.push('Ghost Dripper final recipients must match the approved five-piece result in prize order');
}
const round3 = authority.campaigns.find((campaign) => campaign.id === 'mint-round-3');
if (round3?.round !== 3 || round3?.trigger?.target !== 650 || round3?.status !== 'upcoming'
    || round3?.qualification?.minPieces !== 6 || round3?.qualification?.minTokens !== 1_000_000
    || round3.snapshot || round3.result) {
  failures.push('round 3 must remain visibly gated with no fabricated snapshot or result');
}
const buyHold = authority.campaigns.find((campaign) => campaign.id === 'herd-buy-hold-680-625-308');
if (buyHold?.status !== 'completed' || buyHold?.kind !== 'buy-hold'
    || buyHold?.displayOrder !== 1
    || buyHold?.qualification?.entryUnit !== 25_000 || buyHold?.qualification?.entryCap !== null
    || buyHold?.qualification?.mustHoldAtClose !== true || buyHold?.qualification?.transfersCount !== false
    || buyHold?.qualification?.salesReduceEntries !== true || buyHold?.qualification?.onePrizePerWallet !== true
    || buyHold?.draw?.activation !== 'drawn'
    || buyHold?.draw?.openedAt !== '2026-08-30T13:18:37.000Z'
    || buyHold?.draw?.closesAt !== '2026-09-02T13:18:37.000Z'
    || buyHold?.snapshot !== '/giveaway-buy-hold-close-20260902.json'
    || buyHold?.result !== '/giveaway-buy-hold-result-20260902.json'
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
const buyHoldClose = JSON.parse(fs.readFileSync(path.join(site, 'giveaway-buy-hold-close-20260902.json'), 'utf8'));
if (buyHoldClose?.schema !== 'bullenciaga.buy-hold-close.v1'
    || buyHoldClose?.campaign !== buyHold.id || buyHoldClose?.status !== 'closed-awaiting-seed'
    || buyHoldClose?.closingReference?.publishedClose !== buyHold.draw.closesAt
    || buyHoldClose?.closingReference?.finalizedSlot !== 443706399
    || buyHoldClose?.closingReference?.blockTime !== 1788355117
    || buyHoldClose?.closingReference?.nextBlockTime <= 1788355117
    || buyHoldClose?.drawContract?.seedStatus !== 'not-requested'
    || buyHoldClose?.totals?.qualifyingWallets !== buyHoldClose?.entries?.length
    || buyHoldClose?.totals?.entries !== buyHoldClose?.entries?.reduce((total, row) => total + row.entries, 0)
    || buyHoldClose?.prizes?.map((prize) => prize.position).join(',') !== '680,625,308') {
  failures.push('Buy + Hold closing snapshot is missing, seeded too early or inconsistent with the campaign authority');
}
const buyHoldResult = JSON.parse(fs.readFileSync(path.join(site, 'giveaway-buy-hold-result-20260902.json'), 'utf8'));
if (buyHoldResult?.schema !== 'bullenciaga.buy-hold-result.v1'
    || buyHoldResult?.campaign !== buyHold.id || buyHoldResult?.status !== 'drawn-prizes-pending-transfer'
    || buyHoldResult?.publication?.snapshotSha256 !== '9c474a48e33a68122e453638cc66f6f29a819c9a8f4bc9ee893b12890d9d368d'
    || buyHoldResult?.publication?.finalizedSlotObservedAfterConfirmation !== 443742205
    || buyHoldResult?.seed?.finalizedSlot !== 443742241
    || buyHoldResult?.seed?.finalizedSlot <= buyHoldResult?.publication?.finalizedSlotObservedAfterConfirmation
    || buyHoldResult?.winners?.length !== 3
    || buyHoldResult?.winners?.map((winner) => winner.position).join(',') !== '680,625,308'
    || new Set(buyHoldResult?.winners?.map((winner) => winner.wallet)).size !== 3) {
  failures.push('Buy + Hold result is missing, uses a pre-publication seed or violates fixed prize order');
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
if (/^\/lock\s/m.test(redirects)) failures.push('_redirects: /lock must use Cloudflare clean-URL asset routing, not a competing redirect');
if (/^\/(?:ledger|passport)\s/m.test(redirects)) failures.push('_redirects: clean House intelligence URLs must not compete with Cloudflare asset routing');
if (!/^\/proof\s+\/curve\s+301$/m.test(redirects) || !/^\/proof\.html\s+\/curve\s+301$/m.test(redirects)) failures.push('Proof URLs do not permanently redirect to Curve');
if (fs.existsSync(path.join(site, 'proof.html'))) failures.push('retired standalone Proof asset still exists');

const objectsCss = fs.readFileSync(path.join(site, 'objects.css'), 'utf8');
if (objectsCss.includes('.objects-hero::before')) failures.push('House Objects retains the transient decorative ring behind its hero');

for (const name of ['chart.html', 'refer.html', 'thedrop.html']) {
  const source = fs.readFileSync(path.join(site, name), 'utf8').replace(/<!-- BULLEN_SHELL_START[\s\S]*?<!-- BULLEN_SHELL_END -->/, '');
  if (/class=["'][^"']*\b(?:back|brand)\b[^"']*["'][^>]*href=["']\/["']/i.test(source)) failures.push(`${name}: redundant in-page home link remains`);
}

const home = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
if (home.includes('id="giveaway"') || home.includes("{ id: 'giveaway', label: 'Giveaway' }") || shell.includes('/#giveaway')) failures.push('completed giveaway remains on the homepage or in homepage section navigation');
if (home.includes('data-bullen-home-nav')) failures.push('homepage retains the redundant mid-hero navigation strip');
if (!fs.readFileSync(path.join(site, 'bullen-navigation.js'), 'utf8').includes("url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search")) failures.push('fragment scrolling must leave other documents and external links to the browser');
if (home.includes('function smoothScrollTo(')) failures.push('homepage must not compete with shared fragment navigation');
for (const duplicate of ["giveaways.html', label: 'All Giveaways", "proof', label: 'Proof", "refer.html', label: 'Referrals", "thedrop', label: 'The Drop", "stats.html', label: 'Live Dashboard"]) {
  if (home.includes(duplicate)) failures.push(`homepage Jump To duplicates shared navigation: ${duplicate}`);
}
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
