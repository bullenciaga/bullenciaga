import { createGoodsHandler } from './goods-fourthwall.mjs';
import goodsMappings from './goods-mappings.mjs';

// The preview payload lives in a private R2 bucket, never the public site assets.
// Rotating either secret invalidates existing sessions. Nothing here places an order.
const SESSION_COOKIE = '__Secure-bullen_merch';
const PREVIEW_PATH = '/goods';
const LEGACY_PATH = '/merch';
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_LOGIN_BYTES = 2048;
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
    'Content-Security-Policy': "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'",
    ...extra,
  });
}

function reply(text, status = 200, extra = {}, head = false) {
  return new Response(head ? null : text, { status, headers: headers({ 'Content-Type': 'text/plain; charset=utf-8', ...extra }) });
}

function loginPage(message = '', status = 200, head = false) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>Private preview — BULLENCIAGA</title><style>
    :root{color-scheme:light dark;--paper:#eee8dc;--ink:#171712;--line:#cbc4b7;--muted:#646259}*{box-sizing:border-box}body{margin:0;min-height:100svh;background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif;display:grid;grid-template-rows:auto 1fr auto}header,footer{padding:28px clamp(24px,5vw,72px)}header{border-bottom:1px solid var(--line);font-size:15px;font-weight:600;letter-spacing:.14em}main{width:min(100%,470px);margin:auto;padding:64px 28px}p{font-size:14px;line-height:1.6;color:var(--muted)}.eyebrow,footer{font-size:10px;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(34px,8vw,46px);font-weight:400;letter-spacing:-.04em;margin:18px 0 20px}label{display:block;font-size:12px;margin:30px 0 10px}input,button{width:100%;border-radius:0;min-height:50px;font:inherit}input{background:transparent;border:1px solid var(--line);color:var(--ink);padding:12px}button{border:1px solid var(--ink);background:var(--ink);color:var(--paper);font-size:12px;letter-spacing:.05em;margin-top:12px;cursor:pointer}input:focus-visible,button:focus-visible{outline:2px solid var(--ink);outline-offset:4px}.message{min-height:24px;margin:12px 0 0}footer{border-top:1px solid var(--line);color:var(--muted)}@media(prefers-color-scheme:dark){:root{--paper:#11110f;--ink:#eee8dc;--line:#39382f;--muted:#b0aa9d}}
  </style></head><body><header>BULLENCIAGA</header><main><p class="eyebrow">The House / Private preview</p><h1>A first look.</h1><p>Enter your password to open the collection.</p><form method="post" action="${PREVIEW_PATH}/login"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit">Enter the preview</button><p class="message" role="status">${message}</p></form></main><footer>One House. Everything connected.</footer></body></html>`;
  return reply(html, status, { 'Content-Type': 'text/html; charset=utf-8' }, head);
}

function configReady(env) {
  return /^[a-f0-9]{64}$/i.test(env.MERCH_PREVIEW_PASSWORD_SHA256 || '')
    && typeof env.MERCH_PREVIEW_SESSION_SECRET === 'string' && env.MERCH_PREVIEW_SESSION_SECRET.length >= 32
    && /^[a-z0-9][a-z0-9_-]{0,95}$/i.test(env.MERCH_PREVIEW_PREFIX || '')
    && typeof env.MERCH_PREVIEW_ASSETS?.get === 'function'
    && typeof env.MERCH_PREVIEW_ASSETS?.head === 'function'
    && typeof env.MERCH_PREVIEW_LIMIT?.limit === 'function';
}

function hex(bytes) { return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join(''); }
function unhex(value) { return Uint8Array.from(value.match(/../g), part => Number.parseInt(part, 16)); }
async function hash(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }

