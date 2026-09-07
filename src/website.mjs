// Keep short-domain visits on the established origin for wallets and sessions.
const aliases = new Set(['bullen.app', 'www.bullen.app']);

export default {
  async fetch(request, env) {
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
    const userAgent = request.headers.get('User-Agent') || '';
    const iphoneChrome = /\biPhone\b/i.test(userAgent) && /\bCriOS\//i.test(userAgent);
    const documentPath = !url.pathname.split('/').pop().includes('.') || /\.html$/i.test(url.pathname);
    let assetRequest = request;
    if (iphoneChrome && documentPath && ['GET', 'HEAD'].includes(request.method)) {
      // An old cached cover document must not survive a 304 after this fix.
      const headers = new Headers(request.headers);
      headers.delete('If-None-Match');
      headers.delete('If-Modified-Since');
      assetRequest = new Request(request, { headers });
    }
    // Preserve asset routing, including _redirects and private-page _headers.
    const asset = await env.ASSETS.fetch(assetRequest);
    if (asset.status !== 200 || !/^text\/html\b/i.test(asset.headers.get('Content-Type') || '')) return asset;
    const response = new Response(asset.body, asset);
    const vary = response.headers.get('Vary');
    if (!vary?.split(',').some(value => ['*', 'user-agent'].includes(value.trim().toLowerCase()))) {
      response.headers.set('Vary', [vary, 'User-Agent'].filter(Boolean).join(', '));
    }
    if (!iphoneChrome) return response;

    // Chrome iOS reports viewport-fit=cover to its native container at window
    // load, after our initial header and content can already be painted:
    // chromium/src/ios/web/js_features/fullscreen/resources/fullscreen.ts.
    // Send auto in the first HTML bytes; never toggle the viewport in page JS.
    // Safari, Brave, Android and desktop keep the original document and fade.
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.delete('ETag');
    response.headers.delete('Last-Modified');
    response.headers.delete('Content-Length');
    return new HTMLRewriter().on('meta[name="viewport"]', {
      element(element) {
        const content = element.getAttribute('content');
        if (content) element.setAttribute('content', content.replace(/viewport-fit\s*=\s*cover/gi, 'viewport-fit=auto'));
      },
    }).transform(response);
  },
};
