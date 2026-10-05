import { useEffect, useRef } from 'react';
import { active, type Dataset } from './model';
import { buffer, context, ease, fit, follow, program, reducedMotion } from './gl';
import { navigate } from './transition';
import { setDock } from './dock';

const BONE=[205,202,192],NIGHT=[10,11,10];
/** The sculpted mask is kept between visits so returning home does not sculpt it again. */
let sculpted:Float32Array|null=null;

const VERTEX=`
attribute vec3 a_pos;attribute vec3 a_nrm;attribute float a_seed;attribute float a_lens;attribute float a_ao;attribute vec3 a_scatter;attribute float a_jit;
uniform vec2 u_res;uniform vec2 u_center;uniform float u_scale;uniform float u_yaw;uniform float u_pitch;uniform vec3 u_light;
uniform float u_assemble;uniform vec2 u_mouse;uniform float u_hover;uniform float u_dpr;uniform float u_time;uniform float u_fly;
varying float v_lens;varying float v_show;
vec3 rot(vec3 p){float cy=cos(u_yaw),sy=sin(u_yaw),cp=cos(u_pitch),sp=sin(u_pitch);float a=p.x*cy+p.z*sy,b=p.z*cy-p.x*sy;return vec3(a,p.y*cp-b*sp,p.y*sp+b*cp);}
void main(){
 float k=1.0-u_assemble;
 vec3 p=a_pos+a_scatter*k*k*1.8;
 p.y+=sin(u_time*.9+a_jit*6.283)*.0035;
 vec3 r=rot(p),n=rot(a_nrm);
 vec2 s=u_center+r.xy*u_scale*(3.5/(3.5-r.z));
 // The stipple parts around the pointer like disturbed dust.
 vec2 d=s-u_mouse;float dist=length(d);
 s+=d/(dist+1.0)*u_hover*20.0*exp(-dist*dist/6000.0);
 float light=max(dot(n,u_light),0.0);
 float tone=a_lens>.5?1.0:clamp(.06+.94*pow(1.0-light,1.7)+a_ao*.8+(1.0-min(1.0,n.z*2.5))*.5,0.0,1.0);
 float show=step(-.05,n.z)*step(a_seed,tone);
 show=max(show,k*step(a_seed,.35));
 vec2 c=s/u_res*2.0-1.0;
 gl_Position=vec4(c.x,-c.y,0.0,1.0);
 gl_PointSize=show>0.0?(a_lens>.5?1.8:1.2)*u_dpr*(1.0+u_fly*u_fly*4.0):0.0;
 v_lens=a_lens;v_show=show;
}`;
const FRAGMENT=`
precision mediump float;uniform vec3 u_ink;uniform vec3 u_red;uniform float u_alpha;uniform float u_glow;varying float v_lens;varying float v_show;
void main(){vec3 c=mix(u_ink,u_red,v_lens*u_glow);float a=u_alpha*(v_lens>.5?.95:.86)*min(1.0,v_show);gl_FragColor=vec4(c*a,a);}`;

/** Home: the clan mask, the entrance to the clan map. It watches the pointer, and a light follows it across the surface.
 * Sections are not offered here; the map is where they are explored, and the Index reaches them directly. */
