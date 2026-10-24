import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../src/website.mjs';

const neverAssets = {ASSETS: {fetch() {throw new Error('Redirect/API unexpectedly reached static assets');}}};
for (const host of ['bullenciaga.com', 'www.bullenciaga.com', 'bullenciaga-staging.workers.dev']) {
  for (const path of ['/access', '/access/', '/access.html', '/platform', '/platform/', '/platform.html']) {
    for (const method of ['GET', 'HEAD']) {
      const suffix = '?ref=a%2Fb&contact=private%40example.com&redirect=https%3A%2F%2Fevil.example';
      const result = await worker.fetch(new Request(`https://${host}${path}${suffix}`, {method}), neverAssets);
      assert.equal(result.status, 308);
      assert.equal(result.headers.get('location'), 'https://ondisplay.app/');
    }
  }
}
for (const path of ['/platform.js', '/platform.css', '/assets/platform/monolith-poster.jpg', '/platform/unknown']) {
  const request = new Request(`https://bullenciaga.com${path}`);
  const result = await worker.fetch(request, {ASSETS: {fetch(value) {
    assert.equal(value, request);
    return new Response('original asset');
  }}});
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('location'), null);
  assert.equal(await result.text(), 'original asset');
}
for (const path of ['/access', '/platform']) {
  const result = await worker.fetch(new Request('https://bullenciaga.com'+path, {method:'POST',body:'private contact'}), neverAssets);
  assert.equal(result.status,405);
  assert.equal(result.headers.get('location'),null,'POST bodies must never be redirected to the app');
}
// An old page left open must still reach the same form and protected admin APIs.
assert.equal((await worker.fetch(new Request('https://bullenciaga.com/platform/signup'), neverAssets)).status, 405);
assert.equal((await worker.fetch(new Request('https://bullenciaga.com/platform/signup', {
  method: 'POST', headers: {Origin: 'https://wrong.example', 'Content-Type': 'application/json'}, body: '{}'
}), neverAssets)).status, 403);
assert.equal((await worker.fetch(new Request('https://bullenciaga.com/platform/signups'), neverAssets)).status, 401);
const html = fs.readFileSync(new URL('../site/access.html', import.meta.url), 'utf8');
assert(html.includes('rel="canonical" href="https://bullenciaga.com/access"'));
assert(html.includes('property="og:url" content="https://bullenciaga.com/access"'));
assert.match(html, /bullen-header-platform" href="https:\/\/ondisplay\.app\/"/);
assert(!fs.existsSync(new URL('../site/platform.html', import.meta.url)), 'Old page cannot compete with the canonical document');
console.log('App destination: legacy GET/HEAD documents open the fixed app URL without query leakage; POST bodies, assets, signup and private APIs stay local.');
