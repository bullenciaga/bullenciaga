import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const wallet = 'CohRnrcs3u599MG7h2r4nRhwP7WmeRJ3shCVp1kWAXPk';
const other = 'GV7XDVAkra3Kjr4b2f2nyYrhL9gqEx5gvevdkTBzyYmd';
const herd = { name: 'HERD #1' };
const key = { id: 'key', name: 'The Key #006', series: 'house-object', owner: wallet };
const promise = { id: 'promise', name: 'The Promise #006', series: 'bullensaga', owner: wallet };
const element = () => ({ style: {}, textContent: '', innerHTML: '', appendChild() {} });
const context = vm.createContext({
  galleryEls: Object.fromEntries(['grid', 'controls', 'pagination', 'empty', 'count', 'pageLabel', 'prevBtn', 'nextBtn'].map(k => [k, element()])),
  galleryMode: 'all', galleryRenderToken: 0, connectedWalletAddress: null,
  gallerySearchTerm: wallet, galleryManifest: [herd], gallerySpecialTier: null,
  galleryClaimedFilter: 'all', galleryTraitFilters: {}, gallerySortMode: 'number',
  gallerySortDirection: 'asc', galleryPage: 0, currentFilteredList: [],
  mintedAssetIdByName: new Map([['HERD #1', 'herd']]),
  mintedOwnerByName: new Map([['HERD #1', wallet]]), mintedNames: new Set(['HERD #1']), manifestNameSet: new Set(['HERD #1']),
  listingsByMint: new Map(), DEV_WALLET: other,
  fetchHouseObjectAssets: async () => [key, { ...key, id: 'other', owner: other }],
  fetchBullensagaAssets: async () => [promise], loadMyAssets: async () => [{ ...key, owner: other }],
  computeGalleryPageSize: () => ({ pageSize: 56 }), renderGalleryCard: e => e,
  listingFor: e => context.listingsByMint.get(e.id || context.mintedAssetIdByName.get(e.name)),
});
vm.runInContext(section('  function isCompanionRecord(', '  // Assets known'), context);
vm.runInContext(section('  async function renderGallery()', '  function switchGalleryMode('), context);
const render = () => vm.runInContext('renderGallery()', context);
const names = () => Array.from(context.currentFilteredList, e => e.name);
await render();
assert.deepEqual(names(), ['HERD #1', 'The Key #006', 'The Promise #006']);
assert.match(context.galleryEls.count.textContent, /3 pieces found/);
context.mintedOwnerByName.clear();
await render();
assert.deepEqual(names(), ['The Key #006', 'The Promise #006'], 'wallet without HERD still sees collectibles');
context.listingsByMint.set('herd', { seller: wallet });
await render();
assert.equal(names().length, 3, 'escrowed HERD remains with seller');
context.galleryClaimedFilter = 'unclaimed';
await render();
assert.equal(names().length, 0, 'minted companions are never unclaimed');
context.galleryClaimedFilter = 'all';
context.gallerySearchTerm = '';
await render();
assert.deepEqual(names(), ['HERD #1'], 'clear restores original manifest');

// A slow wallet lookup cannot replace a newer search or disconnected tab.
let resolve;
context.fetchHouseObjectAssets = () => new Promise(r => { resolve = r; });
context.gallerySearchTerm = wallet;
const pending = render();
context.gallerySearchTerm = '#1';
await render();
resolve([key]);
await pending;
assert.deepEqual(names(), ['HERD #1']);
context.gallerySearchTerm = wallet;
const pendingDisconnect = render();
context.galleryMode = 'mine';
await render();
resolve([key]);
await pendingDisconnect;
assert.match(context.galleryEls.empty.textContent, /connect your wallet/);

context.galleryMode = 'all';
context.fetchHouseObjectAssets = async () => { throw new Error('outage'); };
await render();
assert.match(context.galleryEls.count.textContent, /some collectibles unavailable/);
assert.ok(names().includes('The Promise #006'), 'one unavailable collection does not hide the other');

// Exercise actual collection parsing: burnt assets excluded, failed RPC not cached.
const loader = vm.createContext({
  AbortSignal,
  cachedHouseObjectAssets: null,
  NFT_CONFIG: { HELIUS_PROXY_URL: '/rpc', HOUSE_OBJECTS_COLLECTION_ADDRESS: 'house' },
  collectiblePreview: () => '/key.webp',
  fetch: async () => ({ ok: true, json: async () => ({ result: { items: [
    { id: 'live', content: { metadata: { name: 'The Key #006' } }, ownership: { owner: wallet } },
    { id: 'burnt', burnt: true, content: { metadata: { name: 'The Key #007' } } },
  ] } }) }),
});
vm.runInContext(section('  async function fetchHouseObjectAssets()', '  async function fetchBullensagaAssets()'), loader);
const assets = await vm.runInContext('fetchHouseObjectAssets()', loader);
assert.equal(assets.length, 1);
assert.equal(assets[0].owner, wallet);
assert.equal(assets[0].image, '/key.webp');
loader.cachedHouseObjectAssets = null;
loader.fetch = async () => ({ ok: true, json: async () => ({ error: { message: 'upstream failed' } }) });
await assert.rejects(vm.runInContext('fetchHouseObjectAssets()', loader));
assert.equal(loader.cachedHouseObjectAssets, null);
assert.ok(fs.statSync(new URL('../site/assets/collection-previews/house-object-03-key.webp', import.meta.url)).size < 40000);
console.log('Gallery wallet search: companions, owner/seller matching, filters, async isolation, failures and Key preview passed');
