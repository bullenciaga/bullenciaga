import assert from 'node:assert/strict';
import fs from 'node:fs';
const paths = new Set(['/', '/buy', '/chart', '/patchnotes', '/buy?ref=route-check&tag=a%2Fb&tag=x+y', '/route-check/not-a-page']);
for (const line of fs.readFileSync(new URL('../site/_redirects', import.meta.url), 'utf8').split('\n')) {
  if (line.trim() && !line.startsWith('#')) paths.add(line.trim().split(/\s+/)[0]);
}
const results = [];
for (const host of ['bullen.app', 'www.bullen.app']) for (const path of paths) {
  let result;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`https://${host}${path}`, { method:'HEAD', redirect:'manual', signal:AbortSignal.timeout(15000) });
      const location = response.headers.get('location');
      assert([301,308].includes(response.status));
      assert.equal(location, `https://bullenciaga.com${path}`);
      result = {host, path, status:response.status, location};
      break;
    } catch (error) {
      if (attempt === 3) throw new Error(`Alias check failed: ${host}${path}`, {cause:error});
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  results.push(result);
}
console.log(JSON.stringify({ok:true, results}, null, 2));

// Catch plain-HTTP page regressions that an HTTPS-only release smoke misses.
const securePaths = ['/', '/world', '/world/', '/buy', '/platform', '/goods/', '/proof', '/world?ref=a%2Fb&tag=x+y&tag=z&empty='];
const upgrades = [];
for (const host of ['bullenciaga.com', 'www.bullenciaga.com']) for (const path of securePaths) {
  let result;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`http://${host}${path}`, {method:'HEAD', redirect:'manual', signal:AbortSignal.timeout(15000)});
      assert([301,308].includes(response.status));
      const location = response.headers.get('location');
      assert.equal(location, `https://${host}${path}`);
      const secure = await fetch(location, {method:'HEAD', redirect:'manual', signal:AbortSignal.timeout(15000)});
      assert.match(secure.headers.get('strict-transport-security') || '', /max-age=31536000/);
      result = {host, path, status:response.status, location, hsts:true};
      break;
    } catch (error) {
      if (attempt === 3) throw new Error(`HTTPS upgrade failed: ${host}${path}`, {cause:error});
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  upgrades.push(result);
}
console.log(JSON.stringify({ok:true, upgrades}, null, 2));
