import assert from 'node:assert/strict';

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? 'https://bullenciaga.com');
assert.equal(baseUrl.protocol, 'https:', 'smoke target must use HTTPS');
assert.equal(baseUrl.pathname, '/', 'smoke target must be an origin URL');
assert.equal(baseUrl.search, '', 'smoke target must not include a query');
assert.equal(baseUrl.hash, '', 'smoke target must not include a fragment');

const includeApi = process.env.SMOKE_INCLUDE_API !== '0';
const smokePhase = process.env.SMOKE_PHASE ?? 'post-release';
assert(['preflight', 'post-release'].includes(smokePhase), 'SMOKE_PHASE must be preflight or post-release');
const maxAttempts = Number(process.env.SMOKE_MAX_ATTEMPTS ?? 8);
const initialRetryDelayMs = Number(process.env.SMOKE_RETRY_DELAY_MS ?? 2_000);
assert(Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 20, 'SMOKE_MAX_ATTEMPTS must be an integer from 1 to 20');
assert(Number.isFinite(initialRetryDelayMs) && initialRetryDelayMs >= 0 && initialRetryDelayMs <= 30_000, 'SMOKE_RETRY_DELAY_MS must be from 0 to 30000');

const retryableStatuses = new Set([404, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pageChecks = [
  ['/', /<title>BULLENCIAGA — A token with horns\./i],
  ['/stats', /<title>BULLENCIAGA — Live Dashboard/i],
  ['/chart', /<title>BULLENCIAGA — \$BULLEN chart/i],
  ['/curve', /<title>BULLENCIAGA — the curve/i],
  ['/transparency', /<title>BULLENCIAGA — moderation record/i],
  ['/refer', /<title>BULLENCIAGA — Referrals/i],
  ['/referrals', /<title>BULLENCIAGA — Weekly Payouts/i],
  ['/thedrop', /<title>BULLENCIAGA — The Drop/i],
  ['/giveaways', /<title>BULLENCIAGA — Giveaways/i],
  ['/tape', /<title>THE TAPE — Live \$BULLEN Market/i],
  ['/patchnotes', /<title>BULLENCIAGA — House Record/i],
];
const effectivePageChecks = smokePhase === 'preflight'
  ? pageChecks.filter(([path]) => !['/giveaways', '/tape', '/patchnotes'].includes(path))
  : pageChecks;

const apiChecks = [
  ['/supply', (body) => Number.isFinite(Number(body.circulatingSupply)) && typeof body.workerVersion === 'string'],
  ['/ohlcv?tf=1h', (body) => body.ok === true && Array.isArray(body.candles)],
  ['/supply/history', (body) => body.ok === true && Number(body.count) > 0 && Array.isArray(body.events)],
  ['/supply/proof', (body) => body.ok === true && Array.isArray(body.burns) && 'burnedActual' in body && 'unaccounted' in body],
  ['/volume/tape', (body) => body.ok === true && Array.isArray(body.trades) && typeof body.summary === 'object'],
];

async function fetchChecked(path) {
  const url = new URL(path, baseUrl);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    url.searchParams.set('smoke', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    let shouldRetry = true;
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': 'bullenciaga-release-smoke/1' },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.status >= 200 && response.status < 300) return { response, url };

      lastError = new Error(`${url} returned HTTP ${response.status}`);
      shouldRetry = retryableStatuses.has(response.status);
    } catch (error) {
      lastError = error;
    }

    if (!shouldRetry || attempt === maxAttempts) throw lastError;
    const delayMs = Math.min(initialRetryDelayMs * (2 ** (attempt - 1)), 10_000);
    console.warn(`smoke attempt ${attempt}/${maxAttempts} failed for ${url.pathname}: ${lastError.message}; retrying in ${delayMs}ms`);
    await sleep(delayMs);
  }

  throw lastError;
}

async function fetchRedirectChecked(path) {
  const url = new URL(path, baseUrl);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    url.searchParams.set('smoke', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': 'bullenciaga-release-smoke/1' },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.status === 301) return { response, url };
      lastError = new Error(`${url} returned HTTP ${response.status} instead of 301`);
    } catch (error) {
      lastError = error;
    }

    if (attempt === maxAttempts) throw lastError;
    const delayMs = Math.min(initialRetryDelayMs * (2 ** (attempt - 1)), 10_000);
    console.warn(`redirect smoke attempt ${attempt}/${maxAttempts} failed for ${url.pathname}: ${lastError.message}; retrying in ${delayMs}ms`);
    await sleep(delayMs);
  }

  throw lastError;
}

for (const [path, marker] of effectivePageChecks) {
  const { response, url } = await fetchChecked(path);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i, `${url} did not return HTML`);
  const body = await response.text();
  assert(marker.test(body), `${url} is missing its expected build marker`);
  console.log(`page smoke: ok ${url.pathname}`);
}

if (smokePhase === 'post-release') {
  for (const path of ['/proof', '/proof.html']) {
    const { response, url } = await fetchRedirectChecked(path);
    const location = response.headers.get('location');
    assert(location, `${url} redirect omitted its Location header`);
    const target = new URL(location, url);
    assert.equal(target.origin, baseUrl.origin, `${url} redirects away from the canonical website`);
    assert.equal(target.pathname, '/curve', `${url} does not redirect to /curve`);
    console.log(`redirect smoke: ok ${url.pathname} -> ${target.pathname}`);
  }
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
