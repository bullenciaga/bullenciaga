import { createGoodsHandler } from './goods-fourthwall.mjs';
import goodsMappings from './goods-mappings.mjs';
import { createGoodsRuntime } from './goods-runtime.mjs';

// Goods assets stay in private R2. The optional page gate and wallet proofs
// are separate boundaries; Fourthwall callbacks retain their HMAC authentication.
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
  woff: 'font/woff', woff2: 'font/woff2', mp4: 'video/mp4',
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

// Explicit CEST offset keeps the launch instant independent of the visitor's timezone.
const GOODS_LAUNCH = '2026-10-10T19:00:00+02:00';
function countdownParts(now) {
  const seconds = Math.max(0, Math.ceil((Date.parse(GOODS_LAUNCH) - now) / 1000));
  return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
}

// This Goods-specific share card is public; catalogue assets and wallet APIs stay protected.
const GOODS_SOCIAL_META = `<meta name="description" content="Signature pieces. House statements. The BULLENCIAGA collection.">
<link rel="canonical" href="https://bullenciaga.com/goods/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BULLENCIAGA">
<meta property="og:title" content="Goods — BULLENCIAGA">
<meta property="og:description" content="Signature pieces. House statements. The BULLENCIAGA collection.">
<meta property="og:url" content="https://bullenciaga.com/goods/">
<meta property="og:image" content="https://bullenciaga.com/assets/social/goods-collection-01-v1.jpg">
<meta property="og:image:secure_url" content="https://bullenciaga.com/assets/social/goods-collection-01-v1.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Bull, Lily and Sakura wearing the BULLENCIAGA House collection during a studio photoshoot.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Goods — BULLENCIAGA">
<meta name="twitter:description" content="Signature pieces. House statements. The BULLENCIAGA collection.">
<meta name="twitter:image" content="https://bullenciaga.com/assets/social/goods-collection-01-v1.jpg">
<meta name="twitter:image:alt" content="Bull, Lily and Sakura wearing the BULLENCIAGA House collection during a studio photoshoot.">`;

