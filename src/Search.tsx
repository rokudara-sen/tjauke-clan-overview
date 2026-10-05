import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { schemas, searchArchive, type Dataset } from './model';
import { href } from './Visuals';
import { closeDialog, openDialog } from './fx';
import { navigate } from './transition';
import { ArrowUpRight, Search as SearchIcon, X } from 'lucide-react';
/** Archive-wide search. Opens with Ctrl+K, Cmd+K or "/" outside text fields. */
export function Search({data,ready}:{data:Dataset;ready:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),button=useRef<HTMLButtonElement>(null),[query,setQuery]=useState(''),[index,setIndex]=useState(0);
 const hits=useMemo(()=>searchArchive(query,data),[query,data]);
 const open=()=>{setQuery('');setIndex(0);if(dialog.current)openDialog(dialog.current,button.current);};
 const close=()=>{if(dialog.current)closeDialog(dialog.current,button.current);};
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable;if((e.key.toLowerCase()==='k'&&(e.ctrlKey||e.metaKey))||(e.key==='/'&&!typing)){e.preventDefault();if(!dialog.current?.open)open();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 useEffect(()=>{document.getElementById(`hit-${index}`)?.scrollIntoView({block:'nearest'});},[index,query]);
 function move(e:ReactKeyboardEvent){
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(hits.length)setIndex(i=>(i+(e.key==='ArrowDown'?1:hits.length-1))%hits.length);}
  else if(e.key==='Escape'){e.preventDefault();close();}
  else if(e.key==='Enter'&&hits[index]){e.preventDefault();const from=document.getElementById(`hit-${index}`)?.getBoundingClientRect();if(location.hash===href(hits[index].kind,hits[index].row.id))close();else navigate(href(hits[index].kind,hits[index].row.id),{from});}
 }
 return <>
  <button ref={button} type="button" className="search-button" onClick={open} aria-keyshortcuts="Control+K /" aria-haspopup="dialog">Search<kbd aria-hidden="true">/</kbd></button>
  <dialog ref={dialog} className="search" aria-label="Search the archive" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===dialog.current)close();}}>
   <div className="search-top"><span>TJAU’KE / ARCHIVE</span><button className="overlay-close" type="button" onClick={close} aria-label="Close search" title="Close search"><X size={22}/></button></div>
   <h2 className="search-title">Search</h2>
   <div className="search-field">
    <SearchIcon size={22} aria-hidden="true"/>
    <input type="search" role="combobox" aria-label="Search the archive" aria-autocomplete="list" aria-expanded={hits.length>0} aria-controls="search-results" aria-activedescendant={hits[index]?`hit-${index}`:undefined} placeholder="Name or keyword" value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);}} onKeyDown={move} autoFocus/>
   </div>
   <div className="search-summary" role="status">{ready&&query.trim()?`${hits.length} ${hits.length===1?'result':'results'}`:'Archive records'}</div>
   {!ready?<p className="search-note" role="status">Records are still loading.</p>
   :!query.trim()?null
   :!hits.length?<p className="search-note" role="status">Nothing matches “{query.trim()}”.</p>
   :<ul id="search-results" role="listbox" aria-label="Results">{hits.map((h,i)=><li key={`${h.kind}/${h.row.id}`} id={`hit-${i}`} role="option" aria-selected={i===index}>
     <a href={href(h.kind,h.row.id)} tabIndex={-1} onMouseMove={()=>setIndex(i)}><span className="search-result-copy"><span>{h.row.name}{h.row.archived?<small> archived</small>:null}</span><small>{schemas[h.kind].title}{h.match&&<> · {h.match}</>}</small></span><ArrowUpRight size={18} aria-hidden="true"/></a>
    </li>)}</ul>}
  </dialog>
 </>;
}
