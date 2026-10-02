import { createClient } from '@supabase/supabase-js';
import { emptyData, kinds, parseWorkbook, type Dataset, type Kind, type RecordData } from './model';
export const localPreview=import.meta.env.DEV&&import.meta.env.VITE_LOCAL_SNAPSHOT==='true';
const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client=!localPreview&&url&&key?createClient(url,key):null;
export async function loadData(admin=false):Promise<Dataset>{
 if(localPreview&&!client){const response=await fetch(`${import.meta.env.BASE_URL}__snapshot`);if(!response.ok)throw Error('The local workbook snapshot could not be loaded.');const parsed=parseWorkbook(await response.json());if(parsed.issues.length)throw Error(parsed.issues.join('\n'));for(const r of parsed.data.members)delete r.player;return parsed.data;}
 if(!client)throw Error('The archive is not connected yet. Supabase configuration is required to load published records.');
 if(!admin){const {data,error}=await client.rpc('public_archive');if(error)throw error;return data as Dataset;}
 const result=emptyData();await Promise.all(kinds.map(async k=>{const {data,error}=await client.from(k).select('*');if(error)throw error;result[k]=data as RecordData[];}));return result;
}
export async function saveRecord(kind:Kind,row:RecordData,reason:string){if(!client)throw Error('Connect Supabase before saving.');const {error}=await client.rpc('save_record',{record_kind:kind,payload:row,expected_updated:row.updated_at||null,change_reason:reason});if(error)throw error;}
export async function exportBackup(){if(!client)throw Error('Connect Supabase before exporting.');const data=await loadData(true);const {data:audit,error}=await client.from('audit_log').select('*').order('changed_at');if(error)throw error;return {exported_at:new Date().toISOString(),data,audit};}
