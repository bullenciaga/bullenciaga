import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
// Controlled DOM/media doubles exercise the actual editor code without a
// network, wallet, or dependency on browser autoplay/font/image heuristics.
const source = fs.readFileSync(new URL('../site/collector-tools.js',import.meta.url),'utf8');
const instrumented = source.replace('  window.BullenCollectors = {', `  window.test = { imageType,originalBytes,cardLabel,attachCard,loadImage,paint,drawPreview,exportImage,renderLibrary,renderOrder,
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
 addEventListener(type,callback){this['on'+type]=callback;}
 getContext(){return this.context;}
 toBlob(callback){callback({type:'image/png'});}
}
function crc32(bytes){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
function png(id=0){const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('tEXt',Buffer.from('route'+id)),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,255,255,255]))),chunk('IEND',Buffer.alloc(0))]);}
function harness({image=()=> 'ok',fonts=()=>Promise.resolve([])}={}){
 let now=0,id=0;const timers=new Map(),requests=[],fontRequests=[],blobRoutes=new Map(),objectUrls=new Map();
 const setTimeout=(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;};
 const clearTimeout=id=>timers.delete(id);
 const advance=async ms=>{const end=now+ms;await flush();while(true){const task=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!task)break;now=task[1].at;timers.delete(task[0]);task[1].fn();await flush();}now=end;await flush();};
 class Blob{constructor(parts,options){this.parts=parts;this.type=options.type;}}
 class LocalURL extends URL {static createObjectURL(blob){const u='blob:test/'+(++id);objectUrls.set(u,blobRoutes.get(Buffer.from(blob.parts[0]).toString('base64')));return u;}static revokeObjectURL(u){objectUrls.delete(u);}}
 class Image{
  set src(url){this.url=url;if(!url)return;const request=objectUrls.get(url);request.image=this;this.source=request.url;this.result=request.result;queueMicrotask(()=>{this.naturalWidth=this.naturalHeight=1024;this.onload?.();});}
  get src(){return this.url;}
  decode(){if(this.result==='decode-pending')return new Promise((resolve,reject)=>{this.finishDecode=resolve;this.failDecode=reject;});return this.result==='decode-error'?Promise.reject(Error('incomplete PNG')):Promise.resolve();}
 }
 const fetch=(url,options)=>new Promise((resolve,reject)=>{
  assert.equal(options.mode,'cors');assert.equal(options.credentials,'omit');const result=image(url,requests.length+1);
  const request={url,signal:options.signal,cache:options.cache,result,get src(){return this.signal.aborted?'':url;}};requests.push(request);
  let data=png(requests.length);if(result==='truncated')data=data.subarray(0,-8);if(result==='damaged'){data=Buffer.from(data);data[60]^=1;}
  blobRoutes.set(data.toString('base64'),request);
  request.deliver=()=>{let sent=false;resolve({ok:true,body:{getReader:()=>({read:async()=>result==='body-pending'?new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('body aborted')),{once:true})):sent?{done:true}:(sent=true,{done:false,value:data}),cancel:async()=>{}})}});};
  options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});
  if(result==='error')reject(Error('network failure'));else if(result!=='pending')request.deliver();
 });
 const document={addEventListener(){},createElement:tag=>new Node(tag),body:new Node('body'),fonts:{ready:new Promise(()=>{}),load(...args){fontRequests.push(args);return fonts(...args);}}};
 const context=vm.createContext({URL:LocalURL,Blob,AbortController,Uint8Array,DataView,location:{origin:'https://bullenciaga.com'},window:{addEventListener(){}},document,Image,fetch,setTimeout,clearTimeout,localStorage:{getItem:()=>null}});
 vm.runInContext(instrumented,context);
 const api=context.window.test,clean=context.window.BullenCollectors.cleanEntry;
 const items=[1,2,3,4].map(i=>clean({name:`HERD #${i}`,image:`https://gateway.irys.xyz/art${i}`}));
 const dialog=new Node('dialog');dialog.open=true;
 dialog.innerHTML='<canvas id="collector-canvas"></canvas><p id="collector-render-status"></p><button id="collector-export"></button><button id="collector-retry"></button><span id="collector-dimensions"></span><input id="collector-format"><input id="collector-layout"><input name="collector-palette"><input id="collector-labels"><input id="collector-brand"><input id="collector-caption"><input id="collector-art-search"><div id="collector-library-grid"></div><button id="collector-library-more"></button><div id="collector-order"></div>';
 dialog.querySelector('#collector-format').value='banner';dialog.querySelector('#collector-layout').value='grid';dialog.querySelector('[name="collector-palette"]').value='charcoal';dialog.querySelector('[name="collector-palette"]').checked=true;dialog.querySelector('#collector-labels').checked=dialog.querySelector('#collector-brand').checked=true;
 api.setState({dialog,items,selected:items.slice(0,1)});
 return{api,items,dialog,requests,fontRequests,advance,document,context,objectUrls};
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
 assert(result);assert.equal(h.requests.length,2);assert.equal(h.requests[0].src,'','slow losing route cancelled');assert(result.source.includes('workers.dev'));assert(result.source.includes(encodeURIComponent(h.items[0].image)),'proxy requests original URL');
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
 h.api.loadImage(h.items[0].image).then(i=>winner=i);await h.advance(2000);assert(winner);h.requests[0].image.failDecode(Error('late corrupt data'));await flush();assert.equal(await h.api.loadImage(h.items[0].image),winner,'late rejected loser cannot evict winner');assert.equal(h.requests.length,2);
}
{
 const h=harness({image:url=>url.includes('art1')?'error':'pending'});h.api.setState({selected:h.items.slice(0,2)});await h.api.drawPreview();const status=h.dialog.querySelector('#collector-render-status').textContent;assert.match(status,/HERD #1/);
 const sibling=h.requests.find(i=>i.src.includes('art2'));sibling.deliver();await flush();assert.equal(h.dialog.querySelector('#collector-render-status').textContent,status,'late sibling cannot overwrite retry error with loading progress');
}
{
 const h=harness({image:()=> 'pending'});let done=false,error;
 h.api.loadImage(h.items[0].image).then(()=>done=true,e=>error=e);await flush();const late=h.requests[0].deliver;await h.advance(16000);late();await flush();assert(error);assert(!done,'late load cannot reverse deadline failure');
}
{
 const h=harness();await h.api.drawPreview();let toBlob;h.document.createElement=tag=>{const n=new Node(tag);if(tag==='canvas')n.toBlob=fn=>{toBlob=fn;};return n;};
 const exporting=h.api.exportImage();await flush();h.dialog.open=false;h.api.setState({selected:h.items.slice(1,2)});h.dialog.open=true;await h.api.drawPreview();toBlob({});await exporting;assert.equal(h.document.body.children.length,0,'reopened studio never downloads the previous session’s image');
}
{
 const h=harness();
 for(const [series,name,visible] of [['herd','HERD #168','HERD #168'],['house-object','The Cufflinks #001','THE CUFFLINKS'],['house-object','The Signet #099','THE SIGNET'],['house-object','The Key #008','THE KEY'],['bullensaga','The Promise #001','THE PROMISE'],['bullensaga','Triad #007','THE TRIAD'],['custom','CUSTOM #001','CUSTOM #001']]) {
  const entry={series,name,id:'verified-id',image:'https://gateway.irys.xyz/original'},card=new Node('article');card.innerHTML='<img><div class="gallery-card-name"></div>';
  card.querySelector('img').setAttribute('alt',name);h.api.attachCard(card,entry);const label=card.querySelector('.collector-card-label'),button=card.querySelector('[data-save-piece]');
  assert.equal(label.textContent,visible);assert.equal(label.title,name);assert.equal(card.querySelector('img').getAttribute('alt'),name);assert.match(button.getAttribute('aria-label'),new RegExp(name));assert.equal(entry.name,name,'underlying detail/search identity never modified');
 }
}
{
 const h=harness(),full=png();assert.equal(h.api.imageType(full),'image/png');
 for(const n of [0,8,24,full.length-12,full.length-1])assert.throws(()=>h.api.imageType(full.subarray(0,n)),`truncated PNG at ${n} bytes rejected before browser decode`);
 const corrupt=Buffer.from(full);corrupt[corrupt.length-16]^=1;assert.throws(()=>h.api.imageType(corrupt),'PNG CRC corruption rejected');
 assert.throws(()=>h.api.imageType(Buffer.concat([full,Buffer.from([1])])),'bytes after IEND rejected');
}
{
 const h=harness({image:url=>url.includes('workers.dev')?'ok':'truncated'});const complete=await h.api.loadImage(h.items[0].image);assert(complete.source.includes('workers.dev'));assert(!h.requests[0].image,'partial PNG is never sent to the browser decoder');assert.equal(h.objectUrls.size,0,'temporary image blob URLs released');
}
{
 let available=false;const h=harness({image:()=>available?'ok':'truncated'});await assert.rejects(h.api.loadImage(h.items[0].image));assert(h.requests.every(r=>!r.image));available=true;await h.api.loadImage(h.items[0].image);assert.equal(h.requests.length,3,'damaged responses never poison the original cache');assert.equal(h.requests[2].cache,'reload','retry bypasses damaged browser HTTP cache');
}
{
 const h=harness(),html=fs.readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
 const examples=[['image/jpeg',Buffer.from(html.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/)[1],'base64')],['image/webp',fs.readFileSync(new URL('../site/assets/collection-previews/house-object-01-signet.webp',import.meta.url))],['image/gif',fs.readFileSync(new URL('../site/assets/giveaways/herd-buy-hold/herd-buy-hold.gif',import.meta.url))]];
 for(const[type,bytes]of examples){assert.equal(h.api.imageType(bytes),type,`real repository ${type} accepted`);assert.throws(()=>h.api.imageType(bytes.subarray(0,Math.floor(bytes.length/2))),`truncated ${type} rejected`);assert.throws(()=>h.api.imageType(bytes.subarray(0,-1)),`missing terminal byte ${type} rejected`);}
}
{
 const h=harness({image:()=> 'body-pending'});let error;h.api.loadImage(h.items[0].image).catch(e=>error=e);await h.advance(16000);assert(error,'deadline includes a stalled response body, not only headers');assert(h.requests.every(r=>r.signal.aborted));
 let cancelled=false;await assert.rejects(h.api.originalBytes({ok:true,body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(33*1024*1024)}),cancel:async()=>{cancelled=true;}})}}),/too large/);assert(cancelled,'oversized original cancels stream before decoding');
}
console.log('Collector render: bounded fonts/images, decoded fallback race, retry, shared original requests, stable selection DOM, stale renders/exports and complete-only download passed.');
