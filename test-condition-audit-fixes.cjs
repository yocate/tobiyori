// 条件変更の累積確認・公開項目の差分・古い審査操作の回帰テスト。
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createCommunityService}=require('./community-service.cjs');
const {snapshot,difference}=require('./participation-conditions.cjs');
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;CREATE TABLE accounts(id TEXT PRIMARY KEY,nickname TEXT);CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,content TEXT);');
for(const uid of ['owner','admin','approved','pending'])db.prepare('INSERT INTO accounts VALUES(?,?)').run(uid,uid);
const service=createCommunityService({db,schedule:false});
db.prepare("INSERT INTO account_roles VALUES('admin','ADMIN')").run();
const when=new Date().toISOString();
const data={purpose:'活動目的',tasks:'受付',staff:'担当者',requirements:'参加条件',belongings:'水筒',risk:'転倒に注意',insurance:'保険加入',photoPolicy:'同意後に撮影',transport:'電車',prohibited:'勧誘禁止',location:'PRIVATE_OLD_PLACE',emergency:'PRIVATE_CONTACT',feeAmount:0,fees:'無料',remuneration:'なし',transportFee:'なし',genre:'文化'};
db.prepare('INSERT INTO live_communities(id,owner_id,name,city,data,status,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('org','owner','検証団体','前橋市','{}','VERIFIED',when,when);
db.prepare('INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,status,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('a','org','変更確認の活動','2030-12-01T01:00:00.000Z','2030-12-01T04:00:00.000Z',10,JSON.stringify(data),'PUBLISHED',when,when);
async function api(route,uid,body){let result;try{await service.handle({req:{method:body===undefined?'GET':'POST',headers:{'x-tobiyori-account':uid}},res:{},url:new URL('http://audit.local/api/live/'+route),user:{id:uid},readBody:async()=>body,respond:(_,status,value)=>result={status,value}});}catch(e){result={status:e.status||500,value:{error:e.message}};}return result;}
async function ok(route,uid,body){const r=await api(route,uid,body);assert(r.status<300,JSON.stringify({route,...r}));return r.value;}
const current=()=>db.prepare("SELECT * FROM live_activities WHERE id='a'").get();
async function change(overrides){const row=current();const proposal=await ok('activities/a/propose-change','owner',{...JSON.parse(row.data),title:row.title,startsAt:row.starts_at,endsAt:row.ends_at,capacity:row.capacity,...overrides,baseUpdatedAt:row.updated_at});await ok('review/a/approve','admin',{type:'activity',changeId:proposal.changeId,note:'内容を確認しました'});return proposal.changeId;}
async function application(uid){return (await ok('dashboard',uid)).applications.find(p=>p.activity_id==='a');}
(async()=>{try{
 const approved=(await ok('apply/a','approved',{kind:'体験参加',minor:false,guardian:false})).id;
 const pending=(await ok('apply/a','pending',{kind:'体験参加',minor:false,guardian:false})).id;
 await ok('applications/'+approved+'/approve','owner',{});
 const first=await change({feeAmount:5000,fees:'5000円',location:'PRIVATE_NEW_PLACE'});
 const second=await change({startsAt:'2030-12-01T02:00:00.000Z'});
 let state=(await application('approved')).conditionChange;
 assert.equal(state.changeId,second);assert.equal(state.needsConfirmation,true);
 const fee=state.differences.find(d=>d.key==='feeAmount');assert.deepEqual([fee.before,fee.after],[0,5000]);
 assert(state.differences.some(d=>d.key==='startsAt'));
 assert.equal(state.differences.find(d=>d.key==='location').after,'PRIVATE_NEW_PLACE');
 const privateState=(await application('pending')).conditionChange;
 assert(!JSON.stringify(privateState).includes('PRIVATE_'));
 assert.equal(privateState.differences.find(d=>d.key==='location').after,'承認後に表示');
 let owned=(await ok('dashboard','owner')).applications.find(p=>p.id===approved).conditionChange;
 assert.equal(owned.needsConfirmation,true);assert.equal(owned.differences,undefined);
 assert.equal((await api('condition-changes/'+first+'/ack','approved',{})).status,409);
 await ok('condition-changes/'+second+'/ack','approved',{});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM live_condition_receipts WHERE application_id=? AND ack_at IS NULL').get(approved).n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM live_condition_receipts WHERE application_id=? AND ack_at IS NULL').get(pending).n,2);
 assert.equal((await application('approved')).conditionChange.needsConfirmation,false);
 owned=(await ok('dashboard','owner')).applications.find(p=>p.id===approved).conditionChange;assert.equal(owned.needsConfirmation,false);
 // 旧版の不整合（最新だけ確認済み、過去は未確認）も見落とさず、再確認で解消する。
 db.prepare('UPDATE live_condition_receipts SET ack_at=NULL WHERE change_id=? AND application_id=?').run(first,approved);
 assert.equal((await application('approved')).conditionChange.needsConfirmation,true);
 await ok('condition-changes/'+second+'/ack','approved',{});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM live_condition_receipts WHERE application_id=? AND ack_at IS NULL').get(approved).n,0);
 // 公開される参加判断の項目を保存履歴と差分に含める。
 const changedFields={title:'新しい活動名',capacity:12,purpose:'新しい目的',tasks:'屋外作業',belongings:'作業用手袋',prohibited:'立入禁止区域あり',remuneration:'謝礼1000円',transportFee:'実費支給',parking:'yes',frequency:'continuous',genre:'自然',beginner:true,help:true};
 const third=await change(changedFields);
 state=(await application('approved')).conditionChange;
 for(const key of Object.keys(changedFields))assert(state.differences.some(d=>d.key===key),key+'を差分に含める');
 assert(!state.differences.some(d=>d.key==='feeAmount'),'確認済みの料金変更を再表示しない');
 assert.equal(state.differences.find(d=>d.key==='belongings').before,'水筒');
 assert.equal((await api('review/a/return','admin',{type:'activity',changeId:third,note:'古い画面からの差戻し'})).status,409);
 assert.equal((await api('review/a/approve','admin',{type:'activity',changeId:third,note:'重複承認'})).status,409);
 assert.equal(current().status,'PUBLISHED');
 // 旧snapshotに存在しない項目は空文字に捏造しない。旧履歴のみなら新項目の差分は増えない。
 const legacy={startsAt:'2030-12-01T01:00:00.000Z',endsAt:'2030-12-01T04:00:00.000Z',feeAmount:0};
 assert.equal(difference(legacy,{...legacy,feeAmount:100}).length,1);
 const expanded=snapshot(current());
 assert.equal(difference(legacy,expanded).find(d=>d.key==='tasks').before,'旧記録なし');
 assert(!JSON.stringify(difference(legacy,expanded)).includes('PRIVATE_'));
 const oldBefore=JSON.parse(db.prepare('SELECT before_data FROM live_condition_changes WHERE id=?').get(first).before_data);
 delete oldBefore.tasks;delete oldBefore.belongings;
 db.prepare('UPDATE live_condition_changes SET before_data=? WHERE id=?').run(JSON.stringify(oldBefore),first);
 assert.equal((await application('pending')).conditionChange.differences.find(d=>d.key==='tasks').before,'旧記録なし','旧保存履歴からの累積表示にも対応');
 // 再申込みより前の未確認履歴を表示・確認対象に混ぜない。
 await ok('applications/'+pending+'/cancel','pending',{});
 await ok('apply/a','pending',{kind:'体験参加',minor:false,guardian:false});
 const reappliedAt=db.prepare('SELECT created_at FROM live_applications WHERE id=?').get(pending).created_at;
 db.prepare('UPDATE live_condition_changes SET created_at=?').run(reappliedAt);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM live_condition_receipts WHERE application_id=?').get(pending).n,0,'同じミリ秒でも再申込み前のreceiptを引き継がない');
 assert.equal((await application('pending')).conditionChange.needsConfirmation,undefined);
 assert.equal((await api('condition-changes/'+third+'/ack','pending',{})).status,404);
 const fourth=await change({belongings:'手袋と帽子'});
 state=(await application('pending')).conditionChange;
 assert.deepEqual(state.differences.filter(d=>d.key==='belongings').map(d=>[d.before,d.after]),[['作業用手袋','手袋と帽子']]);
 assert(!state.differences.some(d=>d.key==='feeAmount'));
 await ok('condition-changes/'+fourth+'/ack','pending',{});
 assert.equal(db.prepare('SELECT ack_at FROM live_condition_receipts WHERE application_id=? AND change_id=?').get(pending,fourth).ack_at!==null,true);
 console.log('PASS: cumulative unacknowledged changes, scoped acknowledgements, expanded public fields, private-location masking, legacy snapshots, stale review actions and reapplication boundary');
}finally{service.close();db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
