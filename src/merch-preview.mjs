import { createGoodsHandler } from './goods-fourthwall.mjs';
import goodsMappings from './goods-mappings.mjs';
import { createGoodsRuntime } from './goods-runtime.mjs';

// Public Goods assets are selected from a private R2 bucket; the bucket itself
// stays private. Wallet benefits retain their separate signed-session checks.
const SESSION_COOKIE = '__Secure-bullen_merch';
const PREVIEW_PATH = '/goods';
const LEGACY_PATH = '/merch';
const encoder = new TextEncoder();
const mediaTypes = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2',
};

function headers(extra = {}) {
  return new Headers({
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache', Expires: '0', Vary: 'Cookie',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    // Native form POSTs need a same-origin Origin header for the CSRF check.
    // no-referrer would make browsers send Origin: null even to this origin.
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://gateway.irys.xyz https://arweave.net https://bullenciaga.com https://www.bullenciaga.com https://bullensaga.com https://imgproxy.fourthwall.dev https://imgproxy.fourthwall.com https://cdn.fourthwall.com; font-src 'self'; connect-src 'self'; media-src 'self'",
    ...extra,
  });
}

function reply(text, status = 200, extra = {}, head = false) {
  return new Response(head ? null : text, { status, headers: headers({ 'Content-Type': 'text/plain; charset=utf-8', ...extra }) });
}

function configReady(env) {
  return /^[a-z0-9][a-z0-9_-]{0,95}$/i.test(env.MERCH_PREVIEW_PREFIX || '')
    && typeof env.MERCH_PREVIEW_ASSETS?.get === 'function'
    && typeof env.MERCH_PREVIEW_ASSETS?.head === 'function'
    && typeof env.MERCH_PREVIEW_LIMIT?.limit === 'function';
}

function hex(bytes) { return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join(''); }
async function hash(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }

function assetName(pathname) {
  if (pathname === PREVIEW_PATH || pathname === `${PREVIEW_PATH}/`) return 'index.html';
  const relative = pathname.slice(PREVIEW_PATH.length + 1);
  // No encoded separators, dot segments, hidden files or double decoding.
  if (relative.length > 512 || !relative.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))) return null;
  const extension = relative.split('.').pop().toLowerCase();
  // Only storefront entry/modules and visual assets are public. Internal JSON
  // manifests, alternate HTML and rollback/review files may share this prefix.
  const root = relative === 'index.html'
    || /^storefront(?:-v[0-9]+)?\.(?:js|css)$/.test(relative)
    || /^goods-(?:commerce|benefits|benefits-ui|preview)(?:-v[0-9]+)?\.mjs$/.test(relative);
  const visual = /^(?:assets|images)\//.test(relative)
    && /^(?:png|jpg|jpeg|webp|avif|svg|ico|woff|woff2)$/.test(extension);
  return mediaTypes[extension] && (root || visual) ? relative : null;
}

