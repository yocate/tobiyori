const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createCommunityEngagement}=require('./community-engagement.cjs');
const raw=new DatabaseSync(':memory:');
let reads=0;
const db={exec:sql=>raw.exec(sql),prepare(sql){const stmt=raw.prepare(sql);return {get(...args){reads++;return stmt.get(...args);},all(...args){reads++;return stmt.all(...args);},run:(...args)=>stmt.run(...args)};}};
raw.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE accounts(id TEXT PRIMARY KEY);
 CREATE TABLE account_roles(user_id TEXT PRIMARY KEY REFERENCES accounts(id),role TEXT);
 CREATE TABLE live_communities(id TEXT PRIMARY KEY,owner_id TEXT REFERENCES accounts(id));
 CREATE TABLE live_activities(id TEXT PRIMARY KEY,community_id TEXT REFERENCES live_communities(id));
 CREATE TABLE live_applications(activity_id TEXT REFERENCES live_activities(id),user_id TEXT REFERENCES accounts(id),status TEXT,PRIMARY KEY(activity_id,user_id));
 CREATE TABLE live_reviews(activity_id TEXT REFERENCES live_activities(id),user_id TEXT REFERENCES accounts(id),PRIMARY KEY(activity_id,user_id));`);
const time=Date.parse('2026-10-30T03:00:00Z');
const engagement=createCommunityEngagement({db,clock:()=>time});
const run=(sql,...args)=>raw.prepare(sql).run(...args);
const zero={participants:0,reviews:0,saves:0,views:0,points:0};
try{
 reads=0;assert.equal(engagement.buzzAll().size,0);assert.equal(reads,4,'空DBでも定数回のSQL');
 for(const uid of ['owner','owner2','admin','student','other','no-application'])run('INSERT INTO accounts VALUES(?)',uid);
 run("INSERT INTO account_roles VALUES('admin','ADMIN')");
 for(const [cid,uid] of [['one','owner'],['two','owner2'],['empty','owner']])run('INSERT INTO live_communities VALUES(?,?)',cid,uid);
 for(const [aid,cid] of [['a','one'],['b','one'],['c','two']])run('INSERT INTO live_activities VALUES(?,?)',aid,cid);
 // 参加・レビューの管理者除外は既存仕様にはない。保存・閲覧だけを除外する。
 for(const [aid,uid,status] of [['a','student','DONE'],['a','owner','DONE'],['a','admin','DONE'],['b','student','DONE'],['a','other','APPROVED'],['c','other','DONE']])run('INSERT INTO live_applications VALUES(?,?,?)',aid,uid,status);
 for(const [aid,uid] of [['a','student'],['a','owner'],['a','admin'],['b','student'],['a','other'],['c','other'],['c','no-application']])run('INSERT INTO live_reviews VALUES(?,?)',aid,uid);
 for(const uid of ['owner','owner2','admin','student','other'])engagement.setSaved('one',uid,true);
 for(const uid of ['owner','owner2','admin','other'])engagement.setSaved('two',uid,true);
 for(const [uid,day] of [['student','2026-10-01'],['student','2026-10-30'],['other','2026-10-15'],['owner2','2026-10-30'],['owner','2026-10-30'],['admin','2026-10-30'],['student','2026-09-30'],['student','2026-10-31']])run('INSERT INTO live_community_views VALUES(?,?,?)','one',uid,day);
 for(const uid of ['owner','owner2','admin','other'])run('INSERT INTO live_community_views VALUES(?,?,?)','two',uid,'2026-10-30');
 reads=0;const totals=engagement.buzzAll();assert.equal(reads,4,'団体・活動数によらず4回で集計');
 assert.deepEqual(totals.get('one'),{participants:4,reviews:4,saves:3,views:4,points:179});
 assert.deepEqual(totals.get('two'),{participants:1,reviews:1,saves:2,views:2,points:52});
 assert(!totals.has('empty'),'集計対象のない団体は呼び出し側で0を補う');
 for(const cid of ['one','two','empty'])assert.deepEqual(totals.get(cid)||zero,engagement.buzz(cid),cid+'の旧集計結果と一致');
 // 団体数を増やしても個別 COUNT は発行しない。
 for(let i=0;i<500;i++){run('INSERT INTO live_communities VALUES(?,?)','extra-'+i,'owner');engagement.setSaved('extra-'+i,'student',true);}
 reads=0;const large=engagement.buzzAll();assert.equal(reads,4);assert.equal(large.size,502);
 assert.deepEqual(large.get('extra-499'),{participants:0,reviews:0,saves:1,views:0,points:5});
 console.log('PASS: grouped catalogue engagement matches per-community counts, DONE-only reviews, owner/admin save-view exclusion, inclusive JST 30-day window, zero fallback and constant 4 SQL queries');
}finally{raw.close();}
