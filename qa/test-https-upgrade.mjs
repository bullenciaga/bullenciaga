import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../src/website.mjs';

const paths = new Set(['/', '/world/', '/goods/', '/merch/login', '/platform/signup', '/platform/signups', '/not-a-real-page', '/nested/a%2Fb', '//example.net/path', '/assets/world/spotify-white.svg']);
for (const file of fs.readdirSync(new URL('../site/', import.meta.url))) {
  if (file.endsWith('.html')) paths.add('/' + file.replace(/\.html$/, ''));
}
for (const line of fs.readFileSync(new URL('../site/_redirects', import.meta.url), 'utf8').split('\n')) {
  if (line.trim() && !line.startsWith('#')) paths.add(line.trim().split(/\s+/)[0]);
}
let checked = 0;
for (const host of ['bullenciaga.com', 'www.bullenciaga.com']) {
  for (const path of paths) for (const method of ['GET', 'HEAD', 'POST']) {
    const suffix = '?ref=a%2Fb&tag=x+y&tag=z&empty=';
    const response = await worker.fetch(new Request(`http://${host}${path}${suffix}`, {
      method, ...(method === 'POST' ? {body:'test=keep'} : {}),
      headers: {'X-Forwarded-Host':'example.net', 'X-Forwarded-Proto':'https'},
    }), {ASSETS:{fetch(){throw new Error('HTTP must redirect before invoking any handler');}}});
    assert.equal(response.status, 308, `${method} ${host}${path}`);
    assert.equal(response.headers.get('location'), `https://${host}${path}${suffix}`);
    assert.equal(await response.text(), '');
    checked++;
  }
  for (const status of [200, 301, 302, 404, 500]) {
    const headers = {'Content-Type':'text/plain', 'Cache-Control':'private, no-store', 'X-Keep':'yes'};
    if ([301,302].includes(status)) headers.Location = '/curve';
    const response = await worker.fetch(new Request(`https://${host}/asset`), {ASSETS:{fetch(){return new Response('unchanged', {status, headers});}}});
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
    assert.equal(response.headers.get('Cache-Control'), headers['Cache-Control']);
    assert.equal(response.headers.get('Location'), headers.Location || null);
    assert.equal(response.headers.get('X-Keep'), 'yes');
    assert.equal(await response.text(), 'unchanged');
  }
  const protectedResponse = await worker.fetch(new Request(`https://${host}/goods/`), {});
  assert.equal(protectedResponse.status, 503, 'Missing preview config remains fail closed');
  assert.equal(protectedResponse.headers.get('Strict-Transport-Security'), 'max-age=31536000');
}
// Do not trust spoofed forwarding headers or force local/staging/unrelated hosts.
for (const url of ['http://localhost:8758/world','http://127.0.0.1:8758/world','http://bullenciaga-staging.workers.dev/world','https://other.bullenciaga.com/world','http://bullenciaga.com.example.net/world']) {
  const original = new Response('unchanged');
  const request = new Request(url, {headers:{'X-Forwarded-Host':'bullenciaga.com','X-Forwarded-Proto':'http'}});
  const response = await worker.fetch(request, {ASSETS:{fetch(value){assert.equal(value, request);return original;}}});
  assert.equal(response, original);
  assert.equal(response.headers.get('Location'), null);
  assert.equal(response.headers.get('Strict-Transport-Security'), null);
}
console.log(`HTTPS upgrade: ${checked} URL/method checks; secure headers, protected responses and unrelated origins passed`);
