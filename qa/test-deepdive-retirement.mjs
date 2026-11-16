import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../src/website.mjs';
import {groups,destinations} from './header-data.mjs';
let assetCalls=0;
const env={ASSETS:{async fetch(){assetCalls++;return new Response('<html><title>Stats</title></html>',{headers:{'Content-Type':'text/html'}});}}};
for(const path of ['/deepdive','/deepdive/','/deepdive.html','/what-if-i-held','/what-if-i-held.html']){
 for(const method of ['GET','HEAD']){
  const response=await worker.fetch(new Request('https://bullenciaga.com'+path,{method}),env,{});
  assert.equal(response.status,410);assert.equal(response.headers.get('X-Robots-Tag'),'noindex');
  const body=await response.text();
  if(method==='HEAD')assert.equal(body,'');else{assert.match(body,/analytics page has retired/);assert(!body.includes('<script'));assert(!body.includes('/supply/'));}
 }
}
for (const path of ['/deepdive.js','/deepdive.css','/deepdive-snapshot.json','/what-if-i-held.js','/what-if-i-held.css','/holding-study.json','/holding-math.js']) {
  const response = await worker.fetch(new Request('https://bullenciaga.com'+path),env,{});
  assert.equal(response.status,410,path);
}
assert.equal(assetCalls,0,'retired pages never reach assets, service bindings or provider work');
assert(!groups.flatMap(([,keys])=>keys).includes('deepdive'));
assert(!Object.values(destinations).includes('/deepdive'));
const stats=await worker.fetch(new Request('https://bullenciaga.com/stats'),env,{});assert.equal(stats.status,200);assert.equal(assetCalls,1);
for(const name of fs.readdirSync(new URL('../site/',import.meta.url)).filter(n=>n.endsWith('.html'))){
 const html=fs.readFileSync(new URL('../site/'+name,import.meta.url),'utf8');
 const shell=html.match(/<!-- BULLEN_SHELL_START[\s\S]*?<!-- BULLEN_SHELL_END -->/)?.[0];
 assert(shell&&!shell.includes('href="/deepdive"'),name+' navigation still links retired collector');
 if (!['deepdive.html','what-if-i-held.html'].includes(name)) assert(!/href="\/(?:deepdive|what-if-i-held)(?:\.html)?[#"\/]/.test(html),name+' still links retired analytics');
}
console.log('DeepDive retirement: old page aliases return410 without scripts/backend calls; shared navigation excludes it and Stats remains available.');
