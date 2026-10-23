import { fail, randomToken } from './model.mjs';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,doc TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,seed TEXT,commitment TEXT,snapshot TEXT,draw TEXT);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL,label TEXT NOT NULL,tokens TEXT,PRIMARY KEY(provider,subject),UNIQUE(user_id,provider));
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,kind TEXT NOT NULL,doc TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS members(campaign_id TEXT NOT NULL,user_id TEXT NOT NULL,code TEXT NOT NULL UNIQUE,referrer TEXT,consent_revision INTEGER NOT NULL,joined_at INTEGER NOT NULL,disqualified INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',PRIMARY KEY(campaign_id,user_id));
CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,user_id TEXT NOT NULL,action_id TEXT NOT NULL,period TEXT NOT NULL,status TEXT NOT NULL,points INTEGER NOT NULL,evidence TEXT NOT NULL,proof TEXT NOT NULL,proof_key TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,note TEXT NOT NULL DEFAULT '',UNIQUE(campaign_id,user_id,action_id,period));
CREATE UNIQUE INDEX IF NOT EXISTS unique_social_evidence ON entries(campaign_id,action_id,proof_key) WHERE proof_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS entries_review ON entries(campaign_id,status,created_at);
CREATE INDEX IF NOT EXISTS entries_member ON entries(campaign_id,user_id);
CREATE TABLE IF NOT EXISTS visits(campaign_id TEXT NOT NULL,user_id TEXT NOT NULL,action_id TEXT NOT NULL,period TEXT NOT NULL,started_at INTEGER NOT NULL,PRIMARY KEY(campaign_id,user_id,action_id,period));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,actor TEXT NOT NULL,operation TEXT NOT NULL,subject TEXT NOT NULL,detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS newsletter_subscribers(user_id TEXT PRIMARY KEY,email_hash TEXT NOT NULL UNIQUE,email_cipher TEXT NOT NULL,label TEXT NOT NULL,confirmed_at INTEGER NOT NULL,unsubscribed_at INTEGER,unsubscribe_hash TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS newsletter_consents(campaign_id TEXT NOT NULL,user_id TEXT NOT NULL,action_id TEXT NOT NULL,confirmed_at INTEGER NOT NULL,consent_text TEXT NOT NULL,PRIMARY KEY(campaign_id,user_id,action_id));
`;
export class CampaignStore {
  constructor(sql, transaction) { this.sql=sql;this.transaction=transaction;sql.exec(SCHEMA); }
  all(q,...args){return this.sql.exec(q,...args).toArray();}
  one(q,...args){return this.all(q,...args)[0] || null;}
  run(q,...args){return this.sql.exec(q,...args);}
  campaign(id){const r=this.one('SELECT * FROM campaigns WHERE id=? OR slug=?',id,id);if(r)r.doc=JSON.parse(r.doc);return r;}
  requireCampaign(id){const r=this.campaign(id);if(!r)fail('NOT_FOUND','Campaign not found.',404);return r;}
  log(actor,operation,subject,detail={},now=Date.now()){this.run('INSERT INTO audit(at,actor,operation,subject,detail) VALUES(?,?,?,?,?)',now,actor,operation,subject,JSON.stringify(detail));}
  rate(key,limit,now,period=60000){
    const bucket=Math.floor(now/period),k=`${key}:${bucket}`;
    const count=this.one('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',k,now+period*2).count;
    if(count>limit)fail('RATE_LIMIT','Please wait a moment before trying again.',429);
  }
  clean(now){this.run('DELETE FROM rate_limits WHERE expires_at<?',now);this.run('DELETE FROM challenges WHERE expires_at<?',now);this.run('DELETE FROM sessions WHERE expires_at<?',now);this.run('DELETE FROM visits WHERE started_at<?',now-2*86400000);}
  identify(provider,subject,label,existing=null){
    return this.transaction(()=>{
      const identity=this.one('SELECT * FROM identities WHERE provider=? AND subject=?',provider,subject);
      if(identity){if(existing && identity.user_id!==existing)fail('IDENTITY_IN_USE','That account is already attached to another entrant.',409);return identity.user_id;}
      const user=existing || crypto.randomUUID();
      if(this.one('SELECT 1 FROM identities WHERE user_id=? AND provider=?',user,provider))fail('ACCOUNT_ALREADY_LINKED','This entrant already has an account connected for that platform.',409);
      if(!existing)this.run('INSERT INTO users VALUES(?,?,?)',user,label.slice(0,80),Date.now());
      this.run('INSERT INTO identities(provider,subject,user_id,label) VALUES(?,?,?,?)',provider,subject,user,label.slice(0,100));return user;
    });
  }
  join(c,user,ref,now,contact=''){
    let member=this.one('SELECT * FROM members WHERE campaign_id=? AND user_id=?',c.id,user);
    if(member)return member;
    const referrer=ref?this.one('SELECT * FROM members WHERE campaign_id=? AND code=? AND disqualified=0',c.id,ref):null;
    if(referrer?.user_id===user)fail('SELF_REFERRAL','You cannot refer yourself.');
    this.run('INSERT INTO members(campaign_id,user_id,code,referrer,consent_revision,joined_at,contact) VALUES(?,?,?,?,?,?,?)',c.id,user,randomToken().slice(0,16),referrer?.user_id || null,c.revision,now,contact);
    return this.one('SELECT * FROM members WHERE campaign_id=? AND user_id=?',c.id,user);
  }
  referral(c,user,now){
    if(!c.doc.referral.enabled)return;
    const member=this.one('SELECT * FROM members WHERE campaign_id=? AND user_id=?',c.id,user);if(!member?.referrer || member.disqualified)return;
    const referrer=this.one('SELECT * FROM members WHERE campaign_id=? AND user_id=? AND disqualified=0',c.id,member.referrer);if(!referrer)return;
    const count=this.one("SELECT count(*) AS n FROM entries WHERE campaign_id=? AND user_id=? AND action_id='referral' AND status='approved'",c.id,member.referrer).n;
    if(count>=c.doc.referral.cap)return;
    const qualifyingIds=c.doc.actions.filter(a=>['api','review','confirmation'].includes(a.mode)).map(a=>a.id);
    const qualified=this.all("SELECT action_id FROM entries WHERE campaign_id=? AND user_id=? AND status='approved'",c.id,user).some(e=>qualifyingIds.includes(e.action_id));
    if(!qualified)return;
    this.run("INSERT INTO entries(id,campaign_id,user_id,action_id,period,status,points,evidence,proof,created_at,updated_at) VALUES(?,?,?,'referral',?,'approved',?,'',?,?,?) ON CONFLICT(campaign_id,user_id,action_id,period) DO UPDATE SET status='approved',updated_at=excluded.updated_at",crypto.randomUUID(),c.id,member.referrer,user,c.doc.referral.points,JSON.stringify({qualifiedEntrant:user}),now,now);
  }
  reconcileReferral(c,user,now){
    const member=this.one('SELECT * FROM members WHERE campaign_id=? AND user_id=?',c.id,user);if(!member?.referrer)return;
    const ids=c.doc.actions.filter(a=>['api','review','confirmation'].includes(a.mode)).map(a=>a.id);
    const stillQualified=!member.disqualified && this.all("SELECT action_id FROM entries WHERE campaign_id=? AND user_id=? AND status='approved'",c.id,user).some(e=>ids.includes(e.action_id));
    if(!stillQualified)this.run("UPDATE entries SET status='revoked',note='Referred entrant no longer qualifies',updated_at=? WHERE campaign_id=? AND user_id=? AND action_id='referral' AND period=?",now,c.id,member.referrer,user);
    else this.referral(c,user,now);
  }
  stats(campaign,user=null){
    const totals=this.one("SELECT count(*) AS actions,coalesce(sum(CASE WHEN e.status='approved' AND m.disqualified=0 THEN e.points ELSE 0 END),0) AS points,sum(CASE WHEN e.status='pending' THEN 1 ELSE 0 END) AS pending FROM entries e JOIN members m ON m.campaign_id=e.campaign_id AND m.user_id=e.user_id WHERE e.campaign_id=?"+(user?' AND e.user_id=?':''),...[campaign,...(user?[user]:[])]);
    return {...totals,pending:totals.pending||0,entrants:this.one('SELECT count(*) AS n FROM members WHERE campaign_id=? AND disqualified=0',campaign).n};
  }
}
