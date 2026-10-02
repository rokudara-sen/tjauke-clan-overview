import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
const snapshot:Plugin={name:'local-snapshot',configureServer(server){server.middlewares.use('/tjauke-clan-overview/__snapshot',(req,res)=>{try{res.setHeader('Content-Type','application/json');res.end(fs.readFileSync('.local/workbook.json','utf8'));}catch{res.statusCode=404;res.end('{}');}});server.middlewares.use('/tjauke-clan-overview/__migration',(req,res)=>{res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(fs.readFileSync('supabase/migrations/202610020001_archive.sql','utf8'));});}};
export default defineConfig({plugins:[react(),snapshot],base:'/tjauke-clan-overview/'});
