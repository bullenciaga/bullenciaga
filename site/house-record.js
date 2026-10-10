(() => {
  'use strict';
  const film = document.querySelector('[data-record-film]');
  if (film) {
    const video = film.querySelector('video');
    const play = film.querySelector('.record-film-play');
    const status = film.querySelector('.record-film-status');
    if (video && play && status) {
      video.controls = false;
      play.hidden = false;
      play.addEventListener('click', async () => {
        if (play.disabled) return;
        play.disabled = true;
        status.hidden = true;
        play.querySelector('b').textContent = 'Opening film…';
        let timeout;
        try {
          await Promise.race([
            video.play(),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Playback timeout')), 12000); })
          ]);
          video.controls = true;
          play.hidden = true;
          video.focus({preventScroll:true});
        } catch {
          video.pause();
          status.hidden = false;
        } finally {
          clearTimeout(timeout);
          play.disabled = false;
          play.querySelector('b').textContent = 'Play the collection film';
        }
      });
    }
  }
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
