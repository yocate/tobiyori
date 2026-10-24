// Local account server for the single-file Tobiyori prototype. Node.js 24+.
// The API lives in app.cjs; production runs the same code on Cloudflare (see cloudflare/).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createApp, failure } = require('./app.cjs');
const PORT = Number(process.env.TOBIYORI_PORT || 4177);
const ROOT = path.join(__dirname, '成果物');
const dataDir = process.env.TOBIYORI_DATA_DIR || path.join(__dirname, '.tobiyori-data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'accounts.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
const app = createApp({db,
  origins:[`http://localhost:${PORT}`,`http://127.0.0.1:${PORT}`],
  hosts:[`localhost:${PORT}`,`127.0.0.1:${PORT}`]});
const server = http.createServer(async (req,res) => {
  if(await app.handle(req,res)!==false)return;
  try {
    const pathname = new URL(req.url,`http://localhost:${PORT}`).pathname;
    if(!['GET','HEAD'].includes(req.method)) throw failure(405,'この操作には対応していません。');
    const name = decodeURIComponent(['/', '/operator.html'].includes(pathname) ? '/gunma-community-map.html' : pathname);
    if(!/^\/(gunma-community-map\.html|tobiyori-logo-(source|transparent)\.png|tobiyori-lounge-cute-v2\.png|vendor\/leaflet\/(leaflet\.(js|css)|images\/[\w.-]+\.png))$/.test(name)) throw failure(404,'ページが見つかりません。');
    const full = path.join(ROOT,name.slice(1));
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
    const content=await fs.promises.readFile(full);
    res.writeHead(200,{'Content-Type':types[path.extname(full)]}); res.end(req.method==='HEAD'?undefined:content);
  } catch(e) { if(!res.headersSent){res.writeHead(e.status||500,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.status?e.message:'処理できませんでした。時間をおいて再度お試しください。'}));} else res.end(); }
});
server.listen(PORT,'127.0.0.1',()=>console.log(`トビヨリ: http://localhost:${PORT}`));
server.on('error',e=>{ console.error(e.code==='EADDRINUSE'?'すでに起動しているか、ポートが使用されています。':e.message);process.exitCode=1; });
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{app.close();db.close();process.exit(0);}));
