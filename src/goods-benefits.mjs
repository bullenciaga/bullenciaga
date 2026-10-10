/** Holder Goods benefits. Provider IO, chain reads and D1 are deliberately injectable.
 * Official provider contract snapshot: PROJECT/GOODS/HOLDER_CUSTOM_COLLECTION_2026-10-08/research.
 * A completed order here means Fourthwall's paid ORDER_PLACED, reversed on CANCELLED.
 * Shared provider links can race a best-effort sold-out update; attribution still counts
 * every paid order. Never claim provider direct links enforce a hard wallet purchase cap.
 */
import { hwBase58Decode, walletProofPayload } from '../site/wallet-proof-format.mjs';
import { makeSquarePrintCanvas } from './goods-print-canvas.mjs';
const enc = new TextEncoder();
const SESSION_COOKIE = '__Secure-goods_wallet';
const TEMPLATE = 'pro_05kHMsNpQZubKsMrnysvyQ';
export const GOODS_BULLEN_MINT = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
export const GOODS_OFFICIAL_COLLECTIONS = Object.freeze({
 '5GXF7Uug7mZy2pj5XDk4LP9yH7oA5oMQEbCT49ggQnVC': 'The Herd',
 '9ucdkSaiTLUDXmVCjWonxAJqrTH9uyB675BzzRi5vqgM': 'House Objects',
 'FnbDXuPxcy87y451eYimMTDrrPqoFRMVi4ctAu73XVkD': 'Founding Records',
});
const PAID = new Set(['CONFIRMED','PARTIALLY_IN_PRODUCTION','IN_PRODUCTION','PARTIALLY_SHIPPED','SHIPPED','PARTIALLY_DELIVERED','DELIVERED','COMPLETED']);
const BASE = '/goods/api/benefits';
const MAX_ORDERS = 10;
const MAX_SAVED_CUSTOM = 5;
// Bound simultaneous private artwork responses within an isolate.
let thumbnailFlights = 0;
const thumbnailWaiters=[];
async function acquireThumbnail(){
 if(thumbnailFlights<2)thumbnailFlights++;
 else{
  if(thumbnailWaiters.length>=32)fail('IMAGE_BUSY','Please retry this image shortly.',429);
  await new Promise((resolve,reject)=>{const entry={resolve:()=>{clearTimeout(timer);resolve()}};const timer=setTimeout(()=>{const i=thumbnailWaiters.indexOf(entry);if(i>=0)thumbnailWaiters.splice(i,1);reject(new GoodsBenefitError('IMAGE_BUSY','Please retry this image shortly.',429))},30000);thumbnailWaiters.push(entry)});
 }
 return ()=>{const next=thumbnailWaiters.shift();if(next)next.resolve();else thumbnailFlights--};
}
const COOKIE_TTL = 30 * 60 * 1000;
const REQUEST_TTL = 24 * 60 * 60 * 1000;
// Flat custom NFT tee price across every size and colour, independent of
// regular catalogue prices. Derive margin from each live supplier template cost.
const CUSTOM_PRICES = Object.freeze({S:49.99,M:49.99,L:49.99,XL:49.99,'2XL':49.99,'3XL':49.99});
export class GoodsBenefitError extends Error {
 constructor(code, message, status = 400) { super(message); this.code=code; this.status=status; }
}
export class FourthwallRateLimitError extends GoodsBenefitError {
 constructor(retryAfter=60){super('PROVIDER_RATE_LIMIT','The print service is busy. Your saved request will retry shortly.',503);this.retryAfterSeconds=Math.max(60,Math.min(900,Number.isFinite(Number(retryAfter))?Math.ceil(Number(retryAfter)):60));}
}
function providerRetryAfter(value){const seconds=Number(value);return Number.isFinite(seconds)&&seconds>0?seconds:Math.max(0,(Date.parse(value)-Date.now())/1000)||60;}
const fail=(code,message,status)=>{throw new GoodsBenefitError(code,message,status)};
const unavailable=()=>new GoodsBenefitError('UNAVAILABLE','This service is temporarily unavailable. Please try again.',503);
function walletAddress(value) {
 try { if (typeof value !== 'string' || value.length > 44 || hwBase58Decode(value).length !== 32) throw Error(); }
 catch { fail('INVALID_WALLET','Connect a valid Solana wallet.',400); }
 return value;
}
const randomId=()=>crypto.randomUUID();
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const iso=n=>new Date(n).toISOString();
const parseJSON=(s,fallback=null)=>{try{return JSON.parse(s)}catch{return fallback}};
const changes=r=>Number(r?.meta?.changes ?? r?.changes ?? 0);
async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),x=>x.toString(16).padStart(2,'0')).join(''); }
function json(value,status=200,headers={}) {return Response.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff',...headers}});}
async function boundedBytes(request,limit) {
 const length=request.headers.get('content-length');
 if(length!==null && (!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))fail('BAD_BODY','Invalid request size.',400);
 if(Number(length)>limit)fail('TOO_LARGE','Request is too large.',413);
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 let size=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('TOO_LARGE','Request is too large.',413)}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return bytes;
}
async function readBody(request) {
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail('CONTENT_TYPE','Send JSON.',415);
 try {const x=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBytes(request,8192)));if(!x||typeof x!=='object'||Array.isArray(x))throw Error();return x}
 catch(e){if(e instanceof GoodsBenefitError)throw e;fail('BAD_BODY','Invalid request.',400)}
}
function sameOrigin(request) {
 const url=new URL(request.url);
 if(url.protocol!=='https:' || request.headers.get('origin')!==url.origin || ['cross-site','none'].includes(request.headers.get('sec-fetch-site')))fail('FORBIDDEN','Open this action from BULLENCIAGA Goods.',403);
}
async function hmac(secret,value,signature) {
 if(typeof secret!=='string'||secret.length<24)throw unavailable();
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,signature?['verify']:['sign']);
 if(signature){let bytes;try{bytes=Uint8Array.from(atob(signature),c=>c.charCodeAt(0))}catch{return false}if(bytes.length!==32)return false;return crypto.subtle.verify('HMAC',key,bytes,value)}
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,value));return btoa(String.fromCharCode(...bytes));
}
export async function verifyFourthwallWebhook(raw,signature,secret) {return hmac(secret,raw,signature || 'invalid');}
export function holderPercentage(raw,decimals=6) {
 if(!/^\d+$/.test(String(raw)) || !Number.isInteger(decimals) || decimals<0 || decimals>18)throw unavailable();
 const n=BigInt(raw)/(250000n*10n**BigInt(decimals));return Number(n>20n?20n:n);
}
export function officialOwnedAsset(asset,wallet,collections=GOODS_OFFICIAL_COLLECTIONS) {
 const groups=(asset?.grouping||[]).filter(x=>x.group_key==='collection');
 if(!asset || asset.burnt===true || asset.ownership?.owner!==wallet || groups.length!==1 || !Object.hasOwn(collections,groups[0].group_value))return null;
 // A Core asset has its collection in its program-owned account; legacy assets
 // additionally require an explicitly verified collection assertion from DAS.
 if(asset.interface!=='MplCoreAsset' && groups[0].verified!==true)return null;
 try{walletAddress(asset.id)}catch{return null}
 return {mint:asset.id,name:String(asset.content?.metadata?.name||'House NFT').slice(0,120),image:String(asset.content?.links?.image || asset.content?.files?.find(f=>/^image\//.test(f.mime||''))?.uri || ''),collection:collections[groups[0].group_value]};
}
/** The existing RPC service binding forwards POST /rpc uncached. No passport cache. */
export function createGoodsChainClient({rpcBinding,rpcUrl='https://bullenciaga.com/rpc',fetchImpl=fetch,collections=GOODS_OFFICIAL_COLLECTIONS}) {
 async function rpc(method,params){
  if(!['getTokenAccountsByOwner','getAsset','getAssetsByOwner'].includes(method))throw unavailable();
  let response;try{const request=new Request(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),redirect:'manual',signal:AbortSignal.timeout(15000)});response=await(rpcBinding?rpcBinding.fetch(request):fetchImpl(request));if(!response.ok)throw Error();const body=await response.json();if(body.error || !body.result)throw Error();return body.result}catch{throw unavailable()}
 }
 return {
  async balance(wallet){walletAddress(wallet);const x=await rpc('getTokenAccountsByOwner',[wallet,{mint:GOODS_BULLEN_MINT},{encoding:'jsonParsed',commitment:'finalized'}]);if(!Array.isArray(x.value))throw unavailable();let total=0n;for(const account of x.value){const info=account.account?.data?.parsed?.info;if(info?.mint!==GOODS_BULLEN_MINT||info?.owner!==wallet||info.tokenAmount?.decimals!==6||!/^\d+$/.test(String(info.tokenAmount.amount)))throw unavailable();total+=BigInt(info.tokenAmount.amount)}return {raw:String(total),decimals:6,percent:holderPercentage(total,6)}},
  async owned(wallet,mint){walletAddress(wallet);walletAddress(mint);return officialOwnedAsset(await rpc('getAsset',{id:mint}),wallet,collections)},
  async list(wallet){walletAddress(wallet);let items=[];for(let page=1;page<=10;page++){const data=await rpc('getAssetsByOwner',{ownerAddress:wallet,page,limit:1000,displayOptions:{showCollectionMetadata:true}});if(!Array.isArray(data.items))throw unavailable();items.push(...data.items.map(a=>officialOwnedAsset(a,wallet,collections)).filter(Boolean));if(data.items.length<1000)return [...new Map(items.map(a=>[a.mint,a])).values()]}fail('SCAN_LIMIT','This wallet needs a larger ownership scan. Please contact the House.',409)},
 };
}

function firstPreview(images) {
 for(const image of images||[]){const url=typeof image==='string'?image:image.url||image.imageUrl;try{if(new URL(url).protocol==='https:')return url}catch{}}
 return null;
}
function productVariants(product){return product?.variants || [];}
function variantPrice(variant){return Number(variant?.unitPrice?.value ?? variant?.price?.amount)}
function productOpen(product){return ['PUBLIC','HIDDEN'].includes(product?.access?.type) && product?.state?.type==='AVAILABLE';}
function availableStock(stock){return stock?.type==='UNLIMITED' || (stock?.type==='LIMITED' && Number.isInteger(stock.inStock) && stock.inStock>0);}
export function normalizeCustomOptions(template,prices=CUSTOM_PRICES) {
 if(template?.productId!==TEMPLATE || !Array.isArray(template.colorVariants))throw unavailable();
 return {template:'AS Colour Heavy T-shirt',colours:template.colorVariants.filter(c=>c.available===true).map(c=>({name:c.color.name,hex:c.color.hex,sizes:c.sizeVariants.filter(s=>s.available===true&&s.price?.currency==='USD'&&Number.isFinite(Number(s.price.amount))&&Number(s.price.amount)>0&&Number.isFinite(prices[s.size])&&prices[s.size]>Number(s.price.amount)).map(s=>({name:s.size,price:prices[s.size],currency:'USD'}))})).filter(c=>c.sizes.length)};
}

/** All authenticated platform requests are pinned to the documented API origin. */
export function createFourthwallBenefitsClient({username,password,storefrontToken,fetchImpl=fetch,checkoutOrigin='https://store.bullenciaga.com'}) {
 const origin=new URL(checkoutOrigin);if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/')throw new Error('Invalid Goods checkout origin');
 async function call(path,{method='GET',body,storefront=false}={}) {
  if(!path.startsWith('/'))throw unavailable();
  const url=new URL((storefront?'https://storefront-api.fourthwall.com/v1':'https://api.fourthwall.com/open-api/v1.0')+path);
  const headers={'Content-Type':'application/json'};
  if(storefront){if(!storefrontToken)throw unavailable();url.searchParams.set('storefront_token',storefrontToken);url.searchParams.set('currency','USD')}
  else {if(!username||!password)throw unavailable();headers.Authorization='Basic '+btoa(`${username}:${password}`)}
  let response;try{response=await fetchImpl(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(55000)});if(response.status===429)throw new FourthwallRateLimitError(providerRetryAfter(response.headers.get('retry-after')));if(!response.ok)throw Error();return await response.json()}catch(error){if(error instanceof FourthwallRateLimitError)throw error;throw unavailable()}
 }
 return {
  template:()=>call(`/product-templates/${TEMPLATE}`),
  getProduct:id=>call(`/products/${encodeURIComponent(id)}`),
  getStorefrontProduct:id=>call(`/products/${encodeURIComponent(id)}`,{storefront:true}),
  getPromotion:id=>call(`/promotions/${encodeURIComponent(id)}`),
  async findPromotion(code){const x=await call(`/promotions?codes=${encodeURIComponent(code)}&size=100`);return (x.results||x.content||x.data||[]).find(p=>p.code===code)||null},
  createPromotion:({code,percent})=>call('/promotions',{method:'POST',body:{type:'SHOP_SINGLE',code,discount:{type:'PERCENTAGE',percentage:percent,shipping:'Excluded'},limits:{maximumUse:1,oneUsePerCustomer:true}}}),
  setProductAvailable:(id,available)=>call(`/products/${encodeURIComponent(id)}/availability`,{method:'PUT',body:{available}}),
  getOrder:id=>call(`/order/${encodeURIComponent(id)}`),
  listOrders:({since,page=0})=>call(`/order?size=100&page=${page}&updatedAt%5Bgt%5D=${encodeURIComponent(iso(since))}`),
  async uploadImage(asset){
   const bytes=asset.bytes;if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>=50000000||!['image/png','image/jpeg'].includes(asset.contentType))throw unavailable();
   const upload=await call('/media/upload-url',{method:'POST',body:{fileName:`goods-${await hash(asset.source||randomId())}.${asset.contentType==='image/png'?'png':'jpg'}`,contentType:asset.contentType,size:bytes.length}});
   const uploadURL=new URL(upload.uploadUrl);if(uploadURL.protocol!=='https:' || !['storage.googleapis.com','storage.cloud.google.com'].includes(uploadURL.hostname))throw unavailable();
   const result=await fetchImpl(uploadURL,{method:'PUT',headers:{'Content-Type':asset.contentType,'x-goog-content-length-range':`0,${bytes.length}`},body:bytes,redirect:'manual',signal:AbortSignal.timeout(55000)});if(!result.ok)throw unavailable();
   const image=await call('/media/images',{method:'POST',body:{fileUrl:upload.fileUrl,width:asset.width,height:asset.height}});if(!image.id)throw unavailable();return image.id;
  },
  createCustomization:({imageId,colour,size,placementStrategy='PLACEMENT_ID'})=>call('/customizations',{method:'POST',body:{productTemplateId:TEMPLATE,regions:[{region:'front',placementStrategy,...(placementStrategy==='PLACEMENT_ID'?{placementId:'largeCenter'}:{}),imageId}],colors:[colour],sizes:[size]}}),
  createProduct:({customizationId,name,description,profitMargin})=>call('/products',{method:'POST',body:{type:'customization',customizationId,name,description,profitMargin,publishOnCreate:false}}),
  async createCart({variantId,metadata,code}){
   const productCart=await call('/carts',{method:'POST',storefront:true,body:{items:[{variantId,quantity:1}],metadata}});
   if(!productCart.id || !Array.isArray(productCart.items)||productCart.items.length!==1||productCart.items[0].variant?.id!==variantId||productCart.items[0].quantity!==1)throw unavailable();
   const url=new URL('/cart/checkout',origin);url.searchParams.set('cartId',productCart.id);url.searchParams.set('currency','USD');if(code)url.searchParams.set('coupon',code);return {checkoutUrl:url.href,cart:productCart};
  },
 };
}

