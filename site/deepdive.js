const $=id=>document.getElementById(id);
const nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const fmt=n=>Number.isFinite(n)?nf.format(n):'—';
const compact=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(n):'—';
const pct=n=>Number.isFinite(n)?n.toFixed(2)+'%':'—';
const money=n=>Number.isFinite(n)?'$'+fmt(n):'—';
const time=t=>new Date(t).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC';
const short=a=>a.slice(0,5)+'…'+a.slice(-5);
const safeAddress=a=>typeof a==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
const sum=arr=>arr.reduce((a,b)=>a+b,0);
const colors=['#423b2c','#74623e','#a1834b','#c7a869','#ead9aa'];
const bucketNames=['0–7d','7–14d','14–30d','30–60d','60d+'];
let snapshot=null, days=30, denominator='eligible', tape=null, windowSize='1h', saved=false;
const set=(id,value)=>{$(id).textContent=value;};
const get=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(10000),cache:'no-cache'});if(!response.ok)throw new Error('Data unavailable');return response.json();};
function valid(data){return data?.ok===true&&data.schemaVersion===1&&data.method==='account-net-inflow-fifo-v1'&&data.mint==='BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN'&&Number.isSafeInteger(data.slot)&&Array.isArray(data.excluded)&&data.excluded.every(x=>safeAddress(x.address)&&['pool','reserve','dev','program','escrow'].includes(x.category)&&Number.isFinite(x.amount))&&Number.isFinite(Date.parse(data.asOf))&&Number.isFinite(data.supply?.eligible)&&data.supply.eligible>0&&Array.isArray(data.thresholds)&&data.thresholds.length===4&&data.thresholds.every(t=>[t.days,t.amount,t.percent,t.wallets].every(Number.isFinite))&&Array.isArray(data.wallets)&&data.wallets.every(w=>safeAddress(w.address)&&Number.isFinite(w.amount)&&Array.isArray(w.aged))&&data.buckets?.length===5&&data.buckets.every(Number.isFinite);}
function ageView(){
 if(!snapshot)return;
 const t=snapshot.thresholds.find(t=>t.days===days), value=denominator==='eligible'?t.percent:t.circulatingPercent;
 $('age-percent').innerHTML=(Number.isFinite(value)?value.toFixed(2):'—')+'<span>%</span>';
 set('age-caption',`Estimated remaining balance aged ${days} days or more.`);
 set('aged-amount',compact(t.amount));set('aged-wallets',fmt(t.wallets));
 document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.days===days)));
}
function drawSnapshot(){
 const s=snapshot;
 ageView();
 const stale=Date.now()-Date.parse(s.asOf)>5*60000;
 set('snapshot-status',`${saved?'Saved snapshot':stale?'Last verified holder data':'Live holder data'} · ${time(s.asOf)} · ${fmt(s.coverage.percent)}% balance coverage${stale?' · Update delayed; showing the last verified snapshot':''}`);
 $('snapshot-status').classList.toggle('stale',stale);
 set('weighted-age',fmt(s.weightedAgeDays)+' days');set('holder-count',fmt(s.holdersAtLeastOne));set('coverage',pct(s.coverage.percent));set('coverage-badge',fmt(s.coverage.percent)+'% COVERAGE');
 const shares=s.buckets.map(n=>n/s.supply.eligible*100), max=Math.max(...shares,1);
 $('age-chart').innerHTML=shares.map((v,i)=>`<div class="dd-age-column"><span>${v.toFixed(1)}%</span><div style="height:${Math.max(1,v/max*140)}px;--bar:${colors[i]}"></div><small>${bucketNames[i]}</small></div>`).join('');
 $('age-chart').setAttribute('aria-label',shares.map((v,i)=>`${bucketNames[i]}: ${v.toFixed(2)} percent`).join(', ')+`. Unknown: ${fmt(s.coverage.unknown)} BULLEN`);
 $('age-key').innerHTML='<span>SHARE OF ELIGIBLE WALLET HOLDINGS</span><span>'+(s.coverage.unknown>0?compact(s.coverage.unknown)+' UNKNOWN':'ALL BALANCES RECONCILED')+'</span>';
 const distribution=[['Wallet holdings','wallet','#ead9aa'],['Main pool','pool','#947c4a'],['Reserve accounts','reserve','#554932'],['Public dev wallet','dev','#937f62'],['Other programs / escrow','other','#393c39'],['Burned since launch','burned','#242520']];
 const supply={...s.supply,other:s.supply.program+s.supply.escrow};
 $('supply-bar').innerHTML=distribution.filter(([,k])=>supply[k]>0).map(([name,k,c])=>`<span title="${name}: ${fmt(supply[k])} BULLEN" style="width:${supply[k]/1e9*100}%;background:${c}"></span>`).join('');
 $('supply-list').innerHTML=distribution.map(([name,k,c])=>`<div class="dd-data-row"><span><i class="dot" style="--bar:${c}"></i>${name}</span><strong>${compact(supply[k])}<small>${(supply[k]/1e9*100).toFixed(2)}%</small></strong></div>`).join('');
 $('concentration').innerHTML=[['Largest',s.concentration.top1],['Top 10',s.concentration.top10],['Top 20',s.concentration.top20]].map(([label,n])=>`<div><span class="dd-label">${label}</span><strong>${pct(n)}</strong></div>`).join('');
 const largest=Math.max(...s.sizes.map(x=>x.count),1);
 $('size-chart').innerHTML='<p class="dd-label">WALLETS BY BALANCE SIZE</p>'+s.sizes.map((x,i)=>`<div class="dd-size-row"><span>${['Under 1K','1K–10K','10K–100K','100K–1M','1M+'][i]}</span><div><span style="width:${x.count/largest*100}%"></span></div><span>${x.count}</span></div>`).join('');
 $('top-wallets').innerHTML=s.wallets.slice(0,20).map((w,i)=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td><a href="https://solscan.io/account/${w.address}" target="_blank" rel="noopener noreferrer" title="${w.address}">${short(w.address)} ↗</a></td><td>${fmt(w.amount)}</td><td>${pct(w.share)}</td><td>${compact(w.aged[2])}</td></tr>`).join('');
 $('proof').innerHTML=`<p>Finalized slot <a href="https://solscan.io/block/${s.slot}" target="_blank" rel="noopener noreferrer">${s.slot} ↗</a> · ${time(s.asOf)}<br>Mint: ${s.mint}<br>${s.coverage.verifiedAccounts} of ${s.coverage.accounts} eligible token-account balances reconciled. ${fmt(s.coverage.unknown)} BULLEN with unknown age.<br>Eligible wallet holdings: ${fmt(s.supply.eligible)} BULLEN. Circulating at this snapshot: ${fmt(s.supply.circulating)} BULLEN.<br>Model: account-net-inflow-fifo-v1. Thresholds are cumulative; age bands are mutually exclusive.</p><p>Excluded from the holder-age cohort:</p><ul>${s.excluded.filter(x=>safeAddress(x.address)).map(x=>`<li>${x.category} · ${fmt(x.amount)} BULLEN · <a href="https://solscan.io/account/${x.address}" target="_blank" rel="noopener noreferrer">${short(x.address)} ↗</a></li>`).join('')}</ul>`;
 if(s.history?.length>1)set('history-note',`${s.history.length} collected snapshots since ${time(s.history[0].asOf)}. Download the snapshot to explore these recorded observations. No earlier trend is reconstructed.`);
 $('download').disabled=false;
}
async function loadSnapshot(){
 try{const s=await get('/supply/deepdive');if(!valid(s))throw new Error('Snapshot format unavailable');if(!snapshot||Date.parse(s.asOf)>=Date.parse(snapshot.asOf)){snapshot=s;saved=false;drawSnapshot();}}
 catch{if(!snapshot){try{const s=await get('/deepdive-snapshot.json');if(!valid(s))throw new Error();snapshot=s;saved=true;drawSnapshot();}catch{set('snapshot-status','Holder snapshot unavailable. Please try again shortly.');}}else drawSnapshot();}
}
function drawFlow(){
 if(!tape?.ok)return;
 const s=tape.summary,b=s['buyUsd'+windowSize],sell=s['sellUsd'+windowSize],n=s['tradeCount'+windowSize];
 if(![b,sell,n].every(Number.isFinite))return;
 set('flow-buy',money(b));set('flow-sell',money(sell));set('flow-net',(b-sell>0?'+':'')+money(b-sell));
 $('flow-net').className=b-sell>0?'dd-positive':b-sell<0?'dd-negative':'';
 const total=b+sell;$('flow-bar').innerHTML=total>0?`<span style="width:${b/total*100}%"></span><span style="width:${sell/total*100}%"></span>`:'';
 $('flow-bar').setAttribute('role','img');$('flow-bar').setAttribute('aria-label',total?`${(b/total*100).toFixed(1)}% buy volume`:'No observed volume in this window');
 const age=Date.now()-(tape.status?.lastReconciledAt||0);
 set('flow-status',age<180000?'Observed trades · main BULLEN pool':'Trade feed delayed · last available observation');
 set('flow-count',`${n} observed trades · ${total>0?(b/total*100).toFixed(1)+'% buy volume':'no observed buy or sell volume'} · ${windowSize}`);
 document.querySelectorAll('[data-window]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.window===windowSize)));
}
async function loadMarket(){
 await Promise.allSettled([
  (async()=>{try{const m=await get('/volume');if(!m.ok)throw new Error();set('market-price',Number.isFinite(m.price)?'$'+m.price.toFixed(8):'—');set('market-volume',money(m.volume24h));set('market-liquidity',money(m.liquidityUsd));set('market-change',(m.priceChange24h>0?'+':'')+pct(m.priceChange24h));$('market-change').className=m.priceChange24h>0?'dd-positive':m.priceChange24h<0?'dd-negative':'';set('market-time',`Market observation · ${time(m.fetchedAt)}${m.marketStale||Date.now()-m.fetchedAt>180000?' · Feed delayed':''}. Volume and liquidity refer to the tracked pool. Holder data uses its own snapshot time.`);}catch{set('market-time','Market feed unavailable. Any numbers shown are from the previous observation.');}})(),
  (async()=>{try{const t=await get('/volume/tape');if(!t.ok)throw new Error();tape=t;drawFlow();}catch{set('flow-status','Trade feed unavailable. Any values shown are from the previous observation.');}})(),
 ]);
}
document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{days=+b.dataset.days;ageView();}));
$('denominator').addEventListener('change',e=>{denominator=e.target.value;ageView();});
document.querySelectorAll('[data-window]').forEach(b=>b.addEventListener('click',()=>{windowSize=b.dataset.window;drawFlow();}));
$('wallet-form').addEventListener('submit',e=>{
 e.preventDefault();const address=$('wallet-address').value.trim();
 if(!safeAddress(address)){set('wallet-result','Enter a valid Solana wallet address.');return;}
 if(!snapshot){set('wallet-result','The holder snapshot is not available yet.');return;}
 const w=snapshot.wallets.find(w=>w.address===address);
 if(!w){const excluded=snapshot.excluded.find(w=>w.owner===address||w.address===address);set('wallet-result',excluded?'This address belongs to an excluded '+excluded.category+' account. It is shown separately in the supply breakdown.':'No eligible positive BULLEN balance found for this wallet at '+time(snapshot.asOf)+'. Check the wallet address and snapshot time.');return;}
 $('wallet-result').innerHTML=`<strong>${fmt(w.amount)} BULLEN</strong>${pct(w.share)} of eligible wallet holdings · ${time(snapshot.asOf)}<div class="dd-wallet-bands">${[7,14,30,60].map((d,i)=>`<div>${d} days+<span>${compact(w.aged[i])}</span></div>`).join('')}</div><p>${w.unknown>0?fmt(w.unknown)+' BULLEN has unknown age.':'Balance reconciled.'} Thresholds overlap; do not add them together.</p>`;
});
$('download').addEventListener('click',()=>{if(!snapshot)return;const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='BULLEN-deepdive-'+snapshot.asOf.slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
loadSnapshot();loadMarket();
setInterval(()=>{if(!document.hidden){loadSnapshot();loadMarket();}},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadSnapshot();loadMarket();}});
