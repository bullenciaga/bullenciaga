import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../site/burn-schedule-status.js',import.meta.url),'utf8');
let body,calls=0,failed=false;
const context={window:{},AbortSignal,Date,fetch:async()=>{calls++;if(failed)throw Error('offline');return {ok:true,json:async()=>structuredClone(body)};}};
vm.runInNewContext(source,context);
const load=()=>context.window.BullenBurnSchedule.load();
const tier=(amount,char='1')=>({kind:'tier',amount,sig:char.repeat(88)});
body={ok:true,count:1,burns:[tier(12500000)]};
const [first,parallel]=await Promise.all([load(),load()]);assert.equal(calls,1);assert.equal(first,parallel);assert.equal(first.burned,12500000);assert.equal(first.count,1);
// Crossing any trading threshold without another receipt cannot confirm a burn.
body.volume=1e12;assert.equal((await load()).count,1);
body={ok:true,count:2,burns:[tier(12500000),tier(12500000)]};await assert.rejects(load(),/Invalid burn/);
body={ok:true,count:1,burns:[tier(25000000)]};await assert.rejects(load(),/Unrecognized/);
body={ok:true,count:2,burns:[tier(12500000)]};await assert.rejects(load(),/Incomplete/);
failed=true;await assert.rejects(load(),/offline/);failed=false;
body={ok:true,count:2,burns:[tier(12500000),tier(25000000,'2')]};assert.equal((await load()).burned,37500000);
body={ok:true,count:0,burns:[]};assert.equal((await load()).burned,0);
console.log('Burn schedule: receipt validation, deduplication, threshold distinction and outage recovery passed.');

// Exercise the actual dashboard code with independent, delayed receipt and
// volume feeds. A request in flight is not evidence of an unconfirmed burn.
const stats = await readFile(new URL('../site/stats.html', import.meta.url), 'utf8');
const between = (start, end) => {
  const from = stats.indexOf(start), to = stats.indexOf(end, from);
  assert(from >= 0 && to > from);
  return stats.slice(from, to);
};
const dashboardSource = between('  function targetPct(', '  // ---------------------------------------------------------- fetching') +
  between('  async function fetchVolume(', '  // Wrapped SOL');
const flush = () => new Promise(resolve => setImmediate(resolve));
const proof = (count, checkedAt=Date.now()) => ({
  count, checkedAt, burned:[12500000,25000000,37500000,62500000,112500000].slice(0,count).reduce((a,b)=>a+b,0),
});
function dashboardHarness(){
  const nodes = new Map(), pendingProofs = [], panel = {scrollHeight:100,clientHeight:100};
  let volumeBody = {ok:true,total:675400}, volumeFails = false;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      style:{}, attributes:{}, classes:new Set(), html:'', text:'', rows:[], title:'',
      set innerHTML(value){
        this.html=value; this.text='';
        this.rows=[...value.matchAll(/<div class="trow ([^"]+)"/g)].map(match=>({
          style:{}, classList:{contains:name=>match[1].split(/\s+/).includes(name)},
        }));
      },
      get innerHTML(){return this.html;},
      set textContent(value){this.text=value;this.html='';this.rows=[];},
      get textContent(){return this.text;},
      setAttribute(key,value){this.attributes[key]=value;},
      removeAttribute(key){delete this.attributes[key];},
      querySelectorAll(selector){assert.equal(selector,'.trow');return this.rows;},
      closest(selector){assert.equal(selector,'.panel.grow');return panel;},
      get classList(){return {
        add:value=>this.classes.add(value),remove:value=>this.classes.delete(value),contains:value=>this.classes.has(value),
      };},
    });
    return nodes.get(id);
  };
  for(const id of ['cumVol','burnedSoFar','nextBurn'])node(id).textContent='Loading…';
  const context=vm.createContext({
    BURN_THRESHOLDS:[250000,1000000,5000000,20000000,50000000],
    BURN_TIER_TOKENS:[12500000,25000000,37500000,62500000,112500000],
    TIER_LABELS:['$250K','$1M','$5M','$20M','$50M'],
    CFG:{DEMO:false}, $:node, fmtUsd:String,fmtInt:String,checkTierCompletion(){},AbortSignal,Date,
    setInterval(){},
    window:{BullenBurnSchedule:{load:()=>new Promise((resolve,reject)=>pendingProofs.push({resolve,reject}))}},
    fetch:async()=>{if(volumeFails)throw Error('offline');return{ok:true,json:async()=>volumeBody};},
  });
  vm.runInContext(dashboardSource,context);
  context.renderTierTable(null);
  context.fitTierTable();
  return {
    context,node,panel,
    get:expression=>vm.runInContext(expression,context),
    paint:volume=>context.paintVolume(volume),
    table:()=>node('tierTable').innerHTML,
    statuses:()=>[...node('tierTable').innerHTML.matchAll(/<div class="status"[^>]*>([\s\S]*?)<\/div>/g)]
      .map(match=>match[1].replace(/<[^>]*>/g,'').trim().toLowerCase()),
    displayedRows:()=>node('tierTable').rows.flatMap((row,i)=>row.style.display==='none'?[]:[i]),
    async settleProof(value){assert(pendingProofs.length,'proof request exists');pendingProofs.shift().resolve(value);await flush();},
    async failProof(){assert(pendingProofs.length,'proof request exists');pendingProofs.shift().reject(Error('offline'));await flush();},
    refresh:()=>context.refreshScheduleProof(),
    fetchVolume:()=>context.fetchVolume(),
    setVolume:value=>{volumeBody={ok:true,total:value};},
    failVolume:value=>{volumeFails=value;},
  };
}

