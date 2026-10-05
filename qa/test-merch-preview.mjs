import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { merchPreview } from '../src/merch-preview.mjs';
import website from '../src/website.mjs';

const origin = 'https://bullenciaga.com';
const password = 'unit-test-preview-password';
const secret = 'unit-test-session-secret-do-not-deploy';
const passwordHash = createHash('sha256').update(password).digest('hex');
const prefix = 'unit-test-immutable-preview';
let reads = [], limitCalls = 0, allowed = true;
const objects = new Map([
  [`${prefix}/index.html`, '<!doctype html><title>Private fixture</title>'],
  [`${prefix}/assets/store.js`, '/* private fixture */'],
  [`${prefix}/images/hoodie.png`, 'image fixture'],
]);
const env = {
  MERCH_PREVIEW_PASSWORD_SHA256: passwordHash,
  MERCH_PREVIEW_SESSION_SECRET: secret,
  MERCH_PREVIEW_PREFIX: prefix,
  MERCH_PREVIEW_LIMIT: { async limit({ key }) { limitCalls++; assert.match(key, /^[a-f0-9]{64}$/); return { success: allowed }; } },
  MERCH_PREVIEW_ASSETS: {
    async get(key) { reads.push(['get', key]); return objects.has(key) ? { body: objects.get(key) } : null; },
    async head(key) { reads.push(['head', key]); return objects.has(key) ? {} : null; },
  },
  ASSETS: { fetch() { throw new Error('Private route reached public assets'); } },
};
const request = (path, options = {}) => new Request(`${origin}${path}`, options);
const post = (value = password, extra = {}, path = '/goods/login') => request(path, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '192.0.2.1', ...extra },
  body: new URLSearchParams({ password: value }),
});
function privateHeaders(response) {
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.match(response.headers.get('X-Robots-Tag'), /noindex.*noarchive/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  // Preserve native login/logout POST origins without sending cross-origin referrers.
  // A no-referrer response makes native form POSTs send Origin: null, which must stay denied.
  assert.equal(response.headers.get('Referrer-Policy'), 'same-origin');
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('ETag'), null);
}
function signedCookie(issued, expires, sessionSecret = secret) {
  const body = `v1.${issued}.${expires}.${'a'.repeat(32)}`;
  const signature = createHmac('sha256', sessionSecret).update(`merch-preview|${origin}|${passwordHash}|${body}`).digest('hex');
  return `__Secure-bullen_merch=${body}.${signature}`;
}

// Logged-out visitors receive only the generic gate, never any private payload.
for (const path of ['/goods', '/goods/']) {
  const response = await website.fetch(request(path), env);
  assert.equal(response.status, 200); privateHeaders(response);
  const body = await response.text();
  assert.match(body, /A first look/); assert.doesNotMatch(body, /Private fixture|unit-test|hoodie\.png/);
  assert.match(body, /action="\/goods\/login"/);
}
for (const path of ['/goods/index.html', '/goods/assets/store.js', '/goods/images/hoodie.png', '/goods/anything']) {
  const response = await website.fetch(request(path), env);
  assert.equal(response.status, 401); privateHeaders(response);
}
assert.deepEqual(reads, []);
const unauthenticatedHead = await merchPreview(request('/goods/', { method: 'HEAD' }), env);
assert.equal(await unauthenticatedHead.text(), '');

// Legacy links preserve their local suffix/query but never serve private bytes.
// A browser follows the redirect and then sends its /goods cookie if it has one.
for (const suffix of ['', '/', '/assets/store.js?rev=previous&next=https://evil.example', '//evil.example/path?x=1', '/login', '/logout']) {
  for (const method of ['GET', 'HEAD']) {
    const response = await website.fetch(request('/merch' + suffix, { method }), env);
    assert.equal(response.status, 308); privateHeaders(response);
    assert.equal(response.headers.get('Location'), '/goods' + suffix);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(await response.text(), '');
  }
}
const legacyAsset = await website.fetch(request('/merch/assets/store.js?version=old'), env);
assert.equal((await website.fetch(request(legacyAsset.headers.get('Location')), env)).status, 401);
assert.deepEqual(reads, []);
assert.equal(limitCalls, 0);

// Secrets, storage and throttling are all mandatory; failures never fall through.
for (const field of Object.keys(env).filter(key => key.startsWith('MERCH_'))) {
  for (const path of ['/goods/', '/merch/']) {
    const unavailable = await website.fetch(request(path), { ...env, [field]: undefined });
    assert.equal(unavailable.status, 503, field); privateHeaders(unavailable);
  }
}
for (const overrides of [
  { MERCH_PREVIEW_PASSWORD_SHA256: 'not-a-hash' },
  { MERCH_PREVIEW_SESSION_SECRET: 'too-short' },
  { MERCH_PREVIEW_PREFIX: '../public' },
  { MERCH_PREVIEW_PREFIX: 'nested/prefix' },
]) assert.equal((await merchPreview(request('/goods/'), { ...env, ...overrides })).status, 503);
assert.equal((await merchPreview(new Request('http://bullenciaga.com/merch'), env)).status, 503);

