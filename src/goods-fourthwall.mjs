// Protected Goods catalog/cart adapter. The existing session gate and runtime opt-in are wired by merch-preview.mjs.
// Documented schema: setup/api/storefront-openapi.json. Currency values are major units.
const API='https://storefront-api.fourthwall.com';
const KEY=x=>JSON.stringify([x.product,x.colour,x.size]);
export class ShopError extends Error { constructor(code,message,status=400){super(message);this.code=code;this.status=status;} }
const unavailable=()=>new ShopError('UNAVAILABLE','The shop is temporarily unavailable. Please try again.',503);
const money=value=>typeof value==='number' && Number.isFinite(value) && value>=0;
const response=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

export function validateMappings(config) {
  if (config?.schemaVersion!==1 || config.currency!=='USD' || !Array.isArray(config.variants) || typeof config.salesEnabled!=='boolean') throw new Error('Invalid mapping configuration');
  if (config.salesEnabled && !config.checkoutOrigin) throw new Error('Checkout origin required');
  if (config.checkoutOrigin) { const u=new URL(config.checkoutOrigin); if(u.protocol!=='https:' || u.origin!==config.checkoutOrigin || u.username || u.password) throw new Error('Invalid checkout origin'); }
  const local=new Set(),remote=new Set();
  for (const v of config.variants) {
    if (!['product','colour','size','productId','slug','variantId'].every(k=>typeof v[k]==='string' && v[k].length>0 && v[k].length<=180) || !/^[a-z0-9-]+$/.test(v.slug) || typeof v.enabled!=='boolean') throw new Error('Incomplete variant mapping');
    if(local.has(KEY(v)) || remote.has(v.variantId))throw new Error('Ambiguous variant mapping'); local.add(KEY(v)); remote.add(v.variantId);
  }
  return config;
}
export function normalizeVariant(mapping,product,currency) {
  if (product?.id!==mapping.productId || product?.slug!==mapping.slug || product?.type!=='PRODUCT') throw unavailable();
  const variant=product.variants?.find(x=>x.id===mapping.variantId);
  if (!variant || !money(variant.unitPrice?.value) || variant.unitPrice.currency!==currency) throw unavailable();
  // Optional observed attribute names catch accidental relinking to a different size/colour.
  if (mapping.expectedColor && variant.attributes?.color?.name!==mapping.expectedColor) throw unavailable();
  if (mapping.expectedSize && variant.attributes?.size?.name!==mapping.expectedSize) throw unavailable();
  const stock=variant.stock;
  let maxQuantity=stock?.type==='UNLIMITED'?20:stock?.type==='LIMITED' && Number.isInteger(stock.inStock)?Math.max(0,Math.min(20,stock.inStock)):0;
  const available=mapping.enabled && product.state?.type==='AVAILABLE' && ['PUBLIC','HIDDEN'].includes(product.access?.type) && maxQuantity>0;
  if (!available) maxQuantity=0;
  return {product:mapping.product,colour:mapping.colour,size:mapping.size,variantId:mapping.variantId,unitPrice:variant.unitPrice.value,currency,available,maxQuantity};
}


async function readCheckoutBody(request) {
  const length=request.headers.get('content-length');
  if(length!==null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw new ShopError('INVALID','Invalid request.');
  if(length!==null && Number(length)>20000) throw new ShopError('INVALID','Your bag is too large.',413);
  if(!request.body) throw new ShopError('INVALID','Invalid request.');
  const reader=request.body.getReader(),chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>20000){await reader.cancel().catch(()=>{});throw new ShopError('INVALID','Your bag is too large.',413);}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{throw new ShopError('INVALID','Invalid request.');}
}

