import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {hwBase58Encode} from '../site/wallet-proof-format.mjs';
import {
  GoodsBenefitsStore, createGoodsBenefitsHandler, createFourthwallBenefitsClient,
  normalizeCustomOptions, FourthwallRateLimitError,
} from '../src/goods-benefits.mjs';

// All supplier, chain and checkout operations below are in-memory fixtures.
const TEE_TEMPLATE = 'pro_05kHMsNpQZubKsMrnysvyQ';
const HOODIE_TEMPLATE = 'pro_PpTzovAMQWC_bvGw0IHh4w';
const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
const HOODIE_COLOURS = ['Black', 'Ink Blue', 'Athletic Heather', 'Natural'];
const HOODIE_COSTS = [47.95, 47.95, 47.95, 47.95, 49.95, 51.95];
const HOODIE_MARGINS = [45.17, 45.17, 45.17, 45.17, 43.17, 41.17];
const HOODIE_PRICES = Object.fromEntries(SIZES.map(size => [size, 99.99]));
const TEE_PRICES = Object.fromEntries(SIZES.map(size => [size, 49.99]));
const enc = new TextEncoder();
const migrations = readdirSync(new URL('../migrations/goods/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
const migrationSQL = name => readFileSync(new URL('../migrations/goods/' + name, import.meta.url), 'utf8');

function template(garment) {
  return {
    productId: garment === 'hoodie' ? HOODIE_TEMPLATE : TEE_TEMPLATE,
    colorVariants: (garment === 'hoodie' ? HOODIE_COLOURS : ['Black', 'Butter']).map(name => ({
      available: true, color: {name, hex: ({Black: '#252223', 'Ink Blue': '#2a2836', 'Athletic Heather': '#b1b1b1', Natural: '#dad6cd'})[name] || '#e7dfcf'},
      sizeVariants: SIZES.map((size, index) => ({
        size, available: true,
        price: {amount: garment === 'hoodie' ? HOODIE_COSTS[index] : [24.84, 24.84, 24.84, 24.84, 26.84, 28.84][index], currency: 'USD'},
      })),
    })),
    customizableAreas: garment === 'hoodie' ? [
      {regionId: 'front', available: true, supportsBackendRendering: true, productionMethod: 'DTG', dimensions: {inchesWidth: 15.5, inchesHeight: 12}},
      {regionId: 'back', available: true, supportsBackendRendering: true, productionMethod: 'DTG', dimensions: {inchesWidth: 15.5, inchesHeight: 19.6}},
    ] : [{regionId: 'front', dimensions: {inchesWidth: 15.5, inchesHeight: 19.6}}],
  };
}

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of migrations) sqlite.exec(migrationSQL(name));
  const prepare = sql => ({bind(...args) {
    const statement = sqlite.prepare(sql);
    return {
      first: async () => statement.get(...args) || null,
      all: async () => ({results: statement.all(...args)}),
      run: async () => ({meta: {changes: Number(statement.run(...args).changes)}}),
    };
  }});
  return {sqlite, prepare, batch: async statements => {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }};
}

async function wallet() {
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  return {keys, address: hwBase58Encode(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)))};
}

function product(id, price, colour = 'Butter', size = 'M') {
  return {id, type: 'STANDARD', access: {type: 'HIDDEN'}, state: {type: 'AVAILABLE'}, variants: [{
    id: 'variant-' + id, unitPrice: {value: price, currency: 'USD'},
    attributes: {color: {name: colour}, size: {name: size}}, stock: {type: 'UNLIMITED'},
  }]};
}

function previews(colour, id = 'design') {
  return ['front', 'back'].map(region => ({
    region, color: colour, style: 'default', width: 1200, height: 1200,
    url: `https://imgproxy.fourthwall.dev/${id}-${region}.jpg`,
  }));
}

