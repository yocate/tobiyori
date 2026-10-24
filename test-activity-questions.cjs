const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createCommunityService}=require('./community-service.cjs');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE accounts(id TEXT PRIMARY KEY,nickname TEXT);CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,content TEXT);');
const service=createCommunityService({db,schedule:false}),stamp=new Date().toISOString(),future=new Date(Date.now()+3*86400000).toISOString();
const run=(s,...v)=>db.prepare(s).run(...v),one=(s,...v)=>db.prepare(s).get(...v);
async function api(route,uid,body){let result;try{await service.handle({req:{method:body?'POST':'GET',headers:{'x-tobiyori-account':uid}},res:{},url:new URL('http://localhost/api/live/'+route),user:uid?{id:uid}:null,readBody:async()=>body,respond:(_,status,data)=>result={status,data}});}catch(e){result={status:e.status||500,data:{error:e.message}};}return result;}
async function ok(route,uid,body){const r=await api(route,uid,body);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
(async()=>{try{
 for(const uid of ['owner','other-owner','admin','asker','viewer'])run('INSERT INTO accounts VALUES(?,?)',uid,'PRIVATE_NAME_'+uid);
 run("INSERT INTO account_roles VALUES('admin','ADMIN')");
 for(const [cid,owner] of [['org','owner'],['other','other-owner']])run('INSERT INTO live_communities(id,owner_id,name,city,data,status,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',cid,owner,cid,'高崎市','{}','VERIFIED',stamp,stamp);
 for(const [aid,cid,status] of [['a','org','PUBLISHED'],['draft','org','DRAFT'],['b','other','PUBLISHED']])run('INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,status,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',aid,cid,'まちの活動',future,future,10,'{}',status,stamp,stamp);
 // 参加者ゼロでも、ログインした人は質問できる。ログインなしでも回答済みの質問は読める。
 let page=await ok('questions/a',null);assert.deepEqual(page.answered,[]);assert.equal(page.canAsk,false);assert(page.templates.length>=3);
 assert.equal((await api('questions/a',null,{body:'質問'})).status,401);
 assert.equal((await ok('questions/a','asker')).canAsk,true);
 page=await ok('questions/a','asker',{body:'  初めてでも参加できますか？  ',user_id:'viewer'});assert.deepEqual(page.mine.map(q=>q.body),['初めてでも参加できますか？']);
 assert.equal(one("SELECT COUNT(*) AS n FROM live_notifications WHERE user_id='owner' AND body LIKE '%質問が届きました%'").n,1);
 assert.equal((await ok('questions/a','viewer')).mine.length,0,'回答前の質問は本人にだけ見える');assert.equal((await ok('questions/a',null)).answered.length,0);
 for(const bad of ['','   ','x'.repeat(301),42])assert.equal((await api('questions/a','asker',{body:bad})).status,400);
 assert.equal((await api('questions/draft','asker',{body:'質問'})).status,400,'未公開の活動には質問できない');
 assert.equal((await api('questions/draft','asker')).status,404);
 assert.equal((await api('questions/a','owner',{body:'自作自演'})).status,403);assert.equal((await api('questions/a','admin',{body:'運営'})).status,403);
 await ok('questions/a','asker',{body:'二つ目'});await ok('questions/a','asker',{body:'三つ目'});assert.equal((await api('questions/a','asker',{body:'四つ目'})).status,429);
 // 団体の受信箱には質問文だけが届き、質問者は分からない
 const inbox=await ok('questions','owner');assert.equal(inbox.questions.length,3);assert(!JSON.stringify(inbox).includes('asker')&&!JSON.stringify(inbox).includes('PRIVATE_'));
 assert.equal((await ok('questions','other-owner')).questions.length,0);assert.equal((await ok('questions','admin')).questions.length,3);assert.equal((await ok('questions','viewer')).questions.length,0);
 const [first,second,third]=inbox.questions;
 assert.equal((await api('questions/'+first.id+'/answer','other-owner',{answer:'横取り'})).status,403);
 assert.equal((await api('questions/'+first.id+'/answer','asker',{answer:'自分で回答'})).status,403);
 assert.equal((await api('questions/'+first.id+'/answer','owner',{answer:''})).status,400);
 await ok('questions/'+first.id+'/answer','owner',{answer:'はい、初めての方が半分ほどです。'});
 page=await ok('questions/a','viewer');assert.deepEqual(page.answered.map(q=>[q.body,q.answer]),[['初めてでも参加できますか？','はい、初めての方が半分ほどです。']]);
 assert(!JSON.stringify(page).includes('asker')&&!JSON.stringify(page).includes('PRIVATE_'),'公開Q&Aに質問者は出ない');
 assert.equal(one("SELECT route FROM live_notifications WHERE user_id='asker' AND body LIKE '%団体が回答しました%'").route,'liveactivity/a');
 await ok('questions/'+first.id+'/answer','owner',{answer:'修正した回答'});assert.equal(one("SELECT COUNT(*) AS n FROM live_notifications WHERE user_id='asker' AND body LIKE '%団体が回答しました%'").n,1,'回答の修正では再通知しない');
 // 不適切な質問は担当者が非表示にできる。非表示になると枠が空き、また質問できる
 await ok('questions/'+second.id+'/hide','owner',{});assert.equal((await ok('questions','owner')).questions.length,1);
 assert.equal((await api('questions/'+second.id+'/answer','owner',{answer:'回答'})).status,409);
 await ok('questions/a','asker',{body:'四つ目'});
 await ok('questions/'+third.id+'/answer','admin',{answer:'運営からの回答'});assert.equal((await ok('questions/a',null)).answered.length,2);
 // ブロックした団体・休止した団体の質問は見えない
 await ok('blocks/org','viewer',{block:true});assert.equal((await api('questions/a','viewer')).status,404);
 run("UPDATE live_communities SET paused=1 WHERE id='org'");assert.equal((await api('questions/a',null)).status,404);assert.equal((await ok('questions/a','owner')).answered.length,2,'担当者は休止中でも確認できる');
 console.log('PASS: public activity Q&A — ask with zero participants, templates, anonymous to owner and public, owner/admin answers only, answer notification once, hide, open-question limit, unpublished/blocked/paused gates');
}finally{service.close();db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
