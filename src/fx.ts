import { reducedMotion } from './gl';
import { getDock } from './dock';
import { arrivalProgress, returnPosition } from './flight';
import { morph, NEW, OLD } from './transition';

/**
 * Full-screen effects layer. It runs a frame loop only while an effect plays.
 *
 * The star is the section. Opening a page, its star falls under gravity, aimed to strike the floor directly
 * below the place it will rest; the blast tears a hole in the old page and the new page shows through it while
 * the old one is pushed away, and the star bounces in one solved arc into the page's dock (the breadcrumb star).
 * Returning to the clan map, the page sinks while its star follows a visible arc back into its own slot.
 * Smaller relatives: a record link ignites and its page blooms out of that point; a link
 * back up collapses the page into the link. Nothing vanishes mid-air: shards leave the screen or fade out.
 *
 * The layer has its own view-transition name, so it keeps animating live above both page snapshots.
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
  const {ctx,w,h}=layer(),dt=Math.min(.1,(now-last)/1000);last=now;ctx.clearRect(0,0,w,h);
  // One failing effect must not stop the loop (and strand a star mid-air), so each runs on its own.
  effects=effects.filter(e=>{try{return e(dt,ctx,w,h);}catch(err){console.error(err);busy=false;opening=false;carrying=false;return false;}});
  frame=effects.length?requestAnimationFrame(tick):0;if(!frame)ctx.clearRect(0,0,w,h);
 };
 last=performance.now();frame=requestAnimationFrame(tick);
}
const easeIn=(t:number)=>t*t*t,easeOut=(t:number)=>1-(1-t)**3,easeOutQuart=(t:number)=>1-(1-t)**4,clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(t:number)=>t*t*(3-2*t);
const TONES={night:'10,11,10',bone:'205,202,192'};
/** `busy` while any hand-over plays; `opening` until its new page is in; `carrying` while a star travels to a dock. */
let busy=false,opening=false,carrying=false;
/** True while a star is travelling; the arriving page keeps its dock unlit until the star lands. */
export const travelling=()=>carrying;

