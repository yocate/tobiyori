// 監査修正の回帰テスト。実DB・ネットワークを使用しない。
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {performance}=require('node:perf_hooks');
const {createCommunityService}=require('./community-service.cjs');
const raw=new DatabaseSync(':memory:');
let sqlCount=0;
// prepare回数ではなく、キャッシュ済みstatementを含む実行回数を数える。
const db=new Proxy(raw,{get(target,key){
 if(key==='prepare')return sql=>{const statement=target.prepare(sql);return new Proxy(statement,{get(stmt,method){
  if(['all','get','run','iterate'].includes(method))return (...args)=>{sqlCount++;return stmt[method](...args);};
  const value=stmt[method];return typeof value==='function'?value.bind(stmt):value;
 }});};
 const value=target[key];return typeof value==='function'?value.bind(target):value;
}});
db.exec('PRAGMA foreign_keys=ON;CREATE TABLE accounts(id TEXT PRIMARY KEY,nickname TEXT);CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,content TEXT);');
for(const uid of ['owner','admin','minor','adult','legacy','bad-profile','offer-target','viewer'])db.prepare('INSERT INTO accounts VALUES(?,?)').run(uid,uid);
const service=createCommunityService({db,schedule:false,tidyEveryMs:60000});
db.prepare("INSERT INTO account_roles VALUES('admin','ADMIN')").run();
const when=new Date().toISOString();
const details={location:'PRIVATE_LOCATION',emergency:'PRIVATE_CONTACT',tasks:'受付',purpose:'交流',staff:'担当者',requirements:'初参加歓迎',belongings:'水筒',risk:'転倒注意',insurance:'加入済み',photoPolicy:'同意後撮影',transport:'電車',prohibited:'勧誘禁止',genre:'文化'};
const insertOrg=db.prepare('INSERT INTO live_communities(id,owner_id,name,city,data,status,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
const insertActivity=db.prepare('INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,status,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
for(let n=0;n<100;n++){
 insertOrg.run('org'+n,'owner','団体'+n,'前橋市','{}','VERIFIED',when,when);
 for(let a=0;a<10;a++)insertActivity.run('a'+n+'-'+a,'org'+n,'活動'+n+'-'+a,'2035-12-01T01:00:00.000Z','2035-12-01T04:00:00.000Z',20,JSON.stringify(details),'PUBLISHED',when,when);
}
const profile=(uid,p)=>db.prepare('INSERT OR REPLACE INTO workspaces VALUES(?,?)').run(uid,JSON.stringify({profile:p}));
async function api(route,uid,body){let result;try{await service.handle({req:{method:body===undefined?'GET':'POST',headers:{'x-tobiyori-account':uid}},res:{},url:new URL('http://audit.local/api/live/'+route),user:uid?{id:uid}:null,readBody:async()=>body,respond:(_,status,value)=>result={status,value}});}catch(e){result={status:e.status||500,value:{error:e.message}};}return result;}
async function ok(route,uid,body){const r=await api(route,uid,body);assert(r.status<300,JSON.stringify({route,...r}));return r.value;}
(async()=>{try{
 // JSTの誕生日境界。UTCの10/30 16時はJSTの10/31。
 const actualNow=Date.now;
 try{
  Date.now=()=>Date.parse('2026-10-30T16:00:00.000Z');
  profile('minor',{birthDate:'2008-11-01'});
  profile('adult',{birthDate:'2008-10-31'});
  profile('legacy',{birthDate:'2009-01-01'});
  assert.equal((await api('apply/a0-0','minor',{kind:'体験参加',minor:false,guardian:false})).status,400);
  assert.equal((await api('apply/a0-0','minor',{kind:'体験参加',minor:false})).status,400);
  const child=await ok('apply/a0-0','minor',{kind:'体験参加',minor:false,guardian:true});
  assert.equal(db.prepare('SELECT minor FROM live_applications WHERE id=?').get(child.id).minor,1);
  assert.equal((await api('applications/'+child.id+'/approve','owner',{})).status,400);
  await ok('applications/'+child.id+'/approve','owner',{guardianChecked:true});
  const adult=await ok('apply/a0-0','adult',{kind:'体験参加',minor:false,guardian:false});
  assert.equal(db.prepare('SELECT minor FROM live_applications WHERE id=?').get(adult.id).minor,0,'JSTでちょうど18歳は成人');
  await ok('applications/'+adult.id+'/approve','owner',{});
  db.prepare('INSERT INTO live_applications VALUES(?,?,?,?,?,?,?,?,?)').run('legacy-app','a0-0','legacy','体験参加','',0,0,'APPLIED',when);
  assert.equal((await api('applications/legacy-app/approve','owner',{guardianChecked:true})).status,400);
  assert.equal(db.prepare("SELECT status FROM live_applications WHERE id='legacy-app'").get().status,'APPLIED');
 }finally{Date.now=actualNow;}
 assert.equal((await api('review/a0-0/return','admin',{type:'activity',note:'古い審査画面'})).status,409);
 assert.equal(db.prepare("SELECT status FROM live_activities WHERE id='a0-0'").get().status,'PUBLISHED');
 // 不正な旧プロフィールが先に現れても、後続の正常な候補への招待を妨げない。
 profile('bad-profile',{receiveOffers:true,areas:{city:'前橋市'}});
 profile('offer-target',{receiveOffers:true,areas:['前橋市']});
 assert.equal((await ok('offers/a0-1/send','owner',{city:'前橋市',body:'受付のお手伝いへの招待です'})).sent,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_offers WHERE user_id='offer-target'").get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_offers WHERE user_id='bad-profile'").get().n,0);
 // ルートそのものと詳細画面の双方を担当者向け通知として扱う。
 const routes=['waitingManage','waitingManage/a0-0','questions','questions/a0-0','feedback','feedback/a0-0'];
 for(const [i,route] of routes.entries())db.prepare('INSERT INTO live_notifications VALUES(?,?,?,?,?,0,NULL)').run('operator-'+i,'viewer','担当者通知',route,when);
 db.prepare('INSERT INTO live_notifications VALUES(?,?,?,?,?,0,NULL)').run('user-notice','viewer','参加者通知','myactivity',when);
 db.prepare('INSERT INTO live_notifications VALUES(?,?,?,?,?,0,NULL)').run('other-notice','adult','他人の通知','questions',when);
 let dashboard=await ok('dashboard','viewer');
 assert.equal(dashboard.unreadBySurface.operator,6);assert.equal(dashboard.unreadBySurface.user,1);
 await ok('notifications','viewer',{surface:'operator'});
 dashboard=await ok('dashboard','viewer');
 assert.equal(dashboard.unreadBySurface.operator,0);assert.equal(dashboard.unreadBySurface.user,1);
 assert.equal(db.prepare("SELECT is_read FROM live_notifications WHERE id='other-notice'").get().is_read,0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_notifications WHERE user_id='viewer' AND is_read=1").get().n,6);
 // 100団体1000活動を維持したまま公開範囲を変える。
 db.prepare("INSERT INTO live_blocks VALUES('viewer','org1')").run();
 db.prepare("UPDATE live_communities SET paused=1 WHERE id='org2'").run();
 db.prepare("UPDATE live_communities SET status='PENDING' WHERE id='org3'").run();
 db.prepare("UPDATE live_activities SET status='DRAFT',published_at=NULL WHERE id='a4-0'").run();
 db.prepare("INSERT INTO live_activity_change_requests VALUES(?,?,?,?,?)").run('a4-1','pending-change','{}',when,when);
 await ok('catalog','viewer'); // 定期処理を終えたウォーム状態で測定する。
 sqlCount=0;const started=performance.now();const catalog=await ok('catalog','viewer');const elapsed=performance.now()-started;const count=sqlCount;
 assert.equal(catalog.communities.length,97);assert.equal(catalog.activities.length,968);
 for(const cid of ['org1','org2','org3']){assert(!catalog.communities.some(c=>c.id===cid));assert(!catalog.activities.some(a=>a.communityId===cid));}
 assert(!catalog.activities.some(a=>['a4-0','a4-1'].includes(a.id)));
 assert(!JSON.stringify(catalog).includes('PRIVATE_'));
 assert(count<=8,'一覧のSQL数が件数に比例しないこと: '+count);
 const anonymous=await ok('catalog');assert.equal(anonymous.communities.length,98);assert.equal(anonymous.activities.length,978);
 assert(anonymous.activities.some(a=>a.id==='a1-0'),'ブロックは本人だけに適用する');
 console.log(`PASS: JST年齢境界・同意・旧申込・古い審査・旧プロフィール招待・通知分類・公開範囲。catalog 100団体/1000活動: ${count} SQL, ${elapsed.toFixed(1)} ms (warm, in-memory)`);
}finally{service.close();raw.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
