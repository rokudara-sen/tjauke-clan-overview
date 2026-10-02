import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { schemas, searchArchive, type Dataset } from './model';
import { href } from './Visuals';
/** Archive-wide search. Opens with Ctrl+K, Cmd+K or "/" outside text fields. */
export function Search({data,ready}:{data:Dataset;ready:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),[query,setQuery]=useState(''),[index,setIndex]=useState(0);
 const hits=useMemo(()=>searchArchive(query,data),[query,data]);
 const open=()=>{setQuery('');setIndex(0);dialog.current?.showModal();};
 const close=()=>dialog.current?.close();
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable;if((e.key.toLowerCase()==='k'&&(e.ctrlKey||e.metaKey))||(e.key==='/'&&!typing)){e.preventDefault();if(!dialog.current?.open)open();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 useEffect(()=>{document.getElementById(`hit-${index}`)?.scrollIntoView({block:'nearest'});},[index]);
 function move(e:ReactKeyboardEvent){
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(hits.length)setIndex(i=>(i+(e.key==='ArrowDown'?1:hits.length-1))%hits.length);}
  else if(e.key==='Escape'){e.preventDefault();close();}
  else if(e.key==='Enter'&&hits[index]){e.preventDefault();close();location.hash=href(hits[index].kind,hits[index].row.id);}
 }
 return <>
  <button type="button" className="search-button" onClick={open} aria-keyshortcuts="Control+K /" aria-haspopup="dialog">Search<kbd aria-hidden="true">/</kbd></button>
  <dialog ref={dialog} className="search" aria-label="Search the archive" onClick={e=>{if(e.target===dialog.current)close();}}>
   <div className="search-field">
    <input type="search" role="combobox" aria-label="Search the archive" aria-autocomplete="list" aria-expanded={hits.length>0} aria-controls="search-results" aria-activedescendant={hits[index]?`hit-${index}`:undefined} placeholder="Hunter, household, undertaking or term" value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);}} onKeyDown={move} autoFocus/>
    <button type="button" onClick={close}>Close</button>
   </div>
   {!ready?<p className="search-note" role="status">Records are still loading.</p>
   :!query.trim()?<p className="search-note">Searches names first, then epithets, meanings, quarry, summaries and eras.</p>
   :!hits.length?<p className="search-note" role="status">Nothing matches “{query.trim()}”.</p>
   :<ul id="search-results" role="listbox" aria-label="Results">{hits.map((h,i)=><li key={`${h.kind}/${h.row.id}`} id={`hit-${i}`} role="option" aria-selected={i===index}>
     <a href={href(h.kind,h.row.id)} tabIndex={-1} onClick={close} onMouseMove={()=>setIndex(i)}><span>{h.row.name}{h.row.archived?<small> archived</small>:null}</span><small>{schemas[h.kind].title}{h.match&&<> · {h.match}</>}</small></a>
    </li>)}</ul>}
   <p className="search-keys" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close</p>
  </dialog>
 </>;
}
