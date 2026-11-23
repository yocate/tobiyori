const assert=require('node:assert/strict');
const {create}=require('./成果物/live-auto-sync.js');

function environment(){
 let now=1000000,id=0;const jobs=new Map(),sockets=[];
 const env={Date:{now:()=>now},location:{href:'https://front.example.test/'},
  document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
  addEventListener(){},removeEventListener(){},
  setTimeout(fn,ms){jobs.set(++id,{fn,at:now+ms});return id;},clearTimeout:n=>jobs.delete(n),
  setInterval:()=>++id,clearInterval(){},
  WebSocket:class{constructor(){sockets.push(this);}close(){this.closed=true;}}};
 return{env,jobs,sockets,async next(){const [key,job]=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];jobs.delete(key);now=job.at;await job.fn();}};
}
async function untilStarted(test){for(let n=0;n<30&&!test();n++)await Promise.resolve();assert(test(),'request started');}

async function routeChangeDuringRefresh(){
 const e=environment();let model=0,shown=0,route='list',finish;
 const sync=create({ready:()=>true,context:()=>({account:'a',route}),signature:()=>model,retryUntil:()=>0,
  capabilities:async()=>({liveUpdates:false}),refresh:()=>new Promise(resolve=>{finish=()=>{model=1;resolve();};}),
  render:()=>{shown=model;},room:async()=>{},authChanged(){}},e.env);
 try{
  const first=e.next();await untilStarted(()=>finish);
  route='community';shown=model;finish();await first;
  assert.equal(shown,0,'the old request must not redraw a different route');
  finish=null;const second=e.next();await untilStarted(()=>finish);finish();await second;
  assert.equal(shown,1,'the next stable refresh must render data received during navigation even if unchanged');
 }finally{sync.stop();}
}
async function stopDuringCapabilities(){
 const e=environment();let finish,refreshes=0;
 const sync=create({ready:()=>true,context:()=>({account:'a',route:'list'}),signature:()=>0,retryUntil:()=>0,
  capabilities:()=>new Promise(resolve=>{finish=()=>resolve({liveUpdates:true});}),
  refresh:async()=>{refreshes++;},render(){},room:async()=>{},authChanged(){}},e.env);
 const pending=e.next();await untilStarted(()=>finish);sync.stop();finish();await pending;
 assert.equal(e.sockets.length,0,'a stopped client must not open a socket after an in-flight capability response');
 assert.equal(refreshes,0,'a stopped client must not start another request');assert.equal(e.jobs.size,0);
}
(async()=>{
 const fs=require('node:fs'),html=fs.readFileSync('成果物/gunma-community-map.html','utf8').replace(/\r\n/g,'\n');
 function embedded(file,start,end){let text=fs.readFileSync('成果物/'+file,'utf8').replace(/\r\n/g,'\n');if(start)text=text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)));assert(html.includes(text.trim()),file+' review changes must match embedded HTML');}
 embedded('live-auto-sync.js');embedded('account-ui.js','let pendingAccountState =','async function accountAPI(');embedded('account-ui.js','function accountNotice()','function queueAccountSave()');
 embedded('live-community-ui.js','async function loadCommunityQuestions(','function bindLiveUI(');embedded('live-auto-sync-integration.js','function liveSyncIdentity()','/* LIVE_SYNC_INSTALL_END */');
 let source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
 source=source.replace(/\/\* ---------------- Boot ---------------- \*\/[\s\S]*?\}\)\(\);/,`globalThis.recoveryTest={setup(id,state){accountUser={id};pendingAccountState=state;},preserveAccountRecovery,get(id){return accountRecoveries.get(id);}};})();`);
 const document={visibilityState:'hidden',addEventListener(){},getElementById(){return null;}},sandbox={location:{protocol:'http:',hostname:'localhost',pathname:'/',hash:'#/home'},document,window:{document,addEventListener(){},setTimeout(){},clearTimeout(){}},console,setTimeout,clearTimeout,setInterval(){},URL,URLSearchParams};
 require('node:vm').runInNewContext(source,sandbox);const recovery=sandbox.recoveryTest;
 const original={profile:{nickname:'account A draft'}};recovery.setup('a',original);recovery.preserveAccountRecovery();original.profile.nickname='later mutation';recovery.setup('b',{profile:{nickname:'account B draft'}});recovery.preserveAccountRecovery();
 assert.equal(recovery.get('a').profile.nickname,'account A draft');assert.equal(recovery.get('b').profile.nickname,'account B draft');
 console.log('PASS independent in-memory recovery snapshots for multiple accounts');
 const {forwardSharedData,sharedEntryScript}=await import('./cloudflare/shared-data.js');
 const cfg={applicationOrigin:'https://front.example.test',origin:'https://old.example.test',aliases:{}};
 await forwardSharedData(new Request(cfg.applicationOrigin+'/api/constructor',{method:'POST',headers:{Origin:cfg.applicationOrigin,'Content-Type':'application/json'},body:JSON.stringify({communityId:'toString'})}),cfg,async request=>{assert.equal(new URL(request.url).pathname,'/api/constructor');assert.deepEqual(await request.json(),{communityId:'toString'});return new Response('{}');});
 const location={hash:'#/constructor',pathname:'/',search:''};require('node:vm').runInNewContext(sharedEntryScript(cfg),{location,addEventListener(){},history:{replaceState(){throw Error('inherited name must not rewrite a URL');}}});
 const {liveSocketAtCapacity,liveSocketIpTag}=await import('./cloudflare/live-updates.js');
 const counts={public:256,'account:one':0,ip:1},ctx={getWebSockets:tag=>Array(tag===undefined?300:counts[tag]||0)};
 assert(liveSocketAtCapacity(ctx,null,'ip'));assert(!liveSocketAtCapacity(ctx,'one','ip'),'guest quota reserves space for logged-in users');
 counts['account:one']=16;assert(liveSocketAtCapacity(ctx,'one','ip'));counts['account:one']=0;counts.public=0;counts.ip=32;assert(liveSocketAtCapacity(ctx,null,'ip'));assert(!liveSocketAtCapacity(ctx,'one','ip'),'shared campus IP must not exclude other authenticated accounts');
 assert.equal(await liveSocketIpTag(new Request(cfg.origin)),null);
 for(const ip of ['2a06:98c0:3600::103','2a06:98c0:3600:0:0:0:0:103'])assert.equal(await liveSocketIpTag(new Request(cfg.origin,{headers:{'CF-Connecting-IP':ip}})),null);
 assert.match(await liveSocketIpTag(new Request(cfg.origin,{headers:{'CF-Connecting-IP':'192.0.2.1'}})),/^ip:[a-f0-9]{64}$/);
 console.log('PASS inherited alias names and guest/account/connection-source socket limits');
 const results=await Promise.allSettled([routeChangeDuringRefresh(),stopDuringCapabilities()]);
 for(let i=0;i<results.length;i++)if(results[i].status==='rejected')console.error(['route-change','stop-during-capabilities'][i]+': '+results[i].reason.message);
 assert(results.every(result=>result.status==='fulfilled'),'live review regressions');
 console.log('PASS review regressions: navigation during refresh and stop during pending connection');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
