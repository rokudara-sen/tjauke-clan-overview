import { reducedMotion } from './gl';
import { getDock } from './dock';

/**
 * Full-screen effects layer. It runs a frame loop only while an effect plays.
 *
 * The star is the section. Opening a page, its star falls under gravity, aimed to strike the floor directly
 * below the place it will rest; the blast opens the new page, and the star bounces in one solved arc into the
 * page's dock (the breadcrumb star). Returning to the clan map, the star lifts away as the page sinks, then
 * drops back into its own slot on the map. Nothing vanishes mid-air: shards leave the screen or fade out,
 * and a star with nowhere to go shrinks away deliberately.
 */
type Point={x:number;y:number};
type Bit={x:number;y:number;vx:number;vy:number;size:number;spin:number;angle:number;red:boolean;fade:number;alpha:number};
type Effect=(dt:number,ctx:CanvasRenderingContext2D,w:number,h:number)=>boolean;
let canvas:HTMLCanvasElement|null=null,ctx:CanvasRenderingContext2D|null=null,frame=0,effects:Effect[]=[],last=0;
/** One gravity for the star and every shard, in pixels per second squared. */
const G=3000;

function layer(){
 if(!canvas){canvas=document.createElement('canvas');canvas.className='fx-layer';canvas.setAttribute('aria-hidden','true');document.body.appendChild(canvas);ctx=canvas.getContext('2d');}
 const dpr=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx!.setTransform(dpr,0,0,dpr,0,0);return {ctx:ctx!,w,h};
}
function run(effect:Effect){
 effects.push(effect);if(frame)return;
 const tick=(now:number)=>{
  const {ctx,w,h}=layer(),dt=Math.min(.033,(now-last)/1000);last=now;ctx.clearRect(0,0,w,h);
  // One failing effect must not stop the loop (and strand a star mid-air), so each runs on its own.
  effects=effects.filter(e=>{try{return e(dt,ctx,w,h);}catch(err){console.error(err);busy=false;opening=false;return false;}});
  frame=effects.length?requestAnimationFrame(tick):0;if(!frame)ctx.clearRect(0,0,w,h);
 };
 last=performance.now();frame=requestAnimationFrame(tick);
}
const easeIn=(t:number)=>t*t*t,easeOut=(t:number)=>1-(1-t)**3,clamp=(v:number)=>Math.max(0,Math.min(1,v));
const TONES={night:'10,11,10',bone:'205,202,192'};
let busy=false,opening=false;
/** True while a star is travelling; the arriving page keeps its dock unlit until the star lands. */
export const travelling=()=>busy;

function drawStar(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,a=1){
 if(a<=0||r<=0)return;
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(const [k,al] of [[6,.05],[3.2,.13],[1.8,.32]] as const){ctx.fillStyle=`rgba(255,226,190,${al*a})`;ctx.beginPath();ctx.arc(x,y,r*k,0,Math.PI*2);ctx.fill();}
 ctx.fillStyle=`rgba(255,252,244,${a})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=`rgba(255,240,220,${.45*a})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-r*6,y);ctx.lineTo(x+r*6,y);ctx.moveTo(x,y-r*6);ctx.lineTo(x,y+r*6);ctx.stroke();
 ctx.restore();
}
function trail(ctx:CanvasRenderingContext2D,points:Point[],width:number){
 for(let i=1;i<points.length;i++){const a=i/points.length;ctx.strokeStyle=`rgba(255,238,214,${a*.7})`;ctx.lineWidth=a*width;ctx.beginPath();ctx.moveTo(points[i-1].x,points[i-1].y);ctx.lineTo(points[i].x,points[i].y);ctx.stroke();}
}
/** Shards fly under the star's gravity and leave through the edges of the screen; sparks fade out smoothly. */
function stepBits(bits:Bit[],dt:number,ctx:CanvasRenderingContext2D,w:number,h:number){
 for(let i=bits.length-1;i>=0;i--){const b=bits[i];
  b.vy+=G*dt*(b.fade?.12:1);b.vx*=Math.pow(b.fade?.15:.75,dt);b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.spin*dt;b.alpha-=b.fade*dt;
  if(b.alpha<=0||b.y>h+30||b.x<-30||b.x>w+30){bits.splice(i,1);continue;}
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.fillStyle=b.red?`rgba(226,64,43,${b.alpha})`:`rgba(255,240,220,${b.alpha})`;
  if(b.fade)ctx.fillRect(-b.size/2,-b.size/2,b.size,b.size);else{ctx.beginPath();ctx.moveTo(0,-b.size);ctx.lineTo(b.size*.8,b.size*.6);ctx.lineTo(-b.size*.7,b.size*.5);ctx.fill();}
  ctx.restore();}
}
const spark=(x:number,y:number,speed:number,fade=1.4+Math.random()):Bit=>{const a=Math.random()*Math.PI*2,s=speed*(.3+Math.random()*.7);return {x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,size:1+Math.random()*1.6,spin:0,angle:0,red:Math.random()<.3,fade,alpha:1};};
const moving=()=>[...document.querySelectorAll<HTMLElement>('.site-shell>.layout,.site-shell>.topbar')];
/** Where an inner page's breadcrumb star will sit, known before that page exists, so the fall can be aimed at it. */
function predictDock(w:number){const content=Math.min(w,1480),side=w<700?20:w*.06;return {x:(w-content)/2+side+3,y:w<700?150:134};}
/** The longest flight time (seconds) for a ballistic hop from a to b whose apex stays on screen. */
function hop(a:Point,b:Point){for(let T=.8;T>=.4;T-=.04){const vy=(b.y-a.y-G*T*T/2)/T;if(a.y-(vy<0?vy*vy/(2*G):0)>=30)return T;}return .4;}

