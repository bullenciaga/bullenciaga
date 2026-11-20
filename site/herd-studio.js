(() => {
  'use strict';
  const { choices, defaults } = window.HerdStudioPalette;
  const selection = { ...defaults };
  const accessoryGroups = ['eyewear', 'headwear', 'jewelry'];
  const order = ['background', 'fur', 'horns', 'clothing', 'eyes', ...accessoryGroups];
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const panel = document.getElementById('trait-panel');
  const portrait = document.getElementById('portrait');
  const avatar = document.getElementById('avatar');
  const download = document.getElementById('download');
  const status = document.getElementById('status');
  const retry = document.getElementById('retry');
  const previewButton = document.querySelector('.view-portrait');
  const print = document.getElementById('portrait-print');
  const cache = new Map();
  let generation = 0;
  let fileURL = '';
  let activeTab = 'fur';

  function asset(path) {
    return window.HerdStudioFiles?.[path] || '/assets/herd-studio/' + path;
  }
  function current(group) {
    return choices[group].find(item => item.id === selection[group]);
  }
  function getLayer(name) {
    if (!cache.has(name)) {
      const request = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Missing layer: ' + name));
        img.src = asset('layers/' + name + '.webp');
      }).catch(error => { cache.delete(name); throw error; });
      cache.set(name, request);
    }
    return cache.get(name);
  }
  function caption() {
    return ['Bull portrait', current('fur').name + ' fur', current('horns').name + ' horns',
      current('clothing').name, ...accessoryGroups.map(g => current(g)?.name).filter(Boolean),
      current('background').name + ' background'].join(', ');
  }
  function updateSummary() {
    for (const group of ['horns', 'clothing', 'background']) {
      document.getElementById('summary-' + group).textContent = current(group).name;
    }
    document.getElementById('summary-accessories').textContent =
      accessoryGroups.map(g => current(g)?.name).filter(Boolean).join(' · ') || 'None';
  }
  async function render() {
    const token = ++generation;
    const layers = order.flatMap(g => g === 'eyes' ? ['eyes-basic'] : current(g)?.layers || []);
    download.removeAttribute('href');
    download.setAttribute('aria-disabled', 'true');
    retry.hidden = true;
    status.textContent = '';
    updateSummary();
    try {
      const images = await Promise.all(layers.map(getLayer));
      if (token !== generation) return;
      const context = portrait.getContext('2d');
      context.clearRect(0, 0, portrait.width, portrait.height);
      for (const img of images) context.drawImage(img, 0, 0);
      portrait.setAttribute('aria-label', caption());
      const mini = avatar.getContext('2d');
      mini.imageSmoothingQuality = 'high';
      mini.drawImage(portrait, 0, 0, avatar.width, avatar.height);
      const chip = previewButton.querySelector('canvas');
      chip.getContext('2d').drawImage(avatar, 0, 0, chip.width, chip.height);
      portrait.hidden = false;
      document.getElementById('starter').hidden = true;
      const blob = await new Promise(resolve => portrait.toBlob(resolve, 'image/png'));
      if (token !== generation) return;
      if (!blob) throw new Error('PNG unavailable');
      if (fileURL) URL.revokeObjectURL(fileURL);
      fileURL = URL.createObjectURL(blob);
      download.href = fileURL;
      download.download = 'bullenciaga-' + [selection.fur, selection.background].join('-') + '.png';
      download.removeAttribute('aria-disabled');
    } catch {
      if (token !== generation) return;
      status.textContent = 'Couldn’t finish this portrait.';
      retry.hidden = false;
    }
  }

  function renderChoices() {
    const groups = activeTab === 'accessories' ? accessoryGroups : [activeTab];
    const contents = document.createDocumentFragment();
    if (activeTab === 'accessories') {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Select again to remove an accessory.';
      contents.append(hint);
    }
    const grid = document.createElement('div');
    grid.className = 'choice-grid';
    for (const group of groups) {
      for (const item of choices[group]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice';
        button.dataset.group = group;
        button.dataset.id = item.id;
        const art = document.createElement('span');
        art.className = 'choice-art';
        if (item.color) {
          art.style.backgroundColor = item.color;
        } else {
          const img = new Image();
          img.alt = '';
          img.width = img.height = 256;
          img.src = asset('choices/' + group + '-' + item.id + '.webp');
          art.append(img);
        }
        const label = document.createElement('span');
        label.className = 'choice-name';
        label.textContent = item.name;
        button.append(art, label);
        grid.append(button);
      }
    }
    contents.append(grid);
    panel.replaceChildren(contents);
    markSelection();
  }
  function markSelection() {
    for (const button of panel.querySelectorAll('.choice')) {
      button.setAttribute('aria-pressed', String(selection[button.dataset.group] === button.dataset.id));
    }
  }
  function showTab(tab) {
    activeTab = tab.dataset.tab;
    tabs.forEach(button => {
      button.setAttribute('aria-selected', String(button === tab));
      button.tabIndex = button === tab ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tab.id);
    renderChoices();
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => showTab(tab));
    tab.addEventListener('keydown', event => {
      const targets = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length,
        Home: 0, End: tabs.length - 1 };
      if (!(event.key in targets)) return;
      event.preventDefault();
      const next = tabs[targets[event.key]];
      next.focus();
      showTab(next);
    });
  }
  panel.addEventListener('click', event => {
    const button = event.target.closest('.choice');
    if (!button) return;
    const { group, id } = button.dataset;
    if (selection[group] === id && !accessoryGroups.includes(group)) return;
    selection[group] = selection[group] === id ? null : id;
    markSelection();
    render();
  });
  document.getElementById('shuffle').addEventListener('click', () => {
    const oldFur = selection.fur;
    for (const [group, items] of Object.entries(choices)) {
      const ids = items.map(item => item.id);
      if (accessoryGroups.includes(group)) ids.push(null);
      const pool = group === 'fur' ? ids.filter(id => id !== oldFur) : ids;
      selection[group] = pool[Math.floor(Math.random() * pool.length)];
    }
    markSelection();
    render();
  });
  retry.addEventListener('click', render);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      previewButton.hidden = entry.isIntersecting || entry.boundingClientRect.top > 0;
    }, { rootMargin: '-100px 0px 0px 0px', threshold: 0.1 });
    observer.observe(print);
  }
  previewButton.addEventListener('click', () => {
    print.focus({ preventScroll: true });
    print.scrollIntoView({ block: 'start' });
  });
  renderChoices();
  render();
})();