export async function merchPreview(request, env, ctx) {
  const url = new URL(request.url), head = request.method === 'HEAD';
  const legacy = url.pathname === LEGACY_PATH || url.pathname.startsWith(`${LEGACY_PATH}/`);
  if (!legacy && url.pathname !== PREVIEW_PATH && !url.pathname.startsWith(`${PREVIEW_PATH}/`)) return null;
  const pathname = legacy ? PREVIEW_PATH + url.pathname.slice(LEGACY_PATH.length) : url.pathname;
  try {
    // Provider callbacks do not have a wallet session. This exact route
    // authenticates raw bytes with Fourthwall HMAC + shop ID before accepting data.
    if (!legacy && pathname === `${PREVIEW_PATH}/api/webhook`) {
      if (url.protocol !== 'https:') return reply('Webhook unavailable.', 503, {}, head);
      const runtime = createGoodsRuntime(env);
      return runtime ? await runtime.handler(request, ctx) : reply('Webhook unavailable.', 503, {}, head);
    }
    if (url.protocol !== 'https:' || !configReady(env)) return reply('The collection is temporarily unavailable.', 503, {}, head);
    if (legacy && ['GET', 'HEAD'].includes(request.method)) {
      // Keep old links local; the canonical Goods route serves public content.
      return reply('', 308, { Location: pathname + url.search }, head);
    }
    // Retire old preview forms safely. These routes only expire the obsolete
    // page-password cookie; the independent wallet session is never changed.
    if (pathname === `${PREVIEW_PATH}/login` || pathname === `${PREVIEW_PATH}/logout`) {
      if (!['GET', 'HEAD', 'POST'].includes(request.method)) return reply('Method not allowed.', 405, { Allow: 'GET, HEAD, POST' }, head);
      if (request.method === 'POST' && (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')) return reply('Request not allowed.', 403);
      return reply('', 303, { Location: `${PREVIEW_PATH}/`, 'Set-Cookie': `${SESSION_COOKIE}=; Path=${PREVIEW_PATH}; Max-Age=0; Secure; HttpOnly; SameSite=Strict` }, head);
    }
    // Public commerce still validates origin, rate, mappings and current prices.
    // Holder/custom endpoints enforce their own verified wallet session below.
    // Draft mappings and provisioned credentials cannot turn checkout on by themselves.
    if (pathname.startsWith(`${PREVIEW_PATH}/api/`)) {
      if (legacy) return reply('Not found.', 404, {}, head);
      const authorize = candidate => new URL(candidate.url).protocol === 'https:';
      const rateLimit = async candidate => {
        const path = new URL(candidate.url).pathname;
        const imageMint = candidate.method === 'GET' && /^\/goods\/api\/benefits\/nft-image\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(path)?.[1];
        const action = imageMint ? `benefit-image-${imageMint}` : path.startsWith('/goods/api/benefits/')
          ? (candidate.method === 'GET' ? (path.includes('/custom/') ? 'benefit-poll' : 'benefit-read') : 'benefit-write')
          : path.endsWith('/checkout') ? 'checkout' : 'catalog';
        const key = hex(await hash(`goods-${action}:${candidate.headers.get('CF-Connecting-IP') || 'unknown'}`));
        const limit = await env.MERCH_PREVIEW_LIMIT.limit({ key });
        return limit?.success === true;
      };
      const runtime = createGoodsRuntime(env, { authorize, rateLimit });
      if (pathname === '/goods/api/benefits' || pathname.startsWith('/goods/api/benefits/')) {
        const result = runtime ? await runtime.handler(request, ctx) : Response.json({error:{code:'BENEFITS_UNAVAILABLE',message:'Holder benefits are temporarily unavailable. Please try again shortly.'}},{status:503});
        const responseHeaders = headers();
        for (const [name,value] of result.headers) if (!responseHeaders.has(name)) responseHeaders.set(name,value);
        return new Response(head ? null : result.body,{status:result.status,headers:responseHeaders});
      }
      const commerceEnabled = goodsMappings.salesEnabled === true && env.GOODS_CHECKOUT_ENABLED === '1'
        && typeof env.GOODS_STOREFRONT_TOKEN === 'string' && env.GOODS_STOREFRONT_TOKEN.length > 0;
      const handler = createGoodsHandler({
        config: { ...goodsMappings, salesEnabled: commerceEnabled, variants: commerceEnabled ? goodsMappings.variants : goodsMappings.variants.map(variant => ({ ...variant, enabled: false })) },
        storefrontToken: env.GOODS_STOREFRONT_TOKEN,
        authorize, rateLimit,
        checkoutBenefit: runtime?.checkoutBenefit,
      });
      const result = await handler(request);
      if (!result) return reply('Not found.', 404, {}, head);
      const responseHeaders = headers();
      for (const [name, value] of result.headers) {
        if (!responseHeaders.has(name)) responseHeaders.set(name, value);
      }
      return new Response(head ? null : result.body, { status: result.status, headers: responseHeaders });
    }
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed.', 405, { Allow: 'GET, HEAD' }, head);
    const name = assetName(pathname);
    if (!name) return reply('Not found.', 404, {}, head);
    if (pathname === PREVIEW_PATH) return reply('', 308, { Location: `${PREVIEW_PATH}/${url.search}` }, head);
    const key = `${env.MERCH_PREVIEW_PREFIX}/${name}`;
    const object = await env.MERCH_PREVIEW_ASSETS[head ? 'head' : 'get'](key);
    if (!object) return reply('Not found.', 404, {}, head);
    const contentType = mediaTypes[name.split('.').pop().toLowerCase()];
    const publicHeaders = headers({ 'Content-Type': contentType, 'Cache-Control': 'no-store, max-age=0' });
    publicHeaders.delete('Vary'); publicHeaders.delete('X-Robots-Tag');
    return new Response(head ? null : object.body, { status: 200, headers: publicHeaders });
  } catch (_) {
    // No input, credentials, cookies or storage errors are logged or reflected.
    return reply('The collection is temporarily unavailable.', 503, {}, head);
  }
}
