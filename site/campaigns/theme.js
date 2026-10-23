// Apply the explicit preference before CSS/first paint; dark is the default.
(() => {
  const key = 'bullen-campaign-theme';
  let theme = 'dark';
  try { if (localStorage.getItem(key) === 'light') theme = 'light'; } catch {}
  const apply = value => {
    theme = value;
    document.documentElement.dataset.theme = value;
    const button = document.getElementById('theme-toggle');
    if (button) {
      const label = `Switch to ${value === 'dark' ? 'light' : 'dark'} mode`;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.firstElementChild.textContent = value === 'dark' ? '☼' : '☾';
    }
  };
  apply(theme);
  document.addEventListener('DOMContentLoaded', () => {
    apply(theme);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      apply(theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem(key, theme); } catch {}
    });
  });
  addEventListener('storage', event => {
    if (event.key === key) apply(event.newValue === 'light' ? 'light' : 'dark');
  });
})();
