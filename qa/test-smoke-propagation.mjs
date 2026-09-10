import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Exercise the real smoke executable with deterministic responses, never a live
// endpoint. Both recovered propagation and permanent failure must be covered.
const fixture = `
  import fs from 'node:fs';
  import assert from 'node:assert/strict';
  let recordCalls = 0, cssCalls = 0, buyCalls = 0;
  const mode = process.env.PROPAGATION_FIXTURE;
  globalThis.fetch = async input => {
    const pathname = new URL(input).pathname;
    if (['/proof','/proof.html'].includes(pathname)) return new Response(null,{status:301,headers:{location:'/curve'}});
    if (pathname === '/buy') {
      buyCalls++;
      if(mode === 'redirect-permanent' || buyCalls === 1) return new Response(null,{status:302,headers:{location:'https://pump.fun/coin/BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN'}});
    }
    if (pathname === '/patchnotes') {
      recordCalls++;
      if (mode === 'permanent' || recordCalls === 1) return new Response('<title>BULLENCIAGA — House Record</title>Public edition 001',{headers:{'content-type':'text/html'}});
    }
    if (pathname === '/bullen-ui.css') {
      cssCalls++;
      if (cssCalls === 1) return new Response('/* previous styles */',{headers:{'content-type':'text/css'}});
    }
    const file = pathname === '/' ? 'index.html' : pathname.slice(1) + (pathname.endsWith('.css') ? '' : '.html');
    return new Response(fs.readFileSync(new URL('../site/' + file, ${JSON.stringify(import.meta.url)})),{headers:{'content-type':file.endsWith('.css')?'text/css':'text/html'}});
  };
  let failure;
  try { await import(${JSON.stringify(new URL('./smoke-live.mjs', import.meta.url).href)}); } catch(error) { failure = error; }
  if(mode === 'redirect-permanent') {
    assert(failure, 'Persistent redirect must fail');
    assert.match(failure.message, /HTTP 302/);
    assert.equal(buyCalls, 3);
  } else if(mode === 'permanent') {
    assert(failure, 'Persistent stale HTML must fail and leave rollback available');
    assert.match(failure.message, /edition 004 has not reached/);
    assert.equal(recordCalls, 3, 'Failure must be bounded by max attempts');
  } else {
    assert.equal(failure, undefined, failure?.message);
    assert.equal(buyCalls, 2, 'Previous buy redirect must be retried');
    assert.equal(recordCalls, 2, 'Stale HTTP 200 HTML must be retried');
    assert.equal(cssCalls, 2, 'Stale HTTP 200 CSS must be retried');
  }
`;
for (const mode of ['recover', 'permanent', 'redirect-permanent']) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', fixture], {
    encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, PROPAGATION_FIXTURE: mode, SMOKE_BASE_URL: 'https://fixture.invalid',
      SMOKE_INCLUDE_API: '0', SMOKE_PHASE: 'post-release', SMOKE_MAX_ATTEMPTS: '3', SMOKE_RETRY_DELAY_MS: '0' },
  });
  assert.equal(result.status, 0, `${mode}: ${result.stdout}\n${result.stderr}`);
}
console.log('release propagation: stale HTML/CSS recover; persistent stale content fails after bounded retries');

