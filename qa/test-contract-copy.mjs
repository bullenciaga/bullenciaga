import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('  function initContractCopy(address){'), html.indexOf('  function init(){'));
const mint = 'BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN';
assert(source.startsWith('  function initContractCopy(address){'));
assert.match(html, /<button class="contract-copy"[^>]+type="button"[^>]+aria-label="Copy contract address"/);
assert.match(html, /id="contractCopyStatus" role="status" aria-live="polite"/);

function setup(clipboard, fallback = true) {
  const writes = [], nodes = [], timers = new Map();
  let id = 0, focusCount = 0;
  const button = () => ({ disabled:true, innerHTML:'original-icon', handlers:{},
    classList:{ add(){}, remove(){} },
    addEventListener(type, handler){ this.handlers[type] = handler; },
  });
  const address = button(), icon = button(), status = { textContent:'' };
  const elements = { contractCopy:address, copyBtn:icon, contractCopyStatus:status };
  const document = {
    getElementById: id => elements[id],
    activeElement: { focus(options){ assert.equal(options.preventScroll, true); focusCount++; } },
    createElement(tag){
      assert.equal(tag, 'textarea');
      return { style:{}, select(){}, setSelectionRange(start, end){ assert.equal(start, 0); assert.equal(end, mint.length); },
        remove(){ nodes.splice(nodes.indexOf(this), 1); } };
    },
    body:{ appendChild: node => nodes.push(node) },
    execCommand(command){
      assert.equal(command, 'copy');
      assert.equal(nodes[0].value, mint);
      assert.equal(nodes[0].readOnly, true);
      writes.push(nodes[0].value);
      if (fallback instanceof Error) throw fallback;
      return fallback;
    },
  };
  vm.runInNewContext(source + '\ninitContractCopy(address);', {
    document, address:mint,
    navigator: clipboard ? { clipboard:{ writeText: text => { writes.push(text); return clipboard(text); } } } : {},
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: id => timers.delete(id),
  });
  return { address, icon, status, writes, nodes, timers, focusCount:() => focusCount };
}

for (const trigger of ['address', 'icon']) {
  const t = setup(() => Promise.resolve());
  assert.equal(t[trigger].disabled, false);
  await t[trigger].handlers.click();
  assert.deepEqual(t.writes, [mint]);
  assert.equal(t.status.textContent, 'Contract copied ✓');
  await t[trigger].handlers.click();
  assert.equal(t.timers.size, 1, 'rapid subsequent copies reset one feedback timer');
  [...t.timers.values()][0]();
  assert.equal(t.status.textContent, '');
  assert.equal(t.icon.innerHTML, 'original-icon');
}
for (const clipboard of [null, () => Promise.reject(new Error('denied'))]) {
  const t = setup(clipboard);
  await t.address.handlers.click();
  assert.equal(t.status.textContent, 'Contract copied ✓');
  assert.equal(t.nodes.length, 0, 'fallback must remove its temporary field');
  assert.equal(t.focusCount(), 1, 'fallback restores focus without scrolling');
}
for (const fallback of [false, new Error('copy unavailable')]) {
  const t = setup(null, fallback);
  await t.address.handlers.click();
  assert.equal(t.status.textContent, 'Copy failed — retry');
  assert.equal(t.icon.innerHTML, 'original-icon');
  assert.equal(t.nodes.length, 0);
}
let resolve;
const pending = setup(() => new Promise(done => { resolve = done; }));
const first = pending.address.handlers.click();
await pending.address.handlers.click();
assert.equal(pending.writes.length, 1, 'no overlapping clipboard writes');
assert.equal(pending.status.textContent, '', 'no success before Clipboard API resolves');
resolve();
await first;
assert.equal(pending.status.textContent, 'Contract copied ✓');
console.log('Contract copy: exact mint, both controls, retry, fallback, cleanup and truthful feedback: ok');
