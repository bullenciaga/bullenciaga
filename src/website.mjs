// Keep short-domain visits on the established origin for wallets and sessions.
const aliases = new Set(['bullen.app', 'www.bullen.app']);

// Keep the native iPhone Chrome scroll view at the viewport's extent. Its
// fullscreen controller otherwise reacts to document content-size/offset
// changes during navigation. The page scrolls in body; the header and dialogs
// remain viewport-fixed. No transform, font override, or page-script swapping.
const iphoneNavigation = `<style data-bullen-navigation>
@media (max-width: 820px) {
  html[data-bullen-page] {
    --bullen-scroll-surface: body;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  html[data-bullen-page] body {
    box-sizing: border-box;
    height: 100%;
    min-height: 0 !important;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scroll-behavior: inherit;
  }
  html[data-bullen-page] body.bullen-mobile-buy-open {
    overflow: hidden;
  }
  .bullen-site-shell {
    background: #050505 !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }
}
</style>
<script data-bullen-scroll-state>
(function () {
  var enabled = function () { return matchMedia('(max-width: 820px)').matches; };
  var saved = history.state && history.state.__bullenScroll;
  var ready = false, departing = false, restoring = false, pending, lastWrite = -Infinity;
  var save = function () {
    clearTimeout(pending);
    if (!ready || departing || !enabled() || restoring || !document.body) return;
    var state = history.state;
    if (state !== null && (typeof state !== 'object' || Array.isArray(state))) return;
    saved = {x: document.body.scrollLeft, y: document.body.scrollTop};
    lastWrite = performance.now();
    try {
      history.replaceState(Object.assign({}, state, {__bullenScroll: saved}), '');
    } catch (_) {}
  };
  var restore = function () {
    if (!enabled() || !saved || !document.body || !Number.isFinite(saved.y)) return;
    clearTimeout(pending);
    restoring = true;
    document.body.scrollTo({left: Number.isFinite(saved.x) ? saved.x : 0, top: saved.y, behavior: 'instant'});
    requestAnimationFrame(function () { restoring = false; });
  };
  // Checkpoints belong to this history entry, contain only scroll coordinates,
  // and preserve unrelated state. Rate-limit writes during kinetic scrolling.
  var checkpoint = function (event) {
    if (event.target !== document.body || restoring || !enabled()) return;
    if (performance.now() - lastWrite >= 500) save();
    else {
      clearTimeout(pending);
      pending = setTimeout(save, 500 - (performance.now() - lastWrite));
    }
  };
  document.addEventListener('scroll', checkpoint, true);
  document.addEventListener('scrollend', checkpoint, true);
  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('a[href]')) save();
  }, true);
  // On WebKit, history.state can already refer to the destination at pagehide.
  // Never write to history during document teardown.
  addEventListener('pagehide', function () { clearTimeout(pending); departing = true; });
  addEventListener('pageshow', function (event) {
    if (event.persisted) { departing = false; ready = true; restore(); }
  });
  addEventListener('popstate', function () {
    if (!ready || departing) return;
    clearTimeout(pending);
    saved = history.state && history.state.__bullenScroll;
    restoring = true;
    requestAnimationFrame(function () { restoring = false; restore(); });
  });
  window.__BULLEN_RESTORE_SCROLL = function () { ready = true; restore(); };
})();
</script>`;

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
    return new HTMLRewriter().on('style[data-bullen-boot]', {
      element(element) { element.before(iphoneNavigation, { html: true }); },
    }).on('meta[name="viewport"]', {
      element(element) {
        const content = element.getAttribute('content');
        if (content) element.setAttribute('content', content.replace(/viewport-fit\s*=\s*cover/gi, 'viewport-fit=auto'));
      },
    }).transform(response);
  },
};
