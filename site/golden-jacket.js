const ID='golden-jacket-699-613-517-61-961';
export function installGoldenJacket(authority){
  const campaign=authority.campaigns.find(c=>c.id===ID),article=document.getElementById(ID),root=article?.querySelector('.golden-runtime'),evidence=article?.querySelector('.ghost-evidence');
  if(!campaign||!root||!evidence)return;
  if(!campaign.automation?.enabled){root.textContent='Counting has not started. Launch will be announced.';return;}
  const node=(parent,tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;parent.append(e);return e;};
  async function refresh(){
    try{
      const response=await fetch('/competition-api/status',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Status unavailable');const s=await response.json();
      if(s.campaign!==ID||!['not-started','live','closing','review','sealed','committed','drawn'].includes(s.phase))throw Error('Invalid status');
      root.replaceChildren();evidence.replaceChildren();
      const group=s.phase==='not-started'?'upcoming':s.phase==='drawn'?'completed':s.counting?'active':'pending';
      article.dataset.status=group;article.querySelector('.status').textContent=s.counting?'Live · Buy competition':s.phase==='drawn'?'Winners selected':s.phase.replaceAll('-',' ');
      const destination=document.getElementById(group+'-title')?.closest('.campaign-section')?.querySelector('.campaign-grid');
      // Do not reparent a playing video on each refresh or reset open disclosures.
      if(destination&&article.parentElement!==destination){destination.querySelector('.empty')?.remove();destination.append(article);}
      document.getElementById('activeCount').textContent=document.querySelectorAll('.campaign[data-status="active"]').length;
      const actions=article.querySelector('.actions');actions.replaceChildren();
      if(s.counting){const a=node(actions,'a','Buy $BULLEN','action primary');a.href='/buy';}
      if(s.amendment){
        const total=BigInt(s.buyVolumeRaw||'0'),target=BigInt(s.amendment.targetRaw),percent=Number(total*10000n/target)/100;
        const panel=node(root,'div','','golden-volume'),heading=node(panel,'div','','volume-heading');
        node(heading,'span',s.phase==='drawn'?'Draw complete':s.counting?'Progress to the draw':'Target reached · Draw pending','volume-label');
        node(heading,'div',s.volumeReady?Number(total/1000000n).toLocaleString()+' / '+Number(target/1000000n).toLocaleString()+' $BULLEN':'Verifying buys…','volume-tally');
        const track=node(panel,'div','','volume-track');track.setAttribute('role','progressbar');track.setAttribute('aria-label','Cumulative buys toward the draw');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(target/1000000n));if(s.volumeReady)track.setAttribute('aria-valuenow',String(Math.min(Number(target/1000000n),Number(total/1000000n))));
        const fill=node(track,'span','');fill.style.width=Math.min(100,percent)+'%';
        node(panel,'p',(s.volumeReady?percent.toFixed(1)+'% · ':'')+'All buys since launch count. Sells do not reduce this bar.');
        node(evidence,'p','The 100M buy target replaces the original timer. Purchase history and ticket holding rules are unchanged.');
        if(s.closedAt)node(evidence,'p','Entries closed: '+new Date(s.closedAt).toLocaleString()+'.');
      }else node(root,'p',s.closesAt?'Entry deadline: '+new Date(s.closesAt).toLocaleString(): 'Counting has not started.');
      if(s.problem)node(root,'p',s.problem);
      if(s.updatedAt)node(evidence,'p','Last verified: '+new Date(s.updatedAt).toLocaleString()+'. Rankings are provisional until the draw snapshot is sealed.');
      const ranked=(s.rows||[]).filter(r=>/^\d+$/.test(r.countedRaw)&&BigInt(r.countedRaw)>=50000000000n).sort((a,b)=>BigInt(a.countedRaw)>BigInt(b.countedRaw)?-1:BigInt(a.countedRaw)<BigInt(b.countedRaw)?1:0).slice(0,10);
      if(ranked.length){node(evidence,'h4','Qualifying net purchases');const list=node(evidence,'ol','');for(const r of ranked)node(list,'li',r.wallet.slice(0,5)+'…'+r.wallet.slice(-5)+' · '+Number(BigInt(r.countedRaw)/1000000n).toLocaleString()+' $BULLEN');}
      else node(evidence,'p','No qualifying purchase entries yet.');
      if(s.winners){const result=node(root,'div','');node(result,'strong','Winners · Manual delivery pending');const list=node(result,'ul','');for(const w of s.winners)node(list,'li',`HERD #${w.position}: ${w.wallet||w.reason}`);}
      if(s.snapshotHash){const a=node(evidence,'a','View the sealed snapshot');a.href='/competition-api/snapshot';node(evidence,'p','Snapshot SHA-256: '+s.snapshotHash);}
      if(s.seedSlot)node(evidence,'p','Draw seed: finalized Solana slot '+s.seedSlot.toLocaleString()+'.');
    }catch{article.dataset.status='pending';article.querySelector('.status').textContent='Status unavailable';document.getElementById('activeCount').textContent=document.querySelectorAll('.campaign[data-status="active"]').length;root.replaceChildren();node(root,'strong','Live progress is temporarily unavailable. Please check again shortly.');article.querySelector('.actions')?.replaceChildren();}
  }
  refresh();const timer=setInterval(refresh,30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
