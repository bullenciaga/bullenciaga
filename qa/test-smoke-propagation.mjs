import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Exercise the real smoke executable with deterministic responses, never a live
// endpoint. Both recovered propagation and permanent failure must be covered.
const fixture = `
  import fs from 'node:fs';
  import assert from 'node:assert/strict';
  let recordCalls = 0, cssCalls = 0;
  const mode = process.env.PROPAGATION_FIXTURE;
  globalThis.fetch = async input => {
    const pathname = new URL(input).pathname;
    if (['/proof','/proof.html'].includes(pathname)) return new Response(null,{status:301,headers:{location:'/curve'}});
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
  if(mode === 'permanent') {
    assert(failure, 'Persistent stale HTML must fail and leave rollback available');
    assert.match(failure.message, /edition 002 has not reached/);
    assert.equal(recordCalls, 3, 'Failure must be bounded by max attempts');
  } else {
    assert.equal(failure, undefined, failure?.message);
    assert.equal(recordCalls, 2, 'Stale HTTP 200 HTML must be retried');
    assert.equal(cssCalls, 2, 'Stale HTTP 200 CSS must be retried');
  }
`;
for (const mode of ['recover', 'permanent']) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', fixture], {
    encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, PROPAGATION_FIXTURE: mode, SMOKE_BASE_URL: 'https://fixture.invalid',
      SMOKE_INCLUDE_API: '0', SMOKE_PHASE: 'post-release', SMOKE_MAX_ATTEMPTS: '3', SMOKE_RETRY_DELAY_MS: '0' },
  });
  assert.equal(result.status, 0, `${mode}: ${result.stdout}\n${result.stderr}`);
}
console.log('release propagation: stale HTML/CSS recover; persistent stale content fails after bounded retries');
