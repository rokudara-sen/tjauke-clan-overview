import { documentBlocks } from './model';
/** A document read on the site. Sections get a contents list; routes use the hash, so contents entries scroll rather than link. */
export function DocumentText({text}:{text:unknown}){
 const blocks=documentBlocks(text),headings=blocks.map((b,i)=>({...b,i})).filter(b=>b.kind==='heading');
 const jump=(i:number)=>document.getElementById(`doc-section-${i}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 return <div className={headings.length>1?'document with-contents':'document'}>
  {headings.length>1&&<nav className="document-contents" aria-label="Contents"><p className="eyebrow">Contents</p><ol>{headings.map(h=><li key={h.i}><button type="button" className="text-button" onClick={()=>jump(h.i)}>{h.text}</button></li>)}</ol></nav>}
  <div className="document-text">{blocks.map((b,i)=>b.kind==='heading'?<h2 key={i} id={`doc-section-${i}`}>{b.text}</h2>:b.kind==='quote'?<blockquote key={i}>{b.text}</blockquote>:<p key={i}>{b.text}</p>)}</div>
 </div>;
}
