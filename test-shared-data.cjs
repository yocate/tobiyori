const assert=require('node:assert/strict'),http=require('node:http'),{DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto');
const {createApp}=require('./app.cjs');
const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(r=>server.close(r));
(async()=>{
 const {sharedDataConfig,forwardSharedData,prepareSharedCutover,sharedEntryScript}=await import('./cloudflare/shared-data.js');
 const old='https://old.example.test',front='https://new.example.test',a=crypto.randomUUID(),b=crypto.randomUUID();
 const cfg=sharedDataConfig({APP_ORIGIN:front,SHARED_DATA_ORIGIN:old,SHARED_DATA_ID_ALIASES:JSON.stringify({[a]:b})});
 assert.equal(sharedDataConfig({APP_ORIGIN:front}),null);
 for(const target of ['http://old.example.test',front,'https://old.example.test/path','https://user:pass@old.example.test'])assert.throws(()=>sharedDataConfig({APP_ORIGIN:front,SHARED_DATA_ORIGIN:target}));
 assert.throws(()=>sharedDataConfig({APP_ORIGIN:front,SHARED_DATA_ORIGIN:old,SHARED_DATA_ID_ALIASES:'{"bad":"bad"}'}));
 let calls=[];const fetcher=async req=>{calls.push(req);return new Response('{"ok":true}',{headers:{'Content-Type':'application/json','Cache-Control':'public','Set-Cookie':'__Host-tobiyori_session='+'a'.repeat(64)+'; Path=/; HttpOnly; SameSite=Strict; Secure'}});};
 let r=await forwardSharedData(new Request(front+'/api/live/activities/'+a,{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}),cfg,fetcher);assert.equal(r.status,403);assert.equal(calls.length,0);
 r=await forwardSharedData(new Request(front+'/api/me',{headers:{'X-Tobiyori-Shared-Hop':'1'}}),cfg,fetcher);assert.equal(r.status,508);
 r=await forwardSharedData(new Request(front+'/api/live/activities/'+a,{method:'POST',headers:{Origin:front,'Content-Type':'application/json',Cookie:'unrelated=secret; __Host-tobiyori_session='+'b'.repeat(64),'X-Tobiyori-Internal-Password-Ok':'1',Authorization:'Bearer unrelated','X-Tobiyori-Account':a},body:JSON.stringify({communityId:a,message:a})}),cfg,fetcher);
 assert.equal(r.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,old+'/api/live/activities/'+b);assert.equal(calls[0].headers.get('Origin'),old);assert.equal(calls[0].headers.get('Cookie'),'__Host-tobiyori_session='+'b'.repeat(64));assert(!calls[0].headers.has('Authorization'));assert(!calls[0].headers.has('X-Tobiyori-Internal-Password-Ok'));assert.equal(calls[0].redirect,'manual');assert.deepEqual(await calls[0].json(),{communityId:b,message:a});assert.match(r.headers.get('Set-Cookie'),/HttpOnly/);assert.equal(r.headers.get('Cache-Control'),'no-store');
 r=await forwardSharedData(new Request(front+'/api/login',{method:'POST',headers:{Origin:front,'Content-Type':'application/json','Content-Length':String(4*1024*1024+1)},body:'{}'}),cfg,fetcher);assert.equal(r.status,413);assert.equal(calls.length,1);
 let redirects=0;r=await forwardSharedData(new Request(front+'/api/me'),cfg,async()=>{redirects++;return new Response(null,{status:302,headers:{Location:'https://evil.example'}});});assert.equal(r.status,502);assert.equal(redirects,1);
 r=await forwardSharedData(new Request(front+'/api/me'),cfg,async()=>{throw Error('private network information');});assert.equal(r.status,503);assert(!(await r.text()).includes('private network'));
 r=await forwardSharedData(new Request(front+'/api/me'),cfg,async()=>new Response('{}',{headers:{'Set-Cookie':'unrelated=bad; Path=/; HttpOnly; SameSite=Strict; Secure','Access-Control-Allow-Origin':'*'}}));assert(!r.headers.has('Set-Cookie'));assert(!r.headers.has('Access-Control-Allow-Origin'));
 r=await forwardSharedData(new Request(front+'/media/x'),cfg,async request=>{assert(!request.headers.has('Cookie'));return new Response('image',{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=100'}});});assert.match(r.headers.get('Cache-Control'),/public/);
 assert(sharedEntryScript(cfg).includes(a));console.log('PASS shared transport: origin, cookie, bounded body, aliases, redirects, no duplicate retry/fallback');

 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');let app,canonicalOrigin;
 const canonical=http.createServer((req,res)=>app.handle(req,res));canonicalOrigin=await listen(canonical);
 app=createApp({db,origins:[canonicalOrigin],hosts:[new URL(canonicalOrigin).host],community:{schedule:false}});
 const servers=[],configs=[];
 async function makeFront(){let c;const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const web=new Request(c.applicationOrigin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const result=await forwardSharedData(web,c);res.statusCode=result.status;for(const [k,v]of result.headers)if(k!=='set-cookie')res.setHeader(k,v);if(result.headers.getSetCookie().length)res.setHeader('Set-Cookie',result.headers.getSetCookie());res.end(Buffer.from(await result.arrayBuffer()));}catch(e){res.statusCode=500;res.end(e.message);}});const origin=await listen(server);c={applicationOrigin:origin,origin:canonicalOrigin,aliases:{}};configs.push(c);servers.push(server);return origin;}
 const f1=await makeFront(),f2=await makeFront();
 async function api(base,route,user,data){const headers={Origin:base};if(data!==undefined)headers['Content-Type']='application/json';if(user){headers.Cookie=user.cookie;headers['X-Tobiyori-Account']=user.id;}const response=await fetch(base+'/api/'+route,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,body:await response.json(),headers:response.headers};}
 async function ok(base,route,user,data){const r=await api(base,route,user,data);assert(r.status<300,route+': '+JSON.stringify(r.body));return r.body;}
 async function register(base,nickname){const r=await api(base,'register',null,{email:crypto.randomUUID()+'@example.test',password:crypto.randomBytes(20).toString('hex'),nickname,consent:true});assert.equal(r.status,201);return {id:r.body.user.id,cookie:r.headers.get('Set-Cookie').split(';')[0]};}
 try{
  const owner=await register(f1,'担当者'),p1=await register(f1,'参加者1'),p2=await register(f2,'参加者2');db.prepare('INSERT INTO account_roles VALUES(?,?)').run(owner.id,'ADMIN');
  assert.equal((await ok(f2,'me',owner)).user.id,owner.id,'same account on both fronts');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,3);
  const org=await ok(f1,'live/communities',owner,{name:'共通保存のテスト団体',city:'高崎市',type:'学生団体',intro:'二つの入口で同じ活動を確認'});
  await ok(f2,'live/review/'+org.id+'/approve',owner,{type:'community',note:'ローカル確認',identityChecked:true,consentChecked:true});
  const activity=await ok(f1,'live/activities',owner,{communityId:org.id});
  await ok(f2,'live/activities/'+activity.id,owner,{title:'残り1人のテスト',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),capacity:1,purpose:'検証',tasks:'検証',staff:'担当者',requirements:'検証用',belongings:'なし',risk:'実開催なし',insurance:'実開催なし',photoPolicy:'撮影なし',transport:'来場なし',prohibited:'実参加なし',location:'非公開の場所',emergency:'非公開の連絡先'});
  await ok(f1,'live/activities/'+activity.id+'/submit',owner,{});await ok(f2,'live/review/'+activity.id+'/approve',owner,{type:'activity',note:'ローカル確認'});
  const application1=await ok(f1,'live/apply/'+activity.id,p1,{kind:'見学'}),application2=await ok(f2,'live/apply/'+activity.id,p2,{kind:'見学'});
  assert.equal((await ok(f2,'live/dashboard',owner)).applications.length,2);
  assert.equal((await api(f2,'live/activity-messages/'+activity.id,p1)).status,403);
  const approvals=await Promise.all([api(f1,'live/applications/'+application1.id+'/approve',owner,{}),api(f2,'live/applications/'+application2.id+'/approve',owner,{})]);assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_applications WHERE status='APPROVED'").get().n,1);
  const accepted=approvals[0].status===200?p1:p2,other=accepted===p1?p2:p1;
  await ok(f1,'live/activity-messages/'+activity.id,owner,{body:'共通の連絡'});const room=await ok(f2,'live/activity-messages/'+activity.id,accepted);assert.equal(room.messages[0].body,'共通の連絡');await ok(f2,'live/activity-messages/'+activity.id,accepted,{body:'受け取りました'});assert.equal((await ok(f1,'live/activity-messages/'+activity.id,owner)).messages[1].body,'受け取りました');assert.equal((await api(f1,'live/activity-messages/'+activity.id,other)).status,403);
  const acceptedApp=(await ok(f2,'live/dashboard',accepted)).applications.find(p=>p.status==='APPROVED');await ok(f2,'live/applications/'+acceptedApp.id+'/cancel',accepted,{});const pendingApp=accepted===p1?application2:application1;await ok(f1,'live/applications/'+pendingApp.id+'/approve',owner,{});assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_applications WHERE status='APPROVED'").get().n,1);
  assert.deepEqual((await ok(f1,'live/catalog')).activities,(await ok(f2,'live/catalog')).activities);assert(!JSON.stringify(await ok(f2,'live/catalog')).includes('非公開の場所'));
  configs[1].aliases[a]=activity.id;assert.equal((await api(f2,'live/apply/'+a,accepted,{kind:'見学'})).status,201,'old shared link resolves to same activity, not a new event');
  console.log('PASS two fronts / one DB: shared accounts, pending requests, concurrent last-seat protection, cancel/reapprove, two-way board, privacy, existing IDs');
  const storageValues=new Map(),storage={get:async key=>storageValues.get(key),put:async(k,v)=>storageValues.set(k,v)};let saved;
  const backups={put:async(k,v)=>{saved={key:k,value:JSON.parse(v)};}};const cutCfg={origin:old,applicationOrigin:front,aliases:{[org.id]:b,[activity.id]:a}};
  await assert.rejects(()=>prepareSharedCutover(db,storage,backups,cutCfg),/未移行/);assert.equal(saved,undefined,'never hide real applications or messages');
  // A separate new environment with only copied listings can switch after its private snapshot.
  const empty=new DatabaseSync(':memory:'),emptyApp=createApp({db:empty,origins:[front],hosts:[new URL(front).host],community:{schedule:false}});
  const cut=await prepareSharedCutover(empty,storage,backups,cutCfg);assert(saved);assert(!Object.hasOwn(saved.value.tables,'sessions'));assert(!Object.hasOwn(saved.value.tables,'google_flows'));assert(saved.value.tables.accounts);assert.equal((await prepareSharedCutover(empty,storage,backups,cutCfg)).backupKey,cut.backupKey);
  emptyApp.close();empty.close();console.log('PASS cutover: refuses unmatched/participation data, private snapshot without sessions, repeat-safe');
 }finally{await Promise.all(servers.map(close));await close(canonical);app.close();db.close();}
 console.log('PASS all shared-data checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
