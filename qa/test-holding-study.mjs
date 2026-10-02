import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate,inCohort,summarize} from '../site/holding-math.js';

const trade=(t,buy,q,sol,mark=sol/q)=>[t,Number(buy),q,sol,mark,'test'];
const wallet=events=>({openingTokens:0,openingValue:0,start:0,events});
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);
let r=calculate(wallet([trade(1,true,100,1)]),.015,10);
near(r.realized,0);near(r.unrealized,.5);near(r.actualReturn,50);near(r.holdReturn,50);

// Real losses stay negative even when selling avoided an even larger loss.
r=calculate(wallet([trade(1,true,100,1),trade(2,false,100,.8)]),.005,10);
near(r.realized,-.2);near(r.unrealized,0);near(r.actualReturn,-20);near(r.holdReturn,-50);near(r.edge,-30);

// Sale proceeds are reused, never counted again as new funding.
r=calculate(wallet([trade(1,true,100,1),trade(2,false,100,1.2),trade(3,true,100,1)]),.01,10);
near(r.capital,1);near(r.cash,.2);near(r.realized,.2);near(r.unrealized,0);near(r.actualReturn,20);near(r.holdReturn,0);near(r.buybackSaving,.2);

// More expensive re-entry hurts the result without hiding any realized gain.
r=calculate(wallet([trade(1,true,100,1),trade(2,false,100,1.2),trade(3,true,80,1.2)]),.01,10);
near(r.realized,.2);near(r.unrealized,-.4);near(r.actualReturn,-20);near(r.holdReturn,0);near(r.buybackSaving,-.24);

// Partial exits allocate basis to sold units only, oldest acquisition first.
r=calculate(wallet([trade(1,true,100,1),trade(2,true,100,2),trade(3,false,150,3)]),.015,10);
near(r.realized,1);near(r.basis,1);near(r.unrealized,-.25);near(r.pnl,.75);near(r.actualReturn,25);

// New money after proceeds run out funds both alternatives at the same time.
r=calculate(wallet([trade(1,true,100,1),trade(2,false,100,.8),trade(3,true,150,1.2)]),.01,10);
near(r.capital,1.4);near(r.holdTokens,150);near(r.actual,r.held);

// Equal opening inventory makes a period comparison without a made-up lifetime basis.
r=calculate({openingTokens:100,openingValue:1,start:0,events:[trade(1,false,50,.6)]},.008,10);
near(r.realized,.1);near(r.unrealized,-.1);near(r.actualReturn,0);near(r.holdReturn,-20);
assert.throws(()=>calculate(wallet([trade(1,false,100,1)]),.01,10),/inventory/);
assert.throws(()=>calculate(wallet([trade(1,true,100,0)]),.01,10),/Invalid trade/);

const data=JSON.parse(fs.readFileSync(new URL('../site/holding-study.json',import.meta.url)));
assert.equal(data.schema,1);assert.equal(data.slot,452473140);assert.equal(data.asOf,1790907468);
let checked=0;
for(const [period,p]of Object.entries(data.periods)){
  const rows=p.rows.map(w=>{
    assert(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w.wallet));
    const out=calculate(w,data.price,data.asOf);
    near(out.actualReturn,w.actualReturn);near(out.holdReturn,w.holdReturn);near(out.edge,w.edge);
    near(out.pnl,out.realized+out.unrealized);near(out.pnl,out.actual-out.capital);
    assert(out.points.every(p=>[p.actual,p.hold,p.time].every(Number.isFinite)));
    checked++;return out;
  });
  for(const name of ['repeat','frequent','active','sellers'])assert.deepEqual(summarize(rows.filter(w=>inCohort(w,name))),p.groups[name]);
  const headline=p.groups.repeat;
  assert.equal(headline.n,period==='full'?94:20);assert.equal(headline.holdWins,period==='full'?74:5);
}

const site=new URL('../site/',import.meta.url),html=fs.readFileSync(new URL('what-if-i-held.html',site),'utf8');
assert.match(html,/<title>What if I held\? — BULLENCIAGA<\/title>/);
assert.match(html,/Tokens you haven’t sold count too/);
assert.match(html,/not a live wallet scan|dated research snapshot/);
assert.match(html,/realized/i);assert.match(html,/Unrealized profit/);
assert.doesNotMatch(html,/<button(?![^>]*\btype=)[^>]*>/i);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
for(const name of ['index.html','bullen-ui.js'])assert(!fs.readFileSync(new URL(name,site),'utf8').includes('/what-if-i-held'),'Page must remain unlinked from home and navigation');
const js=fs.readFileSync(new URL('what-if-i-held.js',site),'utf8');
assert.doesNotMatch(js,/signTransaction|connectWallet|localStorage|sessionStorage|sendTransaction/);
console.log(`Holding tool: 9 accounting/validation scenarios and ${checked} wallet P&L reconciliations pass; dated public page stays unlinked.`);
