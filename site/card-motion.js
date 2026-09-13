/* A framed shared surface morphs between the real tile and the real lightbox. */
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const hover=matchMedia('(hover: hover) and (pointer: fine)');
  let active=null,pickedName=null,shuffleState=null;
  function select(name){
    pickedName=name||null;
    document.querySelectorAll('.gallery-card').forEach(card=>{
      if(card.closest('.card-morph-shell'))return;
      card.classList.toggle('card-picked-up',!!pickedName && card.querySelector('img')?.alt===pickedName);
    });
  }
  function cancel(){
    cancelShuffle();
    if(!active)return;
    const scene=active;active=null;cancelAnimationFrame(scene.frame);
    scene.cleanups.forEach(fn=>fn());scene.shell.remove();
  }
  function hide(scene,el){
    if(!el)return;const old=el.style.visibility;el.style.visibility='hidden';
    scene.cleanups.push(()=>{el.style.visibility=old;});
  }
  function safeClone(el){
    const clone=el.cloneNode(true);clone.removeAttribute('id');clone.classList.remove('card-picked-up');
    clone.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
    clone.inert=true;clone.setAttribute('aria-hidden','true');return clone;
  }
  function smooth(a,b,p){const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);}
  function draw(scene,p){
    scene.progress=p;
    // First clear the compact footer. Only then lift/grow the black panel.
    // The same timeline runs backward, restoring its label only after landing.
    const growth=smooth(.12,1,p);
    if(scene.sourceMatrix){
      const flat=smooth(0,.65,p),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
      scene.shell.style.transform=`matrix3d(${scene.sourceMatrix.map((v,i)=>v+(identity[i]-v)*flat).join(',')})`;
    }
    const lerp=(a,b)=>a+(b-a)*growth,from=scene.from,to=scene.to;
    const width=lerp(from.width,to.width),height=lerp(from.height,to.height);
    Object.assign(scene.shell.style,{left:lerp(from.left,to.left)+'px',top:lerp(from.top,to.top)+'px',width:width+'px',height:height+'px'});
    const detail=smooth(.12,.82,p);
    scene.large.style.transform=`scale(${(width-2)/scene.largeWidth})`;
    scene.small.style.transform=`scale(${(width-2)/scene.smallWidth})`;
    scene.large.style.opacity=detail;
    scene.small.style.opacity=1-detail;
    if(scene.footer)scene.footer.style.opacity=1-smooth(0,.12,p);
    scene.smallBadges.forEach(el=>{el.style.opacity=1-smooth(0,.16,p);});
    if(scene.details)scene.details.style.opacity=smooth(.22,.70,p);
    scene.overlay.style.backgroundColor=`rgba(5,5,5,${.92*p})`;
  }
  function run(scene,destination,duration,done){
    cancelAnimationFrame(scene.frame);
    const start=scene.progress;let started;
    function tick(now){
      if(active!==scene)return;
      started ??= now;const t=Math.min(1,(now-started)/duration);
      // Geometry and typography have deliberate phases on this one reversible clock.
      draw(scene,start+(destination-start)*t);
      if(t<1)scene.frame=requestAnimationFrame(tick);
      else {cancel();done?.();}
    }
    scene.frame=requestAnimationFrame(tick);
  }
  function create(card,overlay,from){
    const content=overlay.querySelector('.gallery-lightbox-content');
    const to=content.getBoundingClientRect();
    const shell=document.createElement('div');shell.className='card-morph-shell';shell.setAttribute('aria-hidden','true');
    const large=safeClone(content),small=safeClone(card);
    const largeWidth=content.clientWidth,smallWidth=card.clientWidth;
    for(const [el,width] of [[large,largeWidth],[small,smallWidth]]){
      el.classList.add('card-morph-layer');
      Object.assign(el.style,{width:width+'px',maxWidth:'none',maxHeight:'none',height:el===large?content.clientHeight+'px':'auto',position:'absolute',left:'0',top:'0',margin:'0',border:'0',overflow:el===large?'hidden':'visible',visibility:'visible',transition:'none',transformOrigin:'0 0',boxShadow:'none',willChange:'transform,opacity'});
      shell.appendChild(el);
    }
    const source=card.querySelector('img'),hero=large.querySelector('img[id]')||large.querySelector('img');
    // The gallery lightbox hero precedes any marketplace icons. Use the decoded
    // source in this temporary representation; never change the real image loader.
    if(hero && source)hero.src=source.currentSrc||source.src;
    shell.style.borderColor=getComputedStyle(content).borderColor;
    document.body.appendChild(shell);
    if(large.querySelector('.gallery-lightbox-body'))large.querySelector('.gallery-lightbox-body').scrollTop=content.querySelector('.gallery-lightbox-body')?.scrollTop||0;
    const scene={shell,small,large,smallWidth,largeWidth,from,to,overlay,content,card,
      footer:small.querySelector('.gallery-card-name'),smallBadges:[...small.querySelectorAll('.gallery-card-badge')],
      details:large.querySelector('.gallery-lightbox-body'),cleanups:[],frame:0,progress:0};
    const background=overlay.style.backgroundColor;scene.cleanups.push(()=>{overlay.style.backgroundColor=background;});
    // Swapping visual representations must not select a new document scroll anchor.
    for(const el of [document.documentElement,document.body]){
      const old=el.style.overflowAnchor;el.style.overflowAnchor='none';
      scene.cleanups.push(()=>{el.style.overflowAnchor=old;});
    }
    hide(scene,content);hide(scene,overlay.querySelector('#lightboxTierParticles'));
    overlay.querySelectorAll('.gallery-lightbox-nav').forEach(e=>hide(scene,e));
    active=scene;return scene;
  }
  function capture(card){
    if(!card)return null;
    const transform=getComputedStyle(card).transform,old=card.style.transform;
    // Measure layout without tilt, then restore before the browser can paint.
    // The floating surface inherits the exact visible matrix at the handoff.
    card.style.transform='none';const rect=card.getBoundingClientRect();card.style.transform=old;
    return {rect,matrix:Array.from(new DOMMatrix(transform==='none'?undefined:transform).toFloat64Array())};
  }
  function open(card,overlay,source){
    cancel();const image=card?.querySelector('img');
    if(reduced.matches||!image?.complete||!image.naturalWidth)return;
    overlay.querySelector('.gallery-lightbox-content').scrollTop=0;
    const scene=create(card,overlay,source.rect);scene.sourceMatrix=source.matrix;draw(scene,0);run(scene,1,350);
  }
  function close(overlay,done){
    cancelShuffle();select(null);
    if(active?.closing)return true;
    if(active?.overlay===overlay){active.closing=true;run(active,0,Math.max(120,300*active.progress),done);return true;}
    const content=overlay.querySelector('.gallery-lightbox-content'),image=overlay.querySelector('#galleryLightboxImgGallery');
    if(reduced.matches||!image||overlay.style.display==='none')return false;
    const card=[...document.querySelectorAll('.gallery-card > img')].find(i=>i.alt===image.alt)?.closest('.gallery-card');
    const from=card?.getBoundingClientRect();
    if(!from || from.top<0 || from.bottom>innerHeight || content.scrollTop>2)return false;
    const scene=create(card,overlay,from);scene.closing=true;draw(scene,1);run(scene,0,300,done);return true;
  }
  function cancelShuffle(){
    if(!shuffleState)return;
    const state=shuffleState;shuffleState=null;
    cancelAnimationFrame(state.frame);state.layers.forEach(el=>el.remove());
    state.content.style.visibility=state.visibility;
    state.particles.forEach(([el,value])=>el.style.visibility=value);
  }
  function shuffle(overlay,dir,render){
    cancel();
    if(reduced.matches){render();return;}
    const content=overlay.querySelector('.gallery-lightbox-content');
    function layer(){
      const rect=content.getBoundingClientRect(),el=safeClone(content);
      Object.assign(el.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',maxHeight:'none',maxWidth:'none',margin:'0',boxSizing:'border-box',pointerEvents:'none',overflow:'hidden',visibility:'visible',transformOrigin:'50% 65%',willChange:'transform,opacity'});
      el.classList.add('card-shuffle-layer');
      const hero=el.querySelector('img'),source=[...document.querySelectorAll('.gallery-card > img')].find(i=>i.alt===hero?.alt);
      if(hero && source?.complete && source.naturalWidth)hero.src=source.currentSrc||source.src;
      document.body.appendChild(el);el.scrollTop=content.scrollTop;
      if(el.querySelector('.gallery-lightbox-body'))el.querySelector('.gallery-lightbox-body').scrollTop=content.querySelector('.gallery-lightbox-body')?.scrollTop||0;
      return el;
    }
    const outgoing=layer();render();const incoming=layer();
    outgoing.style.zIndex=10002;incoming.style.zIndex=10001;
    const visibility=content.style.visibility;content.style.visibility='hidden';
    const particles=[...overlay.querySelectorAll('.lightbox-tier-particles')].map(el=>[el,el.style.visibility]);
    particles.forEach(([el])=>el.style.visibility='hidden');
    const state={content,visibility,particles,layers:[outgoing,incoming],frame:0};shuffleState=state;
    const width=outgoing.getBoundingClientRect().width,travel=width+32;
    let started;
    function drawShuffle(p){
      // Exchange depth only at the far edge, where the faces no longer overlap.
      // Then return the old card underneath the newly revealed card.
      const out=smooth(0,.46,p),back=smooth(.46,1,p),arc=out*(1-back);
      outgoing.style.zIndex=p<.46?10002:10000;
      outgoing.style.transform=`translateX(${-dir*travel*arc}px) translateY(${4*arc}px) rotate(${-dir*2*arc}deg) scale(${1-(3/width)*out})`;
      outgoing.style.opacity=1-smooth(.88,1,p);
      incoming.style.transform=`translateX(${dir*8*(1-out)}px) scale(${1-(3/width)*(1-out)})`;
      incoming.style.opacity=1;
    }
    function tick(now){
      if(shuffleState!==state)return;
      started ??= now;const p=Math.min(1,(now-started)/420);drawShuffle(p);
      if(p<1)state.frame=requestAnimationFrame(tick);else cancelShuffle();
    }
    drawShuffle(0);state.frame=requestAnimationFrame(tick);
  }

  function attach(card) {
    card.classList.toggle('card-picked-up',!!pickedName && card.querySelector('img')?.alt===pickedName);
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
  window.BullenCardMotion={attach,capture,open,close,cancel,select,shuffle};
})();
