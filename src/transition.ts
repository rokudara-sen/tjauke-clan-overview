import { ascend, shatter } from './fx';
import { starOf } from './dock';
import { reducedMotion } from './gl';

/**
 * How pages hand over.
 * - A star falls only when a section is chosen from one of the three spatial pages (the mask, the star map,
 *   the archive): that is the act the metaphor describes, and keeping it rare keeps the blast easy on the eyes.
 * - Going back to the clan map, the current section's star lifts out and drops into its slot (no blast).
 * - Everything else (records, the header, the index, search, forms) uses a quiet hand-off: the page eases up
 *   and fades, and the next one rises in.
 * Scenes can also hand over with no transition (the mask dives straight into the star map) with `veil:false`.
 */
let arrival:string|null=null;
/** Set by the page that hands over, read once by the page that receives. */
// Cleared after the current task, so a development remount (React StrictMode) still sees it.
export const takeArrival=()=>{const a=arrival;setTimeout(()=>{if(arrival===a)arrival=null;},0);return a;};

type Point={x:number;y:number};
type Options={from?:DOMRect|Point|null;tone?:'night'|'bone';veil?:boolean;star?:boolean;arrival?:string;onFall?:(k:number)=>void};
const centre=(r:DOMRect|Point)=>'width' in r?{x:r.left+r.width/2,y:r.top+r.height/2}:r;
const sectionOf=(hash:string)=>hash.replace(/^#\//,'').split('/')[0]||'dashboard';

/** The quiet hand-off: the current page lifts slightly and fades, then the next page rises in on its own. */
function soft(to:string){
 const main=document.getElementById('main');
 if(reducedMotion()||!main?.animate){location.hash=to;return;}
 const out=main.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translate3d(0,-12px,0)'}],{duration:180,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
 // If the route does not replace the page (an unknown address), the old page must not stay faded out.
 out.onfinish=()=>{location.hash=to;requestAnimationFrame(()=>requestAnimationFrame(()=>out.cancel()));};
}

export function navigate(to:string,{from=null,tone,veil=true,star=false,arrival:hand,onFall}:Options={}){
 if(location.hash===to)return;
 arrival=hand||null;
 if(!veil){location.hash=to;return;}
 const point=from?centre(from):{x:innerWidth/2,y:innerHeight/2};
 if(to==='#/clan'){
  // From home the canonical way in is the dive through the mask, if the mask is there to take it.
  if(sectionOf(location.hash)==='dashboard'){const dive=new CustomEvent('mask-dive',{cancelable:true});if(!window.dispatchEvent(dive))return;}
  // The star that returns is the current page's own: it leaves from the breadcrumb, where it rests.
  const dock=document.querySelector('.page-star'),origin=dock?centre(dock.getBoundingClientRect()):point;
  arrival=`return:${starOf(location.hash)||'overview'}`;
  ascend(origin,()=>{location.hash=to;});
  return;
 }
 if(star&&starOf(to)){shatter(point,()=>{location.hash=to;},{tone:tone||'night',onFall});return;}
 soft(to);
}

/** Internal route links change page through `navigate`. Modified clicks and new tabs keep browser behaviour. */
export function interceptLinks(root:Document){
 const click=(e:MouseEvent)=>{
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  const a=(e.target as HTMLElement).closest?.('a[href^="#/"]') as HTMLAnchorElement|null;
  if(!a||a.target||a.dataset.instant!==undefined)return;
  const to=a.getAttribute('href')!;if(to===location.hash)return;
  e.preventDefault();
  // Only links inside the spatial pages themselves carry a star; the header, index and search do not.
  const star=!!a.closest('.mask-home,.star-map,.archive-catalogue')&&to.split('/').length===2;
  navigate(to,{from:e.detail>0?{x:e.clientX,y:e.clientY}:a.getBoundingClientRect(),star});
 };
 root.addEventListener('click',click);
 return()=>root.removeEventListener('click',click);
}