export function MaskHome({data,ready}:{data:Dataset;ready:boolean}){
 const root=useRef<HTMLElement>(null),glCanvas=useRef<HTMLCanvasElement>(null),lineCanvas=useRef<HTMLCanvasElement>(null);
 const primed=useRef(false),dive=useRef<()=>void>(()=>{});
 const terms=useRef<string[]>([]);
 useEffect(()=>{terms.current=ready?active(data.glossary).map(g=>String(g.name||'').trim()).filter(Boolean).slice(0,7):[];},[data,ready]);
 useEffect(()=>{
  const el=root.current!,gc=glCanvas.current!,lc=lineCanvas.current!,ctx=lc.getContext('2d')!,shell=el.closest('.site-shell') as HTMLElement|null;
  const gl=context(gc);let worker:Worker|null=null,points:ReturnType<typeof buffer>|null=null,shader:ReturnType<typeof program>|null=null;
  const begin=performance.now(),still=reducedMotion();
  let frame=0,last=begin,readyAt=0,width=0,height=0,dpr=1;
  let mx=-9999,my=-9999,inside=false,stir=0,yaw=0,pitch=0,lightX=-.55,lightY=-.5,tilt={x:0,y:0},glow=0,assemble=still?1:0;
  let diving=0,diveStart=0,wheelSum=0,wheelAt=0,flare=0,centerX=0,centerY0=0,scaleNow=0;
  // A star arriving home lands in the mask's left lens, which flares as it takes the light.
  const undock=setDock({
   // Assembly converges on the finished shape, so the lens is a valid target as soon as the points exist.
   point:()=>{if(!points||!scaleNow)return null;const x=-.36,y=.03,z=.68,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),a=x*cy+z*sy,b=z*cy-x*sy,d=y*cp-b*sp,depth=y*sp+b*cp,per=3.5/(3.5-depth),r=el.getBoundingClientRect();
    return {x:r.left+centerX+a*scaleNow*per,y:r.top+centerY0+d*scaleNow*per};},
   land:()=>{flare=1;},
  });
  const upload=(data:Float32Array)=>{if(!gl||!shader)return;points=buffer(gl,data,[['a_pos',3],['a_nrm',3],['a_seed',1],['a_lens',1],['a_ao',1],['a_scatter',3],['a_jit',1]]);readyAt=performance.now();};
  if(gl){
   try{shader=program(gl,VERTEX,FRAGMENT);}catch{shader=null;}
   if(sculpted)upload(sculpted);
   else{worker=new Worker(new URL('./maskWorker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(e:MessageEvent<Float32Array>)=>{sculpted=e.data;upload(e.data);worker?.terminate();worker=null;};
    worker.postMessage(innerWidth<650?40000:110000);}
  }
  const resize=()=>{width=el.clientWidth;height=el.clientHeight;dpr=Math.min(devicePixelRatio||1,2);lc.width=width*dpr;lc.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const pointer=(e:PointerEvent)=>{const b=el.getBoundingClientRect();mx=e.clientX-b.left;my=e.clientY-b.top;inside=true;stir=1;};
  const leave=()=>{inside=false;};
  // Diving through the mask is how the home page hands over to the clan star map.
  dive.current=()=>{if(diving)return;if(still||!gl||!points){navigate('#/clan',{veil:false});return;}diving=1;diveStart=performance.now();};
  const wheel=(e:WheelEvent)=>{e.preventDefault();const now=performance.now();if(now-wheelAt>400)wheelSum=0;wheelAt=now;if(e.deltaY>0)wheelSum+=e.deltaY*(e.deltaMode===1?30:1);if(wheelSum>120&&now-begin>700)dive.current();};
  let touchY:number|null=null;
  const touchStart=(e:TouchEvent)=>{touchY=e.touches[0].clientY;},touchMove=(e:TouchEvent)=>{if(touchY!==null&&touchY-e.touches[0].clientY>70){touchY=null;dive.current();}};
  el.addEventListener('pointermove',pointer);el.addEventListener('pointerleave',leave);el.addEventListener('wheel',wheel,{passive:false});
  el.addEventListener('touchstart',touchStart,{passive:true});el.addEventListener('touchmove',touchMove,{passive:true});
  const key=(e:KeyboardEvent)=>{if(e.target!==el)return;if(['ArrowDown','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();dive.current();}};
  el.addEventListener('keydown',key);
  const diveRequest=(e:Event)=>{e.preventDefault();dive.current();};
  window.addEventListener('mask-dive',diveRequest);
  function draw(now:number){
   frame=requestAnimationFrame(draw);
   const dt=Math.min(.05,(now-last)/1000);last=now;const t=(now-begin)/1000,calm=still;
   const mobile=width<650,cx=width/2,cy=height*.5,base=Math.min(width*(mobile?.25:.115),height*.19);
   // The dive: the camera falls between the lenses while the page darkens, then the star map takes over.
   const fly=diving?Math.min(1,(now-diveStart)/1150):0,flyE=ease(fly);
   // The map takes over before the dive ends, so the mask's points are still rushing past as it opens behind them.
   if(diving===1&&fly>=.8){diving=2;navigate('#/clan',{veil:false,through:true,arrival:'mask'});}
   const night=Math.max(0,Math.min(1,(flyE-.2)/.6));
   el.style.backgroundColor=`rgb(${BONE.map((v,i)=>Math.round(v+(NIGHT[i]-v)*night))})`;
   shell?.classList.toggle('scene-night',night>.5);
   const nx=inside?(mx/width-.5)*2:0,ny=inside?(my/height-.5)*2:0;
   // Look at the pointer, or down at the way in while it is pointed at.
   const lookX=primed.current?0:nx*.5,lookY=primed.current?-.3:-ny*.32;
   const idle=calm||still?0:Math.sin(t*.4)*.06;
   yaw=follow(yaw,(diving?0:lookX)+idle-.04,diving?6:3.2,dt);pitch=follow(pitch,(diving?0:lookY)+.04,diving?6:3.2,dt);
   // The light sits where the pointer is, so moving it sweeps the shading over the mask.
   lightX=follow(lightX,inside?nx*1.15:-.55,4,dt);lightY=follow(lightY,inside?ny*1.15:-.5,4,dt);
   tilt.x=follow(tilt.x,still?0:-ny*.2,3,dt);tilt.y=follow(tilt.y,still?0:nx*.26,3,dt);
   glow=follow(glow,primed.current?.85:inside?.18:0,5,dt);flare=Math.max(0,flare-dt*.9);stir=follow(stir,0,1.6,dt);
   if(readyAt&&!still)assemble=Math.min(1,(now-readyAt)/1700);
   const zoom=1+flyE*flyE*16,scale=base*zoom,focusY=.06,centerY=cy+focusY*base*(1-zoom);centerX=cx;centerY0=centerY;scaleNow=scale;
   const intro=still?1:Math.min(1,t/1.6),retract=1-ease(Math.min(1,fly*1.8));
   if(gl&&shader&&points){
    fit(gl,gc);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(shader.p);points.bind(shader.p);const u=shader.u;
    const ink=[18+night*212,20+night*206,17+night*196].map(v=>v/255),len=Math.hypot(lightX,lightY,.8);
    gl.uniform2f(u('u_res'),width,height);gl.uniform2f(u('u_center'),cx,centerY);gl.uniform1f(u('u_scale'),scale);
    gl.uniform1f(u('u_yaw'),yaw);gl.uniform1f(u('u_pitch'),pitch);gl.uniform3f(u('u_light'),lightX/len,lightY/len,.8/len);
    gl.uniform1f(u('u_assemble'),ease(assemble));gl.uniform2f(u('u_mouse'),mx,my);gl.uniform1f(u('u_hover'),still?0:Math.min(1,stir*1.5)*(inside?1:0));
    gl.uniform1f(u('u_dpr'),dpr);gl.uniform1f(u('u_time'),calm||still?0:t);gl.uniform1f(u('u_fly'),flyE);
    gl.uniform3f(u('u_ink'),ink[0],ink[1],ink[2]);gl.uniform3f(u('u_red'),.68,.16,.1);gl.uniform1f(u('u_alpha'),Math.min(1,assemble*3)*(1-Math.max(0,(flyE-.88)/.12)));gl.uniform1f(u('u_glow'),Math.max(glow,flare));
    gl.drawArrays(gl.POINTS,0,points.count);
   }
   // Glossary terms ride a tilted ring that leans with the pointer, so the mask sits in depth.
   ctx.clearRect(0,0,width,height);
   const rx=width*(mobile?.36:.34),ry=height*(mobile?.29:.32),ct=Math.cos(tilt.x),st=Math.sin(tilt.x),cyw=Math.cos(tilt.y),syw=Math.sin(tilt.y);
   const project=(a:number,r:number)=>{const x=Math.cos(a)*rx*r,y=Math.sin(a)*ry*r,x1=x*cyw,z1=-x*syw,y1=y*ct-z1*st,z2=y*st+z1*ct,p=1400/(1400-z2);return {x:cx+x1*p,y:cy+y1*p,p};};
   const halo=(x:number,y:number)=>{const ox=x-cx,oy=y-cy,k=Math.min(.9,1/Math.hypot(ox/(base*1.12),oy/(base*1.3)));return {x:cx+ox*k,y:cy+oy*k};};
   if(terms.current.length&&!mobile){
    const tf=Math.max(0,Math.min(1,(t-1.1)/.8))*retract*(1-night);
    ctx.font='9px "IBM Plex Mono",ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    terms.current.forEach((term,i)=>{const a=(i+.5)/terms.current.length*Math.PI*2-1.75,p=project(a,.74),s=halo(p.x,p.y);
     ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x+(p.x-s.x)*.86,s.y+(p.y-s.y)*.86);ctx.strokeStyle=`rgba(30,31,27,${.12*tf})`;ctx.lineWidth=.5;ctx.stroke();
     ctx.fillStyle=`rgba(30,31,27,${.38*tf})`;ctx.fillText(term.toUpperCase(),p.x,p.y);});
   }
   el.style.setProperty('--intro',intro.toFixed(3));el.style.setProperty('--leave',(1-retract).toFixed(3));
  }
  frame=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(frame);undock();worker?.terminate();observer.disconnect();shell?.classList.remove('scene-night');
   el.removeEventListener('pointermove',pointer);el.removeEventListener('pointerleave',leave);el.removeEventListener('wheel',wheel);
   el.removeEventListener('touchstart',touchStart);el.removeEventListener('touchmove',touchMove);el.removeEventListener('keydown',key);window.removeEventListener('mask-dive',diveRequest);
   // The context belongs to the canvas, which a remount reuses, so release only what this mount created.
   if(gl){if(points)gl.deleteBuffer(points.buffer);if(shader)gl.deleteProgram(shader.p);}};
 },[]);
 return <section ref={root} className="mask-home" tabIndex={0} aria-label="Tjau’ke clan mask. Scroll down or choose Enter the clan to open the clan map." onClick={e=>{
   // A click on the mask itself dives into the clan.
   if((e.target as HTMLElement).closest('a,button'))return;const b=e.currentTarget.getBoundingClientRect(),x=e.clientX-b.left-b.width/2,y=e.clientY-b.top-b.height/2;
   if(Math.abs(x)<b.width*.1&&Math.abs(y)<b.height*.2)dive.current();}}>
  <canvas ref={lineCanvas} className="mask-lines" aria-hidden="true"/>
  <canvas ref={glCanvas} className="mask-points" aria-hidden="true"/>
  <h1 className="sr-only">Tjau’ke clan archive</h1>
  {/* Pointing at the way in turns the mask towards it and lights the lenses. */}
  <button type="button" className="mask-enter" onClick={()=>dive.current()} onMouseEnter={()=>{primed.current=true;}} onMouseLeave={()=>{primed.current=false;}} onFocus={()=>{primed.current=true;}} onBlur={()=>{primed.current=false;}}><span>Enter the clan</span><small>or scroll</small></button>
  <div className="scene-bottom"><span>YAUTJA CLAN · CMU</span></div>
 </section>;
}
