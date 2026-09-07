import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../src/website.mjs';

const site = new URL('../site/', import.meta.url);
const paths = new Set(['/', '/buy', '/chart', '/not-a-real-page', '/nested/a%2Fb', '//example.net/path']);
for (const file of fs.readdirSync(site)) if (file.endsWith('.html')) paths.add('/' + file.replace(/\.html$/, ''));
for (const line of fs.readFileSync(new URL('_redirects', site), 'utf8').split('\n')) {
  if (line.trim() && !line.startsWith('#')) paths.add(line.trim().split(/\s+/)[0]);
}
let checked = 0;
for (const host of ['bullen.app', 'www.bullen.app']) for (const protocol of ['http:', 'https:']) {
  for (const path of paths) for (const suffix of ['', '?ref=a%2Fb&tag=x+y&tag=z&empty=']) {
    const request = new Request(`${protocol}//${host}${path}${suffix}`);
    const response = await worker.fetch(request, { ASSETS: { fetch() { throw new Error('Alias reached assets'); } } });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), `https://bullenciaga.com${path}${suffix}`);
    assert.equal(await response.text(), '');
    checked++;
  }
}
// A supplied forwarded host or a similarly named domain must not redirect.
for (const host of ['bullenciaga.com', 'www.bullenciaga.com', 'bullenciaga-staging.workers.dev', 'bullen.app.example.com']) {
  const request = new Request(`https://${host}/buy?ref=keep`, { headers: { 'X-Forwarded-Host': 'bullen.app' } });
  const response = new Response('asset response', { status: 200 });
  assert.equal(await worker.fetch(request, { ASSETS: { fetch(value) { assert.equal(value, request); return response; } } }), response);
}
const post = await worker.fetch(new Request('https://bullen.app/any-path', { method: 'POST', body: 'test' }), {});
assert.equal(post.status, 308, 'method-preserving redirect');
console.log(`domain aliases: ${checked} path/query checks and canonical passthrough passed`);
