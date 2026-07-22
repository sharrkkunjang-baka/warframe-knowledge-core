'use strict'
const http=require('node:http'),fs=require('node:fs'),path=require('node:path')
const dir=__dirname, queue=JSON.parse(fs.readFileSync(path.join(dir,'acquisition-wiki-retry-queue.json'),'utf8')).entries
const server=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json; charset=utf-8');if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  if(req.method==='GET'&&req.url==='/queue')return res.end(JSON.stringify(queue));if(req.method==='GET'&&req.url==='/sections-missing'){const e=JSON.parse(fs.readFileSync(path.join(dir,'acquisition-wiki-evidence.json'),'utf8')).entries.filter(x=>x.status==='wiki-page-captured-sections-missing');const q=JSON.parse(fs.readFileSync(path.join(dir,'acquisition-wiki-retry-queue.json'),'utf8')).entries.filter(x=>x.status==='sections-missing');return res.end(JSON.stringify([...e,...q]))}
  if(req.method==='POST'&&req.url.startsWith('/batch/')){let body='';req.on('data',x=>body+=x);req.on('end',()=>{const n=String(Number(req.url.split('/').pop())).padStart(3,'0');JSON.parse(body);fs.writeFileSync(path.join(dir,`wiki-browser-batch-${n}.json`),body+'\n');res.end('{"ok":true}')});return}
  res.statusCode=404;res.end('{"error":"not-found"}')
})
server.listen(8123,'127.0.0.1',()=>console.log('WIKI_BRIDGE_READY'))
