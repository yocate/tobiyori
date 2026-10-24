const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createCommunityService}=require('./community-service.cjs');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE accounts(id TEXT PRIMARY KEY,nickname TEXT);CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,content TEXT);');
const service=createCommunityService({db,schedule:false}),day=86400000,iso=ms=>new Date(Date.now()+ms).toISOString();
const run=(s,...v)=>db.prepare(s).run(...v),one=(s,...v)=>db.prepare(s).get(...v);
async function api(route,uid,body){let result;try{await service.handle({req:{method:body?'POST':'GET',headers:{'x-tobiyori-account':uid}},res:{},url:new URL('http://localhost/api/live/'+route),user:uid?{id:uid}:null,readBody:async()=>body,respond:(_,status,data)=>result={status,data}});}catch(e){result={status:e.status||500,data:{error:e.message}};}return result;}
async function ok(route,uid,body){const r=await api(route,uid,body);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
const state=cid=>one('SELECT paused,auto_paused FROM live_communities WHERE id=?',cid);
const listed=async cid=>(await ok('catalog','viewer')).communities.some(c=>c.id===cid);
(async()=>{try{
 for(const uid of ['owner','viewer'])run('INSERT INTO accounts VALUES(?,?)',uid,uid);
 const old=iso(-100*day),recent=iso(-30*day);
 for(const [cid,confirmed,paused] of [['idle',old,0],['upcoming',old,0],['recently-held',old,0],['editing',old,0],['fresh',recent,0],['manual',old,1]])
  run('INSERT INTO live_communities(id,owner_id,name,city,data,status,paused,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',cid,'owner',cid,'高崎市','{}','VERIFIED',paused,confirmed,confirmed);
 const act=(id,cid,status,start,end,updated=old)=>run('INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,status,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,cid,'活動',start,end,10,'{}',status,old,updated);
 act('future','upcoming','PUBLISHED',iso(10*day),iso(10*day+7200000));
 act('past','recently-held','CLOSED',iso(-30*day),iso(-30*day+7200000));
 act('draft','editing','DRAFT',iso(40*day),iso(40*day+7200000),recent);
 act('ancient','idle','CLOSED',iso(-200*day),iso(-200*day+7200000));
 assert.equal(state('idle').paused,0);
 service.tidy();
 assert.deepEqual({...state('idle')},{paused:1,auto_paused:1},'確認も活動もない団体は自動で外す');
 for(const cid of ['upcoming','recently-held','editing','fresh'])assert.deepEqual({...state(cid)},{paused:0,auto_paused:0},cid+' は活動中なので外さない');
 assert.deepEqual({...state('manual')},{paused:1,auto_paused:0});
 assert(!await listed('idle'));assert(await listed('upcoming'));
 assert.equal(one("SELECT COUNT(*) AS n FROM live_notifications WHERE user_id='owner' AND body LIKE '%一覧への表示を休止しました%'").n,1);
 service.tidy();assert.equal(one("SELECT COUNT(*) AS n FROM live_notifications WHERE user_id='owner' AND body LIKE '%一覧への表示を休止しました%'").n,1,'お知らせは1回だけ');
 const mine=(await ok('dashboard','owner')).communities.find(c=>c.id==='idle');assert(mine.paused&&mine.autoPaused);
 // 担当者が「変更なし」で確認すると、すぐ再表示される
 await ok('communities/idle/confirm','owner',{});assert.deepEqual({...state('idle')},{paused:0,auto_paused:0});assert(await listed('idle'));
 service.tidy();assert.equal(state('idle').paused,0,'確認直後は再び外さない');
 // 手動の休止は、確認しても勝手に再開しない
 await ok('communities/manual/confirm','owner',{});assert.equal(state('manual').paused,1);
 // 「受付を再開」でも戻り、確認日も更新される
 run('UPDATE live_communities SET confirmed_at=? WHERE id=?',old,'idle');service.tidy();assert.equal(state('idle').auto_paused,1);
 await ok('communities/idle/pause','owner',{paused:false});assert.deepEqual({...state('idle')},{paused:0,auto_paused:0});
 assert(one("SELECT confirmed_at FROM live_communities WHERE id='idle'").confirmed_at>recent);service.tidy();assert.equal(state('idle').paused,0);
 assert.equal((await api('communities/idle/confirm','viewer',{})).status,403);
 console.log('PASS: inactive communities are hidden automatically, active ones (upcoming, recently held, being edited, recently confirmed) stay listed, owners restore with one tap, manual pauses are respected');
}finally{service.close();db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
