(() => {
  'use strict';
  const pickers = [...document.querySelectorAll('.record-picker')];
  for (const picker of pickers) {
    picker.addEventListener('toggle', () => {
      if (picker.open) for (const other of pickers) if (other !== picker) other.open = false;
    });
  }
  document.addEventListener('pointerdown', event => {
    for (const picker of pickers) if (!picker.contains(event.target)) picker.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const picker = pickers.find(item => item.open);
    if (!picker) return;
    event.preventDefault();
    picker.open = false;
    picker.querySelector('summary').focus({preventScroll: true});
  });
  document.addEventListener('focusin', event => {
    for (const picker of pickers) if (!picker.contains(event.target)) picker.open = false;
  });
})();
