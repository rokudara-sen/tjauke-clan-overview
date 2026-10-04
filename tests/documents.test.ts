import { beforeAll,afterAll,it,expect,describe } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { documentBlocks,emptyData,validate,type RecordData } from '../src/model';
const doc=(extra:Partial<RecordData>={}):RecordData=>({id:'d',name:'Dossier',category:'Clan dossier',order:'0',archived:false,published:true,...extra});

describe('document text',()=>{
 it('reads lines as paragraphs, ## as sections and > as quotations',()=>{
  expect(documentBlocks('> “Choose.”\r\n## Overview\n\nFirst line.\n  Second line.  \n')).toEqual([{kind:'quote',text:'“Choose.”'},{kind:'heading',text:'Overview'},{kind:'paragraph',text:'First line.'},{kind:'paragraph',text:'Second line.'}]);
  expect(documentBlocks(undefined)).toEqual([]);
 });
 it('needs the text or an external copy, not necessarily both',()=>{
  const d=emptyData();
  expect(validate('library',doc(),d)).toContain('Add the document text or an external copy.');
  expect(validate('library',doc({body:'Text'}),d)).toEqual([]);
  expect(validate('library',doc({url:'https://example.test/d'}),d)).toEqual([]);
 });
});

describe('document text in the database',()=>{
 const db=new PGlite();
 const admin='11111111-1111-4111-8111-111111111111';
 const save=(payload:object)=>db.query('select public.save_record($1,$2::jsonb,null,$3)',['library',JSON.stringify(payload),'Test']);
 beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  await db.query('insert into auth.users(id,email) values($1,$2)',[admin,'admin@private.test']);
  // An existing linked document, recorded before the text column existed.
  const files=fs.readdirSync('supabase/migrations').sort(),last=files.indexOf('202610090001_document_text.sql');
  for(const f of files.slice(0,last))await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
  await db.exec(`insert into public.library(id,name,category,"order",url,published) values('old','Old','Shelf',1,'https://example.test/old',true)`);
  for(const f of files.slice(last))await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
  await db.exec(`insert into private.administrators values('${admin}')`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated');
 });
 afterAll(async()=>await db.close());

 it('keeps existing linked documents and publishes text without a link',async()=>{
  await save({id:'new',name:'New',category:'Shelf',order:0,body:'## Overview\nText.',published:true});
  await db.exec('reset role');await db.exec('set role anon');
  const library=(await db.query<any>('select public.public_archive() as a')).rows[0].a.library;
  expect(library.find((d:any)=>d.id==='old')).toMatchObject({url:'https://example.test/old',body:null});
  expect(library.find((d:any)=>d.id==='new')).toMatchObject({url:null,body:'## Overview\nText.'});
  await db.exec('reset role');await db.exec('set role authenticated');
 });
 it('refuses a document with nothing to read, or a malformed link',async()=>{
  await expect(save({id:'empty',name:'Empty',category:'Shelf',order:2})).rejects.toThrow(/library_readable/);
  await expect(save({id:'bad',name:'Bad',category:'Shelf',order:3,url:'not a link'})).rejects.toThrow(/library_url_check/);
 });
});
