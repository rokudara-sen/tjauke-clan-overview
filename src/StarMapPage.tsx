import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { active, hallTrophies, type Dataset, type Kind } from './model';
import { href } from './Visuals';
import { buffer, context, fit, follow, programs, reducedMotion, type Program } from './gl';
import { starMap } from './starMap';
import { handedOver, navigate, takeArrival } from './transition';
import { Cosmos, type CosmosCamera } from './Cosmos';
import { setDock } from './dock';

const sections: {route:string;name:string;kind?:Kind}[] = [
 {route:'overview',name:'Overview'},{route:'members',name:'Hunters',kind:'members'},{route:'houses',name:'Households',kind:'houses'},
 {route:'hunts',name:'Undertakings',kind:'hunts'},{route:'trophies',name:'Trophy hall',kind:'trophies'},{route:'chronicle',name:'History',kind:'chronicle'},
 {route:'library',name:'Documents',kind:'library'},{route:'glossary',name:'Glossary',kind:'glossary'},{route:'politics',name:'Politics',kind:'clans'},
 {route:'duties',name:'Duties',kind:'duties'},{route:'forum',name:'Forum'},
];
const PROJECT=`
uniform float u_yaw;uniform float u_pitch;uniform float u_dist;uniform float u_focal;uniform vec2 u_center;uniform vec2 u_res;uniform float u_squeeze;uniform vec3 u_focus;
vec3 rot(vec3 p){p-=u_focus;float cy=cos(u_yaw),sy=sin(u_yaw),cp=cos(u_pitch),sp=sin(u_pitch);float a=p.x*cy+p.z*sy,b=p.z*cy-p.x*sy;return vec3(a,p.y*cp-b*sp,p.y*sp+b*cp);}
vec2 screen(vec3 r,float depth){return u_center+vec2(r.x*u_squeeze,r.y)*u_focal/depth;}
vec4 clip(vec2 s){vec2 c=s/u_res*2.0-1.0;return vec4(c.x,-c.y,0.0,1.0);}`;
const STAR_V=`
attribute vec3 a_pos;attribute float a_size;attribute float a_seed;attribute float a_named;attribute float a_index;
uniform float u_active;uniform float u_hidden;uniform vec2 u_mouse;uniform float u_time;uniform float u_dpr;uniform float u_alpha;
varying float v_alpha;varying float v_named;varying float v_temp;${PROJECT}
void main(){
 vec3 r=rot(a_pos);float depth=u_dist-r.z;v_named=a_named;v_temp=fract(a_seed*7.13);
 if(depth<.12||abs(a_index-u_hidden)<.5){gl_Position=vec4(2.0);gl_PointSize=0.0;return;}
 vec2 s=screen(r,depth);float near=3.6/depth;vec2 d=s-u_mouse;
 // The pointer carries a light: stars near it swell and brighten.
 float lit=exp(-dot(d,d)/24000.0);
 float twinkle=1.0;
 float on=step(abs(a_index-u_active),.5);
 gl_Position=clip(s);
 // The sprite is larger than the star so its halo (and, for sections, its spikes) has room.
 gl_PointSize=a_size*min(2.4,near)*(1.0+lit*.9+on*.8)*u_dpr*mix(2.6,5.5,a_named);
 v_alpha=u_alpha*clamp(mix(clamp(near*.7,.16,.95)*twinkle,1.0,a_named)+lit*.45,0.0,1.0);
}`;
/** A star: a hot core, a soft halo, and for sections a pair of diffraction spikes. Colour runs from blue-white to warm. */
const STAR_F=`precision mediump float;varying float v_alpha;varying float v_named;varying float v_temp;
void main(){vec2 p=gl_PointCoord-.5;float d=length(p)*2.0;
 float core=smoothstep(mix(.4,.17,v_named),0.0,d);
 float halo=exp(-d*d*mix(10.0,16.0,v_named))*mix(.35,.6,v_named);
 float spike=v_named*(exp(-abs(p.x)*70.0)+exp(-abs(p.y)*70.0))*(1.0-smoothstep(.2,1.0,d))*.55;
 float a=clamp(core+halo+spike,0.0,1.0)*v_alpha;
 vec3 col=mix(mix(vec3(.8,.86,1.0),vec3(1.0,.97,.92),smoothstep(0.0,.5,v_temp)),vec3(1.0,.88,.74),smoothstep(.5,1.0,v_temp));
 col=mix(col,vec3(1.0),core*.7);gl_FragColor=vec4(col*a,a);}`;
