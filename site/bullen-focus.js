function installFocusNavigation(document) {
  'use strict';
  const root = document.documentElement;
  const arrowKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
  const nonTextTypes = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden']);
  const composite = 'select, input[type="radio"], input[type="range"], [role="tablist"], [role="radiogroup"], [role="menu"], [role="menubar"], [role="listbox"], [role="tree"], [role="grid"], [role="toolbar"], [role="slider"], [role="spinbutton"]';
  let navigationTurn = 0, navigationSequence = 0;
  const listeners = [], frames = new Set();
  const listen = (name, callback, options = true) => {
    document.addEventListener(name, callback, options);
    listeners.push([name, callback, options]);
  };
  const editing = target => {
    if (!target?.closest) return false;
    if (target.isContentEditable || target.closest('textarea, [role="textbox"], [role="searchbox"]')) return true;
    const input = target.closest('input');
    return Boolean(input && !nonTextTypes.has((input.type || 'text').toLowerCase()));
  };
  const compositeNavigation = (target, key) => {
    const marker = target?.closest?.('[data-keyboard-navigation]');
    if (marker) return (marker.getAttribute('data-keyboard-navigation') || '').split(/\s+/).includes(key);
    return Boolean(target?.closest?.(composite));
  };
  const neutral = () => { navigationTurn = 0; root.dataset.focusNavigation = 'pointer'; };
  const navigate = () => {
    root.dataset.focusNavigation = 'keyboard';
    document.activeElement?.classList.remove('bullen-auto-focus-neutral');
    const turn = navigationTurn = ++navigationSequence;
    const frame = requestAnimationFrame(() => {
      frames.delete(frame);
      if (navigationTurn === turn) navigationTurn = 0;
    });
    frames.add(frame);
  };
  neutral();
  listen('pointerdown', neutral);
  listen('touchstart', neutral, { capture: true, passive: true });
  listen('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || event.key === 'Process') { neutral(); return; }
    if (editing(event.target) && (event.key.length === 1 || arrowKeys.has(event.key) || ['Backspace', 'Delete', 'Enter'].includes(event.key))) {
      neutral(); return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Tab' || (arrowKeys.has(event.key) && !editing(event.target) && compositeNavigation(event.target, event.key))) {
      navigate();
    }
  });
  // Native Tab and roving/composite focus run in the current navigation turn.
  // A later .focus()/autofocus is not itself keyboard navigation.
  listen('focusin', event => {
    if (!navigationTurn) neutral();
    else event.target?.classList.remove('bullen-auto-focus-neutral');
  });
  for (const name of ['beforeinput', 'input', 'compositionstart']) {
    listen(name, event => { if (editing(event.target)) neutral(); });
  }
  return () => {
    listeners.forEach(([name, callback, options]) => document.removeEventListener(name, callback, options));
    frames.forEach(frame => cancelAnimationFrame(frame));
    neutral();
  };
}
installFocusNavigation(document);
