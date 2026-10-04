import { useEffect, useRef } from 'react';
import { follow, reducedMotion } from './gl';

/**
 * The pointer as a hunter's targeting laser. Three red dots circle the pointer at different lags, like the
 * tri-laser sight; over anything interactive they leave the pointer and four brackets lock onto the target's edges.
 * Only for fine pointers; touch keeps the platform behaviour and text fields keep the text cursor.
 */
export function Cursor(){
 const root=useRef<HTMLDivElement>(null),dots=useRef<(HTMLSpanElement|null)[]>([]),brackets=useRef<(HTMLSpanElement|null)[]>([]),pip=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!matchMedia('(pointer: fine)').matches)return;
  const el=root.current!,html=document.documentElement;html.classList.add('sight-on');
  let mx=-100,my=-100,seen=false,pressed=false,target:Element|null=null,frame=0,last=performance.now();
  const dot=[0,1,2].map(()=>({x:-100,y:-100})),box={x:0,y:0,w:0,h:0,lock:0};
  const move=(e:PointerEvent)=>{mx=e.clientX;my=e.clientY;if(!seen){seen=true;el.style.opacity='1';dot.forEach(d=>{d.x=mx;d.y=my;});box.x=mx;box.y=my;}
   const t=e.target as HTMLElement;
   const text=t.closest?.('input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),textarea,[contenteditable=true],select');
   el.dataset.state=text?'text':'';
   target=text?null:t.closest?.('a,button,[role=button],summary,label,[data-cursor]')||null;};
  const down=()=>{pressed=true;el.classList.add('is-pressed');},up=()=>{pressed=false;el.classList.remove('is-pressed');};
  const leave=()=>{el.style.opacity='0';seen=false;},enter=()=>{el.style.opacity='1';};
  addEventListener('pointermove',move,{passive:true});addEventListener('pointerdown',down,{passive:true});addEventListener('pointerup',up,{passive:true});
  document.addEventListener('pointerleave',leave);document.addEventListener('pointerenter',enter);
  const tick=(now:number)=>{
   frame=requestAnimationFrame(tick);
   const dt=Math.min(.05,(now-last)/1000);last=now;const instant=reducedMotion();
   // Modal dialogs sit above every layer, the sight included, so while one is open the system cursor returns.
   const modal=!!document.querySelector('dialog[open]');html.classList.toggle('sight-on',!modal);el.style.visibility=modal?'hidden':'';if(modal)return;
   pip.current!.style.transform=`translate3d(${mx}px,${my}px,0)`;
   // Lock on: brackets ease to the target's box; without a target they gather around the pointer.
   const r=target&&target.isConnected?target.getBoundingClientRect():null;
   const pad=r?6:0,tx=r?r.left-pad:mx-11,ty=r?r.top-pad:my-11,tw=r?r.width+pad*2:22,th=r?r.height+pad*2:22;
   const k=instant?1e3:r?22:30;
   box.x=follow(box.x,tx,k,dt);box.y=follow(box.y,ty,k,dt);box.w=follow(box.w,tw,k,dt);box.h=follow(box.h,th,k,dt);box.lock=follow(box.lock,r?1:0,14,dt);
   const s=pressed?.9:1,cx=box.x+box.w/2,cy=box.y+box.h/2,hw=box.w/2*s,hh=box.h/2*s;
   [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy],i)=>{const b=brackets.current[i];if(b)b.style.transform=`translate3d(${cx+sx*hw}px,${cy+sy*hh}px,0) scale(${sx},${sy})`;});
   el.style.setProperty('--lock',box.lock.toFixed(3));
   // The three laser dots orbit the pointer and trail behind it, each a little slower than the last.
   const spin=now*.0011,radius=(pressed?7:13)*(1-box.lock*.65);
   dot.forEach((d,i)=>{const a=spin+i*Math.PI*2/3,gx=mx+Math.cos(a)*radius,gy=my+Math.sin(a)*radius;
    d.x=instant?gx:follow(d.x,gx,26-i*6,dt);d.y=instant?gy:follow(d.y,gy,26-i*6,dt);
    const n=dots.current[i];if(n)n.style.transform=`translate3d(${d.x}px,${d.y}px,0)`;});
  };
  frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);html.classList.remove('sight-on');removeEventListener('pointermove',move);removeEventListener('pointerdown',down);removeEventListener('pointerup',up);document.removeEventListener('pointerleave',leave);document.removeEventListener('pointerenter',enter);};
 },[]);
 return <div ref={root} className="sight" aria-hidden="true">
  {[0,1,2,3].map(i=><span key={i} ref={el=>{brackets.current[i]=el;}} className="sight-bracket"/>)}
  {[0,1,2].map(i=><span key={i} ref={el=>{dots.current[i]=el;}} className="sight-dot"/>)}
  <span ref={pip} className="sight-pip"/>
 </div>;
}
