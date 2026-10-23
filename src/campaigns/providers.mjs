import { fail, encode, b64, unb64, sha, periodFor } from './model.mjs';

export const PROVIDERS = {
  x: { authorize: 'https://x.com/i/oauth2/authorize', token: 'https://api.x.com/2/oauth2/token', me: 'https://api.x.com/2/users/me', scopes: 'tweet.read users.read follows.read like.read offline.access', id: 'CAMPAIGNS_X_CLIENT_ID', secret: 'CAMPAIGNS_X_CLIENT_SECRET' },
  discord: { authorize: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token', me: 'https://discord.com/api/v10/users/@me', scopes: 'identify guilds.members.read', id: 'CAMPAIGNS_DISCORD_CLIENT_ID', secret: 'CAMPAIGNS_DISCORD_CLIENT_SECRET' },
  telegram: { authorize: 'https://oauth.telegram.org/auth', token: 'https://oauth.telegram.org/token', scopes: 'openid profile', id: 'CAMPAIGNS_TELEGRAM_CLIENT_ID', secret: 'CAMPAIGNS_TELEGRAM_CLIENT_SECRET' },
};
export function capabilities(env) {
  const result=Object.fromEntries(Object.entries(PROVIDERS).map(([name,p])=>{const oauth=!!(env[p.id] && env[p.secret] && env.CAMPAIGNS_TOKEN_KEY),publicProof=name==='x'&&!!env.CAMPAIGNS_X_BEARER;return [name,{configured:oauth||publicProof,oauth,publicProof,callback:`${env.CAMPAIGNS_ORIGIN}/campaigns/api/oauth/${name}/callback`}];}));
  result.telegram.configured=result.telegram.oauth && /^\d+:[\w-]+$/.test(env.CAMPAIGNS_TELEGRAM_BOT_TOKEN||'');
  result.instagram={configured:!!(env.CAMPAIGNS_INSTAGRAM_ACCESS_TOKEN && /^\d{1,25}$/.test(env.CAMPAIGNS_INSTAGRAM_ACCOUNT_ID||'')),method:'comment-code'};
  return result;
}
async function encryptionKey(env) {
  if (!env.CAMPAIGNS_TOKEN_KEY || env.CAMPAIGNS_TOKEN_KEY.length < 32) fail('CONNECTION_UNAVAILABLE','Social connections have not been configured yet.',503);
  return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encode.encode(env.CAMPAIGNS_TOKEN_KEY)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function seal(value, env, context) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode.encode(context)},await encryptionKey(env),encode.encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}
