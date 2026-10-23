import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,campaign,publish,join,claim,testWallet,origin} from './campaigns/fixture.mjs';
import {validateCampaign,periodFor,sha,selectWinners,csvCell} from '../src/campaigns/model.mjs';
import {verifyAction,verifyPublicXIdentity,seal,unseal,capabilities} from '../src/campaigns/providers.mjs';
const local=(name,fn)=>test(name,async()=>{const h=harness();try{await fn(h);}finally{h.close();}});

local('owner auth, CSRF and draft visibility fail closed',async h=>{
  assert.equal((await h.request('/admin/campaigns')).status,401);
  assert.equal((await h.request('/admin/campaigns',{method:'POST',data:campaign(),admin:true,originHeader:'https://evil.test'})).status,403);
  assert.equal((await h.request('/admin/campaigns',{method:'POST',data:campaign(),admin:true})).status,201);
  assert.deepEqual((await h.request('/campaigns')).value.campaigns,[]);
  assert.equal((await h.request('/campaigns/house-invitation')).status,404);
});
test('validation rejects fake verification, dangerous links, duplicates and repeatable follows',()=>{
  assert.throws(()=>validateCampaign(campaign({actions:[{...campaign().actions[0],type:'instagram_follow',mode:'api'}]})));
  assert.throws(()=>validateCampaign(campaign({cover:'javascript:alert(1)'})));
  assert.throws(()=>validateCampaign(campaign({actions:[campaign().actions[0],campaign().actions[0]]})));
  assert.throws(()=>validateCampaign(campaign({actions:[{id:'follow',type:'x_follow',mode:'review',target:'https://x.com/bullenciagax',points:2,frequency:'daily'}]})));
});
local('missing integration credentials block automatic campaign publication',async h=>{
  const doc=campaign({actions:[{id:'follow',type:'x_follow',mode:'api',label:'Follow',target:'https://x.com/bullenciagax',targetId:'123',points:3,frequency:'once'}]});
  const r=await h.request('/admin/campaigns',{method:'POST',admin:true,data:doc});
  const p=await h.request(`/admin/campaigns/${r.value.id}/status`,{method:'POST',admin:true,data:{status:'live',revision:1}});
  assert.equal(p.status,409);assert.equal(p.value.error,'CONNECTION_REQUIRED');
});
local('published rules freeze; presentation edits and optimistic concurrency work',async h=>{
  const c=await publish(h);assert.match(c.commitment,/^[a-f0-9]{64}$/);
  assert.equal((await h.request(`/admin/campaigns/${c.id}`,{method:'PUT',admin:true,data:{...c,actions:[]}})).status,400);
  const changed=await h.request(`/admin/campaigns/${c.id}`,{method:'PUT',admin:true,data:{...c,prizes:[{name:'Changed',quantity:1}]}});assert.equal(changed.value.error,'RULES_LOCKED');
  const saved=await h.request(`/admin/campaigns/${c.id}`,{method:'PUT',admin:true,data:{...c,title:'Better title'}});assert.equal(saved.status,200);assert.equal(saved.value.revision,3);
  const stale=await h.request(`/admin/campaigns/${c.id}`,{method:'PUT',admin:true,data:{...c,title:'Old tab'}});assert.equal(stale.value.error,'EDIT_CONFLICT');
});
local('signature sign-in binds address, origin and nonce and is single use',async h=>{
  const w=testWallet();const challenge=await h.request('/wallet/challenge',{method:'POST',data:{wallet:w.address}});
  const bad=await h.request('/wallet/verify',{method:'POST',data:{id:challenge.value.id,signature:w.sign('wrong')}});assert.equal(bad.status,401);
  const proof={id:challenge.value.id,signature:w.sign(challenge.value.message)};
  const [a,b]=await Promise.all([h.request('/wallet/verify',{method:'POST',data:proof}),h.request('/wallet/verify',{method:'POST',data:proof})]);
  assert.deepEqual([a.status,b.status].sort(),[200,401]);
  const success=a.status===200?a:b;assert.match(success.response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);
  const me=await h.request('/me',{cookie:success.cookie});assert.equal(me.value.accounts[0].subject,w.address);
});
local('consent required; concurrent repeated claims award once',async h=>{
  const c=await publish(h),u=await h.user();assert.equal((await claim(h,c,u,'free')).value.error,'JOIN_REQUIRED');
  const bad=await h.request(`/campaigns/${c.slug}/join`,{method:'POST',cookie:u.cookie,data:{accepted:true,revision:1}});assert.equal(bad.value.error,'RULES_REQUIRED');
  await join(h,c,u);const results=await Promise.all(Array.from({length:8},()=>claim(h,c,u,'free')));
  assert(results.every(r=>r.status===200));assert.equal(h.ledger.store.stats(c.id,u.id).points,1);
  assert.equal(h.ledger.store.one('SELECT count(*) n FROM entries').n,1);
});
local('review remains pending, is approved only by owner and cannot be double-awarded',async h=>{
  const c=await publish(h),u=await h.user();await join(h,c,u);const e=await claim(h,c,u,'creative');assert.equal(e.value.status,'pending');assert.equal(h.ledger.store.stats(c.id).points,0);
  const path=`/admin/campaigns/${c.id}/review`,data={entryId:e.value.id,status:'approved',note:'Reviewed original work'};
  assert.equal((await h.request(path,{method:'POST',cookie:u.cookie,data})).status,401);
  assert.equal((await h.request(path,{method:'POST',admin:true,data})).status,200);
  assert.equal((await h.request(path,{method:'POST',admin:true,data})).status,200);
  assert.equal(h.ledger.store.stats(c.id,u.id).points,10);
});
local('rejected evidence can be resubmitted without creating a second entry',async h=>{
  const c=await publish(h),u=await h.user();await join(h,c,u);const e=await claim(h,c,u,'creative');
  await h.request(`/admin/campaigns/${c.id}/review`,{method:'POST',admin:true,data:{entryId:e.value.id,status:'rejected',note:'Please include a public link'}});
  const res=await claim(h,c,u,'creative','https://example.com/new-proof');assert.equal(res.value.id,e.value.id);assert.equal(res.value.status,'pending');assert.equal(h.ledger.store.one('SELECT count(*) n FROM entries').n,1);
});
local('visits require a recorded outbound visit and never become social proofs',async h=>{
  const c=await publish(h),u=await h.user();await join(h,c,u);assert.equal((await claim(h,c,u,'visit')).value.error,'VISIT_FIRST');
  await h.request(`/campaigns/${c.slug}/actions/visit/visit`,{method:'POST',cookie:u.cookie,data:{}});assert.equal((await claim(h,c,u,'visit')).status,409);
  h.ledger.store.run('UPDATE visits SET started_at=?',Date.now()-6000);const r=await claim(h,c,u,'visit');assert.equal(r.value.points,2);
  assert.match(h.ledger.store.one('SELECT proof FROM entries').proof,/no follow/);
});
local('referral qualifies after reviewed work, not free entry, and reverses on revocation',async h=>{
  const c=await publish(h),a=await h.user('referrer'),b=await h.user('friend');const j=await join(h,c,a);await join(h,c,b,j.value.referralCode);await claim(h,c,b,'free');assert.equal(h.ledger.store.stats(c.id,a.id).points,0);
  const e=await claim(h,c,b,'creative');await h.request(`/admin/campaigns/${c.id}/review`,{method:'POST',admin:true,data:{entryId:e.value.id,status:'approved'}});assert.equal(h.ledger.store.stats(c.id,a.id).points,5);
  await h.request(`/admin/campaigns/${c.id}/review`,{method:'POST',admin:true,data:{entryId:e.value.id,status:'revoked',note:'Evidence was copied'}});assert.equal(h.ledger.store.stats(c.id,a.id).points,0);
});
local('closing stops new claims; pending reviews block draws; completed draws are replayable and immutable',async h=>{
  const c=await publish(h),u=await h.user(),v=await h.user();await join(h,c,u);await join(h,c,v);await claim(h,c,u,'free');await claim(h,c,v,'free');const pending=await claim(h,c,u,'creative');
  const close=await h.request(`/admin/campaigns/${c.id}/status`,{method:'POST',admin:true,data:{status:'closed',revision:c.revision}});assert.equal(close.status,200);
  assert.equal((await claim(h,c,v,'creative')).value.error,'CAMPAIGN_NOT_OPEN');
  const drawPath=`/admin/campaigns/${c.id}/draw`;assert.equal((await h.request(drawPath,{method:'POST',admin:true,data:{confirm:c.slug}})).value.error,'PENDING_REVIEWS');
  await h.request(`/admin/campaigns/${c.id}/review`,{method:'POST',admin:true,data:{entryId:pending.value.id,status:'approved'}});
  const d=await h.request(drawPath,{method:'POST',admin:true,data:{confirm:c.slug}});assert.equal(d.status,200);assert.equal(d.value.winners.length,2);
  assert.equal(await sha(d.value.seed),c.commitment);assert.equal(await sha(JSON.stringify(d.value.snapshot)),d.value.snapshotHash);
  const replay=await selectWinners(d.value.snapshot.rows,d.value.seed,d.value.snapshotHash,2,false);assert.deepEqual(replay.map(w=>w.participant),d.value.winners.map(w=>w.participant));
  assert.deepEqual((await h.request(drawPath,{method:'POST',admin:true,data:{confirm:c.slug}})).value,d.value);
  assert.equal((await h.request(`/admin/campaigns/${c.id}/review`,{method:'POST',admin:true,data:{entryId:pending.value.id,status:'revoked',note:'late'}})).value.error,'FROZEN');
  const publicDraw=await h.request(`/campaigns/${c.slug}/draw`);assert.deepEqual(publicDraw.value,d.value);assert(!JSON.stringify(d.value).includes('evidence'));
});
local('disqualified entrants and their referral rewards do not reach the draw',async h=>{
  const c=await publish(h),a=await h.user(),b=await h.user();const j=await join(h,c,a);await join(h,c,b,j.value.referralCode);const e=await claim(h,c,b,'creative');await h.request(`/admin/campaigns/${c.id}/review`,{method:'POST',admin:true,data:{entryId:e.value.id,status:'approved'}});
  await h.request(`/admin/campaigns/${c.id}/disqualify`,{method:'POST',admin:true,data:{userId:b.id,reason:'Duplicate entrant'}});
  assert.equal(h.ledger.store.stats(c.id).points,0);assert.equal((await claim(h,c,b,'free')).status,403);
});
test('daily periods respect campaign zone and daylight saving',()=>{const a={frequency:'daily'},doc={timeZone:'Europe/Warsaw'};assert.equal(periodFor(a,doc,Date.parse('2026-10-24T22:30:00Z')),'2026-10-25');assert.equal(periodFor(a,doc,Date.parse('2026-10-25T22:30:00Z')),'2026-10-25');assert.equal(periodFor(a,doc,Date.parse('2026-10-25T23:30:00Z')),'2026-10-26');});
test('CSV formula injection is neutralized',()=>{assert.equal(csvCell('=cmd()'),'"\'=cmd()"');assert.equal(csvCell('ordinary'),'"ordinary"');assert.equal(csvCell('a"b'),'"a""b"');});
test('X verification follows pagination and never treats a partial scan as complete',async()=>{
  let calls=0;const action={type:'x_follow',targetId:'99'},identity={provider:'x',subject:'1'};
  const verified=await verifyAction(action,identity,'test','',{},Date.now(),async()=>Response.json(++calls===1?{data:[{id:'2'}],meta:{next_token:'next'}}:{data:[{id:'99'}]}));assert.equal(verified.verified,true);assert.equal(calls,2);
  await assert.rejects(()=>verifyAction(action,identity,'test','',{},Date.now(),async()=>Response.json({data:[],meta:{next_token:'endless'}})),e=>e.code==='INCOMPLETE_CHECK');
  await assert.rejects(()=>verifyAction(action,identity,'test','',{},Date.now(),async()=>new Response('',{status:429})),e=>e.code==='PROVIDER_LIMIT');
});
test('X replies prove author, parent and the campaign window',async()=>{
  const a={type:'x_reply',targetId:'100',frequency:'once'},identity={provider:'x',subject:'9'},c=campaign();
  const good={data:{author_id:'9',created_at:new Date().toISOString(),referenced_tweets:[{id:'100',type:'replied_to'}]}};
  assert.equal((await verifyAction(a,identity,'test','https://x.com/person/status/200',c,Date.now(),async()=>Response.json(good))).verified,true);
  const wrong=structuredClone(good);wrong.data.author_id='evil';assert.equal((await verifyAction(a,identity,'test','https://x.com/person/status/200',c,Date.now(),async()=>Response.json(wrong))).verified,false);
  await assert.rejects(()=>verifyAction(a,identity,'test','https://evil.test/status/200',c),e=>e.code==='POST_URL_REQUIRED');
});
test('Discord requires the right entrant and completed membership screening',async()=>{for(const [pending,expected] of [[true,false],[false,true]])assert.equal((await verifyAction({type:'discord_join',targetId:'123'},{provider:'discord',subject:'9'},'test','',{},Date.now(),async()=>Response.json({user:{id:'9'},pending}))).verified,expected);});
local('access tokens are encrypted and bound to provider, subject and entrant',async h=>{const encrypted=await seal({access:'synthetic-sensitive-access-token'},h.env,'x:1:entrant');assert(!encrypted.includes('synthetic'));assert.equal((await unseal(encrypted,h.env,'x:1:entrant')).access,'synthetic-sensitive-access-token');await assert.rejects(()=>unseal(encrypted,h.env,'x:1:other'));});
local('OAuth state is browser-bound and cannot be forged',async h=>{
  h.env.CAMPAIGNS_X_CLIENT_ID='synthetic-client';h.env.CAMPAIGNS_X_CLIENT_SECRET='synthetic-secret';
  const start=await h.request('/oauth/x/start',{method:'POST',data:{returnTo:'/campaigns/house-invitation'}});assert.equal(start.status,200);const u=new URL(start.value.url);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert(!u.searchParams.get('scope').includes('write'));
  const cb=await h.request('/oauth/x/callback?state='+u.searchParams.get('state')+'&code=not-valid');assert.equal(cb.value.error,'OAUTH_STATE');
});
test('public X identity proof checks nonce, time and API-author identity',async()=>{
  const now=Date.now(),challenge={code:'house-one-use-test-code',createdAt:now-1000,expiresAt:now+60000},env={CAMPAIGNS_X_BEARER:'synthetic-only'};
  const proof={data:{id:'200',author_id:'9',text:'Verifying '+challenge.code,created_at:new Date(now).toISOString()},includes:{users:[{id:'9',username:'actual_author'}]}};
  const result=await verifyPublicXIdentity('https://x.com/fake_handle/status/200',challenge,env,async()=>Response.json(proof));assert.equal(result.subject,'9');assert.equal(result.label,'actual_author');
  proof.data.text='A different verification code';await assert.rejects(()=>verifyPublicXIdentity('https://x.com/any/status/200',challenge,env,async()=>Response.json(proof)),e=>e.code==='IDENTITY_NOT_VERIFIED');
  proof.data.text=challenge.code;proof.data.created_at=new Date(now-3600000).toISOString();await assert.rejects(()=>verifyPublicXIdentity('https://x.com/any/status/200',challenge,env,async()=>Response.json(proof)),e=>e.code==='IDENTITY_NOT_VERIFIED');
});
local('existing app token enables X checks but not private likes or direct OAuth',async h=>{
  h.env.CAMPAIGNS_X_BEARER='synthetic-only';assert.equal(capabilities(h.env).x.configured,true);assert.equal(capabilities(h.env).x.oauth,false);
  const c=await publish(h,campaign({actions:[{id:'follow',type:'x_follow',mode:'api',target:'https://x.com/bullenciagax',targetId:'123',points:3,frequency:'once'}]}));assert.equal(c.status,'live');
  const r=await h.request('/admin/campaigns',{method:'POST',admin:true,data:campaign({slug:'private-likes',actions:[{id:'like',type:'x_like',mode:'api',target:'https://x.com/bullenciagax/status/123',targetId:'123',points:3,frequency:'once'}]})});
  const p=await h.request(`/admin/campaigns/${r.value.id}/status`,{method:'POST',admin:true,data:{status:'live',revision:1}});assert.equal(p.value.error,'CONNECTION_REQUIRED');
  assert.equal((await h.request('/oauth/x/start',{method:'POST',data:{}})).value.error,'NOT_CONFIGURED');
});
local('wallet linking preserves existing entrant and refuses a wallet owned by another entrant',async h=>{
  const u=await h.user('existing-identity'),w=testWallet();let c=await h.request('/wallet/challenge',{method:'POST',cookie:u.cookie,data:{wallet:w.address}});
  let v=await h.request('/wallet/verify',{method:'POST',cookie:u.cookie,data:{id:c.value.id,signature:w.sign(c.value.message)}});assert.equal(v.status,200);assert.equal((await h.request('/me',{cookie:v.cookie})).value.user.id,u.id);
  const other=await h.user('other-identity');c=await h.request('/wallet/challenge',{method:'POST',cookie:other.cookie,data:{wallet:w.address}});v=await h.request('/wallet/verify',{method:'POST',cookie:other.cookie,data:{id:c.value.id,signature:w.sign(c.value.message)}});assert.equal(v.value.error,'IDENTITY_IN_USE');
});
local('template rules cannot be accidentally published',async h=>{const r=await h.request('/admin/campaigns',{method:'POST',admin:true,data:campaign({rules:'Draft — replace all campaign terms before publishing this invitation.'})});const p=await h.request(`/admin/campaigns/${r.value.id}/status`,{method:'POST',admin:true,data:{status:'live',revision:1}});assert.equal(p.value.error,'DRAFT_RULES');});
