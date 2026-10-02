import { createClient } from '@supabase/supabase-js';
import { emptyData, kinds, parseWorkbook, schemas, withAllKinds, type Dataset, type Kind, type RecordData } from './model';
export const localPreview=import.meta.env.DEV&&import.meta.env.VITE_LOCAL_SNAPSHOT==='true';
const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client=!localPreview&&url&&key?createClient(url,key,{auth:{flowType:'pkce'}}):null;
export async function loadData(admin=false):Promise<Dataset>{
 if(localPreview&&!client){const response=await fetch(`${import.meta.env.BASE_URL}__snapshot`);if(!response.ok)throw Error('The local workbook snapshot could not be loaded.');const parsed=parseWorkbook(await response.json());if(parsed.issues.length)throw Error(parsed.issues.join('\n'));for(const r of parsed.data.members)delete r.player;return parsed.data;}
 if(!client)throw Error('The archive is not connected yet. Supabase configuration is required to load published records.');
 if(!admin){const {data,error}=await client.rpc('public_archive');if(error)throw error;return withAllKinds(data as Partial<Dataset>);}
 const result=emptyData();await Promise.all(kinds.map(async k=>{const {data,error}=await client.from(k).select('*');if(error){if(schemas[k].added&&missingTable(error))return;throw error;}result[k]=data as RecordData[];}));return result;
}
export async function saveRecord(kind:Kind,row:RecordData,reason:string){if(!client)throw Error('Connect Supabase before saving.');const {error}=await client.rpc('save_record',{record_kind:kind,payload:row,expected_updated:row.updated_at||null,change_reason:reason});if(error)throw error;}
export async function exportBackup(){if(!client)throw Error('Connect Supabase before exporting.');const data=await loadData(true);const {data:audit,error}=await client.from('audit_log').select('*').order('changed_at');if(error)throw error;return {exported_at:new Date().toISOString(),data,audit};}
// A table or function from a later migration that has not been applied yet.
export const missingTable=(e:{code?:string;message?:string})=>['42P01','PGRST205','42883','PGRST202'].includes(String(e.code))||/does not exist|could not find/i.test(String(e.message));
export const pendingMigration='The database needs the latest updates (supabase/migrations/202610030001_hunters.sql and 202610030002_accounts_forum.sql) before this works.';
async function call<T>(fn:string,args?:Record<string,unknown>):Promise<T>{if(!client)throw Error('Connect Supabase first.');const {data,error}=await client.rpc(fn,args);if(error)throw missingTable(error)?Error(pendingMigration):error;return data as T;}
export type Access={admin:boolean;username:string|null;status:'pending'|'approved'|'rejected'|'suspended';member:string|null;name:string|null;rank:string|null;elder:boolean;seniorOf:string[]};
export type Workspace={member:RecordData;houses:RecordData[];hunts:RecordData[];chronicle:RecordData[]};
export const myAccess=()=>call<Access>('my_access');
export const hunterWorkspace=()=>call<Workspace>('hunter_workspace');
export const hunterSave=(kind:Kind,row:RecordData,reason:string)=>call<void>('hunter_save',{record_kind:kind,payload:row,expected_updated:row.updated_at||null,change_reason:reason});
export const supersedeRelation=(oldRow:RecordData,next:RecordData,reason:string)=>call<void>('supersede_relation',{old_id:oldRow.id,payload:next,expected_updated:oldRow.updated_at||null,change_reason:reason});
export const usernamePattern=/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;
export const usernameAvailable=(name:string)=>call<boolean>('username_available',{name});
export const claimUsername=(name:string)=>call<void>('claim_username',{name});
/** Requests an account. Emails are only used to sign in; profiles carry the public username. */
export async function register(email:string,password:string,username:string,member:string,note:string){
 if(!client)throw Error('Connect Supabase first.');
 const {data,error}=await client.auth.signUp({email,password,options:{data:{username,member,note},emailRedirectTo:`${location.origin}${import.meta.env.BASE_URL}`}});
 // The profile trigger rejects a username taken between the availability check and sign-up.
 if(error)throw /database error/i.test(error.message)?Error('That username was just taken. Choose another.'):error;
 return {confirmEmail:!data.session};
}
export type AccountRow={id:string;username:string|null;status:Access['status'];note:string|null;requested:string|null;member:string|null;created_at:string;admin:boolean};
export const listAccounts=()=>call<AccountRow[]>('list_accounts');
export const reviewAccount=(id:string,decision:'approved'|'rejected'|'suspended',member:string|null)=>call<void>('review_account',{account:id,decision,member_id:member});

export type ForumSettings={retention_days:number;thread_cap:number};
export type ThreadSummary={id:string;title:string;created_at:string;last_post_at:string;locked:boolean;started_by:string|null;messages:number};
export type Message={id:number;username:string|null;member:string|null;member_name:string|null;body:string;created_at:string;mine:boolean;can_delete:boolean};
export type Thread={id:string;title:string;locked:boolean;created_at:string;settings:ForumSettings;messages:Message[]};
export const forumThreads=()=>call<{settings:ForumSettings;threads:ThreadSummary[]}>('forum_threads');
export const forumThread=(id:string)=>call<Thread>('forum_thread',{thread_id:id});
export const forumPost=(id:string,body:string)=>call<void>('forum_post',{thread_id:id,body});
export const forumCreateThread=(title:string,body:string)=>call<string>('forum_create_thread',{title,body});
export const forumDeleteMessage=(id:number)=>call<void>('forum_delete_message',{message_id:id});
export const forumModerate=(id:string,action:'lock'|'unlock'|'delete')=>call<void>('forum_moderate',{thread_id:id,action});
export const forumConfigure=(days:number,cap:number)=>call<void>('forum_configure',{days,cap});
