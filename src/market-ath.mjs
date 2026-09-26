const MINT = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
const UPSTREAM = 'https://api.coingecko.com/api/v3/coins/bullen?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false';
const SOURCE = 'https://www.coingecko.com/en/coins/bullen';
const MAX_BYTES = 262144;

export function normalizeAth(data, now = Date.now()) {
  const market = data?.market_data;
  const price = market?.ath?.usd;
  const at = Date.parse(market?.ath_date?.usd);
  const updated = Date.parse(market?.last_updated);
  if (data?.id !== 'bullen' || data?.platforms?.solana !== MINT ||
      typeof price !== 'number' || !Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(at) || at <= 0 || at > now + 120000 ||
      !Number.isFinite(updated) || updated > now + 120000 || updated < now - 3600000 || at > updated + 120000) {
    throw new Error('Invalid ATH record');
  }
  return { ok: true, source: 'CoinGecko', sourceUrl: SOURCE, priceUsd: price,
    athAt: new Date(at).toISOString(), sourceUpdatedAt: new Date(updated).toISOString(),
    fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 600000).toISOString() };
}

async function readBounded(response) {
  if (Number(response.headers.get('Content-Length')) > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error('Oversize response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response');
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Oversize response'); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export async function marketAth(request, ctx, { fetcher = fetch, cache = globalThis.caches?.default, now = Date.now } = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  // One key per origin; arbitrary query strings cannot bypass the edge cache.
  const key = new Request(new URL('/market/ath', request.url).href);
  let record;
  try {
    const hit = await cache?.match(key);
    if (hit) {
      const saved = await hit.json();
      if (saved.cacheUntil > now()) record = saved.record;
    }
  } catch { /* A cache outage must not prevent a bounded origin read. */ }
  if (!record) {
    try {
      const upstream = await fetcher(UPSTREAM, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!upstream.ok) { await upstream.body?.cancel(); throw new Error('Upstream unavailable'); }
      record = normalizeAth(await readBounded(upstream), now());
    } catch {
      record = { ok: false, source: 'CoinGecko', sourceUrl: SOURCE, error: 'ATH temporarily unavailable' };
    }
    const ttl = record.ok ? 300 : 30;
    if (cache) {
      const write = cache.put(key, new Response(JSON.stringify({ record, cacheUntil: now() + ttl * 1000 }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
      })).catch(() => {});
      if (ctx) ctx.waitUntil(write); else await write;
    }
  }
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(record), { status: record.ok ? 200 : 503, headers });
}
