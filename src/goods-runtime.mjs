// Runtime wiring only. D1/Queue/secrets are provisioned by the release owner.
// An incomplete benefits configuration cannot disable the existing Goods shop.
import goodsMappings from './goods-mappings.mjs';
import {createGoodsBenefitsHandler,createFourthwallBenefitsClient,createGoodsChainClient,createGoodsPrintAssetResolver} from './goods-benefits.mjs';

export function goodsBenefitsReady(env) {
 return env.GOODS_BENEFITS_ENABLED === '1'
  && env.GOODS_CHECKOUT_ENABLED === '1' && goodsMappings.salesEnabled === true
  && typeof env.GOODS_DB?.prepare === 'function' && typeof env.GOODS_DB?.batch === 'function'
  && typeof env.GOODS_CUSTOM_QUEUE?.send === 'function'
  && typeof env.CONTROL_AUTH?.fetch === 'function'
  && ['GOODS_PLATFORM_USERNAME','GOODS_PLATFORM_PASSWORD','GOODS_STOREFRONT_TOKEN','GOODS_SHOP_ID'].every(key=>typeof env[key]==='string'&&env[key].length>0)
  && ['GOODS_WEBHOOK_SECRET','GOODS_BENEFIT_METADATA_SECRET'].every(key=>typeof env[key]==='string'&&env[key].length>=24);
}

export function createGoodsRuntime(env,{authorize=async()=>false,rateLimit=async()=>false,fetchImpl=fetch}={}) {
 if(!goodsBenefitsReady(env))return null;
 const provider=createFourthwallBenefitsClient({username:env.GOODS_PLATFORM_USERNAME,password:env.GOODS_PLATFORM_PASSWORD,storefrontToken:env.GOODS_STOREFRONT_TOKEN,checkoutOrigin:goodsMappings.checkoutOrigin,fetchImpl});
 const handler=createGoodsBenefitsHandler({
  db:env.GOODS_DB,provider,chain:createGoodsChainClient({rpcBinding:env.CONTROL_AUTH}),authorize,rateLimit,
  webhookSecret:env.GOODS_WEBHOOK_SECRET,shopId:env.GOODS_SHOP_ID,metadataSecret:env.GOODS_BENEFIT_METADATA_SECRET,
  eligibleProductIds:[...new Set(goodsMappings.variants.filter(v=>v.enabled).map(v=>v.productId))],
  resolvePrintAsset:createGoodsPrintAssetResolver({fetchImpl}),
  enqueueCustom:id=>env.GOODS_CUSTOM_QUEUE.send({id}),
 });
 return {
  handler,
  checkoutBenefit:handler.checkoutBenefit,
  scheduled:()=>handler.reconcile(),
  async queue(batch){
   for(const message of batch.messages){
    const id=message.body?.id;
    if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)){message.ack();continue}
    try{await handler.processCustom(id);message.ack()}
    catch(error){message.retry({delaySeconds:Math.max(60,Math.min(900,Number(error?.retryAfterSeconds)||60))})}
   }
  },
 };
}
