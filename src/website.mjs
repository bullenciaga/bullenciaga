// Keep short-domain visits on the established origin for wallets and sessions.
const aliases = new Set(['bullen.app', 'www.bullen.app']);

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (aliases.has(url.hostname)) {
      return new Response(null, {
        status: 308,
        headers: {
          Location: `https://bullenciaga.com${url.pathname}${url.search}`,
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
    // Preserve the existing asset service, including _redirects and _headers.
    return env.ASSETS.fetch(request);
  },
};
