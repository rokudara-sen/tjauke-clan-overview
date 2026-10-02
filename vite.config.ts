import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
// Development only: serves the ignored workbook export for VITE_LOCAL_SNAPSHOT. Never part of the build.
const snapshot:Plugin={name:'local-snapshot',configureServer(server){server.middlewares.use('/tjauke-clan-overview/__snapshot',(req,res)=>{try{res.setHeader('Content-Type','application/json');res.end(fs.readFileSync('.local/workbook.json','utf8'));}catch{res.statusCode=404;res.end('{}');}});}};
export default defineConfig({plugins:[react(),snapshot],base:'/tjauke-clan-overview/'});
