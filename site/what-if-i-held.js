import {calculate,inCohort,summarize,median} from './holding-math.js';

const $=id=>document.getElementById(id), set=(id,text)=>{$(id).textContent=text;};
let data,period='full',cohort='repeat',selected=null,manual=false,group=[],journalLimit=25;
const cache=new Map();
const num=(n,d=1)=>n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const sign=n=>(n < -1e-9?'−':n > 1e-9?'+':'')+num(Math.abs(n));
const pct=n=>sign(n)+'%';
const sol=n=>num(n,4)+' SOL';
const signedSol=n=>(n < -1e-9?'−':n > 1e-9?'+':'')+sol(Math.abs(n));
const short=w=>w.slice(0,6)+'…'+w.slice(-6);
const date=(t,time=false)=>new Date(t*1000).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit',hour12:false}:{}),timeZone:'UTC'});
const color=(id,n)=>{$(id).classList.remove('positive','negative','neutral');$(id).classList.add(n>1e-9?'positive':n< -1e-9?'negative':'neutral');};
const result=w=>{const key=period+':'+w.wallet;if(!cache.has(key))cache.set(key,calculate(w,data.price,data.asOf));return cache.get(key);};
function validAddress(value){if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))return false;let n=0n;for(const c of value)n=n*58n+BigInt('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.indexOf(c));let bytes=0;while(n){bytes++;n>>=8n;}return bytes+(value.match(/^1*/)?.[0].length||0)===32;}

function renderGroup(){
  const p=data.periods[period];group=p.rows.filter(w=>inCohort(w,cohort));
  const stats=summarize(group.map(result));
  set('period-label',period==='full'?'SINCE EACH WALLET’S FIRST VERIFIED BUY':date(p.start)+' — '+date(p.end));
  set('winner-count',stats.holdWins);set('winner-total','of '+stats.n+' wallets');
  set('group-result','would have finished ahead by holding.');
  set('hold-count',stats.holdWins+' holding wins');set('trade-count',stats.tradeWins+' trading wins'+(stats.ties?' · '+stats.ties+' tied':''));
  $('hold-share').style.width=100*stats.holdWins/stats.n+'%';$('trade-share').style.width=100*stats.tradeWins/stats.n+'%';$('tie-share').style.width=100*stats.ties/stats.n+'%';
  set('actual-median',pct(stats.actualReturn));color('actual-median',stats.actualReturn);set('hold-median',pct(stats.holdReturn));color('hold-median',stats.holdReturn);
  set('paired-gap','Typical wallet-by-wallet gap: '+num(Math.abs(stats.edge))+' percentage points in favour of '+(stats.edge>=0?'holding.':'trading.'));
  const rules={repeat:'At least 2 buys + 2 sells · activity spanning 24h+',frequent:'At least 10 trades + 2 sell-to-buy transitions · activity spanning 24h+',active:'At least 1 sell · activity spanning 24h+',sellers:'At least 1 sell · any activity span'};
  set('criteria',rules[cohort]+' · at least 0.1 SOL funding · group filter affects this overview and examples.');
  set('honesty',period==='full'?'Holding won more often over the full history. But it did not win for everyone: in the recent-week repeat-trader group, trading did better for 15 of 20 wallets.':'In this shorter repeat-trader window, trading did better for 15 of 20 wallets. Both median returns were negative: losing less still counts as outperforming.');
  document.querySelectorAll('[data-period]').forEach(b=>{const active=b.dataset.period===period;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  if(selected){const w=p.rows.find(w=>w.wallet===selected);if(w)showWallet(w,manual);else if(manual)lookup(selected);else example('hold');}else example('hold');
}

function showWallet(w,isManual){
  selected=w.wallet;manual=isManual;journalLimit=25;const r=result(w);$('wallet-card').hidden=false;
  set('wallet-label',isManual?'WALLET COMPARISON':'REAL EXAMPLE · NOT A GROUP AVERAGE');
  set('wallet-link',short(w.wallet));$('wallet-link').title=w.wallet;$('wallet-link').href='https://solscan.io/account/'+w.wallet;
  set('wallet-window',(period==='full'?'From first verified buy · ':'Seven-day comparison · ')+date(w.start,true)+' UTC → '+date(data.asOf,true)+' UTC');
  set('wallet-actual',pct(r.actualReturn));color('wallet-actual',r.actualReturn);set('wallet-held',pct(r.holdReturn));color('wallet-held',r.holdReturn);
  set('wallet-actual-pnl',signedSol(r.pnl)+' total profit / loss');set('wallet-held-pnl',signedSol(r.holdPnl)+' total profit / loss');
  set('actual-value',sol(r.actual)+' ending value');set('held-value',sol(r.held)+' ending value');
  const tied=Math.abs(r.edge)<1e-5;
  set('wallet-verdict',tied?'Trading and holding finished level.':(r.edge>0?'Holding would have added ':'Trading added ')+num(Math.abs(r.edge))+' percentage points to the return.');
  const context=r.actualReturn<0?'Your trading result is still a loss. ':'';
  set('wallet-explanation',context+(tied?'Both versions ended with the same value.':r.edge>0?'The holding version finished with '+sol(r.held-r.actual)+' more value.':'The recorded trades finished with '+sol(r.actual-r.held)+' more value than holding.')+' Both versions used '+sol(r.capital)+' of funding.');
  for(const [id,n]of [['realized',r.realized],['unrealized',r.unrealized],['total-pnl',r.pnl]]){set(id,signedSol(n));color(id,n);}
  set('realized-note',period==='recent'?'Realized change within this week · FIFO':'Realized profit / loss · FIFO');
  set('pnl-denominator',pct(r.actualReturn)+' of '+sol(r.capital)+' funding');
  set('funding','New SOL added: '+sol(r.fresh)+(w.openingValue>0?' · opening tokens: '+sol(w.openingValue):''));
  set('inventory','Still held: '+num(Math.max(0,r.tokens),2)+' BULLEN');set('cash','SOL retained in this strategy: '+sol(r.cash));
  set('trade-count-wallet',r.buys+' buys · '+r.sells+' sells · '+r.saleGains+' profitable sales · '+r.saleLosses+' loss-making sales');
  if(r.matchedSales>0){set('buyback-title',num(Math.abs(r.rebuyPremium))+'% '+(r.rebuyPremium<0?'cheaper':'more expensive')+' to buy back');set('buyback-note','The matched tokens sold for '+sol(r.matchedSales)+' and cost '+sol(r.matchedBuys)+' to repurchase.');}
  else{set('buyback-title','No matched sell-and-buy-back pair');set('buyback-note','There are no repurchased token quantities to compare in this window.');}
  drawChart(r.points);renderJournal(r);
  if(!isManual)set('wallet-status','Showing a real example. Paste your address for your own result.');
}

function example(kind){
  let rows=group.filter(w=>{const r=result(w);return kind==='hold'?r.edge>1e-5:kind==='trade'?r.edge< -1e-5:r.pnl<0;});
  if(!rows.length){set('wallet-status','There is no matching example in this group. Try a different group or period.');return;}
  const middle=median(rows.map(w=>result(w).edge));rows.sort((a,b)=>Math.abs(result(a).edge-middle)-Math.abs(result(b).edge-middle));
  $('wallet-input').value='';showWallet(rows[0],false);
}

function lookup(address){
  if(!validAddress(address)){set('wallet-status','Enter a valid Solana wallet address to compare it.');$('wallet-card').hidden=true;selected=null;return;}
  const p=data.periods[period],w=p.rows.find(w=>w.wallet===address);manual=true;selected=address;
  if(!w){$('wallet-card').hidden=true;const excluded=p.excluded.find(w=>w.wallet===address);set('wallet-status',excluded?'We can’t calculate a reliable result for this wallet in this window. Transfers, missing acquisition costs or unsupported trades prevent a complete comparison. Try the other period.':'This wallet has no comparable recorded trades in this snapshot window. This is a dated study, not a live wallet scan. Try the other period.');return;}
  set('wallet-status','Matched a verified history. The group filter does not exclude your personal comparison.');showWallet(w,true);
}

function drawChart(points){
  const svg=$('return-chart'),values=points.flatMap(p=>[p.actual,p.hold]);let low=Math.min(0,...values),high=Math.max(0,...values);
  if(high-low<1){low-=.5;high+=.5;}const pad=(high-low)*.08;low-=pad;high+=pad;
  const first=points[0].time,last=points.at(-1).time,x=t=>85+885*(t-first)/Math.max(1,last-first),y=v=>215-185*(v-low)/(high-low);
  const line=k=>points.map((p,i)=>(i?'L':'M')+x(p.time).toFixed(2)+' '+y(p[k]).toFixed(2)).join(' ');
  const label=n=>Math.abs(n)>=10000?num(n/1000,0)+'k%':num(n,0)+'%';
  const ticks=[0,low+pad,high-pad].filter((v,i,a)=>a.slice(0,i).every(other=>Math.abs(y(v)-y(other))>=24));
  svg.innerHTML='<title>Recorded trading return '+pct(points.at(-1).actual)+'; holding return '+pct(points.at(-1).hold)+'</title>'+ticks.map(v=>'<line x1="85" x2="970" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#303328"'+(v===0?' stroke-dasharray="5 5"':'')+'/><text x="70" y="'+(y(v)+6)+'" text-anchor="end" fill="#a3a69c" font-size="17" font-family="monospace">'+label(v)+'</text>').join('')+'<path d="'+line('hold')+'" fill="none" stroke="#c6ac6c" stroke-width="3"/><path d="'+line('actual')+'" fill="none" stroke="#82c7b1" stroke-width="3"/><text x="85" y="249" fill="#a3a69c" font-size="16" font-family="monospace">'+date(first)+'</text><text x="970" y="249" text-anchor="end" fill="#a3a69c" font-size="16" font-family="monospace">'+date(last)+'</text>';
}

function renderJournal(r){
  $('trade-rows').replaceChildren();
  for(const e of r.journal.slice(0,journalLimit)){
    const tr=document.createElement('tr');
    const td=document.createElement('td'),a=document.createElement('a');a.href='https://solscan.io/tx/'+encodeURIComponent(e.signature);a.target='_blank';a.rel='noopener noreferrer';a.textContent=date(e.time,true)+' ↗';td.append(a);tr.append(td);
    for(const text of [e.buy?'Buy':'Sell',num(e.quantity,2),sol(e.sol),e.closed===null?'—':signedSol(e.closed)]){const cell=document.createElement('td');cell.textContent=text;tr.append(cell);}
    if(e.closed!==null)tr.lastChild.className=e.closed>1e-9?'positive':e.closed< -1e-9?'negative':'neutral';$('trade-rows').append(tr);
  }
  $('more-trades').hidden=journalLimit>=r.journal.length;set('more-trades','Show more trades ('+Math.min(journalLimit,r.journal.length)+' of '+r.journal.length+') ↓');
}

function sourceDetails(){
  set('snapshot','Snapshot · '+date(data.asOf,true)+' UTC');
  set('coverage',data.periods.full.rows.length.toLocaleString()+' full histories pass the reconciliation checks; '+data.periods.recent.rows.length+' pass for the recent week. The default repeat-trader groups contain 94 and 20 wallets respectively. These are different groups, not the same people measured twice.');
  set('source-details','Successful mint-address history: 19,839 transactions. Main-pool history: 16,698 overlapping transactions, not added twice. Finalized cutoff: slot '+data.slot+' · '+date(data.asOf,true)+' UTC. Closing pool-price observation: '+date(data.priceTime,true)+' UTC. Price: '+data.price.toPrecision(10)+' SOL per BULLEN.');
  $('source-links').replaceChildren();for(const [label,url]of [['Token mint','https://solscan.io/token/'+data.mint],['Main pool','https://solscan.io/account/'+data.pool],['Closing price receipt','https://solscan.io/tx/'+data.priceSignature],['Opening week price receipt','https://solscan.io/tx/'+data.openingPriceSignature]]){const a=document.createElement('a');a.textContent=label+' ↗';a.href=url;a.target='_blank';a.rel='noopener noreferrer';$('source-links').append(a,document.createTextNode('  ·  '));}
}

document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{period=b.dataset.period;renderGroup();}));
$('cohort').addEventListener('change',()=>{cohort=$('cohort').value;renderGroup();});
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>example(b.dataset.example)));
$('wallet-form').addEventListener('submit',e=>{e.preventDefault();lookup($('wallet-input').value.trim());});
$('more-trades').addEventListener('click',()=>{journalLimit+=50;const w=data.periods[period].rows.find(w=>w.wallet===selected);if(w)renderJournal(result(w));});
$('copy-comparison').addEventListener('click',async()=>{const url=new URL(location.href);url.hash=new URLSearchParams({wallet:selected,period}).toString();try{await navigator.clipboard.writeText(url.href);set('wallet-status','Comparison link copied.');}catch{set('wallet-status',url.href);}});
window.addEventListener('hashchange',()=>{
  if(!data)return;
  const hash=new URLSearchParams(location.hash.slice(1));
  if(!validAddress(hash.get('wallet')||''))return;
  selected=hash.get('wallet');manual=true;period=hash.get('period')==='recent'?'recent':'full';
  $('wallet-input').value=selected;renderGroup();
});

async function boot(){
  set('load-status','Loading the verified trade history…');
  try{const response=await fetch('/holding-study.json',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Study unavailable');data=await response.json();if(data.schema!==1||!data.periods?.full?.rows?.length||!Number.isFinite(data.price)||!Number.isFinite(data.asOf))throw new Error('Invalid study');
    const hash=new URLSearchParams(location.hash.slice(1));period=hash.get('period')==='recent'?'recent':'full';
    if(validAddress(hash.get('wallet')||'')){selected=hash.get('wallet');manual=true;$('wallet-input').value=selected;}
    sourceDetails();renderGroup();set('load-status','');$('tool').hidden=false;
  }catch{set('load-status','The study couldn’t load. Your wallet has not been connected. ');const b=document.createElement('button');b.type='button';b.className='quiet';b.textContent='Try again';b.onclick=boot;$('load-status').append(b);}
}
boot();
