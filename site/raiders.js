(()=>{'use strict';
const $=id=>document.getElementById(id),fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);
let data=null,busy=false,lastGood=0;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
function link(h){const n=el('a','handle','@'+h);n.href='https://x.com/'+encodeURIComponent(h);n.target='_blank';n.rel='noopener noreferrer';return n}
function date(d){return new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}
function render(){
 const query=$('search').value.trim().replace(/^@/,'').toLowerCase(),open=new Set([...document.querySelectorAll('.week[open]')].map(x=>x.dataset.week));
 $('all-time').replaceChildren(...data.allTime.map(r=>{const c=el('article','champion');c.append(el('span','rank',String(r.rank).padStart(2,'0')),link(r.handle),el('strong','score',fmt(r.points)),el('span','unit','POINTS'));return c}));
 if(!data.allTime.length)$('all-time').append(el('p','loading','The first points are still to come.'));
 $('weeks').replaceChildren();let matches=0;
 for(const w of data.weeks){const rows=w.leaders.filter(r=>!query||r.handle.includes(query));if(query&&!rows.length)continue;matches++;
 const card=el('details','week'+(w.status==='current'?' current':''));card.dataset.week=w.week;card.open=!!query||w.status==='current'||open.has(w.week);
 const summary=el('summary'),title=el('div');title.append(el('p','eyebrow',w.status==='current'?'THIS WEEK · IN PROGRESS':'CLOSED WEEK'),el('h3','',date(w.week)),el('p','week-total',fmt(w.total)+' points · '+w.accounts+' raiders'));summary.append(title);card.append(summary);
 if(!rows.length)card.append(el('p','week-empty',w.recorded?'No points recorded this week.':'No points recorded yet.'));
 else{const table=el('table','standings');table.setAttribute('aria-label','Week of '+date(w.week));const thead=el('thead'),head=el('tr');for(const t of ['#','RAIDER','POINTS']){const th=el('th','',t);th.scope='col';head.append(th)}thead.append(head);table.append(thead);const body=el('tbody');for(const r of rows){const tr=el('tr'),name=el('td');name.append(link(r.handle));tr.append(el('td','',String(r.rank).padStart(2,'0')),name,el('td','',fmt(r.points)));body.append(tr)}table.append(body);card.append(table)}$('weeks').append(card);
 }
 $('empty').hidden=matches>0;$('total').textContent=fmt(data.total);$('summary').textContent='recorded points · '+data.accounts+' raiders';$('since').textContent='SINCE '+date(data.since).toUpperCase();
 for(const id of ['weeks','all-time'])$(id).setAttribute('aria-busy','false');
}
async function refresh(){if(busy||document.hidden)return;busy=true;try{const r=await fetch('/volume/raiders',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const j=await r.json();if(j.schema!==1||!Array.isArray(j.weeks)||!Array.isArray(j.allTime))throw Error();data=j;lastGood=Date.now();render();$('freshness').textContent='Updated '+new Date(j.generatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+(j.collection?.complete===false?' · Collection catching up':' · Refreshes automatically');}catch{ $('freshness').textContent=lastGood?'Update delayed. Showing the last loaded standings.':'Standings unavailable. Retrying shortly.';if(!data){$('all-time').textContent='The board could not be loaded.';$('weeks').textContent='Please try again shortly.'}}finally{busy=false}}
$('search').addEventListener('input',()=>{if(data)render()});document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(refresh,60000);refresh();
})();
