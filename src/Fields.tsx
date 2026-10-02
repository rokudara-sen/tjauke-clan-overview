import type { Dataset, Field, RecordData } from './model';
/** One form control for a schema field. References are chosen by name and stored by ID. */
export function FieldInput({field:f,row,setRow,data,options}:{field:Field;row:RecordData;setRow:(r:RecordData)=>void;data:Dataset;options?:string[]}){
 const value=String(row[f.key]??''),set=(v:string)=>setRow({...row,[f.key]:v});
 return <label>{f.label}{f.required?' *':''}{f.term&&<small className="term-note">{f.term} · provisional transcription</small>}
  {f.ref?<select value={value} required={f.required} onChange={e=>set(e.target.value)}><option value="">Not assigned</option>{data[f.ref].filter(r=>!r.archived||r.id===row[f.key]).map(r=><option value={r.id} key={r.id}>{r.name}{r.archived?' (archived)':''}</option>)}</select>
  :f.type==='select'?<select required={f.required} value={value} onChange={e=>set(e.target.value)}><option value="">Select…</option>{(options||f.options)?.map(o=><option key={o}>{o}</option>)}</select>
  :f.type==='textarea'?<textarea rows={5} required={f.required} value={value} onChange={e=>set(e.target.value)}/>
  :<input type={['number','date','url'].includes(f.type)?f.type:'text'} step={f.type==='number'?'any':undefined} required={f.required} value={value} onChange={e=>set(e.target.value)}/>}
 </label>;
}
