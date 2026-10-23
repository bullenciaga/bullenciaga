import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './campaigns/fixture.mjs';
import {emailConfigured,normalizeEmail,maskEmail,sendEmailCode,verifyEmailCode} from '../src/campaigns/email.mjs';

const authEnv={CAMPAIGNS_AUTH_URL:'https://abcdefghijklmnopqrst.supabase.co',CAMPAIGNS_AUTH_PUBLISHABLE_KEY:'sb_publishable_fixture_only'};
const address='person@example.test',code='11112222',subject='12345678-1234-4234-8234-123456789012';
const authResult=(email=address)=>({access_token:'fixture-access-not-real',refresh_token:'fixture-refresh-not-real',user:{id:subject,email,email_confirmed_at:'2026-01-01T00:00:00Z'}});
function provider(calls=[]){return async(url,options)=>{
  assert(url.startsWith(authEnv.CAMPAIGNS_AUTH_URL+'/auth/v1/'));
  assert.equal(options.redirect,'error');assert.equal(options.headers.apikey,authEnv.CAMPAIGNS_AUTH_PUBLISHABLE_KEY);
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({url,options,path,body});
  if(path.endsWith('/otp'))return Response.json({});
  if(path.endsWith('/verify'))return body.token===code?Response.json(authResult(body.email)):Response.json({message:'sensitive provider detail'},{status:401});
  if(path.endsWith('/logout')){assert.equal(new URL(url).searchParams.get('scope'),'local');return new Response(null,{status:204});}
  throw new Error('Unexpected fixture endpoint');
};}
const local=(name,fn)=>test(name,async t=>{const h=harness(),calls=[];Object.assign(h.env,authEnv);t.mock.method(globalThis,'fetch',provider(calls));try{await fn(h,calls,t);}finally{h.close();}});
const start=(h,email=address,cookie='')=>h.request('/email/start',{method:'POST',data:{email},cookie});
const verify=(h,cookie,value=code)=>h.request('/email/verify',{method:'POST',data:{code:value},cookie});

