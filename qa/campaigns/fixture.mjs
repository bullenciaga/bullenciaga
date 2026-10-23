import { DatabaseSync } from 'node:sqlite';
import { CampaignLedger } from '../../src/campaigns/worker.mjs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { b64, randomToken, sha } from '../../src/campaigns/model.mjs';
export const origin='https://campaigns.test';
export const ownerKey='test-only-house-control-key-not-a-secret';
export function harness(){
  const db=new DatabaseSync(':memory:');let transactionID=0;
  const sql={exec(query,...args){if(query.trim().split(';').filter(x=>x.trim()).length>1){db.exec(query);return {toArray:()=>[]};}const stmt=db.prepare(query);const rows=stmt.all(...args);return {toArray:()=>rows};}};
  const storage={sql,transactionSync(fn){const name='tx'+ ++transactionID;db.exec(`SAVEPOINT ${name}`);try{const result=fn();db.exec(`RELEASE ${name}`);return result;}catch(e){db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);throw e;}}};
  const env={CAMPAIGNS_ORIGIN:origin,CAMPAIGNS_TOKEN_KEY:'test-encryption-key-used-only-for-local-fixtures',CONTROL_AUTH:{fetch:async r=>new Response(null,{status:r.headers.get('Authorization')==='Bearer '+ownerKey?204:403})}};
  const ledger=new CampaignLedger({storage},env);
  let counter=0;
  async function request(path,{method='GET',data,admin=false,cookie='',originHeader=origin,ip}={}){
    const headers={Origin:originHeader,'CF-Connecting-IP':ip||`192.0.2.${++counter%250}`};if(data!==undefined)headers['Content-Type']='application/json';if(admin)headers.Authorization='Bearer '+ownerKey;if(cookie)headers.Cookie=cookie;
    const response=await ledger.fetch(new Request(origin+'/campaigns/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}));let value;try{value=await response.clone().json();}catch{value=null;}return {response,status:response.status,value,cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
  }
  async function user(name='entrant'){const id=ledger.store.identify('test',randomToken(),name),token=randomToken();ledger.store.run('INSERT INTO sessions VALUES(?,?,?)',await sha(token),id,Date.now()+3600000);return {id,cookie:'__Host-bullen_campaign_session='+token};}
  return {db,ledger,env,request,user,close:()=>db.close()};
}
export function campaign(overrides={}){return {slug:'house-invitation',title:'An invitation',description:'Take part in the House.',cover:'/assets/house-record/007-seated-1280.webp',startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),timeZone:'Europe/Warsaw',prizes:[{name:'Test prize',description:'Local fixture only.',quantity:2}],actions:[{id:'free',type:'free',mode:'automatic',label:'Free entry',instructions:'',points:1,frequency:'once',target:''},{id:'creative',type:'creative',mode:'review',label:'Show your work',instructions:'Submit your original work.',points:10,frequency:'daily',target:''},{id:'visit',type:'visit',mode:'visit',label:'Visit Goods',instructions:'',points:2,frequency:'once',target:'https://bullenciaga.com/goods'}],rules:'Participation is free. Approved entries count toward a weighted random draw. These are fixture rules for local testing only.',eligibility:'Adults in eligible regions; this is a local test.',privacy:'We use entrant identity and evidence to administer this local fixture only.',referral:{enabled:true,points:5,cap:2},allowRepeatWinners:false,...overrides};}
export async function publish(h,doc=campaign()){let r=await h.request('/admin/campaigns',{method:'POST',admin:true,data:doc});if(r.status!==201)throw new Error(JSON.stringify(r.value));r=await h.request('/admin/campaigns/'+r.value.id+'/status',{method:'POST',admin:true,data:{status:'live',revision:1}});if(r.status!==200)throw new Error(JSON.stringify(r.value));return r.value;}
export async function join(h,c,u,ref){return h.request(`/campaigns/${c.slug}/join`,{method:'POST',cookie:u.cookie,data:{accepted:true,revision:c.revision,ref}});}
export async function claim(h,c,u,action,evidence='An original creation at https://example.com/my-work'){return h.request(`/campaigns/${c.slug}/actions/${action}/claim`,{method:'POST',cookie:u.cookie,data:{evidence}});}
export function testWallet(){const {privateKey,publicKey}=generateKeyPairSync('ed25519'),bytes=publicKey.export({format:'der',type:'spki'}).subarray(-32);let n=BigInt('0x'+bytes.toString('hex')),address='';const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';while(n){address=alphabet[Number(n%58n)]+address;n/=58n;}for(const b of bytes){if(b)break;address='1'+address;}return {address,sign:message=>b64(sign(null,Buffer.from(message),privateKey))};}
