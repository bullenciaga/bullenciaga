import { ACTIONS, VERSION, fail, CampaignError, validateCampaign, canEnter, periodFor, randomToken, sha, b64, unb64, encode, decode58, string, selectWinners, normalizeAnswer } from './model.mjs';
import { CampaignStore } from './store.mjs';
import { PROVIDERS, capabilities, exchange, seal, accessToken, verifyAction, verifyPublicXIdentity } from './providers.mjs';
import { emailConfigured, normalizeEmail, maskEmail, sendEmailCode, verifyEmailCode } from './email.mjs';
import { verifyTelegramMembership, verifyInstagramComment } from './automatic.mjs';
import { newsletterRoute, subscriptionProof, exportNewsletter } from './newsletter.mjs';

const SESSION='__Host-bullen_campaign_session', OAUTH='__Host-bullen_campaign_oauth', XPROOF='__Host-bullen_campaign_x';
const EMAIL='__Host-bullen_campaign_email';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'};
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const readCookie=(request,name)=>(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1) || '';
async function body(request) {
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail('JSON_REQUIRED','Send JSON data.',415);
  if(Number(request.headers.get('Content-Length')||0)>96000)fail('TOO_LARGE','The request is too large.',413);
  if(!request.body)fail('INVALID_JSON','Request data is required.');
  const reader=request.body.getReader();let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>96000){await reader.cancel();fail('TOO_LARGE','The request is too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let p=0;for(const v of chunks){bytes.set(v,p);p+=v.length;}
  let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('INVALID_JSON','Check the request data.');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_JSON','An object is required.');return value;
}
function originGuard(request,env) {
  const url=new URL(request.url);
  if(url.origin!==env.CAMPAIGNS_ORIGIN)fail('WRONG_ORIGIN','Use the campaign’s original site.',403);
  if(!['GET','HEAD'].includes(request.method) && request.headers.get('Origin')!==url.origin)fail('BAD_ORIGIN','Please reload the campaign and try again.',403);
}
function publicCampaign(c,stats,owner=false) {
  const doc={...c.doc,actions:c.doc.actions.map(({answers,...a})=>owner&&answers?{...a,answers}:a)};
  return {id:c.id,...doc,status:c.status,revision:c.revision,commitment:c.commitment,stats,draw:c.draw?JSON.parse(c.draw):null};
}
export class CampaignLedger {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.store=new CampaignStore(ctx.storage.sql,fn=>ctx.storage.transactionSync(fn));this.lastClean=0;}
  async fetch(request) {
    try {
      originGuard(request,this.env);
      const now=Date.now();if(now-this.lastClean>60000){this.store.clean(now);this.lastClean=now;}
      const ip=request.headers.get('CF-Connecting-IP') || 'local';
      this.store.rate('ip:'+await sha(ip+Math.floor(now/86400000)),100,now);
      return await this.route(request,new URL(request.url),now);
    }catch(error){
      if(error instanceof CampaignError)return json({error:error.code,message:error.message},error.status);
      // No raw errors: provider bodies, authorization headers and SQL data can
      // contain private information. The ID can be correlated in server logs.
      const incident=crypto.randomUUID();console.error(JSON.stringify({service:'campaigns',incident,error:'UNEXPECTED'}));
      return json({error:'UNAVAILABLE',message:'The campaign service could not complete this request. No success is implied. Please retry.',incident},503);
    }
  }
  async session(request,required=true){
    const token=readCookie(request,SESSION),s=token.length===43?this.store.one('SELECT user_id FROM sessions WHERE hash=? AND expires_at>?',await sha(token),Date.now()):null;
    if(!s&&required)fail('SIGN_IN_REQUIRED','Sign in to save your entries.',401);return s?.user_id || null;
  }
  async login(user){const token=randomToken();this.store.run('INSERT INTO sessions VALUES(?,?,?)',await sha(token),user,Date.now()+7*86400000);return cookie(SESSION,token,7*86400);}
  async admin(request){
    const authorization=request.headers.get('Authorization')||'';
    if(!/^Bearer \S{16,512}$/.test(authorization))fail('OWNER_REQUIRED','Unlock the studio with your existing House control key.',401);
    if(!this.env.CONTROL_AUTH)fail('OWNER_UNAVAILABLE','The owner authentication service is unavailable.',503);
    let result;try{result=await this.env.CONTROL_AUTH.fetch(new Request('https://rpc-proxy.internal/rpc/control-room/authorize',{method:'POST',headers:{Authorization:authorization},redirect:'manual',signal:AbortSignal.timeout(8000)}));}catch{fail('OWNER_UNAVAILABLE','The owner authentication service did not respond.',503);}
    if(result.status!==204)fail(result.status===403?'OWNER_REQUIRED':'OWNER_UNAVAILABLE',result.status===403?'That control key was not accepted.':'The owner authentication service is unavailable.',result.status===403?403:503);
  }
  member(c,user){const m=this.store.one('SELECT * FROM members WHERE campaign_id=? AND user_id=?',c.id,user);if(!m)fail('JOIN_REQUIRED','Accept the campaign rules before taking part.',409);if(m.disqualified)fail('DISQUALIFIED','This entry account has been excluded. Contact the organizer for a review.',403);return m;}
  async route(request,url,now){
    const path=url.pathname.replace(/^\/campaigns\/api/,'')||'/',method=request.method,s=this.store;
    if(path==='/health'&&method==='GET')return json({ok:true,version:VERSION,storage:'durable',mode:'unlinked'});
    if(path==='/config'&&method==='GET')return json({version:VERSION,actions:ACTIONS,providers:capabilities(this.env),wallet:true,email:{configured:emailConfigured(this.env),codeLength:8,newsletter:emailConfigured(this.env)&&!!this.env.CAMPAIGNS_TOKEN_KEY,service:'on display.'}});
    if(path==='/me'&&method==='GET'){
      const user=await this.session(request,false);if(!user)return json({authenticated:false});
      return json({authenticated:true,user:s.one('SELECT id,name FROM users WHERE id=?',user),accounts:s.all('SELECT provider,subject,label FROM identities WHERE user_id=?',user)});
    }
    if(path==='/logout'&&method==='POST'){
      const token=readCookie(request,SESSION);if(token)s.run('DELETE FROM sessions WHERE hash=?',await sha(token));
      const emailToken=readCookie(request,EMAIL);if(emailToken)s.run("DELETE FROM challenges WHERE id=? AND kind='email'",await sha(emailToken));
      const response=json({ok:true},200,{'Set-Cookie':cookie(SESSION,'',0)});response.headers.append('Set-Cookie',cookie(EMAIL,'',0));return response;
    }
    if(path.startsWith('/email/'))return this.email(request,path.slice(7),now);
    if(path.startsWith('/newsletter/')){
      const phase=path.slice(12);if(method!==(phase==='status'?'GET':'POST'))fail('METHOD','Use the newsletter form.',405);
      return json(await newsletterRoute(this,request,phase,method==='POST'?await body(request):{},await this.session(request,false),now));
    }
    if(path==='/wallet/challenge'&&method==='POST'){
      const data=await body(request);decode58(data.wallet);s.rate('wallet:'+data.wallet,6,now);
      const id=randomToken(),expires=now+300000;
      const message=`BULLENCIAGA campaign sign-in\nDomain: ${url.host}\nWallet: ${data.wallet}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\n\nVerify your identity for giveaway entries. This signature cannot transfer assets or authorize a purchase.`;
      s.run('INSERT INTO challenges VALUES(?,?,?,?)',id,'wallet',JSON.stringify({wallet:data.wallet,message,origin:url.origin,user:await this.session(request,false)}),expires);
      return json({id,message,expiresAt:expires});
    }
    if(path==='/wallet/verify'&&method==='POST'){
      const data=await body(request),c=s.one("SELECT * FROM challenges WHERE id=? AND kind='wallet' AND expires_at>?",String(data.id),now);
      if(!c)fail('CHALLENGE_EXPIRED','Request a fresh wallet sign-in.',401);
      const d=JSON.parse(c.doc);let valid=false;
      if(d.user!==await this.session(request,false))fail('SESSION_CHANGED','Sign in again from the same account session.',401);
      try{const sig=unb64(string(data.signature,100,'signature'));const key=await crypto.subtle.importKey('raw',decode58(d.wallet),'Ed25519',false,['verify']);valid=sig.length===64&&d.origin===url.origin&&await crypto.subtle.verify('Ed25519',key,sig,encode.encode(d.message));}catch{}
      if(!valid)fail('BAD_SIGNATURE','The signature did not match this wallet challenge.',401);
      // Re-read after cryptography awaits: only one concurrent request consumes.
      const user=s.transaction(()=>{if(!s.one('DELETE FROM challenges WHERE id=? AND expires_at>? RETURNING id',c.id,Date.now()))fail('CHALLENGE_USED','This sign-in was already used.',401);return s.identify('wallet',d.wallet,`${d.wallet.slice(0,5)}…${d.wallet.slice(-4)}`,d.user);});
      return json({ok:true},200,{'Set-Cookie':await this.login(user)});
    }
    const oauth=path.match(/^\/oauth\/(x|discord|telegram)\/(start|callback)$/);
    if(oauth)return this.oauth(request,url,oauth[1],oauth[2],now);
    if(path==='/x/challenge'&&method==='POST'){
      const user=await this.session(request,false);if(!this.env.CAMPAIGNS_X_BEARER)fail('NOT_CONFIGURED','X public account verification is not configured.',503);
      s.rate('xproof:'+(user||await sha(request.headers.get('CF-Connecting-IP')||'local')),3,now);const id=randomToken(),code='house-'+randomToken().slice(0,24),browser=randomToken(),expiresAt=now+15*60000;
      s.run('INSERT INTO challenges VALUES(?,?,?,?)',id,'x-proof',JSON.stringify({user,code,browser:await sha(browser),createdAt:now,expiresAt}),expiresAt);
      return json({id,code,expiresAt,text:`Verifying my X account for BULLENCIAGA campaigns. ${code}`},200,{'Set-Cookie':cookie(XPROOF,browser,900)});
    }
    if(path==='/x/verify'&&method==='POST'){
      const current=await this.session(request,false),data=await body(request);s.rate('xverify:'+(current||await sha(request.headers.get('CF-Connecting-IP')||'local')),4,now);
      if(!this.env.CAMPAIGNS_X_BEARER)fail('NOT_CONFIGURED','X verification is unavailable.',503);
      const challenge=s.one("SELECT * FROM challenges WHERE id=? AND kind='x-proof' AND expires_at>?",String(data.id),now);
      if(!challenge)fail('CHALLENGE_EXPIRED','Start a fresh X account verification.',401);
      const d=JSON.parse(challenge.doc),browser=readCookie(request,XPROOF);if(d.user!==current||!browser||await sha(browser)!==d.browser)fail('WRONG_ACCOUNT','This verification belongs to another browser or entrant.',403);
      const identity=await verifyPublicXIdentity(string(data.url,1200,'verification post URL'),d,this.env);
      const user=s.transaction(()=>{if(!s.one('DELETE FROM challenges WHERE id=? AND expires_at>? RETURNING id',challenge.id,Date.now()))fail('CHALLENGE_USED','This verification was already used or expired.',401);const identified=s.identify('x',identity.subject,identity.label,current);s.log(identified,'identity.x-verified',identified,{postId:identity.postId},now);return identified;});
      const response=json({ok:true,account:identity.label},200,{'Set-Cookie':await this.login(user)});response.headers.append('Set-Cookie',cookie(XPROOF,'',0));return response;
    }
    if(path.startsWith('/admin')){await this.admin(request);return this.adminRoute(request,url,path.slice(6)||'/',now);}
    if(path==='/campaigns'&&method==='GET'){
      return json({campaigns:s.all("SELECT id FROM campaigns WHERE status!='draft' ORDER BY created_at DESC LIMIT 100").map(x=>{const c=s.campaign(x.id);return publicCampaign(c,s.stats(c.id));})});
    }
    const match=path.match(/^\/campaigns\/([a-z0-9-]+)(?:\/(.*))?$/);
    if(!match)fail('NOT_FOUND','Not found.',404);
    const c=s.requireCampaign(match[1]),actionPath=match[2]||'';
    if(c.status==='draft')fail('NOT_FOUND','Campaign not found.',404);
    if(actionPath===''&&method==='GET')return json(publicCampaign(c,s.stats(c.id)));
    if(actionPath==='draw'&&method==='GET'){
      if(!c.draw)fail('NOT_FOUND','No draw has been made.',404);return json(JSON.parse(c.draw));
    }
    const user=await this.session(request);
    if(actionPath==='me'&&method==='GET')return json({member:s.one('SELECT code,consent_revision,disqualified,reason FROM members WHERE campaign_id=? AND user_id=?',c.id,user),entries:s.all('SELECT id,action_id,period,status,points,evidence,created_at,note FROM entries WHERE campaign_id=? AND user_id=? ORDER BY created_at DESC LIMIT 500',c.id,user),stats:s.stats(c.id,user)});
    if(actionPath==='join'&&method==='POST'){
      const data=await body(request);canEnter(c,now);
      if(data.accepted!==true||data.revision!==c.revision)fail('RULES_REQUIRED','Read and accept the current campaign rules.',409);
      const contact=string(data.contact||'',200,'prize contact',false);
      const member=s.transaction(()=>s.join(c,user,typeof data.ref==='string'?data.ref.slice(0,30):null,now,contact));return json({joined:true,referralCode:member.code});
    }
    const act=actionPath.match(/^actions\/([a-z0-9_-]+)\/(visit|claim|challenge)$/);
    if(!act||method!=='POST')fail('NOT_FOUND','Not found.',404);
    const a=c.doc.actions.find(x=>x.id===act[1]);if(!a)fail('NOT_FOUND','Action not found.',404);
    canEnter(c,now);this.member(c,user);const period=periodFor(a,c.doc,now);
    if(act[2]==='challenge'){
      if(a.type!=='instagram_comment'||a.mode!=='api')fail('NOT_FOUND','Challenge not available for this action.',404);
      if(!capabilities(this.env).instagram.configured)fail('NOT_CONFIGURED','Instagram comment verification is not connected yet.',503);
      s.rate('instagram-code:'+user,3,now,600000);
      const data=await body(request),username=string(data.username,30,'Instagram username').replace(/^@/,'').toLowerCase();
      if(!/^[a-z0-9_.]{1,30}$/.test(username))fail('INVALID_USERNAME','Enter your Instagram username, without a link.');
      const id=randomToken(),code='house-'+randomToken().slice(0,20),expiresAt=now+15*60000;
      s.transaction(()=>{
        s.run("DELETE FROM challenges WHERE kind='instagram-comment' AND json_extract(doc,'$.user')=? AND json_extract(doc,'$.campaign')=? AND json_extract(doc,'$.action')=?",user,c.id,a.id);
        s.run('INSERT INTO challenges VALUES(?,?,?,?)',id,'instagram-comment',JSON.stringify({user,campaign:c.id,action:a.id,period,username,code,createdAt:now,revision:c.revision}),expiresAt);
      });return json({id,code,expiresAt});
    }
    if(act[2]==='visit'){
      if(!a.target)fail('NO_TARGET','This action does not have a link.');
      s.run('INSERT INTO visits VALUES(?,?,?,?,?) ON CONFLICT(campaign_id,user_id,action_id,period) DO NOTHING',c.id,user,a.id,period,now);
      return json({url:a.target,verification:a.mode});
    }
    s.rate('claim:'+user,15,now);const data=await body(request);
    const existing=s.one('SELECT id,status FROM entries WHERE campaign_id=? AND user_id=? AND action_id=? AND period=?',c.id,user,a.id,period);
    if(existing && existing.status!=='rejected')return json({id:existing.id,status:existing.status,duplicate:true});
    let evidence=string(data.evidence||'',3000,'evidence',false);
    let status='approved',proof={method:a.mode},proofKey=null,instagram=null,challengeID=null;
    if(a.mode==='review'){if(evidence.length<5)fail('EVIDENCE_REQUIRED','Provide a post link, proof link or a useful description for review.');status='pending';}
    else if(a.mode==='visit'){
      const v=s.one('SELECT started_at FROM visits WHERE campaign_id=? AND user_id=? AND action_id=? AND period=?',c.id,user,a.id,period);
      if(!v || now-v.started_at<5000)fail('VISIT_FIRST','Open the page first, then return to record your visit.',409);
      proof={method:'visit',startedAt:v.started_at,meaning:'Outbound link opened; no follow, like, viewing duration or engagement verified'};
    }else if(a.mode==='answer'){
      s.rate('answer:'+c.id+':'+a.id+':'+user,5,now,600000);
      const answer=normalizeAnswer(string(data.answer||'',200,'your answer'));
      if(!a.answers?.includes(answer))fail('WRONG_ANSWER','That answer does not match. Check it and try again.',409);
      evidence='';proof={method:'exact-answer',checkedAt:now};
    }else if(a.mode==='confirmation'){
      evidence='';proof=subscriptionProof(s,c.id,user,a.id);
    }else if(a.mode==='api' && a.type==='telegram'){
      s.rate('provider:'+user,6,now);
      const result=await verifyTelegramMembership(a,s.one("SELECT * FROM identities WHERE user_id=? AND provider='telegram'",user),this.env);
      if(!result.verified)fail('NOT_VERIFIED','Telegram has not confirmed your membership. Join the group or channel and check again.',409);
      evidence='';proof=result.proof;
    }else if(a.mode==='api' && a.type==='instagram_comment'){
      s.rate('provider:'+user,6,now);
      const challenge=s.one("SELECT * FROM challenges WHERE id=? AND kind='instagram-comment' AND expires_at>?",String(data.challenge||''),now);
      if(!challenge)fail('CHALLENGE_EXPIRED','Get a fresh Instagram comment code first.',401);
      const d=JSON.parse(challenge.doc);
      if(d.user!==user||d.campaign!==c.id||d.action!==a.id||d.period!==period||d.revision!==c.revision)fail('WRONG_ACCOUNT','This code belongs to another entrant, action or campaign period.',403);
      const result=await verifyInstagramComment(a,d,c.doc,this.env);
      if(!result.verified)fail('NOT_VERIFIED','Your matching comment is not visible yet. Add the code as a separate word in a new comment, then check again.',409);
      evidence='';instagram=result.identity;challengeID=challenge.id;proof=result.proof;proofKey=result.key;
    }else if(a.mode==='api'){
      s.rate('provider:'+user,6,now);
      const provider=ACTIONS[a.type].provider,identity=s.one('SELECT * FROM identities WHERE user_id=? AND provider=?',user,provider);
      if(!identity || (!identity.tokens && !(provider==='x'&&this.env.CAMPAIGNS_X_BEARER)))fail('CONNECT_ACCOUNT',`Connect your ${provider==='x'?'X':'Discord'} account first.`,401);
      if(a.type==='x_like'&&!identity.tokens)fail('OAUTH_REQUIRED','X likes require a direct OAuth connection. Public account verification cannot read private likes.',409);
      const token=await accessToken(identity,this.env,t=>s.run('UPDATE identities SET tokens=? WHERE provider=? AND subject=?',t,provider,identity.subject));
      const result=await verifyAction(a,identity,token,evidence,c.doc,now);
      if(!result.verified)fail('NOT_VERIFIED','The platform has not confirmed this action. Complete it, then try again.',409);
      proof=result.proof;proofKey=result.key||null;
    }
    const result=s.transaction(()=>{
      const fresh=s.requireCampaign(c.id);canEnter(fresh,Date.now());this.member(fresh,user);
      if(fresh.revision!==c.revision)fail('CAMPAIGN_CHANGED','Campaign changed; reload before entering.',409);
      if(fresh.snapshot)fail('CLOSED','The draw snapshot is frozen.',409);
      if(periodFor(a,fresh.doc,Date.now())!==period)fail('PERIOD_CHANGED','The daily entry period changed. Start this action again.',409);
      const duplicate=s.one('SELECT id,status FROM entries WHERE campaign_id=? AND user_id=? AND action_id=? AND period=?',c.id,user,a.id,period);
      if(duplicate && duplicate.status!=='rejected')return {...duplicate,duplicate:true};
      if(proofKey && s.one('SELECT id FROM entries WHERE campaign_id=? AND action_id=? AND proof_key=? AND id!=?',c.id,a.id,proofKey,duplicate?.id||''))fail('PROOF_REUSED','That post has already been used for this action.',409);
      if(a.mode==='confirmation')subscriptionProof(s,c.id,user,a.id);
      if(instagram){
        if(!s.one("DELETE FROM challenges WHERE id=? AND kind='instagram-comment' AND expires_at>? RETURNING id",challengeID,Date.now()))fail('CHALLENGE_EXPIRED','This comment code was already used or expired.',401);
        s.identify('instagram',instagram.subject,instagram.label,user);
      }
      const id=duplicate?.id||crypto.randomUUID();
      s.run('INSERT INTO entries(id,campaign_id,user_id,action_id,period,status,points,evidence,proof,proof_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(campaign_id,user_id,action_id,period) DO UPDATE SET status=excluded.status,evidence=excluded.evidence,proof=excluded.proof,proof_key=excluded.proof_key,updated_at=excluded.updated_at,note=\'\'',id,c.id,user,a.id,period,status,a.points,evidence,JSON.stringify(proof),proofKey,now,now);
      s.log(user,status==='pending'?'entry.submitted':'entry.verified',id,{campaign:c.id,action:a.id,method:a.mode},now);
      if(status==='approved')s.referral(fresh,user,now);
      return {id,status,points:status==='approved'?a.points:0};
    });
    return json(result);
  }
  async email(request,phase,now){
    if(!emailConfigured(this.env))fail('NOT_CONFIGURED','Email sign-in is not connected yet.',503);
    const s=this.store,current=await this.session(request,false),token=readCookie(request,EMAIL);
    const id=token.length===43?await sha(token):'';
    const challenge=id?s.one("SELECT * FROM challenges WHERE id=? AND kind='email' AND expires_at>?",id,now):null;
    const pending=challenge?JSON.parse(challenge.doc):null;
    const bound=pending&&pending.user===current;
    if(phase==='pending'&&request.method==='GET')return json(bound?{pending:true,email:maskEmail(pending.email),expiresAt:challenge.expires_at,retryAt:pending.sentAt+60000}:{pending:false});
    if(request.method!=='POST')fail('METHOD','Use the email sign-in form.',405);
    if(phase==='cancel'){
      if(bound)s.run("DELETE FROM challenges WHERE id=? AND kind='email'",id);
      return json({ok:true},200,{'Set-Cookie':cookie(EMAIL,'',0)});
    }
    const data=await body(request),ipHash=await sha(request.headers.get('CF-Connecting-IP')||'local');
    if(phase==='start'){
      const email=normalizeEmail(data.email),emailHash=await sha(email);
      if(bound&&now-pending.sentAt<60000)fail('EMAIL_LIMIT','Wait a minute before requesting another code.',429);
      s.rate('email-minute:'+emailHash,1,now);s.rate('email-hour:'+emailHash,6,now,3600000);
      s.rate('email-ip:'+ipHash,5,now,600000);s.rate('email-day:'+ipHash,20,now,86400000);
      const nextToken=randomToken(),nextId=await sha(nextToken),expiresAt=now+600000;
      await sendEmailCode(email,this.env);
      if(await this.session(request,false)!==current)fail('WRONG_ACCOUNT','Your account changed. Start email sign-in again.',409);
      s.transaction(()=>{
        if(bound)s.run("DELETE FROM challenges WHERE id=? AND kind='email'",id);
        s.run('INSERT INTO challenges VALUES(?,?,?,?)',nextId,'email',JSON.stringify({email,user:current,sentAt:now,attempts:0,verifying:false}),expiresAt);
      });
      return json({pending:true,email:maskEmail(email),expiresAt,retryAt:now+60000},200,{'Set-Cookie':cookie(EMAIL,nextToken,600)});
    }
    if(phase!=='verify')fail('NOT_FOUND','Not found.',404);
    s.rate('email-verify:'+ipHash,20,now);
    if(!bound)fail('EMAIL_EXPIRED','Request a fresh code from this browser.',401);
    const code=typeof data.code==='string'?data.code.trim():'';
    if(!/^\d{8}$/.test(code))fail('INVALID_CODE','Enter the eight-digit code from your latest email.',401);
    const locked=s.transaction(()=>{
      const fresh=s.one("SELECT * FROM challenges WHERE id=? AND kind='email' AND expires_at>?",id,Date.now());
      if(!fresh)fail('EMAIL_EXPIRED','Request a fresh code.',401);
      const d=JSON.parse(fresh.doc);
      if(d.attempts>=5)fail('EMAIL_LOCKED','Too many attempts. Request a new code.',429);
      if(d.verifying)fail('EMAIL_CHECKING','Your code is already being checked.',409);
      d.attempts++;d.verifying=true;s.run('UPDATE challenges SET doc=? WHERE id=?',JSON.stringify(d),id);return d;
    });
    try{
      const identity=await verifyEmailCode(locked.email,code,this.env);
      if(await this.session(request,false)!==current)fail('WRONG_ACCOUNT','Your account changed. Start email sign-in again.',409);
      const user=s.transaction(()=>{
        if(!s.one("DELETE FROM challenges WHERE id=? AND kind='email' AND expires_at>? RETURNING id",id,Date.now()))fail('EMAIL_EXPIRED','This code request was already used or expired.',401);
        const user=s.identify('email',identity.subject,identity.label,current);s.log(user,'identity.email-verified',user,{service:'shared-account-auth'},now);return user;
      });
      const response=json({ok:true},200,{'Set-Cookie':await this.login(user)});response.headers.append('Set-Cookie',cookie(EMAIL,'',0));return response;
    }finally{
      const fresh=s.one("SELECT doc FROM challenges WHERE id=? AND kind='email'",id);
      if(fresh){const d=JSON.parse(fresh.doc);d.verifying=false;s.run('UPDATE challenges SET doc=? WHERE id=?',JSON.stringify(d),id);}
    }
  }
  async oauth(request,url,provider,phase,now){
    const s=this.store,p=PROVIDERS[provider];if(!capabilities(this.env)[provider].oauth)fail('NOT_CONFIGURED','Direct social sign-in is not configured. Use wallet sign-in and available public account verification.',503);
    const callback=`${this.env.CAMPAIGNS_ORIGIN}/campaigns/api/oauth/${provider}/callback`;
    if(phase==='start'){
      if(request.method!=='POST')fail('METHOD','Use the sign-in button.',405);
      const data=await body(request),user=await this.session(request,false),state=randomToken(),browser=randomToken(),verifier=randomToken(),nonce=randomToken();
      const returnTo=typeof data.returnTo==='string'&&/^\/campaigns(?:\/[a-z0-9-]+)?$/.test(data.returnTo)?data.returnTo:'/campaigns';
      s.run('INSERT INTO challenges VALUES(?,?,?,?)',state,'oauth',JSON.stringify({provider,user,browser:await sha(browser),verifier,nonce,returnTo}),now+600000);
      const u=new URL(p.authorize);for(const [k,v] of Object.entries({client_id:this.env[p.id],redirect_uri:callback,response_type:'code',scope:p.scopes,state}))u.searchParams.set(k,v);
      if(provider==='x'||provider==='telegram'){u.searchParams.set('code_challenge',b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(verifier)))));u.searchParams.set('code_challenge_method','S256');}
      if(provider==='telegram')u.searchParams.set('nonce',nonce);
      return json({url:u.href},200,{'Set-Cookie':cookie(OAUTH,browser,600)});
    }
    if(request.method!=='GET')fail('METHOD','Unexpected callback method.',405);
    const state=url.searchParams.get('state')||'',challenge=s.one("SELECT * FROM challenges WHERE id=? AND kind='oauth' AND expires_at>?",state,now);
    if(!challenge)fail('OAUTH_EXPIRED','The sign-in expired. Return to the campaign and reconnect.',401);
    const d=JSON.parse(challenge.doc),browser=readCookie(request,OAUTH),current=await this.session(request,false);
    if(d.provider!==provider || !browser || await sha(browser)!==d.browser || d.user!==current)fail('OAUTH_STATE','Sign in again from the same browser.',401);
    if(!s.one('DELETE FROM challenges WHERE id=? RETURNING id',state))fail('OAUTH_USED','This sign-in was already used.',401);
    if(url.searchParams.has('error'))return new Response(null,{status:303,headers:{...headers,Location:d.returnTo+'?connection=cancelled','Set-Cookie':cookie(OAUTH,'',0)}});
    const code=url.searchParams.get('code');if(!code||code.length>4096)fail('OAUTH_FAILED','The platform did not return an authorization code.',401);
    const identity=await exchange(provider,code,d.verifier,callback,this.env,fetch,d.nonce);
    if(await this.session(request,false)!==d.user)fail('SESSION_CHANGED','Your account changed. Reconnect from the campaign.',401);
    const user=s.identify(provider,identity.subject,identity.label,d.user);
    const encrypted=identity.tokens?await seal(identity.tokens,this.env,`${provider}:${identity.subject}:${user}`):null;
    s.run('UPDATE identities SET tokens=?,label=? WHERE provider=? AND subject=? AND user_id=?',encrypted,identity.label,provider,identity.subject,user);
    const response=new Response(null,{status:303,headers:{...headers,Location:d.returnTo+'?connection=success'}});response.headers.append('Set-Cookie',await this.login(user));response.headers.append('Set-Cookie',cookie(OAUTH,'',0));return response;
  }
  async adminRoute(request,url,path,now){
    const s=this.store,method=request.method;
    if(path==='/newsletter/export'&&method==='GET')return json(await exportNewsletter(this,(url.searchParams.get('after')||'').slice(0,100)));
    if(path==='/config'&&method==='GET')return json({version:VERSION,providers:capabilities(this.env),actions:ACTIONS,email:{configured:emailConfigured(this.env),codeLength:8,newsletter:emailConfigured(this.env)&&!!this.env.CAMPAIGNS_TOKEN_KEY,service:'on display.'}});
    if(path==='/campaigns'&&method==='GET')return json({campaigns:s.all('SELECT id FROM campaigns ORDER BY created_at DESC LIMIT 200').map(r=>{const c=s.campaign(r.id);return publicCampaign(c,s.stats(c.id),true);})});
    if(path==='/campaigns'&&method==='POST'){
      const doc=validateCampaign(await body(request));if(s.campaign(doc.slug))fail('SLUG_TAKEN','That campaign link is already in use.',409);
      const id=crypto.randomUUID();s.transaction(()=>{s.run("INSERT INTO campaigns(id,slug,doc,status,revision,created_at,updated_at) VALUES(?,?,?,'draft',1,?,?)",id,doc.slug,JSON.stringify(doc),now,now);s.log('owner','campaign.created',id,{slug:doc.slug},now);});return json(publicCampaign(s.campaign(id),s.stats(id),true),201);
    }
    const match=path.match(/^\/campaigns\/([a-z0-9-]+)(?:\/(.*))?$/);if(!match)fail('NOT_FOUND','Not found.',404);
    const c=s.requireCampaign(match[1]),part=match[2]||'';
    if(part===''&&method==='GET')return json(publicCampaign(c,s.stats(c.id),true));
    if(part===''&&method==='PUT'){
      const data=await body(request),doc=validateCampaign(data);
      s.transaction(()=>{
        const fresh=s.requireCampaign(c.id);if(data.revision!==fresh.revision)fail('EDIT_CONFLICT','Someone saved a newer version. Reload before editing.',409);
        if(fresh.commitment){const mutable=new Set(['title','description','cover']);for(const k of Object.keys(doc))if(!mutable.has(k)&&JSON.stringify(doc[k])!==JSON.stringify(fresh.doc[k]))fail('RULES_LOCKED','Published rules, dates, actions and prizes are locked. Duplicate the campaign to change them.',409);}
        const clash=s.campaign(doc.slug);if(clash&&clash.id!==c.id)fail('SLUG_TAKEN','That campaign link is already in use.',409);
        s.run('UPDATE campaigns SET slug=?,doc=?,revision=revision+1,updated_at=? WHERE id=?',doc.slug,JSON.stringify(doc),now,c.id);s.log('owner','campaign.edited',c.id,{revision:fresh.revision+1},now);
      });return json(publicCampaign(s.campaign(c.id),s.stats(c.id),true));
    }
    if(part==='duplicate'&&method==='POST'){
      const data=await body(request),doc=validateCampaign({...c.doc,slug:data.slug,title:c.doc.title+' — copy'});
      if(s.campaign(doc.slug))fail('SLUG_TAKEN','That campaign link is already in use.',409);
      const id=crypto.randomUUID();s.transaction(()=>{s.run("INSERT INTO campaigns(id,slug,doc,status,revision,created_at,updated_at) VALUES(?,?,?,'draft',1,?,?)",id,doc.slug,JSON.stringify(doc),now,now);s.log('owner','campaign.duplicated',id,{source:c.id},now);});return json(publicCampaign(s.campaign(id),s.stats(id),true),201);
    }
    if(part==='status'&&method==='POST'){
      const data=await body(request);if(!['live','paused','closed'].includes(data.status))fail('INVALID_STATUS','Choose live, paused or closed.');
      let seed=c.seed,commitment=c.commitment;if(!seed){seed=randomToken();commitment=await sha(seed);}
      s.transaction(()=>{
        const fresh=s.requireCampaign(c.id);if(data.revision!==fresh.revision)fail('EDIT_CONFLICT','Reload the campaign before changing its status.',409);
        if(fresh.snapshot || fresh.status==='closed')fail('CLOSED','Closed campaigns cannot be reopened. Duplicate it for a new round.',409);
        if(fresh.status==='draft'&&data.status!=='live')fail('INVALID_STATUS','Publish a draft before pausing or closing it.',409);
        if(data.status==='live'){
          if(fresh.doc.rules.length<40 || fresh.doc.eligibility.length<10 || fresh.doc.privacy.length<30)fail('RULES_REQUIRED','Add campaign rules, eligibility and a privacy notice before publishing.');
          if([fresh.doc.rules,fresh.doc.eligibility,fresh.doc.privacy].some(text=>/^draft\b/i.test(text.trim())))fail('DRAFT_RULES','Replace the draft rules, eligibility and privacy text with final campaign details before publishing.');
          if(Date.parse(fresh.doc.endsAt)<=now)fail('PAST_END','The end date is already in the past.');
          for(const a of fresh.doc.actions)if(a.mode==='api'&&!capabilities(this.env)[ACTIONS[a.type].provider]?.configured)fail('CONNECTION_REQUIRED',`Configure ${ACTIONS[a.type].provider} or change its action to organizer review before publishing.`,409);
          if(fresh.doc.actions.some(a=>a.type==='x_like'&&a.mode==='api')&&!capabilities(this.env).x.oauth)fail('CONNECTION_REQUIRED','Automatic X likes require OAuth user access. Use organizer review until that connection is configured.',409);
          if(fresh.doc.actions.some(a=>a.mode==='confirmation')&&(!emailConfigured(this.env)||!this.env.CAMPAIGNS_TOKEN_KEY))fail('CONNECTION_REQUIRED','Configure email verification and encrypted storage before using confirmed newsletter entries.',409);
        }
        s.run('UPDATE campaigns SET status=?,seed=?,commitment=?,revision=revision+1,updated_at=? WHERE id=?',data.status,seed,commitment,now,c.id);s.log('owner','campaign.'+data.status,c.id,{commitment},now);
      });return json(publicCampaign(s.campaign(c.id),s.stats(c.id),true));
    }
    if(part==='entries'&&method==='GET'){
      const offset=Math.max(0,Math.min(1000000,parseInt(url.searchParams.get('offset'))||0)),filter=url.searchParams.get('status');
      const clauses=['e.campaign_id=?'],args=[c.id];if(['pending','approved','rejected','revoked'].includes(filter)){clauses.push('e.status=?');args.push(filter);}
      const entries=s.all(`SELECT e.id,e.user_id,e.action_id,e.period,e.status,e.points,e.evidence,e.created_at,e.updated_at,e.note,u.name,m.disqualified,m.contact FROM entries e JOIN users u ON u.id=e.user_id JOIN members m ON m.campaign_id=e.campaign_id AND m.user_id=e.user_id WHERE ${clauses.join(' AND ')} ORDER BY e.created_at,e.id LIMIT 501 OFFSET ?`,...args,offset);
      for(const entry of entries)entry.accounts=s.all('SELECT provider,subject,label FROM identities WHERE user_id=?',entry.user_id);
      const more=entries.length>500;return json({entries:entries.slice(0,500),nextOffset:more?offset+500:null,stats:s.stats(c.id)});
    }
    if(part==='audit'&&method==='GET')return json({events:s.all("SELECT * FROM audit WHERE subject=? OR json_extract(detail,'$.campaign')=? ORDER BY id DESC LIMIT 200",c.id,c.id)});
    if(part==='review'&&method==='POST'){
      const data=await body(request);if(!['approved','rejected','revoked'].includes(data.status))fail('BAD_REVIEW','Choose approve, reject or revoke.');
      const note=string(data.note||'',500,'review note',data.status!=='approved');
      s.transaction(()=>{
        const fresh=s.requireCampaign(c.id);if(fresh.snapshot)fail('FROZEN','The draw snapshot is frozen; entries cannot change.',409);
        const entry=s.one('SELECT * FROM entries WHERE id=? AND campaign_id=?',String(data.entryId),c.id);if(!entry)fail('NOT_FOUND','Entry not found.',404);
        if(entry.status===data.status)return;
        if(entry.action_id==='referral')fail('DERIVED_ENTRY','Referral entries follow the referred entrant’s qualification.',409);
        const action=fresh.doc.actions.find(a=>a.id===entry.action_id);
        if(data.status==='approved' && (action.mode!=='review' || !['pending','rejected'].includes(entry.status)))fail('INVALID_REVIEW','Only submitted manual evidence can be approved by review.',409);
        if(data.status==='rejected' && entry.status!=='pending')fail('INVALID_REVIEW','Only pending evidence can be rejected; revoke awarded entries instead.',409);
        if(data.status==='revoked' && entry.status!=='approved')fail('INVALID_REVIEW','Only awarded entries can be revoked.',409);
        s.run('UPDATE entries SET status=?,note=?,updated_at=? WHERE id=?',data.status,note,now,entry.id);s.reconcileReferral(fresh,entry.user_id,now);s.log('owner','entry.'+data.status,entry.id,{campaign:c.id,note},now);
      });return json({ok:true,stats:s.stats(c.id)});
    }
    if(part==='disqualify'&&method==='POST'){
      const data=await body(request),reason=string(data.reason,500,'reason');
      s.transaction(()=>{const fresh=s.requireCampaign(c.id);if(fresh.snapshot)fail('FROZEN','The draw snapshot is frozen.',409);if(!s.one('SELECT user_id FROM members WHERE campaign_id=? AND user_id=?',c.id,String(data.userId)))fail('NOT_FOUND','Entrant not found.',404);s.run('UPDATE members SET disqualified=1,reason=? WHERE campaign_id=? AND user_id=?',reason,c.id,data.userId);s.reconcileReferral(fresh,data.userId,now);s.log('owner','entrant.disqualified',c.id,{participant:data.userId,reason},now);});return json({ok:true});
    }
    if(part==='draw'&&method==='POST')return this.draw(c,await body(request),now);
    fail('NOT_FOUND','Not found.',404);
  }
  async draw(c,data,now){
    const s=this.store;if(data.confirm!==c.doc.slug)fail('CONFIRM_DRAW','Type the campaign slug to freeze entries and draw.');
    if(c.draw)return json(JSON.parse(c.draw));
    let snapshot;
    s.transaction(()=>{
      const fresh=s.requireCampaign(c.id);if(fresh.status!=='closed')fail('CLOSE_FIRST','Close the campaign before drawing.',409);
      if(fresh.snapshot){snapshot=JSON.parse(fresh.snapshot);return;}
      if(s.one("SELECT count(*) AS n FROM entries WHERE campaign_id=? AND status='pending'",c.id).n)fail('PENDING_REVIEWS','Resolve pending entries before freezing the draw.',409);
      const rows=s.all("SELECT e.user_id, sum(e.points) AS points FROM entries e JOIN members m ON m.campaign_id=e.campaign_id AND m.user_id=e.user_id WHERE e.campaign_id=? AND e.status='approved' AND m.disqualified=0 GROUP BY e.user_id ORDER BY e.user_id",c.id);
      if(!rows.length)fail('NO_ENTRIES','No eligible entries are available.',409);
      // Random internal entrant IDs are the public pseudonyms; no wallets,
      // usernames, evidence or access tokens enter the published proof.
      snapshot={version:1,campaign:c.id,frozenAt:new Date(now).toISOString(),rows:rows.map(r=>({participant:r.user_id,points:r.points}))};
      s.run('UPDATE campaigns SET snapshot=? WHERE id=?',JSON.stringify(snapshot),c.id);s.log('owner','draw.frozen',c.id,{participants:rows.length},now);
    });
    const hash=await sha(JSON.stringify(snapshot));const seed=s.requireCampaign(c.id).seed;
    const count=c.doc.prizes.reduce((n,p)=>n+p.quantity,0),winners=await selectWinners(snapshot.rows,seed,hash,count,c.doc.allowRepeatWinners);
    const prizes=c.doc.prizes.flatMap(p=>Array.from({length:p.quantity},()=>p.name));
    const record={version:1,campaign:c.id,slug:c.doc.slug,commitment:c.commitment,seed,snapshotHash:hash,snapshot,algorithm:'sha256-rejection-sampling-v1',allowRepeatWinners:c.doc.allowRepeatWinners,requestedWinners:count,winners:winners.map((w,i)=>({...w,prize:prizes[i]})),drawnAt:new Date(now).toISOString()};
    return s.transaction(()=>{const fresh=s.requireCampaign(c.id);if(fresh.draw)return json(JSON.parse(fresh.draw));s.run('UPDATE campaigns SET draw=?,updated_at=? WHERE id=?',JSON.stringify(record),now,c.id);s.log('owner','draw.completed',c.id,{snapshotHash:hash,winners:winners.length},now);return json(record);});
  }
}

// This worker has no public routes. Only the website’s service binding reaches
// the ledger; all authorization remains enforced inside the ledger itself.
export default {fetch(request,env){return env.CAMPAIGN_STORE.get(env.CAMPAIGN_STORE.idFromName('house-campaigns-v1')).fetch(request);}};
