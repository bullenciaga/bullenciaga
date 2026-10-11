export function validWallet(value){if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))return false;let n=0n,bytes=0;for(const ch of value)n=n*58n+BigInt('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.indexOf(ch));for(;n;n>>=8n)bytes++;return bytes+(value.match(/^1*/)?.[0].length||0)===32}
export const raw=v=>typeof v==='string'&&/^\d{1,16}$/.test(v);
export function verified(d){
 if(d?.campaign!=='rare-four-25m'||d.targetRaw!=='25000000000000'||d.entryUnitRaw!=='100000000000'||!['not-started','live','sealed','committed','drawn','review'].includes(d.phase)||typeof d.ready!=='boolean')return false;
 if(d.ready&&(!['retainedRaw','totalEntries'].every(k=>raw(d[k]))||!Number.isSafeInteger(d.eligibleWallets)||d.eligibleWallets<0||!Number.isSafeInteger(d.observedSlot)||d.observedSlot<=455416504||!Number.isFinite(d.observedAt)||d.observedAt<=1791670524000||d.observedAt>Date.now()+300000||BigInt(d.totalEntries)>BigInt(d.retainedRaw)/100000000000n||BigInt(d.eligibleWallets)>BigInt(d.totalEntries)))return false;
 if(d.phase==='drawn')return d.ready&&/^[a-f0-9]{64}$/.test(d.snapshotHash)&&Array.isArray(d.winners)&&d.winners.length===4&&d.winners.every((w,i)=>w.position===[875,853,677,254][i]&&validWallet(w.wallet));
 return true;
}
export function amount(r){const n=BigInt(r),fraction=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return (n/1000000n).toLocaleString('en-US')+(fraction?'.'+fraction:'')}
