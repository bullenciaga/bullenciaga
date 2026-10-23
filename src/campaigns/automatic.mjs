import { fail, instagramShortcode, periodFor } from './model.mjs';
import { providerJSON, capabilities } from './providers.mjs';

export async function verifyTelegramMembership(action,identity,env,fetcher=fetch){
  if(!capabilities(env).telegram.configured)fail('NOT_CONFIGURED','Telegram membership checks need the campaign bot and Telegram login connection.',503);
  if(identity?.provider!=='telegram')fail('CONNECT_ACCOUNT','Connect your Telegram account first.',401);
  const token=env.CAMPAIGNS_TELEGRAM_BOT_TOKEN,bot=token.split(':')[0];
  const member=async subject=>{
    if(!Number.isSafeInteger(Number(subject)))fail('INCOMPLETE_CHECK','Telegram did not provide a valid account identity.',503);
    const result=await providerJSON(`https://api.telegram.org/bot${token}/getChatMember`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:action.targetId,user_id:Number(subject)})},fetcher);
    if(!result.ok||String(result.result?.user?.id)!==subject)fail('INCOMPLETE_CHECK','Telegram could not confirm this member. No points were awarded.',503);
    return result.result;
  };
  const admin=await member(bot);
  if(!['creator','administrator'].includes(admin.status))fail('BOT_ADMIN_REQUIRED','The campaign bot must be an administrator of this group or channel before it can verify members.',503);
  const result=await member(identity.subject);
  return {verified:['creator','administrator','member'].includes(result.status)||(result.status==='restricted'&&result.is_member===true),proof:{method:'telegram-membership',subject:identity.subject,targetId:action.targetId,checkedAt:Date.now()}};
}

function instagramAPI(env){
  if(!capabilities(env).instagram.configured)fail('NOT_CONFIGURED','Instagram comment verification needs a connected professional account with comment access.',503);
  const version=env.CAMPAIGNS_INSTAGRAM_GRAPH_VERSION||'v25.0';
  if(!/^v\d{2}\.0$/.test(version))fail('NOT_CONFIGURED','Check the Instagram API version in the campaign configuration.',503);
  const login=env.CAMPAIGNS_INSTAGRAM_LOGIN||'facebook';
  if(!['facebook','instagram'].includes(login))fail('NOT_CONFIGURED','Choose Facebook Login or Instagram Login for the campaign connection.',503);
  return `https://graph.${login}.com/${version}`;
}
export async function verifyInstagramComment(action,challenge,campaign,env,fetcher=fetch,now=Date.now()){
  const base=instagramAPI(env),headers={Authorization:`Bearer ${env.CAMPAIGNS_INSTAGRAM_ACCESS_TOKEN}`};
  const read=async (path,fields,after)=>{
    const url=new URL(base+'/'+path);url.searchParams.set('fields',fields);if(path.endsWith('/comments'))url.searchParams.set('limit','100');if(after)url.searchParams.set('after',after);
    const result=await providerJSON(url.href,{headers},fetcher);
    if(result.error)fail('PROVIDER_ACCESS','Instagram has not granted a complete comment check. No points were awarded.',503);
    return result;
  };
  // The supplied post must belong to the configured House account. Never fetch
  // an entrant's URL or a provider-supplied pagination URL.
  const media=await read(action.targetId,'id,owner,permalink');
  if(media.id!==action.targetId||String(media.owner?.id)!==env.CAMPAIGNS_INSTAGRAM_ACCOUNT_ID||instagramShortcode(media.permalink)!==instagramShortcode(action.target))fail('INVALID_MEDIA','This post does not match the connected Instagram account and target link.',409);
  let after;
  for(let page=0;page<5;page++){
    const result=await read(action.targetId+'/comments','id,text,from,timestamp,hidden',after);
    if(!Array.isArray(result.data))fail('INCOMPLETE_CHECK','Instagram did not return a complete comment list.',503);
    for(const comment of result.data){
      const created=Date.parse(comment.timestamp),from=comment.from;
      if(!String(comment.text||'').split(/\s+/).includes(challenge.code)||String(from?.username||'').toLowerCase()!==challenge.username||comment.hidden===true)continue;
      if(!/^\d{1,25}$/.test(String(comment.id))||!/^\d{1,25}$/.test(String(from?.id))||!Number.isFinite(created)||created<challenge.createdAt||created>now+30000||created<Date.parse(campaign.startsAt)||created>=Date.parse(campaign.endsAt)||(action.frequency==='daily'&&periodFor(action,campaign,created)!==periodFor(action,campaign,now)))continue;
      return {verified:true,key:'instagram:'+comment.id,identity:{subject:String(from.id),label:from.username},proof:{method:'instagram-comment-code',commentId:String(comment.id),targetId:action.targetId,subject:String(from.id),checkedAt:now}};
    }
    if(!result.paging?.next)return {verified:false};
    after=result.paging?.cursors?.after;
    if(typeof after!=='string'||after.length>2000)fail('INCOMPLETE_CHECK','Instagram returned an incomplete comment list. Try again later.',503);
  }
  fail('INCOMPLETE_CHECK','This post needs a larger comment check. Contact the organizer; no points were awarded.',503);
}
