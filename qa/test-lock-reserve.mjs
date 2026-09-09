import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../site/lock.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const mint = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
const firstCliff = Date.parse('2026-09-16T17:00:00Z');
const lastCliff = Date.parse('2026-10-02T17:00:00Z');
const settle = () => new Promise(resolve => setImmediate(resolve));

function mount(at) {
  const state = {now:at, supply:null, price:null, supplyFailure:false, priceFailure:false, hidden:false};
  const elements = Object.fromEntries(['locked-total','locked-status','elapsed-cliffs'].map(id => [id,{textContent:'—'}]));
  const cliffs = [...html.matchAll(/data-cliff="([^"]+)"/g)].map(match => ({dataset:{cliff:match[1]},textContent:''}));
  const values = [...html.matchAll(/data-locked-bullen="([^"]+)"/g)].map(match => ({dataset:{lockedBullen:match[1]},textContent:''}));
  const intervals = new Map(), listeners = new Map();
  const document = {
    get hidden(){return state.hidden;},
    querySelectorAll:selector => selector === '[data-cliff]' ? cliffs : values,
    getElementById:id => elements[id],
    addEventListener:(event,fn) => listeners.set(event,fn),
  };
  const context = vm.createContext({
    document, Intl, AbortSignal,
    Date:class extends Date{static now(){return state.now;}},
    setInterval:(fn,delay) => intervals.set(fn,delay),
    fetch:async url => {
      if(url === '/supply') {
        if(state.supplyFailure) throw new Error('network unavailable');
        return {ok:true,json:async () => state.supply ?? {mint,nonCirculating:237500000,updatedAt:new Date(state.now).toISOString()}};
      }
      assert.equal(url,'/volume');
      if(state.priceFailure) throw new Error('price unavailable');
      return {ok:true,json:async () => state.price ?? {ok:true,price:0.0002,fetchedAt:state.now}};
    },
  });
  vm.runInContext(script,context);
  return {state,elements,cliffs,values,
    tick(){for(const [fn,delay] of intervals) if(delay === 1000) fn();},
    refresh(){listeners.get('visibilitychange')();},
  };
}

assert.match(html,/AuskhWTZCbXJLvW8A8jhVczZ9nKi1t3emty8M1rCvXHB/);
assert.match(html,/DaYMxWbKCrxFCEn2xmx8bW8wXBKZSvZ86iwcoWioZ86B/);
assert.doesNotMatch(html,/tokens currently claimable/,'A schedule does not establish an unwithdrawn balance');
assert.match(html,/<b id="locked-total">—<\/b>/,'No-JavaScript view must not assert a perpetually locked total');

const page = mount(firstCliff-30000);
await settle();
assert.equal(page.elements['locked-total'].textContent,'237.5M');
assert.equal(page.elements['elapsed-cliffs'].textContent,'0');
assert.match(page.cliffs[0].textContent,/under 1m/);
assert.equal(page.values[0].textContent,'(≈ $5,000.00 USD)');
assert.equal(page.values[1].textContent,'(≈ $42,500.00 USD)');

// A still-fresh pre-cliff snapshot must disappear exactly at expiry, before
// the next network refresh, without claiming withdrawn tokens remain available.
page.state.now = firstCliff;
page.tick();
assert.equal(page.elements['locked-total'].textContent,'—');
assert.equal(page.elements['elapsed-cliffs'].textContent,'1');
assert.match(page.cliffs[0].textContent,/Cliff reached/);
page.state.supply = {mint,nonCirculating:212500000,updatedAt:new Date(firstCliff).toISOString()};
page.refresh(); await settle();
assert.equal(page.elements['locked-total'].textContent,'212.5M');

page.state.now = lastCliff;
page.state.supply = {mint,nonCirculating:0,updatedAt:new Date(lastCliff).toISOString()};
page.refresh(); await settle();
assert.equal(page.elements['locked-total'].textContent,'0','A confirmed zero differs from an unavailable balance');
assert.equal(page.elements['elapsed-cliffs'].textContent,'2');

page.state.supplyFailure = true;
page.refresh(); await settle();
assert.equal(page.elements['locked-total'].textContent,'—');
assert.match(page.elements['locked-status'].textContent,/unavailable/);
page.state.supplyFailure = false;
for(const invalid of [
  {mint,nonCirculating:null,updatedAt:new Date(lastCliff).toISOString()},
  {mint,nonCirculating:-1,updatedAt:new Date(lastCliff).toISOString()},
  {mint:'different-token',nonCirculating:1,updatedAt:new Date(lastCliff).toISOString()},
  {mint,nonCirculating:1,updatedAt:new Date(lastCliff-120001).toISOString()},
  {mint,nonCirculating:1,updatedAt:new Date(lastCliff+60001).toISOString()},
]) {
  page.state.supply = invalid;
  page.refresh(); await settle();
  assert.equal(page.elements['locked-total'].textContent,'—');
}
page.state.supply = {mint,nonCirculating:0,updatedAt:new Date(lastCliff).toISOString()};
page.refresh(); await settle();
page.state.now += 120001;
page.tick();
assert.equal(page.elements['locked-total'].textContent,'—','An idle page expires stale balances even without a response');
page.state.priceFailure = true;
page.refresh(); await settle();
assert.equal(page.values[0].textContent,'(USD unavailable)');
assert.equal(page.values[1].textContent,'(USD unavailable)');
console.log('Lock reserve: verified replacement, cliff transitions, live totals, stale/error states and USD estimates passed');