/** Opens a page: the star falls from `from`, shatters on the floor, opens the page and bounces into its dock. */
export function shatter(from:Point,swap:()=>void,{tone='night',onFall,size=1}:{tone?:'night'|'bone';onFall?:(progress:number)=>void;size?:number}={}){
 // While a star is still settling, a new choice opens straight away; only a page that is not yet open holds others back.
 if(busy){if(!opening)swap();return;}
 if(reducedMotion()){swap();return;}
 busy=true;opening=true;
 const w=innerWidth,h=innerHeight,floor=h-22,aim=predictDock(w),cover=TONES[tone],lifted=moving();
 // A small kick up as the star comes loose, then gravity.
 let vy=-260,T=(-vy+Math.sqrt(vy*vy+2*G*Math.max(0,floor-from.y)))/G;
 if(T<.55){T=.55;vy=(floor-from.y-G*T*T/2)/T;}
 // It falls mostly straight down, leaning a third of the way towards its dock; the bounce carries it the rest.
 const strike=from.x+(aim.x-from.x)*.35,star={x:from.x,y:from.y,vx:(strike-from.x)/T,vy,r:2.2*size};
 const bits:Bit[]=[],path:Point[]=[];
 // `clock` times the current phase; `elapsed` runs from the start and times the reveal.
 let phase:'fall'|'struck'|'hop'|'settle'|'gone'='fall',clock=0,elapsed=0,impact=0,reveal=-1,landed=false,fallback=false;
 let target:Point={x:0,y:0},flight={x:0,y:0,vx:0,vy:0,T:1,aimed:{x:0,y:0}};
 const dockPoint=()=>fallback?target:(getDock()?.point()||target);
 run((dt,ctx)=>{
  clock+=dt;elapsed+=dt;
  if(phase==='fall'){
   star.vy+=G*dt;star.x+=star.vx*dt;star.y+=star.vy*dt;star.r=Math.min(4.2*size,star.r+dt*3);
   // The camera follows the star down, so the page rises and dims behind it.
   const k=clamp((star.y-from.y)/Math.max(1,floor-from.y)),lift=-Math.min(240,Math.max(0,star.y-from.y)*.4);
   lifted.forEach(m=>{m.style.transform=`translate3d(0,${lift}px,0)`;});
   onFall?.(k);ctx.fillStyle=`rgba(${cover},${k*.4})`;ctx.fillRect(0,0,w,h);
   path.push({x:star.x,y:star.y});if(path.length>12)path.shift();trail(ctx,path,4*size);
   if(Math.random()<.5)bits.push(spark(star.x,star.y,60,2.2));
   if(star.y>=floor){
    star.y=floor;phase='struck';impact=elapsed;reveal=elapsed;path.length=0;
    lifted.forEach(m=>{m.style.transform='';});opening=false;swap();
    // The blast: shards thrown up in a fan, falling back under the same gravity and off the screen.
    for(let i=0;i<120;i++){const a=-Math.PI*(.06+Math.random()*.88),s=500+Math.random()*1500;
     bits.push({x:star.x,y:floor,vx:Math.cos(a)*s,vy:Math.sin(a)*s,size:1+Math.random()*3.4,spin:(Math.random()-.5)*14,angle:Math.random()*6,red:Math.random()<.16,fade:0,alpha:1});}
   } else drawStar(ctx,star.x,star.y,star.r);
  }
  // The new page opens through a ragged hole widening from the impact point.
  if(reveal>=0){
   const k=(elapsed-reveal)/1.05;
   if(k<1){const far=Math.hypot(Math.max(star.x,w-star.x),floor)*1.12,r=easeOut(k)*far,ix=star.x;
    ctx.save();ctx.fillStyle=`rgb(${cover})`;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='destination-out';ctx.beginPath();
    for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,j=1+(Math.sin(a*7)*.06+Math.sin(a*13)*.05)*(1-k),px=ix+Math.cos(a)*r*j,py=floor+Math.sin(a)*r*j;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}
    ctx.fill();ctx.restore();
    ctx.strokeStyle=`rgba(255,236,210,${(1-k)*.7})`;ctx.lineWidth=2*(1-k)+.5;ctx.beginPath();ctx.arc(ix,floor,r*.98,0,Math.PI*2);ctx.stroke();
    const flash=1-(elapsed-reveal)/.22;if(flash>0){ctx.fillStyle=`rgba(255,244,228,${flash*.22})`;ctx.fillRect(0,0,w,h);}
   } else reveal=-2;
  }
  if(phase==='struck'){
   // It rests squashed on the floor while the page arrives, then hops as soon as its dock is known.
   const dock=getDock()?.point()||null,waited=elapsed-impact;
   // A page that has a dock but is still building it (the mask sculpting) gets longer to be ready.
   if(waited>.14&&(dock||waited>(getDock()?1.4:.45))){
    fallback=!dock;target=dock||{x:w/2,y:h*.36};const time=hop(star,target);
    flight={x:star.x,y:star.y,vx:(target.x-star.x)/time,vy:(target.y-star.y-G*time*time/2)/time,T:time,aimed:{...target}};
    phase='hop';clock=0;
   }
   drawStar(ctx,star.x,star.y-2,star.r*1.1);
  } else if(phase==='hop'){
   // One ballistic arc into the dock; if the dock shifts during the flight the arc bends towards it.
   const t=Math.min(clock,flight.T),fix=t/flight.T,now=dockPoint();target=now;
   star.x=flight.x+flight.vx*t+(now.x-flight.aimed.x)*fix;star.y=flight.y+flight.vy*t+G*t*t/2+(now.y-flight.aimed.y)*fix;
   star.r=4*size+(2.6-4*size)*fix;
   path.push({x:star.x,y:star.y});if(path.length>10)path.shift();trail(ctx,path,3);drawStar(ctx,star.x,star.y,star.r);
   if(clock>=flight.T){phase='settle';clock=0;path.length=0;}
  } else if(phase==='settle'){
   // It drops into place with two small settling bounces, then the dock takes over the light.
   const q=Math.min(1,clock/.38),p=dockPoint(),bounce=Math.abs(Math.sin(q*Math.PI*2))*7*(1-q)*(1-q);
   if(!landed&&q>.55){landed=true;if(fallback){for(let i=0;i<12;i++)bits.push(spark(p.x,p.y,180));}else getDock()?.land();}
   drawStar(ctx,p.x,p.y-bounce,fallback?2.6*(1-q):2.6,landed?1-clamp((q-.55)/.45):1);
   if(q>=1)phase='gone';
  }
  stepBits(bits,dt,ctx,w,h);
  const done=phase==='gone'&&reveal===-2&&bits.length===0;
  if(done)busy=false;
  return !done;
 });
}

