import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {harness,campaign,publish,join,claim} from './campaigns/fixture.mjs';
import {validateCampaign,b64,randomToken} from '../src/campaigns/model.mjs';
import {verifyTelegramToken,capabilities} from '../src/campaigns/providers.mjs';
import {verifyTelegramMembership,verifyInstagramComment} from '../src/campaigns/automatic.mjs';
const answer={id:'answer',type:'question',mode:'answer',label:'House code',points:4,frequency:'once',target:'',answers:['The House','bullenciaga']};
const newsletter={id:'mail',type:'newsletter',mode:'confirmation',label:'House letters',points:5,frequency:'once',target:'',consentText:'Send me BULLENCIAGA news by email. I can unsubscribe at any time.'};
const telegram={id:'tg',type:'telegram',mode:'api',label:'Join the room',points:3,frequency:'once',target:'https://t.me/fixture_house',targetId:'-100123456789'};
const instagram={id:'ig',type:'instagram_comment',mode:'api',label:'Leave a comment',points:3,frequency:'once',target:'https://www.instagram.com/p/FixturePost/',targetId:'123456789'};
const auth={CAMPAIGNS_AUTH_URL:'https://abcdefghijklmnopqrst.supabase.co',CAMPAIGNS_AUTH_PUBLISHABLE_KEY:'sb_publishable_fixture_only'};
const tgEnv={CAMPAIGNS_TELEGRAM_BOT_TOKEN:'123456:fixture-token',CAMPAIGNS_TELEGRAM_CLIENT_ID:'123456',CAMPAIGNS_TELEGRAM_CLIENT_SECRET:'fixture-secret',CAMPAIGNS_TOKEN_KEY:'fixture-long-encryption-key-not-a-real-secret'};
const igEnv={CAMPAIGNS_INSTAGRAM_ACCESS_TOKEN:'fixture-not-real',CAMPAIGNS_INSTAGRAM_ACCOUNT_ID:'987654321'};
const email='person@example.test';
const local=(name,fn)=>test(name,async t=>{const h=harness();try{await fn(h,t);}finally{h.close();}});
const post=(h,path,cookie,data)=>h.request(path,{method:'POST',cookie,data});
function mockEmail(t){const calls=[];t.mock.method(globalThis,'fetch',async(url,opts)=>{
  assert(String(url).startsWith(auth.CAMPAIGNS_AUTH_URL+'/auth/v1/'));calls.push(url);
  if(url.endsWith('/otp'))return Response.json({});
  if(url.endsWith('/logout?scope=local'))return new Response(null,{status:204});
  const data=JSON.parse(opts.body);assert(url.endsWith('/verify'));
  return data.token==='11112222'?Response.json({access_token:'fixture-only',user:{id:'12345678-1234-4234-8234-123456789012',email:data.email,email_confirmed_at:'2026-01-01T00:00:00Z'}}):Response.json({error:'private detail'},{status:401});
});return calls;}
const beginNewsletter=(h,c,u,consent=true)=>post(h,'/newsletter/start',u.cookie,{campaign:c.slug,action:'mail',email,consent});
const confirmNewsletter=(h,u,id,code='11112222')=>post(h,'/newsletter/verify',u.cookie,{id,code});

