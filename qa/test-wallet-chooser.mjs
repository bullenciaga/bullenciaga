import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../site/bullen-wallet-chooser.js', import.meta.url), 'utf8');

// Exercise the shipped chooser and its DOM cleanup without extensions or networking.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.selectors = new Map();
    this.handlers = new Map();
    this.disabled = false;
  }
  appendChild(child) { child.parent = this; this.children.push(child); }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  setAttribute(name, value) { this[name] = value; }
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new Element());
    return this.selectors.get(selector);
  }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  click() { this.handlers.get('click')?.(); }
}

function fixture(provider, mobile = false) {
  const body = new Element(), head = new Element(), opened = [];
  const window = {
    ...(provider ? { phantom: { solana: provider } } : {}),
    open: (...args) => opened.push(args),
  };
  vm.runInNewContext(source, {
    window,
    document: { body, head, createElement: tag => new Element(tag), getElementById: id => head.children.find(child => child.id === id) },
    navigator: { userAgent: mobile ? 'iPhone' : '' },
    location: { hostname: 'bullenciaga.com', origin: 'https://bullenciaga.com', pathname: '/goods/', search: '' },
  });
  return {
    window, body, opened,
    choose() {
      const promise = window.BullenWalletChooser.connect();
      const modal = body.children[0];
      return { promise, modal, row: modal.querySelector('.bwc-list-primary').children[0] };
    },
  };
}

async function expectHandledFailure(f, pattern) {
  const { promise, row } = f.choose();
  const rejected = assert.rejects(promise, pattern);
  assert.doesNotThrow(() => row.click(), 'the click must not throw outside the chooser promise');
  await rejected;
  assert.equal(f.body.children.length, 0, 'failure removes the modal and lets callers recover');
}

test('partial Phantom provider rejects cleanly and can be retried after initialization', async () => {
  const provider = { isPhantom: true }, f = fixture(provider);
  await expectHandledFailure(f, /Phantom is not ready/);
  provider.connect = () => ({ publicKey: { toString: () => 'fixture-address' } });
  const { promise, row } = f.choose();
  assert.equal(row.disabled, false, 'retry starts with an enabled choice');
  row.click();
  assert.equal((await promise).address, 'fixture-address');
  assert.equal(f.body.children.length, 0);
});

test('synchronous Phantom failure becomes a chooser rejection in the same click', async () => {
  let insideClick = false, called = false;
  const f = fixture({ connect() {
    called = true;
    assert.equal(insideClick, true, 'do not defer a popup-capable provider call to another task');
    throw new Error('Fixture wallet locked');
  } });
  const { promise, row } = f.choose();
  const rejected = assert.rejects(promise, /Fixture wallet locked/);
  insideClick = true;
  assert.doesNotThrow(() => row.click());
  assert.equal(called, true, 'provider.connect runs before the click returns');
  insideClick = false;
  await rejected;
  assert.equal(f.body.children.length, 0);
});

test('asynchronous Phantom rejection still cleans up', async () => {
  await expectHandledFailure(fixture({ connect: () => Promise.reject(new Error('Fixture user rejected')) }), /Fixture user rejected/);
});

test('successful connect preserves provider receiver and response address', async () => {
  let calls = 0;
  const provider = { connect() {
    assert.equal(this, provider);
    calls++;
    return Promise.resolve({ publicKey: { toString: () => 'response-address' } });
  } };
  const f = fixture(provider), { promise, row } = f.choose();
  assert.equal(calls, 0, 'opening settings does not connect automatically');
  row.click();
  const result = await promise;
  assert.equal(calls, 1);
  assert.equal(result.provider, provider);
  assert.equal(result.address, 'response-address');
  assert.equal(result.id, 'phantom');
  assert.equal(f.body.children.length, 0);
});

test('successful connect supports the provider publicKey and legacy Phantom discovery', async () => {
  const provider = { isPhantom: true, publicKey: { toString: () => 'provider-address' }, connect: () => undefined };
  const f = fixture();
  f.window.solana = provider;
  const { promise, row } = f.choose();
  row.click();
  assert.equal((await promise).address, 'provider-address');
});

test('a wallet disappearing after the picker opens rejects and clears the modal', async () => {
  const f = fixture({ connect() { throw new Error('should not connect'); } });
  const { promise, row } = f.choose();
  const rejected = assert.rejects(promise, /Phantom is not available/);
  delete f.window.phantom;
  row.click();
  await rejected;
  assert.equal(f.body.children.length, 0);
});

test('missing address and throwing connect accessors both reject cleanly', async () => {
  await expectHandledFailure(fixture({ connect: () => ({}) }), /Wallet did not return an address/);
  await expectHandledFailure(fixture({ get connect() { throw new Error('Fixture provider unavailable'); } }), /Fixture provider unavailable/);
});

test('mobile app link, desktop install and closing remain passive', async () => {
  for (const mobile of [false, true]) {
    const f = fixture(undefined, mobile), { promise, row, modal } = f.choose();
    assert.equal(row.tagName, mobile ? 'A' : 'BUTTON');
    assert.equal(f.opened.length, 0);
    if (mobile) {
      const link = new URL(row.href);
      assert.equal(link.origin, 'https://phantom.app');
      assert.equal(decodeURIComponent(link.pathname.slice('/ul/browse/'.length)), 'https://bullenciaga.com/goods/');
    } else {
      row.click();
      assert.deepEqual(f.opened, [['https://phantom.app/', '_blank', 'noopener']]);
    }
    modal.querySelector('.bwc-close').click();
    assert.equal(await promise, null);
    assert.equal(f.body.children.length, 0);
  }
});