function loginPage(message = '', status = 200, head = false, extra = {}) {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const labels = ['Days', 'Hours', 'Minutes', 'Seconds'];
  const values = countdownParts(Date.now());
  const arrived = values.every(value => value === 0);
  const fontPreloads = [
    'house-3dc5d0c52428fe16.woff2', // Poppins 400, Latin
    'house-289e0afc8be731a8.woff2', // Poppins 500, Latin
    'house-872e862918591a9e.woff2', // Poppins 600, Latin
  ].map(file => `<link rel="preload" href="/fonts/${file}" as="font" type="font/woff2" crossorigin>`).join('');
  // Set the font state before body paint. A stalled font reveals a fixed fallback
  // after a bounded wait; a late response must not resize visible gate content.
  const fontBoot = `<script nonce="${nonce}">
(() => {
  const root = document.documentElement;
  let started = false, finished = false;
  root.dataset.gateFonts = 'loading';
  const finish = loaded => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    root.dataset.gateFonts = loaded ? 'ready' : 'fallback';
  };
  const deadline = setTimeout(() => finish(false), 1200);
  const start = () => {
    if (started || finished) return;
    started = true;
    if (!document.fonts) { finish(false); return; }
    Promise.allSettled([400, 500, 600].map(weight => document.fonts.load(weight + ' 16px Poppins')))
      .then(results => finish(results.every(result => result.status === 'fulfilled' && result.value.length > 0 && result.value.every(face => face.status === 'loaded'))));
  };
  const isFontStyle = element => element?.tagName === 'LINK' && element.getAttribute('href') === '/fonts/house-fonts-full.css';
  document.addEventListener('load', event => { if (isFontStyle(event.target)) start(); }, true);
  document.addEventListener('error', event => { if (isFontStyle(event.target)) finish(false); }, true);
  document.addEventListener('DOMContentLoaded', start, { once: true });
})();
</script>`;
  const html = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#19191e"><meta name="color-scheme" content="dark"><title>Goods — BULLENCIAGA</title>${GOODS_SOCIAL_META}${fontPreloads}${fontBoot}<link rel="stylesheet" href="/bullen-focus.css"><script defer src="/bullen-focus.js"></script><link rel="stylesheet" href="/fonts/house-fonts-full.css"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2319191e'/%3E%3Cpath d='M8 11h16l1 15H7zM12 12V8a4 4 0 0 1 8 0v4' fill='none' stroke='%23f2efe9' stroke-width='2'/%3E%3C/svg%3E"><style>
:root{color-scheme:dark;--paper:#19191e;--ink:#f2efe9;--muted:#aaa8a7;--line:#f2efe926;--gold:#c5a575;--bullen-focus:var(--ink)}*{box-sizing:border-box}body{margin:0;min-height:100svh;background:var(--paper);color:var(--ink);font-family:Poppins,Arial,Helvetica,sans-serif;display:grid;grid-template-rows:auto 1fr auto;-webkit-font-smoothing:antialiased}header,footer{padding:25px clamp(24px,4vw,72px);display:flex;align-items:center;justify-content:space-between;gap:20px}header{border-bottom:1px solid var(--line)}.identity{display:flex;align-items:center;gap:20px}.wordmark{color:inherit;text-decoration:none;font-size:16px;letter-spacing:.2em;font-weight:600;white-space:nowrap}.section{padding-left:20px;border-left:1px solid var(--line);font-size:10px;letter-spacing:.14em}.collection,.eyebrow,footer{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}main{width:min(100%,960px);margin:auto;padding:56px 32px 24px}.launch{text-align:center}.eyebrow{margin:0 0 14px;color:var(--gold)}h1{font-size:clamp(36px,6vw,64px);line-height:1.13;font-weight:600;letter-spacing:-.045em;margin:0 0 20px;text-wrap:balance}p{font-size:14px;line-height:1.7;color:var(--muted);margin:0}.launch-date{display:block;font-size:14px;color:var(--ink)}.countdown{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:32px auto 0;padding:26px 0;border-block:1px solid var(--line);max-width:800px}.unit+.unit{border-left:1px solid var(--line)}.digit{display:block;font-size:clamp(40px,7vw,88px);font-weight:500;letter-spacing:-.055em;line-height:1.12;font-variant-numeric:tabular-nums}.unit-label{display:block;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-top:9px}.launch-note{font-size:12px;margin-top:16px;min-height:21px}.private-view{max-width:376px;margin:38px auto 0}.private-heading{display:flex;align-items:center;gap:10px;margin-bottom:7px}.lock{width:17px;height:17px;color:var(--muted);flex:none}h2{font-size:16px;font-weight:500;letter-spacing:-.025em;margin:0}.intro{font-size:12px}form{margin-top:22px}label{display:block;font-size:12px;margin:0 0 10px}input,button{width:100%;border-radius:3px;min-height:54px;font:inherit}input{background:transparent;border:1px solid #f2efe935;color:var(--ink);padding:14px 16px;font-size:16px;transition:border-color .18s}input:hover{border-color:#f2efe970}button{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);font-size:13px;font-weight:500;padding:14px 18px;margin-top:14px;cursor:pointer;transition:background .18s}button:hover{background:#dad7d1}button svg{width:19px;height:19px}input:focus-visible,button:focus-visible,.wordmark:focus-visible{outline:2px solid var(--ink);outline-offset:4px}.message{min-height:46px;padding-top:14px;font-size:12px;color:var(--ink)}footer{border-top:1px solid var(--line);padding-top:21px;padding-bottom:21px}@media(max-width:560px){header{padding:22px 24px}.identity{gap:14px}.wordmark{font-size:14px}.section{padding-left:14px}.collection{display:none}main{padding:42px 24px 20px}.launch-date{font-size:12px}.countdown{padding:24px 0;margin-top:26px}.digit{font-size:clamp(34px,10vw,56px)}.unit-label{font-size:8px;letter-spacing:.09em}.private-view{margin-top:30px}footer{font-size:9px;letter-spacing:.08em;gap:12px}}@media(prefers-reduced-motion:reduce){input,button{transition:none}}
html{background:var(--paper);-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{transition:opacity .18s ease}
@media(prefers-reduced-motion:reduce){body{transition:none}}
/* No JavaScript and timed-out requests keep one stable system face. */
html:not([data-gate-fonts]) body,html[data-gate-fonts="fallback"] body{font-family:Arial,Helvetica,sans-serif}
html[data-gate-fonts="loading"] body{opacity:0}
</style></head><body><header><div class="identity"><a class="wordmark" href="https://bullenciaga.com/">BULLENCIAGA</a><span class="section">GOODS</span></div><span class="collection">Collection 01</span></header><main><section class="launch" aria-labelledby="launch-title"><p class="eyebrow">Collection 01 · Coming this Saturday</p><h1 id="launch-title">The Goods arrive.</h1><time class="launch-date" datetime="${GOODS_LAUNCH}">Saturday, 10 October · 19:00 CEST</time><div id="countdown" class="countdown" role="timer" aria-live="off" aria-label="${values.map((value, i) => value + ' ' + labels[i].toLowerCase()).join(', ')} remaining">${values.map((value, i) => `<div class="unit" aria-hidden="true"><span class="digit" id="countdown-${i}">${String(value).padStart(2, '0')}</span><span class="unit-label">${labels[i]}</span></div>`).join('')}</div><p class="launch-note" id="launch-note">${arrived ? 'Launch time has arrived. Stay tuned.' : 'A new chapter. Almost yours.'}</p><noscript><p class="launch-note">The collection launches at the time shown above.</p></noscript></section><section class="private-view" aria-labelledby="private-title"><div class="private-heading"><svg class="lock" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" stroke="currentColor" stroke-width="1.3"/></svg><h2 id="private-title">The collection awaits.</h2></div><p class="intro">Have early access? Enter your password to step inside.</p><form method="post" action="${PREVIEW_PATH}/login"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required aria-describedby="message"${status === 401 ? ' aria-invalid="true"' : ''}><button type="submit"><span>Enter the collection</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.4"/></svg></button><p id="message" class="message" role="status" aria-live="polite">${message}</p></form></section></main><footer><span>Collection 01</span><span>The House of BULLENCIAGA</span></footer><script nonce="${nonce}">
(() => {
  const deadline = Date.parse('${GOODS_LAUNCH}');
  const timer = document.getElementById('countdown');
  const digits = [0, 1, 2, 3].map(i => document.getElementById('countdown-' + i));
  const labels = ['days', 'hours', 'minutes', 'seconds'];
  function update() {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
    values.forEach((value, i) => { digits[i].textContent = String(value).padStart(2, '0'); });
    timer.setAttribute('aria-label', values.map((value, i) => value + ' ' + labels[i]).join(', ') + ' remaining');
    document.getElementById('launch-note').textContent = remaining === 0 ? 'Launch time has arrived. Stay tuned.' : 'A new chapter. Almost yours.';
  }
  update();
  setInterval(update, 1000);
  document.addEventListener('visibilitychange', update);
})();
</script></body></html>`;
  // Permit only this response's font/timer scripts; private assets keep their original CSP.
  const policy = headers().get('Content-Security-Policy').replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`);
  return reply(html, status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': policy, ...extra }, head);
}

function gateEnabled(env) { return env.MERCH_PREVIEW_PROTECTED === '1'; }

function configReady(env) {
  if (gateEnabled(env) && (!/^[a-f0-9]{64}$/i.test(env.MERCH_PREVIEW_PASSWORD_SHA256 || '')
    || typeof env.MERCH_PREVIEW_SESSION_SECRET !== 'string' || env.MERCH_PREVIEW_SESSION_SECRET.length < 32)) return false;
  return /^[a-z0-9][a-z0-9_-]{0,95}$/i.test(env.MERCH_PREVIEW_PREFIX || '')
    && typeof env.MERCH_PREVIEW_ASSETS?.get === 'function'
    && typeof env.MERCH_PREVIEW_ASSETS?.head === 'function'
    && typeof env.MERCH_PREVIEW_LIMIT?.limit === 'function';
}

function unhex(value) { return Uint8Array.from(value.match(/../g), part => Number.parseInt(part, 16)); }
function hex(bytes) { return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join(''); }
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
  // Only storefront entry/modules and visual assets are public. Internal JSON
  // manifests, alternate HTML and rollback/review files may share this prefix.
  const root = relative === 'index.html'
    || /^storefront(?:-v[0-9]+)?\.(?:js|css)$/.test(relative)
    || /^goods-(?:commerce|benefits|benefits-ui|preview)(?:-v[0-9]+)?\.mjs$/.test(relative);
  const visual = /^(?:assets|images)\//.test(relative)
    && /^(?:png|jpg|jpeg|webp|avif|svg|ico|woff|woff2)$/.test(extension);
  const video = /^assets\/videos\/[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/.test(relative);
  return mediaTypes[extension] && (root || visual || video) ? relative : null;
}

// A single byte range is enough for native video players. Unknown units and
// multiple ranges are ignored (200); malformed/unsatisfiable bytes get 416.
function videoRange(value, size) {
  if (!value || !/^bytes=/i.test(value) || value.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return false;
  const total = BigInt(size);
  let start, end;
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return false;
    start = suffix < total ? total - suffix : 0n;
    end = total - 1n;
  } else {
    start = BigInt(match[1]);
    end = match[2] ? BigInt(match[2]) : total - 1n;
    if (start >= total || end < start) return false;
    if (end >= total) end = total - 1n;
  }
  return { offset: Number(start), length: Number(end - start + 1n) };
}

async function videoAsset(request, env, key) {
  const head = request.method === 'HEAD', bucket = env.MERCH_PREVIEW_ASSETS;
  const responseHeaders = headers({ 'Content-Type': mediaTypes.mp4, 'Accept-Ranges': 'bytes' });
  if (!gateEnabled(env)) {
    responseHeaders.set('Cache-Control', 'no-store, max-age=0');
    responseHeaders.delete('Vary'); responseHeaders.delete('X-Robots-Tag');
  }
  // No validators are exposed by this private, no-store route, so If-Range
  // cannot validate a previous response. HEAD must ignore Range (RFC 9110).
  const rangeHeader = !head && !request.headers.has('If-Range') ? request.headers.get('Range') : null;
  let object = await bucket[head || rangeHeader ? 'head' : 'get'](key);
  if (!object) return reply('Not found.', 404, {}, head);
  if (!Number.isSafeInteger(object.size) || object.size < 0) throw new Error('Invalid video metadata');
  const range = videoRange(rangeHeader, object.size);
  if (range === false) {
    return reply('Range not satisfiable.', 416, { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${object.size}` });
  }
  const size = object.size;
  if (!head && rangeHeader) {
    // Pin a partial read to its metadata; never buffer a whole video to slice it.
    if (range && !object.etag) throw new Error('Missing video validator');
    const options = range ? { range, onlyIf: { etagMatches: object.etag } } : undefined;
    object = await bucket.get(key, options);
    if (!object) return reply('Not found.', 404);
    if (!object.body || object.size !== size || (range && (object.range?.offset !== range.offset || object.range?.length !== range.length))) {
      await object.body?.cancel();
      throw new Error('Video changed during read');
    }
  }
  responseHeaders.set('Content-Length', String(range ? range.length : size));
  if (range) responseHeaders.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`);
  return new Response(head ? null : object.body, { status: range ? 206 : 200, headers: responseHeaders });
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
      // Keep old links local; the canonical Goods route applies the access policy.
      return reply('', 308, { Location: pathname + url.search }, head);
    }
    // Page access uses the existing server-only password and signed cookie.
    if (gateEnabled(env) && (pathname === `${PREVIEW_PATH}/login` || pathname === `${PREVIEW_PATH}/logout`)) {
      if (request.method !== 'POST') return reply('Method not allowed.', 405, { Allow: 'POST' }, head);
      if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return reply('Request not allowed.', 403);
      if (pathname === `${PREVIEW_PATH}/logout`) {
        return reply('', 303, { Location: PREVIEW_PATH, 'Set-Cookie': cookie('', 0) });
      }
      const key = hex(await hash(`merch-login:${request.headers.get('CF-Connecting-IP') || 'unknown'}`));
      const limit = await env.MERCH_PREVIEW_LIMIT.limit({ key });
      if (!limit?.success) return loginPage('Too many attempts. Please try again in a minute.', 429, false, { 'Retry-After': '60' });
      const password = await readLogin(request);
      // Malformed and incorrect submissions receive the same response.
      const suppliedHash = await hash(password || '');
      if (!equalDigest(suppliedHash, unhex(env.MERCH_PREVIEW_PASSWORD_SHA256)) || password === null) {
        return loginPage('That password did not match. Please try again.', 401);
      }
      return reply('', 303, { Location: `${PREVIEW_PATH}/`, 'Set-Cookie': cookie(await createSession(url.origin, env)) });
    }
    // Retire old preview forms safely when the collection is public. These routes only expire the obsolete
    // page-password cookie; the independent wallet session is never changed.
    if (pathname === `${PREVIEW_PATH}/login` || pathname === `${PREVIEW_PATH}/logout`) {
      if (!['GET', 'HEAD', 'POST'].includes(request.method)) return reply('Method not allowed.', 405, { Allow: 'GET, HEAD, POST' }, head);
      if (request.method === 'POST' && (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')) return reply('Request not allowed.', 403);
      return reply('', 303, { Location: `${PREVIEW_PATH}/`, 'Set-Cookie': `${SESSION_COOKIE}=; Path=${PREVIEW_PATH}; Max-Age=0; Secure; HttpOnly; SameSite=Strict` }, head);
    }
    // Commerce still validates origin, rate, mappings and current prices.
    // Holder/custom endpoints enforce their own verified wallet session below.
    // Draft mappings and provisioned credentials cannot turn checkout on by themselves.
    if (pathname.startsWith(`${PREVIEW_PATH}/api/`)) {
      if (legacy) return reply('Not found.', 404, {}, head);
      const authorize = candidate => gateEnabled(env)
        ? authenticated(candidate, env, new URL(candidate.url).origin)
        : new URL(candidate.url).protocol === 'https:';
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
        if (!await authorize(request)) return reply(JSON.stringify({error:{code:'AUTH_REQUIRED',message:'Please unlock the collection again.'}}),401,{'Content-Type':'application/json; charset=utf-8'},head);
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
    if (gateEnabled(env) && !await authenticated(request, env, url.origin)) {
      return name === 'index.html' ? loginPage('', 200, head) : reply('Authentication required.', 401, {}, head);
    }
    if (pathname === PREVIEW_PATH) return reply('', 308, { Location: `${PREVIEW_PATH}/${url.search}` }, head);
    const key = `${env.MERCH_PREVIEW_PREFIX}/${name}`;
    if (name.endsWith('.mp4')) return await videoAsset(request, env, key);
    const object = await env.MERCH_PREVIEW_ASSETS[head ? 'head' : 'get'](key);
    if (!object) return reply('Not found.', 404, {}, head);
    const contentType = mediaTypes[name.split('.').pop().toLowerCase()];
    if (gateEnabled(env)) return new Response(head ? null : object.body, { status: 200, headers: headers({ 'Content-Type': contentType }) });
    const publicHeaders = headers({ 'Content-Type': contentType, 'Cache-Control': 'no-store, max-age=0' });
    publicHeaders.delete('Vary'); publicHeaders.delete('X-Robots-Tag');
    return new Response(head ? null : object.body, { status: 200, headers: publicHeaders });
  } catch (_) {
    // No input, credentials, cookies or storage errors are logged or reflected.
    return reply('The collection is temporarily unavailable.', 503, {}, head);
  }
}
