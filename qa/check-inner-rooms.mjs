import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const html = fs.readFileSync(path.join(site, 'rooms.html'), 'utf8');
const js = fs.readFileSync(path.join(site, 'inner-rooms.js'), 'utf8');
const css = fs.readFileSync(path.join(site, 'inner-rooms.css'), 'utf8');
const nav = fs.readFileSync(path.join(site, 'bullen-ui.js'), 'utf8');

assert.match(html, /THE INNER ROOMS/i);
assert.match(html, /SIGN THE REGISTER/);
assert.match(html, /THE SALON/);
assert.match(html, /plain-text proof of wallet control/i);
assert.match(html, /cannot move an asset, approve a transaction or spend \$BULLEN/i);
assert.match(html, /house-object-03-key\.png/);
assert.match(html, /id="roomsInterior"[^>]+hidden/);
assert.match(html, /NO THRESHOLD PUBLISHED/);

for (const route of [
  '/rpc/rooms/challenge', '/rpc/rooms/session', '/rpc/rooms/history?room=salon',
  '/rpc/rooms/socket-ticket?room=salon', '/rpc/rooms/live',
]) assert.ok(js.includes(route), `room client is missing ${route}`);

assert.match(js, /BullenWalletChooser\.connect\(\)/);
assert.match(js, /provider\.signMessage\(new TextEncoder\(\)\.encode\(result\.challenge\.message\), 'utf8'\)/);
assert.match(js, /headers\.set\('Authorization', 'Bearer ' \+ session\.token\)/);
assert.match(js, /text\.textContent = String\(message\.content/);
assert.match(js, /messageIds = new Set\(\)/);
assert.match(js, /window\.addEventListener\('pagehide', closeConnection\)/);
assert.doesNotMatch(js, /localStorage|sessionStorage|innerHTML/);
assert.match(css, /\.rooms-interior\[hidden\] \{ display:none; \}/);
assert.match(css, /@media \(max-width:700px\)/);
assert.match(nav, /rooms: 'Inner Rooms'/);
assert.match(nav, /\['rooms', '\/rooms\.html'\]/);
assert.match(nav, /nav\.append\(buildLink\('rooms'\)\)/);

console.log('Inner Rooms: signed Key gate, retained Salon client and responsive page verified');
