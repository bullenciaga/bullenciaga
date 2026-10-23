import { canEnter, fail, randomToken, sha } from './model.mjs';
import { emailConfigured, normalizeEmail, maskEmail, sendEmailCode, verifyEmailCode } from './email.mjs';
import { seal, unseal } from './providers.mjs';

export function newsletterAction(ledger,slug,actionId,user){
  const c=ledger.store.requireCampaign(slug);canEnter(c);ledger.member(c,user);
  const a=c.doc.actions.find(x=>x.id===actionId&&x.mode==='confirmation'&&x.type==='newsletter');
  if(!a)fail('NOT_FOUND','Confirmed newsletter action not found.',404);
  return {c,a};
}
export function subscriptionProof(store,campaign,user,action){
  const row=store.one('SELECT n.email_hash,n.confirmed_at,c.confirmed_at AS consent_at FROM newsletter_subscribers n JOIN newsletter_consents c ON c.user_id=n.user_id WHERE n.user_id=? AND n.unsubscribed_at IS NULL AND c.campaign_id=? AND c.action_id=? AND c.confirmed_at>=n.confirmed_at',user,campaign,action);
  if(!row)fail('CONFIRM_NEWSLETTER','Choose to subscribe and confirm the email code for this campaign first.',409);
  return {method:'newsletter-double-opt-in',confirmedAt:row.consent_at,emailHash:row.email_hash};
}
export async function newsletterRoute(ledger,request,phase,data,user,now){
  const s=ledger.store,env=ledger.env;
  if(phase==='unsubscribe'){
    const own=data.own===true&&user;
    const token=typeof data.token==='string'&&/^[\w-]{43}$/.test(data.token)?data.token:'';
    if(!own&&!token)fail('INVALID_LINK','Use the unsubscribe link in your email or sign in to your account.');
    const hash=token?await sha(token):'';
    s.transaction(()=>{
      const row=own?s.one('SELECT user_id FROM newsletter_subscribers WHERE user_id=?',user):s.one('SELECT user_id FROM newsletter_subscribers WHERE unsubscribe_hash=?',hash);
      if(row){s.run('UPDATE newsletter_subscribers SET unsubscribed_at=? WHERE user_id=?',now,row.user_id);s.log(row.user_id,'newsletter.unsubscribed',row.user_id,{},now);}
    });
    return {unsubscribed:true}; // Same response for old links; no email enumeration.
  }
  if(!user)fail('SIGN_IN_REQUIRED','Sign in before subscribing for campaign entries.',401);
  if(phase==='status'){
    const row=s.one('SELECT label,confirmed_at,unsubscribed_at FROM newsletter_subscribers WHERE user_id=?',user);
    return {subscribed:!!row&&!row.unsubscribed_at,email:row?.label||null};
  }
  if(!emailConfigured(env)||!env.CAMPAIGNS_TOKEN_KEY)fail('NOT_CONFIGURED','Newsletter confirmation is not configured.',503);
  if(phase==='start'){
    const {c,a}=newsletterAction(ledger,String(data.campaign),String(data.action),user);
    if(data.consent!==true)fail('CONSENT_REQUIRED','Choose to receive the newsletter before requesting a confirmation code.');
    const email=normalizeEmail(data.email),hash=await sha(email),ip=await sha(request.headers.get('CF-Connecting-IP')||'local');
    s.rate('email-minute:'+hash,1,now);s.rate('email-hour:'+hash,6,now,3600000);s.rate('email-ip:'+ip,5,now,600000);s.rate('email-day:'+ip,20,now,86400000);s.rate('newsletter-start:'+user,3,now,600000);
    const owner=s.one('SELECT user_id FROM newsletter_subscribers WHERE email_hash=?',hash);
    if(owner&&owner.user_id!==user)fail('EMAIL_IN_USE','Use the entrant account already linked to this email.',409);
    const id=randomToken(),expiresAt=now+600000;
    await sendEmailCode(email,env);
    if(await ledger.session(request)!==user)fail('WRONG_ACCOUNT','Your account changed. Start confirmation again.',409);
    newsletterAction(ledger,c.id,a.id,user);
    s.transaction(()=>{
      s.run("DELETE FROM challenges WHERE kind='newsletter' AND json_extract(doc,'$.user')=?",user);
      s.run('INSERT INTO challenges VALUES(?,?,?,?)',id,'newsletter',JSON.stringify({user,email,emailHash:hash,campaign:c.id,action:a.id,revision:c.revision,consentText:a.consentText,attempts:0,verifying:false}),expiresAt);
    });
    return {id,email:maskEmail(email),expiresAt};
  }
  if(phase!=='verify')fail('NOT_FOUND','Not found.',404);
  s.rate('newsletter-verify:'+user,10,now);
  const id=String(data.id||''),code=typeof data.code==='string'?data.code.trim():'';
  if(!/^\d{8}$/.test(code))fail('INVALID_CODE','Enter the eight-digit confirmation code.',401);
  const locked=s.transaction(()=>{
    const row=s.one("SELECT * FROM challenges WHERE id=? AND kind='newsletter' AND expires_at>?",id,now);
    if(!row)fail('EMAIL_EXPIRED','Request a fresh newsletter confirmation code.',401);
    const d=JSON.parse(row.doc);
    if(d.user!==user)fail('WRONG_ACCOUNT','This confirmation belongs to another entrant.',403);
    if(d.attempts>=5)fail('EMAIL_LOCKED','Too many attempts. Request a new confirmation code.',429);
    if(d.verifying)fail('EMAIL_CHECKING','Your confirmation is already being checked.',409);
    d.attempts++;d.verifying=true;s.run('UPDATE challenges SET doc=? WHERE id=?',JSON.stringify(d),id);return d;
  });
  try{
    const identity=await verifyEmailCode(locked.email,code,env),existing=s.one('SELECT email_cipher FROM newsletter_subscribers WHERE user_id=?',user);
    // Keep unsubscribe links from earlier mail valid after a new confirmation.
    const unsubscribeToken=existing?(await unseal(existing.email_cipher,env,'newsletter:'+user)).unsubscribeToken:randomToken();
    const encrypted=await seal({email:locked.email,unsubscribeToken},env,'newsletter:'+user),unsubscribeHash=await sha(unsubscribeToken);
    if(await ledger.session(request)!==user)fail('WRONG_ACCOUNT','Your account changed. Start confirmation again.',409);
    s.transaction(()=>{
      const {c}=newsletterAction(ledger,locked.campaign,locked.action,user);
      if(c.revision!==locked.revision)fail('CAMPAIGN_CHANGED','Reload the updated campaign and confirm again.',409);
      if(!s.one("DELETE FROM challenges WHERE id=? AND kind='newsletter' AND expires_at>? RETURNING id",id,Date.now()))fail('EMAIL_EXPIRED','This confirmation request was already used or expired.',401);
      s.identify('email',identity.subject,identity.label,user);
      s.run('INSERT INTO newsletter_subscribers VALUES(?,?,?,?,?,NULL,?) ON CONFLICT(user_id) DO UPDATE SET email_hash=excluded.email_hash,email_cipher=excluded.email_cipher,label=excluded.label,confirmed_at=excluded.confirmed_at,unsubscribed_at=NULL,unsubscribe_hash=excluded.unsubscribe_hash',user,locked.emailHash,encrypted,maskEmail(locked.email),Date.now(),unsubscribeHash);
      s.run('INSERT INTO newsletter_consents VALUES(?,?,?,?,?) ON CONFLICT(campaign_id,user_id,action_id) DO UPDATE SET confirmed_at=excluded.confirmed_at,consent_text=excluded.consent_text',c.id,user,locked.action,Date.now(),locked.consentText);
      s.log(user,'newsletter.confirmed',user,{campaign:c.id,action:locked.action},now);
    });
    return {confirmed:true,campaign:locked.campaign,action:locked.action};
  }finally{
    const fresh=s.one("SELECT doc FROM challenges WHERE id=? AND kind='newsletter'",id);
    if(fresh){const d=JSON.parse(fresh.doc);d.verifying=false;s.run('UPDATE challenges SET doc=? WHERE id=?',JSON.stringify(d),id);}
  }
}
export async function exportNewsletter(ledger,after=''){
  const s=ledger.store,rows=s.all('SELECT * FROM newsletter_subscribers WHERE unsubscribed_at IS NULL AND user_id>? ORDER BY user_id LIMIT 501',after),more=rows.length>500,subscribers=[];
  for(const row of rows.slice(0,500)){
    const value=await unseal(row.email_cipher,ledger.env,'newsletter:'+row.user_id);
    subscribers.push({userId:row.user_id,email:value.email,confirmedAt:row.confirmed_at,unsubscribeURL:ledger.env.CAMPAIGNS_ORIGIN+'/campaigns#unsubscribe='+value.unsubscribeToken,consents:s.all('SELECT campaign_id,action_id,confirmed_at,consent_text FROM newsletter_consents WHERE user_id=? ORDER BY confirmed_at',row.user_id)});
  }
  s.log('owner','newsletter.exported','newsletter',{count:subscribers.length});
  return {subscribers,next:more?rows[499].user_id:null};
}