// Both state-changing routes require an exact same-origin POST.
for (const path of ['/goods/login', '/goods/logout', '/merch/login', '/merch/logout']) {
  for (const method of (path.startsWith('/merch/') ? ['PUT', 'DELETE', 'OPTIONS'] : ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'])) {
    const response = await merchPreview(request(path, { method }), env);
    assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'POST');
  }
  for (const originHeader of [undefined, 'null', 'https://evil.example', 'https://www.bullenciaga.com']) {
    const response = await merchPreview(request(path, { method: 'POST', headers: originHeader ? { Origin: originHeader } : {} }), env);
    assert.equal(response.status, 403);
  }
  assert.equal((await merchPreview(request(path, { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'cross-site' } }), env)).status, 403);
}
assert.equal(limitCalls, 0);
assert.equal((await merchPreview(post('wrong-password'), env)).status, 401);
assert.equal((await merchPreview(post('wrong-password', {}, '/merch/login'), env)).status, 401);
assert.equal((await merchPreview(post(''), env)).status, 401);
for (const [body, type] of [
  ['password=a&password=b', 'application/x-www-form-urlencoded'],
  ['password=a&extra=b', 'application/x-www-form-urlencoded'],
  ['password=' + 'a'.repeat(3000), 'application/x-www-form-urlencoded'],
  [JSON.stringify({ password }), 'application/json'],
]) assert.equal((await merchPreview(request('/goods/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': type }, body }), env)).status, 401);
allowed = false;
const throttled = await merchPreview(post(), env);
assert.equal(throttled.status, 429); assert.equal(throttled.headers.get('Retry-After'), '60');
assert.equal(throttled.headers.get('Set-Cookie'), null);
assert.equal((await merchPreview(post(password, {}, '/merch/login'), env)).status, 429);
allowed = true;
const limiterFailure = await merchPreview(post(), { ...env, MERCH_PREVIEW_LIMIT: { limit() { throw new Error('fixture'); } } });
assert.equal(limiterFailure.status, 503);

// Valid password issues only a signed, bounded, host-only HttpOnly session.
const login = await merchPreview(post(), env);
assert.equal(login.status, 303); assert.equal(login.headers.get('Location'), '/goods/'); privateHeaders(login);
const setCookie = login.headers.get('Set-Cookie');
assert.match(setCookie, /^__Secure-bullen_merch=v1\./);
assert.match(setCookie, /Path=\/goods; Max-Age=43200; Secure; HttpOnly; SameSite=Strict/);
assert.doesNotMatch(setCookie, /Domain=|unit-test-preview-password/);
const session = setCookie.split(';')[0];
const auth = (path, method = 'GET', value = session) => request(path, { method, headers: { Cookie: value } });
assert.equal((await merchPreview(auth('/goods'), env)).headers.get('Location'), '/goods/');
assert.equal((await merchPreview(auth('/goods?view=art'), env)).headers.get('Location'), '/goods/?view=art');
const html = await website.fetch(auth('/goods/'), env);
assert.equal(html.status, 200); assert.match(await html.text(), /Private fixture/); privateHeaders(html);
const js = await merchPreview(auth('/goods/assets/store.js'), env);
assert.equal(js.status, 200); assert.match(js.headers.get('Content-Type'), /text\/javascript/);
const image = await merchPreview(auth('/goods/images/hoodie.png', 'HEAD'), env);
assert.equal(image.status, 200); assert.equal(await image.text(), '');
assert.deepEqual(reads.at(-1), ['head', `${prefix}/images/hoodie.png`]);
const count = reads.length;
for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
  assert.equal((await merchPreview(auth('/goods/images/hoodie.png', method), env)).status, 405);
  assert.equal((await merchPreview(auth('/merch/images/hoodie.png', method), env)).status, 405);
}
for (const path of ['/goods/images//hoodie.png', '/goods/%252e%252e/site.js', '/goods/images%2fhoodie.png', '/goods/%5cindex.html', '/goods/.env', '/goods/.git/config', '/goods/README.md', '/goods/index.html%00', '/goods/images/']) {
  assert.equal((await merchPreview(auth(path), env)).status, 404, path);
}
assert.equal(reads.length, count);
assert.equal((await merchPreview(auth('/goods/missing.png'), env)).status, 404);

