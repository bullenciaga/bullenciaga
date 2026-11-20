(() => {
  'use strict';
  const {choices, defaults} = window.HerdStudioPalette;
  const look = {...defaults};
  const labels = {fur:'Fur', horns:'Horns', clothing:'Clothing', accessories:'Accessories', background:'Background'};
  const accessories = ['eyewear', 'headwear', 'jewelry'];
  const order = ['background', 'fur', 'horns', 'clothing', 'eyes', ...accessories];
  const get = id => document.getElementById(id);
  const print = get('print');
  const download = get('download');
  const status = get('status');
  const peek = get('peek');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const slots = new Map();
  const images = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let openGroup = 'clothing';
  let displayed = null;
  let requested = 0;
  let completed = 0;
  let rendering = false;
  let exportURL = '';

  function asset(path) {
    return window.HerdStudioFiles?.[path] || '/assets/herd-studio/' + path;
  }
  function selected(group, state = look) {
    return choices[group].find(choice => choice.id === state[group]);
  }
  function summary(group) {
    return group === 'accessories'
      ? accessories.map(g => selected(g)?.name).filter(Boolean).join(', ') || 'None'
      : selected(group).name;
  }
  function element(tag, cls, text) {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function buildWardrobe() {
    for (const [key, name] of Object.entries(labels)) {
      const group = element('div','group');
      const toggle = element('button','group-toggle');
      toggle.type = 'button';
      toggle.dataset.category = key;
      toggle.setAttribute('aria-controls', 'fold-' + key);
      toggle.append(element('span','group-name',name),element('span','group-value'),element('span','group-sign'));
      const fold = element('div','fold');
      fold.id = 'fold-' + key;
      const inner = element('div','fold-inner');
      const grid = element('div','swatches');
      for (const part of key === 'accessories' ? accessories : [key]) {
        for (const choice of choices[part]) {
          const button = element('button','choice');
          button.type = 'button';
          button.dataset.group = part;
          button.dataset.id = choice.id;
          const art = element('span','choice-art' + (part === 'fur' ? ' material' : ''));
          if (choice.color) art.style.backgroundColor = choice.color;
          else {
            const img = new Image();
            img.alt = '';
            img.fetchPriority = key === openGroup ? 'auto' : 'low';
            img.src = asset('choices/' + part + '-' + choice.id + '.webp');
            art.append(img);
          }
          button.append(art,element('span','choice-name',choice.name));
          grid.append(button);
        }
      }
      if (key === 'accessories') inner.append(element('p','accessory-tip','Select an accessory again to remove it.'));
      inner.append(grid);
      fold.append(inner);
      group.append(toggle,fold);
      get('categories').append(group);
    }
    syncWardrobe();
  }
  function syncWardrobe() {
    for (const toggle of document.querySelectorAll('[data-category]')) {
      const key = toggle.dataset.category;
      const open = key === openGroup;
      toggle.setAttribute('aria-expanded',String(open));
      toggle.querySelector('.group-value').textContent = summary(key);
      const fold = get('fold-' + key);
      fold.inert = !open;
      fold.classList.toggle('open',open);
    }
    for (const button of document.querySelectorAll('.choice')) {
      button.setAttribute('aria-pressed',String(look[button.dataset.group] === button.dataset.id));
    }
  }

  function imageFor(id) {
    let pending = images.get(id);
    if (pending) images.delete(id);
    else {
      pending = (async () => {
        const img = new Image();
        img.src = asset('layers/' + id + '.webp');
        await img.decode();
        return img;
      })().catch(error => { if (images.get(id) === pending) images.delete(id); throw error; });
    }
    images.set(id,pending);
    if (images.size > 18) images.delete(images.keys().next().value);
    return pending;
  }
  async function artwork(group, state) {
    const ids = group === 'eyes' ? ['eyes-basic'] : selected(group,state)?.layers || [];
    return Promise.all(ids.map(imageFor));
  }
  async function faceFor(originals) {
    if (!originals.length) return null;
    const face = element('div','layer-face');
    const copies = originals.map(original => original.cloneNode(false));
    face.append(...copies);
    await Promise.all(copies.map(img => img.decode()));
    return face;
  }
  function animateSlot(group, entering, previous, state) {
    const slot = slots.get(group);
    const leaving = slot.firstElementChild;
    if (!previous || reduced.matches || !slot.animate) {
      slot.replaceChildren(...(entering ? [entering] : []));
      return Promise.resolve();
    }
    if (group === 'clothing' || accessories.includes(group)) {
      const oldIndex = choices[group].findIndex(item => item.id === previous[group]);
      const newIndex = choices[group].findIndex(item => item.id === state[group]);
      const direction = newIndex >= oldIndex ? 1 : -1;
      // Both pieces sit one portrait-width apart on the same moving surface.
      const track = element('div','wardrobe-track');
      if (leaving) track.append(leaving);
      if (entering) {
        entering.style.transform = 'translateX(' + direction * 100 + '%)';
        track.append(entering);
      }
      slot.append(track);
      const slide = track.animate([
        {transform:'translateX(0%)'},
        {transform:'translateX(' + -direction * 100 + '%)'}
      ],{duration:460,easing:'cubic-bezier(.42,0,.23,1)',fill:'both'});
      return slide.finished.finally(() => {
        if (entering) {
          entering.style.removeProperty('transform');
          slot.append(entering);
        }
        track.remove();
        slide.cancel();
      });
    }
    if (entering) slot.append(entering);
    slot.classList.add('blending');
    const timing = {duration:280,easing:'cubic-bezier(.32,.06,.18,1)',fill:'both'};
    const animations = [
      leaving?.animate([{opacity:1},{opacity:0}],timing),
      entering?.animate([{opacity:0},{opacity:1}],timing)
    ].filter(Boolean);
    return Promise.all(animations.map(animation => animation.finished)).finally(() => {
      leaving?.remove();
      for (const animation of animations) animation.cancel();
      slot.classList.remove('blending');
    });
  }
  async function present(state, revision) {
    const originals = await Promise.all(order.map(group => artwork(group,state)));
    const changes = order.map((group,index) => ({group,index})).filter(({group}) => !displayed || displayed[group] !== state[group]);
    const faces = await Promise.all(changes.map(({index}) => faceFor(originals[index])));
    if (revision !== requested) return;
    const moving = Promise.all(changes.map(({group},i) => animateSlot(group,faces[i],displayed,state)));
    displayed = state;
    get('starter').hidden = true;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,1024,1024);
    for (const group of originals) for (const img of group) ctx.drawImage(img,0,0);
    const [blob] = await Promise.all([new Promise(resolve => canvas.toBlob(resolve,'image/png')),moving]);
    if (revision !== requested) return;
    if (!blob) throw new Error('PNG');
    const priorURL = exportURL;
    exportURL = URL.createObjectURL(blob);
    download.href = exportURL;
    download.download = 'bullenciaga-' + state.fur + '-' + state.background + '.png';
    download.removeAttribute('aria-disabled');
    peek.firstElementChild.src = exportURL;
    if (priorURL) URL.revokeObjectURL(priorURL);
    const fur = selected('fur',state).name + ' bull';
    const outfit = selected('clothing',state).name;
    get('look').replaceChildren(fur + ' ',element('i','','/'),' ' + outfit);
    print.setAttribute('aria-label',[fur,selected('horns',state).name + ' horns',outfit,...accessories.map(g => selected(g,state)?.name).filter(Boolean),selected('background',state).name + ' background'].join(', '));
  }
  async function update() {
    requested++;
    syncWardrobe();
    download.removeAttribute('href');
    download.setAttribute('aria-disabled','true');
    get('retry').hidden = true;
    status.textContent = '';
    if (rendering) return;
    rendering = true;
    // Finish the visible transition, then take the most recent selection.
    while (completed < requested) {
      const revision = requested;
      try { await present({...look},revision); }
      catch {
        if (revision === requested) {
          status.textContent = 'Couldn’t load this portrait.';
          get('retry').hidden = false;
        }
      }
      completed = revision;
    }
    rendering = false;
  }
  for (const group of order) {
    const slot = element('div','layer-slot');
    slot.dataset.layer = group;
    slots.set(group,slot);
    get('layers').append(slot);
  }
  get('categories').addEventListener('click',event => {
    const button = event.target.closest('button');
    if (!button) return;
    const {category,group,id} = button.dataset;
    if (category) {
      openGroup = openGroup === category ? null : category;
      syncWardrobe();
    } else if (group && (look[group] !== id || accessories.includes(group))) {
      look[group] = look[group] === id ? null : id;
      update();
    }
  });
  for (const button of document.querySelectorAll('[data-crop]')) {
    button.addEventListener('click',() => {
      print.dataset.crop = button.dataset.crop;
      document.querySelectorAll('.crop-switch button').forEach(b => b.setAttribute('aria-pressed',String(b === button)));
    });
  }
  get('shuffle').addEventListener('click',() => {
    for (const [group,items] of Object.entries(choices)) {
      const ids = items.map(item => item.id).filter(id => group !== 'fur' || id !== look.fur);
      if (accessories.includes(group)) ids.push(null);
      look[group] = ids[Math.floor(Math.random()*ids.length)];
    }
    update();
  });
  get('retry').addEventListener('click',update);
  peek.addEventListener('click',() => get('print').scrollIntoView({block:'center',behavior:reduced.matches?'instant':'smooth'}));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { peek.hidden = entry.isIntersecting || entry.boundingClientRect.top > 0; },
      {rootMargin:'-104px 0px 0px 0px',threshold:.08}).observe(print);
  }
  buildWardrobe();
  update();
})();
