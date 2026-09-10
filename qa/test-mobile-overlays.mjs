import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL(`../site/${name}`, import.meta.url), 'utf8');
const ui = read('bullen-ui.js');
const html = read('index.html');
const listeners = new Map();
const classes = new Set(['bullen-auto-focus-neutral']);
const activeElement = { classList: { remove: name => classes.delete(name) } };
const document = {
  documentElement: { dataset: {} }, activeElement,
  addEventListener: (name, callback, capture) => { assert.equal(capture, true); listeners.set(name, callback); },
};
vm.runInNewContext('const root = document.documentElement;\n' + ui.slice(ui.indexOf('  // Dialogs may focus'), ui.indexOf('  /* Settle fonts')), { document });
listeners.get('pointerdown')({ pointerType: 'touch' });
assert.equal(document.documentElement.dataset.bullenInput, 'pointer');
assert.equal(document.activeElement, activeElement, 'pointer styling must not blur accessible focus');
listeners.get('keydown')({ key: 'Tab' });
assert.equal(document.documentElement.dataset.bullenInput, 'keyboard');
assert.equal(classes.size, 0, 'Tab restores visible focus even on a previously neutral programmatic target');
listeners.get('pointerdown')({ pointerType: 'mouse' });
listeners.get('keydown')({ key: 'Control', ctrlKey: true });
assert.equal(document.documentElement.dataset.bullenInput, 'pointer', 'modifier alone does not switch mode');
listeners.get('keydown')({ key: 'Enter' });
assert.equal(document.documentElement.dataset.bullenInput, 'keyboard');

// Run the actual two legacy handlers in registration order. One Escape must
// dismiss only the uppermost layer and must not reach through a native dialog.
const handlers = [];
const modal = display => ({ style: { display } });
const gallery = modal('flex'), vault = modal('block'), wallet = modal('none');
let nativeDialog = false, moves = 0;
const context = {
  document: { querySelector: () => nativeDialog ? {} : null, addEventListener: (_, callback) => handlers.push(callback) },
  window: {}, galleryEls: { lightbox: gallery }, vaultEls: { modal: vault }, walletEls: { modal: wallet },
  closeLightbox: () => { gallery.style.display = 'none'; },
  closeVault: () => { vault.style.display = 'none'; },
  closeWalletModal: () => { wallet.style.display = 'none'; },
  currentLightboxIndex: 1, openLightboxAtIndex: () => { moves++; },
};
for (const marker of ["    if (e.defaultPrevented || document.querySelector('dialog[open], .bwc')) return;", "    if (e.key !== 'Escape' || e.defaultPrevented"]) {
  const at = html.indexOf(marker);
  assert(at > 0);
  const start = html.lastIndexOf("  document.addEventListener('keydown'", at);
  const end = html.indexOf('\n  });', at) + '\n  });'.length;
  vm.runInNewContext(html.slice(start, end), context);
}
const press = key => {
  const e = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  handlers.forEach(callback => callback(e));
};
press('Escape');
assert.equal(gallery.style.display, 'none');
assert.equal(vault.style.display, 'block', 'nested Vault remains open after closing its piece');
press('Escape');
assert.equal(vault.style.display, 'none');
gallery.style.display = 'flex'; vault.style.display = 'block'; wallet.style.display = 'flex';
press('Escape');
assert.equal(wallet.style.display, 'none');
assert.equal(gallery.style.display, 'flex');
assert.equal(vault.style.display, 'block');
nativeDialog = true;
press('Escape'); press('ArrowRight');
assert.equal(gallery.style.display, 'flex');
assert.equal(vault.style.display, 'block');
assert.equal(moves, 0, 'native collector dialogs shield the underlying gallery');
nativeDialog = false; context.window.__MINT_REVEAL_ACTIVE__ = true;
press('Escape');
assert.equal(gallery.style.display, 'flex', 'active reveal remains protected');
assert.equal(vault.style.display, 'block');
context.window.__MINT_REVEAL_ACTIVE__ = false;
press('ArrowRight'); assert.equal(moves, 1);

const css = read('bullen-ui.css');
assert.match(css, /body:is\(\.vault-open, \.lightbox-open, \.wallet-modal-open, \.bullen-mobile-buy-open\)/);
assert.match(css, /body:has\(\.collector-dialog\[open\], \.bwc\)/);
assert.match(css, /visibility: var\(--bullen-overlay-header-visibility, visible\)/);
assert.match(css, /html\[data-bullen-input="pointer"\] :where\(a, button, summary, \[role="button"\]\):focus/);
assert.match(css, /:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible/);
assert.match(css, /\.bwc-close \{[\s\S]*?width: 44px;[\s\S]*?min-width: 44px;[\s\S]*?height: 44px;[\s\S]*?min-height: 44px;[\s\S]*?padding: 0;/);
console.log('Mobile overlays: pointer/keyboard focus, nested Escape, wallet/native priority, reveal protection and mobile sizing contracts: ok');