// Cached old forms log in directly and issue only a canonical-path cookie.
const oldFormLogin = await website.fetch(post(password, {}, '/merch/login'), env);
assert.equal(oldFormLogin.status, 303);
assert.equal(oldFormLogin.headers.get('Location'), '/goods/');
const oldFormCookie = oldFormLogin.headers.get('Set-Cookie');
assert.match(oldFormCookie, /Path=\/goods; Max-Age=43200; Secure; HttpOnly; SameSite=Strict/);
assert.doesNotMatch(oldFormCookie, /Path=\/merch/);
const migratedCookie = oldFormCookie.split(';')[0];
assert.equal((await website.fetch(auth('/goods/assets/store.js', 'GET', migratedCookie), env)).status, 200);
const redirectedOldAsset = await website.fetch(request('/merch/assets/store.js'), env);
assert.equal((await website.fetch(auth(redirectedOldAsset.headers.get('Location'), 'GET', migratedCookie), env)).status, 200);

// Tampering, replay after expiry, future dates and secret/password changes fail.
const now = Math.floor(Date.now() / 1000);
for (const value of [
  session.slice(0, -1) + (session.endsWith('a') ? 'b' : 'a'),
  `${session}; ${session}`,
  signedCookie(now - 43200, now),
  signedCookie(now + 10, now + 43210),
  signedCookie(now, now + 86400),
  signedCookie(now, now + 43200, 'different-test-signing-secret'),
  '__Secure-bullen_merch=' + 'x'.repeat(9000),
]) assert.equal((await merchPreview(auth('/goods/index.html', 'GET', value), env)).status, 401);
assert.equal((await merchPreview(auth('/goods/index.html'), { ...env, MERCH_PREVIEW_PASSWORD_SHA256: 'b'.repeat(64) })).status, 401);
assert.equal((await merchPreview(auth('/goods/index.html'), { ...env, MERCH_PREVIEW_SESSION_SECRET: 'different-long-enough-test-session-secret' })).status, 401);
assert.equal((await merchPreview(new Request('https://www.bullenciaga.com/goods/index.html', { headers: { Cookie: session } }), env)).status, 401);
assert.equal((await merchPreview(auth('/goods/index.html'), { ...env, MERCH_PREVIEW_ASSETS: { head() {}, get() { throw new Error('fixture'); } } })).status, 503);
const logout = await merchPreview(request('/goods/logout', { method: 'POST', headers: { Origin: origin, Cookie: session } }), env);
assert.equal(logout.status, 303); assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0; Secure; HttpOnly; SameSite=Strict/);
assert.equal(logout.headers.get('Location'), '/goods');
// /goods cookies are not sent to the old path, so old logout must expire them
// through the canonical Path without requiring a cookie on its own request.
const legacyLogout = await website.fetch(request('/merch/logout', { method: 'POST', headers: { Origin: origin } }), env);
assert.equal(legacyLogout.status, 303);
assert.equal(legacyLogout.headers.get('Location'), '/goods');
assert.match(legacyLogout.headers.get('Set-Cookie'), /Path=\/goods; Max-Age=0; Secure; HttpOnly; SameSite=Strict/);

// Routing and deploy configuration keep the content outside public assets/Git.
assert.equal(await merchPreview(request('/'), env), null);
const publicResponse = new Response('ordinary public page');
assert.equal(await website.fetch(request('/unchanged'), { ASSETS: { fetch() { return publicResponse; } } }), publicResponse);
for (const path of ['/goods-news', '/merchandise', '/goodsish/index.html']) {
  assert.equal(await merchPreview(request(path), env), null);
  assert.equal(await website.fetch(request(path), { ASSETS: { fetch() { return publicResponse; } } }), publicResponse);
}
for (const name of ['production', 'staging']) {
  const config = JSON.parse(readFileSync(new URL(`../wrangler.${name}.jsonc`, import.meta.url), 'utf8'));
  assert.equal(config.assets.run_worker_first, true);
  assert(config.r2_buckets.some(binding => binding.binding === 'MERCH_PREVIEW_ASSETS' && binding.bucket_name === `bullenciaga-merch-preview${name === 'staging' ? '-staging' : ''}`));
  assert(config.ratelimits.some(binding => binding.name === 'MERCH_PREVIEW_LIMIT' && binding.simple.limit === 10));
  assert.match(config.vars.MERCH_PREVIEW_PREFIX, /^collection01-v2-20261005$/);
  assert(!('MERCH_PREVIEW_PASSWORD_SHA256' in config.vars));
  assert(!('MERCH_PREVIEW_SESSION_SECRET' in config.vars));
}
assert.match(readFileSync(new URL('./release-fingerprint.mjs', import.meta.url), 'utf8'), /await read\('src\/merch-preview\.mjs'\)/, 'the gate implementation participates in the release fingerprint');
console.log('Private goods: canonical route, legacy redirects/forms, password gate, throttling, signed sessions, CSRF, guarded assets, traversal defenses and public-route isolation passed.');