test('email configuration only permits the fixed HTTPS account service and a publishable key',()=>{
  assert(emailConfigured(authEnv));
  for(const url of ['http://abcdefghijklmnopqrst.supabase.co','https://evil.test','https://abcdefghijklmnopqrst.supabase.co/','https://abcdefghijklmnopqrst.supabase.co@evil.test'])assert(!emailConfigured({...authEnv,CAMPAIGNS_AUTH_URL:url}));
  assert(!emailConfigured({...authEnv,CAMPAIGNS_AUTH_PUBLISHABLE_KEY:'private-admin-key'}));
  assert.equal(normalizeEmail(' Person@EXAMPLE.test '),address);assert.equal(maskEmail(address),'p…@example.test');
  for(const email of ['','a@b@c.test','<a>@b.test','a b@c.test'])assert.throws(()=>normalizeEmail(email));
});
test('provider errors disclose neither account existence nor response details',async()=>{
  await assert.rejects(()=>sendEmailCode(address,authEnv,async()=>Response.json({error:'private'},{status:500})),e=>e.code==='EMAIL_UNAVAILABLE'&&!e.message.includes('private'));
  await assert.rejects(()=>sendEmailCode(address,authEnv,async()=>new Response('',{status:429})),e=>e.code==='EMAIL_LIMIT');
  await assert.rejects(()=>verifyEmailCode(address,code,authEnv,async()=>Response.json({error:'private'},{status:401})),e=>e.code==='INVALID_CODE'&&!e.message.includes('private'));
});
test('only a verified provider identity is accepted and its temporary session is revoked locally',async()=>{
  for(const mutate of [r=>r.user.email='someoneelse@example.test',r=>r.user.email_confirmed_at=null,r=>r.user.id='------------------------------------',r=>r.access_token='']){
    const r=authResult();mutate(r);let logout=0;
    await assert.rejects(()=>verifyEmailCode(address,code,authEnv,async(url)=>{if(url.includes('/logout?scope=local')){logout++;return new Response(null,{status:204});}return Response.json(r);}),e=>e.code==='EMAIL_IDENTITY');
    assert.equal(logout,1);
  }
  const calls=[],identity=await verifyEmailCode(address,code,authEnv,provider(calls));
  assert.equal(identity.subject,'abcdefghijklmnopqrst.supabase.co:'+subject);assert.equal(identity.label,'p…@example.test');
  assert.equal(calls.filter(c=>c.path.endsWith('/logout')).length,1);assert(!JSON.stringify(identity).includes('fixture-access'));
});
local('email sign-in requires same-origin input and a browser-bound one-use challenge',async(h,calls)=>{
  assert.equal((await h.request('/email/start',{method:'POST',data:{email:address},originHeader:'https://evil.test'})).status,403);
  const c=await start(h);assert.equal(c.status,200);assert.equal(c.value.email,'p…@example.test');assert.match(c.response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await h.request('/email/pending',{cookie:c.cookie})).value.pending,true);
  assert.equal((await verify(h,'')).value.error,'EMAIL_EXPIRED');
  const login=await verify(h,c.cookie);assert.equal(login.status,200);assert(!JSON.stringify(login.value).includes('token'));
  assert.equal((await verify(h,c.cookie)).value.error,'EMAIL_EXPIRED');
  const me=await h.request('/me',{cookie:login.cookie});assert.equal(me.value.authenticated,true);assert.equal(me.value.accounts[0].provider,'email');
  assert.equal(h.ledger.store.one('SELECT tokens FROM identities').tokens,null);assert.equal(h.ledger.store.one('SELECT count(*) n FROM challenges').n,0);
  assert(!JSON.stringify(h.ledger.store.all('SELECT * FROM audit')).includes(address));
  assert.deepEqual(calls[0].body,{email:address,create_user:true});
});
local('an email verification links to the current entrant and preserves entries',async h=>{
  const u=await h.user('existing');const c=await start(h,address,u.cookie);const login=await verify(h,u.cookie+'; '+c.cookie);
  assert.equal(login.status,200);assert.equal((await h.request('/me',{cookie:login.cookie})).value.user.id,u.id);
  assert.equal(h.ledger.store.one('SELECT count(*) n FROM users').n,1);
});
local('linking cannot take an email from another entrant or change the bound session',async(h,calls)=>{
  const u=await h.user('one'),v=await h.user('two'),c=await start(h,address,u.cookie);
  assert.equal((await verify(h,v.cookie+'; '+c.cookie)).value.error,'EMAIL_EXPIRED');assert.equal(calls.length,1);
  h.ledger.store.identify('email','abcdefghijklmnopqrst.supabase.co:'+subject,'p…@example.test',v.id);
  assert.equal((await verify(h,u.cookie+'; '+c.cookie)).value.error,'IDENTITY_IN_USE');
  assert.equal(h.ledger.store.one("SELECT user_id FROM identities WHERE provider='email'").user_id,v.id);
});
local('five failed codes lock the challenge and cannot create an identity',async(h,calls)=>{
  const c=await start(h);for(let i=0;i<5;i++)assert.equal((await verify(h,c.cookie,'87654321')).value.error,'INVALID_CODE');
  assert.equal((await verify(h,c.cookie)).value.error,'EMAIL_LOCKED');assert.equal(calls.filter(c=>c.path.endsWith('/verify')).length,5);
  assert.equal(h.ledger.store.one('SELECT count(*) n FROM users').n,0);
});
local('concurrent code submissions make only one provider verification and one entrant',async(h,calls,t)=>{
  const c=await start(h);let unblock,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>unblock=r),mock=provider(calls);
  t.mock.method(globalThis,'fetch',async(u,o)=>{if(u.endsWith('/verify')){entered();await gate;}return mock(u,o);});
  const first=verify(h,c.cookie);await waiting;const second=await verify(h,c.cookie);assert.equal(second.value.error,'EMAIL_CHECKING');unblock();assert.equal((await first).status,200);
  assert.equal(calls.filter(c=>c.path.endsWith('/verify')).length,1);assert.equal(h.ledger.store.one('SELECT count(*) n FROM users').n,1);
});
local('expired and cancelled challenges cannot sign in; provider outage keeps a recoverable request',async(h,calls,t)=>{
  const c=await start(h);t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline');});
  assert.equal((await verify(h,c.cookie)).value.error,'EMAIL_UNAVAILABLE');assert.equal(JSON.parse(h.ledger.store.one("SELECT doc FROM challenges WHERE kind='email'").doc).verifying,false);
  await h.request('/email/cancel',{method:'POST',data:{},cookie:c.cookie});assert.equal((await verify(h,c.cookie)).value.error,'EMAIL_EXPIRED');
  t.mock.method(globalThis,'fetch',provider(calls));const d=await start(h,'second@example.test');h.ledger.store.run('UPDATE challenges SET expires_at=?',Date.now()-1);
  assert.equal((await verify(h,d.cookie)).value.error,'EMAIL_EXPIRED');
});
local('email delivery is rate-limited before contacting the shared service',async(h,calls)=>{
  const first=await start(h);assert.equal(first.status,200);assert.equal((await start(h,address,first.cookie)).status,429);assert.equal((await start(h)).status,429);
  assert.equal(calls.length,1);
});
local('signing out invalidates a pending code request',async h=>{
  const u=await h.user(),c=await start(h,address,u.cookie),cookie=u.cookie+'; '+c.cookie;
  await h.request('/logout',{method:'POST',data:{},cookie});assert.equal((await verify(h,cookie)).value.error,'EMAIL_EXPIRED');assert.equal((await h.request('/me',{cookie:u.cookie})).value.authenticated,false);
});
local('missing email configuration keeps email sign-in unavailable',async h=>{
  delete h.env.CAMPAIGNS_AUTH_PUBLISHABLE_KEY;assert.equal((await h.request('/config')).value.email.configured,false);assert.equal((await start(h)).value.error,'NOT_CONFIGURED');
});