function drawStar(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,a=1){
 if(a<=0||r<=0)return;
 // A faint dark halo underneath keeps the star legible over the bone home page; on night pages it disappears.
 ctx.save();const shade=ctx.createRadialGradient(x,y,0,x,y,r*5);shade.addColorStop(0,`rgba(10,11,10,${.45*a})`);shade.addColorStop(1,'rgba(10,11,10,0)');
 ctx.fillStyle=shade;ctx.fillRect(x-r*5,y-r*5,r*10,r*10);
 ctx.globalCompositeOperation='lighter';
 for(const [k,al] of [[6,.05],[3.2,.13],[1.8,.32]] as const){ctx.fillStyle=`rgba(255,226,190,${al*a})`;ctx.beginPath();ctx.arc(x,y,r*k,0,Math.PI*2);ctx.fill();}
 ctx.fillStyle=`rgba(255,252,244,${a})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=`rgba(255,240,220,${.45*a})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-r*6,y);ctx.lineTo(x+r*6,y);ctx.moveTo(x,y-r*6);ctx.lineTo(x,y+r*6);ctx.stroke();
 ctx.restore();
}
/** A soft round glow, for the instant of impact or ignition. */
function glow(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,a:number){
 if(a<=0||r<=0)return;
 const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,246,230,${a})`);g.addColorStop(.25,`rgba(255,214,170,${a*.35})`);g.addColorStop(1,'rgba(255,200,150,0)');
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
}
function trail(ctx:CanvasRenderingContext2D,points:Point[],width:number){
 ctx.lineCap='round';
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
/** Distance from a point to the farthest screen corner: the radius that uncovers the whole screen. */
const reach=(p:Point,w:number,h:number)=>Math.hypot(Math.max(p.x,w-p.x),Math.max(p.y,h-p.y));

/** The torn edge of the blast: ragged while it is small, smoothing out as it widens. */
const tear=(a:number,k:number)=>1+(Math.sin(a*7+1.3)*.07+Math.sin(a*13+.4)*.05+Math.sin(a*29)*.025)*(1-k)**1.5;
const BLAST=1.05,BLAST_CURVE=(k:number)=>easeOutQuart(k),EDGE=56,SAMPLES=24;
/** The torn hole at progress k, as points around the impact. */
function hole(p:Point,far:number,k:number){const r=BLAST_CURVE(k)*far;return Array.from({length:EDGE},(_,i)=>{const a=i/EDGE*Math.PI*2,j=tear(a,k);return [p.x+Math.cos(a)*r*j,p.y+Math.sin(a)*r*j];});}
const polygon=(pts:number[][])=>`polygon(${pts.map(([x,y])=>`${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
/**
 * Clip keyframes are sampled evenly from a curve and played linearly. The rim drawn on this layer reads the clip
 * animation's own clock and interpolates the same samples, so the drawn edge sits exactly on the clipped edge.
 */
const sampled=(shape:(k:number)=>string)=>Array.from({length:SAMPLES+1},(_,i)=>({clipPath:shape(i/SAMPLES)}));
const between=(t:number)=>{const f=clamp(t)*SAMPLES,i=Math.min(SAMPLES-1,Math.floor(f));return {a:i/SAMPLES,b:(i+1)/SAMPLES,u:f-i};};
const lerp=(a:number,b:number,u:number)=>a+(b-a)*u;
function holeAt(p:Point,far:number,t:number){const {a,b,u}=between(t),A=hole(p,far,a),B=hole(p,far,b);return A.map(([x,y],i)=>[lerp(x,B[i][0],u),lerp(y,B[i][1],u)]);}
function radiusAt(curve:(k:number)=>number,t:number){const {a,b,u}=between(t);return lerp(curve(a),curve(b),u);}
/** Progress of a clip animation by its own clock; null until it exists. */
const progress=(anim:Animation|null,duration:number)=>anim?(anim.playState==='finished'?1:clamp(Number(anim.currentTime||0)/duration)):null;

/** Opens a page: the star falls from `from`, shatters on the floor, opens the page and bounces into its dock. */
export function shatter(from:Point,swap:()=>void,{tone='night',onFall,size=1}:{tone?:'night'|'bone';onFall?:(progress:number)=>void;size?:number}={}){
 // While a star is still settling, a new choice opens straight away; only a page that is not yet open holds others back.
 if(busy){if(!opening)swap();return;}
 if(reducedMotion()){swap();return;}
 busy=true;opening=true;carrying=true;
 const w=innerWidth,h=innerHeight,floor=h-22,aim=predictDock(w),cover=TONES[tone],lifted=moving();
 // A small kick up as the star comes loose, then gravity.
 let vy=-260,T=(-vy+Math.sqrt(vy*vy+2*G*Math.max(0,floor-from.y)))/G;
 if(T<.55){T=.55;vy=(floor-from.y-G*T*T/2)/T;}
 // It falls mostly straight down, leaning a third of the way towards its dock; the bounce carries it the rest.
 const strike=from.x+(aim.x-from.x)*.35,star={x:from.x,y:from.y,vx:(strike-from.x)/T,vy,r:2.2*size};
 const bits:Bit[]=[],path:Point[]=[];
 // `clock` times the current phase; `elapsed` runs from the start and times the reveal.
 let phase:'fall'|'hop'|'settle'|'gone'='fall',clock=0,elapsed=0,impact=0,reveal=-1,fallback=false,live=false,dim=0,blast:Animation|null=null;
 let target:Point={x:0,y:0},flight={x:0,y:0,vx:0,vy:0,T:1,aimed:{x:0,y:0}};
 const dockPoint=()=>fallback?target:(getDock()?.point()||target);
 run((dt,ctx)=>{
  clock+=dt;elapsed+=dt;
  if(phase==='fall'){
   const t=Math.min(clock,T);
   star.x=from.x+star.vx*t;star.y=from.y+vy*t+G*t*t/2;star.r=Math.min(4.2*size,star.r+dt*3);
   // The camera follows the star down, so the page rises and dims behind it.
   const k=clamp((star.y-from.y)/Math.max(1,floor-from.y)),lift=-Math.min(240,Math.max(0,star.y-from.y)*.4);
   lifted.forEach(m=>{m.style.transform=`translate3d(0,${lift}px,0)`;});
   onFall?.(k);dim=smooth(k)*.4;
   path.push({x:star.x,y:star.y});if(path.length>12)path.shift();trail(ctx,path,4*size);
   if(Math.random()<.5)bits.push(spark(star.x,star.y,60,2.2));
   if(clock>=T){
    star.y=floor;phase='hop';impact=elapsed;path.length=0;opening=false;
    // Launch at impact using the known breadcrumb layout; refine the target during flight.
    const time=hop(star,aim);
    target=aim;flight={x:star.x,y:floor,vx:(aim.x-star.x)/time,vy:(aim.y-floor-G*time*time/2)/time,T:time,aimed:{...aim}};
    clock-=T;
    const p={x:star.x,y:floor},far=reach(p,w,h)*1.1,origin=`${p.x}px ${p.y}px`;
    const open=()=>{lifted.forEach(m=>{m.style.transform='';});swap();};
    // The old page stays on screen, dimmed as it was during the fall; the new one shows through the torn hole.
    live=morph(open,html=>{
     reveal=elapsed;
     blast=html.animate(sampled(k=>polygon(hole(p,far,k))),{duration:BLAST*1000,easing:'linear',pseudoElement:NEW,fill:'both'});
     html.animate([{filter:'brightness(.6)',transform:'scale(1)',transformOrigin:origin},{filter:'brightness(.15)',transform:'scale(1.12)',transformOrigin:origin}],{duration:BLAST*1000,easing:'cubic-bezier(.2,.7,.3,1)',pseudoElement:OLD,fill:'both'});
    });
    if(!live){open();reveal=elapsed;}
    // The blast: shards thrown up in a fan, falling back under the same gravity and off the screen.
    for(let i=0;i<120;i++){const a=-Math.PI*(.06+Math.random()*.88),s=500+Math.random()*1500;
     bits.push({x:star.x,y:floor,vx:Math.cos(a)*s,vy:Math.sin(a)*s,size:1+Math.random()*3.4,spin:(Math.random()-.5)*14,angle:Math.random()*6,red:Math.random()<.16,fade:0,alpha:1});}
    for(let i=0;i<30;i++)bits.push(spark(star.x,floor,900,1.6+Math.random()));
   } else drawStar(ctx,star.x,star.y,star.r);
  }
  // Until the page snapshots take over, the dimming is painted here so the old page does not brighten for a frame.
  if(reveal===-1&&dim>0){ctx.fillStyle=`rgba(${cover},${dim})`;ctx.fillRect(0,0,w,h);}
  if(reveal>=0){
   const k=progress(blast,BLAST*1000)??(elapsed-reveal)/BLAST;
   if(k<1){const pts=holeAt({x:strike,y:floor},reach({x:strike,y:floor},w,h)*1.1,k),edge=()=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
    if(!live){
     // Without view transitions, a cover in the old page's dimmed tone stands in for it while the hole widens.
     ctx.save();ctx.fillStyle=`rgb(${cover})`;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='destination-out';edge();ctx.fill();ctx.restore();
    }
    // The rim burns along the torn edge, hot at first and cooling as it opens.
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineJoin='round';edge();
    ctx.strokeStyle=`rgba(255,214,170,${(1-k)**2*.35})`;ctx.lineWidth=10*(1-k)+1;ctx.stroke();
    ctx.strokeStyle=`rgba(255,244,228,${(1-k)*.8})`;ctx.lineWidth=1.6*(1-k)+.4;ctx.stroke();ctx.restore();
   } else reveal=-2;
  }
  if(phase!=='fall')glow(ctx,strike,floor,140,Math.max(0,1-(elapsed-impact)/.3)*.9);
  if(phase==='hop'){
   // One ballistic arc into the dock; if the dock shifts during the flight the arc bends towards it.
   const t=arrivalProgress(clock/flight.T)*flight.T,fix=smooth(t/flight.T),now=dockPoint();target=now;
   star.x=flight.x+flight.vx*t+(now.x-flight.aimed.x)*fix;star.y=flight.y+flight.vy*t+G*t*t/2+(now.y-flight.aimed.y)*fix;
   star.r=4*size+(2.6-4*size)*(t/flight.T);
   path.push({x:star.x,y:star.y});if(path.length>10)path.shift();trail(ctx,path,3);drawStar(ctx,star.x,star.y,star.r);
   if(clock>=flight.T){
    phase='settle';clock=0;path.length=0;carrying=false;fallback=!getDock()?.point();
    if(fallback){for(let i=0;i<12;i++)bits.push(spark(target.x,target.y,180));}else getDock()?.land();
   }
  } else if(phase==='settle'){
   // Transfer the light at the contact point, without a second positional bounce.
   const q=Math.min(1,clock/.12),p=dockPoint();
   drawStar(ctx,p.x,p.y,fallback?2.6*(1-q):2.6,1-smooth(q));
   if(q>=1)phase='gone';
  }
  stepBits(bits,dt,ctx,w,h);
  const done=phase==='gone'&&reveal===-2&&bits.length===0;
  if(done){busy=false;carrying=false;}
  return !done;
 });
}

/** Returns along a visible arc while the outgoing page sinks away beneath the star. */
export function ascend(from:Point,swap:()=>void){
 if(busy){if(!opening)swap();return;}
 if(reducedMotion()){swap();return;}
 busy=true;opening=true;
 const w=innerWidth,h=innerHeight,bits:Bit[]=[],path:Point[]=[];
 let phase:'wait'|'fly'|'gone'='wait',clock=0,flightStart=0,ready=false,fallback=false,target:Point={x:w/2,y:h/2};
 // Capture once at departure: the outgoing page has one uninterrupted sinking motion.
 const open=()=>{opening=false;swap();};
 const live=morph(open,html=>{
  ready=true;
  html.animate([{opacity:1,transform:'translateY(0)',filter:'brightness(1)'},{opacity:0,transform:'translateY(180px)',filter:'brightness(.5)'}],{duration:580,easing:'cubic-bezier(.2,.6,.35,1)',pseudoElement:OLD,fill:'both'});
 },'rise');
 if(!live){open();ready=true;}
 run((dt,ctx)=>{
  clock+=dt;
  const a=live?0:1-smooth(clamp(clock/.3));
  if(a>0){ctx.fillStyle=`rgba(10,11,10,${a})`;ctx.fillRect(0,0,w,h);}
  if(phase==='wait'){
   // Keep the star visible at departure while the map establishes its projected slot.
   const dock=ready?getDock()?.point():null;
   if(dock||clock>.9){fallback=!dock;target=dock||target;phase='fly';flightStart=clock;}
   drawStar(ctx,from.x,from.y,2.6);
  } else if(phase==='fly'){
   const p=clamp((clock-flightStart)/.95),now=fallback?target:(getDock()?.point()||target);target=now;
   const {x,y}=returnPosition(from,now,p,w,h);
   path.push({x,y});if(path.length>10)path.shift();trail(ctx,path,3);
   if(p>=1){if(fallback){for(let i=0;i<12;i++)bits.push(spark(x,y,180));}else{getDock()?.land();for(let i=0;i<10;i++)bits.push(spark(x,y,140));}phase='gone';}
   else drawStar(ctx,x,y,2.6+Math.sin(p*Math.PI)*.8);
  }
  stepBits(bits,dt,ctx,w,h);
  const done=phase==='gone'&&bits.length===0&&a<=0;
  if(done)busy=false;
  return !done;
 });
}

/**
 * Opens a record from inside a page: the chosen point ignites, a ring of light runs out from it, and the new page
 * blooms out of that point while the old one recedes. The small cousin of the falling star.
 */
const BLOOM=.5;
export function ignite(from:Point,swap:()=>void){
 if(busy){if(!opening)swap();return;}
 if(reducedMotion()){swap();return;}
 busy=true;opening=true;
 const bits:Bit[]=[];for(let i=0;i<14;i++)bits.push(spark(from.x,from.y,480,2+Math.random()));
 let clock=0,swapped=false,bloom=-1,live=false,anim:Animation|null=null;
 const origin=`${from.x}px ${from.y}px`,radius=(k:number)=>easeOutQuart(k);
 run((dt,ctx,w,h)=>{
  clock+=dt;
  const far=reach(from,w,h)*1.05;
  // A brief ignition before the page opens, so the eye sees where it comes from.
  if(!swapped&&clock>=.07){
   swapped=true;opening=false;
   live=morph(swap,html=>{
    bloom=clock;
    anim=html.animate(sampled(k=>`circle(${(radius(k)*far).toFixed(1)}px at ${origin})`),{duration:BLOOM*1000,easing:'linear',pseudoElement:NEW,fill:'both'});
    html.animate([{transform:'scale(1)',filter:'brightness(1)',transformOrigin:origin},{transform:'scale(.94)',filter:'brightness(.35)',transformOrigin:origin}],{duration:BLOOM*1000,easing:'cubic-bezier(.3,.6,.3,1)',pseudoElement:OLD,fill:'both'});
   });
   if(!live){swap();bloom=-2;}
  }
  const flare=clamp(clock/.07),fade=1-clamp((clock-.12)/.4);
  glow(ctx,from.x,from.y,70,fade*.8);drawStar(ctx,from.x,from.y,1.5+2.5*easeOut(flare),fade);
  if(bloom>=0){const k=progress(anim,BLOOM*1000)??(clock-bloom)/BLOOM;
   if(k<1){const r=radiusAt(radius,k)*far;ctx.save();ctx.globalCompositeOperation='lighter';ctx.beginPath();ctx.arc(from.x,from.y,r,0,Math.PI*2);
    ctx.strokeStyle=`rgba(255,214,170,${(1-k)**2*.3})`;ctx.lineWidth=8*(1-k)+1;ctx.stroke();ctx.strokeStyle=`rgba(255,244,228,${(1-k)*.75})`;ctx.lineWidth=1.2*(1-k)+.3;ctx.stroke();ctx.restore();}
   else bloom=-2;}
  stepBits(bits,dt,ctx,w,h);
  const done=swapped&&bloom===-2&&fade<=0&&bits.length===0;
  if(done)busy=false;
  return !done;
 });
}

/**
 * Goes back up (a record to its section): the page folds into the chosen link as a closing ring, the section
 * waiting underneath, and the point it closes on flashes once as the ring shuts.
 */
const CLOSE=.42;
export function collapse(to:Point,swap:()=>void){
 if(busy){if(!opening)swap();return;}
 if(reducedMotion()){swap();return;}
 busy=true;opening=true;
 let clock=0,start=-1,live=false,popped=false,anim:Animation|null=null;
 const bits:Bit[]=[],origin=`${to.x}px ${to.y}px`,radius=(k:number)=>1-easeIn(k)*.98-.02*k;
 live=morph(()=>{opening=false;swap();},html=>{
  start=clock;const far=reach(to,innerWidth,innerHeight)*1.05;
  anim=html.animate(sampled(k=>`circle(${(radius(k)*far).toFixed(1)}px at ${origin})`),{duration:CLOSE*1000,easing:'linear',pseudoElement:OLD,fill:'both'});
  html.animate([{transform:'scale(1.04)',filter:'brightness(.4)',transformOrigin:origin},{transform:'scale(1)',filter:'brightness(1)',transformOrigin:origin}],{duration:CLOSE*1000+120,easing:'cubic-bezier(.2,.7,.3,1)',pseudoElement:NEW,fill:'both'});
 },'collapse');
 if(!live){opening=false;busy=false;swap();return;}
 run((dt,ctx,w,h)=>{
  clock+=dt;
  if(start>=0&&!popped){const k=progress(anim,CLOSE*1000)??(clock-start)/CLOSE,far=reach(to,w,h)*1.05;
   if(k<1){const r=radiusAt(radius,k)*far;ctx.save();ctx.globalCompositeOperation='lighter';ctx.beginPath();ctx.arc(to.x,to.y,r,0,Math.PI*2);
    ctx.strokeStyle=`rgba(255,214,170,${k*.3})`;ctx.lineWidth=2+k*6;ctx.stroke();ctx.strokeStyle=`rgba(255,244,228,${.3+k*.6})`;ctx.lineWidth=.6+k;ctx.stroke();ctx.restore();}
   else{popped=true;start=clock;for(let i=0;i<18;i++)bits.push(spark(to.x,to.y,320,2.2));}}
  if(popped){const k=(clock-start)/.45;glow(ctx,to.x,to.y,60,(1-clamp(k))*.85);drawStar(ctx,to.x,to.y,3.2*(1-clamp(k)*.7),1-clamp(k));if(k>=1&&!bits.length){busy=false;return false;}}
  // If the snapshots never become ready, the effect still ends.
  if(start<0&&clock>1.2){busy=false;return false;}
  stepBits(bits,dt,ctx,w,h);
  return true;
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
 * as a widening circle while the backdrop darkens. Closing collapses it back into the same point.
 */
const centre=(el:Element|null)=>{const r=el?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:{x:innerWidth/2,y:innerHeight/2};};
export function openDialog(dialog:HTMLDialogElement,from:Element|null){
 if(dialog.open&&!dialog.classList.contains('is-closing'))return;
 dialog.getAnimations().forEach(a=>a.cancel());dialog.classList.remove('is-closing');
 const p=centre(from);if(!dialog.open)dialog.showModal();
 if(reducedMotion()||!dialog.animate)return;
 sparks(p,24);
 const far=reach(p,innerWidth,innerHeight)*1.05;
 dialog.animate(sampled(k=>`circle(${(easeOutQuart(k)*far).toFixed(1)}px at ${p.x}px ${p.y}px)`),{duration:420,easing:'linear'});
}
export function closeDialog(dialog:HTMLDialogElement,to:Element|null){
 if(!dialog.open||dialog.classList.contains('is-closing'))return;
 if(reducedMotion()||!dialog.animate){dialog.close();return;}
 const p=centre(to),far=reach(p,innerWidth,innerHeight)*1.05;
 // The backdrop clears alongside (see `.is-closing` in the stylesheet).
 dialog.classList.add('is-closing');
 const a=dialog.animate(sampled(k=>`circle(${((1-easeIn(k))*far).toFixed(1)}px at ${p.x}px ${p.y}px)`),{duration:300,easing:'linear'});
 a.onfinish=()=>{if(!dialog.classList.contains('is-closing'))return;dialog.classList.remove('is-closing');dialog.close();sparks(p,10);};
}
