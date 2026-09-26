(() => {
  const $ = id => document.getElementById(id);
  const dialog = $('signup'), form = $('signup-form'), contact = $('contact');
  let busy = false, lastFocus;
  function open(privacy = false) {
    lastFocus = document.activeElement;
    dialog.showModal();
    $('privacy').open = privacy;
    if (privacy) $('privacy').scrollIntoView({ block: 'nearest' });
  }
  function close() { dialog.close(); }
  $('open-signup').addEventListener('click', () => open());
  $('privacy-link').addEventListener('click', event => { event.preventDefault(); open(true); });
  $('close-signup').addEventListener('click', close);
  $('done').addEventListener('click', close);
  dialog.addEventListener('close', () => lastFocus?.focus({ preventScroll: true }));
  dialog.addEventListener('click', event => {
    const r = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) close();
  });
  const drafts = { email: '', x: '' }; let method = 'email';
  form.addEventListener('change', event => {
    if (event.target.name !== 'method') return;
    drafts[method] = contact.value; method = event.target.value;
    contact.type = method === 'email' ? 'email' : 'text';
    contact.autocomplete = method === 'email' ? 'email' : 'off';
    contact.maxLength = method === 'email' ? 254 : 16;
    if (method === 'x') contact.pattern = '@?[A-Za-z0-9_]{1,15}'; else contact.removeAttribute('pattern');
    contact.placeholder = method === 'email' ? 'you@example.com' : '@yourhandle';
    $('contact-label').textContent = method === 'email' ? 'email address' : 'x handle';
    $('contact-help').textContent = method === 'email' ? 'we’ll only use it for beta availability and testing updates.' : 'use a handle you control and allow messages so we can reach you.';
    contact.value = drafts[method]; $('form-status').textContent = '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    busy = true; $('submit-signup').disabled = true; form.setAttribute('aria-busy', 'true');
    $('submit-signup').textContent = 'saving your request…'; $('form-status').textContent = '';
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/platform/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', signal: controller.signal, body: JSON.stringify({ method, contact: contact.value, consent: form.elements.consent.checked, website: form.elements.website.value }) });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'we couldn’t save your request. please try again.');
      form.reset(); $('form-view').hidden = true; $('success-view').hidden = false;
      dialog.setAttribute('aria-labelledby', 'success-title');
      $('success-view').querySelector('h2').id = 'success-title';
      $('success-view').focus({ preventScroll: true }); dialog.scrollTop = 0;
    } catch (error) {
      $('form-status').textContent = error.name === 'AbortError' ? 'that took longer than expected. please retry; duplicate requests are safely ignored.' : error instanceof TypeError ? 'connection interrupted. please try again.' : error.message;
    } finally {
      clearTimeout(timeout); busy = false; form.removeAttribute('aria-busy'); $('submit-signup').disabled = false; $('submit-signup').textContent = 'join the notification list ↗';
    }
  });
  const video = $('monolith'), motion = $('motion'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduce.matches, failed = false;
  function syncVideo() {
    motion.textContent = paused ? 'play motion' : 'pause motion'; motion.setAttribute('aria-pressed', String(paused));
    if (paused || document.hidden || failed) { video.pause(); return; }
    if (!video.src) video.src = video.dataset.src;
    video.play().catch(() => { paused = true; motion.textContent = 'play motion'; motion.setAttribute('aria-pressed', 'true'); });
  }
  video.addEventListener('playing', () => video.parentElement.classList.add('playing'));
  video.addEventListener('error', () => { failed = true; video.parentElement.classList.remove('playing'); motion.hidden = true; });
  motion.addEventListener('click', () => { paused = !paused; syncVideo(); });
  reduce.addEventListener('change', () => { paused = reduce.matches; syncVideo(); });
  document.addEventListener('visibilitychange', syncVideo);
  motion.hidden = false; syncVideo();
})();
