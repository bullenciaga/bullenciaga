const ID='golden-jacket-699-613-517-61-961';
export function installGoldenJacket(authority){
  const campaign=authority.campaigns.find(c=>c.id===ID),article=document.getElementById(ID),root=article?.querySelector('.golden-runtime');
  if(!campaign||!root)return;
  article.querySelector('.campaign-copy')?.insertBefore(root,article.querySelector('.rules'));
  if(!campaign.automation?.enabled){root.textContent='Preview · Counting has not started. Launch time will be announced after the rules are confirmed.';return;}
  const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;root.append(node);return node;};
  async function refresh(){
    try{
      const response=await fetch('/competition-api/status',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Status unavailable');const s=await response.json();
      if(s.campaign!==ID||!['not-started','live','closing','review','sealed','committed','drawn'].includes(s.phase))throw Error('Invalid status');
      root.replaceChildren();
      const group=s.phase==='not-started'?'upcoming':s.phase==='drawn'?'completed':s.counting?'active':'pending';
      article.dataset.status=group;article.querySelector('.status').textContent=s.phase.replaceAll('-',' ');
      const destination=document.getElementById(group+'-title')?.closest('.campaign-section')?.querySelector('.campaign-grid');destination?.querySelector('.empty')?.remove();destination?.append(article);
      document.getElementById('activeCount').textContent=document.querySelectorAll('.campaign[data-status="active"]').length;
      const actions=article.querySelector('.actions');actions.replaceChildren();
      if(s.counting){const a=document.createElement('a');a.href='/buy';a.className='action primary';a.textContent='Open the buy page';actions.append(a);}
      text('strong',s.phase==='not-started'?'Counting has not started':s.counting?'Competition live':s.phase==='drawn'?'Winners selected · Manual delivery pending':'Entries closed · Selection pending');
      if(s.amendment){
        article.querySelector('.trigger').textContent='The draw unlocks at 100,000,000 $BULLEN in cumulative buys.';
        const total=BigInt(s.buyVolumeRaw||'0'),target=BigInt(s.amendment.targetRaw),percent=Number(total*10000n/target)/100;
        const panel=text('div','');panel.className='golden-volume';
        const label=document.createElement('span');label.className='volume-label';label.textContent='THE ROAD TO THE DRAW';panel.append(label);
        const tally=document.createElement('div');tally.className='volume-tally';tally.textContent=s.volumeReady?(Number(total/1000000n)).toLocaleString()+' / 100,000,000 $BULLEN':'Verifying buys since launch…';panel.append(tally);
        const track=document.createElement('div');track.className='volume-track';track.setAttribute('role','progressbar');track.setAttribute('aria-label','Cumulative buys toward the draw');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100000000');if(s.volumeReady)track.setAttribute('aria-valuenow',String(Math.min(100000000,Number(total/1000000n))));
        const fill=document.createElement('span');fill.style.width=Math.min(100,percent)+'%';track.append(fill);panel.append(track);
        const detail=document.createElement('p');detail.textContent=(s.volumeReady?percent.toFixed(1)+'% · ':'')+'Every buy moves the bar. Sells do not move it backwards.';panel.append(detail);
        text('p','Purchase history and entry rules are unchanged. Every purchase ticket still requires holding. The volume target replaces the original timer.');
        if(s.closedAt)text('p','Entries closed at the verified snapshot: '+new Date(s.closedAt).toLocaleString()+'.');
      }else if(campaign.amendmentPlanned){text('p','The volume amendment is being applied. Existing entries are preserved.');}
      else if(s.closesAt)text('p','Entry deadline: '+new Date(s.closesAt).toLocaleString()+'.');
      if(s.updatedAt)text('p','Last verified update: '+new Date(s.updatedAt).toLocaleString()+'. Rankings are provisional until the closing evidence is sealed.');
      if(s.problem)text('p',s.problem);
      if(s.rows?.some(r=>BigInt(r.countedRaw)>=50000000000n)){
        text('h4','Qualifying net purchases');const list=text('ol','');
        const ranked=s.rows.filter(r=>/^\d+$/.test(r.countedRaw)&&BigInt(r.countedRaw)>=50000000000n).sort((a,b)=>BigInt(a.countedRaw)>BigInt(b.countedRaw)?-1:BigInt(a.countedRaw)<BigInt(b.countedRaw)?1:0).slice(0,10);
        for(const r of ranked){const li=document.createElement('li');li.textContent=r.wallet.slice(0,5)+'…'+r.wallet.slice(-5)+' · '+(Number(BigInt(r.countedRaw)/1000000n)).toLocaleString()+' $BULLEN';list.append(li);}
      }
      if(s.winners){const list=text('ul','');for(const w of s.winners){const li=document.createElement('li');li.textContent=`HERD #${w.position}: ${w.wallet||w.reason}`;list.append(li);}}
      if(s.snapshotHash){const a=text('a','View the sealed snapshot');a.href='/competition-api/snapshot';text('p','Snapshot SHA-256: '+s.snapshotHash);}
      if(s.seedSlot)text('p','Draw seed target: finalized Solana slot '+s.seedSlot.toLocaleString()+'.');
    }catch{article.dataset.status='pending';article.querySelector('.status').textContent='Status unavailable';document.getElementById('activeCount').textContent=document.querySelectorAll('.campaign[data-status="active"]').length;root.replaceChildren();text('strong','Live status is temporarily unavailable. No new eligibility or result is inferred.');article.querySelector('.actions')?.replaceChildren();}
  }
  refresh();const timer=setInterval(refresh,30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