export async function unseal(value, env, context) {
  try { const [iv,cipher]=value.split('.'); const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encode.encode(context)},await encryptionKey(env),unb64(cipher));return JSON.parse(new TextDecoder().decode(clear)); }
  catch { fail('RECONNECT','Reconnect your social account before checking this action.',401); }
}
// Fixed provider URLs only. Entrant URLs are parsed as IDs, never fetched.
export async function providerJSON(url, options={}, fetcher=fetch) {
  let response;
  try { response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)}); }
  catch { fail('PROVIDER_UNAVAILABLE','The platform did not respond. No points were changed; try again later.',503); }
  if(response.status===401) fail('RECONNECT','Reconnect your social account to continue.',401);
  if(response.status===429) fail('PROVIDER_LIMIT','The platform is limiting checks. No points were changed; try again later.',429);
  if(response.status===403 || response.status===402) fail('PROVIDER_ACCESS','The platform has not granted access to this check. No points were awarded.',503);
  if(!response.ok) fail('PROVIDER_UNAVAILABLE','This platform check could not be completed. Try again later.',503);
  const reader=response.body.getReader();let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();fail('PROVIDER_UNAVAILABLE','The platform response was too large to verify safely.',503);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('PROVIDER_UNAVAILABLE','The platform returned an unreadable response.',503);}
}
export async function exchange(provider, code, verifier, callback, env, fetcher=fetch, nonce=null) {
  const p=PROVIDERS[provider];
  const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callback,client_id:env[p.id]});
  if(provider==='x'||provider==='telegram')body.set('code_verifier',verifier);else body.set('client_secret',env[p.secret]);
  const headers={'Content-Type':'application/x-www-form-urlencoded'};
  if(provider==='x'||provider==='telegram')headers.Authorization='Basic '+btoa(`${env[p.id]}:${env[p.secret]}`);
  const data=await providerJSON(p.token,{method:'POST',headers,body},fetcher);
  if(provider==='telegram')return verifyTelegramToken(data.id_token,env,nonce,fetcher);
  if(typeof data.access_token!=='string')fail('OAUTH_FAILED','The platform did not complete sign-in.',401);
  const profile=await providerJSON(p.me,{headers:{Authorization:`Bearer ${data.access_token}`}},fetcher);
  const user=provider==='x'?profile.data:profile;
  if(!user?.id || !/^\d{1,25}$/.test(user.id))fail('OAUTH_FAILED','Could not identify your social account.',401);
  return {subject:user.id, label:user.username || user.name || provider, tokens:{access:data.access_token, refresh:data.refresh_token || null, expiresAt:Date.now()+(Number(data.expires_in)||3600)*1000}};
}
// OIDC identity is accepted only after Telegram's signature, audience, issuer,
// expiry and our one-use nonce all verify. No phone number or bot messaging scope.
export async function verifyTelegramToken(token,env,nonce,fetcher=fetch,now=Date.now()){
  const reject=()=>fail('OAUTH_FAILED','Telegram could not verify this sign-in. Reconnect from the campaign.',401);
  if(typeof token!=='string'||token.length>20000||!nonce)return reject();
  const parts=token.split('.');let head,claims;
  try{if(parts.length!==3)return reject();head=JSON.parse(new TextDecoder().decode(unb64(parts[0])));claims=JSON.parse(new TextDecoder().decode(unb64(parts[1])));}catch{return reject();}
  if(head.alg!=='RS256'||typeof head.kid!=='string'||head.kid.length>200)return reject();
  const seconds=Math.floor(now/1000);
  if(claims.iss!=='https://oauth.telegram.org'||String(claims.aud)!==String(env.CAMPAIGNS_TELEGRAM_CLIENT_ID)||Array.isArray(claims.aud)||claims.nonce!==nonce||!Number.isInteger(claims.exp)||claims.exp<=seconds||!Number.isInteger(claims.iat)||claims.iat>seconds+30||claims.iat<seconds-600||claims.exp-claims.iat>7200||!Number.isSafeInteger(claims.id)||claims.id<=0||!claims.sub)return reject();
  const jwks=await providerJSON('https://oauth.telegram.org/.well-known/jwks.json',{},fetcher);
  const jwk=jwks.keys?.find(k=>k.kid===head.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(!jwk||typeof jwk.n!=='string'||jwk.n.length<340||jwk.n.length>1400)return reject();
  let valid=false;try{const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unb64(parts[2]),encode.encode(parts[0]+'.'+parts[1]));}catch{}
  if(!valid)return reject();
  return {subject:String(claims.id),label:String(claims.preferred_username||claims.name||'Telegram member').slice(0,100),tokens:null};
}
export async function accessToken(identity, env, save, fetcher=fetch) {
  if(!identity.tokens && identity.provider==='x' && env.CAMPAIGNS_X_BEARER)return env.CAMPAIGNS_X_BEARER;
  const context=`${identity.provider}:${identity.subject}:${identity.user_id}`;
  let t=await unseal(identity.tokens,env,context);
  if(t.expiresAt>Date.now()+60000)return t.access;
  if(!t.refresh)fail('RECONNECT','Reconnect your social account to refresh access.',401);
  const p=PROVIDERS[identity.provider],body=new URLSearchParams({grant_type:'refresh_token',refresh_token:t.refresh,client_id:env[p.id]});
  const headers={'Content-Type':'application/x-www-form-urlencoded'};
  if(identity.provider==='x')headers.Authorization='Basic '+btoa(`${env[p.id]}:${env[p.secret]}`);else body.set('client_secret',env[p.secret]);
  const next=await providerJSON(p.token,{method:'POST',headers,body},fetcher);
  if(!next.access_token)fail('RECONNECT','Reconnect your social account.',401);
  t={access:next.access_token,refresh:next.refresh_token || t.refresh,expiresAt:Date.now()+(Number(next.expires_in)||3600)*1000};
  await save(await seal(t,env,context));return t.access;
}
async function paginatedMatch(url, wanted, access, fetcher, maxPages=5) {
  let next;
  for(let page=0;page<maxPages;page++){
    const u=new URL(url);u.searchParams.set('max_results','100');if(next)u.searchParams.set('pagination_token',next);
    const result=await providerJSON(u.href,{headers:{Authorization:`Bearer ${access}`}},fetcher);
    if(result.errors?.length)fail('INCOMPLETE_CHECK','The platform returned a partial result; no points were awarded.',503);
    if(result.data?.some(x=>x.id===wanted))return true;
    next=result.meta?.next_token;if(!next)return false;
  }
  fail('INCOMPLETE_CHECK','This account needs a larger platform check. Please contact the campaign organizer; no points were awarded.',503);
}
export function postID(value) {
  try {const u=new URL(value);if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname))return null;return u.pathname.match(/^\/[\w]+\/status\/(\d{1,25})(?:\/|$)/)?.[1] || null;}catch{return null;}
}
export async function verifyAction(action, identity, token, evidence, campaign, now=Date.now(), fetcher=fetch) {
  if(!identity || identity.provider !== (action.type.startsWith('x_')?'x':'discord'))fail('CONNECT_ACCOUNT','Connect the relevant social account first.',401);
  let verified=false, key='';
  if(action.type==='x_follow')verified=await paginatedMatch(`https://api.x.com/2/users/${identity.subject}/following`,action.targetId,token,fetcher);
  else if(action.type==='x_like')verified=await paginatedMatch(`https://api.x.com/2/users/${identity.subject}/liked_tweets`,action.targetId,token,fetcher);
  else if(action.type==='x_repost')verified=await paginatedMatch(`https://api.x.com/2/tweets/${action.targetId}/retweeted_by`,identity.subject,token,fetcher);
  else if(['x_reply','x_quote'].includes(action.type)){
    const id=postID(evidence);if(!id)fail('POST_URL_REQUIRED','Paste the URL of your reply or quote post.');
    const result=await providerJSON(`https://api.x.com/2/tweets/${id}?tweet.fields=author_id,referenced_tweets,created_at`,{headers:{Authorization:`Bearer ${token}`}},fetcher);
    const post=result.data,created=Date.parse(post?.created_at);
    verified=!!(post?.author_id===identity.subject && post.referenced_tweets?.some(r=>r.id===action.targetId && r.type===(action.type==='x_reply'?'replied_to':'quoted')) && Number.isFinite(created) && created>=Date.parse(campaign.startsAt) && created<Date.parse(campaign.endsAt) && (action.frequency!=='daily' || periodFor(action,campaign,created)===periodFor(action,campaign,now)));
    key=`x:${id}`;
  }else if(action.type==='discord_join'){
    let response;try{response=await fetcher(`https://discord.com/api/v10/users/@me/guilds/${action.targetId}/member`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(12000)});}catch{fail('PROVIDER_UNAVAILABLE','Discord did not respond. Try again later.',503);}
    if(response.status===404)return {verified:false,key:''};
    const result=await providerJSON('https://discord.com/api/v10/users/@me',{},()=>Promise.resolve(response));
    verified=result.user?.id===identity.subject && result.pending!==true;
  }else fail('UNSUPPORTED_CHECK','This action uses organizer review.');
  return {verified,key,proof:{provider:identity.provider,subject:identity.subject,targetId:action.targetId,checkedAt:new Date(now).toISOString(),method:action.type}};
}

export async function verifyPublicXIdentity(evidence, challenge, env, fetcher=fetch) {
  const id=postID(evidence);if(!id)fail('POST_URL_REQUIRED','Paste the link to your account verification post on X.');
  const result=await providerJSON(`https://api.x.com/2/tweets/${id}?tweet.fields=author_id,created_at&expansions=author_id&user.fields=username`,{headers:{Authorization:`Bearer ${env.CAMPAIGNS_X_BEARER}`}},fetcher);
  const post=result.data,created=Date.parse(post?.created_at);
  if(!post?.author_id || !post.text?.includes(challenge.code) || !Number.isFinite(created) || created<challenge.createdAt-5000 || created>challenge.expiresAt)fail('IDENTITY_NOT_VERIFIED','The post must include your exact verification code and be created during this sign-in window.',409);
  const profile=result.includes?.users?.find(u=>u.id===post.author_id);
  if(!profile?.username)fail('IDENTITY_NOT_VERIFIED','The platform did not return the author’s account identity.',409);
  return {subject:post.author_id,label:profile.username,postId:id};
}
