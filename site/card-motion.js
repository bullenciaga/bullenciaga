/* Presentation only: marketplace, ownership and mint behavior stay in the gallery. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  let animations = [], cleanups = [], closing = false;
  function cancel() {
    animations.splice(0).forEach(a => a.cancel());
    cleanups.splice(0).forEach(fn => fn());
    closing = false;
  }
  function animate(el, frames, duration = 360, delay = 0) {
    const a = el.animate(frames, {duration, delay, easing:'cubic-bezier(.22,1,.36,1)', fill:'both'});
    animations.push(a);
    return a;
  }
  function conceal(el) {
    const old = el.style.visibility;
    el.style.visibility = 'hidden';
    cleanups.push(() => { el.style.visibility = old; });
  }
  function fly(image, from, to, reverse = false) {
    const clone = image.cloneNode(false);
    clone.removeAttribute('id'); clone.removeAttribute('alt');
    clone.setAttribute('aria-hidden','true'); clone.className = 'card-flight';
    Object.assign(clone.style, {left:`${to.left}px`,top:`${to.top}px`,width:`${to.width}px`,height:`${to.height}px`});
    document.body.appendChild(clone); cleanups.push(() => clone.remove());
    const scaled = `translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`;
    const normal = 'translate(0,0) scale(1,1)';
    const sourceStyle = getComputedStyle(image);
    const frames = [{transform:scaled,opacity:sourceStyle.opacity,filter:sourceStyle.filter},{transform:normal,opacity:1,filter:'none'}];
    return animate(clone, reverse ? frames.reverse() : frames, reverse ? 290 : 390);
  }
  function visible(rect) { return !!rect && rect.width > 0 && rect.top >= 0 && rect.bottom <= innerHeight; }
  function open(card, overlay, sourceRect) {
    cancel();
    const image = overlay.querySelector('#galleryLightboxImgGallery');
    const source = card?.querySelector('img');
    const content = overlay.querySelector('.gallery-lightbox-content');
    if (!image || !source || !source.complete || !source.naturalWidth || reduced.matches) return;
    // Synchronous measurement keeps the first expanded frame from flashing.
    const target = image.getBoundingClientRect();
    if (!target.width) return;
    conceal(image);
    const flight = fly(source, sourceRect, target);
    animate(overlay,[{backgroundColor:'rgba(5,5,5,0)'},{backgroundColor:'rgba(5,5,5,.92)'}]);
    animate(content,[{opacity:0},{opacity:1}],240,160);
    const body = overlay.querySelector('.gallery-lightbox-body');
    if(body) animate(body,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],260,170);
    // Preserve the image loader and retries. Hold the decoded flying artwork
    // briefly if the destination image is still loading, rather than flashing blank.
    flight.finished.then(() => {
      if (image.complete && image.naturalWidth) return cancel();
      const finish = () => cancel();
      const timer = setTimeout(finish, 1200);
      image.addEventListener('load', finish, {once:true});
      cleanups.push(() => {clearTimeout(timer); image.removeEventListener('load', finish);});
    }).catch(() => {});
  }
  function close(overlay, done) {
    if (closing) return true;
    cancel();
    const image = overlay.querySelector('#galleryLightboxImgGallery');
    if (!image || reduced.matches || overlay.style.display === 'none') return false;
    const source = [...document.querySelectorAll('.gallery-card > img')].find(i => i.alt === image.alt);
    const from = source?.getBoundingClientRect(), target = image.getBoundingClientRect();
    closing = true;
    let end;
    if (source?.complete && visible(from) && visible(target)) {
      conceal(image); conceal(source);
      end = fly(source, from, target, true);
    }
    const fade = animate(overlay,[{opacity:1},{opacity:0}],end ? 290 : 160);
    (end || fade).finished.then(() => { cancel(); done(); }).catch(() => {});
    return true;
  }
  function attach(card) {
    let frame = 0, bounds;
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0; bounds = null;
      card.style.transform = ''; card.style.removeProperty('--card-shine');
    };
    card.addEventListener('pointerenter', () => { bounds = card.getBoundingClientRect(); });
    card.addEventListener('pointermove', event => {
      if (!hover.matches || reduced.matches || event.pointerType === 'touch') return;
      bounds ||= card.getBoundingClientRect();
      const x = Math.max(-.5,Math.min(.5,(event.clientX-bounds.left)/bounds.width-.5));
      const y = Math.max(-.5,Math.min(.5,(event.clientY-bounds.top)/bounds.height-.5));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.transform = `perspective(900px) scale(1.14) rotateX(${-y*8}deg) rotateY(${x*8}deg)`;
        card.style.setProperty('--card-shine','1');
        card.style.setProperty('--card-light-x',`${(x+.5)*100}%`);
        card.style.setProperty('--card-light-y',`${(y+.5)*100}%`);
      });
    });
    card.addEventListener('pointerleave', reset);
    card.addEventListener('pointercancel', reset);
    card.addEventListener('click', reset);
  }
  addEventListener('resize', cancel);
  reduced.addEventListener('change', cancel);
  window.BullenCardMotion = {attach,open,close,cancel};
})();
