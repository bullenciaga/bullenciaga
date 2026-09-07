// Exercise the real Worker response, not a mocked HTMLRewriter or desktop UA layout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = new URL(process.env.SMOKE_BASE_URL || 'https://bullenciaga.com');
assert(base.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(base.hostname));
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ';
const safari = iphone + 'Version/26.0 Mobile/15E148 Safari/604.1';
const chrome = iphone + 'CriOS/140.0.7339.39 Mobile/15E148 Safari/604.1';
async function get(path, ua, extra = {}) {
  const response = await fetch(new URL(path, base), {redirect:'manual', headers:{'User-Agent':ua, ...extra}, signal:AbortSignal.timeout(20_000)});
  assert.equal(response.status, 200, path);
  return {response, html:await response.text()};
}
const pages = fs.readdirSync(new URL('../site/', import.meta.url)).filter(name => name.endsWith('.html') && fs.readFileSync(new URL('../site/' + name, import.meta.url), 'utf8').includes('data-bullen-shell-source'));
for (const name of pages) {
  const path = name === 'index.html' ? '/' : '/' + name.replace(/\.html$/, '');
  const a = await get(path, safari);
  const b = await get(path, chrome, {'If-None-Match':a.response.headers.get('ETag') || 'old', 'If-Modified-Since':'Mon, 07 Sep 2026 00:00:00 GMT'});
  assert(/<meta name="viewport"/.test(a.html));
  assert(!a.html.includes('data-bullen-navigation'), 'Safari must keep its original handoff');
  const navigation = b.html.match(/<style data-bullen-navigation>[\s\S]*?<\/style>/g) || [];
  assert.equal(navigation.length, 1, path + ': one early native scroll style');
  assert(!navigation[0].includes('@view-transition'), 'no snapshot transition for the native scroll surface');
  assert(navigation[0].includes('--bullen-scroll-surface: body;'));
  assert(navigation[0].includes('overflow: hidden;'));
  const scrollState = b.html.match(/<script data-bullen-scroll-state>[\s\S]*?<\/script>/g) || [];
  assert.equal(scrollState.length, 1, path + ': one scoped history helper');
  assert(navigation[0].includes('backdrop-filter: none !important;'));
  assert.equal(b.html.replace(navigation[0] + '\n' + scrollState[0], ''), a.html.replace('viewport-fit=cover', 'viewport-fit=auto'), path + ': only native viewport, scroll CSS and scroll-state helper may differ');
  assert.match(b.response.headers.get('Cache-Control'), /no-store/);
  assert.equal(b.response.headers.get('ETag'), null);
  assert.equal(b.response.headers.get('Last-Modified'), null);
  assert.match(a.response.headers.get('Vary'), /User-Agent/i);
  assert.match(b.response.headers.get('Vary'), /User-Agent/i);
  console.log('PASS',path,'native scroll surface; fonts, icons and page content unchanged');
}
for (const ua of ['Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36', 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1']) {
  const {html} = await get('/buy',ua);assert(html.includes('viewport-fit=cover'),'non-iPhone Chrome must be unchanged');assert(!html.includes('data-bullen-navigation'));
}
for (const path of ['/bullen-ui.css','/bullen-ui.js','/fonts/house-fonts-full.css']) {
  const [a,b] = await Promise.all([get(path,safari),get(path,chrome)]);
  assert.equal(a.html,b.html);assert.equal(a.response.headers.get('Cache-Control'),b.response.headers.get('Cache-Control'));
  assert.equal(a.response.headers.get('ETag'),b.response.headers.get('ETag'));
}
const head=await fetch(new URL('/buy',base),{method:'HEAD',headers:{'User-Agent':chrome},signal:AbortSignal.timeout(20_000)});
assert.equal(head.status,200);assert.equal(await head.text(),'');assert.match(head.headers.get('Cache-Control'),/no-store/);
console.log(JSON.stringify({ok:true,pages:pages.length,base:base.origin,nativeIPhoneVerified:false}));
