import {raw,verified,amount,validWallet} from './rare-four-state.mjs';
const root=document.getElementById('rare-four');
if(root){
 const $=id=>document.getElementById('rf-'+id),base='/rare-four-api';
 let current=null,active=0,sequence=0,controller,stopped=false,timer;
 function counts(){const el=document.getElementById('activeCount');if(el?.dataset.legacyCount!==undefined)el.textContent=String(Number(el.dataset.legacyCount)+active);const empty=document.querySelector('[data-group="active"] .empty');if(empty)empty.textContent=active?'The Rare Four is open above.':'No campaigns in this state.'}
 addEventListener('bullen-campaign-counts',counts);
 function paint(d){
  current=d;active=d.phase==='live'?1:0;counts();
  $('phase').textContent=({'not-started':'Campaign preview · awaiting launch',live:'Open · buy + hold',sealed:'Entries closed · sealing the record',committed:'Entries closed · draw pending',drawn:'Draw complete · winning wallets',review:'Entries closed · verification review'})[d.phase];
  if(!d.ready){$('status').textContent=d.phase==='not-started'?'This campaign has not been activated yet. The opening snapshot and rules are fixed.':'Verifying all purchases since the opening snapshot. A partial total will not be shown.';return}
  $('retained').textContent=amount(d.progressRaw);$('entries').textContent=BigInt(d.totalEntries).toLocaleString('en-US');$('wallets').textContent=String(d.eligibleWallets);
  $('remaining').textContent=String(BigInt(d.totalEntries)>=250n?0n:250n-BigInt(d.totalEntries));
  const percent=Math.min(100,Number(BigInt(d.totalEntries)*10000n/250n)/100);
  $('fill').style.width=percent+'%';$('progress').setAttribute('aria-valuenow',String(Math.min(250,Number(d.totalEntries))));$('progress').setAttribute('aria-valuetext',`${d.totalEntries} of 250 whole entries; ${amount(d.progressRaw)} BULLEN in complete batches`);
  const stale=d.phase==='live'&&(d.catchingUp||Date.now()-d.observedAt>300000);
  $('status').textContent=(stale?'Verification is catching up. Last verified retention: ':d.phase==='live'?'Verified retention: ':'Entries closed at the verified snapshot: ')+new Date(d.observedAt).toLocaleString()+' · Only complete 100K entries count. Selling below a batch boundary reduces progress.';
  if(d.phase==='drawn'&&Array.isArray(d.winners)&&d.winners.length===4&&d.winners.every((w,i)=>w.position===[875,853,677,254][i]&&validWallet(w.wallet))){
   const list=$('winners').querySelector('ul');list.replaceChildren();for(const w of d.winners){const li=document.createElement('li'),a=document.createElement('a');a.href='https://solscan.io/account/'+w.wallet;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`HERD #${w.position} — ${w.wallet}`;li.append(a);list.append(li)}$('winners').hidden=false;
  }
 }
 async function status(){try{const r=await fetch(base+'/status',{cache:'no-store',signal:AbortSignal.timeout(12000)}),d=await r.json();if(!r.ok||!verified(d))throw Error();if(!stopped)paint(d)}catch{if(!stopped)$('status').textContent=current?.ready?'The latest update is unavailable. These are the last verified figures; they have not been reset.':'Campaign verification is not available yet. No live total or entry count is being claimed.'}finally{if(!stopped)timer=setTimeout(status,30000)}}
 $('form').addEventListener('submit',async e=>{
  e.preventDefault();const id=++sequence,wallet=$('wallet').value.trim(),button=$('form').querySelector('button');controller?.abort();button.disabled=false;
  if(!validWallet(wallet)){$('result').textContent='Enter a complete Solana wallet address.';return}
  if(!current||current.phase==='not-started'){$('result').textContent='This campaign has not been activated. Wallet totals will appear after the history is verified.';return}
  button.disabled=true;$('result').textContent='Checking verified entries…';controller=new AbortController();
  try{const r=await fetch(base+'/entries?wallet='+encodeURIComponent(wallet),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])}),d=await r.json();if(id!==sequence)return;if(!r.ok||!verified(d)||!d.ready||d.wallet!==wallet||!raw(d.entries)||!raw(d.countedRaw))throw Error();$('result').textContent=`${BigInt(d.entries).toLocaleString('en-US')} entries · ${amount(d.countedRaw)} qualifying new BULLEN retained. ${d.phase==='live'?amount(String(100000000000n-BigInt(d.countedRaw)%100000000000n))+' more qualifying BULLEN bought + held completes your next entry.':'Recorded at closing.'}${d.catchingUp?' Verification is catching up; this is the last verified result.':''}`}
  catch{if(id===sequence)$('result').textContent='Entries could not be verified. Please try again; no balance or entry count has been assumed.'}
  finally{if(id===sequence)button.disabled=false}
 });
 addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);sequence++;controller?.abort()});addEventListener('pageshow',e=>{if(e.persisted){stopped=false;$('form').querySelector('button').disabled=false;status()}});status();
}
