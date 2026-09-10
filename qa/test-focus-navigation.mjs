import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const site = new URL('../site/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, site), 'utf8');
const listeners = new Map(), frames = new Map();
let frameId = 0;
const target = (kind, options = {}) => ({
  type: options.type || (kind === 'input' ? 'text' : ''), isContentEditable: kind === 'editable',
  classList: { remove() {} },
  closest(selector) {
    if (selector === 'input') return kind === 'input' ? this : null;
    if (selector.startsWith('textarea,')) return kind === 'textarea' ? this : null;
    if (selector === '[data-keyboard-navigation]') return options.keys ? {getAttribute:() => options.keys} : null;
    return options.composite || kind === 'select' ? this : null;
  },
});
const button = target('button'), input = target('input'), textarea = target('textarea'), editable = target('editable');
const select = target('select'), radio = target('input', {type:'radio',composite:true}), composite = target('button', {composite:true});
const document = {
  documentElement: {dataset:{}}, activeElement:button,
  addEventListener(name, callback) { listeners.set(name, callback); },
  removeEventListener(name) { listeners.delete(name); },
};
const context = vm.createContext({
  document,
  requestAnimationFrame(callback) { frames.set(++frameId,callback); return frameId; },
  cancelAnimationFrame(id) { frames.delete(id); },
});
vm.runInContext(read('bullen-focus.js').replace(/installFocusNavigation\(document\);\s*$/, 'globalThis.disposeFocus = installFocusNavigation(document);'), context);
const mode = () => document.documentElement.dataset.focusNavigation;
const dispatch = (name, el = document.activeElement, props = {}) => listeners.get(name)?.({target:el,key:'',...props});
const key = (name, el = document.activeElement, props = {}) => dispatch('keydown',el,{key:name,...props});
const focus = el => { document.activeElement = el; dispatch('focusin',el); };
const flush = () => { const pending = [...frames]; frames.clear(); pending.forEach(([,callback]) => callback()); };
assert.equal(mode(),'pointer');
focus(input); assert.equal(mode(),'pointer','fresh autofocus is neutral');
for (const el of [input,textarea,editable,target('input',{type:'password'})]) {
  dispatch('pointerdown',el); focus(el); key('x',el); dispatch('input',el);
  assert.equal(mode(),'pointer','pointer typing never enables highlights');
  key('Tab',el,{shiftKey:true}); focus(el); flush(); assert.equal(mode(),'keyboard');
  key('x',el); assert.equal(mode(),'pointer','typing clears a previous Tab highlight');
  key('Tab',el); focus(el); flush(); key('ArrowLeft',el); assert.equal(mode(),'pointer','caret navigation is not composite navigation');
  key('Tab',el); focus(el); flush(); key('ArrowLeft',el,{ctrlKey:true}); assert.equal(mode(),'pointer','word/caret shortcuts remain editing');
  key('Tab',el); focus(el); flush(); dispatch('beforeinput',el); assert.equal(mode(),'pointer','virtual-keyboard beforeinput clears');
  key('Tab',el); focus(el); flush(); dispatch('compositionstart',el); assert.equal(mode(),'pointer','IME composition clears');
  assert.equal(document.activeElement,el,'focus and caret target are retained');
}
for (const el of [button,select,radio,composite]) {
  dispatch('pointerdown',el); focus(el); key('Enter',el); key(' ',el);
  assert.equal(mode(),'pointer','activation alone is not focus navigation');
}
for (const el of [select,radio,composite]) {
  key('ArrowRight',el); focus(el); flush(); assert.equal(mode(),'keyboard');
  dispatch('input',el); assert.equal(mode(),'keyboard','selection events retain deliberate composite keyboard navigation');
}
dispatch('pointerdown',button); key('ArrowRight',button); assert.equal(mode(),'pointer','ordinary button arrows do not enable');
const limited = target('button',{keys:'ArrowUp ArrowDown'});
key('ArrowLeft',limited); assert.equal(mode(),'pointer','unsupported arrow in an explicit region is neutral');
key('ArrowDown',limited); focus(limited); flush(); assert.equal(mode(),'keyboard','declared region key enables navigation');
dispatch('pointerdown',button);
key('Tab',button,{ctrlKey:true}); assert.equal(mode(),'pointer','browser shortcut is ignored');
key('Tab',button); focus(button); flush(); key('Process',button,{isComposing:true,keyCode:229}); assert.equal(mode(),'pointer');
key('Tab',button); focus(button); flush(); focus(input); assert.equal(mode(),'pointer','later programmatic focus cannot inherit stale keyboard mode');
key('Tab',button); const [earlierId,earlierFrame] = [...frames][0];
dispatch('pointerdown',button); key('Tab',button); frames.delete(earlierId); earlierFrame(); focus(button);
assert.equal(mode(),'keyboard','an old frame cannot expire a newer navigation ticket');
dispatch('touchstart',button); assert.equal(mode(),'pointer');
context.disposeFocus(); assert.equal(listeners.size,0); assert.equal(frames.size,0);

let documents = 0;
for (const name of fs.readdirSync(site).filter(name => name.endsWith('.html'))) {
  const html = read(name);
  assert.equal((html.match(/href="\/bullen-focus\.css"/g)||[]).length,1,`${name}: shared focus CSS`);
  assert.equal((html.match(/src="\/bullen-focus\.js"/g)||[]).length,1,`${name}: shared policy`);
  documents++;
}
assert.equal(documents,21);
assert(!read('shares.html').includes('src="/bullen-ui.js"'),'private Shares does not acquire public navigation');
assert.match(read('bullen-focus.css'),/html:not\(\[data-focus-navigation="keyboard"\]\) :focus/,'neutral before JS executes');
assert.match(read('collector-tools.css'),/html\[data-focus-navigation="keyboard"\] \.collector-palette input:focus-visible\+span/);
assert.match(read('collector-tools.css'),/\.collector-close svg\{display:block;width:20px;height:20px/);
assert.match(read('collector-tools.js'),/aria-label="Close \$\{title\}"><svg viewBox="0 0 24 24"/);
console.log('Focus navigation: Tab/composite keys, typing/caret/IME, delayed autofocus, touch, frame cleanup,21-page coverage and centered collector SVG: ok');
