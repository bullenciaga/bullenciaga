import products from './goods-x-products.mjs';
import mappings from './goods-mappings.mjs';
import {createGoodsHandler} from './goods-fourthwall.mjs';

export const GOODS_X_FEED_PATH='/goods/x-feed.xml';
const ORIGIN='https://bullenciaga.com';
const TTL=900;
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const byId=new Map(products.map(p=>[p.id,p]));
const byVariant=new Map(mappings.variants.filter(v=>v.enabled).map(v=>[v.variantId,v]));
export function goodsProductSelection(url){
 const product=byId.get(url.searchParams.get('product'));
 if(!product)return null;
 const colour=product.colours.find(c=>c.id===url.searchParams.get('colour'))||product.colours[0];
 const size=url.searchParams.get('size');
 const variant=mappings.variants.find(v=>v.enabled&&v.product===product.id&&v.colour===colour.id&&v.size===size);
 return {product,colour,size:variant?.size};
}
export function goodsProductUrl(product,colour,size){
 const url=new URL('/goods/',ORIGIN);
 url.searchParams.set('product',product);url.searchParams.set('colour',colour);
 if(size)url.searchParams.set('size',size);
 return url.href;
}
export function goodsProductMetadata(html,url){
 const selection=goodsProductSelection(url);if(!selection)return html;
 const {product:p,colour:c,size}=selection;
 const link=goodsProductUrl(p.id,c.id,size),image=ORIGIN+(c.imagesBySize?.[size]||c.image);
 const title=p.name+' — BULLENCIAGA',description=p.description;
 return html.replace(/<title>[^<]*<\/title>/i,`<title>${xml(title)}</title>`)
  .replace(/<link rel="canonical" href="[^"]*">/i,`<link rel="canonical" href="${xml(link)}">`)
  .replace(/<meta (?:name|property)="([^"]+)" content="[^"]*">/g,(tag,key)=>{
   const values={'description':description,'og:title':title,'twitter:title':title,'og:description':description,'twitter:description':description,'og:url':link,'og:image':image,'og:image:secure_url':image,'twitter:image':image,'og:image:width':'1200','og:image:height':'1200','og:image:type':'image/jpeg','og:image:alt':c.alt,'twitter:image:alt':c.alt};
   return Object.hasOwn(values,key)?tag.replace(/content="[^"]*"/,`content="${xml(values[key])}"`):tag;
  });
}
export function buildGoodsXFeed(catalogue){
 if(catalogue?.schemaVersion!==1||catalogue.currency!=='USD'||catalogue.salesEnabled!==true||!Array.isArray(catalogue.variants)||catalogue.variants.length===0)throw Error('Catalog unavailable');
 const seen=new Set();
 const items=catalogue.variants.map(v=>{
  const m=byVariant.get(v.variantId),p=byId.get(v.product),c=p?.colours.find(c=>c.id===v.colour);
  if(!m||!p||!c||m.product!==v.product||m.colour!==v.colour||m.size!==v.size||seen.has(v.variantId)||v.currency!=='USD'||!Number.isFinite(v.unitPrice)||v.unitPrice<0||typeof v.available!=='boolean')throw Error('Catalog mismatch');
  seen.add(v.variantId);
  const link=goodsProductUrl(p.id,c.id,v.size);
  const fields={id:v.variantId,title:p.name,description:p.description+' '+p.material,link,image_link:ORIGIN+(c.imagesBySize?.[v.size]||c.image),availability:v.available&&v.maxQuantity>0?'in stock':'out of stock',condition:'new',price:v.unitPrice.toFixed(2)+' USD',brand:'BULLENCIAGA',item_group_id:p.id,color:c.name,size:v.size,product_type:'BULLENCIAGA > '+(p.category==='art'?'Framed art':p.category==='home'?'Home':p.category==='lore'?'Lore clothing':'Clothing'),custom_label_0:p.drop};
  return '<item>'+Object.entries(fields).map(([key,value])=>`<g:${key}>${xml(value)}</g:${key}>`).join('')+(c.additionalImages||[]).map(path=>`<g:additional_image_link>${xml(ORIGIN+path)}</g:additional_image_link>`).join('')+'</item>';
 });
 return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>BULLENCIAGA Goods</title><link>'+ORIGIN+'/goods/</link><description>House signatures and the Make It Look Easy music drop.</description>'+items.join('\n')+'</channel></rss>\n';
}
export async function goodsXFeed(request,env,ctx,{fetchImpl=fetch,cache=globalThis.caches?.default}={}){
 const head=request.method==='HEAD';
 const headers={'Content-Type':'application/xml; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','X-Robots-Tag':'noindex'};
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, HEAD'}});
 if(env.GOODS_CHECKOUT_ENABLED!=='1'||!mappings.salesEnabled||!env.GOODS_STOREFRONT_TOKEN)return new Response(null,{status:503,headers});
 const cacheKey=new Request(ORIGIN+GOODS_X_FEED_PATH+'?schema=20261017-v1');
 // A private staging shop must never consume or fill the public feed cache.
 const useCache=new URL(request.url).hostname==='bullenciaga.com'||new URL(request.url).hostname==='www.bullenciaga.com';
 try{
  let cached=useCache?await cache?.match(cacheKey):null;
  if(cached)return new Response(head?null:cached.body,{headers:cached.headers});
  const handler=createGoodsHandler({config:mappings,storefrontToken:env.GOODS_STOREFRONT_TOKEN,fetchImpl,authorize:async()=>true,rateLimit:async()=>true});
  const response=await handler(new Request(ORIGIN+'/goods/api/catalog'));
  if(!response.ok)throw Error('Catalog unavailable');
  const body=buildGoodsXFeed(await response.json());
  const result=new Response(body,{headers:{...headers,'Cache-Control':`public, max-age=${TTL}, must-revalidate`}});
  if(useCache&&cache){const store=cache.put(cacheKey,result.clone()).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(store);else await store;}
  return new Response(head?null:result.body,{headers:result.headers});
 }catch{
  // Do not replace a merchant's imported catalog with empty or guessed data.
  return new Response(head?null:'Catalog temporarily unavailable. Please retry.',{status:503,headers:{...headers,'Content-Type':'text/plain; charset=utf-8','Retry-After':'300'}});
 }
}