local('fixed answers stay private, match normalized exact text and award once',async h=>{
  const c=await publish(h,campaign({actions:[answer]})),u=await h.user();await join(h,c,u);
  assert.deepEqual(c.actions[0].answers,['the house','bullenciaga']);
  for(const path of ['/campaigns','/campaigns/'+c.slug]){const r=await h.request(path);assert(!JSON.stringify(r.value).includes('answers'));assert(!JSON.stringify(r.value).includes('bullenciaga"'));}
  const no=await post(h,`/campaigns/${c.slug}/actions/answer/claim`,u.cookie,{answer:'not the house'});assert.equal(no.value.error,'WRONG_ANSWER');
  const ok=await post(h,`/campaigns/${c.slug}/actions/answer/claim`,u.cookie,{answer:'  THE   HOUSE ',evidence:'do not retain my code'});assert.equal(ok.status,200);
  const entry=h.ledger.store.one('SELECT * FROM entries');assert.equal(entry.points,4);assert.equal(entry.evidence,'');assert(!entry.proof.includes('house'));
  const again=await claim(h,c,u,'answer');assert(again.value.duplicate);assert.equal(h.ledger.store.stats(c.id,u.id).points,4);
});
local('guess limits and validation prevent repeatable secrets or subscriptions',async h=>{
  const c=await publish(h,campaign({actions:[answer]})),u=await h.user();await join(h,c,u);
  for(let n=0;n<5;n++)assert.equal((await post(h,`/campaigns/${c.slug}/actions/answer/claim`,u.cookie,{answer:'wrong'})).status,409);
  assert.equal((await post(h,`/campaigns/${c.slug}/actions/answer/claim`,u.cookie,{answer:'the house'})).status,429);
  for(const a of [answer,newsletter,telegram])assert.throws(()=>validateCampaign(campaign({actions:[{...a,frequency:'daily'}]})));
  assert.throws(()=>validateCampaign(campaign({actions:[{...answer,answers:[]}]})));
  assert.throws(()=>validateCampaign(campaign({actions:[{...newsletter,consentText:''}]})));
  assert.throws(()=>validateCampaign(campaign({actions:[{...instagram,target:'https://evil.test/p/FixturePost/'}]})));
});
local('unconfigured integrations cannot be accidentally published as automatic',async h=>{
  assert.equal(capabilities(h.env).telegram.configured,false);assert.equal(capabilities(h.env).instagram.configured,false);
  for(const a of [telegram,instagram,newsletter]){
    const d=await h.request('/admin/campaigns',{method:'POST',admin:true,data:campaign({slug:'missing-'+a.id,actions:[a]})});assert.equal(d.status,201);
    assert.equal((await h.request(`/admin/campaigns/${d.value.id}/status`,{method:'POST',admin:true,data:{status:'live',revision:1}})).value.error,'CONNECTION_REQUIRED');
  }
});
local('newsletter needs explicit consent and campaign-specific email confirmation; unsubscribed rows never export',async(h,t)=>{
  Object.assign(h.env,auth);const calls=mockEmail(t),c=await publish(h,campaign({actions:[newsletter]})),u=await h.user();await join(h,c,u);
  assert.equal((await beginNewsletter(h,c,u,false)).value.error,'CONSENT_REQUIRED');assert.equal(calls.length,0);
  assert.equal((await claim(h,c,u,'mail')).value.error,'CONFIRM_NEWSLETTER');
  const pending=await beginNewsletter(h,c,u);assert.equal(pending.status,200);assert.equal((await claim(h,c,u,'mail')).value.error,'CONFIRM_NEWSLETTER');
  const confirmed=await confirmNewsletter(h,u,pending.value.id);assert.equal(confirmed.status,200);assert.equal((await confirmNewsletter(h,u,pending.value.id)).value.error,'EMAIL_EXPIRED');
  assert.equal((await claim(h,c,u,'mail')).status,200);assert.equal(h.ledger.store.stats(c.id,u.id).points,5);
  const record=h.ledger.store.one('SELECT * FROM newsletter_subscribers');assert(!record.email_cipher.includes(email));assert.equal(record.label,'p…@example.test');
  assert.equal((await h.request('/admin/newsletter/export')).status,401);
  const out=await h.request('/admin/newsletter/export',{admin:true});assert.equal(out.value.subscribers[0].email,email);assert.equal(out.value.subscribers[0].consents[0].consent_text,newsletter.consentText);
  const token=out.value.subscribers[0].unsubscribeURL.split('=')[1];assert.equal((await post(h,'/newsletter/unsubscribe','',{token})).status,200);
  assert.equal((await h.request('/admin/newsletter/export',{admin:true})).value.subscribers.length,0);assert.equal(h.ledger.store.stats(c.id,u.id).points,5);
  assert(!JSON.stringify(h.ledger.store.all('SELECT * FROM audit')).includes(email));
});
local('newsletter cannot use another entrant, an expired request or a wrong code',async(h,t)=>{
  Object.assign(h.env,auth);const calls=mockEmail(t),c=await publish(h,campaign({actions:[newsletter]})),u=await h.user(),v=await h.user();await join(h,c,u);await join(h,c,v);
  const pending=await beginNewsletter(h,c,u);const id=pending.value.id;
  assert.equal((await confirmNewsletter(h,v,id)).value.error,'WRONG_ACCOUNT');assert.equal(calls.length,1);
  for(let i=0;i<5;i++)assert.equal((await confirmNewsletter(h,u,id,'99999999')).value.error,'INVALID_CODE');
  assert.equal((await confirmNewsletter(h,u,id)).value.error,'EMAIL_LOCKED');assert.equal(h.ledger.store.one('SELECT count(*) n FROM newsletter_subscribers').n,0);
  h.ledger.store.run('UPDATE challenges SET expires_at=?',Date.now()-1);assert.equal((await confirmNewsletter(h,u,id)).value.error,'EMAIL_EXPIRED');
});
local('email sign-in does not count as newsletter consent; exact answers do not farm referral bonuses',async(h,t)=>{
  Object.assign(h.env,auth);mockEmail(t);const c=await publish(h,campaign({actions:[newsletter,answer]})),u=await h.user(),v=await h.user();const member=await join(h,c,u);await join(h,c,v,member.value.referralCode);
  const start=await post(h,'/email/start',v.cookie,{email});await post(h,'/email/verify',v.cookie+'; '+start.cookie,{code:'11112222'});
  assert.equal((await claim(h,c,v,'mail')).value.error,'CONFIRM_NEWSLETTER');
  assert.equal((await post(h,`/campaigns/${c.slug}/actions/answer/claim`,v.cookie,{answer:'the house'})).status,200);assert.equal(h.ledger.store.stats(c.id,u.id).points,0);
});
local('newsletter provider completion after campaign closure cannot create a subscription or entries',async(h,t)=>{
  Object.assign(h.env,auth);mockEmail(t);const c=await publish(h,campaign({actions:[newsletter]})),u=await h.user();await join(h,c,u);const pending=await beginNewsletter(h,c,u);
  h.ledger.store.run("UPDATE campaigns SET status='closed' WHERE id=?",c.id);
  assert.equal((await confirmNewsletter(h,u,pending.value.id)).value.error,'CAMPAIGN_NOT_OPEN');assert.equal(h.ledger.store.one('SELECT count(*) n FROM newsletter_subscribers').n,0);
});
test('Telegram verifies signed identity, issuer, audience, nonce, time and signature',async()=>{
  const pair=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...pair.publicKey.export({format:'jwk'}),kid:'fixture-key',use:'sig',alg:'RS256'},nonce=randomToken(),seconds=Math.floor(Date.now()/1000);
  const payload={iss:'https://oauth.telegram.org',aud:'123456',id:99887766,sub:'subject',iat:seconds,exp:seconds+3600,nonce,preferred_username:'houseguest'};
  const jwt=(p=payload)=>{const parts=[b64(Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid}))),b64(Buffer.from(JSON.stringify(p)))];return [...parts,b64(sign('RSA-SHA256',Buffer.from(parts.join('.')),pair.privateKey))].join('.');};
  const fetcher=async url=>{assert.equal(url,'https://oauth.telegram.org/.well-known/jwks.json');return Response.json({keys:[jwk]});};
  assert.equal((await verifyTelegramToken(jwt(),tgEnv,nonce,fetcher)).subject,'99887766');
  for(const change of [{iss:'https://evil.test'},{aud:'999'},{nonce:'different'},{exp:seconds-1},{iat:seconds+60},{id:'99887766'}])await assert.rejects(()=>verifyTelegramToken(jwt({...payload,...change}),tgEnv,nonce,fetcher),e=>e.code==='OAUTH_FAILED');
  await assert.rejects(()=>verifyTelegramToken(jwt().slice(0,-10)+'aaaaaaaaaa',tgEnv,nonce,fetcher),e=>e.code==='OAUTH_FAILED');
});
test('Telegram membership requires bot admin, matching user and current joined status',async()=>{
  let botStatus='administrator',userStatus='member',userID='99887766',calls=0;
  const fetcher=async(url,opts)=>{calls++;assert.equal(url,'https://api.telegram.org/bot123456:fixture-token/getChatMember');const input=JSON.parse(opts.body);assert.equal(input.chat_id,telegram.targetId);return Response.json({ok:true,result:{user:{id:input.user_id===123456?123456:Number(userID)},status:input.user_id===123456?botStatus:userStatus}});};
  const identity={provider:'telegram',subject:userID};assert.equal((await verifyTelegramMembership(telegram,identity,tgEnv,fetcher)).verified,true);
  for(const status of ['left','kicked','restricted']){userStatus=status;assert.equal((await verifyTelegramMembership(telegram,identity,tgEnv,fetcher)).verified,false);}
  botStatus='member';calls=0;await assert.rejects(()=>verifyTelegramMembership(telegram,identity,tgEnv,fetcher),e=>e.code==='BOT_ADMIN_REQUIRED');assert.equal(calls,1);
  botStatus='administrator';userID='999999';await assert.rejects(()=>verifyTelegramMembership(telegram,identity,tgEnv,fetcher),e=>e.code==='INCOMPLETE_CHECK');
});
function instagramFixture(code,createdAt,overrides={},calls=[]){return async(url,opts)=>{
  const u=new URL(url);calls.push(u.href);assert.equal(u.hostname,'graph.facebook.com');assert.equal(opts.headers.Authorization,'Bearer fixture-not-real');
  if(u.pathname.endsWith('/'+instagram.targetId))return Response.json({id:instagram.targetId,owner:{id:igEnv.CAMPAIGNS_INSTAGRAM_ACCOUNT_ID},permalink:instagram.target,...overrides.media});
  assert(u.pathname.endsWith('/comments'));
  const row={id:'44445555',text:'My contribution '+code,from:{id:'22223333',username:'testguest'},timestamp:new Date(createdAt+1000).toISOString(),hidden:false,...overrides.comment};
  return Response.json({data:[row],...overrides.result});
};}
local('Instagram code binds entrant, username, target and action; duplicate proof awards once',async(h,t)=>{
  Object.assign(h.env,igEnv);const c=await publish(h,campaign({actions:[instagram]})),u=await h.user(),v=await h.user();await join(h,c,u);await join(h,c,v);
  const code=await post(h,`/campaigns/${c.slug}/actions/ig/challenge`,u.cookie,{username:'@testguest'});assert.equal(code.status,200);
  const d=JSON.parse(h.ledger.store.one('SELECT doc FROM challenges WHERE id=?',code.value.id).doc);t.mock.method(globalThis,'fetch',instagramFixture(d.code,d.createdAt));
  assert.equal((await post(h,`/campaigns/${c.slug}/actions/ig/claim`,v.cookie,{challenge:code.value.id})).value.error,'WRONG_ACCOUNT');
  const good=await post(h,`/campaigns/${c.slug}/actions/ig/claim`,u.cookie,{challenge:code.value.id});assert.equal(good.status,200);assert.equal(h.ledger.store.stats(c.id,u.id).points,3);
  assert.equal(h.ledger.store.one("SELECT subject FROM identities WHERE provider='instagram'").subject,'22223333');
  assert.equal((await post(h,`/campaigns/${c.slug}/actions/ig/claim`,u.cookie,{challenge:code.value.id})).value.duplicate,true);
  assert.equal(h.ledger.store.one("SELECT count(*) n FROM challenges WHERE kind='instagram-comment'").n,0);
});
test('Instagram refuses wrong owner, wrong permalink, copied code, stale comments and missing author identity',async()=>{
  const now=Date.now(),d={code:'house-fixture-unique',username:'testguest',createdAt:now-10000},c=campaign();
  for(const media of [{owner:{id:'other'}},{permalink:'https://www.instagram.com/p/Other/'}])await assert.rejects(()=>verifyInstagramComment(instagram,d,c,igEnv,instagramFixture(d.code,d.createdAt,{media})),e=>e.code==='INVALID_MEDIA');
  for(const comment of [{from:{id:'22223333',username:'copycat'}},{from:{username:'testguest'}},{timestamp:new Date(now-20000).toISOString()},{text:d.code+'appended'},{hidden:true}])assert.equal((await verifyInstagramComment(instagram,d,c,igEnv,instagramFixture(d.code,d.createdAt,{comment}))).verified,false);
  assert.equal((await verifyInstagramComment(instagram,d,c,igEnv,instagramFixture(d.code,d.createdAt))).verified,true);
});
test('Instagram pagination stays on fixed API origin, is bounded and fails closed on incomplete checks',async()=>{
  const now=Date.now(),d={code:'house-missing',username:'testguest',createdAt:now-10000},calls=[];
  await assert.rejects(()=>verifyInstagramComment(instagram,d,campaign(),igEnv,instagramFixture('different',d.createdAt,{result:{paging:{next:'https://evil.test/token',cursors:{after:'cursor'}}}},calls)),e=>e.code==='INCOMPLETE_CHECK');
  assert.equal(calls.length,6);assert(calls.every(v=>v.startsWith('https://graph.facebook.com/')));
  await assert.rejects(()=>verifyInstagramComment(instagram,d,campaign(),igEnv,async()=>Response.json({secret:'never display'},{status:403})),e=>e.code==='PROVIDER_ACCESS'&&!e.message.includes('never display'));
});
local('newsletter concurrent verification consumes one challenge and cannot link an email owned elsewhere',async(h,t)=>{
  Object.assign(h.env,auth);mockEmail(t);const c=await publish(h,campaign({actions:[newsletter]})),u=await h.user(),v=await h.user();await join(h,c,u);
  const pending=await beginNewsletter(h,c,u);const original=globalThis.fetch;let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);let verifies=0;
  t.mock.method(globalThis,'fetch',async(url,opts)=>{if(url.endsWith('/verify')){verifies++;enter();await gate;}return original(url,opts);});
  const first=confirmNewsletter(h,u,pending.value.id);await entered;assert.equal((await confirmNewsletter(h,u,pending.value.id)).value.error,'EMAIL_CHECKING');
  h.ledger.store.identify('email','abcdefghijklmnopqrst.supabase.co:12345678-1234-4234-8234-123456789012','masked',v.id);release();
  assert.equal((await first).value.error,'IDENTITY_IN_USE');assert.equal(verifies,1);assert.equal(h.ledger.store.one('SELECT count(*) n FROM newsletter_subscribers').n,0);
});
local('Telegram OAuth carries PKCE and nonce, verifies the callback once and links the current entrant',async(h,t)=>{
  Object.assign(h.env,tgEnv);const u=await h.user();
  const start=await post(h,'/oauth/telegram/start',u.cookie,{returnTo:'/campaigns'}),authorize=new URL(start.value.url);
  assert.equal(authorize.origin,'https://oauth.telegram.org');assert.equal(authorize.searchParams.get('scope'),'openid profile');assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');assert(authorize.searchParams.get('nonce'));
  const pair=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...pair.publicKey.export({format:'jwk'}),kid:'oauth-fixture'};
  const state=authorize.searchParams.get('state'),d=JSON.parse(h.ledger.store.one('SELECT doc FROM challenges WHERE id=?',state).doc),seconds=Math.floor(Date.now()/1000);
  const parts=[b64(Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid}))),b64(Buffer.from(JSON.stringify({iss:'https://oauth.telegram.org',aud:'123456',id:99887766,sub:'subject',iat:seconds,exp:seconds+3600,nonce:d.nonce,name:'Fixture member'})))];
  const jwt=parts.join('.')+'.'+b64(sign('RSA-SHA256',Buffer.from(parts.join('.')),pair.privateKey));
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.endsWith('/token')){assert.equal(new URLSearchParams(options.body).get('code_verifier'),d.verifier);return Response.json({id_token:jwt});}
    assert.equal(url,'https://oauth.telegram.org/.well-known/jwks.json');return Response.json({keys:[jwk]});
  });
  const callback='/oauth/telegram/callback?state='+state+'&code=fixture-code';
  assert.equal((await h.request(callback,{cookie:u.cookie})).value.error,'OAUTH_STATE');
  const result=await h.request(callback,{cookie:u.cookie+'; '+start.cookie});assert.equal(result.status,303);assert.equal(h.ledger.store.one("SELECT user_id FROM identities WHERE provider='telegram'").user_id,u.id);assert.equal(h.ledger.store.one("SELECT tokens FROM identities WHERE provider='telegram'").tokens,null);
  assert.equal((await h.request(callback,{cookie:u.cookie+'; '+start.cookie})).value.error,'OAUTH_EXPIRED');
});
local('Instagram rejects a second entrant using an already linked account and does not consume their code',async(h,t)=>{
  Object.assign(h.env,igEnv);const c=await publish(h,campaign({actions:[instagram]})),u=await h.user(),v=await h.user();await join(h,c,u);await join(h,c,v);h.ledger.store.identify('instagram','22223333','testguest',u.id);
  const start=await post(h,`/campaigns/${c.slug}/actions/ig/challenge`,v.cookie,{username:'testguest'}),d=JSON.parse(h.ledger.store.one('SELECT doc FROM challenges WHERE id=?',start.value.id).doc);
  t.mock.method(globalThis,'fetch',instagramFixture(d.code,d.createdAt));
  assert.equal((await post(h,`/campaigns/${c.slug}/actions/ig/claim`,v.cookie,{challenge:start.value.id})).value.error,'IDENTITY_IN_USE');assert.equal(h.ledger.store.stats(c.id,v.id).points,0);assert(h.ledger.store.one('SELECT id FROM challenges WHERE id=?',start.value.id));
});
