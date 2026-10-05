import { ascend, closeDialog, collapse, ignite, shatter } from './fx';
import { starOf } from './dock';
import { reducedMotion } from './gl';

/**
 * How pages hand over. Wherever the browser supports view transitions, the old page stays on screen while the
 * new one opens through it, so no hand-over passes through an empty or covered screen.
 * - A star falls only when a section is chosen from one of the three spatial pages (the mask, the star map,
 *   the archive): it shatters on the floor and the new page opens through the blast.
 * - Going back to the clan map, the current section's star arcs into its slot as the page sinks.
 * - Inside a page, a link deeper (a record) ignites where it was chosen and the new page opens out of that point;
 *   a link back up (a record to its section) collapses the page into the link. Moving sideways from one record to
 *   another is routine, so it crossfades like everything else.
 * - Everything else (the header, the index, search, forms) crossfades: the old page lifts away over the new one.
 * The mask dives into the star map with `through`: the mask keeps flying past while the map opens behind it.
 */
let arrival:string|null=null;
/** Set by the page that hands over, read once by the page that receives. */
// Cleared after the current task, so a development remount (React StrictMode) still sees it.
export const takeArrival=()=>{const a=arrival;setTimeout(()=>{if(arrival===a)arrival=null;},0);return a;};

/** The app renders a route synchronously through this, so a view transition captures the finished new page. */
let router:((hash:string)=>void)|null=null;
export function setRouter(fn:(hash:string)=>void){router=fn;return()=>{if(router===fn)router=null;};}
/** Changes the route now. Open dialogs (index, search) close with the page they were opened over. */
export function commit(to:string){
 document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>{d.classList.remove('is-closing');d.close();});
 if(router){history.pushState(null,'',to);router(to);}else location.hash=to;
}

type ViewTransition={ready:Promise<void>;finished:Promise<void>};
/**
 * Resolves once the running hand-over is animating. The browser moves the page snapshots off the main thread, so
 * heavy setup started after this cannot freeze them, while setup run inside the swap holds the old page still.
 */
let animating:Promise<void>=Promise.resolve();
export const handedOver=()=>animating;
const frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()));
/**
 * Runs `swap` inside a view transition and lets `animate` drive the old and new page snapshots.
 * Returns false (and does nothing) where view transitions are unavailable, so callers can fall back.
 */
export function morph(swap:()=>void,animate:(html:HTMLElement)=>void,variant='open'){
 const start=(document as Document&{startViewTransition?:(cb:()=>void)=>ViewTransition}).startViewTransition;
 if(!start||reducedMotion())return false;
 const html=document.documentElement;clearSnapshots();html.dataset.vt=variant;
 const t=start.call(document,swap);
 // Two frames after the animation is created it is running on the compositor.
 animating=t.ready.then(()=>{animate(html);}).then(frame).then(frame).catch(()=>{});
 t.finished.catch(()=>{}).finally(()=>{clearSnapshots();if(html.dataset.vt===variant)delete html.dataset.vt;});
 return true;
}
/**
 * Snapshot animations hold their end state (fill 'both') only for the transition they belong to. Left in place,
 * they would apply to the next transition's snapshots, which share their names, and start it in the wrong state.
 */
function clearSnapshots(){document.getAnimations().forEach(a=>{if((a.effect as KeyframeEffect|null)?.pseudoElement?.startsWith('::view-transition'))a.cancel();});}
export const OLD='::view-transition-old(root)',NEW='::view-transition-new(root)';

type Point={x:number;y:number};
type Options={from?:DOMRect|Point|null;tone?:'night'|'bone';veil?:boolean;through?:boolean;star?:boolean;kind?:'ember'|'collapse';arrival?:string;onFall?:(k:number)=>void};
const centre=(r:DOMRect|Point)=>'width' in r?{x:r.left+r.width/2,y:r.top+r.height/2}:r;
const sectionOf=(hash:string)=>hash.replace(/^#\//,'').split('/')[0]||'dashboard';

/** The quiet hand-off: the old page lifts away and fades over the new one, which runs its own entrance. */
function soft(to:string){
 const go=()=>commit(to);
 if(morph(go,html=>{html.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translate3d(0,-18px,0)'}],{duration:260,easing:'cubic-bezier(.4,0,.2,1)',pseudoElement:OLD,fill:'both'});},'fade'))return;
 const main=document.getElementById('main');
 if(reducedMotion()||!main?.animate){go();return;}
 const out=main.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translate3d(0,-12px,0)'}],{duration:180,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
 // If the route does not replace the page (an unknown address), the old page must not stay faded out.
 out.onfinish=()=>{go();requestAnimationFrame(()=>requestAnimationFrame(()=>out.cancel()));};
}
/** The mask hands over to the star map: the mask's points keep rushing past while the map opens behind them. */
function through(to:string){
 const go=()=>commit(to);
 if(!morph(go,html=>{html.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(1.7)'}],{duration:620,easing:'cubic-bezier(.5,0,.75,0)',pseudoElement:OLD,fill:'both'});},'through'))go();
}

export function navigate(to:string,{from=null,tone,veil=true,through:pass=false,star=false,kind,arrival:hand,onFall}:Options={}){
 if(location.hash===to)return;
 arrival=hand||null;
 if(!veil){if(pass)through(to);else commit(to);return;}
 const point=from?centre(from):{x:innerWidth/2,y:innerHeight/2};
 if(to==='#/clan'){
  // From home the canonical way in is the dive through the mask, if the mask is there to take it.
  if(sectionOf(location.hash)==='dashboard'){const dive=new CustomEvent('mask-dive',{cancelable:true});if(!window.dispatchEvent(dive))return;}
  // The star that returns is the current page's own: it leaves from the breadcrumb, where it rests.
  const dock=document.querySelector('.page-star'),origin=dock?centre(dock.getBoundingClientRect()):point;
  arrival=`return:${starOf(location.hash)||'overview'}`;
  ascend(origin,()=>commit(to));
  return;
 }
 if(star&&starOf(to)){shatter(point,()=>commit(to),{tone:tone||'night',onFall});return;}
 if(kind==='ember'){ignite(point,()=>commit(to));return;}
 if(kind==='collapse'){collapse(point,()=>commit(to));return;}
 soft(to);
}

/** Internal route links change page through `navigate`. Modified clicks and new tabs keep browser behaviour. */
export function interceptLinks(root:Document){
 const click=(e:MouseEvent)=>{
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  const a=(e.target as HTMLElement).closest?.('a[href^="#/"]') as HTMLAnchorElement|null;
  if(!a||a.target||a.dataset.instant!==undefined)return;
  const to=a.getAttribute('href')!;
  e.preventDefault();
  // A link to the page already showing only closes the dialog it was chosen from.
  if(to===location.hash){const d=a.closest('dialog');if(d)closeDialog(d,a);return;}
  // Only links inside the spatial pages themselves carry a star; the header, index and search do not.
  const star=!!a.closest('.mask-home,.star-map')&&to.split('/').length===2;
  // Links within an inner page's content ignite (deeper) or collapse (back up); workspaces switch tabs quietly.
  const content=!star&&!!a.closest('.archive-page #main')&&!a.closest('.workspace');
  const up=location.hash.startsWith(to+'/')||a.classList.contains('back'),sideways=location.hash.split('/').length>2&&to.split('/').length>2;
  navigate(to,{from:e.detail>0?{x:e.clientX,y:e.clientY}:a.getBoundingClientRect(),star,kind:content&&!sideways?(up?'collapse':'ember'):undefined});
 };
 root.addEventListener('click',click);
 return()=>root.removeEventListener('click',click);
}