// A cold load reserves five rows without asserting zero volume or a burn state.
const loading=dashboardHarness();
assert.equal(loading.statuses().length,5);
assert(loading.statuses().every(status=>status==='—'));
assert.equal(loading.node('cumVol').textContent,'Loading…');
assert.equal(loading.get('lastRealVolume'),null);
assert.equal(loading.get('scheduleProofState'),'loading');

// Volume wins the race: the completed tier stays neutral until proof resolves.
loading.paint(675400);
assert.equal(loading.statuses()[0],'—');
assert.equal(loading.statuses()[1],'67.5% there');
assert.equal(loading.node('burnedSoFar').textContent,'Loading…');
assert.equal(loading.node('burnFill').style.width,'67.5%');
loading.panel.scrollHeight=200;
loading.context.fitTierTable();
assert.deepEqual(loading.displayedRows(),[1],'compact viewport follows current volume target during proof load');
await loading.settleProof(proof(1));
assert.equal(loading.statuses()[0],'✓ done');
assert.equal(loading.node('burnedSoFar').textContent,'12500000');
assert.deepEqual(loading.displayedRows(),[1],'receipt arrival must not switch the compact row');
assert.equal(loading.context.renderTierTable(675450),false,'same tenth does not rebuild the table');

// A refresh in flight or failed refresh retains already-validated receipts.
const refresh=loading.refresh();
assert.equal(loading.statuses()[0],'✓ done');
assert.equal(loading.get('scheduleProofState'),'ready');
await loading.failProof();await refresh;
assert.equal(loading.get('scheduleProofState'),'stale');
assert.equal(loading.statuses()[0],'✓ done');
assert.equal(loading.node('burnedSoFar').textContent,'12500000');
assert.match(loading.node('burnedSoFar').title,/checked|verified/i);
const downgraded=loading.refresh();
await loading.settleProof(proof(0));await downgraded;
assert.equal(loading.get('scheduleProof.count'),1,'regressive snapshots cannot erase confirmed burns');
assert.equal(loading.statuses()[0],'✓ done');
const recovered=loading.refresh();
await loading.settleProof(proof(2));await recovered;
assert.equal(loading.get('scheduleProofState'),'ready');
assert.equal(loading.node('burnedSoFar').textContent,'37500000');

// Proof wins the race: confirmed totals may render, while volume stays unknown.
const proofFirst=dashboardHarness();
await proofFirst.settleProof(proof(1));
assert.equal(proofFirst.node('cumVol').textContent,'Loading…');
assert.equal(proofFirst.get('lastRealVolume'),null);
assert.equal(proofFirst.statuses()[0],'✓ done');
assert(proofFirst.statuses().slice(1).every(status=>status==='—'));
proofFirst.paint(675400);
assert.equal(proofFirst.statuses()[1],'67.5% there');

