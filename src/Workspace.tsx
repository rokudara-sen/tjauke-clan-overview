import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

/**
 * Shared pieces for the working pages (administration and the hunter's account): tabs kept in the address,
 * an editing drawer, a status switch, a change-note field and a toast for saved changes.
 */

/** Reads the tab from "#/page/tab/…" and keeps the address in step without a page change. */
export function useTab<T extends string>(page:string,tabs:readonly T[],fallback:T){
 const read=()=>{const part=location.hash.replace(/^#\//,'').split('/');return part[0]===page&&tabs.includes(part[1] as T)?part[1] as T:fallback;};
 const [tab,setTab]=useState<T>(read);
 const choose=(next:T,...rest:string[])=>{setTab(next);history.replaceState(null,'',`#/${[page,next,...rest].join('/')}`);};
 return [tab,choose] as const;
}
/** The extra path parts after the tab, for deep links such as "#/admin/records/members". */
export const pathAfterTab=()=>location.hash.replace(/^#\//,'').split('/').slice(2).map(v=>{try{return decodeURIComponent(v);}catch{return v;}});

export function Tabs<T extends string>({tabs,current,onChange,label}:{tabs:{id:T;label:string;count?:number;hidden?:boolean}[];current:T;onChange:(t:T)=>void;label:string}){
 const shown=tabs.filter(t=>!t.hidden);
 // Arrow keys move between tabs, as for any tab list.
 const key=(e:React.KeyboardEvent,i:number)=>{const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!d)return;e.preventDefault();const next=shown[(i+d+shown.length)%shown.length];onChange(next.id);document.getElementById(`tab-${next.id}`)?.focus();};
 return <div className="ws-tabs" role="tablist" aria-label={label}>{shown.map((t,i)=><button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={t.id===current} aria-controls={`panel-${t.id}`} tabIndex={t.id===current?0:-1} onClick={()=>onChange(t.id)} onKeyDown={e=>key(e,i)}>{t.label}{t.count?<span className="ws-count" aria-label={`, ${t.count} waiting`}>{t.count}</span>:null}</button>)}</div>;
}
export function TabPanel({id,children}:{id:string;children:ReactNode}){return <div className="ws-panel" role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} key={id}>{children}</div>;}

export type Status='draft'|'published'|'archived';
export const statusOf=(row:{published?:unknown;archived?:unknown})=>row.archived?'archived':row.published?'published':'draft';
/** Draft, published or archived as one choice instead of two checkboxes that can contradict each other. */
export function StatusSwitch({value,onChange,allowArchive=true,label='Status'}:{value:Status;onChange:(s:Status)=>void;allowArchive?:boolean;label?:string}){
 const options:[Status,string,string][]=[['draft','Draft','Only administrators see it'],['published','Published','Shown in the public archive'],...(allowArchive?[['archived','Archived','Hidden, links are kept'] as [Status,string,string]]:[])];
 return <fieldset className="ws-status"><legend>{label}</legend>{options.map(([id,name,hint])=><label key={id} className={value===id?'is-on':undefined}><input type="radio" name="ws-status" value={id} checked={value===id} onChange={()=>onChange(id)}/><span>{name}</span><small>{hint}</small></label>)}</fieldset>;
}

/** The change note every save needs for the audit log, with common reasons one tap away. */
export function ReasonField({value,onChange,suggestions,label='Change note',hint='Kept in the change history.'}:{value:string;onChange:(v:string)=>void;suggestions:string[];label?:string;hint?:string}){
 return <div className="ws-reason"><label>{label} *<input required value={value} onChange={e=>onChange(e.target.value)} placeholder="What changed and why"/></label>
  <div className="ws-chips" aria-label="Common reasons">{suggestions.map(s=><button type="button" key={s} className={value===s?'is-on':undefined} onClick={()=>onChange(s)}>{s}</button>)}</div><small>{hint}</small></div>;
}

/**
 * The editing drawer slides in from the right over the list. It holds focus while open; Escape or the backdrop
 * close it, asking first if there are unsaved changes. Ctrl+S or Cmd+S saves.
 */
export function Drawer({open,title,kicker,dirty,onClose,onSubmit,busy,error,footer,children}:{open:boolean;title:string;kicker?:string;dirty:boolean;onClose:()=>void;onSubmit:(e:FormEvent)=>void;busy:boolean;error?:string;footer:ReactNode;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null);
 useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open){d.showModal();d.querySelector<HTMLElement>('input:not([type=radio]),select,textarea')?.focus();}else if(!open&&d.open){d.close();}},[open]);
 const ask=()=>{if(busy)return;if(!dirty||confirm('Discard your unsaved changes?'))onClose();};
 useEffect(()=>{if(!open)return;const save=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();form.current?.requestSubmit();}};window.addEventListener('keydown',save);return()=>window.removeEventListener('keydown',save);},[open]);
 return <dialog ref={ref} className="ws-drawer" aria-label={title} onCancel={e=>{e.preventDefault();ask();}} onClick={e=>{if(e.target===ref.current)ask();}}>
  {open&&<form ref={form} onSubmit={onSubmit} className="ws-drawer-body">
   <header>{kicker&&<span className="ws-kicker">{kicker}</span>}<h2>{title}</h2><button type="button" className="ws-close" onClick={ask} aria-label="Close without saving">Close</button></header>
   <div className="ws-drawer-scroll"><fieldset disabled={busy}>{children}</fieldset></div>
   <footer>{error&&<p className="notice error prose" role="alert">{error}</p>}{footer}<small className="ws-shortcut">Ctrl+S saves · Esc closes</small></footer>
  </form>}
 </dialog>;
}

/** A brief confirmation in the corner after a save; it does not move the page. */
export function useToast(){
 const [toast,setToast]=useState<{text:string;id:number}|null>(null),timer=useRef(0),count=useRef(0);
 const show=(text:string)=>{setToast({text,id:++count.current});clearTimeout(timer.current);timer.current=window.setTimeout(()=>setToast(null),4200);};
 const node=<div className="ws-toast" role="status" aria-live="polite">{toast&&<span key={toast.id}>{toast.text}</span>}</div>;
 return [node,show] as const;
}
export const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
export const shortDate=(v:unknown)=>{const d=new Date(String(v||''));return isNaN(+d)?'':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});};
