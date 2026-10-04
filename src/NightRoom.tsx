import { useEffect, useRef, useState } from 'react';
import { Cosmos } from './Cosmos';
import { travelling } from './fx';
import { setDock } from './dock';
import { href } from './Visuals';

/** The deep sky every inner page sits under; it tilts as the page scrolls, so reading feels like floating. */
export function NightRoom(){return <div className="night-sky"><Cosmos intensity={.75}/></div>;}

/**
 * The page's own star, at the head of its breadcrumb. A travelling star comes to rest here when the page opens,
 * and leaves from here when you return to the clan map, which is where this link goes.
 */
export function PageStar(){
 const ref=useRef<HTMLAnchorElement>(null),[lit,setLit]=useState(()=>!travelling());
 useEffect(()=>setDock({
  point:()=>{const r=ref.current?.getBoundingClientRect();return r&&r.width?{x:r.left+r.width/2,y:r.top+r.height/2}:null;},
  land:()=>setLit(true),
 }),[]);
 return <a ref={ref} href={href('clan')} className={`page-star${lit?' is-lit':''}`} aria-label="Return this star to the clan map" title="Return to the clan map"/>;
}
