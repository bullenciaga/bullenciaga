const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200) => Response.json(body, { status, headers });
export async function platformSignupsAdmin(request, env) {
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer \S{16,512}$/.test(authorization)) return reply({ error: 'Access required' }, 401);
  try {
    if (!env.CONTROL_AUTH || !env.PLATFORM_SIGNUPS) return reply({ error: 'Service unavailable' }, 503);
    // Fixed, read-only authorization probe. Never proxy a caller-selected action.
    const auth = await env.CONTROL_AUTH.fetch(new Request('https://rpc-proxy.internal/rpc/control-room/authorize', {
      method: 'POST', headers: { Authorization: authorization }, redirect: 'manual', signal: AbortSignal.timeout(8000),
    }));
    if (auth.status !== 204) return reply({ error: auth.status === 403 ? 'Access denied' : 'Authentication unavailable' }, auth.status === 403 ? 403 : 503);
    let after = null;
    const cursor = new URL(request.url).searchParams.get('cursor');
    if (cursor) {
      try {
        if (cursor.length > 256) throw new Error();
        after = JSON.parse(atob(cursor));
        if (!Array.isArray(after) || after.length !== 2 || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(after[0]) || !/^[a-f0-9-]{36}$/.test(after[1])) throw new Error();
      } catch { return reply({ error: 'Invalid page cursor' }, 400); }
    }
    const db = env.PLATFORM_SIGNUPS;
    const sql = 'SELECT id, method, contact, created_at AS createdAt FROM preview_signups' +
      (after ? ' WHERE (created_at < ? OR (created_at = ? AND id < ?))' : '') + ' ORDER BY created_at DESC, id DESC LIMIT 101';
    const query = after ? db.prepare(sql).bind(after[0], after[0], after[1]) : db.prepare(sql);
    const [page, count] = await Promise.all([query.all(), db.prepare('SELECT COUNT(*) AS total FROM preview_signups').first()]);
    if (!page.success || !Number.isInteger(count?.total)) throw new Error();
    const rows = page.results.slice(0, 100), last = rows.at(-1);
    return reply({ signups: rows, total: count.total, nextCursor: page.results.length > 100 ? btoa(JSON.stringify([last.createdAt, last.id])) : null, fetchedAt: new Date().toISOString() });
  } catch { return reply({ error: 'Signups could not be loaded. Try again.' }, 503); }
}