export function createGoodsHandler({config,storefrontToken,fetchImpl=fetch,authorize,rateLimit}) {
  validateMappings(config);
  // Integration must explicitly wire the existing protected Goods gate and a shared rate limiter.
  if (typeof authorize!=='function' || typeof rateLimit!=='function') throw new Error('Existing gate and rate limiter are required');
  const mappings=new Map(config.variants.map(v=>[KEY(v),v]));
  async function fourthwall(path,body) {
    if(!storefrontToken)throw unavailable();
    const url=new URL(API+path);url.searchParams.set('storefront_token',storefrontToken);url.searchParams.set('currency',config.currency);
    let res;
    try{res=await fetchImpl(url,{method:body?'POST':'GET',headers:{Accept:'application/json','User-Agent':'BULLENCIAGA Goods/1.0',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw unavailable();}
    if(!res.ok){
      if(res.status===400 || res.status===404){const error=new ShopError('UNAVAILABLE','A selection is no longer available. Please review your bag.',409);error.upstreamStatus=res.status;throw error;}
      throw unavailable();
    }
    let data;try{data=await res.json();}catch{throw unavailable();}
    return data;
  }
  async function catalogue(selected=config.variants.filter(v=>v.enabled),allowMissing=true) {
    const entries=await Promise.all([...new Set(selected.map(v=>v.slug))].map(async slug=>{
      try{return [slug,await fourthwall('/v1/products/'+encodeURIComponent(slug))];}
      catch(error){if(allowMissing && error instanceof ShopError && error.upstreamStatus===404)return [slug,null];throw error;}
    }));
    const products=new Map(entries);
    return selected.filter(v=>products.get(v.slug)!==null).map(v=>normalizeVariant(v,products.get(v.slug),config.currency));
  }
  async function checkout(request) {
    if(!config.salesEnabled)throw new ShopError('NOT_OPEN','Ordering opens soon.',409);
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ShopError('INVALID','Invalid request.',415);
    const bodyText=await readCheckoutBody(request);
    let body;try{body=JSON.parse(bodyText);}catch{throw new ShopError('INVALID','Invalid request.');}
    if(!body || typeof body!=='object' || body.currency!==config.currency || !Array.isArray(body.items) || body.items.length===0 || body.items.length>50)throw new ShopError('INVALID','Please review your bag.');
    const seen=new Set(),selected=[];
    for(const item of body.items){
      if(!item || typeof item!=='object')throw new ShopError('INVALID','Please review your bag.');
      const mapping=mappings.get(KEY(item));
      if(!mapping || !mapping.enabled || mapping.variantId!==item.variantId || seen.has(item.variantId) || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>20 || !money(item.expectedUnitPrice))throw new ShopError('INVALID','A selection has changed. Please review your bag.');
      seen.add(item.variantId);selected.push(mapping);
    }
    const current=await catalogue(selected,false);
    for(let i=0;i<current.length;i++){
      if(!current[i].available || body.items[i].quantity>current[i].maxQuantity)throw new ShopError('UNAVAILABLE','A selection is no longer available. Please review your bag.',409);
      if(Math.round(current[i].unitPrice*100)!==Math.round(body.items[i].expectedUnitPrice*100))throw new ShopError('PRICE_CHANGED','Prices have updated. Review your bag before continuing.',409);
    }
    const requested=body.items.map(({variantId,quantity})=>({variantId,quantity}));
    const cart=await fourthwall('/v1/carts',{items:requested,metadata:{source:'bullenciaga_goods'}});
    // Never redirect a silently altered cart or one carrying missing/extra rows.
    if(typeof cart.id!=='string' || !cart.id || !Array.isArray(cart.items) || cart.items.length!==requested.length)throw unavailable();
    const returned=new Set();
    for(const line of cart.items){
      const index=requested.findIndex(v=>v.variantId===line.variant?.id);
      if(index<0 || returned.has(line.variant.id) || line.quantity!==requested[index].quantity || line.variant.unitPrice?.currency!==config.currency || !money(line.variant.unitPrice?.value) || Math.round(line.variant.unitPrice.value*100)!==Math.round(current[index].unitPrice*100))throw new ShopError('PRICE_CHANGED','Your bag changed while opening checkout. Please review it and try again.',409);
      returned.add(line.variant.id);
    }
    const url=new URL('/cart/checkout',config.checkoutOrigin);url.searchParams.set('cartId',cart.id);url.searchParams.set('currency',config.currency);
    return {checkoutUrl:url.href,checkoutHost:url.hostname};
  }
  return async request=>{
    const url=new URL(request.url);
    if(!['/goods/api/catalog','/goods/api/checkout'].includes(url.pathname))return null;
    try{
      if(!(await authorize(request)))throw new ShopError('AUTH_REQUIRED','Please unlock the collection again.',401);
      if(!(await rateLimit(request)))throw new ShopError('RETRY','Please wait a moment and try again.',429);
      if(request.method==='GET' && url.pathname==='/goods/api/catalog')return response({schemaVersion:1,currency:config.currency,salesEnabled:config.salesEnabled,variants:await catalogue()});
      if(request.method==='POST' && url.pathname==='/goods/api/checkout'){
        if(request.headers.get('origin')!==url.origin || ['cross-site','none'].includes(request.headers.get('sec-fetch-site')))throw new ShopError('FORBIDDEN','Please open checkout from the collection.',403);
        return response(await checkout(request));
      }
      return response({code:'METHOD',message:'Method not allowed.'},405);
    }catch(error){return response({code:error instanceof ShopError?error.code:'UNAVAILABLE',message:error instanceof ShopError?error.message:'The shop is temporarily unavailable. Please try again.'},error instanceof ShopError?error.status:503);}
  };
}
