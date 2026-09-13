/* A framed shared surface morphs between the real tile and the real lightbox. */
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const hover=matchMedia('(hover: hover) and (pointer: fine)');
  let active=null;
  function cancel(){
    if(!active)return;
    const scene=active;active=null;cancelAnimationFrame(scene.frame);
    scene.cleanups.forEach(fn=>fn());scene.shell.remove();
  }
  function hide(scene,el){
    if(!el)return;const old=el.style.visibility;el.style.visibility='hidden';
    scene.cleanups.push(()=>{el.style.visibility=old;});
  }
  function safeClone(el){
    const clone=el.cloneNode(true);clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
    clone.inert=true;clone.setAttribute('aria-hidden','true');return clone;
  }
  function smooth(a,b,p){const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);}
  function draw(scene,p){
    scene.progress=p;
    const lerp=(a,b)=>a+(b-a)*p,from=scene.from,to=scene.to;
    const width=lerp(from.width,to.width),height=lerp(from.height,to.height);
    Object.assign(scene.shell.style,{left:lerp(from.left,to.left)+'px',top:lerp(from.top,to.top)+'px',width:width+'px',height:height+'px'});
    const detail=smooth(.08,.72,p);
    scene.large.style.transform=`scale(${(width-2)/scene.largeWidth})`;
    scene.small.style.transform=`scale(${(width-2)/scene.smallWidth})`;
    scene.large.style.opacity=detail;
    scene.small.style.opacity=1-detail;
    scene.overlay.style.backgroundColor=`rgba(5,5,5,${.92*p})`;
  }
  function run(scene,destination,duration,done){
    cancelAnimationFrame(scene.frame);
    const start=scene.progress;let started;
    function tick(now){
      if(active!==scene)return;
      started ??= now;const t=Math.min(1,(now-started)/duration);
      // Soft acceleration and a long, controlled landing; every layer shares this clock.
      const ease=t<.5?8*t*t*t*t:1-Math.pow(-2*t+2,4)/2;
      draw(scene,start+(destination-start)*ease);
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
      Object.assign(el.style,{width:width+'px',maxWidth:'none',maxHeight:'none',height:'auto',position:'absolute',left:'0',top:'0',margin:'0',border:'0',overflow:'visible',visibility:'visible',transition:'none',transformOrigin:'0 0',boxShadow:'none',willChange:'transform,opacity'});
      shell.appendChild(el);
    }
    const source=card.querySelector('img'),hero=large.querySelector('img[id]')||large.querySelector('img');
    // The gallery lightbox hero precedes any marketplace icons. Use the decoded
    // source in this temporary representation; never change the real image loader.
    if(hero && source)hero.src=source.currentSrc||source.src;
    shell.style.borderColor=getComputedStyle(content).borderColor;
    document.body.appendChild(shell);
    const scene={shell,small,large,smallWidth,largeWidth,from,to,overlay,content,card,cleanups:[],frame:0,progress:0};
    const background=overlay.style.backgroundColor;scene.cleanups.push(()=>{overlay.style.backgroundColor=background;});
    // Swapping visual representations must not select a new document scroll anchor.
    for(const el of [document.documentElement,document.body]){
      const old=el.style.overflowAnchor;el.style.overflowAnchor='none';
      scene.cleanups.push(()=>{el.style.overflowAnchor=old;});
    }
    hide(scene,card);hide(scene,content);hide(scene,overlay.querySelector('#lightboxTierParticles'));
    overlay.querySelectorAll('.gallery-lightbox-nav').forEach(e=>hide(scene,e));
    active=scene;return scene;
  }
  function open(card,overlay,sourceRect){
    cancel();const image=card?.querySelector('img');
    if(reduced.matches||!image?.complete||!image.naturalWidth)return;
    overlay.querySelector('.gallery-lightbox-content').scrollTop=0;
    const scene=create(card,overlay,sourceRect);draw(scene,0);run(scene,1,560);
  }
  function close(overlay,done){
    if(active?.closing)return true;
    if(active?.overlay===overlay){active.closing=true;run(active,0,Math.max(200,460*active.progress),done);return true;}
    const content=overlay.querySelector('.gallery-lightbox-content'),image=overlay.querySelector('#galleryLightboxImgGallery');
    if(reduced.matches||!image||overlay.style.display==='none')return false;
    const card=[...document.querySelectorAll('.gallery-card > img')].find(i=>i.alt===image.alt)?.closest('.gallery-card');
    const from=card?.getBoundingClientRect();
    if(!from || from.top<0 || from.bottom>innerHeight || content.scrollTop>2)return false;
    const scene=create(card,overlay,from);scene.closing=true;draw(scene,1);run(scene,0,460,done);return true;
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
