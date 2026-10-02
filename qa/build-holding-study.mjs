import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {calculate,inCohort,summarize} from '../site/holding-math.js';

const source = process.argv[2];
if (!source) throw new Error('Pass the directory containing verified wallet-results.json, recent-results.json and collection.json');
const load = name=>JSON.parse(fs.readFileSync(path.join(source,name)));
const full=load('wallet-results.json'),recent=load('recent-results.json'),cutoff=load('collection.json');
const price=full.summary.price;
const close=(a,b,label)=>assert(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),label);
const periods={};
for (const [key,input] of Object.entries({full,recent})) {
  const rows=input.rows.map(row=>{
    const w={wallet:row.wallet,openingTokens:row.openingTokens,openingValue:row.openingValue,
      start:key==='recent'?recent.summary.start:row.first,
      events:row.path.map(e=>[e.time,Number(e.buy),e.quantity,e.sol,e.mark,e.signature])};
    const result=calculate(w,price,cutoff.blockTime);
    for (const [a,b] of [['actual','actual'],['held','held'],['capital','capital'],['tokens','tokens'],['actualReturn','actualReturnPct'],['holdReturn','holdReturnPct'],['edge','holdEdgePerCapital']]) close(result[a],row[b],`${key}/${row.wallet}/${a}`);
    return {...w,...Object.fromEntries(['actualReturn','holdReturn','edge','capital','buys','sells','cycles','spanDays','matchedSales','rebuyPremium'].map(k=>[k,result[k]]))};
  });
  const all=rows.map(w=>calculate(w,price,cutoff.blockTime));
  periods[key]={start:key==='recent'?recent.summary.start:Math.min(...rows.map(w=>w.start)),end:cutoff.blockTime,
    rows,excluded:(input.excludedRows||input.excluded).map(w=>({wallet:w.wallet,reasons:w.reasons})),
    groups:Object.fromEntries(['repeat','frequent','active','sellers'].map(g=>[g,summarize(all.filter(w=>inCohort(w,g)))]))};
}
assert.equal(periods.full.groups.repeat.n,94);assert.equal(periods.full.groups.repeat.holdWins,74);
assert.equal(periods.recent.groups.repeat.n,20);assert.equal(periods.recent.groups.repeat.tradeWins,15);
const data={schema:1,mint:'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN',pool:'9MP131fa3jir94azmVHZdwQww2Ma9aLtzQUG6CJdV6TZ',
  asOf:cutoff.blockTime,slot:cutoff.slot,price,priceTime:full.summary.priceTime,priceSignature:full.summary.priceSignature,
  openingPrice:recent.summary.openingPrice,openingPriceSignature:recent.summary.openingPriceSignature,
  inspected:{mintTransactions:19839,poolTransactions:16698,parsedWallets:1808,excludedLifetime:449},
  sourceHashes:Object.fromEntries(['wallet-results.json','recent-results.json','collection.json'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(source,n))).digest('hex')])),
  periods};
const target=new URL('../site/holding-study.json',import.meta.url);
fs.writeFileSync(target,JSON.stringify(data));
console.log(JSON.stringify({bytes:fs.statSync(target).size,full:periods.full.groups.repeat,recent:periods.recent.groups.repeat},null,2));
