import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const read = name => fs.readFileSync(path.join(site, name), 'utf8');

const index = read('index.html');
const stats = read('stats.html');
const chart = read('chart.html');
const curve = read('curve.html');
const objects = read('objects.html');
const objectsCss = read('objects.css');
const objectsJs = read('objects.js');
const refer = read('refer.html');
const redirects = read('_redirects');

const roadmap = index.slice(index.indexOf('<section id="roadmap">'), index.indexOf('<section id="faq">'));
const phases = [...roadmap.matchAll(/<span class="num">(\d{2})<\/span>[\s\S]*?<h3>([^<]+)<\/h3>/g)]
  .map(match => ({ number: match[1], title: match[2] }));
assert.deepEqual(phases.map(phase => phase.number), ['01', '02', '03', '04', '05', '06', '07', '08']);
assert.equal(phases[3].title, 'THE VAULT EMPTIES');
assert.match(index, /One portion empties at \$20M cumulative volume; the rest follows at \$50M/);
assert.match(index, /phases 05 to 08 are not gated on volume and may complete in any order/);
assert.match(index, /<a href="\/whitepaper"/);
assert.match(index, /async function fetchHouseObjectAssets\(\)/);
assert.match(index, /series:'house-object'/);
assert.match(index, /function houseStatusLine\(entry\)/);
assert.match(index, /House Pair I complete · paired status follows this wallet/);
assert.match(index, /Enhanced by House Pair I · Signet \+ Cufflinks verified in this wallet/);
assert.match(redirects, /^\/whitepaper\s+\/whitepaper\.pdf\s+302$/m);

assert.doesNotMatch(stats, /<div class="brand"/);
assert.match(stats, /HOUSE_OBJECTS_COLLECTION:\s*'9ucdkSaiTLUDXmVCjWonxAJqrTH9uyB675BzzRi5vqgM'/);
assert.match(stats, /fetchAssets\(CFG\.HOUSE_OBJECTS_COLLECTION, 'house-object'\)/);
assert.match(stats, /fetchRecentAssets\(CFG\.HOUSE_OBJECTS_COLLECTION, RECENT_SEED_COUNT, 'house-object'\)/);

assert.doesNotMatch(chart, /house-burn-registry\.js|HOUSE OBJECT BURN COMMITMENTS/i);
assert.match(chart, /\/api\/public-activity/);
for (const kind of ['housemint', 'foundingmint', 'gamecommit']) assert.match(chart, new RegExp(kind));
assert.match(chart, /case 'burn':\s+return 'burn '/);

assert.doesNotMatch(curve, /house-burn-registry\.js|HOUSE OBJECT BURN COMMITMENTS|SHARED ALLOCATION LEDGER/i);
assert.match(curve, /confirmed Token-2022 burn/);

assert.match(objectsCss, /\.objects-rule span,\.objects-rule strong \{ display:flex; align-items:center; min-height:58px/);
assert.match(objectsCss, /object-fit:cover/);
assert.match(objectsCss, /house-object-02-cufflinks[^\n]+object-position:73% center/);
assert.match(objectsJs, /var reviewMode = reviewHost && root\.dataset\.objectsReview === 'true'/);
assert.match(objectsJs, /window\.location\.hostname === 'localhost'/);
assert.match(objectsJs, /window\.location\.hostname === '127\.0\.0\.1'/);
assert.doesNotMatch(objects, /<div class="review-ribbon" id="reviewRibbon">LOCAL REVIEW/);
for (const page of [objects, refer]) assert.match(page, /bullen-wallet-chooser\.js\?v=20260829b/);
assert.match(objects, /objects\.css\?v=20260829b/);
assert.match(objects, /objects\.js\?v=20260829b/);

console.log('House integrations: ok (roadmap, accounting, events, assets, wallets)');
