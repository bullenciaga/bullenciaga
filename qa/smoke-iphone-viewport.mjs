// Exercise the real Worker response, not a mocked HTMLRewriter or desktop UA layout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = new URL(process.env.SMOKE_BASE_URL || 'https://bullenciaga.com');
assert(base.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(base.hostname));
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ';
const safari = iphone + 'Version/26.0 Mobile/15E148 Safari/604.1';
const chrome = iphone + 'CriOS/140.0.7339.39 Mobile/15E148 Safari/604.1';
async function get(path, ua, extra = {}, waitForNativeRender = false) {
  // A version can be available before every edge serves it. Retry only a
  // missing release marker; persistent absence and all content checks fail.
  for(let attempt=0; attempt<9; attempt++) {
    const response = await fetch(new URL(path, base), {redirect:'manual', headers:{'User-Agent':ua, ...extra}, signal:AbortSignal.timeout(20_000)});
    assert.equal(response.status, 200, path);
    const html = await response.text();
    if(waitForNativeRender && !html.includes('<style data-bullen-native-render>') && attempt<8) {
      console.warn(path + ': waiting for native rendering response propagation');
      await new Promise(resolve => setTimeout(resolve,5000));
      continue;
    }
    return {response, html};
  }
}
const pages = fs.readdirSync(new URL('../site/', import.meta.url)).filter(name => name.endsWith('.html') && fs.readFileSync(new URL('../site/' + name, import.meta.url), 'utf8').includes('data-bullen-shell-source'));
for (const name of pages) {
  const path = name === 'index.html' ? '/' : '/' + name.replace(/\.html$/, '');
  const a = await get(path, safari);
  const b = await get(path, chrome, {'If-None-Match':a.response.headers.get('ETag') || 'old', 'If-Modified-Since':'Mon, 07 Sep 2026 00:00:00 GMT'}, true);
  assert(/<meta name="viewport"/.test(a.html));
  assert(!a.html.includes('data-bullen-native-render'), 'Safari must retain original typography');
  const rendering = b.html.match(/<style data-bullen-native-render>[\s\S]*?<\/style>/g) || [];
  assert.equal(rendering.length, 1, path + ': one initial native rendering style');
  assert(rendering[0].includes('font-family: Arial, sans-serif !important;'));
  assert(rendering[0].includes('backdrop-filter: none !important;'));
  assert(!b.html.includes('@view-transition'), 'No document snapshot or header animation');
  assert(!/<link\b[^>]*data-bullen-fonts/.test(b.html), 'No House web-font stylesheet');
  assert(!/<link\b[^>]*as="font"/.test(b.html), 'No web-font preloads');
  const originalWithoutFonts = a.html.replace('viewport-fit=cover', 'viewport-fit=auto')
    .replace(/<link\b[^>]*(?:data-bullen-fonts|as="font")[^>]*>/g, '');
  assert.equal(b.html.replace(rendering[0], '').replace(' data-bullen-native-fonts=""', ''), originalWithoutFonts,
    path + ': scripts, controls, content and header HTML stay unchanged');
  assert.match(b.response.headers.get('Cache-Control'), /no-store/);
  assert.equal(b.response.headers.get('ETag'), null);
  assert.equal(b.response.headers.get('Last-Modified'), null);
  assert.match(a.response.headers.get('Vary'), /User-Agent/i);
  assert.match(b.response.headers.get('Vary'), /User-Agent/i);
  console.log('PASS',path,'initial native typography; scripts and page content unchanged');
}
for (const ua of ['Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36', 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1']) {
  const {html} = await get('/buy',ua);assert(html.includes('viewport-fit=cover'),'non-iPhone Chrome must be unchanged');assert(!html.includes('data-bullen-native-render'));
}
for (const path of ['/bullen-ui.css','/bullen-ui.js','/fonts/house-fonts-full.css']) {
  const [a,b] = await Promise.all([get(path,safari),get(path,chrome)]);
  assert.equal(a.html,b.html);assert.equal(a.response.headers.get('Cache-Control'),b.response.headers.get('Cache-Control'));
  assert.equal(a.response.headers.get('ETag'),b.response.headers.get('ETag'));
}
const head=await fetch(new URL('/buy',base),{method:'HEAD',headers:{'User-Agent':chrome},signal:AbortSignal.timeout(20_000)});
assert.equal(head.status,200);assert.equal(await head.text(),'');assert.match(head.headers.get('Cache-Control'),/no-store/);
console.log(JSON.stringify({ok:true,pages:pages.length,base:base.origin,nativeIPhoneVerified:false}));