async function harness({legacyProvider = false, queued = false} = {}) {
  const db = database(), store = new GoodsBenefitsStore(db), w = await wallet(), mint = (await wallet()).address;
  let time = Date.parse('2026-10-10T12:00:00Z'), owns = true, productCounter = 0, designCounter = 0;
  let resolve = async (asset, garment = 'tee') => garment === 'hoodie' ? {
    imageId: 'fixture-back-art', placementStrategy: 'FULL_REGION',
    printInfo: {region: 'back', widthCm: 30.5, sourcePixels: 1800, dpi: 150, upscaled: false},
    printMessage: 'Square back print: approximately 30.5 × 30.5 cm. BULLENCIAGA wordmark on the chest.',
  } : {imageId: 'fixture-front-art'};
  const templates = {tee: template('tee'), hoodie: template('hoodie')};
  const products = new Map([['standard', product('standard', 54.99)]]);
  const promotions = new Map(), designs = new Map(), orders = new Map(), calls = [], queue = [];
  const asset = {mint, name: 'HERD #42', image: 'https://gateway.irys.xyz/fixture-art', collection: 'The Herd'};
  const provider = {
    template: async () => structuredClone(templates.tee),
    getProduct: async id => structuredClone(products.get(id)),
    getPromotion: async id => structuredClone(promotions.get(id)),
    findPromotion: async code => structuredClone([...promotions.values()].find(p => p.code === code) || null),
    createPromotion: async body => {
      calls.push(['promotion', body]);
      const p = {id: 'promo-' + body.code, code: body.code, type: 'SHOP_SINGLE',
        discount: {type: 'PERCENTAGE', percentage: body.percent, shippingOption: 'Excluded'},
        status: 'Live', usageCount: 0, limits: {maximumUsesNumber: 1}, appliesTo: {type: 'ENTIRE_ORDER'}};
      promotions.set(p.id, p);
      return structuredClone(p);
    },
    setProductAvailable: async (id, available) => {
      calls.push(['availability', id, available]);
      products.get(id).state.type = available ? 'AVAILABLE' : 'SOLD_OUT';
      return {};
    },
    uploadImage: async () => { calls.push(['upload']); return 'fixture-upload'; },
    createCustomization: async body => {
      calls.push(['customization', body]);
      const id = 'design-' + (++designCounter);
      designs.set(id, structuredClone(body));
      return {customizationId: id, images: body.garment === 'hoodie' ? previews(body.colour, id) : [{url: `https://imgproxy.fourthwall.dev/${id}-tee.jpg`}]};
    },
    createProduct: async body => {
      calls.push(['product', body]);
      const design = designs.get(body.customizationId), garment = design.garment || 'tee';
      const cost = templates[garment].colorVariants.find(c => c.color.name === design.colour).sizeVariants.find(s => s.size === design.size).price.amount;
      // Emulate the supplier's two-print-area surcharge independently of the handler.
      const actualPrice = Math.round((cost + (garment === 'hoodie' ? 6.87 : 0) + body.profitMargin) * 100) / 100;
      const id = 'custom-' + (++productCounter);
      products.set(id, product(id, actualPrice, design.colour, design.size));
      return {productId: id};
    },
    createCart: async body => {
      calls.push(['cart', body]);
      const variant = structuredClone([...products.values()].flatMap(p => p.variants).find(v => v.id === body.variantId));
      return {checkoutUrl: 'https://store.bullenciaga.com/cart/checkout?cartId=fixture', cart: {items: [{quantity: 1, variant}]}};
    },
    getOrder: async id => structuredClone(orders.get(id)),
    listOrders: async () => ({results: [...orders.values()]}),
  };
  if (!legacyProvider) provider.customTemplate = async garment => structuredClone(templates[garment]);
  const chain = {
    balance: async () => ({raw: '5000000000000', decimals: 6}),
    list: async () => owns ? [asset] : [],
    owned: async (address, id) => owns && address === w.address && id === mint ? asset : null,
  };
  const handler = createGoodsBenefitsHandler({
    db, store, provider, chain, authorize: async () => true, rateLimit: async () => true,
    metadataSecret: 'hoodie-fixture-secret-long-enough', webhookSecret: 'hoodie-fixture-webhook-long-enough',
    shopId: 'shop-fixture', eligibleProductIds: ['standard'],
    resolvePrintAsset: (a, garment) => { calls.push(['resolve', garment]); return resolve(a, garment); },
    now: () => time, ...(queued ? {enqueueCustom: async id => queue.push(id)} : {}),
  });
  let cookie = '';
  function request(path, body) {
    return new Request('https://bullenciaga.com/goods/api/benefits' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {Origin: 'https://bullenciaga.com', 'Content-Type': 'application/json', Cookie: cookie},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
  }
  async function api(path, body) {
    const response = await handler(request(path, body));
    return {status: response.status, body: await response.json(), response};
  }
  async function login() {
    const challenge = await api('/challenge', {wallet: w.address});
    assert.equal(challenge.status, 200);
    const proof = hwBase58Encode(new Uint8Array(await crypto.subtle.sign('Ed25519', w.keys.privateKey, enc.encode(challenge.body.message))));
    const verified = await api('/verify', {challengeId: challenge.body.challengeId, proof});
    assert.equal(verified.status, 200);
    cookie = verified.response.headers.get('set-cookie').split(';')[0];
  }
  return {db, store, w, mint, asset, templates, provider, products, promotions, designs, orders, calls, queue, handler, api, login,
    advance: milliseconds => { time += milliseconds; }, time: () => time,
    setOwns: value => { owns = value; }, setResolve: fn => { resolve = fn; }};
}

const customBody = (h, overrides = {}) => ({mint: h.mint, garment: 'hoodie', colour: 'Black', size: 'M', idempotencyKey: 'hoodie-fixture-request-1234', ...overrides});
const countCalls = (h, operation) => h.calls.filter(call => call[0] === operation).length;

test('migration preserves a pre-hoodie request and defaults legacy inserts to tee', () => {
  const sqlite = new DatabaseSync(':memory:');
  const cut = migrations.findIndex(name => name.startsWith('0006'));
  assert.ok(cut >= 0, 'hoodie migration is included');
  for (const name of migrations.slice(0, cut)) sqlite.exec(migrationSQL(name));
  sqlite.prepare(`INSERT INTO goods_benefit_requests
    (id,wallet,kind,idempotency_key,state,created_at,updated_at,expires_at,mint,colour,size,price,preview,print_info)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('legacy-tee', 'wallet', 'custom', 'legacy-choice-key', 'ready', 1, 1, 9999999999999, 'mint', 'Black', 'M', 49.99, 'https://imgproxy.fourthwall.dev/legacy.jpg', '{"widthCm":17.3}');
  for (const name of migrations.slice(cut)) sqlite.exec(migrationSQL(name));
  const row = sqlite.prepare('SELECT * FROM goods_benefit_requests WHERE id=?').get('legacy-tee');
  assert.equal(row.garment, 'tee');
  assert.equal(row.price, 49.99);
  assert.equal(row.preview, 'https://imgproxy.fourthwall.dev/legacy.jpg');
  assert.deepEqual(JSON.parse(row.print_info), {widthCm: 17.3});
  const insert = sqlite.prepare(`INSERT INTO goods_benefit_requests
    (id,wallet,kind,idempotency_key,state,created_at,updated_at,expires_at,mint,colour,size,garment)
    VALUES(?,?,'custom',?,'preparing',1,1,9999999999999,'mint','Black','M',?)`);
  insert.run('new-hoodie', 'wallet', 'hoodie-choice-key', 'hoodie');
  assert.throws(() => insert.run('duplicate-tee', 'wallet', 'duplicate-tee-key', 'tee'), /UNIQUE/);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM goods_benefit_requests').get().n, 2);
  sqlite.close();
});

test('options retain legacy tee fields and expose distinct print regions, prices and all hoodie choices', async () => {
  const h = await harness();
  const result = await h.api('/status');
  assert.equal(result.status, 200);
  const {options} = result.body;
  assert.equal(options.template, 'AS Colour Heavy T-shirt');
  assert.deepEqual(options.products.map(p => p.id), ['tee', 'hoodie']);
  const tee = options.products.find(p => p.id === 'tee'), hoodie = options.products.find(p => p.id === 'hoodie');
  assert.deepEqual(options.colours, tee.colours);
  assert.equal(tee.printRegion, 'front');
  assert.equal(tee.printWidthCm, 32);
  assert.equal(hoodie.printRegion, 'back');
  assert.equal(hoodie.printWidthCm, 30.5);
  assert.match(tee.label, /tee|t-shirt/i);
  assert.match(hoodie.label, /hoodie/i);
  assert.deepEqual(hoodie.colours.map(c => c.name), HOODIE_COLOURS);
  assert.equal(hoodie.colours.flatMap(c => c.sizes).length, 24);
  assert.ok(hoodie.colours.flatMap(c => c.sizes).every(s => s.price === 99.99 && s.currency === 'USD'));
  assert.ok(tee.colours.flatMap(c => c.sizes).every(s => s.price === 49.99));
});

test('hoodie normalization excludes unavailable, foreign-currency and unprofitable choices without hiding valid sizes', () => {
  const input = template('hoodie');
  input.colorVariants[0].sizeVariants[0].available = false;
  input.colorVariants[0].sizeVariants[1].price.currency = 'EUR';
  input.colorVariants[0].sizeVariants[2].price.amount = 95;
  input.colorVariants[1].available = false;
  const normalized = normalizeCustomOptions(input, HOODIE_PRICES, 'hoodie');
  assert.deepEqual(normalized.colours.map(c => c.name), ['Black', 'Athletic Heather', 'Natural']);
  assert.deepEqual(normalized.colours[0].sizes.map(s => s.name), ['XL', '2XL', '3XL']);
  assert.throws(() => normalizeCustomOptions(template('tee'), HOODIE_PRICES, 'hoodie'));
  assert.throws(() => normalizeCustomOptions(template('hoodie'), TEE_PRICES, 'tee'));
});

test('legacy provider and omitted garment still create a $49.99 tee without hoodie behavior', async () => {
  const h = await harness({legacyProvider: true});
  await h.login();
  const body = customBody(h, {colour: 'Butter'});
  delete body.garment;
  const result = await h.api('/custom', body);
  assert.equal(result.status, 202);
  assert.equal(result.body.state, 'ready');
  assert.equal(result.body.garment, 'tee');
  assert.equal(result.body.price, 49.99);
  assert.match(result.body.label, /tee|t-shirt/i);
  assert.match(result.body.preview, /tee\.jpg$/);
  assert.equal((await h.store.request(result.body.id)).garment, 'tee');
  assert.equal((await h.api('/custom', {...body, garment: 'tee'})).body.id, result.body.id);
  assert.equal(countCalls(h, 'product'), 1);
  assert.equal((await h.api(`/custom/${result.body.id}/checkout`, {})).status, 200);
  assert.equal(h.products.get('standard').variants[0].unitPrice.value, 54.99);
});

test('a migrated ready tee still exposes its original front preview without regeneration', async () => {
  const h = await harness();
  await h.login();
  h.db.sqlite.prepare(`INSERT INTO goods_benefit_requests
    (id,wallet,kind,idempotency_key,state,created_at,updated_at,expires_at,mint,colour,size,price,preview,print_info)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('legacy-ready', h.w.address, 'custom', 'legacy-ready-request-1234', 'ready', h.time(), h.time(), h.time() + 86400000, h.mint, 'Butter', 'M', 49.99, 'https://imgproxy.fourthwall.dev/original-tee.jpg', '{"widthCm":17.3}');
  const result = await h.api('/custom/legacy-ready');
  assert.equal(result.status, 200);
  assert.equal(result.body.garment, 'tee');
  assert.equal(result.body.preview, 'https://imgproxy.fourthwall.dev/original-tee.jpg');
  assert.deepEqual(result.body.previews, [{region: 'front', url: result.body.preview}]);
  assert.deepEqual(result.body.printInfo, {widthCm: 17.3});
  assert.equal(h.calls.length, 0);
});

test('same NFT, colour and size can be saved once per garment; idempotency cannot cross garments', async () => {
  const h = await harness({queued: true});
  await h.login();
  const teeBody = customBody(h, {garment: 'tee', idempotencyKey: 'shared-nft-tee-request-1234'});
  const tee = await h.api('/custom', teeBody);
  const hoodie = await h.api('/custom', customBody(h));
  assert.equal(tee.status, 202);
  assert.equal(hoodie.status, 202);
  assert.notEqual(tee.body.id, hoodie.body.id);
  assert.equal(tee.body.price, 49.99);
  assert.equal(hoodie.body.price, 99.99);
  const duplicate = await h.api('/custom', customBody(h, {idempotencyKey: 'new-key-same-hoodie-1234'}));
  assert.equal(duplicate.body.id, hoodie.body.id);
  const conflict = await h.api('/custom', {...teeBody, garment: 'hoodie'});
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'REQUEST_CONFLICT');
  const saved = (await h.api('/status')).body.custom.savedRequests;
  assert.deepEqual(saved.map(r => r.garment).sort(), ['hoodie', 'tee']);
  assert.equal(h.queue.length, 2);
  assert.equal(countCalls(h, 'product'), 0);
});

test('invalid garment identifiers fail before any reservation or supplier mutation', async () => {
  const h = await harness({queued: true});
  await h.login();
  for (const garment of ['crewneck', 'HOODIE', '', null, {}, ['hoodie']]) {
    const result = await h.api('/custom', customBody(h, {garment}));
    assert.equal(result.status, 400, JSON.stringify(garment));
  }
  assert.equal((await h.store.savedCustom(h.w.address, h.time())).length, 0);
  assert.equal(h.queue.length, 0);
  assert.equal(h.calls.length, 0);
});

test('all 24 hoodie choices create exact $99.99 products including second-print cost and retain back/front previews through checkout', async t => {
  for (const colour of HOODIE_COLOURS) {
    for (const [index, size] of SIZES.entries()) {
      await t.test(`${colour} / ${size}`, async () => {
        const h = await harness();
        await h.login();
        const result = await h.api('/custom', customBody(h, {colour, size}));
        assert.equal(result.status, 202);
        assert.equal(result.body.state, 'ready');
        assert.equal(result.body.garment, 'hoodie');
        assert.equal(result.body.price, 99.99);
        assert.equal(result.body.currency, 'USD');
        assert.equal(h.calls.find(c => c[0] === 'product')[1].profitMargin, HOODIE_MARGINS[index]);
        const customization = h.calls.find(c => c[0] === 'customization')[1];
        assert.equal(customization.garment, 'hoodie');
        assert.equal(customization.placementStrategy, 'FULL_REGION');
        assert.equal(customization.imageId, 'fixture-back-art');
        assert.equal(customization.colour, colour);
        assert.equal(customization.size, size);
        assert.equal(result.body.printInfo.region, 'back');
        assert.equal(result.body.printInfo.widthCm, 30.5);
        assert.match(result.body.preview, /-back\.jpg$/);
        assert.deepEqual(result.body.previews.map(p => p.region).sort(), ['back', 'front']);
        assert.equal(result.body.previews.find(p => p.region === 'back').url, result.body.preview);
        const polled = (await h.api('/custom/' + result.body.id)).body;
        const saved = (await h.api('/status')).body.custom.savedRequests.find(r => r.id === result.body.id);
        assert.deepEqual(polled.previews, result.body.previews);
        assert.deepEqual(saved.previews, result.body.previews);
        assert.equal(saved.price, 99.99);
        assert.match(h.calls.find(c => c[0] === 'product')[1].description, /back/i);
        assert.equal((await h.api(`/custom/${result.body.id}/checkout`, {})).status, 200);
        assert.equal(h.products.get('standard').variants[0].unitPrice.value, 54.99);
      });
    }
  }
});

test('real supplier adapter chooses 5151 with full-region front/back artwork and contrasting fixed chest assets', async () => {
  const calls = [];
  const client = createFourthwallBenefitsClient({username: 'fixture', password: 'fixture', fetchImpl: async (url, options) => {
    calls.push({url: String(url), method: options.method, body: options.body && JSON.parse(options.body)});
    return Response.json({customizationId: 'fixture'});
  }});
  await client.template();
  await client.customTemplate('hoodie');
  assert.match(calls[0].url, new RegExp('/product-templates/' + TEE_TEMPLATE + '$'));
  assert.match(calls[1].url, new RegExp('/product-templates/' + HOODIE_TEMPLATE + '$'));
  const chestAssets = new Map();
  for (const colour of HOODIE_COLOURS) {
    await client.createCustomization({garment: 'hoodie', imageId: 'nft-back-only', colour, size: 'M', placementStrategy: 'FULL_REGION'});
    const body = calls.at(-1).body;
    assert.equal(body.productTemplateId, HOODIE_TEMPLATE);
    assert.deepEqual(body.colors, [colour]);
    assert.deepEqual(body.sizes, ['M']);
    assert.equal(body.regions.length, 2);
    const front = body.regions.find(region => region.region === 'front');
    const back = body.regions.find(region => region.region === 'back');
    assert.equal(back.imageId, 'nft-back-only');
    assert.equal(back.placementStrategy, 'FULL_REGION');
    assert.equal(front.placementStrategy, 'FULL_REGION');
    assert.equal(typeof front.imageId, 'string');
    assert.ok(front.imageId.length > 5);
    assert.notEqual(front.imageId, back.imageId);
    assert.ok(body.regions.every(region => !Object.hasOwn(region, 'placementId')));
    chestAssets.set(colour, front.imageId);
  }
  assert.equal(chestAssets.get('Black'), chestAssets.get('Ink Blue'));
  assert.equal(chestAssets.get('Athletic Heather'), chestAssets.get('Natural'));
  assert.notEqual(chestAssets.get('Black'), chestAssets.get('Natural'));
  await client.createCustomization({imageId: 'legacy-front', colour: 'Black', size: 'M'});
  assert.equal(calls.at(-1).body.productTemplateId, TEE_TEMPLATE);
  assert.deepEqual(calls.at(-1).body.regions, [{region: 'front', placementStrategy: 'PLACEMENT_ID', placementId: 'largeCenter', imageId: 'legacy-front'}]);
  assert.ok(calls.every(call => new URL(call.url).origin === 'https://api.fourthwall.com'));
});

test('hoodie previews fail closed for missing sides, unlabeled images or the wrong colour', async () => {
  const cases = [
    ['front only', previews('Black').filter(p => p.region === 'front')],
    ['back only', previews('Black').filter(p => p.region === 'back')],
    ['unlabeled', [{url: 'https://imgproxy.fourthwall.dev/unknown.jpg'}]],
    ['wrong colour', previews('Natural')],
    ['insecure back', previews('Black').map(p => p.region === 'back' ? {...p, url: 'http://imgproxy.fourthwall.dev/back.jpg'} : p)],
  ];
  for (const [label, images] of cases) {
    const h = await harness();
    await h.login();
    h.provider.createCustomization = async body => {h.calls.push(['customization', body]); return {customizationId: 'invalid-preview', images};};
    const result = await h.api('/custom', customBody(h));
    assert.equal(result.body.state, 'review_required', label);
    assert.equal(countCalls(h, 'product'), 0, label);
    assert.equal((await h.api(`/custom/${result.body.id}/checkout`, {})).status, 409, label);
  }
});

test('an unlabeled product response cannot overwrite the verified hoodie back preview', async () => {
  const h = await harness();
  await h.login();
  const create = h.provider.createProduct;
  h.provider.createProduct = async body => ({...await create(body), images: [{url: 'https://imgproxy.fourthwall.dev/unknown-front.jpg'}]});
  const result = await h.api('/custom', customBody(h));
  assert.equal(result.body.state, 'ready');
  assert.match(result.body.preview, /-back\.jpg$/);
  assert.ok(result.body.previews.every(p => !p.url.includes('unknown-front')));
});

test('a prepared tee image cannot silently become hoodie back artwork', async () => {
  for (const printInfo of [undefined, {region: 'front', widthCm: 32}]) {
    const h = await harness();
    await h.login();
    h.setResolve(async () => ({imageId: 'tee-front-canvas', printInfo}));
    const result = await h.api('/custom', customBody(h));
    assert.equal(result.body.state, 'review_required');
    assert.equal(countCalls(h, 'customization'), 0);
    assert.equal(countCalls(h, 'product'), 0);
  }
});

test('hoodie product price readback and actual cart price must both equal the $99.99 quote', async () => {
  const h = await harness();
  await h.login();
  const create = h.provider.createProduct;
  h.provider.createProduct = async body => {
    const result = await create(body);
    h.products.get(result.productId).variants[0].unitPrice.value = 106.86;
    return result;
  };
  const invalid = await h.api('/custom', customBody(h));
  assert.equal(invalid.body.state, 'review_required');
  assert.equal(h.products.get((await h.store.request(invalid.body.id)).product_id).state.type, 'SOLD_OUT');
  assert.equal((await h.api(`/custom/${invalid.body.id}/checkout`, {})).status, 409);
  assert.equal(countCalls(h, 'cart'), 0);

  const ready = await harness();
  await ready.login();
  const result = await ready.api('/custom', customBody(ready));
  assert.equal(result.body.state, 'ready');
  const saved = await ready.store.request(result.body.id), variant = ready.products.get(saved.product_id).variants[0];
  variant.unitPrice.value = 98.99;
  assert.equal((await ready.api(`/custom/${result.body.id}/checkout`, {})).status, 409);
  assert.equal(countCalls(ready, 'cart'), 0);
  variant.unitPrice.value = 99.99;
  const cart = ready.provider.createCart;
  ready.provider.createCart = async body => {
    const result = await cart(body);
    result.cart.items[0].variant.unitPrice.value = 98.99;
    return result;
  };
  const checkout = await ready.api(`/custom/${result.body.id}/checkout`, {});
  assert.equal(checkout.status, 503);
  assert.equal(checkout.body.checkoutUrl, undefined);
});

test('missing or nonnumeric supplier prices fail closed during preparation and both checkout readbacks', async t => {
  for (const stage of ['prepare', 'checkout', 'cart']) {
    for (const malformed of [undefined, 'unavailable']) {
      await t.test(`${stage}: ${String(malformed)}`, async () => {
        const h = await harness();
        await h.login();
        const corrupt = variant => {
          if (malformed === undefined) delete variant.unitPrice.value;
          else variant.unitPrice.value = malformed;
        };
        if (stage === 'prepare') {
          const create = h.provider.createProduct;
          h.provider.createProduct = async body => {
            const result = await create(body);
            corrupt(h.products.get(result.productId).variants[0]);
            return result;
          };
        }
        const result = await h.api('/custom', customBody(h));
        if (stage === 'prepare') {
          assert.equal(result.body.state, 'review_required');
          assert.equal((await h.api(`/custom/${result.body.id}/checkout`, {})).status, 409);
          assert.equal(countCalls(h, 'cart'), 0);
          return;
        }
        assert.equal(result.body.state, 'ready');
        if (stage === 'checkout') {
          const row = await h.store.request(result.body.id);
          corrupt(h.products.get(row.product_id).variants[0]);
        } else {
          const cart = h.provider.createCart;
          h.provider.createCart = async body => {
            const result = await cart(body);
            corrupt(result.cart.items[0].variant);
            return result;
          };
        }
        const checkout = await h.api(`/custom/${result.body.id}/checkout`, {});
        assert.equal(checkout.status, stage === 'checkout' ? 409 : 503);
        assert.equal(checkout.body.checkoutUrl, undefined);
        if (stage === 'checkout') assert.equal(countCalls(h, 'cart'), 0);
      });
    }
  }
});

test('the existing holder code applies to hoodie checkout without rewriting promotions or regular prices', async () => {
  const h = await harness();
  await h.login();
  const discount = await h.api('/discount', {});
  assert.equal(discount.status, 200);
  assert.equal(discount.body.percent, 20);
  h.provider.setPromotionProducts = async () => {throw Error('must not rewrite holder promotion');};
  h.provider.endPromotion = async () => {throw Error('must not replace holder promotion');};
  const hoodie = await h.api('/custom', customBody(h));
  const checkout = await h.api(`/custom/${hoodie.body.id}/checkout`, {holderDiscount: true});
  assert.equal(checkout.status, 200);
  const cart = h.calls.find(c => c[0] === 'cart')[1];
  assert.equal(cart.code, discount.body.code);
  assert.ok(cart.metadata.benefit_mac);
  assert.ok(cart.metadata.custom_mac);
  assert.ok(!JSON.stringify(cart.metadata).includes(h.w.address));
  assert.equal(countCalls(h, 'promotion'), 1);
  assert.equal(h.products.get('standard').variants[0].unitPrice.value, 54.99);
  assert.equal(hoodie.body.price, 99.99);
});

test('five saved-design slots are shared by tees and hoodies, including concurrent mixed requests', async () => {
  const h = await harness({queued: true});
  await h.login();
  const choices = SIZES.flatMap(size => ['tee', 'hoodie'].map(garment => customBody(h, {garment, size, idempotencyKey: `mixed-saved-${garment}-${size}-1234`})));
  const results = await Promise.all(choices.map(body => h.api('/custom', body)));
  assert.equal(results.filter(result => result.status === 202).length, 5);
  assert.ok(results.filter(result => result.status === 409).every(result => result.body.error.code === 'SAVED_LIMIT'));
  const status = (await h.api('/status')).body;
  assert.equal(status.custom.savedRequests.length, 5);
  assert.deepEqual(new Set(status.custom.savedRequests.map(r => r.garment)), new Set(['tee', 'hoodie']));
  assert.equal(status.custom.maxSaved, 5);
  assert.equal(status.custom.remainingOrders, 10);
  assert.equal(countCalls(h, 'product'), 0);
});

test('tee and hoodie reservations compete for the same final custom-order allowance', async () => {
  const h = await harness({queued: true});
  await h.login();
  await h.store.reserve({id: 'history', wallet: h.w.address, kind: 'custom', key: 'custom-order-history', state: 'consumed', now: 1, expiresAt: 1});
  await h.store.update('history', {active: 0}, 1);
  for (let i = 0; i < 9; i++) await h.store.run('INSERT INTO goods_benefit_orders VALUES(?,?,?,?,?,?)', 'custom-history-' + i, h.w.address, 'custom', 'history', 'CONFIRMED', 1);
  const results = await Promise.all(['tee', 'hoodie'].map(garment => h.api('/custom', customBody(h, {garment, idempotencyKey: `last-slot-${garment}-request-1234`}))));
  assert.equal(results.filter(result => result.status === 202).length, 1);
  assert.equal(results.find(result => result.status === 409).body.error.code, 'LIMIT_REACHED');
  const status = (await h.api('/status')).body;
  assert.equal(status.custom.completedOrders, 9);
  assert.equal(status.custom.remainingOrders, 1);
  assert.equal(status.custom.savedRequests.length, 1);
  assert.equal(await h.store.count(h.w.address, 'discount'), 0);
});

test('hoodie readback 429 resumes the same product and preserves both previews without repeating writes', async () => {
  const h = await harness({queued: true});
  await h.login();
  const result = await h.api('/custom', customBody(h)), get = h.provider.getProduct;
  let rejected = false;
  h.provider.getProduct = async id => {
    if (id.startsWith('custom-') && !rejected) {rejected = true; throw new FourthwallRateLimitError(120);}
    return get(id);
  };
  await assert.rejects(() => h.handler.processCustom(result.body.id), FourthwallRateLimitError);
  let row = await h.store.request(result.body.id);
  assert.equal(row.garment, 'hoodie');
  assert.equal(row.product_id, 'custom-1');
  assert.equal(row.stage, 'queued');
  assert.equal(row.retry_count, 1);
  assert.equal(row.next_retry_at, h.time() + 120000);
  assert.equal(row.active, 1);
  h.advance(120001);
  await h.handler.processCustom(result.body.id);
  row = await h.store.request(result.body.id);
  assert.equal(row.state, 'ready');
  const polled = (await h.api('/custom/' + row.id)).body;
  assert.equal(polled.price, 99.99);
  assert.match(polled.preview, /-back\.jpg$/);
  assert.deepEqual(polled.previews.map(p => p.region).sort(), ['back', 'front']);
  assert.equal(countCalls(h, 'resolve'), 1);
  assert.equal(countCalls(h, 'customization'), 1);
  assert.equal(countCalls(h, 'product'), 1);
  assert.equal((await h.api(`/custom/${row.id}/checkout`, {})).status, 200);
});

test('hoodie ownership is rechecked before preparation and rejected without a supplier write', async () => {
  const h = await harness({queued: true});
  await h.login();
  const result = await h.api('/custom', customBody(h));
  h.setOwns(false);
  await h.handler.processCustom(result.body.id);
  const row = await h.store.request(result.body.id);
  assert.equal(row.state, 'review_required');
  assert.equal(row.active, 0);
  assert.equal(countCalls(h, 'resolve'), 0);
  assert.equal(countCalls(h, 'customization'), 0);
  assert.equal(countCalls(h, 'product'), 0);
  assert.equal(await h.store.count(h.w.address, 'custom'), 0);
});