// A failed first proof is unknown, not a factual claim of a pending burn.
const unavailable=dashboardHarness();
unavailable.paint(675400);
await unavailable.failProof();
assert.equal(unavailable.get('scheduleProofState'),'unavailable');
assert.equal(unavailable.statuses()[0],'unknown');
assert.equal(unavailable.node('burnedSoFar').textContent,'Unavailable');
const retry=unavailable.refresh();
await unavailable.settleProof(proof(0));await retry;
assert.equal(unavailable.statuses()[0],'reached','a validated empty proof can report a reached, unconfirmed tier');
assert.equal(unavailable.node('burnedSoFar').textContent,'0');
assert.equal(unavailable.node('completeNote').classes.has('show'),false);

// Existing cumulative target behavior and every milestone boundary are retained.
for(const [volume,pct,target] of [
  [0,0,'$250K'],[125000,50,'$250K'],[249999,99.9,'$250K'],
  [250000,25,'$1M'],[675000,67.5,'$1M'],[675400,67.5,'$1M'],
  [999999,99.9,'$1M'],[1000000,20,'$5M'],[5000000,25,'$20M'],
  [20000000,40,'$50M'],[49999999,99.9,'$50M'],[50000000,100,'All reached'],
  [60000000,100,'All reached'],
]){
  proofFirst.paint(volume);
  assert.equal(proofFirst.node('burnFill').style.width,`${pct}%`);
  assert.equal(proofFirst.node('burnProgress').attributes['aria-valuenow'],String(pct));
  assert.equal(proofFirst.node('nextBurn').textContent,target);
  if(volume<50000000)assert.equal(proofFirst.node('targetProgress').textContent,`${pct}% to ${target}`);
}
for(const volume of [NaN,Infinity,-1])assert.equal(proofFirst.context.schedulePct(volume),0);
proofFirst.paint(1000000);
assert.deepEqual(proofFirst.statuses(),['✓ done','reached','20% there','upcoming','upcoming']);
proofFirst.paint(50000000);
assert.equal(proofFirst.node('completeNote').classes.has('show'),false);
assert.equal(proofFirst.node('targetProgress').textContent,'All volume targets reached');
const finished=proofFirst.refresh();
await proofFirst.settleProof(proof(5));await finished;
assert.equal(proofFirst.node('completeNote').classes.has('show'),true);
assert(proofFirst.statuses().every(status=>status==='✓ done'));

// Volume outages keep the five-row geometry and never erase validated burns.
await loading.fetchVolume();
loading.failVolume(true);
await loading.fetchVolume();
assert.equal(loading.node('targetProgress').textContent,'');
assert.equal(loading.node('burnProgress').attributes['aria-valuenow'],undefined);
assert.equal(loading.get('lastRealVolume'),null,'receipt refresh must not restore stale volume');
assert.equal(loading.statuses().length,5);
assert.deepEqual(loading.statuses().slice(0,2),['✓ done','✓ done']);
assert(loading.statuses().slice(2).every(status=>status==='—'));
const duringOutage=loading.refresh();
await loading.settleProof(proof(2));await duringOutage;
assert.equal(loading.get('lastRealVolume'),null);
assert.equal(loading.node('cumVol').textContent,'Unavailable');
loading.failVolume(false);
loading.setVolume(1200000);
await loading.fetchVolume();
assert.equal(loading.statuses()[2],'24% there');
assert.equal(loading.node('burnProgress').attributes['aria-valuenow'],'24');

// Demonstration mode stays clearly simulated and does not wait for real proof.
const demo=dashboardHarness();
demo.context.CFG.DEMO=true;
demo.paint(1000000);
assert.equal(demo.node('burnedSoFar').textContent,'37500000');
assert.equal(demo.node('burnedLabel').textContent,'Simulated schedule burns');
assert.deepEqual(demo.statuses(),['✓ done','✓ done','20% there','upcoming','upcoming']);
demo.paint(50000000);
assert.equal(demo.node('completeNote').classes.has('show'),true);
console.log('Dashboard: independent loading order, receipt refresh/outage stability, milestone transitions, fixed row reservation and demo passed.');