/** Resolve only the fresh, server-fetched official NFT image, never a client URL. */
export function createGoodsPrintAssetResolver({fetchImpl=fetch,minPixels=1024,allowedHosts=['gateway.irys.xyz','arweave.net','bullenciaga.com','www.bullenciaga.com','bullensaga.com'],resolveMaster}={}) {
 function checkURL(input,from){let url;try{url=new URL(input)}catch{throw unavailable()}
  // Irys now redirects its immutable transaction URL to its content CDN. Only
  // permit this bounded host pattern when the trusted gateway itself directed
  // us there, preserving the exact transaction path; never accept arbitrary CDN URLs.
  const irysRedirect=from?.hostname==='gateway.irys.xyz' && /^[a-z2-7]{52}\.mainnet-1\.datasprite-cdn\.com$/.test(url.hostname) && url.pathname.replace(/\/$/,'')===from.pathname.replace(/\/$/,'') && !url.search;
  if(url.protocol!=='https:' || url.username || url.password || url.port || (!allowedHosts.includes(url.hostname)&&!irysRedirect))fail('ARTWORK_REVIEW','This artwork needs print preparation by the House.',409);return url}
 return async function resolve(asset){
  const master=resolveMaster?await resolveMaster(asset):null;if(master?.imageId)return master;
  let url=checkURL(master?.url||asset.image),response;
  for(let i=0;i<4;i++){response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});if([301,302,303,307,308].includes(response.status)){url=checkURL(new URL(response.headers.get('location'),url).href,url);continue}break}
  if(!response?.ok)throw unavailable();const bytes=await boundedBytes(response,20000000);
  const info=readRasterSize(bytes);if(!info||!['image/png','image/jpeg'].includes(info.contentType))fail('ARTWORK_REVIEW','This image format needs print preparation.',409);
  if(info.width!==info.height || info.width<minPixels || bytes.length<100)fail('ARTWORK_REVIEW','This NFT needs a higher-resolution square print file before a tee can be made.',409);
  if(info.width>2600)fail('ARTWORK_REVIEW','This artwork needs print-file preparation by the House.',409);
  return {...info,bytes,source:url.href};
 };
}
export function readRasterSize(bytes){
 if(bytes.length>=24 && [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return {width:view.getUint32(16),height:view.getUint32(20),contentType:'image/png'};
 }
 if(bytes[0]===255&&bytes[1]===216){for(let i=2;i+9<bytes.length;){if(bytes[i++]!==255)continue;let marker=bytes[i++];while(marker===255)marker=bytes[i++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const length=(bytes[i]<<8)|bytes[i+1];if(length<2||i+length>bytes.length)return null;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {height:(bytes[i+3]<<8)|bytes[i+4],width:(bytes[i+5]<<8)|bytes[i+6],contentType:'image/jpeg'};i+=length}}
 return null;
}

export class GoodsBenefitsStore {
 constructor(db){this.db=db}
 statement(sql,...params){return this.db.prepare(sql).bind(...params)}
 one(sql,...params){return this.statement(sql,...params).first()}
 async all(sql,...params){return (await this.statement(sql,...params).all()).results||[]}
 run(sql,...params){return this.statement(sql,...params).run()}
 challenge(x){return this.run('INSERT INTO goods_wallet_challenges(id,wallet,origin,message,expires_at) VALUES(?,?,?,?,?)',x.id,x.wallet,x.origin,x.message,x.expiresAt)}
 getChallenge(id){return this.one('SELECT * FROM goods_wallet_challenges WHERE id=?',id)}
 async consumeChallenge(id,now){return changes(await this.run('UPDATE goods_wallet_challenges SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?',now,id,now))===1}
 createSession(tokenHash,wallet,expiresAt){return this.run('INSERT INTO goods_wallet_sessions(token_hash,wallet,expires_at) VALUES(?,?,?)',tokenHash,wallet,expiresAt)}
 session(tokenHash,now){return this.one('SELECT * FROM goods_wallet_sessions WHERE token_hash=? AND expires_at>?',tokenHash,now)}
 deleteSession(tokenHash){return this.run('DELETE FROM goods_wallet_sessions WHERE token_hash=?',tokenHash)}
 active(wallet,kind){return this.one('SELECT * FROM goods_benefit_requests WHERE wallet=? AND kind=? AND active=1 ORDER BY created_at,id LIMIT 1',wallet,kind)}
 savedCustom(wallet,now){return this.all("SELECT * FROM goods_benefit_requests WHERE wallet=? AND kind='custom' AND state NOT IN ('discarded','expired','consumed') AND (expires_at>? OR active=1) ORDER BY created_at,id",wallet,now)}
 customChoice(wallet,mint,colour,size){return this.one("SELECT * FROM goods_benefit_requests WHERE wallet=? AND kind='custom' AND active=1 AND discard_requested_at IS NULL AND mint=? AND colour=? AND size=?",wallet,mint,colour,size)}
 async hasPaidCustom(id){return Boolean(await this.one("SELECT 1 AS paid FROM goods_benefit_orders WHERE request_id=? AND kind='custom' AND status<>'CANCELLED' LIMIT 1",id))}
 request(id,wallet){return wallet?this.one('SELECT * FROM goods_benefit_requests WHERE id=? AND wallet=?',id,wallet):this.one('SELECT * FROM goods_benefit_requests WHERE id=?',id)}
 idempotent(wallet,kind,key){return this.one('SELECT * FROM goods_benefit_requests WHERE wallet=? AND kind=? AND idempotency_key=?',wallet,kind,key)}
 async count(wallet,kind){return Number((await this.one("SELECT count(*) AS n FROM goods_benefit_orders WHERE wallet=? AND kind=? AND status<>'CANCELLED'",wallet,kind))?.n||0)}
 async reserve(x){
  // A single atomic conditional insert prevents concurrent new issuance.
  // Restored cancelled codes may coexist; each still reserves one allowance.
  const result=await this.run(`INSERT OR IGNORE INTO goods_benefit_requests
   (id,wallet,kind,idempotency_key,state,created_at,updated_at,expires_at,percent,balance_raw,code,mint,colour,size,name,image_url,price,stage)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE
   (SELECT count(*) FROM goods_benefit_orders WHERE wallet=? AND kind=? AND status<>'CANCELLED')
   +(SELECT count(*) FROM goods_benefit_requests WHERE wallet=? AND kind=? AND active=1) < ?
   AND ((?='discount' AND NOT EXISTS(SELECT 1 FROM goods_benefit_requests WHERE wallet=? AND kind='discount' AND active=1))
    OR (?='custom' AND (SELECT count(*) FROM goods_benefit_requests WHERE wallet=? AND kind='custom'
     AND state NOT IN ('discarded','expired','consumed') AND (expires_at>? OR active=1)) < ?))`,
   x.id,x.wallet,x.kind,x.key,x.state,x.now,x.now,x.expiresAt,x.percent??null,x.balanceRaw??null,x.code??null,x.mint??null,x.colour??null,x.size??null,x.name??null,x.image??null,x.price??null,x.stage??null,x.wallet,x.kind,x.wallet,x.kind,MAX_ORDERS,x.kind,x.wallet,x.kind,x.wallet,x.now,MAX_SAVED_CUSTOM);
  return changes(result)===1;
 }
 async update(id,patch,now){
  const allowed=new Set(['state','active','promotion_id','image_id','customization_id','product_id','variant_id','preview','message','stage','expires_at','print_info','retry_count','next_retry_at','processing','retired_at']);
  for(const key of Object.keys(patch))if(!allowed.has(key))throw new Error('Unsafe request update');
  const fields=Object.keys(patch);return this.run(`UPDATE goods_benefit_requests SET ${fields.map(k=>`${k}=?`).join(',')},updated_at=? WHERE id=?`,...fields.map(k=>patch[k]),now,id);
 }
 async startJob(id,now){return changes(await this.run("UPDATE goods_benefit_requests SET stage='working',processing=1,updated_at=? WHERE id=? AND stage='queued' AND state='preparing' AND active=1 AND processing=0 AND discard_requested_at IS NULL AND next_retry_at<=? AND expires_at>?",now,id,now,now))===1}
 async markDiscard(id,wallet,now){return changes(await this.run(`UPDATE goods_benefit_requests SET
  discard_requested_at=COALESCE(discard_requested_at,?),state='discarding',message='Removing this saved tee. It cannot be checked out while removal is pending.',updated_at=?
  WHERE id=? AND wallet=? AND kind='custom' AND state<>'discarded'
  AND NOT EXISTS(SELECT 1 FROM goods_benefit_orders WHERE request_id=? AND kind='custom' AND status<>'CANCELLED')`,now,now,id,wallet,id))===1}
 readyCustom(id,variant,message,now){return this.run("UPDATE goods_benefit_requests SET state='ready',variant_id=?,stage='ready',next_retry_at=0,message=?,updated_at=? WHERE id=? AND active=1 AND processing=1 AND discard_requested_at IS NULL AND expires_at>?",variant,message,now,id,now)}
 async claimProductWrite(id,now){return changes(await this.run("UPDATE goods_benefit_requests SET stage='product_pending',updated_at=? WHERE id=? AND active=1 AND processing=1 AND discard_requested_at IS NULL AND expires_at>?",now,id,now))===1}
 async recordOrder(order,requests,now){
  const statements=[];const updated=Date.parse(order.updatedAt||order.createdAt);
  if(!Number.isFinite(updated))throw unavailable();
  for(const request of requests){
   statements.push(this.statement(`INSERT INTO goods_benefit_orders(order_id,wallet,kind,request_id,status,provider_updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(order_id,wallet,kind) DO UPDATE SET status=excluded.status,provider_updated_at=excluded.provider_updated_at
    WHERE excluded.provider_updated_at>=goods_benefit_orders.provider_updated_at`,order.id,request.wallet,request.kind,request.id,order.status,updated));
   // Cancellation and reservation restoration are one transaction. A stale
   // callback must not change a newer order or its request's active state.
   const reusable=request.kind==='discount'&&order.status==='CANCELLED'&&request.discountReusable===true;
   statements.push(this.statement(`UPDATE goods_benefit_requests SET active=?,state=?,updated_at=? WHERE id=?
    AND EXISTS(SELECT 1 FROM goods_benefit_orders WHERE order_id=? AND wallet=? AND kind=? AND provider_updated_at=? AND status=?)`,
    reusable?1:0,reusable?'ready':'consumed',now,request.id,order.id,request.wallet,request.kind,updated,order.status));
  }
  if(statements.length)await this.db.batch(statements);
 }
 async orderRequests(order){
  const ids=(order.offers||[]).map(x=>String(x.id||'')).filter(Boolean);
  const found=[];
  if(order.promotionId){const r=await this.one("SELECT * FROM goods_benefit_requests WHERE promotion_id=? AND kind='discount'",String(order.promotionId));if(r)found.push(r)}
  for(const productId of new Set(ids)){const r=await this.one("SELECT * FROM goods_benefit_requests WHERE product_id=? AND kind='custom'",productId);if(r)found.push(r)}
  return found;
 }
 async queueEvent(id,type,orderId,now){return this.run('INSERT OR IGNORE INTO goods_webhook_inbox(event_id,event_type,order_id,received_at) VALUES(?,?,?,?)',id,type,orderId||null,now)}
 async pendingEvents(){return this.all('SELECT * FROM goods_webhook_inbox WHERE processed_at IS NULL ORDER BY received_at LIMIT 50')}
}

export function createGoodsBenefitsHandler({db,store=new GoodsBenefitsStore(db),provider,chain,authorize,rateLimit,webhookSecret,shopId,metadataSecret,eligibleProductIds=[],resolvePrintAsset=createGoodsPrintAssetResolver(),enqueueCustom,customPrices=CUSTOM_PRICES,now=()=>Date.now(),sessionTTL=COOKIE_TTL,requestTTL=REQUEST_TTL}) {
 if(!store||!provider||!chain||typeof authorize!=='function'||typeof rateLimit!=='function')throw new Error('Goods benefits require storage, providers and guards');
 const cookie=(token,maxAge)=>`${SESSION_COOKIE}=${token}; Path=/goods; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
 function assertWritable(){if(typeof metadataSecret!=='string'||metadataSecret.length<24||typeof webhookSecret!=='string'||webhookSecret.length<24||typeof shopId!=='string'||!shopId)throw unavailable()}
 const readToken=request=>{const match=(request.headers.get('cookie')||'').match(/(?:^|;\s*)__Secure-goods_wallet=([0-9a-f]{64})(?:;|$)/);return match?.[1]||null};
 async function session(request,required=true){const token=readToken(request);const value=token?await store.session(await hash(token),now()):null;if(!value&&required)fail('WALLET_REQUIRED','Connect and verify your wallet again.',401);return value}
 async function guard(request){if(!(await authorize(request)))fail('AUTH_REQUIRED','Please unlock the collection again.',401);if(!(await rateLimit(request)))fail('RATE_LIMIT','Please wait a moment and try again.',429);if(request.method!=='GET')sameOrigin(request)}
 async function quotas(wallet){const [discount,custom]=await Promise.all([store.count(wallet,'discount'),store.count(wallet,'custom')]);return {discount:{completedOrders:discount,remainingOrders:Math.max(0,MAX_ORDERS-discount),limit:MAX_ORDERS},custom:{completedOrders:custom,remainingOrders:Math.max(0,MAX_ORDERS-custom),limit:MAX_ORDERS}}}
 async function options(){return {...normalizeCustomOptions(await provider.template(),customPrices),collections:GOODS_OFFICIAL_COLLECTIONS}}
 async function scopeProductIds(){const configured=typeof eligibleProductIds==='function'?await eligibleProductIds():eligibleProductIds;const custom=await store.all("SELECT product_id FROM goods_benefit_requests WHERE kind='custom' AND product_id IS NOT NULL AND active=1");return [...new Set([...configured,...custom.map(x=>x.product_id)])]}
 async function fullPriceIds(ids){
  const valid=[];
  for(let i=0;i<ids.length;i+=5){await Promise.all(ids.slice(i,i+5).map(async id=>{const p=await provider.getProduct(id);if(!productOpen(p)||p.type!=='STANDARD')return;const variants=productVariants(p);if(!variants.length||variants.some(v=>v.unitPrice?.currency!=='USD'||!Number.isFinite(variantPrice(v))))return;const isSale=variants.some(v=>Number(v.compareAtPrice?.value??v.compareAtPrice?.amount)>variantPrice(v));if(!isSale)valid.push(id)}))}
  return valid.sort();
 }
 function publicCustom(r){return {id:r.id,state:r.discard_requested_at&&!['discarded','consumed'].includes(r.state)?'discarding':r.state,name:r.name,mint:r.mint,colour:r.colour,size:r.size,price:r.price,currency:'USD',preview:r.preview||undefined,message:r.message||undefined,printInfo:parseJSON(r.print_info,undefined),expiresAt:iso(r.expires_at)};}
 async function retireCustom(r){
  if(r.processing)return false;
  if(!r.product_id)return r.stage!=='product_pending';
  if(!r.retired_at){
   await provider.setProductAvailable(r.product_id,false);
   const p=await provider.getProduct(r.product_id);if(p?.id!==r.product_id||p.state?.type!=='SOLD_OUT')throw unavailable();
   await store.update(r.id,{retired_at:now()},now());
  }
  return true;
 }
 async function finishDiscard(id,ordersCheckedAt=null){
  let r=await store.request(id);if(!r?.discard_requested_at||r.state==='discarded'||r.state==='consumed')return r;
  if(r.processing)return r;
  if(!await retireCustom(r))return r; // Unknown create outcomes remain reserved for review.
  r=await store.request(id);
  // A product may already have a paid order whose webhook has not arrived.
  // Retire it first, then require an exhaustive provider-order scan before reuse.
  if(r.product_id&&(ordersCheckedAt===null||!r.retired_at||r.retired_at>ordersCheckedAt))return r;
  await store.run(`UPDATE goods_benefit_requests SET state='discarded',active=0,stage='discarded',message='This saved tee has been removed.',updated_at=?
   WHERE id=? AND processing=0 AND discard_requested_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM goods_benefit_orders WHERE request_id=? AND kind='custom' AND status<>'CANCELLED')`,now(),id,id);
  return store.request(id);
 }
 async function discardCustom(request,id,ctx){
  assertWritable();const s=await session(request);let r=await store.request(id,s.wallet);
  if(!r||r.kind!=='custom')fail('NOT_FOUND','Custom request not found.',404);
  if(r.state==='discarded')return publicCustom(r);
  if(await store.hasPaidCustom(id))fail('CUSTOM_PURCHASED','A purchased tee stays in your order history and cannot be discarded.',409);
  if(!await store.markDiscard(id,s.wallet,now()))fail('CUSTOM_PURCHASED','A purchased tee stays in your order history and cannot be discarded.',409);
  try{r=await finishDiscard(id)}catch{r=await store.request(id)}
  if(r.state!=='discarded'&&ctx?.waitUntil)ctx.waitUntil(reconcile().catch(()=>{}));
  return publicCustom(r);
 }
 async function expire(r,allowCustomRelease=false,ordersCheckedAt=null){
  if(!r||r.kind==='discount'||r.expires_at>now())return r;
  {
   // Unlike a promotion there is no provider usage count for a hidden product.
   // Only the scheduled path, after a complete authenticated order scan, may
   // release this slot. Browser requests cannot outrun a delayed paid webhook.
   if(!allowCustomRelease||r.processing||r.discard_requested_at)return r;
   // An ambiguous product-create result must not free an unknown live product.
   if(r.stage==='product_pending'&&!r.product_id)return r;
   if(r.product_id&&(!r.retired_at||ordersCheckedAt===null||r.retired_at>ordersCheckedAt))return r;
  }
  await store.update(r.id,{state:'expired',active:0},now());return null;
 }
 async function active(wallet,kind){
  for(let i=0;i<MAX_ORDERS;i++){
   const r=await store.active(wallet,kind);if(!r)return null;
   if(kind==='discount'&&r.promotion_id){
    const p=await validatePromotion(await provider.getPromotion(r.promotion_id),r);
    // Only a provider-confirmed unused revoked code can release its slot.
    // Used codes stay reserved until the paid order feed is reconciled.
    if(['Ended','Archived'].includes(p.status)&&Number(p.usageCount)===0){await store.update(r.id,{active:0,state:'expired'},now());continue}
   }
   return expire(r);
  }
  throw unavailable();
 }
 async function validatePromotion(p,r){
  if(p?.code!==r.code || p.discount?.type!=='PERCENTAGE' || Number(p.discount.percentage)!==r.percent || p.discount.shippingOption!=='Excluded' || Number(p.limits?.maximumUsesNumber??p.limits?.maximumUse)!==1)throw unavailable();
  if(p.appliesTo?.type!=='ENTIRE_ORDER')throw unavailable();
  if(!p.id)throw unavailable();return p;
 }
 async function finishDiscount(r){
  let p=r.promotion_id?await provider.getPromotion(r.promotion_id):await provider.findPromotion(r.code);
  if(!p){
   const ids=await fullPriceIds(await scopeProductIds());if(!ids.length)fail('NO_ELIGIBLE_PRODUCTS','There are no full-price products available for this code.',409);
   await store.update(r.id,{stage:'promotion_pending'},now());
   // Fourthwall enforces unique codes. Reusing this exact persisted random
   // code is safe after an uncertain response; never generate another code.
   try{p=await provider.createPromotion({code:r.code,percent:r.percent})}
   catch(error){p=await provider.findPromotion(r.code);if(!p)throw error}
  }
  if(!p)fail('PREPARING','Your code is being prepared. Please try again shortly.',503);
  await validatePromotion(p,r);
  if(!['Live','AllUsed'].includes(p.status))fail('CODE_ENDED','This code has ended. Please try again after the order status updates.',409);
  await store.update(r.id,{promotion_id:p.id,state:'ready'},now());
  if(p.status==='AllUsed'||Number(p.usageCount)>0)fail('ORDER_PROCESSING','Your discounted order is being confirmed. Please check back shortly.',409);
  return {code:r.code,percent:r.percent,remainingOrders:Math.max(0,10-await store.count(r.wallet,'discount'))};
 }
 async function issueDiscount(wallet){
  assertWritable();
  const previous=await active(wallet,'discount');if(previous)return finishDiscount(previous);
  const balance=await chain.balance(wallet);const percent=holderPercentage(balance.raw,balance.decimals);if(percent<1)fail('NOT_ELIGIBLE','Hold at least 250,000 BULLEN to request a code.',409);
  const id=randomId(),r={id,wallet,kind:'discount',key:id,state:'issuing',stage:'queued',now:now(),expiresAt:0,percent,balanceRaw:balance.raw,code:'BULLEN-'+randomToken().slice(0,20).toUpperCase()};
  if(!(await store.reserve(r))){const existing=await store.active(wallet,'discount');if(existing)return finishDiscount(existing);fail('LIMIT_REACHED','This wallet has used its 10 discounted orders.',409)}
  return finishDiscount(await store.request(id),true);
 }
 async function processCustom(id){
  assertWritable();
  if(!(await store.startJob(id,now()))){
   let prior=await store.request(id);
   if(prior?.processing&&prior.updated_at<now()-300000){
    // Every provider IO is bounded below one minute. An interrupted worker may
    // leave this flag behind; revoke its ability to claim any later product
    // write. A journaled product_pending outcome is still held for review.
    await store.run("UPDATE goods_benefit_requests SET processing=0,state=CASE WHEN discard_requested_at IS NULL THEN 'review_required' ELSE 'discarding' END,message='The House is checking this interrupted print preparation. Your order allowance has not been used.' WHERE id=? AND processing=1 AND updated_at<?",id,now()-300000);
    prior=await store.request(id);
   }
   if(prior?.discard_requested_at){await finishDiscard(id);return}
   if(prior&&prior.expires_at<=now())return;
   if(prior?.state==='preparing'&&prior.stage==='queued'&&prior.next_retry_at>now())throw new FourthwallRateLimitError((prior.next_retry_at-now())/1000);
   if(prior?.state==='preparing' && prior.updated_at<now()-300000){
    // Unknown write outcomes remain held. Only an explicit rejected429 is retried.
    await store.update(id,{state:'review_required',message:'The House is checking this print preparation. Your order allowance has not been used.'},now());
   }
   return;
  }
  let r=await store.request(id);
  const beforeWrite=async()=>{r=await store.request(id);if(r.discard_requested_at||!r.processing)fail('CUSTOM_DISCARDED','This saved tee is no longer being prepared.',409);if(r.expires_at<=now())fail('REQUEST_EXPIRED','Your saved request has expired. Please prepare a new tee.',409)};
  try{
   const asset=await chain.owned(r.wallet,r.mint);if(!asset)fail('NFT_NOT_OWNED','This NFT is no longer held by the verified wallet.',409);
   const template=await provider.template(),opt=normalizeCustomOptions(template,customPrices),choice=opt.colours.find(c=>c.name===r.colour)?.sizes.find(s=>s.name===r.size);if(!choice||choice.price!==r.price)fail('VARIANT_CHANGED','This colour or size changed. Please choose again.',409);
   const cost=Number(template.colorVariants.find(c=>c.color.name===r.colour)?.sizeVariants.find(s=>s.size===r.size)?.price?.amount);
   const profitMargin=Math.round((r.price-cost)*100)/100;if(!Number.isFinite(profitMargin)||profitMargin<=0)throw unavailable();
   // Retain completed operation IDs on explicit429. Never recreate a product
   // merely because its subsequent GET was rate-limited.
   if(!r.product_id){
    if(!r.customization_id){
     if(!r.image_id){
      let printable=await resolvePrintAsset(asset);
      if(!printable.imageId){try{printable=await makeSquarePrintCanvas(printable,template.customizableAreas?.find(a=>a.regionId==='front')?.dimensions)}catch{fail('ARTWORK_REVIEW','This artwork needs print-file preparation by the House before checkout.',409)}}
      if(printable.printInfo)await store.update(id,{print_info:JSON.stringify(printable.printInfo),message:printable.printMessage},now());
      await beforeWrite();const imageId=printable.imageId||await provider.uploadImage(printable);await store.update(id,{image_id:imageId,stage:'customization_pending'},now());r=await store.request(id);
     }
     await beforeWrite();const design=await provider.createCustomization({imageId:r.image_id,colour:r.colour,size:r.size,placementStrategy:r.print_info?'FULL_REGION':'PLACEMENT_ID'});if(!design.customizationId||!firstPreview(design.images))throw unavailable();
     await store.update(id,{customization_id:design.customizationId,preview:firstPreview(design.images),stage:'customized'},now());r=await store.request(id);
    }
    const printInfo=parseJSON(r.print_info),name=`${asset.name} — Custom Heavy Tee [${id.slice(0,8)}]`;
    const sizeCopy=printInfo?` Square front print: approximately ${printInfo.widthCm} × ${printInfo.widthCm} cm.`:' Square front artwork.';
    await beforeWrite();if(!await store.claimProductWrite(id,now()))fail('CUSTOM_DISCARDED','This saved tee is no longer being prepared.',409);
    const result=await provider.createProduct({customizationId:r.customization_id,name,description:'Your official BULLENCIAGA artwork, printed on a premium AS Colour 5080 heavyweight cotton tee.'+sizeCopy+' Made to order.',profitMargin});
    if(!result.productId)throw unavailable();await store.update(id,{product_id:result.productId,preview:firstPreview(result.images)||r.preview,stage:'product_created'},now());r=await store.request(id);
   }
   await beforeWrite();const product=await provider.getProduct(r.product_id);
   const variant=productVariants(product).find(v=>v.attributes?.color?.name===r.colour&&v.attributes?.size?.name===r.size);
   if(product.access?.type!=='HIDDEN'||!productOpen(product)||!variant || variant.unitPrice?.currency!=='USD'||Math.abs(variantPrice(variant)-r.price)>0.001||!availableStock(variant.stock))throw unavailable();
   const info=parseJSON(r.print_info),message=info?`Square front print: approximately ${info.widthCm} × ${info.widthCm} cm. Original ${info.sourcePixels}px artwork at about ${info.dpi} dpi, with the original pixels preserved.${info.lowResolution?' Fine detail may look softer at this size.':''}`:null;
   await store.readyCustom(id,variant.id,message,now());
  }catch(error){
   r=await store.request(id);
   if(r.discard_requested_at){
    // An explicit429 proves that a rejected product write did not create one.
    // Every other uncertain create result remains held, even after discard.
    if(error instanceof FourthwallRateLimitError&&!r.product_id)await store.update(id,{stage:'review'},now());
    return;
   }
   if(error instanceof FourthwallRateLimitError&&Number(r.retry_count)<5){
    await store.update(id,{state:'preparing',stage:'queued',retry_count:Number(r.retry_count)+1,next_retry_at:now()+error.retryAfterSeconds*1000,message:error.message},now());
    throw error;
   }
   const uncertain=Boolean(r.product_id)||(!(error instanceof FourthwallRateLimitError)&&['product_pending','product_created'].includes(r.stage));
   if(r.product_id){try{await provider.setProductAvailable(r.product_id,false)}catch{/* retain reservation until reconciliation */}}
   await store.update(id,{state:'review_required',active:uncertain?1:0,message:error instanceof GoodsBenefitError && error.status<500?error.message:'The House needs to review this print before checkout. Your order allowance has not been used.',stage:uncertain?r.stage:'review'},now());
  }finally{
   await store.update(id,{processing:0},now());
   if((await store.request(id))?.discard_requested_at)await finishDiscard(id);
  }
 }
 async function requestCustom(wallet,body,ctx){
  assertWritable();
  const {mint,colour,size,idempotencyKey}=body;
  if(typeof idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(idempotencyKey))fail('INVALID_REQUEST','Please restart this custom request.',400);
  walletAddress(mint);
  const previous=await store.idempotent(wallet,'custom',idempotencyKey);if(previous){if(previous.mint!==mint||previous.colour!==colour||previous.size!==size)fail('REQUEST_CONFLICT','That request identifier has already been used.',409);return publicCustom(previous)}
  const outstanding=await store.customChoice(wallet,mint,colour,size);if(outstanding&&outstanding.expires_at>now())return publicCustom(outstanding);
  const asset=await chain.owned(wallet,mint);if(!asset)fail('NFT_NOT_OWNED','Choose an official BULLENCIAGA NFT held in this wallet.',403);
  const opt=await options(),choice=opt.colours.find(c=>c.name===colour)?.sizes.find(s=>s.name===size);if(!choice)fail('VARIANT_UNAVAILABLE','Choose an available colour and size.',409);
  const id=randomId();
  if(!(await store.reserve({id,wallet,kind:'custom',key:idempotencyKey,state:'preparing',stage:'queued',now:now(),expiresAt:now()+requestTTL,mint,colour,size,name:asset.name,image:asset.image,price:choice.price}))){
   const duplicate=await store.customChoice(wallet,mint,colour,size);if(duplicate&&duplicate.expires_at>now())return publicCustom(duplicate);
   if((await store.savedCustom(wallet,now())).length>=MAX_SAVED_CUSTOM)fail('SAVED_LIMIT','You can save up to five custom tees. Discard one before preparing another.',409);
   fail('LIMIT_REACHED','This wallet has reached its 10 custom-order allowance or has outstanding purchase reservations.',409);
  }
  if(enqueueCustom)await enqueueCustom(id);
  else if(ctx?.waitUntil)ctx.waitUntil(processCustom(id));
  else await processCustom(id);
  return publicCustom(await store.request(id));
 }
 async function checkoutBenefit(request,{holderDiscount=false,productIds=[]}={}){
  if(!holderDiscount)return {metadata:{source:'bullenciaga_goods'}};
  assertWritable();
  await guard(request);const s=await session(request);const r=await active(s.wallet,'discount');if(!r||r.state!=='ready')fail('CODE_REQUIRED','Request your holder code before applying it.',409);
  const allowed=new Set(await scopeProductIds());if(!productIds.length||productIds.some(id=>!allowed.has(id)))fail('DISCOUNT_SCOPE','This cart is not eligible for the holder code.',409);
  const full=await fullPriceIds(productIds);if(full.length!==new Set(productIds).size)fail('DISCOUNT_SCOPE','Holder codes apply to full-price goods only.',409);
  const p=await validatePromotion(await provider.getPromotion(r.promotion_id),r);if(p.status!=='Live'||Number(p.usageCount)>0)fail('CODE_USED','This code has already been used or has ended.',409);
  // Whole-shop one-use scope covers a newly generated custom product without
  // the provider's unreliable promotion-update API. Native sale guards stay above.
  const mac=await hmac(metadataSecret,enc.encode(r.id));return {code:r.code,metadata:{source:'bullenciaga_goods',benefit_request:r.id,benefit_mac:mac}};
 }
 async function customCheckout(request,id,body){
  assertWritable();
  const s=await session(request),r=await store.request(id,s.wallet);if(!r||r.state!=='ready'||!r.active||r.discard_requested_at||r.expires_at<=now())fail('CUSTOM_NOT_READY','This custom tee is not available for checkout.',409);
  if(await store.count(s.wallet,'custom')>=MAX_ORDERS)fail('LIMIT_REACHED','This wallet has used its 10 custom orders.',409);
  // Ownership at request time is the entitlement. Sharing the link afterward is
  // explicitly allowed; do not require the recipient to own the NFT at payment.
  const product=await provider.getProduct(r.product_id),variant=productVariants(product).find(v=>v.id===r.variant_id);
  if(!productOpen(product)||!variant||!availableStock(variant.stock)||variant.unitPrice?.currency!=='USD'||Math.abs(variantPrice(variant)-r.price)>0.001)fail('VARIANT_CHANGED','This tee is not available at the shown price. Please refresh.',409);
  const benefit=await checkoutBenefit(request,{holderDiscount:body.holderDiscount===true,productIds:[r.product_id]});
  const metadata={...benefit.metadata,custom_request:r.id,custom_mac:await hmac(metadataSecret,enc.encode(r.id))};
  const stillReady=async()=>{const current=await store.request(id,s.wallet);if(!current||current.discard_requested_at||!current.active||current.state!=='ready'||current.expires_at<=now())fail('CUSTOM_NOT_READY','This custom tee is not available for checkout.',409)};
  await stillReady();
  const result=await provider.createCart({variantId:r.variant_id,metadata,code:benefit.code});
  const cartVariant=result.cart?.items?.[0]?.variant;if(!cartVariant||cartVariant.unitPrice?.currency!=='USD'||Math.abs(variantPrice(cartVariant)-r.price)>0.001)throw unavailable();
  await stillReady();return {checkoutUrl:result.checkoutUrl};
 }
 async function reconcileOrder(orderId){
  const order=await provider.getOrder(orderId);if(order?.id!==orderId||(!PAID.has(order.status)&&order.status!=='CANCELLED'))return;
  const requests=await store.orderRequests(order);if(!requests.length)return;
  // Query provider code state before freeing any cancelled order allowance.
  // If a cancellation restores its use, reuse the original code and reserve it.
  for(const r of requests)if(r.kind==='discount'&&order.status==='CANCELLED'){
   const p=await validatePromotion(await provider.getPromotion(r.promotion_id),r);
   if(!['Live','AllUsed','Ended','Archived'].includes(p.status)||!Number.isFinite(Number(p.usageCount)))throw unavailable();
   r.discountReusable=p.status==='Live'&&Number(p.usageCount)===0;
  }
  await store.recordOrder(order,requests,now());
  for(const r of requests)if(r.kind==='custom'&&r.product_id)await provider.setProductAvailable(r.product_id,false);
 }
 async function drainEvents(){
  for(const event of await store.pendingEvents()){
   try{if(event.order_id)await reconcileOrder(event.order_id);await store.run('UPDATE goods_webhook_inbox SET processed_at=?,attempts=attempts+1 WHERE event_id=?',now(),event.event_id)}
   catch{await store.run('UPDATE goods_webhook_inbox SET attempts=attempts+1 WHERE event_id=?',event.event_id)}
  }
 }
 async function webhook(request,ctx){
  if(request.method!=='POST')return json({error:{code:'METHOD',message:'Use POST.'}},405);
  const raw=await boundedBytes(request,262144);
  if(!(await verifyFourthwallWebhook(raw,request.headers.get('X-Fourthwall-Hmac-SHA256'),webhookSecret)))fail('BAD_SIGNATURE','Invalid webhook signature.',401);
  let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{fail('BAD_EVENT','Invalid event.',400)}
  if(!shopId || event.shopId!==shopId)fail('SHOP_MISMATCH','Invalid shop.',403);
  if(event.testMode===true)return json({ok:true,ignored:'test'});
  if(typeof event.id!=='string'||event.id.length>200)fail('BAD_EVENT','Invalid event.',400);
  if(!['ORDER_PLACED','ORDER_UPDATED'].includes(event.type))return json({ok:true,ignored:'type'});
  const order=event.type==='ORDER_UPDATED'?event.data?.order:event.data;if(typeof order?.id!=='string'||order.id.length>200)fail('BAD_EVENT','Missing order.',400);
  await store.queueEvent(event.id,event.type,order.id,now());
  if(ctx?.waitUntil)ctx.waitUntil(drainEvents()); // Durable inbox survives short provider retry windows.
  return json({ok:true});
 }
 async function reconcile(){
  assertWritable();
  await drainEvents();
  // Stop sales before the authoritative order scan. An order already paid
  // without a delivered webhook must count before a discarded slot is reused.
  const closing=await store.all("SELECT * FROM goods_benefit_requests WHERE kind='custom' AND state NOT IN ('discarded','consumed') AND (discard_requested_at IS NOT NULL OR (active=1 AND expires_at<=?)) LIMIT 100",now());
  for(const r of closing){try{await retireCustom(r)}catch{/* retry closure on the next reconciliation */}}
  const saved=await store.one("SELECT value FROM goods_reconcile_state WHERE key='orders_since'");
  const until=now(),since=saved?Math.max(0,Number(saved.value)-300000):now()-7*86400000;
  let exhausted=false;
  for(let page=0;page<20;page++){
   const result=await provider.listOrders({since,page});const orders=result.results||result.content||result.data;if(!Array.isArray(orders))throw unavailable();
   for(const order of orders)await reconcileOrder(order.id);
   if(orders.length<100){exhausted=true;break}
  }
  if(exhausted)await store.run("INSERT INTO goods_reconcile_state(key,value) VALUES('orders_since',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(until));
  // Do not release expired slots unless this complete provider scan succeeded.
  if(exhausted){
   for(const r of await store.all("SELECT id FROM goods_benefit_requests WHERE kind='custom' AND discard_requested_at IS NOT NULL AND state NOT IN ('discarded','consumed') LIMIT 100")){try{await finishDiscard(r.id,until)}catch{}}
   for(const r of await store.all("SELECT * FROM goods_benefit_requests WHERE active=1 AND kind='custom' AND expires_at<=? LIMIT 100",now())){try{await expire(r,true,until)}catch{}}
  }
  if(enqueueCustom)for(const r of await store.all("SELECT id FROM goods_benefit_requests WHERE active=1 AND state='preparing' AND stage='queued' AND next_retry_at<=? LIMIT 10",now()))await enqueueCustom(r.id);
  for(const r of await store.all("SELECT id FROM goods_benefit_requests WHERE active=1 AND (processing=1 OR (state='preparing' AND stage<>'queued')) AND updated_at<? LIMIT 10",now()-300000))await processCustom(r.id);
  await store.run('DELETE FROM goods_wallet_challenges WHERE expires_at<?',now()-86400000);
  await store.run('DELETE FROM goods_wallet_sessions WHERE expires_at<?',now());
 }
 async function handler(request,ctx){
  const path=new URL(request.url).pathname;
  if(path!=='/goods/api/webhook' && path!==BASE && !path.startsWith(BASE+'/'))return null;
  try{
   if(path==='/goods/api/webhook')return await webhook(request,ctx);
   await guard(request);
   const action=path.slice(BASE.length),method=request.method;
   if(action==='/challenge'&&method==='POST'){
    const body=await readBody(request),wallet=walletAddress(body.wallet),id=randomId(),expiresAt=now()+300000,origin=new URL(request.url).origin;
    const message=`BULLENCIAGA Goods wallet verification\nDomain: ${new URL(origin).host}\nWallet: ${wallet}\nNonce: ${randomToken()}\nExpires: ${iso(expiresAt)}\n\nSign to verify ownership for holder discounts and personal NFT tees. This does not authorize payments or asset transfers.`;
    await store.challenge({id,wallet,origin,message,expiresAt});return json({challengeId:id,message,expiresAt:iso(expiresAt)});
   }
   if(action==='/verify'&&method==='POST'){
    const body=await readBody(request),c=typeof body.challengeId==='string'?await store.getChallenge(body.challengeId):null;
    if(!c||c.used_at||c.expires_at<=now()||c.origin!==new URL(request.url).origin)fail('CHALLENGE_EXPIRED','Please request a fresh wallet signature.',401);
    let valid=false;try{const p=walletProofPayload(c.wallet,body.proof,c.message,now());const key=await crypto.subtle.importKey('raw',hwBase58Decode(c.wallet),'Ed25519',false,['verify']);valid=await crypto.subtle.verify('Ed25519',key,p.signature,p.message)}catch{}
    if(!valid)fail('BAD_PROOF','The wallet signature did not match.',401);
    if(!(await store.consumeChallenge(c.id,now())))fail('PROOF_USED','This signature has already been used.',401);
    const token=randomToken(),expiresAt=now()+sessionTTL;await store.createSession(await hash(token),c.wallet,expiresAt);return json({wallet:c.wallet,expiresAt:iso(expiresAt)},200,{'Set-Cookie':cookie(token,Math.floor(sessionTTL/1000))});
   }
   if(action==='/logout'&&method==='POST'){await readBody(request);const token=readToken(request);if(token)await store.deleteSession(await hash(token));return json({ok:true},200,{'Set-Cookie':cookie('',0)})}
   if(action==='/status'&&method==='GET'){
    const s=await session(request,false),opt=await options();if(!s)return json({authenticated:false,options:opt,discount:{limit:10},custom:{limit:10,maxSaved:MAX_SAVED_CUSTOM,savedRequests:[]}});
    const [q,balance,r,custom]=await Promise.all([quotas(s.wallet),chain.balance(s.wallet),active(s.wallet,'discount'),store.savedCustom(s.wallet,now())]);
    const eligiblePercent=holderPercentage(balance.raw,balance.decimals);
    return json({authenticated:true,wallet:s.wallet,...q,discount:{...q.discount,percent:r?.state==='ready'?r.percent:eligiblePercent,eligiblePercent,balance:Number(balance.raw)/10**balance.decimals,...(r?.state==='ready'?{activeCode:r.code}:{})},custom:{...q.custom,maxSaved:MAX_SAVED_CUSTOM,savedRequests:custom.map(publicCustom),...(custom[0]?{activeRequest:publicCustom(custom[0])}:{})},options:opt});
   }
   const s=await session(request);
   if(action==='/discount'&&method==='POST'){await readBody(request);return json(await issueDiscount(s.wallet))}
   if(action==='/nfts'&&method==='GET')return json({items:(await chain.list(s.wallet)).map(a=>({...a,image:`${BASE}/nft-image/${encodeURIComponent(a.mint)}`}))});
   const imageMatch=/^\/nft-image\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(action);
   if(imageMatch&&method==='GET'){
    const releaseThumbnail=await acquireThumbnail();
    try{
     const asset=await chain.owned(s.wallet,walletAddress(imageMatch[1]));if(!asset)fail('NOT_OWNED','This official NFT is not in your connected wallet.',403);
     const image=await resolvePrintAsset(asset);
     if(!(image.bytes instanceof Uint8Array)||image.bytes.length>20000000||!['image/png','image/jpeg'].includes(image.contentType))throw unavailable();
     return new Response(image.bytes,{headers:{'Content-Type':image.contentType,'Content-Length':String(image.bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
    }finally{releaseThumbnail()}
   }
   if(action==='/custom'&&method==='POST')return json(await requestCustom(s.wallet,await readBody(request),ctx),202);
   const match=/^\/custom\/([a-zA-Z0-9_-]+)(\/checkout|\/discard)?$/.exec(action);
   if(match&&!match[2]&&method==='GET'){const r=await store.request(match[1],s.wallet);if(!r)fail('NOT_FOUND','Custom request not found.',404);return json(publicCustom(r))}
   if(match?.[2]==='/discard'&&method==='POST'){await readBody(request);const result=await discardCustom(request,match[1],ctx);return json(result,result.state==='discarding'?202:200)}
   if(match?.[2]==='/checkout'&&method==='POST')return json(await customCheckout(request,match[1],await readBody(request)));
   return json({error:{code:'NOT_FOUND',message:'Not found.'}},404);
  }catch(error){const e=error instanceof GoodsBenefitError?error:unavailable();return json({error:{code:e.code,message:e.message}},e.status)}
 }
 handler.checkoutBenefit=checkoutBenefit;
 handler.reconcile=reconcile;
 handler.reconcileOrder=reconcileOrder;
 handler.drainEvents=drainEvents;
 handler.processCustom=processCustom;
 return handler;
}
