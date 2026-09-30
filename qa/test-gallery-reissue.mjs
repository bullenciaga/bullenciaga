import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const name='HERD #254',owner='dev';
const asset=(id,burnt)=>({id,burnt,content:{metadata:{name}},ownership:{owner}});
let assets=[asset('burned-original',true)],fail=false;
const c=vm.createContext({console,Set,Map,galleryManifest:[{name}],NFT_CONFIG:{COLLECTION_ADDRESS:'herd',HELIUS_PROXY_URL:'/rpc',TENSOR_URL:'https://tensor.trade',MAGIC_EDEN_URL:'https://magiceden.io'},mintedNames:new Set(),burnedGalleryNames:new Set(),mintedAssetIdByName:new Map([[name,'stale']]),mintedOwnerByName:new Map([[name,'stale-owner']]),fetch:async()=>({ok:true,json:async()=>fail?{error:{message:'offline'}}:{result:{items:assets}}}),refreshPublicMintCount:async()=>{},renderMintProgress:()=>{},loadGalleryManifest:async()=>{},isCompanionRecord:()=>false,isMineByAddress:(_id,o)=>o===owner,specialTierOf:()=>null,houseStatusLine:()=>null,holdStatusLine:()=>null,TRADING_ENABLED:false,listingFor:()=>null,MARKET_ICON_TENSOR:'t',MARKET_ICON_MAGICEDEN:'m',TRADE_MIN_SOL:0.01,listingsFloor:null,fmtSol:n=>String(n)});
vm.runInContext(section('  async function refreshMintedState()', '  // Single unified fetch'),c);
// Extract just the card function, up to the next declaration at this indentation.
const card=html.slice(html.indexOf('  function buildLightboxCardHtml('));
const end=card.indexOf('\n  }')+4;vm.runInContext(card.slice(0,end),c);
const refresh=()=>vm.runInContext('refreshMintedState()',c);
const markup=()=>vm.runInContext('buildLightboxCardHtml({name:"HERD #254",attributes:[]})',c);
await refresh();assert(c.mintedNames.has(name));assert(c.burnedGalleryNames.has(name));assert(!c.mintedAssetIdByName.has(name));assert(!c.mintedOwnerByName.has(name));
let page=markup();assert.match(page,/>Burned</);assert.doesNotMatch(page,/Mint For A Chance|Send This Piece|Owned by you|>Available</);
for(const rows of [[asset('replacement',false),asset('burned-original',true)],[asset('burned-original',true),asset('replacement',false)]]){
 assets=rows;await refresh();assert.equal(c.mintedNames.size,1);assert.equal(c.mintedAssetIdByName.get(name),'replacement');assert.equal(c.mintedOwnerByName.get(name),owner);assert(!c.burnedGalleryNames.has(name));
 page=markup();assert.match(page,/>Owned by you</);assert.match(page,/item-details\/replacement/);assert.doesNotMatch(page,/burned-original|Mint For A Chance/);
}
fail=true;await refresh();assert.equal(c.mintedAssetIdByName.get(name),'replacement','failed read preserves last verified ownership');
console.log('Gallery reissue: original slot stays used; burned status, replacement address, owner and ordering verified');
