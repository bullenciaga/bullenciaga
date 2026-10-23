import { fail } from './model.mjs';

// Reuse the existing account service, never its private data or admin key.
export function emailConfigured(env) {
  return /^https:\/\/[a-z]{20}\.supabase\.co$/.test(env.CAMPAIGNS_AUTH_URL || '') &&
    /^sb_publishable_/.test(env.CAMPAIGNS_AUTH_PUBLISHABLE_KEY || '');
}
export function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) fail('INVALID_EMAIL', 'Enter a valid email address.');
  return email;
}
export function maskEmail(email) {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}…@${domain}`;
}
async function authRequest(path, payload, env, fetcher) {
  if (!emailConfigured(env)) fail('NOT_CONFIGURED', 'Email sign-in is not connected yet.', 503);
  let response;
  try {
    response = await fetcher(`${env.CAMPAIGNS_AUTH_URL}/auth/v1/${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { apikey: env.CAMPAIGNS_AUTH_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { fail('EMAIL_UNAVAILABLE', 'Email sign-in could not connect. Please try again shortly.', 503); }
  if (response.status === 429) fail('EMAIL_LIMIT', 'Please wait before requesting or checking another code.', 429);
  if (!response.ok) {
    // Never expose provider responses, address existence, tokens or credentials.
    if (path === 'verify' && [400, 401, 403, 422].includes(response.status)) fail('INVALID_CODE', 'That code is invalid or expired. Check the latest email or request a new code.', 401);
    fail('EMAIL_UNAVAILABLE', 'Email sign-in is temporarily unavailable. Please try again shortly.', 503);
  }
  let data;
  try { data = await response.json(); } catch { fail('EMAIL_UNAVAILABLE', 'The account service could not complete sign-in.', 503); }
  return data;
}
export async function sendEmailCode(email, env, fetcher = fetch) {
  await authRequest('otp', { email, create_user: true }, env, fetcher);
}
export async function verifyEmailCode(email, code, env, fetcher = fetch) {
  if (!/^\d{8}$/.test(code)) fail('INVALID_CODE', 'Enter the eight-digit code from your latest email.', 401);
  const data = await authRequest('verify', { email, token: code, type: 'email' }, env, fetcher);
  const user = data.user;
  // The fixed HTTPS auth service supplies the identity. Neither an address
  // typed in a form nor editable user metadata proves an account identity.
  const valid = typeof data.access_token === 'string' && data.access_token.length > 0 &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user?.id || '') && !!user?.email_confirmed_at &&
    user?.email?.toLowerCase() === email;
  // Campaigns only need a verified identity. Discard the returned session and
  // revoke its refresh token locally; never sign out the user's other devices.
  if (typeof data.access_token === 'string') {
    try { await fetcher(`${env.CAMPAIGNS_AUTH_URL}/auth/v1/logout?scope=local`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { apikey: env.CAMPAIGNS_AUTH_PUBLISHABLE_KEY, Authorization: `Bearer ${data.access_token}` },
    }); } catch { /* No token is retained even when provider cleanup is offline. */ }
  }
  if (!valid) fail('EMAIL_IDENTITY', 'The account service did not confirm this email. Please start again.', 401);
  return { subject: `${new URL(env.CAMPAIGNS_AUTH_URL).hostname}:${user.id}`, label: maskEmail(email) };
}