const EDGE_V=`
attribute vec3 a_pos;attribute vec2 a_ends;attribute float a_named;
uniform float u_active;uniform vec2 u_mouse;uniform float u_alpha;
varying float v_alpha;${PROJECT}
void main(){
 vec3 r=rot(a_pos);float depth=max(.12,u_dist-r.z);vec2 s=screen(r,depth);vec2 d=s-u_mouse;
 float on=max(step(abs(a_ends.x-u_active),.5),step(abs(a_ends.y-u_active),.5));
 float base=mix(.06,.13,a_named)*clamp(3.2/depth,.4,1.3);
 gl_Position=clip(s);
 v_alpha=u_alpha*max(mix(base,.72,on),base+exp(-dot(d,d)/30000.0)*.22)*step(.15,u_dist-r.z);
}`;
const EDGE_F=`precision mediump float;varying float v_alpha;void main(){gl_FragColor=vec4(vec3(.9,.886,.835)*v_alpha,v_alpha);}`;

type Box={x:number;y:number;w:number;h:number};
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
/** Where a label may sit around its star, as the offset of its top-left corner: right, left, then above and below on either side. */
const SLOTS=6;
const slotOffset=(slot:number,w:number,h:number):[number,number]=>[slot%2?-w:0,[-h/2,-h/2,-h,-h,0,0][slot]];
/** Clan: a 3D star map. Each section is a named star; small unlinked stars cluster around it by record count. */
export function StarMapPage({data,ready}:{data:Dataset;ready:boolean}){
 const root=useRef<HTMLElement>(null),glCanvas=useRef<HTMLCanvasElement>(null),overlay=useRef<HTMLCanvasElement>(null),links=useRef<(HTMLAnchorElement|null)[]>([]);
 const hovered=useRef<number|null>(null),fly=useRef<(i:number)=>void>(()=>{}),camera=useRef<CosmosCamera>({yaw:0,pitch:0,travel:0});
 const [lit,setLit]=useState<number|null>(null),[flat,setFlat]=useState(false);
 // The hand-over is read once per visit. A data refresh rebuilds the map but keeps the view where it was.
 const [arrival]=useState(takeArrival),view=useRef<{yaw:number;pitch:number;dist:number;goalDist:number;alpha:number;returning:number}|null>(null);
 const counts=sections.map(s=>!ready||!s.kind?0:s.route==='trophies'?hallTrophies(data).length:active(data[s.kind]).length);
 const countKey=counts.join(',');
 useEffect(()=>{
  // Arriving through the mask, the map is built once the dive's hand-over is moving, so building it cannot freeze the dive.
  let stop:void|(()=>void),gone=false;const build=()=>{if(!gone)stop=setup();};
  if(arrival==='mask')void handedOver().then(build);else build();
  return()=>{gone=true;stop?.();};
  function setup(){
  const el=root.current!,gc=glCanvas.current!,oc=overlay.current!,octx=oc.getContext('2d')!,gl=context(gc);
  // Without WebGL the sections are still listed, as plain links.
  if(!gl){setFlat(true);return;}
  const map=starMap(countKey.split(',').map(Number)),{stars,edges,linkStars}=map;
  let starShader:Program,edgeShader:Program;
  try{[starShader,edgeShader]=programs(gl,[[STAR_V,STAR_F],[EDGE_V,EDGE_F]]);}catch{setFlat(true);return;}
  const starData=new Float32Array(stars.length*7);
  stars.forEach((s,i)=>starData.set([s.x,s.y,s.z,s.size*(s.link!==null?1.25:1),Math.sin(i*12.9898)*.5+.5,s.link!==null?1:0,i],i*7));
  const edgeData=new Float32Array(edges.length*12);
  edges.forEach(([a,b],i)=>{const A=stars[a],B=stars[b],named=A.link!==null||B.link!==null?1:0;edgeData.set([A.x,A.y,A.z,a,b,named,B.x,B.y,B.z,a,b,named],i*12);});
  const starBuf=buffer(gl,starData,[['a_pos',3],['a_size',1],['a_seed',1],['a_named',1],['a_index',1]]),edgeBuf=buffer(gl,edgeData,[['a_pos',3],['a_ends',2],['a_named',1]]);
  const still=reducedMotion(),begin=performance.now(),kept=view.current;
  let frame=0,last=begin,width=0,height=0,dpr=1,mx=-9999,my=-9999,inside=false;
  // Camera: orbit angles with drag inertia and a distance the wheel travels along. A chosen star leaves the map and falls.
  // A star coming home finds the map already settled, so its slot holds still while it drops in.
  const homecoming=arrival?.startsWith('return:')?sections.findIndex(s=>s.route===arrival.slice(7)):-1;
  let yaw=kept?.yaw??.5,pitch=kept?.pitch??.18,vy=0,vp=0,dist=kept?.dist??(still||homecoming>=0?2.9:3.3),goalDist=kept?.goalDist??2.9,alpha=kept?.alpha??(homecoming>=0?.85:0),px=0,py=0;
  let drag:{x:number;y:number}|null=null,moved=0,active=-1,chosen=-1,returning=kept?kept.returning:homecoming,pulse=-1,fall=0,screens:{x:number;y:number;depth:number}[]=[];const focus=[0,0,0];
  // Each label's measured size, chosen side of its star and eased offset; sizes are measured again after a resize.
  const spots=sections.map(()=>({w:0,rest:0,h:0,slot:0,ox:0,oy:0,shown:0,fresh:true}));
  const resize=()=>{width=el.clientWidth;height=el.clientHeight;dpr=Math.min(devicePixelRatio||1,2);oc.width=width*dpr;oc.height=height*dpr;octx.setTransform(dpr,0,0,dpr,0,0);spots.forEach(s=>{s.w=0;});};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const pointer=(e:PointerEvent)=>{const b=el.getBoundingClientRect();mx=e.clientX-b.left;my=e.clientY-b.top;inside=true;
   if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};moved+=Math.abs(dx)+Math.abs(dy);yaw+=dx*.003;pitch=Math.max(-1,Math.min(1,pitch+dy*.002));vy=Math.max(-.6,Math.min(.6,dx*.18));vp=Math.max(-.4,Math.min(.4,dy*.12));}};
  const down=(e:PointerEvent)=>{if((e.target as HTMLElement).closest('a,button')||e.button!==0)return;drag={x:e.clientX,y:e.clientY};moved=0;el.setPointerCapture(e.pointerId);el.classList.add('is-dragging');};
  const up=()=>{drag=null;el.classList.remove('is-dragging');};
  const leave=()=>{inside=false;};
  // The scroll that dived through the mask is still coasting when the map opens; it must not also travel the map.
  const wheel=(e:WheelEvent)=>{e.preventDefault();if(chosen>=0||(arrival==='mask'&&performance.now()-begin<900))return;goalDist=Math.max(2.1,Math.min(4.4,goalDist+e.deltaY*(e.deltaMode===1?.025:.0014)));};
  el.addEventListener('pointermove',pointer);el.addEventListener('pointerdown',down);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('pointerleave',leave);el.addEventListener('wheel',wheel,{passive:false});
  // Choosing a section flies the camera into its star before the page opens.
  // Choosing a section detaches its star; the effects layer carries it down while the map tips up after it.
  let pulseIndex=-1;
  const undock=setDock({
   point:()=>{if(returning<0)return null;const p=screens[returning];if(!p||p.depth<.2)return null;const b=el.getBoundingClientRect();return {x:b.left+p.x,y:b.top+p.y};},
   land:()=>{pulseIndex=returning;returning=-1;pulse=performance.now();},
  });
  fly.current=(i:number)=>{if(chosen>=0)return;const p=screens[i],b=el.getBoundingClientRect();chosen=i;
   navigate(href(sections[i].route),{from:p?{x:b.left+p.x,y:b.top+p.y}:null,star:true,onFall:k=>{fall=k;}});};
  function draw(now:number){
   frame=requestAnimationFrame(draw);
   const dt=Math.min(.05,(now-last)/1000);last=now;const t=(now-begin)/1000,calm=still;
   const nx=inside?(mx/width-.5)*2:0,ny=inside?(my/height-.5)*2:0;
   if(!drag){yaw+=vy*dt;pitch=Math.max(-1,Math.min(1,pitch+vp*dt));vy*=Math.pow(.0001,dt);vp*=Math.pow(.0001,dt);if(!calm&&chosen<0)yaw+=dt*.012;}
   px=follow(px,calm?0:nx*.04,2.5,dt);py=follow(py,calm?0:ny*.025,2.5,dt);
   dist=follow(dist,goalDist,arrival==='mask'&&t<2?1.6:2.6,dt);
   alpha=follow(alpha,1,arrival==='mask'?1.4:3,dt);
   const yawNow=yaw+px,pitchNow=pitch+py-fall*fall*.5;
   // Open space turns with the map, and zooming flies the viewer through it (the dive from home arrives at speed).
   camera.current={yaw:yawNow,pitch:pitchNow,travel:(2.9-dist)*2};
   fit(gl!,gc);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);gl!.enable(gl!.BLEND);gl!.blendFunc(gl!.ONE,gl!.ONE_MINUS_SRC_ALPHA);
   // The section star nearest the pointer lights up, so the light follows the pointer across the map.
   screens=linkStars.map(si=>{const s=stars[si];const cy=Math.cos(yawNow),sy=Math.sin(yawNow),cp=Math.cos(pitchNow),sp=Math.sin(pitchNow),x=s.x-focus[0],y=s.y-focus[1],z=s.z-focus[2],a=x*cy+z*sy,b=z*cy-x*sy,d=y*cp-b*sp,zz=y*sp+b*cp,depth=dist-zz;
    const focal=Math.min(width,height)*(width<650?.78:.66),squeeze=width<height?.6:1;return {x:width/2+a*squeeze*focal/depth,y:height/2+d*focal/depth,depth};});
   let nearest=-1,best=170;
   if(inside&&!drag)screens.forEach((p,i)=>{if(p.depth<.2)return;const d=Math.hypot(p.x-mx,p.y-my);if(d<best){best=d;nearest=i;}});
   const pick=chosen>=0?chosen:hovered.current!==null?hovered.current:nearest;
   if(pick!==active){active=pick;setLit(pick<0?null:pick);}
   for(const [shader,buf,mode,count] of [[edgeShader,edgeBuf,gl!.LINES,edges.length*2],[starShader,starBuf,gl!.POINTS,stars.length]] as const){
    gl!.useProgram(shader.p);buf.bind(shader.p);const u=shader.u;
    gl!.uniform1f(u('u_yaw'),yawNow);gl!.uniform1f(u('u_pitch'),pitchNow);gl!.uniform1f(u('u_dist'),dist);gl!.uniform1f(u('u_focal'),Math.min(width,height)*(width<650?.78:.66));
    gl!.uniform2f(u('u_center'),width/2,height/2);gl!.uniform2f(u('u_res'),width,height);gl!.uniform1f(u('u_squeeze'),width<height?.6:1);gl!.uniform3f(u('u_focus'),focus[0],focus[1],focus[2]);
    gl!.uniform1f(u('u_active'),active<0?-9:linkStars[active]);gl!.uniform1f(u('u_hidden'),chosen>=0?linkStars[chosen]:returning>=0?linkStars[returning]:-9);gl!.uniform2f(u('u_mouse'),inside?mx:-9999,inside?my:-9999);gl!.uniform1f(u('u_alpha'),alpha);
    gl!.uniform1f(u('u_time'),calm?0:t);gl!.uniform1f(u('u_dpr'),dpr);
    gl!.drawArrays(mode,0,count);
   }
   // Overlay: a ring on the lit star and a faint tether from the pointer, like a sight finding its mark.
   octx.clearRect(0,0,width,height);
   // The slot rings out as its star docks again.
   if(pulse>=0){const k=Math.max(0,(performance.now()-pulse)/700),p=screens[pulseIndex];if(k>=1||!p)pulse=-1;else{octx.beginPath();octx.arc(p.x,p.y,8+k*46,0,Math.PI*2);octx.strokeStyle=`rgba(255,240,220,${(1-k)*.8})`;octx.lineWidth=1.2*(1-k)+.3;octx.stroke();}}
   if(active>=0&&screens[active].depth>.2){const p=screens[active],pulse=calm?0:Math.sin(t*4)*1.5;
    octx.beginPath();octx.arc(p.x,p.y,10+pulse,0,Math.PI*2);octx.strokeStyle=`rgba(230,226,213,${.85*alpha})`;octx.lineWidth=.8;octx.stroke();
    octx.strokeRect(p.x+16,p.y+10,7,7);
    if(inside&&hovered.current===null&&!drag){octx.beginPath();octx.setLineDash([2,4]);octx.moveTo(mx,my);octx.lineTo(p.x,p.y);octx.strokeStyle=`rgba(194,65,47,${.6*alpha})`;octx.stroke();octx.setLineDash([]);}}
   // Labels never overlap. The lit star is placed first, then nearer stars before farther ones; each label keeps its
   // side of the star while it fits, otherwise tries the others, and a label with no free room fades out until its
   // star comes forward or is lit.
   const taken:Box[]=[],order=screens.map((_,i)=>i).sort((a,b)=>Number(b===active)-Number(a===active)||screens[a].depth-screens[b].depth);
   for(const i of order){
    const p=screens[i],link=links.current[i],spot=spots[i];if(!link)continue;
    if(i===chosen||p.depth<.2||p.x<-120||p.x>width+120||p.y<-60||p.y>height+60){link.style.visibility='hidden';spot.shown=0;spot.fresh=true;continue;}
    const near=3.6/p.depth,grow=Math.max(.7,Math.min(width<650?1.4:2.1,near*(width<650?.8:1.05)));
    if(!spot.w){const label=link.firstElementChild as HTMLElement|null;spot.w=link.offsetWidth;spot.rest=(label?.offsetWidth||spot.w)+22;spot.h=link.offsetHeight;}
    const w=(i===active?spot.w:spot.rest)*grow,h=spot.h*grow;
    const fits=(slot:number)=>{const [ox,oy]=slotOffset(slot,w,h),box={x:p.x+ox,y:p.y+oy,w,h};return box.x>=4&&box.x+box.w<=width-4&&!taken.some(t=>overlaps(t,box))?box:null;};
    let slot=spot.slot,box=fits(slot);
    for(let k=0;!box&&k<SLOTS;k++)if(k!==spot.slot&&(box=fits(k)))slot=k;
    // The lit label always shows, on its usual side if nothing else is free.
    if(!box&&i===active){slot=spot.slot;const [ox,oy]=slotOffset(slot,w,h);box={x:p.x+ox,y:p.y+oy,w,h};}
    if(box){taken.push(box);spot.slot=slot;}
    const [tx,ty]=slotOffset(spot.slot,w,h);
    if(spot.fresh||still){spot.ox=tx;spot.oy=ty;spot.fresh=false;}else{spot.ox=follow(spot.ox,tx,9,dt);spot.oy=follow(spot.oy,ty,9,dt);}
    spot.shown=still?Number(!!box):follow(spot.shown,box?1:0,box?6:10,dt);
    // A crowded label only fades, so it stays in the tab order; focusing it lights its star, which places it first.
    link.style.visibility='visible';link.style.pointerEvents=spot.shown<.5?'none':'';link.style.opacity=String(alpha*spot.shown*Math.max(.35,Math.min(1,near*.8)));
    link.style.transform=`translate3d(${(p.x+spot.ox).toFixed(1)}px,${(p.y+spot.oy).toFixed(1)}px,0) scale(${grow.toFixed(3)})`;
   }
  }
  frame=requestAnimationFrame(draw);
  return()=>{view.current={yaw,pitch,dist,goalDist,alpha,returning};cancelAnimationFrame(frame);undock();observer.disconnect();el.removeEventListener('pointermove',pointer);el.removeEventListener('pointerdown',down);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.removeEventListener('pointerleave',leave);el.removeEventListener('wheel',wheel);gl.deleteBuffer(starBuf.buffer);gl.deleteBuffer(edgeBuf.buffer);gl.deleteProgram(starShader.p);gl.deleteProgram(edgeShader.p);};
  }
 },[countKey,arrival]);
 const choose=(i:number)=>(e:MouseEvent)=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();fly.current(i);};
 const hover=(i:number|null)=>{hovered.current=i;};
 // A returning star finds the map already there; only arrivals from elsewhere fade it in.
 return <section ref={root} className={`star-map${flat?' is-flat':''}${arrival?.startsWith('return:')?' is-homecoming':''}`} aria-label="Clan star map. Drag to orbit, scroll to travel, choose a star to open its section.">
  <Cosmos camera={camera} intensity={.7} defer={arrival==='mask'}/><canvas ref={glCanvas} className="star-canvas" aria-hidden="true"/><canvas ref={overlay} className="star-overlay" aria-hidden="true"/>
  <h1 className="sr-only">Clan map</h1>
  <nav className="star-destinations" aria-label="Clan sections">{sections.map((s,i)=><a key={s.route} ref={el=>{links.current[i]=el;}} href={href(s.route)} data-instant onClick={choose(i)} onMouseEnter={()=>hover(i)} onMouseLeave={()=>hover(null)} onFocus={()=>hover(i)} onBlur={()=>hover(null)} className={lit===i?'is-lit':undefined}><span>{s.name}</span>{ready&&s.kind&&<small>{counts[i]} published</small>}</a>)}</nav>
  <div className="star-portals"><a href={href('dashboard')}>‹ Home</a></div>
  <div className="star-strip" aria-hidden="true">{sections.map((s,i)=><button type="button" tabIndex={-1} key={s.route} className={lit===i?'is-lit':undefined} onMouseEnter={()=>hover(i)} onMouseLeave={()=>hover(null)} onClick={()=>fly.current(i)}>{s.name}</button>)}</div>
  <div className="scene-bottom"><span>{lit===null?<>Explore the clan · Drag to orbit<span className="map-travel">, scroll to travel</span></>:`${sections[lit].name}${ready&&sections[lit].kind?` · ${counts[lit]} published`:''}`}</span></div>
 </section>;
}
