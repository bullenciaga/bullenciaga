// Public API fixtures only. Usage: node this-file.mjs [built-flywheel.html|live-data.js]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const here = new URL('.', import.meta.url);
const supplied = process.argv[2];
let source = readFileSync(supplied || new URL('../site/flywheel.html', here), 'utf8');
const start = source.indexOf('/* Public, read-only flywheel accounting.');
const ending = "})(typeof window !== 'undefined' ? window : globalThis);";
assert.ok(start >= 0 && source.indexOf(ending, start) > start, 'live module exists in candidate');
source = source.slice(start, source.indexOf(ending, start) + ending.length);
function load(extra = {}) {
  const context = { module: { exports: {} }, Intl, Date, Uint8Array, AbortController, atob, setTimeout, clearTimeout, ...extra };
  vm.createContext(context); vm.runInContext(source, context); return { ...context.module.exports, context };
}
const mod = load();
const fixture = Object.fromEntries(['supply','minted','objects','proof','chain'].map(k => [k, JSON.parse(readFileSync(new URL('fixtures/flywheel/' + k + '.json', here), 'utf8'))]));
fixture.chainAt = Date.parse(JSON.parse(readFileSync(new URL('fixtures/flywheel/chain-retrieved.json', here), 'utf8')).receivedAt);
const now = fixture.chainAt;
const clone = () => structuredClone(fixture);
const check = x => mod.validateCohort(x, now);
const baseline = check(clone());
let seq = 0;
function burn(c, amount, kind='dev') {
  const raw = BigInt(c.chain.result.value[0].data.parsed.info.supply) - BigInt(Math.round(amount * 1e6));
  c.chain.result.value[0].data.parsed.info.supply = raw.toString();
  c.supply.totalSupply = Number(raw) / 1e6; c.supply.maxSupply = c.supply.totalSupply;
  c.supply.circulatingSupply = c.supply.totalSupply - c.supply.nonCirculating;
  c.supply.burnedSinceLaunch = 1e9 - c.supply.totalSupply;
  c.proof.burnedActual = c.supply.burnedSinceLaunch;
  c.proof.burns.push({sig: String(++seq + 2).repeat(86), amount, kind, ts: now-1000});
  c.proof.count++; c.proof.burnedInLedger += amount;
}
function pending(c, amount) { c.chain.result.value[1].data.parsed.info.tokenAmount.amount = String(Math.round(amount * 1e6)); }
function herd(c) { c.minted.minted++; c.minted.remaining--; c.minted.burnedViaMints += 250000; }
function object(c, paid) {
  const t=c.objects.totals, s=c.objects.series.signet;
  for (const row of [t,s]) { row.issuedAllSources++; row.available--; if(paid){row.burnClaims++;row.committedBullen+=100000;} }
}
const tests = [];
function test(name, fn) { tests.push([name,fn]); }
test('public cohort reconciles with finalized mint and expected headroom',()=>{
 assert.equal(baseline.status,'live'); assert.equal(baseline.numbers.total,818148430.922662);
 assert.equal(baseline.numbers.headroom,352348430.922662);
 assert.equal(baseline.numbers['objects-ceiling'],18800000);
 assert.ok(Object.isFrozen(baseline.numbers));
});
test('small independent burn lowers variable headroom once',()=>{
 const c=clone();burn(c,5000);assert.equal(check(c).numbers.headroom,baseline.numbers.headroom-5000);
});
test('volume execution reduces supply and outstanding schedule equally',()=>{
 const c=clone();burn(c,25000000,'tier');c.supply.nonCirculating-=25000000;c.supply.circulatingSupply=c.supply.totalSupply-c.supply.nonCirculating;
 const x=check(c);assert.equal(x.numbers.headroom,baseline.numbers.headroom);assert.equal(x.numbers['volume-remaining'],212500000);assert.equal(x.volumeTiersCompleted,2);
});
test('lock expiry changes circulation without freeing committed budget',()=>{
 const c=clone();c.supply.nonCirculating-=25000000;c.supply.circulatingSupply+=25000000;
 const x=check(c);assert.equal(x.numbers.headroom,baseline.numbers.headroom);assert.equal(x.numbers['volume-remaining'],237500000);
});
test('identified issued HERD deposit stays live without double reservation',()=>{
 const c=clone();herd(c);pending(c,250000);const x=check(c);
 assert.equal(x.numbers['pending-escrow'],250000);assert.equal(x.numbers['herd-future'],110750000);
 assert.equal(x.numbers['fixed-future'],baseline.numbers['fixed-future']);assert.equal(x.numbers.headroom,baseline.numbers.headroom);
});
test('finalized HERD sweep does not consume variable headroom twice',()=>{
 const c=clone();herd(c);burn(c,250000,'escrow');const x=check(c);assert.equal(x.numbers.headroom,baseline.numbers.headroom);assert.equal(x.numbers['pending-escrow'],0);
});
test('paid Object pending deposit reconciles to issued claim',()=>{
 const c=clone();object(c,true);pending(c,100000);const x=check(c);
 assert.equal(x.numbers.headroom,baseline.numbers.headroom);assert.equal(x.numbers['objects-ceiling'],18800000);assert.equal(x.numbers['pending-escrow'],100000);
});
test('non-payment Object award lowers paid ceiling and frees that capacity',()=>{
 const c=clone();object(c,false);const x=check(c);assert.equal(x.numbers['objects-awards'],13);assert.equal(x.numbers['objects-ceiling'],18700000);assert.equal(x.numbers.headroom,baseline.numbers.headroom+100000);
});
test('temporary reservations remain fully budgeted',()=>{
 const c=clone();for(const row of [c.objects.totals,c.objects.series.signet]){row.available--;row.reserved++;}
 const x=check(c);assert.equal(x.numbers['objects-available'],172);assert.equal(x.numbers['objects-remaining'],173);assert.equal(x.numbers.headroom,baseline.numbers.headroom);
});
test('unknown escrow deposit cannot be added on top of unissued capacity',()=>{
 const c=clone();pending(c,250000);assert.throws(()=>check(c),/catching up/);
});
test('issuance ahead of both escrow and burn records is rejected',()=>{const c=clone();herd(c);assert.throws(()=>check(c),/catching up/);});
test('stale mint index and stale supply are rejected',()=>{
 const c=clone();c.minted.at=now-601000;assert.throws(()=>check(c),/timestamp/);
 const d=clone();d.supply.updatedAt=new Date(now-181000).toISOString();assert.throws(()=>check(d),/timestamp/);
});
test('future source timestamp is rejected',()=>{const c=clone();c.objects.generatedAt=new Date(now+61000).toISOString();assert.throws(()=>check(c),/timestamp/);});
test('wrong token mint or token program is rejected',()=>{
 const c=clone();c.supply.mint='wrong';assert.throws(()=>check(c),/identity/);
 const d=clone();d.chain.result.value[1].owner='wrong';assert.throws(()=>check(d),/identity/);
});
test('wrong account decimals or re-enabled mint authority fails closed',()=>{
 const c=clone();c.chain.result.value[0].data.parsed.info.decimals=9;assert.throws(()=>check(c),/contract/);
 const d=clone();d.chain.result.value[0].data.parsed.info.mintAuthority='someone';assert.throws(()=>check(d),/contract/);
});
test('duplicate proof signatures and incomplete response totals fail closed',()=>{
 const c=clone();c.proof.burns[0].sig=c.proof.burns[1].sig;assert.throws(()=>check(c),/duplicate/);
 const d=clone();d.proof.burns.pop();assert.throws(()=>check(d),/complete proof/);
});
test('unknown schedule tranche is not inferred from locked balance',()=>{
 const c=clone();burn(c,1000000,'tier');assert.throws(()=>check(c),/schedule/);
});
test('supply versus finalized account race is rejected',()=>{const c=clone();c.supply.totalSupply-=1;assert.throws(()=>check(c),/sources differ/);});
test('object inventory cap and series sums are checked',()=>{
 const c=clone();c.objects.totals.available--;assert.throws(()=>check(c),/stock/);
 const d=clone();d.objects.series.signet.burnClaims++;d.objects.series.signet.committedBullen+=100000;assert.throws(()=>check(d),/totals differ/);
});
test('RPC errors cannot become zero balances',()=>{const c=clone();c.chain={error:{message:'unavailable'}};assert.throws(()=>check(c),/RPC/);});
test('public finalized pool decodes real and virtual reserves separately',()=>{
 const p=mod.validatePool(fixture.chain,now,now);assert.equal(p.base,100288797.331245);assert.equal(p.rawQuote,169.181012751);assert.equal(p.virtualQuote,17.584505378);assert.equal(p.effectiveQuote,186.765518129);assert.equal(p.lpSupply,0);
});
test('pool discriminator, mint and vault owner are validated',()=>{
 const c=clone();const b=Buffer.from(c.chain.result.value[2].data[0],'base64');b[0]=0;c.chain.result.value[2].data[0]=b.toString('base64');assert.throws(()=>mod.validatePool(c.chain,now,now),/discriminator/);
 const d=clone();d.chain.result.value[3].data.parsed.info.owner='wrong';assert.throws(()=>mod.validatePool(d.chain,now,now),/identity/);
});
test('negative virtual reserve is not treated as spendable SOL',()=>{
 const c=clone();const b=Buffer.from(c.chain.result.value[2].data[0],'base64');b[260]=255;c.chain.result.value[2].data[0]=b.toString('base64');assert.throws(()=>mod.validatePool(c.chain,now,now),/flags/);
});
test('initial state contains no snapshot, pool estimate or placeholder number',()=>{
 assert.equal(mod.INITIAL.status,'loading'); assert.equal(mod.api.state.numbers,null); assert.equal(mod.api.state.pool,null);
 const initial=mod.values(mod.INITIAL);
 assert.equal(initial.status,'Checking live records…');assert.equal(initial.total,undefined);assert.equal(initial['pool-base'],undefined);
 assert.equal(initial['object-stock'],'');assert.equal(initial['as-of'],'');assert.equal(initial['tier-1-status'],'');
 assert.equal(mod.formatNumber(NaN),'');assert.equal(mod.formatNumber(169.181012751,'exact',9),'169.181012751');
});
function node(attrs={}) {
 return {attrs:{...attrs},textContent:'old',innerHTML:'unchanged',style:{},getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];}};
}
test('DOM clears stale content and makes unavailable figures inaccessible',()=>{
 const el=node({'data-live':'total','data-live-format':'millions'});
 const group=node({'data-live-group':'accounting'});
 const flex=node({'data-live-flex':'destroyed','data-live-label':'Destroyed'});
 const width=node({'data-live-width':'herd-progress'});
 mod.api.applyTo({querySelectorAll:s=>({'[data-live]':[el],'[data-live-group]':[group],'[data-live-flex]':[flex],'[data-live-width]':[width]})[s]||[]});
 assert.equal(el.textContent,'');assert.equal(el.innerHTML,'unchanged');assert.equal(el.attrs['data-live-ready'],'false');
 assert.equal(group.attrs['aria-busy'],'true');assert.equal(group.attrs.inert,'');assert.equal(group.attrs['aria-hidden'],'true');
 assert.equal(flex.style.flex,'0');assert.equal(flex.disabled,true);assert.equal(flex.attrs['aria-label'],'Destroyed');assert.equal(width.style.width,'0%');
});
test('one request cohort at a time; unavailable sources never reveal dated numbers',async()=>{
 let calls=0;let release;const gate=new Promise(r=>release=r);
 const m=load({fetch:async()=>{calls++;await gate;throw Error('offline');}});
 const a=m.api.refresh(),b=m.api.refresh();assert.equal(a,b);assert.equal(calls,5);assert.equal(m.api.state.numbers,null);release();await a;
 assert.equal(m.api.state.status,'unavailable');assert.equal(m.api.state.reason,'unavailable');assert.equal(m.api.state.numbers,null);assert.equal(m.api.state.pool,null);
});
function runtime(getFixture=clone,fail=()=>false,extra={}) {
 let clock=now;
 const Clock=class extends Date { constructor(...args){super(...(args.length?args:[clock]));} static now(){return clock;} };
 const keys=new Map(Object.entries(mod.URLS).map(([k,v])=>[v,k==='rpc'?'chain':k]));
 const m=load({Date:Clock,fetch:async url=>{const key=keys.get(url);if(fail(key))throw Error('offline');return {ok:true,json:async()=>getFixture()[key]};},...extra});
 return {...m,advance(ms){clock+=ms;},now(){return clock;}};
}
test('valid accounting and independent pool publish together with source expiry',async()=>{
 const m=runtime();await m.api.refresh();
 assert.equal(m.api.state.status,'live');assert.equal(m.api.state.numbers.total,baseline.numbers.total);assert.equal(m.api.state.pool.status,'live');
 assert.equal(m.api.state.expiresAt,Math.min(Date.parse(fixture.supply.updatedAt)+180000,fixture.minted.at+600000,Date.parse(fixture.objects.generatedAt)+180000,now+180000));
 const el=node({'data-live':'total','data-live-format':'millions'}),group=node({'data-live-group':'accounting',inert:'','aria-hidden':'true'});
 m.api.applyTo({querySelectorAll:s=>s==='[data-live]'?[el]:s==='[data-live-group]'?[group]:[]});
 assert.equal(el.textContent,'818.15M');assert.equal(el.attrs['data-live-ready'],'true');assert.equal(group.attrs['aria-busy'],'false');assert.equal(group.attrs.inert,undefined);
});
test('a failed registry cannot suppress separately verified pool data',async()=>{
 const m=runtime(clone,key=>key==='objects');await m.api.refresh();
 assert.equal(m.api.state.numbers,null);assert.equal(m.api.state.pool.status,'live');assert.equal(m.api.state.pool.base,100288797.331245);
});
test('invalid pool never prevents valid supply accounting or becomes a fake estimate',async()=>{
 const m=runtime(()=>{const c=clone();c.chain.result.value[2].owner='wrong';return c;});await m.api.refresh();
 assert.equal(m.api.state.status,'live');assert.equal(m.api.state.numbers.total,baseline.numbers.total);assert.equal(m.api.state.pool,null);assert.equal(m.api.state.poolStatus,'unavailable');
});
test('contradictory records clear previous numbers and later coherent retry recovers',async()=>{
 let current=clone();const m=runtime(()=>current);await m.api.refresh();assert.ok(m.api.state.numbers);
 herd(current);await m.api.refresh();assert.equal(m.api.state.numbers,null);assert.equal(m.api.state.reason,'settling');assert.ok(m.api.state.pool);
 pending(current,250000);await m.api.refresh();assert.equal(m.api.state.status,'live');assert.equal(m.api.state.numbers['herd-minted'],557);assert.equal(m.api.state.numbers['pending-escrow'],250000);
});
test('expired accounting is removed immediately while fresh pool remains independent',async()=>{
 const m=runtime();await m.api.refresh();const expires=m.api.state.expiresAt;
 m.api.expire(expires);assert.equal(m.api.state.numbers,null);assert.equal(m.api.state.asOf,null);assert.equal(m.api.state.status,'unavailable');assert.ok(m.api.state.pool);
 m.api.expire(now+180000);assert.equal(m.api.state.pool,null);assert.equal(m.api.state.poolStatus,'unavailable');
 const v=m.values(m.api.state);assert.equal(v.total,undefined);assert.equal(v['pool-slot'],undefined);assert.equal(v['pool-lp-status'],'');
});
test('late source expiration while requests are pending never restores old values',async()=>{
 const m=runtime();await m.api.refresh();m.advance(181000);await m.api.refresh();
 assert.equal(m.api.state.numbers,null);assert.equal(m.api.state.reason,'settling');assert.equal(m.api.state.pool.status,'live');
});
test('browser lifecycle retries unavailable data and independently expires verified cohorts',async()=>{
 const timers=new Map();let id=0,fail=false;
 const document={readyState:'loading',hidden:false,querySelectorAll:()=>[],documentElement:{setAttribute(){}},addEventListener(){}};
 const m=runtime(clone,()=>fail,{document,location:{protocol:'https:',hostname:'bullenciaga.com'},addEventListener(){},setTimeout(fn,delay){timers.set(++id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}});
 m.api.start();await m.api.refresh();
 assert.ok([...timers.values()].some(t=>t.delay===90000),'healthy refresh cadence');
 const expiry=[...timers.values()].find(t=>t.delay===m.api.state.expiresAt-m.now());assert.ok(expiry,'freshness deadline timer');
 m.advance(expiry.delay);expiry.fn();assert.equal(m.api.state.numbers,null);assert.ok(m.api.state.pool);
 fail=true;await m.api.refresh();assert.equal(m.api.state.pool,null);
 assert.ok([...timers.values()].some(t=>t.delay===30000),'failure retry cadence');
});
test('all dynamic cohort values remain finite when available',()=>{
 const v=mod.values({...baseline,pool:mod.validatePool(fixture.chain,now,now),poolStatus:'live'});
 for(const [key,value]of Object.entries(v))if(typeof value==='number')assert.ok(Number.isFinite(value),key);
 assert.equal(v['pool-lp'],0);assert.equal(v['pool-lp-status'],'No outstanding LP tokens at this read.');
});
let passed=0;
for(const [name,fn] of tests){try{await fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name,e);process.exitCode=1;}}
console.log(`${passed}/${tests.length} flywheel data checks passed.`);
