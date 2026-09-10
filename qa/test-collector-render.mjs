import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Controlled DOM/media doubles exercise the actual editor code without a
// network, wallet, or dependency on browser autoplay/font/image heuristics.
const source = fs.readFileSync(new URL('../site/collector-tools.js',import.meta.url),'utf8');
const instrumented = source.replace('  window.BullenCollectors = {', `  window.test = { loadImage,paint,drawPreview,exportImage,renderLibrary,renderOrder,
 setState(state) { if (state.dialog) studioDialog=state.dialog; if(state.items){studioItems=state.items;register(state.items);} if(state.selected) selected=state.selected; },
 state:()=>({selected,studioRender,studioReady,exporting}) };
  window.BullenCollectors = {`);
const flush = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
const decode = s => s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
class Node {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.value='';this.width=1500;this.height=500;this.context={draws:[],scale(){},fillRect(){},fillText(){},clearRect(){this.draws=[];},drawImage(...args){this.draws.push(args)}};}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=v;if(k==='id')this.id=v;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
 getAttribute(k){return k.startsWith('data-')?this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:this.attributes[k];}
 append(...nodes){for(const n of nodes){n.remove();n.parent=this;this.children.push(n);}}
 insertBefore(n,b){n.remove();n.parent=this;const i=this.children.indexOf(b);this.children.splice(i<0?this.children.length:i,0,n);}
 remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
 after(n){this.parent.insertBefore(n,this.parent.children[this.parent.children.indexOf(this)+1]);}
 matches(sel){if(sel.startsWith('#'))return this.id===sel.slice(1);if(sel.startsWith('.'))return this.className?.split(' ').includes(sel.slice(1));if(sel.startsWith('[')){const m=sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\](:checked)?$/);return m&&this.getAttribute(m[1])!==undefined&&(m[2]===undefined||this.getAttribute(m[1])===m[2])&&(!m[3]||this.checked);}return this.tagName===sel;}
 querySelectorAll(sel){return this.children.flatMap(n=>[...(n.matches(sel)?[n]:[]),...n.querySelectorAll(sel)]);}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
 set innerHTML(html){this.children.forEach(n=>n.parent=null);this.children=[];const stack=[this];for(const tok of html.match(/<[^>]*>|[^<]+/g)||[]){if(tok.startsWith('</')){stack.pop();continue;}if(!tok.startsWith('<')){stack.at(-1).textContent=(stack.at(-1).textContent||'')+decode(tok);continue;}const tag=tok.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const n=new Node(tag);for(const [,key,value]of tok.replace(/^<[\w-]+/,'').matchAll(/([\w-]+)(?:="([^"]*)")?/g))n.setAttribute(key,decode(value||''));stack.at(-1).append(n);if(!['img','input','br'].includes(tag))stack.push(n);}}
 getContext(){return this.context;}
 toBlob(callback){callback({type:'image/png'});}
}
function harness({image=()=> 'ok',fonts=()=>Promise.resolve([])}={}){
 let now=0,id=0;const timers=new Map(),requests=[],fontRequests=[];
 const setTimeout=(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;};
 const clearTimeout=id=>timers.delete(id);
 const advance=async ms=>{const end=now+ms;await flush();while(true){const task=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!task)break;now=task[1].at;timers.delete(task[0]);task[1].fn();await flush();}now=end;await flush();};
 class Image{
  set src(url){this.url=url;if(!url)return;assert.equal(this.crossOrigin,'anonymous');requests.push(this);const result=image(url,requests.length);this.result=result;queueMicrotask(()=>{if(result==='error')this.onerror?.();else if(result!=='pending'){this.naturalWidth=1024;this.naturalHeight=1024;this.onload?.();}});}
  get src(){return this.url;}
  decode(){if(this.result==='decode-pending')return new Promise((resolve,reject)=>{this.finishDecode=resolve;this.failDecode=reject;});return this.result==='decode-error'?Promise.reject(Error('incomplete PNG')):Promise.resolve();}
 }
 const document={addEventListener(){},createElement:tag=>new Node(tag),body:new Node('body'),fonts:{ready:new Promise(()=>{}),load(...args){fontRequests.push(args);return fonts(...args);}}};
 const context=vm.createContext({URL,location:{origin:'https://bullenciaga.com'},window:{addEventListener(){}},document,Image,setTimeout,clearTimeout,localStorage:{getItem:()=>null}});
 vm.runInContext(instrumented,context);
 const api=context.window.test,clean=context.window.BullenCollectors.cleanEntry;
 const items=[1,2,3,4].map(i=>clean({name:`HERD #${i}`,image:`https://gateway.irys.xyz/art${i}`}));
 const dialog=new Node('dialog');dialog.open=true;
 dialog.innerHTML='<canvas id="collector-canvas"></canvas><p id="collector-render-status"></p><button id="collector-export"></button><button id="collector-retry"></button><span id="collector-dimensions"></span><input id="collector-format"><input id="collector-layout"><input name="collector-palette"><input id="collector-labels"><input id="collector-brand"><input id="collector-caption"><input id="collector-art-search"><div id="collector-library-grid"></div><button id="collector-library-more"></button><div id="collector-order"></div>';
 dialog.querySelector('#collector-format').value='banner';dialog.querySelector('#collector-layout').value='grid';dialog.querySelector('[name="collector-palette"]').value='charcoal';dialog.querySelector('[name="collector-palette"]').checked=true;dialog.querySelector('#collector-labels').checked=dialog.querySelector('#collector-brand').checked=true;
 api.setState({dialog,items,selected:items.slice(0,1)});
 return{api,items,dialog,requests,fontRequests,advance,document,context};
}
const config=entries=>({entries,format:'banner',layout:'grid',palette:'charcoal',labels:true,brand:true,caption:'My collection'});
{
 const h=harness({fonts:()=>new Promise(()=>{})});const canvas=new Node('canvas');let complete=false;
 h.api.paint(canvas,config(h.items.slice(0,1))).then(()=>complete=true);await h.advance(1199);assert(!complete);await h.advance(1);
 assert(complete,'unrelated or requested stalled fonts cannot hold artwork indefinitely');assert.equal(canvas.width,3000);assert.equal(canvas.height,1000);assert.equal(canvas.context.draws.length,1);
 assert.deepEqual(h.fontRequests.map(r=>r[0]),['400 24px "Space Mono"','500 24px Poppins']);
}
{
 const h=harness({fonts:()=>Promise.reject(Error('font offline'))});await h.api.paint(new Node('canvas'),config(h.items.slice(0,1)));assert.equal(h.requests.length,1,'font failure uses system fallback without refetching artwork');
}
{
 const h=harness({image:url=>url.includes('workers.dev')?'ok':'pending'});let result;
 h.api.loadImage(h.items[0].image).then(i=>result=i);await h.advance(1999);assert.equal(h.requests.length,1);await h.advance(1);
 assert(result);assert.equal(h.requests.length,2);assert.equal(h.requests[0].src,'','slow losing route cancelled');assert(result.src.includes('workers.dev'));assert(result.src.includes(encodeURIComponent(h.items[0].image)),'proxy requests original URL');
}
{
 const h=harness({image:url=>url.includes('workers.dev')?'ok':'decode-error'});await h.api.loadImage(h.items[0].image);assert.equal(h.requests.length,2,'a corrupt original triggers the other route');
}
{
 let available=false;const h=harness({image:()=>available?'ok':'pending'});let error;
 h.api.loadImage(h.items[0].image).catch(e=>error=e);await h.advance(16000);assert(error);assert(h.requests.every(i=>i.src===''),'deadline cancels all routes');
 available=true;await h.api.loadImage(h.items[0].image);assert.equal(h.requests.length,3,'retry evicts the failed promise');
}
{
 const h=harness();await Promise.all([h.api.loadImage(h.items[0].image),h.api.loadImage(h.items[0].image)]);assert.equal(h.requests.length,1,'pending and loaded originals are shared across renders');
}
{
 const h=harness();h.api.renderLibrary();h.api.renderOrder();const library=h.dialog.querySelectorAll('[data-add-art]'),first=h.dialog.querySelector('[data-order-key="HERD #1"]'),img=first.querySelector('img');
 library[1].onclick();library[2].onclick();await flush();
 assert.deepEqual(h.dialog.querySelectorAll('[data-add-art]'),library,'adding pieces preserves every catalogue DOM node');assert.equal(h.dialog.querySelector('[data-order-key="HERD #1"]'),first);assert.equal(first.querySelector('img'),img,'existing decoded arrangement image is retained');
 assert.equal(library[1].getAttribute('aria-pressed'),'true');first.querySelector('[data-direction="1"]').onclick();assert.equal(h.dialog.querySelectorAll('[data-order-key]')[1],first,'reorder moves the same node');
 first.querySelector('[data-remove-order]').onclick();assert.equal(library[0].getAttribute('aria-pressed'),'false');
}
{
 let third='pending';const h=harness({image:url=>url.includes('art3')?third:'ok'});await h.api.drawPreview();const canvas=h.dialog.querySelector('canvas'),previous=canvas.context.draws.at(-1);
 h.api.setState({selected:h.items.slice(0,2)});const older=h.api.drawPreview();h.api.setState({selected:h.items.slice(0,3)});const latest=h.api.drawPreview();await flush();
 assert.equal(canvas.context.draws.at(-1),previous,'keep previous complete composition during changed selection');assert.equal(h.dialog.querySelector('#collector-export').disabled,true,'older render cannot enable export');
 await h.advance(16000);await Promise.all([older,latest]);assert.match(h.dialog.querySelector('#collector-render-status').textContent,/HERD #3/);assert.equal(h.dialog.querySelector('#collector-retry').hidden,false);assert.equal(h.dialog.querySelector('#collector-export').disabled,true);
 third='ok';await h.api.drawPreview();assert.equal(h.dialog.querySelector('#collector-export').disabled,false);assert.equal(h.dialog.querySelector('#collector-retry').hidden,true);assert.notEqual(canvas.context.draws.at(-1),previous);
}
{
 const h=harness({image:()=> 'pending'});const render=h.api.drawPreview();h.dialog.open=false;await h.advance(16000);await render;assert.equal(h.api.state().studioReady,0,'closing cannot accept a late image');assert.equal(h.dialog.querySelector('#collector-export').disabled,true);
}
{
 const h=harness();await h.api.drawPreview();let toBlob;
 h.document.createElement=tag=>{const n=new Node(tag);if(tag==='canvas')n.toBlob=fn=>{toBlob=fn;};return n;};
 const exporting=h.api.exportImage();await flush();assert(toBlob);h.api.setState({selected:h.items.slice(0,2)});await h.api.drawPreview();toBlob({});await exporting;
 assert.equal(h.document.body.children.length,0,'changing the composition cancels a stale export');assert.equal(h.dialog.querySelector('#collector-export').disabled,false,'current complete render remains usable after stale export settles');
}
{
 const h=harness({fonts:()=>new Promise(()=>{})}),composition=config(h.items.slice(0,1));let prepared;
 h.api.paint(new Node('canvas'),composition).then(()=>prepared=true);await h.advance(1200);assert(prepared);assert.equal(composition.fonts.mono,'monospace');
 h.document.fonts.load=()=>Promise.resolve([{}]);await h.api.paint(new Node('canvas'),composition);assert.equal(composition.fonts.mono,'monospace','export preserves the exact fallback fonts from its ready preview');
 const next=config(h.items.slice(0,1));await h.api.paint(new Node('canvas'),next);assert.equal(next.fonts.mono,'"Space Mono", monospace','a new preview can use fonts that arrived later');
}
{
 const h=harness({image:url=>url.includes('workers.dev')?'ok':'error'});await h.api.loadImage(h.items[0].image);assert.equal(h.requests.length,2,'primary error starts fallback without waiting for hedge');await h.advance(2000);assert.equal(h.requests.length,2);
}
{
 const h=harness({image:url=>url.includes('workers.dev')?'ok':'decode-pending'});let winner;
 h.api.loadImage(h.items[0].image).then(i=>winner=i);await h.advance(2000);assert(winner);h.requests[0].failDecode(Error('late corrupt data'));await flush();assert.equal(await h.api.loadImage(h.items[0].image),winner,'late rejected loser cannot evict winner');assert.equal(h.requests.length,2);
}
{
 const h=harness({image:url=>url.includes('art1')?'error':'pending'});h.api.setState({selected:h.items.slice(0,2)});await h.api.drawPreview();const status=h.dialog.querySelector('#collector-render-status').textContent;assert.match(status,/HERD #1/);
 const sibling=h.requests.find(i=>i.src.includes('art2'));sibling.naturalWidth=sibling.naturalHeight=1024;await sibling.onload();await flush();assert.equal(h.dialog.querySelector('#collector-render-status').textContent,status,'late sibling cannot overwrite retry error with loading progress');
}
{
 const h=harness({image:()=> 'pending'});let done=false,error;
 h.api.loadImage(h.items[0].image).then(()=>done=true,e=>error=e);await flush();const late=h.requests[0].onload;await h.advance(16000);h.requests[0].naturalWidth=h.requests[0].naturalHeight=1024;await late();await flush();assert(error);assert(!done,'late load cannot reverse deadline failure');
}
{
 const h=harness();await h.api.drawPreview();let toBlob;h.document.createElement=tag=>{const n=new Node(tag);if(tag==='canvas')n.toBlob=fn=>{toBlob=fn;};return n;};
 const exporting=h.api.exportImage();await flush();h.dialog.open=false;h.api.setState({selected:h.items.slice(1,2)});h.dialog.open=true;await h.api.drawPreview();toBlob({});await exporting;assert.equal(h.document.body.children.length,0,'reopened studio never downloads the previous session’s image');
}
console.log('Collector render: bounded fonts/images, decoded fallback race, retry, shared original requests, stable selection DOM, stale renders/exports and complete-only download passed.');
