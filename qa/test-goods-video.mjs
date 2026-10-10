import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import website from '../src/website.mjs';

const origin = 'https://bullenciaga.com', prefix = 'unit-test-video';
const path = '/goods/assets/videos/hero-1080-v1.mp4', key = `${prefix}/assets/videos/hero-1080-v1.mp4`;
const payload = Uint8Array.from({ length: 64 }, (_, i) => i);
const password = 'unit-test-video-password';
let reads = [], delivered = 0, race = false;
const metadata = { size: payload.length, etag: 'unit-test-video-etag' };
const env = {
  MERCH_PREVIEW_PROTECTED: '1', MERCH_PREVIEW_PREFIX: prefix,
  MERCH_PREVIEW_PASSWORD_SHA256: createHash('sha256').update(password).digest('hex'),
  MERCH_PREVIEW_SESSION_SECRET: 'unit-test-video-session-secret-do-not-deploy',
  MERCH_PREVIEW_LIMIT: { async limit() { return { success: true }; } },
  MERCH_PREVIEW_ASSETS: {
    async head(candidate) {
      reads.push(['head', candidate]);
      return candidate === key ? { ...metadata, get body() { throw Error('HEAD accessed body'); } } : null;
    },
    async get(candidate, options) {
      reads.push(['get', candidate, options]);
      if (candidate !== key) return null;
      if (race && options?.onlyIf) return { ...metadata }; // R2 conditional failure has no body.
      const range = options?.range;
      if (range) assert.deepEqual(options.onlyIf, { etagMatches: metadata.etag });
      const bytes = range ? payload.slice(range.offset, range.offset + range.length) : payload;
      const body = new ReadableStream({ pull(controller) {
        delivered += bytes.length; controller.enqueue(bytes); controller.close();
      } }, { highWaterMark: 0 });
      return {
        ...metadata, range, body,
        arrayBuffer() { throw Error('Whole-file buffering is forbidden'); },
        text() { throw Error('Whole-file buffering is forbidden'); },
        blob() { throw Error('Whole-file buffering is forbidden'); },
        // R2 metadata must never weaken route headers.
        httpMetadata: { contentType: 'text/html', cacheControl: 'public, max-age=31536000' },
      };
    },
  },
  ASSETS: { fetch() { throw Error('Video escaped private storage'); } },
};
const request = (target = path, options = {}) => new Request(origin + target, options);
const login = await website.fetch(request('/goods/login', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password }),
}), env);
assert.equal(login.status, 303);
const session = login.headers.get('Set-Cookie').split(';')[0];
const send = (method = 'GET', extra = {}, target = path, configuration = env) => website.fetch(request(target, {
  method, headers: { Cookie: session, ...extra },
}), configuration);
function security(response) {
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('Vary'), 'Cookie');
  assert.match(response.headers.get('X-Robots-Tag'), /noindex.*noarchive/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.match(response.headers.get('Content-Security-Policy'), /media-src 'self'/);
  for (const header of ['ETag', 'Last-Modified', 'Access-Control-Allow-Origin', 'Set-Cookie']) {
    assert.equal(response.headers.get(header), null, header);
  }
}
// No range metadata or private reads are available before page authentication.
for (const method of ['GET', 'HEAD']) for (const range of [undefined, 'bytes=0-1', 'bytes=999-']) {
  for (const cookie of [undefined, '__Secure-bullen_merch=forged']) {
    const response = await website.fetch(request(path, { method, headers: {
      ...(range ? { Range: range } : {}), ...(cookie ? { Cookie: cookie } : {}),
    } }), env);
    assert.equal(response.status, 401); security(response);
    assert.equal(response.headers.get('Content-Range'), null);
    assert.equal(response.headers.get('Accept-Ranges'), null);
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
}
assert.deepEqual(reads, []);

reads = []; delivered = 0;
const full = await send();
assert.equal(full.status, 200); security(full);
assert.equal(full.headers.get('Content-Type'), 'video/mp4');
assert.equal(full.headers.get('Content-Length'), String(payload.length));
assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
assert.equal(full.headers.get('Content-Range'), null);
assert.deepEqual(reads, [['get', key, undefined]]);
assert.equal(delivered, 0, 'route returns a stream without reading the body');
assert.deepEqual(new Uint8Array(await full.arrayBuffer()), payload);

// HEAD always describes the whole resource; RFC 9110 limits Range to GET.
for (const range of [undefined, 'bytes=0-1', 'bytes=999-', 'bytes=0-1,5-6', 'garbage']) {
  reads = []; delivered = 0;
  const response = await send('HEAD', range ? { Range: range } : {});
  assert.equal(response.status, 200); security(response);
  assert.equal(response.headers.get('Content-Type'), 'video/mp4');
  assert.equal(response.headers.get('Content-Length'), '64');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Range'), null);
  assert.equal(await response.text(), '');
  assert.deepEqual(reads, [['head', key]]); assert.equal(delivered, 0);
}
for (const [range, start, end] of [
  ['bytes=0-1', 0, 1], ['bytes=2-7', 2, 7], ['bytes=63-63', 63, 63],
  ['bytes=5-', 5, 63], ['bytes=-5', 59, 63], ['bytes=-64', 0, 63],
  ['bytes=0-500', 0, 63], ['bytes=-500', 0, 63], ['BYTES=0-1', 0, 1],
  ['bytes=0-999999999999999999999999999', 0, 63], ['bytes=-999999999999999999999999999', 0, 63],
]) {
  reads = []; delivered = 0;
  const response = await send('GET', { Range: range });
  assert.equal(response.status, 206, range); security(response);
  assert.equal(response.headers.get('Content-Type'), 'video/mp4');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/64`);
  assert.equal(response.headers.get('Content-Length'), String(end - start + 1));
  assert.deepEqual(reads, [['head', key], ['get', key, {
    range: { offset: start, length: end - start + 1 }, onlyIf: { etagMatches: metadata.etag },
  }]]);
  assert.equal(delivered, 0, 'partial response is not buffered');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload.slice(start, end + 1));
  assert.equal(delivered, end - start + 1, 'only the requested bytes are read');
}
for (const range of [
  'bytes=64-', 'bytes=99-100', 'bytes=8-7', 'bytes=-0', 'bytes=-', 'bytes=',
  'bytes=a-b', 'bytes=0-1-2', 'bytes=1.5-3', 'bytes=+1-3', 'bytes=999999999999999999999999-',
]) {
  reads = []; delivered = 0;
  const response = await send('GET', { Range: range });
  assert.equal(response.status, 416, range); security(response);
  assert.equal(response.headers.get('Content-Range'), 'bytes */64');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.deepEqual(reads, [['head', key]]); assert.equal(delivered, 0);
}
// Unsupported multi-range/unit requests safely receive a full representation.
for (const headers of [
  { Range: 'bytes=0-1,5-6' }, { Range: 'items=0-1' },
  { Range: 'bytes=0-1', 'If-Range': '"unpublished-validator"' },
]) {
  reads = []; delivered = 0;
  const response = await send('GET', headers);
  assert.equal(response.status, 200); security(response);
  assert.equal(response.headers.get('Content-Range'), null);
  assert.equal(response.headers.get('Content-Length'), '64');
  assert.equal(delivered, 0);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload);
  assert(reads.some(([method, , options]) => method === 'get' && options === undefined));
}
// Strict directory/file allowlist remains ahead of all R2 reads.
reads = [];
for (const target of [
  '/goods/hero.mp4', '/goods/images/hero.mp4', '/goods/assets/hero.mp4',
  '/goods/assets/videos/nested/hero.mp4', '/goods/assets/videos/hero.mp4.json',
  '/goods/assets/videos/manifest.json', '/goods/assets/videos/.secret.mp4',
  '/goods/assets/videos//hero.mp4', '/goods/assets/videos%2fhero.mp4',
  '/goods/assets/videos/%252e%252e/hero.mp4', '/goods/assets/videos/hero.webm',
]) assert.equal((await send('GET', { Range: 'bytes=0-1' }, target)).status, 404, target);
assert.deepEqual(reads, []);
for (const method of ['GET', 'HEAD']) {
  assert.equal((await send(method, {}, '/goods/assets/videos/missing.mp4')).status, 404);
}
for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
  assert.equal((await send(method)).status, 405);
}
race = true;
const changed = await send('GET', { Range: 'bytes=0-1' });
assert.equal(changed.status, 503); assert.doesNotMatch(await changed.text(), /etag|validator|Video changed/);
race = false;
const empty = { ...env, MERCH_PREVIEW_ASSETS: {
  head: async () => ({ size: 0, etag: metadata.etag }), get() { throw Error('Empty range read body'); },
} };
const emptyRange = await send('GET', { Range: 'bytes=0-1' }, path, empty);
assert.equal(emptyRange.status, 416); assert.equal(emptyRange.headers.get('Content-Range'), 'bytes */0');
// Future gate deactivation preserves the route's existing public no-store policy.
const publicVideo = await send('GET', {}, path, { ...env, MERCH_PREVIEW_PROTECTED: '0' });
assert.equal(publicVideo.status, 200);
assert.equal(publicVideo.headers.get('Cache-Control'), 'no-store, max-age=0');
assert.equal(publicVideo.headers.get('Vary'), null); assert.equal(publicVideo.headers.get('X-Robots-Tag'), null);
await publicVideo.body.cancel();
console.log('Goods video: protected access, strict MP4 paths, streamed GET/HEAD, byte ranges, invalid ranges, conditional-read race and no-store policy passed.');
