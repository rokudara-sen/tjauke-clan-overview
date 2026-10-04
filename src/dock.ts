/**
 * Where a travelling star comes to rest. The page that is showing registers its dock; the effects layer reads
 * the point every frame (it may move, as the star map turns) and calls `land` when the star arrives.
 */
export type Dock={point:()=>{x:number;y:number}|null;land:()=>void};
let current:Dock|null=null;
export function setDock(dock:Dock){current=dock;return()=>{if(current===dock)current=null;};}
export const getDock=()=>current;

/** Star map sections, by route. Record pages and sub-pages belong to the star of their section. */
export const mapRoutes=['overview','members','houses','hunts','trophies','chronicle','library','glossary','politics','duties','forum'];
const parents:Record<string,string>={promotions:'members',clans:'politics',relations:'politics'};
export function starOf(hash:string){const section=hash.replace(/^#\//,'').split('/')[0];const route=parents[section]||section;return mapRoutes.includes(route)?route:null;}