/** Returns to the clan map: the star lifts out of the page as it sinks away, then drops back into its slot. */
export function ascend(from:Point,swap:()=>void){
 if(busy){if(!opening)swap();return;}
 if(reducedMotion()){swap();return;}
 busy=true;opening=true;
 const w=innerWidth,h=innerHeight,lifted=moving(),LIFT=.62,bits:Bit[]=[],path:Point[]=[];
 let phase:'lift'|'wait'|'drop'|'gone'='lift',clock=0,dropStart=0,swapAt=Infinity,fallback=false,start:Point={x:0,y:-40},target:Point={x:w/2,y:h/2};
 run((dt,ctx)=>{
  clock+=dt;
  if(phase==='lift'){
   // A small dip as it comes loose, then it accelerates upward and the page sinks after it.
   const k=clock/LIFT,dip=Math.sin(clamp(k/.2)*Math.PI)*6,rise=easeIn(clamp((k-.15)/.85)),x=from.x,y=from.y+dip-(from.y+50)*rise;
   lifted.forEach(m=>{m.style.transform=`translate3d(0,${200*rise}px,0)`;});
   ctx.fillStyle=`rgba(10,11,10,${clamp(rise*1.15)})`;ctx.fillRect(0,0,w,h);
   path.push({x,y});if(path.length>12)path.shift();trail(ctx,path,4);drawStar(ctx,x,y,2.6+rise*1.6);
   if(k>=1){phase='wait';swapAt=clock;path.length=0;lifted.forEach(m=>{m.style.transform='';});opening=false;swap();}
  } else {
   // The map shows through as the cover lifts; the star waits above the screen until its slot is known.
   const k=clamp((clock-swapAt)/.4);if(k<1){ctx.fillStyle=`rgba(10,11,10,${1-k})`;ctx.fillRect(0,0,w,h);}
   if(phase==='wait'){const dock=getDock()?.point()||null,waited=clock-swapAt;
    if(waited>.18&&(dock||waited>1)){fallback=!dock;target=dock||target;start={x:target.x+(from.x<target.x?-60:60),y:-40};phase='drop';dropStart=clock;}}
   if(phase==='drop'){
    // Falling back into place: it accelerates down and catches in its slot with a slight overshoot.
    const p=clamp((clock-dropStart)/.85),now=fallback?target:(getDock()?.point()||target);target=now;
    const f=p<.82?1.03*(p/.82)**2:1+.03*Math.cos((p-.82)/.18*Math.PI)*(1-(p-.82)/.18);
    const x=start.x+(now.x-start.x)*easeOut(p),y=start.y+(now.y-start.y)*f;
    path.push({x,y});if(path.length>10)path.shift();trail(ctx,path,3);
    if(p>=1){if(fallback){for(let i=0;i<12;i++)bits.push(spark(x,y,180));}else{getDock()?.land();for(let i=0;i<10;i++)bits.push(spark(x,y,140));}phase='gone';}
    else drawStar(ctx,x,y,(fallback?3.4*(1-p*.6):3.4-p*.8));
   }
  }
  stepBits(bits,dt,ctx,w,h);
  const done=phase==='gone'&&bits.length===0&&clock-swapAt>.4;
  if(done)busy=false;
  return !done;
 });
}