// The iPhone comparison must retry both UAs together when a promotion briefly
// reaches one request before the other. Exercise the real smoke executable,
// including all original content/font equality assertions and asset checks.
const iphoneFixture = `
  import fs from 'node:fs';
  import assert from 'node:assert/strict';
  const mode = process.env.PROPAGATION_FIXTURE;
  const site = new URL('../site/', ${JSON.stringify(import.meta.url)});
  const worker = fs.readFileSync(new URL('../src/website.mjs', ${JSON.stringify(import.meta.url)}), 'utf8');
  const injection = worker.split('const iphoneNavigation = ' + String.fromCharCode(96))[1].split(String.fromCharCode(96) + ';')[0];
  const requests = [];
  let safariCalls = 0, chromeCalls = 0, assetSafariCalls = 0, assetChromeCalls = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const ua = options.headers?.['User-Agent'] || '';
    const chrome = ua.includes('iPhone') && ua.includes('CriOS/');
    const safari = ua.includes('iPhone') && ua.includes('Version/');
    assert(url.searchParams.get('smoke'), 'Every attempt must bypass stale request caches');
    if (options.method === 'HEAD') return new Response(null, {headers:{'Cache-Control':'private, no-store'}});
    const htmlPage = !url.pathname.split('/').pop().includes('.');
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1) + (htmlPage ? '.html' : '');
    let body = fs.readFileSync(new URL(file, site), 'utf8');
    const headers = {'Content-Type':htmlPage ? 'text/html' : 'text/plain', 'Cache-Control':'public, max-age=300', 'ETag':'fixture'};
    if (htmlPage) headers.Vary = 'User-Agent';
    if (htmlPage && chrome) {
      body = body.replace('viewport-fit=cover','viewport-fit=auto').replace('<style data-bullen-boot>', injection + '<style data-bullen-boot>');
      headers['Cache-Control'] = 'private, no-store';
      delete headers.ETag;
    }
    if (url.pathname === '/buy' && (safari || chrome)) {
      requests.push({url:url.href, chrome});
      if (safari) safariCalls++;
      if (chrome) {
        chromeCalls++;
        if (mode === 'old-permanent' || (mode === 'recover' && chromeCalls === 1)) {
          body = body.replace('--bullen-scroll-surface: body;', '@view-transition { navigation: auto; }');
        } else if (mode === 'font-permanent') {
          body = body.replace('<head>', '<head><style>body {font-family: Arial !important}</style>');
        } else if (mode === 'content-permanent') {
          body = body.replace('<head>', '<head><title>Wrong release content</title>');
        }
      }
    }
    if (url.pathname === '/bullen-ui.js') {
      if (safari) assetSafariCalls++;
      if (chrome && ++assetChromeCalls === 1) body = '/* previous shared script */';
    }
    return new Response(body, {headers});
  };
  let failure;
  try { await import(${JSON.stringify(new URL('./smoke-iphone-viewport.mjs', import.meta.url).href)}); } catch(error) { failure = error; }
  const attempts = mode === 'recover' ? 2 : 3;
  assert.equal(safariCalls, attempts, 'Retry must fetch Safari again, not reuse the prior response');
  assert.equal(chromeCalls, attempts, 'Retry must fetch Chrome again');
  assert.equal(requests.length, attempts * 2);
  const tokens = new Set();
  for (let i = 0; i < requests.length; i += 2) {
    assert.equal(requests[i].chrome, false);
    assert.equal(requests[i + 1].chrome, true);
    assert.equal(requests[i].url, requests[i + 1].url, 'Both UAs must compare the same cache-busting URL');
    tokens.add(requests[i].url);
  }
  assert.equal(tokens.size, attempts, 'Each retry must use a new cache-busting URL');
  if (mode === 'recover') {
    assert.equal(failure, undefined, failure?.message);
    assert.equal(assetSafariCalls, 2, 'Asset comparison must retry the full pair');
    assert.equal(assetChromeCalls, 2);
  } else {
    assert(failure, 'Persistent incorrect response must fail after the bounded attempts');
    assert.match(failure.message, mode === 'old-permanent' ? /no snapshot transition/ : /only native viewport, scroll CSS and scroll-state helper may differ/);
  }
`;
for (const mode of ['recover', 'old-permanent', 'font-permanent', 'content-permanent']) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', iphoneFixture], {
    encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, PROPAGATION_FIXTURE: mode, SMOKE_BASE_URL: 'https://fixture.invalid',
      SMOKE_MAX_ATTEMPTS: '3', SMOKE_RETRY_DELAY_MS: '0' },
  });
  assert.equal(result.status, 0, `iPhone ${mode}: ${result.stdout}\n${result.stderr}`);
}
console.log('iPhone propagation: stale navigation/assets recover; persistent stale style, wrong fonts or content fail within the bound');
