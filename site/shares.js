(() => {
'use strict';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=bps=>(bps/100).toFixed(2)+'%';
let data=null, busy=false, generation=0;
const wallet=w=>`<div class="wallet"><code>${esc(w)}</code><button class="copy" data-copy="${esc(w)}" aria-label="Copy wallet ${esc(w)}">COPY</button></div>`;
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
async function api(path='',options={}) {
 const response=await fetch('/rpc/shares'+path,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...options.headers}});
 const value=await response.json().catch(()=>({error:'Shares is temporarily unavailable.'}));
 if(!response.ok){const e=new Error(value.error||'Request failed.');e.status=response.status;throw e;}return value;
}
function gate(){generation++;data=null;$('dashboard').hidden=true;$('gate').hidden=false;$('totals').replaceChildren();$('pieces').replaceChildren();$('contributors').replaceChildren();$('password').value='';}
function totals(){
 if(!data)return;const term=$('search').value.trim().toUpperCase();
 const rows=data.totals.filter(r=>[r.wallet,r.holderName,...r.contributorNames,...r.pieces].join(' ').toUpperCase().includes(term));
 $('totals').innerHTML=rows.map(r=>`<tr><td>${esc(r.holderName||r.contributorNames.join(' / ')||'UNNAMED HOLDER')}<small>${esc(r.pieces.join(' · '))}</small></td><td>${wallet(r.wallet)}</td><td class="number">${pct(r.marketingBps)}</td><td class="number">${pct(r.nftBps)}</td><td class="number total">${pct(r.totalBps)}</td></tr>`).join('')||'<tr><td colspan="5">No matching wallets.</td></tr>';
}
function render(){
 $('gate').hidden=true;$('dashboard').hidden=false;$('dashboard').classList.remove('stale');
 for(const [id,key] of [['marketing-total','marketingBps'],['nft-total','nftBps'],['all-total','totalBps'],['unallocated-total','unallocatedBps']])$(id).textContent=pct(data[key]);
 totals();$('owned-count').textContent=`${data.pieces.filter(p=>p.active).length} / ${data.pieces.length} ALLOCATED`;
 $('pieces').innerHTML=data.pieces.map(p=>`<article class="piece"><img src="${esc('https://bullenciaga-img-proxy.bullenciaga-e5c.workers.dev/?url='+encodeURIComponent(p.image))}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer"><div><div class="piece-top"><div><span class="tier">${esc(p.tier)}</span><h3>${esc(p.name)}</h3></div><span class="rate">${pct(p.bps)}</span></div><p class="state ${p.active?'owned':''}">${esc(p.status)}</p>${p.wallet?wallet(p.wallet):'<p class="muted">Wallet appears when ownership is verified.</p>'}${p.active?`<label>HOLDER NAME</label><form data-wallet="${esc(p.wallet)}"><input aria-label="Holder name for ${esc(p.name)}" maxlength="64" value="${esc(p.holderName)}" placeholder="ADD HOLDER NAME" autocomplete="off"><button type="submit">SAVE</button></form><p class="save-status" role="status"></p>`:''}</div></article>`).join('');
 $('contributors').innerHTML=data.contributors.map(c=>`<tr><td>${esc(c.name)}</td><td>${wallet(c.wallet)}</td><td class="number total">${pct(c.bps)}</td></tr>`).join('');
 $('contributor-count').textContent=`· ${data.contributors.length} CONTRIBUTORS · ${pct(data.marketingBps)}`;
 $('verification').textContent=`Checked ${new Date(data.checkedAt).toLocaleString()} · Finalized slot ${data.finalizedSlot.toLocaleString()} · Discovery index slot ${data.indexedSlot.toLocaleString()}`;
 status(data.needsReview?'Some pieces need an ownership check. Their shares are excluded; totals are incomplete.':'Current owners verified. All percentages apply to net creator fees.',data.needsReview);
 $('export').disabled=data.needsReview;
}
async function refresh(){if(busy)return;busy=true;const ticket=generation;$('refresh').disabled=true;status('Checking current ownership…');$('export').disabled=true;
 try{const next=await api();if(ticket!==generation)return;data=next;render();}catch(e){if(ticket!==generation)return;if(e.status===401){gate();return;}$('dashboard').classList.add('stale');status((data?'REFRESH FAILED — showing the previous snapshot. ':'')+e.message,true);if(!data){$('login-status').textContent=e.message;$('login-status').classList.add('error');}}
 finally{busy=false;$('refresh').disabled=false;}}
$('login').addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;$('login-status').textContent='Unlocking…';try{await api('/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';$('login-status').textContent='';await refresh();}catch(e){$('login-status').textContent=e.message;$('login-status').classList.add('error');}finally{button.disabled=false;}});
$('refresh').addEventListener('click',refresh);$('search').addEventListener('input',totals);
$('lock').addEventListener('click',async()=>{try{await api('/logout',{method:'POST',body:'{}'});gate();}catch(e){status('Could not lock the session. '+e.message,true);}});
$('pieces').addEventListener('submit',async e=>{const form=e.target.closest('form[data-wallet]');if(!form)return;e.preventDefault();const name=form.querySelector('input').value.trim().toUpperCase(),w=form.dataset.wallet,button=form.querySelector('button'),note=form.nextElementSibling;button.disabled=true;note.textContent='Saving…';try{const r=await api('/name',{method:'POST',body:JSON.stringify({wallet:w,name})});for(const p of data.pieces)if(p.wallet===w)p.holderName=r.name;for(const r2 of data.totals)if(r2.wallet===w)r2.holderName=r.name;for(const f of $('pieces').querySelectorAll('form'))if(f.dataset.wallet===w)f.querySelector('input').value=r.name;totals();note.textContent='Saved for this wallet.';}catch(e){note.textContent=e.message;if(e.status===401)gate();}finally{button.disabled=false;}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='COPIED';setTimeout(()=>{b.textContent='COPY';},1200);}catch{b.textContent='SELECT ADDRESS';}});
$('export').addEventListener('click',()=>{if(!data||data.needsReview||$('dashboard').classList.contains('stale'))return;const cell=v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const csv=[['NAME','WALLET','MARKETING %','NFT %','TOTAL % OWED','CHECKED AT','FINALIZED SLOT'],...data.totals.map(r=>[r.holderName||r.contributorNames.join(' / ')||'UNNAMED HOLDER',r.wallet,pct(r.marketingBps),pct(r.nftBps),pct(r.totalBps),data.checkedAt,data.finalizedSlot])].map(row=>row.map(cell).join(',')).join('\r\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='bullenciaga-shares-'+data.checkedAt.slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
window.addEventListener('pagehide',()=>{gate();});window.addEventListener('pageshow',e=>{if(e.persisted)refresh();});
refresh();
})();
