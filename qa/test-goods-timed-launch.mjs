import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { merchPreview } from '../src/merch-preview.mjs';

const origin = 'https://bullenciaga.com';
const launchAt = '2026-10-10T19:00:00+02:00';
const instant = Date.parse(launchAt);
const robots = '<meta name="robots" content="noindex,nofollow,noarchive" data-goods-private-only>';
const coming = '<span data-goods-private-only> <span>—</span> COMING SOON</span>';
const index = `<!doctype html><html><head>${robots}<meta name="description" content="House"></head><body><p class="header-note">COLLECTION 01${coming}</p><span data-goods-private-only-example>KEEP</span><span>Other</span></body></html>`;
const password = 'timed-launch-test-password';
function environment(extra = {}) {
  const reads = [];
  return {
    reads, MERCH_PREVIEW_PROTECTED: 'scheduled', GOODS_LAUNCH_AT: launchAt,
    MERCH_PREVIEW_PASSWORD_SHA256: createHash('sha256').update(password).digest('hex'),
    MERCH_PREVIEW_SESSION_SECRET: 'timed-launch-test-only-session-secret',
    MERCH_PREVIEW_PREFIX: 'timed-test',
    MERCH_PREVIEW_LIMIT: { async limit() { return { success: true }; } },
    MERCH_PREVIEW_ASSETS: {
      async get(key) { reads.push(['get', key]); return { body: key.endsWith('/index.html') ? index : 'asset', httpMetadata: { contentType: 'bad/type', cacheControl: 'public' }, size: index.length, etag: 'stored-etag' }; },
      async head(key) { reads.push(['head', key]); return { size: index.length, etag: 'stored-etag', get body() { throw Error('HEAD must not read a body'); } }; },
    },
    ...extra,
  };
}
async function send(now, path = '/goods/', env = environment(), options = {}) {
  const realNow = Date.now;
  try {
    Date.now = () => now;
    return await merchPreview(new Request(origin + path, options), env);
  } finally { Date.now = realNow; }
}
async function status(now, env = environment()) {
  const response = await send(now, '/goods/api/launch-status', env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  const result = await response.json();
  assert.deepEqual(Object.keys(result).sort(), ['launchAt', 'open', 'serverTime']);
  assert.equal(result.serverTime, new Date(now).toISOString());
  return result;
}
async function script(now, env = environment()) {
  const response = await send(now, '/goods/?next=https://example.invalid', env);
  const body = await response.text();
  const scripts = [...body.matchAll(/<script nonce="[a-f0-9]{32}">([\s\S]*?)<\/script>/g)];
  return { script: scripts.at(-1)?.[1], body };
}

for (const [offset, open] of [[-1, false], [0, true], [1, true], [86400000, true]]) {
  test(`server gates page, asset and catalog at launch ${offset}ms`, async () => {
    const env = environment();
    assert.equal((await status(instant + offset, env)).open, open);
    assert.deepEqual(env.reads, [], 'status never reads storage or private catalog data');
    const page = await send(instant + offset, '/goods/', env);
    const body = await page.text();
    assert.equal(page.status, 200);
    if (open) {
      assert.equal(body, index.replace(robots, '').replace(coming, ''));
      assert.equal(page.headers.get('X-Robots-Tag'), null);
      assert.equal(page.headers.get('Vary'), null);
      assert.equal(page.headers.get('ETag'), null);
      assert.equal(page.headers.get('Content-Length'), null);
    } else {
      assert.match(body, /action="\/goods\/login"/);
      assert.doesNotMatch(body, /class="header-note"/);
      assert.match(page.headers.get('X-Robots-Tag'), /noindex/);
    }
    assert.equal((await send(instant + offset, '/goods/storefront-v30.js', env)).status, open ? 200 : 401);
    assert.equal((await send(instant + offset, '/goods/api/catalog', env)).status, open ? 200 : 401);
  });
}

test('forced private overrides a passed deadline; explicit public ignores schedule and page-password secrets', async () => {
  const forced = environment({ MERCH_PREVIEW_PROTECTED: '1' });
  assert.equal((await status(instant + 86400000, forced)).open, false);
  assert.equal((await send(instant + 86400000, '/goods/storefront-v30.js', forced)).status, 401);
  const publicEnv = environment({ MERCH_PREVIEW_PROTECTED: '0', GOODS_LAUNCH_AT: 'invalid', MERCH_PREVIEW_PASSWORD_SHA256: undefined, MERCH_PREVIEW_SESSION_SECRET: undefined });
  assert.deepEqual(await status(instant - 86400000, publicEnv), { open: true, serverTime: new Date(instant - 86400000).toISOString(), launchAt: null });
  assert.equal((await send(instant - 86400000, '/goods/storefront-v30.js', publicEnv)).status, 200);
});

test('missing/unknown modes and missing/malformed/nonexistent calendar dates fail closed without a false countdown', async () => {
  const invalidDates = [undefined, '', 'tomorrow', '2026-10-10', '2026-10-10T17:00:00', '2026-02-30T17:00:00Z', '2025-02-29T17:00:00Z', '2026-13-10T17:00:00Z', '2026-10-00T17:00:00Z', '2026-10-10T24:00:00Z', '2026-10-10T17:60:00Z', '2026-10-10T17:00:60Z', '2026-10-10T17:00:00+24:00', '2026-10-10T17:00:00+02:60', '2026-10-10T17:00:00Z"<script>'];
  for (const date of invalidDates) {
    const env = environment({ GOODS_LAUNCH_AT: date });
    assert.deepEqual(await status(instant + 86400000, env), { open: false, serverTime: new Date(instant + 86400000).toISOString(), launchAt: null });
    assert.equal((await send(instant + 86400000, '/goods/storefront-v30.js', env)).status, 401);
    const { body } = await script(instant + 86400000, env);
    assert.match(body, /currently in private view/);
    assert.doesNotMatch(body, /<time |id="countdown"|Coming soon|Coming this Saturday/);
  }
  for (const mode of [undefined, '', 'false', 'Scheduled', '2']) {
    const env = environment({ MERCH_PREVIEW_PROTECTED: mode });
    assert.equal((await status(instant + 86400000, env)).open, false);
    assert.equal((await send(instant + 86400000, '/goods/storefront-v30.js', env)).status, 401);
  }
  assert.equal((await status(instant, environment({ GOODS_LAUNCH_AT: '2024-02-29T17:00:00.001Z' }))).open, true);
});

test('public status does not promise access when required asset configuration is invalid', async () => {
  for (const bad of [{ MERCH_PREVIEW_ASSETS: undefined }, { MERCH_PREVIEW_ASSETS: { get() {} } }, { MERCH_PREVIEW_PREFIX: '../invalid' }, { MERCH_PREVIEW_LIMIT: null }]) {
    const env = environment(bad);
    assert.equal((await status(instant, env)).open, false);
    assert.equal((await send(instant, '/goods/', env)).status, 503);
  }
  const env = environment({ MERCH_PREVIEW_PASSWORD_SHA256: undefined, MERCH_PREVIEW_SESSION_SECRET: undefined });
  assert.equal((await status(instant - 1, env)).open, false);
  assert.equal((await status(instant, env)).open, true, 'obsolete page-password configuration cannot obstruct public access');
});

test('status GET/HEAD only, no cookies, no storage and HTTPS only; legacy route remains a local redirect', async () => {
  const env = environment();
  const head = await send(instant - 1, '/goods/api/launch-status', env, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await send(instant, '/goods/api/launch-status', env, { method });
    assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  }
  const insecure = await merchPreview(new Request('http://bullenciaga.com/goods/api/launch-status'), env);
  assert.equal(insecure.status, 503);
  const legacy = await send(instant - 1, '/merch/api/launch-status?next=https://example.invalid', env);
  assert.equal(legacy.status, 308); assert.equal(legacy.headers.get('Location'), '/goods/api/launch-status?next=https://example.invalid');
  assert.deepEqual(env.reads, []);
});

test('private authenticated index is byte-exact; opening strips only marked nested fragments and preserves HEAD', async () => {
  const env = environment();
  const login = await send(instant - 1000, '/goods/login', env, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) });
  assert.equal(login.status, 303);
  const Cookie = login.headers.get('Set-Cookie').split(';')[0];
  assert.equal(await (await send(instant - 1, '/goods/', env, { headers: { Cookie } })).text(), index);
  for (const offset of [-1, 0]) {
    const response = await send(instant + offset, '/goods/', env, { method: 'HEAD', headers: { Cookie } });
    assert.equal(response.status, 200); assert.equal(await response.text(), '');
    assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('Content-Length'), null); assert.equal(response.headers.get('ETag'), null);
  }
  assert.equal(await (await send(instant, '/goods/', env)).text(), index.replace(robots, '').replace(coming, ''));
  const logout = await send(instant, '/goods/logout', env, { headers: { Cookie } });
  assert.equal(logout.status, 303); assert.equal(logout.headers.get('Location'), '/goods/');
  assert.match(logout.headers.get('Set-Cookie'), /^__Secure-bullen_merch=;/);
  assert.doesNotMatch(logout.headers.get('Set-Cookie'), /wallet/);
});

