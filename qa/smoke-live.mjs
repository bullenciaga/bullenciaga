import assert from 'node:assert/strict';

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? 'https://bullenciaga.com');
assert.equal(baseUrl.protocol, 'https:', 'smoke target must use HTTPS');
assert.equal(baseUrl.pathname, '/', 'smoke target must be an origin URL');
assert.equal(baseUrl.search, '', 'smoke target must not include a query');
assert.equal(baseUrl.hash, '', 'smoke target must not include a fragment');

const includeApi = process.env.SMOKE_INCLUDE_API !== '0';
const pageChecks = [
  ['/', /<title>BULLENCIAGA — A token with horns\./i],
  ['/stats', /<title>BULLENCIAGA — Live Dashboard/i],
  ['/chart', /<title>BULLENCIAGA — \$BULLEN chart/i],
  ['/curve', /<title>BULLENCIAGA — the curve/i],
  ['/proof', /<title>BULLENCIAGA — proof/i],
  ['/transparency', /<title>BULLENCIAGA — moderation record/i],
  ['/refer', /<title>BULLENCIAGA — Referrals/i],
  ['/referrals', /<title>BULLENCIAGA — Weekly Payouts/i],
  ['/thedrop', /<title>BULLENCIAGA — The Drop/i],
];

const apiChecks = [
  ['/supply', (body) => Number.isFinite(Number(body.circulatingSupply)) && typeof body.workerVersion === 'string'],
  ['/ohlcv?tf=1h', (body) => body.ok === true && Array.isArray(body.candles)],
  ['/supply/history', (body) => body.ok === true && Number(body.count) > 0 && Array.isArray(body.events)],
  ['/supply/proof', (body) => body.ok === true && Array.isArray(body.burns) && 'burnedActual' in body && 'unaccounted' in body],
];

async function fetchChecked(path) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('smoke', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const response = await fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'bullenciaga-release-smoke/1' },
    signal: AbortSignal.timeout(45_000),
  });
  assert(response.status >= 200 && response.status < 300, `${url} returned HTTP ${response.status}`);
  return { response, url };
}

for (const [path, marker] of pageChecks) {
  const { response, url } = await fetchChecked(path);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i, `${url} did not return HTML`);
  const body = await response.text();
  assert(marker.test(body), `${url} is missing its expected build marker`);
  console.log(`page smoke: ok ${url.pathname}`);
}

if (includeApi) {
  for (const [path, contract] of apiChecks) {
    const { response, url } = await fetchChecked(path);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/i, `${url} did not return JSON`);
    const body = await response.json();
    assert(contract(body), `${url} failed its response contract: ${JSON.stringify(body).slice(0, 500)}`);
    console.log(`api smoke: ok ${url.pathname}`);
  }
}
