const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createCommunityService}=require('./community-service.cjs');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE accounts(id TEXT PRIMARY KEY,nickname TEXT);');
const service=createCommunityService({db}),stamp=new Date().toISOString();
function run(sql,...args){return db.prepare(sql).run(...args);}
async function api(route,user,body){let result;try{await service.handle({req:{method:body?'POST':'GET',headers:{'x-tobiyori-account':user?.id}},res:{},url:new URL('http://localhost/api/live/'+route),user,readBody:async()=>body,respond:(_,status,data)=>{result={status,data}}});}catch(e){result={status:e.status||500,data:{error:e.message}}}return result;}
(async()=>{try{
 run('INSERT INTO accounts VALUES(?,?)','owner','団体窓口');
 for(const cid of ['one','two'])run('INSERT INTO live_communities(id,owner_id,name,city,data,status,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',cid,'owner',cid,'高崎市','{}','VERIFIED',stamp,stamp);
 for(const [aid,cid] of [['a1','one'],['a2','one'],['a3','two']])run('INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,status,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',aid,cid,aid,'2026-01-01','2026-01-02',100,'{}','CLOSED',stamp,stamp);
 const users=Array.from({length:25},(_,i)=>({id:'u'+i}));
 for(const [i,u] of users.entries()){run('INSERT INTO accounts VALUES(?,?)',u.id,'非公開ニックネーム'+i);run('INSERT INTO live_applications VALUES(?,?,?,?,?,?,?,?,?)','p'+i,'a1',u.id,'見学','',0,0,i<21?'DONE':['APPLIED','DECLINED','CANCELLED','APPROVED'][i-21],stamp);}
 // Sample workspace history and client-supplied totals have no role in the aggregate.
 run('INSERT INTO live_applications VALUES(?,?,?,?,?,?,?,?,?)','repeat','a2','u0','体験参加','',0,0,'DONE',stamp);
 run('INSERT INTO live_applications VALUES(?,?,?,?,?,?,?,?,?)','elsewhere','a3','u0','体験参加','',0,0,'DONE',stamp);
 const stats=(await api('dashboard',{id:'owner'})).data.communities.find(c=>c.id==='one').retention;assert.deepEqual(stats,{attendances:22,people:21,repeatPeople:1,eligible:21,returned:1});
 const sample={rating:1,text:'地域の皆さんと交流できた体験の感想です。',anonymous:true,points:99999,user_id:'owner'};
 assert.equal((await api('reviews/a1',null,sample)).status,401);
 for(const u of users.slice(21))assert.equal((await api('reviews/a1',u,sample)).status,403);
 for(const invalid of [{rating:0},{rating:6},{rating:2.5},{rating:'5'},{text:'短い'},{text:'a'.repeat(1001)},{anonymous:'false'}])assert.equal((await api('reviews/a1',users[0],{...sample,...invalid})).status,400);
 for(const u of users.slice(0,21))assert.equal((await api('reviews/a1',u,sample)).status,201);
 assert.equal((await api('reviews/a2',users[0],sample)).status,201);
 const catalog=(await api('catalog')).data;assert.deepEqual(catalog.communities.find(c=>c.id==='one').buzz,{participants:22,reviews:22,saves:0,views:0,points:880});assert.deepEqual(catalog.communities.find(c=>c.id==='two').buzz,{participants:1,reviews:0,saves:0,views:0,points:30});
 run('UPDATE live_reviews SET anonymous=0');
 const first=(await api('community-reviews/one')).data,second=(await api('community-reviews/one?offset=20')).data;
 assert.equal(first.reviews.length,20);assert.equal(first.total,22);assert.equal(first.nextOffset,20);assert.equal(second.reviews.length,2);assert.equal(second.nextOffset,null);assert.equal(new Set([...first.reviews,...second.reviews].map(r=>r.id)).size,22);
 assert(!JSON.stringify(first).includes('非公開ニックネーム'));assert(first.reviews.every(r=>!('user_id' in r)&&!('nickname' in r)));
 assert.equal((await api('community-reviews/one?offset=-1')).status,400);
 run("UPDATE live_communities SET status='SUSPENDED' WHERE id='one'");assert.equal((await api('community-reviews/one')).status,404);assert.equal((await api('reviews/a1')).status,404);assert.equal((await api('catalog')).data.communities.length,1);
 // Authors can remove their own text even after their community is hidden.
 await api('reviews/a1/delete',users[0],{});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM live_reviews WHERE user_id=?').get('u0').n,1);
 run("UPDATE live_communities SET status='VERIFIED',paused=1 WHERE id='one'");assert.equal((await api('community-reviews/one')).status,404);
 console.log('PASS: repeat participation across activities, community isolation, status filtering, review validation, pagination, anonymous identity protection, hidden-community privacy and deletion');
}finally{service.close();db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
