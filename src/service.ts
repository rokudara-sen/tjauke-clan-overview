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
export const pendingMigration='The database needs the latest updates in supabase/migrations (up to 202610030003_community.sql) before this works.';
async function call<T>(fn:string,args?:Record<string,unknown>):Promise<T>{if(!client)throw Error('Connect Supabase first.');const {data,error}=await client.rpc(fn,args);if(error)throw missingTable(error)?Error(pendingMigration):error;return data as T;}
export type Access={admin:boolean;username:string|null;status:'pending'|'approved'|'rejected'|'suspended';member:string|null;name:string|null;rank:string|null;standing?:string|null;elder:boolean;seniorOf:string[]};
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
export type ThreadSummary={id:string;title:string;created_at:string;last_post_at:string;locked:boolean;pinned:boolean;started_by:string|null;messages:number;unread:number;mentioned:boolean};
export type Message={id:number;username:string|null;member:string|null;member_name:string|null;body:string;created_at:string;mine:boolean;can_delete:boolean;reported:boolean};
export type Thread={id:string;title:string;locked:boolean;pinned:boolean;created_at:string;last_read:number;settings:ForumSettings;messages:Message[]};
export const forumThreads=()=>call<{settings:ForumSettings;threads:ThreadSummary[]}>('forum_threads');
export const forumThread=(id:string)=>call<Thread>('forum_thread',{thread_id:id});
export const forumPost=(id:string,body:string)=>call<void>('forum_post',{thread_id:id,body});
export const forumCreateThread=(title:string,body:string)=>call<string>('forum_create_thread',{title,body});
export const forumDeleteMessage=(id:number)=>call<void>('forum_delete_message',{message_id:id});
export const forumModerate=(id:string,action:'lock'|'unlock'|'pin'|'unpin'|'delete')=>call<void>('forum_moderate',{thread_id:id,action});
export const forumConfigure=(days:number,cap:number)=>call<void>('forum_configure',{days,cap});

const siteUrl=()=>`${location.origin}${import.meta.env.BASE_URL}`;
/** Sends a reset link. The link returns with ?code= (PKCE) plus ?reset=1 so the app knows to ask for a new password. */
export async function requestPasswordReset(email:string){if(!client)throw Error('Connect Supabase first.');const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:`${siteUrl()}?reset=1#/reset`});if(error)throw error;}
export async function setPassword(password:string){if(!client)throw Error('Connect Supabase first.');const {error}=await client.auth.updateUser({password});if(error)throw error;}

export type Queue={judgments:number;history:number;witness:number;mentions:number;unread:number;registrations?:number;portraits?:number;reports?:number;suggestions?:number;promotions?:number};
export const myQueue=()=>call<Queue>('my_queue');
/** Work waiting for this account, excluding unread forum threads, which show on the Forum link. */
export const queueTotal=(q:Queue|null)=>q?q.judgments+q.history+q.witness+q.mentions+(q.registrations||0)+(q.portraits||0)+(q.reports||0)+(q.suggestions||0)+(q.promotions||0):0;
/** Tells the header to refresh its counts after an action changed them. */
export const queueChanged=()=>window.dispatchEvent(new Event('queue-changed'));

export type WitnessRequest={id:string;name:string;hunter:string|null;date:string|null;era:string|null;quarry:string;weapon:string;state:string;witness_status:string|null};
export const witnessRequests=()=>call<WitnessRequest[]>('witness_requests');
export const respondWitness=(hunt:string,accept:boolean)=>call<void>('respond_witness',{hunt_id:hunt,accept});

export type Portrait={id:string;member:string;path:string;status:'pending'|'approved'|'rejected'|'replaced';created_at:string};
export const portraitTypes=['image/jpeg','image/png','image/webp'],portraitMaxBytes=2*1024*1024;
export const myPortrait=()=>call<Portrait|null>('my_portrait');
export async function uploadPortrait(member:string,file:File){
 if(!client)throw Error('Connect Supabase first.');
 if(!portraitTypes.includes(file.type))throw Error('Use a JPEG, PNG or WebP image.');
 if(file.size>portraitMaxBytes)throw Error('The image must be 2 MB or smaller.');
 const path=`${member}/${crypto.randomUUID()}.${file.type.split('/')[1].replace('jpeg','jpg')}`;
 const {error}=await client.storage.from('portrait-uploads').upload(path,file,{contentType:file.type});if(error)throw error;
 const replaced=await call<string[]>('submit_portrait',{object_path:path});
 if(replaced.length)await client.storage.from('portrait-uploads').remove(replaced);
}
export type PendingPortrait={id:string;member:string;name:string;path:string;created_at:string;current:string|null};
export const pendingPortraits=()=>call<PendingPortrait[]>('pending_portraits');
export async function portraitPreview(path:string){if(!client)throw Error('Connect Supabase first.');const {data,error}=await client.storage.from('portrait-uploads').createSignedUrl(path,600);if(error)throw error;return data.signedUrl;}
/** Approval copies the image into the public bucket through the administrator's browser, then removes the private upload and the replaced public image. */
export async function decidePortrait(p:PendingPortrait,approve:boolean){
 if(!client)throw Error('Connect Supabase first.');
 if(!approve){await call<string|null>('decide_portrait',{portrait_id:p.id,approve:false,public_url:null});await client.storage.from('portrait-uploads').remove([p.path]);return;}
 const {data:blob,error}=await client.storage.from('portrait-uploads').download(p.path);if(error)throw error;
 const {error:upload}=await client.storage.from('portraits').upload(p.path,blob,{contentType:blob.type,upsert:true});if(upload)throw upload;
 const url=client.storage.from('portraits').getPublicUrl(p.path).data.publicUrl;
 const previous=await call<string|null>('decide_portrait',{portrait_id:p.id,approve:true,public_url:url});
 await client.storage.from('portrait-uploads').remove([p.path]);
 const marker='/object/public/portraits/';if(previous?.includes(marker)&&previous!==url)await client.storage.from('portraits').remove([decodeURIComponent(previous.split(marker)[1])]);
}

export type PromotionSuggestion={hunt:string;name:string;hunter:string;date:string|null;era:string|null;trophy:string|null};
export const promotionSuggestions=()=>call<PromotionSuggestion[]>('promotion_suggestions');
export const dismissPromotion=(hunt:string)=>call<void>('dismiss_promotion',{hunt_id:hunt});
export const suggestTerm=(term:string,meaning:string,category:string,usage:string)=>call<void>('suggest_term',{term,meaning,category,usage});
export const mySuggestions=()=>call<{id:string;name:string;meaning:string;published:boolean;archived:boolean}[]>('my_suggestions');
export const deleteMyAccount=(username:string)=>call<void>('delete_my_account',{confirm_username:username});
export const renameAccount=(id:string,name:string)=>call<void>('rename_account',{account:id,name});
export const forumReport=(message:number,reason:string)=>call<void>('forum_report',{message_id:message,reason});
export type Report={id:number;message:number;body:string;author:string|null;thread:string;title:string;reporter:string|null;reason:string;created_at:string};
export const forumReports=()=>call<Report[]>('forum_reports');
export const forumResolveReport=(id:number)=>call<void>('forum_resolve_report',{report_id:id});
export type Change={kind:Kind;id:string;name:string;changed_at:string;change:'Added'|'Updated'|'Published'|'Archived'};
export async function recentChanges(limit=8):Promise<Change[]>{if(!client)return [];const {data,error}=await client.rpc('recent_changes',{max_rows:limit});if(error){if(missingTable(error))return [];throw error;}return data as Change[];}