// Fixed-length SHA-256 values; every byte participates in the comparison.
function equalDigest(actual, expected) {
  let difference = 0;
  for (let index = 0; index < 32; index++) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

function cookie(value, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${value}; Path=${PREVIEW_PATH}; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

async function signingKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.MERCH_PREVIEW_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function signatureInput(body, origin, env) {
  return encoder.encode(`merch-preview|${origin}|${env.MERCH_PREVIEW_PASSWORD_SHA256.toLowerCase()}|${body}`);
}

async function createSession(origin, env) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const body = `v1.${now}.${now + SESSION_SECONDS}.${nonce}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), signatureInput(body, origin, env));
  return `${body}.${hex(signature)}`;
}

async function authenticated(request, env, origin) {
  const raw = request.headers.get('Cookie') || '';
  if (raw.length > 8192) return false;
  const values = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return false;
  const token = values[0].slice(SESSION_COOKIE.length + 1);
  const match = /^(v1\.([0-9]{10})\.([0-9]{10})\.[a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const issued = Number(match[2]), expires = Number(match[3]), now = Math.floor(Date.now() / 1000);
  if (issued > now || expires <= now || expires - issued !== SESSION_SECONDS) return false;
  return crypto.subtle.verify('HMAC', await signingKey(env), unhex(match[4]), signatureInput(match[1], origin, env));
}

async function readLogin(request) {
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return null;
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_LOGIN_BYTES)) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_LOGIN_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const values = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (values.getAll('password').length !== 1 || [...values.keys()].some(key => key !== 'password')) return null;
  const password = values.get('password');
  return password && encoder.encode(password).length <= 256 ? password : null;
}

function assetName(pathname) {
  if (pathname === PREVIEW_PATH || pathname === `${PREVIEW_PATH}/`) return 'index.html';
  const relative = pathname.slice(PREVIEW_PATH.length + 1);
  // No encoded separators, dot segments, hidden files or double decoding.
  if (relative.length > 512 || !relative.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))) return null;
  const extension = relative.split('.').pop().toLowerCase();
  return mediaTypes[extension] ? relative : null;
}

export async function merchPreview(request, env) {
  const url = new URL(request.url), head = request.method === 'HEAD';
  const legacy = url.pathname === LEGACY_PATH || url.pathname.startsWith(`${LEGACY_PATH}/`);
  if (!legacy && url.pathname !== PREVIEW_PATH && !url.pathname.startsWith(`${PREVIEW_PATH}/`)) return null;
  const pathname = legacy ? PREVIEW_PATH + url.pathname.slice(LEGACY_PATH.length) : url.pathname;
  try {
    if (url.protocol !== 'https:' || !configReady(env)) return reply('Preview temporarily unavailable.', 503, {}, head);
    if (legacy && ['GET', 'HEAD'].includes(request.method)) {
      // Keep old links and assets working without serving private bytes here.
      return reply('', 308, { Location: pathname + url.search }, head);
    }
    // Old forms retain the same CSRF, throttling and password checks, then
    // issue or expire the canonical cookie without replaying a POST redirect.
    if (pathname === `${PREVIEW_PATH}/login` || pathname === `${PREVIEW_PATH}/logout`) {
      if (request.method !== 'POST') return reply('Method not allowed.', 405, { Allow: 'POST' }, head);
      if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return reply('Request not allowed.', 403);
      if (pathname === `${PREVIEW_PATH}/logout`) {
        return reply('', 303, { Location: PREVIEW_PATH, 'Set-Cookie': cookie('', 0) });
      }
      const key = hex(await hash(`merch-login:${request.headers.get('CF-Connecting-IP') || 'unknown'}`));
      const limit = await env.MERCH_PREVIEW_LIMIT.limit({ key });
      if (!limit?.success) return reply('Too many attempts. Please try again in a minute.', 429, { 'Retry-After': '60' });
      const password = await readLogin(request);
      // Malformed and incorrect submissions receive the same response.
      const suppliedHash = await hash(password || '');
      if (!equalDigest(suppliedHash, unhex(env.MERCH_PREVIEW_PASSWORD_SHA256)) || password === null) {
        return loginPage('That password did not match. Please try again.', 401);
      }
      return reply('', 303, { Location: `${PREVIEW_PATH}/`, 'Set-Cookie': cookie(await createSession(url.origin, env)) });
    }
    // Keep commerce below /goods so the existing Path=/goods session cookie is sent.
    // Draft mappings and provisioned credentials cannot turn checkout on by themselves.
    if (pathname.startsWith(`${PREVIEW_PATH}/api/`)) {
      if (legacy) return reply('Not found.', 404, {}, head);
      const commerceEnabled = goodsMappings.salesEnabled === true && env.GOODS_CHECKOUT_ENABLED === '1'
        && typeof env.GOODS_STOREFRONT_TOKEN === 'string' && env.GOODS_STOREFRONT_TOKEN.length > 0;
      const handler = createGoodsHandler({
        config: { ...goodsMappings, salesEnabled: commerceEnabled, variants: commerceEnabled ? goodsMappings.variants : goodsMappings.variants.map(variant => ({ ...variant, enabled: false })) },
        storefrontToken: env.GOODS_STOREFRONT_TOKEN,
        authorize: candidate => authenticated(candidate, env, url.origin),
        rateLimit: async candidate => {
          const action = new URL(candidate.url).pathname.endsWith('/checkout') ? 'checkout' : 'catalog';
          const key = hex(await hash(`goods-${action}:${candidate.headers.get('CF-Connecting-IP') || 'unknown'}`));
          const limit = await env.MERCH_PREVIEW_LIMIT.limit({ key });
          return limit?.success === true;
        },
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
    if (!await authenticated(request, env, url.origin)) {
      return pathname === PREVIEW_PATH || pathname === `${PREVIEW_PATH}/`
        ? loginPage('', 200, head) : reply('Authentication required.', 401, {}, head);
    }
    const name = assetName(pathname);
    if (!name) return reply('Not found.', 404, {}, head);
    if (pathname === PREVIEW_PATH) return reply('', 308, { Location: `${PREVIEW_PATH}/${url.search}` }, head);
    const key = `${env.MERCH_PREVIEW_PREFIX}/${name}`;
    const object = await env.MERCH_PREVIEW_ASSETS[head ? 'head' : 'get'](key);
    if (!object) return reply('Not found.', 404, {}, head);
    const contentType = mediaTypes[name.split('.').pop().toLowerCase()];
    return new Response(head ? null : object.body, { status: 200, headers: headers({ 'Content-Type': contentType }) });
  } catch (_) {
    // No input, credentials, cookies or storage errors are logged or reflected.
    return reply('Preview temporarily unavailable.', 503, {}, head);
  }
}