/** A short burst of sparks, used where dialogs open from their buttons. */
export function sparks(from:Point,count=40){
 if(reducedMotion())return;
 const bits:Bit[]=[];for(let i=0;i<count;i++)bits.push(spark(from.x,from.y,420));
 run((dt,ctx,w,h)=>{stepBits(bits,dt,ctx,w,h);return bits.length>0;});
}
/**
 * Dialogs burst open from the control that opened them: sparks fly and the dialog grows out of that point
 * as a widening circle. Closing collapses it back into the same point.
 */
const centre=(el:Element|null)=>{const r=el?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:{x:innerWidth/2,y:innerHeight/2};};
export function openDialog(dialog:HTMLDialogElement,from:Element|null){
 if(dialog.open)return;
 const p=centre(from);dialog.showModal();
 if(reducedMotion()||!dialog.animate)return;
 sparks(p,46);
 const far=Math.hypot(Math.max(p.x,innerWidth-p.x),Math.max(p.y,innerHeight-p.y));
 dialog.animate([{clipPath:`circle(0px at ${p.x}px ${p.y}px)`},{clipPath:`circle(${far*1.1}px at ${p.x}px ${p.y}px)`}],{duration:620,easing:'cubic-bezier(.76,0,.24,1)'});
}
export function closeDialog(dialog:HTMLDialogElement,to:Element|null){
 if(!dialog.open)return;
 if(reducedMotion()||!dialog.animate){dialog.close();return;}
 const p=centre(to),far=Math.hypot(Math.max(p.x,innerWidth-p.x),Math.max(p.y,innerHeight-p.y));
 const a=dialog.animate([{clipPath:`circle(${far*1.1}px at ${p.x}px ${p.y}px)`},{clipPath:`circle(0px at ${p.x}px ${p.y}px)`}],{duration:420,easing:'cubic-bezier(.76,0,.24,1)'});
 a.onfinish=()=>{dialog.close();sparks(p,18);};
}
