const pageHeaders={
  'Cache-Control':'private, no-store',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
export async function campaignsGateway(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/campaigns'&&!url.pathname.startsWith('/campaigns/'))return null;
  if(url.hostname==='www.bullenciaga.com')return Response.redirect(`https://bullenciaga.com${url.pathname}${url.search}`,308);
  if(url.pathname==='/campaigns/api'||url.pathname.startsWith('/campaigns/api/')){
    if(!env.CAMPAIGNS_API)return new Response(JSON.stringify({error:'UNAVAILABLE',message:'Campaigns are being connected. Please try again shortly.'}),{status:503,headers:{...pageHeaders,'Content-Type':'application/json'}});
    return env.CAMPAIGNS_API.fetch(request);
  }
  if(!/^\/campaigns(?:\/[a-z0-9-]+)?\/?$/.test(url.pathname))return null;
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...pageHeaders,Allow:'GET, HEAD'}});
  const assetURL=new URL('/campaigns/',url);
  const asset=await env.ASSETS.fetch(new Request(assetURL,{method:request.method}));
  const response=new Response(asset.body,asset);for(const [k,v] of Object.entries(pageHeaders))response.headers.set(k,v);return response;
}
