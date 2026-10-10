import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {labels,destinations,featured,groups,descriptions,socials,resources,pageSections} from './header-data.mjs';
const site=new URL('../site/',import.meta.url);
const headerCss=fs.readFileSync(new URL('bullen-header.css',site),'utf8');
const headers=fs.readFileSync(new URL('_headers',site),'utf8');
assert.equal((headers.match(/font-src 'self' data:;/g)||[]).length,7,'Every protected CSP route allows only local/embedded fonts');
assert.equal(crypto.createHash('sha256').update(headers.replace(/font-src[^;]+; ?/g,'')).digest('hex'),'a361fc63a4db8f4bc1501f2c3002298b4e585672e2c02c0c575b59e0446687b7','All non-font security/cache/privacy directives remain exact');
const embeddedFonts=[...headerCss.matchAll(/data:font\/woff2;base64,([^']+)/g)].map(m=>Buffer.from(m[1],'base64'));
assert.equal(embeddedFonts.length,2);
assert.equal((headerCss.match(/font-display:block/g)||[]).length,2,'Embedded navigation faces render deterministically without an optional-font fallback');
for(const [i,name] of ['house-872e862918591a9e.woff2','house-e0c8e616bda27642.woff2'].entries()) assert.deepEqual(embeddedFonts[i],fs.readFileSync(new URL('fonts/'+name,site)),'Header font bytes retain the exact licensed House faces');
assert(headerCss.includes('body.explorer-expanded .bullen-site-shell[data-bullen-header]'), 'Fullscreen Flywheel must hide navigation above its controls');
assert.deepEqual(featured,['goods','world','platform','flywheel']);
assert.equal(groups[0][1][0],'bullensaga');
assert(!groups.flatMap(([,keys])=>keys).includes('world'));
assert.equal(new Set([...featured,...groups.flatMap(([,keys])=>keys)]).size,21);
for(const [,keys] of groups)for(const key of keys){assert(descriptions[key]?.length>10);assert(destinations[key]);assert(labels[key]);}
assert.equal(socials.length,4);assert.equal(resources.length,11);
const oldDestinations=['/buy','/objects.html','/giveaways.html','/stats.html','/deepdive','/tape.html','/chart.html','/curve.html','/refer.html','/thedrop.html','/patchnotes.html','/lock.html','/ledger.html','/passport.html','/rooms.html','/world','/platform','/flywheel','https://bullensaga.com/'];
for(const href of oldDestinations)assert(Object.values(destinations).includes(href),href);
for(const name of fs.readdirSync(site).filter(name=>name.endsWith('.html'))){
 const html=fs.readFileSync(new URL(name,site),'utf8');
 const shell=html.match(/<!-- BULLEN_SHELL_START[\s\S]*?<!-- BULLEN_SHELL_END -->/)?.[0];
 assert(shell,`${name}: initial shell`);
 assert.equal((html.match(/data-bullen-header=""/g)||[]).length,1);
 assert.equal((html.match(/src="\/bullen-header.js"/g)||[]).length,1);
 const navScript=html.indexOf('src="/bullen-header.js"'), vendorScript=html.indexOf('src="https://plugin.jup.ag/');
 assert(vendorScript<0||navScript<vendorScript,`${name}: header must bind before swap vendors`);
 assert.equal((html.match(/href="\/bullen-header.css"/g)||[]).length,1);
 const visible=[...shell.matchAll(/class="bullen-header-destination bullen-header-([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(visible,featured,name);
 const body=html.replace(shell,'');
 for(const [,id] of shell.matchAll(/href="#([^"]+)"/g))assert(body.includes(`id="${id}"`),`${name}: actual local section ${id}`);
 const ids=[...shell.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,name);
 for(const id of ids)assert(!body.includes(`id="${id}"`),`${name}: header ID clashes with body`);
 assert(shell.includes('>EXPLORE</span>'));assert(shell.includes('>MENU</span>'));
 assert(!shell.includes('>World<small>'));
 for(const copy of Object.values(descriptions))assert(shell.includes(copy),`${name}: vetted descriptions`);
 assert(!shell.includes('/shares')&&!shell.includes('/referrals')&&!shell.includes('/transparency'),`${name}: unlisted private routes stay unlisted`);
}
// Execute the real binder with a small event-driven DOM. This checks behaviors,
// including focus return and modal priority, rather than mirroring its code.
class Element{
 constructor(name){this.name=name;this.hidden=true;this.attrs={};this.listeners=new Map();this.open=false;this.scrollTop=99;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn({target:this,...event});}
 setAttribute(k,v){this.attrs[k]=v;} removeAttribute(k){delete this.attrs[k];}
 focus(){document.activeElement=this;root.dataset.focusNavigation='pointer';}
 contains(target){return this===target||(this.children||[]).includes(target);}
 closest(selector){return selector==='a[href]'&&this.isLink?this:null;}
 querySelectorAll(){return [];}
}
const root={dataset:{focusNavigation:'pointer'}},document=new Element('document'),body=new Element('body');
let modal=false,bodyOverlay='',observerCallback;body.matches=selector=>Boolean(bodyOverlay && selector.includes(bodyOverlay));document.body=body;document.documentElement=root;document.activeElement=body;
const shell=new Element('shell'),exploreButton=new Element('explore-button'),explorePanel=new Element('explore-panel'),contentsButton=new Element('contents-button'),contentsPanel=new Element('contents-panel'),closeButton=new Element('close'),link=new Element('link');link.isLink=true;explorePanel.children=[link,closeButton];shell.children=[exploreButton,explorePanel,contentsButton,contentsPanel,closeButton,link];shell.dataset={};shell.getBoundingClientRect=()=>({bottom:72});
const groupEls=[new Element('house'),new Element('token'),new Element('community')],summaries=groupEls.map((_,i)=>new Element('summary'+i));
const map={'#bullen-explore-button':exploreButton,'#bullen-explore-panel':explorePanel,'#bullen-contents-button':contentsButton,'#bullen-contents-panel':contentsPanel,'.bullen-header-close':closeButton};
shell.querySelector=s=>map[s];shell.querySelectorAll=s=>s==='.bullen-header-group'?groupEls:s==='.bullen-header-group > summary'?summaries:[];
document.querySelector=s=>s==='[data-bullen-header]'?shell:modal?{}:null;document.getElementById=()=>null;
const media=new Element('media');media.matches=false;const globalEvents=new Element('global');const frames=[];
vm.runInNewContext(fs.readFileSync(new URL('bullen-header.js',site),'utf8'),{document,matchMedia:()=>media,addEventListener:(...args)=>globalEvents.addEventListener(...args),requestAnimationFrame:fn=>frames.push(fn),MutationObserver:class{constructor(fn){observerCallback=fn;}observe(){}}});
assert(groupEls.every(g=>g.open),'desktop group contents are available');assert(explorePanel.hidden&&contentsPanel.hidden);
exploreButton.emit('click');assert(!explorePanel.hidden);assert.equal(explorePanel.scrollTop,0);assert.equal(exploreButton.attrs['aria-expanded'],'true');
contentsButton.emit('click');assert(explorePanel.hidden&&!contentsPanel.hidden,'one panel at a time');
root.dataset.focusNavigation='keyboard';let prevented=false;document.emit('keydown',{key:'Escape',defaultPrevented:false,preventDefault(){prevented=true;}});assert(prevented);assert(contentsPanel.hidden);assert.equal(document.activeElement,contentsButton);assert.equal(root.dataset.focusNavigation,'keyboard');
exploreButton.emit('click');modal=true;document.emit('keydown',{key:'Escape',defaultPrevented:false,preventDefault(){throw Error('must not take modal Escape');}});assert(!explorePanel.hidden);observerCallback();assert(explorePanel.hidden,'native dialog closes directory');modal=false;
exploreButton.emit('click');document.emit('pointerdown',{target:body});assert(explorePanel.hidden);
exploreButton.emit('click');explorePanel.emit('click',{target:link});assert(explorePanel.hidden,'destination closes directory');
exploreButton.emit('click');document.activeElement=link;closeButton.emit('click');assert.equal(document.activeElement,exploreButton);
exploreButton.emit('click');document.activeElement=body;shell.emit('focusout');frames.splice(0).forEach(fn=>fn());assert(explorePanel.hidden,'Tab can leave the non-modal directory');
media.matches=true;media.emit('change');assert.deepEqual(groupEls.map(g=>g.open),[true,false,false]);
for(const overlay of ['.vault-open','.lightbox-open','.wallet-modal-open','.bullen-mobile-buy-open','.explorer-expanded']){exploreButton.emit('click');bodyOverlay=overlay;observerCallback();assert(explorePanel.hidden,`${overlay}: overlay closes the directory`);bodyOverlay='';}
exploreButton.emit('click');globalEvents.emit('pagehide');assert(explorePanel.hidden);globalEvents.emit('pageshow');assert(explorePanel.hidden);
assert.equal(shell.dataset.bullenHydrated,'true');
console.log('Shared header: 31 initial documents, ordered destinations, complete directory, real local anchors, descriptions, Escape/focus, one-panel, mobile disclosure, overlay and history lifecycle: ok');