function browser(code, { wallTime = instant + 365 * 86400000, replies = [] } = {}) {
  let mono = 0, sequence = 0, hidden = false;
  const timers = new Map(), intervals = [], events = new Map(), requests = [], navigations = [], delays = [];
  const nodes = new Map(['countdown', 'launch-note', ...[0, 1, 2, 3].map(i => `countdown-${i}`)].map(id => [id, { textContent: '', setAttribute() {} }]));
  const document = { getElementById: id => nodes.get(id), get hidden() { return hidden; }, addEventListener: (name, callback) => events.set(name, callback) };
  const context = {
    Date: { parse: Date.parse, now: () => wallTime }, performance: { now: () => mono }, document, AbortController,
    location: { replace: path => navigations.push(path) },
    setInterval(callback, delay) { assert.equal(delay, 1000); intervals.push(callback); return ++sequence; },
    setTimeout(callback, delay) { assert(delay >= 0 && delay <= 60000); delays.push(delay); const id = ++sequence; timers.set(id, { callback, at: mono + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(path, options) {
      requests.push({ path, options });
      assert.equal(path, '/goods/api/launch-status'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
      const next = replies.shift();
      if (typeof next === 'function') return await next(options);
      if (next instanceof Error) throw next;
      return { ok: true, json: async () => next };
    },
  };
  runInNewContext(code, context, { timeout: 1000 });
  return {
    requests, navigations, timers, delays,
    digits: () => [0, 1, 2, 3].map(i => nodes.get(`countdown-${i}`).textContent),
    async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); },
    async fireNext() {
      const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0] || [];
      assert(timer, 'expected a bounded retry/check'); timers.delete(id); mono = timer.at; timer.callback();
      intervals.forEach(callback => callback()); await this.flush();
    },
    advance(ms) { mono += ms; intervals.forEach(callback => callback()); },
    async visibility(value) { hidden = value; events.get('visibilitychange')(); await this.flush(); },
  };
}
const result = (open, now, at = launchAt) => ({ open, serverTime: new Date(now).toISOString(), launchAt: at });

test('device clock drift never grants access; countdown reaches zero but requires fresh server open:true', async () => {
  const { script: code } = await script(instant - 1000);
  for (const wallTime of [instant - 365 * 86400000, instant + 365 * 86400000]) {
    const client = browser(code, { wallTime, replies: [result(false, instant - 500), result(true, instant)] });
    assert.deepEqual(client.digits(), ['00', '00', '00', '01']);
    client.advance(1000);
    assert.deepEqual(client.digits(), ['00', '00', '00', '00']);
    assert.deepEqual(client.navigations, []);
    await client.fireNext();
    assert.deepEqual(client.navigations, [], 'a server reporting closed overrides an expired local countdown');
    assert.deepEqual(client.digits(), ['00', '00', '00', '01'], 'fresh server time corrects drift');
    await client.fireNext();
    assert.deepEqual(client.navigations, ['/goods/'], 'navigation uses a fixed local URL, ignoring query parameters');
    assert.equal(client.timers.size, 0);
  }
});

test('network errors, invalid payloads and non-2xx responses retry with bounded backoff without opening', async () => {
  const { script: code } = await script(instant - 1);
  const replies = [new Error('offline'), { open: 'true', serverTime: new Date(instant).toISOString(), launchAt }, () => ({ ok: false }), new Error('offline'), new Error('offline'), new Error('offline'), result(true, instant + 60000)];
  const client = browser(code, { replies });
  for (const expectedDelay of [2000, 4000, 8000, 16000, 30000, 30000]) {
    await client.fireNext();
    assert.deepEqual(client.navigations, []);
    assert.equal(client.delays.at(-1), expectedDelay);
    assert.equal(client.timers.size, 1);
  }
  await client.fireNext(); assert.deepEqual(client.navigations, ['/goods/']);
});

test('sleeping tabs pause polling, resume checks immediately, and overlapping checks are suppressed', async () => {
  const { script: code } = await script(instant - 300000);
  let complete;
  const client = browser(code, { replies: [() => new Promise(resolve => { complete = resolve; })] });
  assert.equal(client.delays[0], 60000);
  await client.visibility(true); assert.equal(client.timers.size, 0);
  client.advance(600000); assert.deepEqual(client.navigations, []);
  await client.visibility(false); assert.equal(client.requests.length, 1);
  await client.visibility(false); assert.equal(client.requests.length, 1);
  complete({ ok: true, json: async () => result(true, instant + 300000) });
  await client.flush(); assert.deepEqual(client.navigations, ['/goods/']);
});

test('a hung status check aborts after five seconds and schedules a retry', async () => {
  const { script: code } = await script(instant - 1);
  const client = browser(code, { replies: [options => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')))), result(true, instant + 10000)] });
  await client.fireNext(); assert.equal(client.requests.length, 1); assert.equal(client.timers.size, 1);
  await client.fireNext(); assert.equal(client.requests[0].options.signal.aborted, true);
  assert.deepEqual(client.navigations, []); assert.equal(client.delays.at(-1), 2000);
  await client.fireNext(); assert.deepEqual(client.navigations, ['/goods/']);
});

test('forced-private page never polls or enters automatically even after its displayed deadline', async () => {
  const { script: code } = await script(instant - 1, environment({ MERCH_PREVIEW_PROTECTED: '1' }));
  const client = browser(code);
  client.advance(86400000); await client.visibility(false);
  assert.equal(client.timers.size, 0); assert.deepEqual(client.requests, []); assert.deepEqual(client.navigations, []);
});
