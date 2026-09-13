/* One continuous card surface; no flying thumbnail or independently fading details. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const ease = 'cubic-bezier(.2,.75,.2,1)';
  let animations = [], cleanups = [], closing = false;
  function cancel() {
    animations.splice(0).forEach(a => a.cancel());
    cleanups.splice(0).forEach(fn => fn());
    closing = false;
  }
  function animate(el, frames, duration) {
    const a = el.animate(frames, {duration,easing:ease,fill:'both'});
    animations.push(a); return a;
  }
  function conceal(el) {
    if(!el) return;
    const old=el.style.visibility; el.style.visibility='hidden';
    cleanups.push(()=>{el.style.visibility=old;});
  }
  function surface(content) {
    const before = {origin:content.style.transformOrigin,overflow:content.style.overflow,willChange:content.style.willChange};
    content.style.transformOrigin='0 0';content.style.overflow='hidden';content.style.willChange='transform,clip-path';
    cleanups.push(()=>{content.style.transformOrigin=before.origin;content.style.overflow=before.overflow;content.style.willChange=before.willChange;});
  }
  function miniature(from,to) {
    const scale=from.width/to.width;
    return {transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${scale})`,clipPath:`inset(0px 0px ${Math.max(0,to.height-from.height/scale)}px 0px)`};
  }
  const full={transform:'translate(0px,0px) scale(1)',clipPath:'inset(0px 0px 0px 0px)'};
  function visible(r){return r && r.width>0 && r.top>=0 && r.bottom<=innerHeight;}
  function open(card,overlay,sourceRect) {
    cancel();
    const content=overlay.querySelector('.gallery-lightbox-content');
    const image=overlay.querySelector('#galleryLightboxImgGallery');
    const source=card?.querySelector('img');
    if(!content || !source?.complete || !source.naturalWidth || reduced.matches)return;
    content.scrollTop=0;
    const target=content.getBoundingClientRect();
    if(!target.width)return;
    // The decoded thumbnail is an underlay only; the real loader/retry keeps ownership.
    const oldBackground=image.style.backgroundImage;
    image.style.backgroundImage=`url(${JSON.stringify(source.currentSrc||source.src)})`;
    image.style.backgroundSize='cover';
    cleanups.push(()=>{image.style.backgroundImage=oldBackground;image.style.backgroundSize='';});
    conceal(card);conceal(overlay.querySelector('#lightboxTierParticles'));
    surface(content);
    const end=animate(content,[miniature(sourceRect,target),full],520);
    animate(overlay,[{backgroundColor:'rgba(5,5,5,0)'},{backgroundColor:'rgba(5,5,5,.92)'}],520);
    end.finished.then(cancel).catch(()=>{});
  }
  function close(overlay,done) {
    if(closing)return true;
    const content=overlay.querySelector('.gallery-lightbox-content');
    const image=overlay.querySelector('#galleryLightboxImgGallery');
    if(!content || !image || reduced.matches || overlay.style.display==='none')return false;
    // Reverse from the current frame when dismissed mid-expansion.
    const current=getComputedStyle(content),currentFrame={transform:current.transform,clipPath:current.clipPath};
    const background=getComputedStyle(overlay).backgroundColor;
    const wasAnimating=animations.length>0;
    cancel();closing=true;
    const source=[...document.querySelectorAll('.gallery-card > img')].find(i=>i.alt===image.alt)?.closest('.gallery-card');
    const from=source?.getBoundingClientRect(),to=content.getBoundingClientRect();
    let end;
    if(visible(from) && content.scrollTop<2){
      conceal(source);conceal(overlay.querySelector('#lightboxTierParticles'));surface(content);
      end=animate(content,[wasAnimating?currentFrame:full,miniature(from,to)],420);
      animate(overlay,[{backgroundColor:background},{backgroundColor:'rgba(5,5,5,0)'}],420);
    }else end=animate(overlay,[{opacity:1},{opacity:0}],180);
    end.finished.then(()=>{cancel();done();}).catch(()=>{});return true;
  }
  function attach(card) {
    let frame=0,bounds=null,active=false,last=0;
    let x=0,y=0,scale=1,tx=0,ty=0,ts=1;
    function tick(time){
      if(!card.isConnected){frame=0;return;}
      const dt=Math.min(32,last?time-last:16);last=time;
      const blend=1-Math.exp(-dt/65);
      x+=(tx-x)*blend;y+=(ty-y)*blend;scale+=(ts-scale)*blend;
      card.style.transform=`perspective(800px) scale(${scale}) rotateX(${-y*22}deg) rotateY(${x*22}deg)`;
      card.style.setProperty('--card-reflection-x',`${50+x*85}%`);
      card.style.setProperty('--card-reflection-y',`${50+y*55}%`);
      if(Math.abs(x-tx)+Math.abs(y-ty)+Math.abs(scale-ts)>.0005)frame=requestAnimationFrame(tick);
      else {frame=0;last=0;if(!active)card.style.transform='';}
    }
    function start(){if(!frame)frame=requestAnimationFrame(tick);}
    function reset(){active=false;bounds=null;tx=ty=0;ts=1;card.style.removeProperty('--card-shine');start();}
    card.addEventListener('pointerenter',()=>{bounds=card.getBoundingClientRect();});
    card.addEventListener('pointermove',e=>{
      if(!hover.matches||reduced.matches||e.pointerType==='touch')return;
      bounds ||=card.getBoundingClientRect();active=true;
      tx=Math.max(-.5,Math.min(.5,(e.clientX-bounds.left)/bounds.width-.5));
      ty=Math.max(-.5,Math.min(.5,(e.clientY-bounds.top)/bounds.height-.5));ts=1.15;
      card.style.setProperty('--card-shine','1');start();
    });
    card.addEventListener('pointerleave',reset);card.addEventListener('pointercancel',reset);
    card.addEventListener('click',()=>{
      cancelAnimationFrame(frame);frame=0;last=0;active=false;bounds=null;
      x=y=tx=ty=0;scale=ts=1;card.style.transform='';card.style.removeProperty('--card-shine');
    });
  }
  addEventListener('resize',cancel);reduced.addEventListener('change',cancel);
  window.BullenCardMotion={attach,open,close,cancel};
})();
