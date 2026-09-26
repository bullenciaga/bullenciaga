const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (status, error) => Response.json(error ? { ok: false, error } : { ok: true }, { status, headers });

// Read at most 2 KiB, even if Content-Length is absent or dishonest.
async function readInput(request) {
  if (!request.body) throw new Error('empty');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw new Error('large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function platformSignup(request, env) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } });
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin) return reply(403, 'please use the signup form on this website.');
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return reply(415, 'please use the signup form.');
  if (Number(request.headers.get('Content-Length')) > 2048) return reply(413, 'that submission is too long.');
  if (!env.PLATFORM_SIGNUPS || !env.PLATFORM_LIMIT) return reply(503, 'signups are temporarily unavailable. please try again shortly.');
  try {
    // The unauthenticated form has no account ID. IP is used only by the
    // short-lived edge limiter; it is never stored in the signup database.
    const { success } = await env.PLATFORM_LIMIT.limit({ key: 'preview:' + (request.headers.get('CF-Connecting-IP') || 'unknown') });
    if (!success) return new Response(JSON.stringify({ ok: false, error: 'please wait a minute before trying again.' }), { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    let input;
    try { input = await readInput(request); } catch (error) { return reply(error.message === 'large' ? 413 : 400, 'please check your details and try again.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, 'please check your details.');
    if (input.website) return reply(200); // Invisible honeypot: do not store automated submissions.
    if (input.consent !== true) return reply(400, 'please agree to receive beta availability and testing updates.');
    const method = input.method;
    let contact = typeof input.contact === 'string' ? input.contact.trim() : '';
    if (method === 'email') {
      if (contact.length > 254 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}$/i.test(contact) || contact.split('@')[0].length > 64 || contact.includes('..')) return reply(400, 'enter a valid email address.');
      contact = contact.toLowerCase();
    } else if (method === 'x') {
      contact = contact.replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{1,15}$/.test(contact)) return reply(400, 'enter your x handle, without a profile link.');
    } else return reply(400, 'choose email or x.');
    // Identical response for new and existing contacts. Never expose membership.
    await env.PLATFORM_SIGNUPS.prepare('INSERT INTO preview_signups (id, method, contact, created_at, consent_version) VALUES (?, ?, ?, ?, ?) ON CONFLICT(method, contact) DO NOTHING')
      .bind(crypto.randomUUID(), method, contact, new Date().toISOString(), 'beta-notification-2026-09-26').run();
    return reply(200);
  } catch {
    // Do not log request bodies, email addresses or handles.
    return reply(503, 'we couldn’t save your request. please try again shortly.');
  }
}
