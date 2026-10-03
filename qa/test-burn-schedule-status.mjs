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

// Exercise the dashboard's real rendering functions with milestone boundaries
// and delayed receipts; percentages describe volume, never completed burns.
const stats = await readFile(new URL('../site/stats.html', import.meta.url), 'utf8');
const between = (start, end) => {
  const from = stats.indexOf(start), to = stats.indexOf(end, from);
  assert(from >= 0 && to > from);
  return stats.slice(from, to);
};
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {
    style:{}, attributes:{}, classes:new Set(), html:'', text:'',
    set innerHTML(value){ this.html=value; this.text=''; }, get innerHTML(){ return this.html; },
    set textContent(value){ this.text=value; this.html=''; }, get textContent(){ return this.text; },
    setAttribute(key,value){ this.attributes[key]=value; },
    removeAttribute(key){ delete this.attributes[key]; },
    get classList(){ return {add:value=>this.classes.add(value),remove:value=>this.classes.delete(value)}; },
  });
  return nodes.get(id);
};
let volumeBody = {ok:true,total:675400}, volumeFails = false;
const dashboard = vm.createContext({
  BURN_THRESHOLDS:[250000,1000000,5000000,20000000,50000000],
  BURN_TIER_TOKENS:[12500000,25000000,37500000,62500000,112500000],
  TIER_LABELS:['$250K','$1M','$5M','$20M','$50M'],
  CFG:{DEMO:false}, scheduleProof:{count:1,burned:12500000},
  lastRealVolume:null, lastCompleteState:null, $:node,
  fmtUsd:String,fmtInt:String,fitTierTable(){},checkTierCompletion(){},AbortSignal,
  fetch:async()=>{if(volumeFails)throw Error('offline');return{ok:true,json:async()=>volumeBody};},
});
vm.runInContext(
  between('  function targetPct(', '  // A short viewport') +
  between('  function paintVolume(', '  // ---------------------------------------------------------- fetching') +
  between('  async function fetchVolume(', '  // Wrapped SOL'), dashboard);

for (const [volume,pct,target] of [
  [0,0,'$250K'],[125000,50,'$250K'],[249999,99.9,'$250K'],
  [250000,25,'$1M'],[675000,67.5,'$1M'],[675400,67.5,'$1M'],
  [999999,99.9,'$1M'],[1000000,20,'$5M'],[5000000,25,'$20M'],
  [20000000,40,'$50M'],[49999999,99.9,'$50M'],[50000000,100,'All reached'],
  [60000000,100,'All reached'],
]){
  dashboard.paintVolume(volume);
  assert.equal(node('burnFill').style.width,`${pct}%`);
  assert.equal(node('burnProgress').attributes['aria-valuenow'],String(pct));
  assert.equal(node('nextBurn').textContent,target);
  if(volume<50000000)assert.equal(node('targetProgress').textContent,`${pct}% to ${target}`);
}
for(const volume of [NaN,Infinity,-1])assert.equal(dashboard.schedulePct(volume),0);
dashboard.paintVolume(675400);
assert.match(node('tierTable').innerHTML,/67\.5% there/);
assert.equal(dashboard.renderTierTable(675450),false,'same tenth does not rebuild the table');
dashboard.paintVolume(1000000);
assert.equal((node('tierTable').innerHTML.match(/✓ done/g)||[]).length,1);
assert.match(node('tierTable').innerHTML,/threshold reached/);
assert.match(node('tierTable').innerHTML,/20% there/);
assert.equal(node('burnedSoFar').textContent,'12500000');
dashboard.scheduleProof={count:2,burned:37500000};
dashboard.paintVolume(1000000);
assert.equal((node('tierTable').innerHTML.match(/✓ done/g)||[]).length,2);
assert.match(node('tierTable').innerHTML,/20% there/);
dashboard.scheduleProof=null;
dashboard.paintVolume(50000000);
assert.doesNotMatch(node('tierTable').innerHTML,/✓ done/);
assert.equal(node('completeNote').classes.has('show'),false);
assert.equal(node('targetProgress').textContent,'All volume targets reached');
dashboard.scheduleProof={count:5,burned:250000000};
dashboard.paintVolume(50000000);
assert.equal(node('completeNote').classes.has('show'),true);
dashboard.CFG.DEMO=true;
dashboard.scheduleProof=null;
dashboard.paintVolume(1000000);
assert.equal(node('burnedSoFar').textContent,'37500000');
assert.equal(node('burnedLabel').textContent,'Simulated schedule burns');
assert.match(node('tierTable').innerHTML,/20% there/);
dashboard.CFG.DEMO=false;
await dashboard.fetchVolume();
volumeFails=true;
await dashboard.fetchVolume();
assert.equal(node('targetProgress').textContent,'');
assert.equal(node('burnProgress').attributes['aria-valuenow'],undefined);
assert.equal(dashboard.lastRealVolume,null,'receipt refresh must not restore stale volume');
volumeFails=false;
await dashboard.fetchVolume();
assert.match(node('tierTable').innerHTML,/67\.5% there/,'unchanged volume restores rows after an outage');
assert.equal(node('burnProgress').attributes['aria-valuenow'],'67.5');
console.log('Dashboard: cumulative target progress, all threshold transitions, pending receipts, demo and feed recovery passed.');
