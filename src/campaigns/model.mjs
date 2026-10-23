// Campaign rules and draw math are shared by the service and executable tests.
export const VERSION = '1.0.0';
export const ACTIONS = {
  free: { label: 'Free entry', provider: null, modes: ['automatic'] },
  visit: { label: 'Visit a page', provider: null, modes: ['visit'] },
  x_follow: { label: 'Follow on X', provider: 'x', modes: ['api', 'review'] },
  x_repost: { label: 'Repost on X', provider: 'x', modes: ['api', 'review'] },
  x_like: { label: 'Like on X', provider: 'x', modes: ['api', 'review'] },
  x_reply: { label: 'Reply on X', provider: 'x', modes: ['api', 'review'] },
  x_quote: { label: 'Quote a post on X', provider: 'x', modes: ['api', 'review'] },
  discord_join: { label: 'Join a Discord server', provider: 'discord', modes: ['api', 'review'] },
  instagram_follow: { label: 'Follow on Instagram', provider: null, modes: ['review'] },
  instagram_like: { label: 'Like on Instagram', provider: null, modes: ['review'] },
  instagram_comment: { label: 'Comment on Instagram', provider: null, modes: ['review'] },
  instagram_share: { label: 'Share to an Instagram story', provider: null, modes: ['review'] },
  tiktok: { label: 'TikTok action', provider: null, modes: ['review'] },
  youtube: { label: 'YouTube action', provider: null, modes: ['review'] },
  telegram: { label: 'Telegram action', provider: null, modes: ['review'] },
  facebook: { label: 'Facebook action', provider: null, modes: ['review'] },
  newsletter: { label: 'Newsletter signup', provider: null, modes: ['review'] },
  question: { label: 'Answer a question', provider: null, modes: ['review'] },
  creative: { label: 'Submit something original', provider: null, modes: ['review'] },
  custom: { label: 'Custom action', provider: null, modes: ['review'] },
};
export class CampaignError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function fail(code, message, status) { throw new CampaignError(code, message, status); }
export function string(value, max, label, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('INVALID_FIELD', `Check ${label}.`);
  return value.trim();
}
export function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_FIELD', `${label} must be between ${min} and ${max}.`);
  return value;
}
export function safeURL(value, { image = false, optional = false } = {}) {
  if (!value && optional) return '';
  const s = string(value, 1200, 'URL');
  if (image && /^\/assets\/[\w./-]+$/.test(s) && !s.includes('..')) return s;
  let u; try { u = new URL(s); } catch { fail('INVALID_URL', 'Use a complete https:// URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) fail('INVALID_URL', 'Use a public HTTPS URL.');
  return u.href;
}
export function validateCampaign(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_CAMPAIGN', 'Campaign details are required.');
  const slug = string(input.slug, 70, 'campaign link');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ['admin','api','assets','preview'].includes(slug)) fail('INVALID_SLUG', 'Use lowercase letters, numbers and single hyphens for the link.');
  const start = Date.parse(input.startsAt), end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 86400000) fail('INVALID_DATES', 'Set a start and a later end, within one year.');
  const timeZone = string(input.timeZone || 'Europe/Warsaw', 60, 'time zone');
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { fail('INVALID_TIMEZONE', 'Choose a valid IANA time zone.'); }
  const prizes = input.prizes;
  if (!Array.isArray(prizes) || !prizes.length || prizes.length > 20) fail('INVALID_PRIZES', 'Add between 1 and 20 prizes.');
  const normalizedPrizes = prizes.map(p => ({ name: string(p.name, 140, 'prize name'), description: string(p.description || '', 600, 'prize description', false), quantity: integer(p.quantity ?? 1, 1, 100, 'Prize quantity') }));
  if (normalizedPrizes.reduce((n,p) => n+p.quantity,0) > 100) fail('INVALID_PRIZES', 'Use at most 100 total prizes.');
  if (!Array.isArray(input.actions) || !input.actions.length || input.actions.length > 40) fail('INVALID_ACTIONS', 'Add between 1 and 40 actions.');
  const ids = new Set();
  const actions = input.actions.map(a => {
    if (!ACTIONS[a.type] || !ACTIONS[a.type].modes.includes(a.mode)) fail('INVALID_ACTION', 'Choose a supported action and verification method.');
    const id = string(a.id, 50, 'action ID');
    if (!/^[a-z0-9_-]+$/.test(id) || ids.has(id)) fail('INVALID_ACTION', 'Action IDs must be unique.');
    ids.add(id);
    const frequency = a.frequency || 'once';
    if (!['once','daily'].includes(frequency) || (frequency === 'daily' && ['x_follow','x_repost','x_like','discord_join','instagram_follow'].includes(a.type))) fail('INVALID_FREQUENCY', 'Follows, memberships and reactions to the same post are one-time actions.');
    const target = safeURL(a.target || '', { optional: ['free','question','custom','creative'].includes(a.type) });
    if (target && a.type.startsWith('x_') && !['x.com','www.x.com','twitter.com','www.twitter.com'].includes(new URL(target).hostname)) fail('INVALID_TARGET', 'An X action needs an x.com or twitter.com URL.');
    const targetId = string(a.targetId || '', 100, 'platform target ID', false);
    if (a.mode === 'api' && !/^\d{1,25}$/.test(targetId)) fail('INVALID_TARGET', 'Automatic verification needs the numeric account, post or server ID.');
    if(a.mode==='api' && a.type.startsWith('x_') && a.type!=='x_follow'){
      const linkedID=new URL(target).pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1];
      if(linkedID!==targetId)fail('INVALID_TARGET','The X post ID must match the post in the target link.');
    }
    return { id, type: a.type, mode: a.mode, label: string(a.label || ACTIONS[a.type].label, 140, 'action title'), instructions: string(a.instructions || '', 1200, 'instructions', false), points: integer(a.points, 1, 1000, 'Points'), frequency, target, targetId };
  });
  const referral = input.referral || {};
  return { slug, title: string(input.title, 120, 'title'), description: string(input.description || '', 3000, 'description', false), cover: safeURL(input.cover || '/assets/house-record/007-seated-1280.webp', { image: true }), startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), timeZone, prizes: normalizedPrizes, actions, rules: string(input.rules || '', 12000, 'rules', false), eligibility: string(input.eligibility || '', 1500, 'eligibility', false), privacy: string(input.privacy || '', 4000, 'privacy notice', false), allowRepeatWinners: input.allowRepeatWinners === true, referral: { enabled: referral.enabled === true, points: integer(referral.points ?? 5, 1, 1000, 'Referral points'), cap: integer(referral.cap ?? 20, 1, 1000, 'Referral cap') } };
}
export function canEnter(c, now = Date.now()) {
  if (c.status !== 'live') fail('CAMPAIGN_NOT_OPEN', c.status === 'paused' ? 'This campaign is paused.' : 'This campaign is not accepting entries.', 409);
  if (now < Date.parse(c.doc.startsAt) || now >= Date.parse(c.doc.endsAt)) fail('CAMPAIGN_NOT_OPEN', 'This campaign is outside its entry window.', 409);
}
export function periodFor(action, doc, now) {
  if (action.frequency === 'once') return 'once';
  const parts = new Intl.DateTimeFormat('en', { timeZone: doc.timeZone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(now);
  return ['year','month','day'].map(k => parts.find(p => p.type===k).value).join('-');
}
export function csvCell(value) {
  const s = String(value ?? '');
  return '"' + (/^[\s]*[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"','""') + '"';
}
export const encode = new TextEncoder();
export function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
export function unb64(s) { return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0)); }
export function randomToken() { return b64(crypto.getRandomValues(new Uint8Array(32))); }
export async function sha(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export function decode58(s) {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) fail('INVALID_WALLET','Use a Solana wallet public address.');
  let n = 0n; for (const c of s) { const i='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.indexOf(c); if(i<0) fail('INVALID_WALLET','Invalid wallet address.'); n=n*58n+BigInt(i); }
  const bytes=[];while(n){bytes.unshift(Number(n%256n));n/=256n;}for(const c of s){if(c!=='1')break;bytes.unshift(0);}
  if (bytes.length!==32) fail('INVALID_WALLET','Invalid wallet public key.');return new Uint8Array(bytes);
}
// Rejection sampling avoids modulo bias. The secret seed is committed when
// published; reveal it with the frozen snapshot so anyone can replay the draw.
export async function selectWinners(snapshot, seed, snapshotHash, count, repeats) {
  let pool=snapshot.map(x=>({...x}));const winners=[];
  for(let i=0;i<count;i++) {
    const total=pool.reduce((sum,x)=>sum+x.points,0);if(!total)break;
    if(!Number.isSafeInteger(total)||total>0xffffffff) fail('DRAW_LIMIT','Entry total exceeds the draw limit.',409);
    const limit=Math.floor(0x100000000/total)*total;let pick,attempt=0;
    do { const h=await sha(`${seed}:${snapshotHash}:${i}:${attempt++}`);pick=parseInt(h.slice(0,8),16); } while(pick>=limit);
    let ticket=pick%total;let selected;
    for(const row of pool){if(ticket<row.points){selected=row;break;}ticket-=row.points;}
    winners.push({rank:i+1,participant:selected.participant,points:selected.points});
    if(!repeats)pool=pool.filter(x=>x.participant!==selected.participant);
  }
  return winners;
}
