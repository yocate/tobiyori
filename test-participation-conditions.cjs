const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {createCommunityService}=require('./community-service.cjs');
const {evaluate,cleanPreferences}=require('./participation-conditions.cjs');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE accounts(id TEXT PRIMARY KEY,nickname TEXT); CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,content TEXT,revision INTEGER DEFAULT 0);');
const admin={id:'admin'},owner={id:'owner'},student={id:'student'},waiting={id:'waiting'},other={id:'other'};
for(const u of [admin,owner,student,waiting,other])db.prepare('INSERT INTO accounts VALUES(?,?)').run(u.id,u.id);
const service=createCommunityService({db});db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(admin.id);
async function api(route,user,body){let result;try{await service.handle({req:{method:body===undefined?'GET':'POST',headers:{'x-tobiyori-account':user?.id}},res:{},url:new URL('http://local/api/live/'+route),user,readBody:async()=>body,respond:(_r,status,data)=>result={status,data}});}catch(e){result={status:e.status||500,data:{error:e.message}};}return result;}
async function ok(route,user,body){const r=await api(route,user,body);assert(r.status<300,JSON.stringify({route,...r}));return r.data;}
const details={title:'参加条件の検証活動',startsAt:'2030-10-05T01:00:00Z',endsAt:'2030-10-05T03:00:00Z',capacity:5,genre:'学習支援',feeAmount:0,fees:'無料',activityCity:'高崎市',...Object.fromEntries(['purpose','tasks','staff','requirements','belongings','risk','insurance','photoPolicy','transport','prohibited','location','emergency'].map(k=>[k,k==='location'?'PRIVATE_OLD_PLACE':k==='emergency'?'PRIVATE_CONTACT':'案内']))};
function saved(uid,profile){db.prepare('INSERT INTO workspaces(user_id,content) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET content=excluded.content').run(uid,JSON.stringify({profile}));}
async function owned(aid){return (await ok('dashboard',owner)).activities.find(a=>a.id===aid);}
async function propose(aid,data){const a=await owned(aid);return ok('activities/'+aid+'/propose-change',owner,{...data,baseUpdatedAt:a.updatedAt});}
(async()=>{try{
 const saturday=['日','月','火','水','木','金','土'][new Date(details.startsAt).getUTCDay()];
 saved(student.id,{days:[saturday],areas:['高崎市'],year:'大学1年',participation:{budget:1000,from:'09:00',until:'17:00'}});
 saved(waiting.id,{days:['日'],areas:['前橋市'],participation:{budget:3000,from:'09:00',until:'20:00'}});
 const cid=(await ok('communities',admin,{name:'検証団体',type:'地域団体',city:'高崎市',intro:'検証のみ',adminInfo:{consentConfirmed:true}})).id;
 await ok('review/'+cid+'/approve',admin,{type:'community',note:'検証',identityChecked:true});
 db.prepare('UPDATE live_communities SET owner_id=? WHERE id=?').run(owner.id,cid);
 const aid=(await ok('activities',owner,{communityId:cid})).id;
 await ok('activities/'+aid,owner,details);await ok('activities/'+aid+'/submit',owner,{});await ok('review/'+aid+'/approve',admin,{type:'activity',note:'検証'});
 const app=(await ok('apply/'+aid,student,{kind:'体験参加'})).id,wait=(await ok('apply/'+aid,waiting,{kind:'体験参加'})).id;
 await ok('applications/'+app+'/approve',owner,{});
 assert.equal((await api('activities/'+aid,owner,details)).status,409);
 const changes={...details,startsAt:'2030-10-06T09:00:00Z',endsAt:'2030-10-06T10:00:00Z',feeAmount:2000,fees:'参加費2000円',activityCity:'前橋市',location:'PRIVATE_NEW_PLACE'};
 assert.equal((await api('activities/'+aid+'/propose-change',other,{...changes,baseUpdatedAt:(await owned(aid)).updatedAt})).status,403);
 assert.equal((await api('activities/'+aid+'/propose-change',owner,{...changes,baseUpdatedAt:'stale'})).status,409);
 assert.equal((await api('activities/'+aid+'/propose-change',owner,{...changes,feeAmount:-1,baseUpdatedAt:(await owned(aid)).updatedAt})).status,400);
 const proposal=await propose(aid,changes);
 assert.equal((await ok('catalog')).activities.length,0);
 assert.equal((await api('apply/'+aid,other,{kind:'見学'})).status,409);
 assert.equal((await api('applications/'+wait+'/approve',owner,{})).status,409);
 let p=(await ok('dashboard',student)).applications[0];assert(p.conditionChange.pending);assert.equal(p.activity.startsAt,new Date(details.startsAt).toISOString());assert.equal(p.activity.location,details.location);
 const queue=(await ok('review',admin)).activityChanges;assert.equal(queue[0].id,proposal.changeId);assert(queue[0].differences.some(d=>d.key==='feeAmount'));
 assert.equal((await api('review/'+aid+'/approve',owner,{type:'activity',changeId:proposal.changeId,note:'不可'})).status,403);
 assert.equal((await api('review/'+aid+'/approve',admin,{type:'activity',changeId:'stale',note:'不可'})).status,409);
 await ok('review/'+aid+'/approve',admin,{type:'activity',changeId:proposal.changeId,note:'変更内容を確認'});
 assert.equal((await ok('catalog')).activities[0].feeAmount,2000);
 assert(!JSON.stringify(await ok('catalog')).includes('PRIVATE_'));
 p=(await ok('dashboard',student)).applications[0];assert.equal(p.status,'APPROVED');assert(p.conditionChange.needsConfirmation);assert.equal(p.activity.location,changes.location);
 assert.deepEqual(p.conditionChange.checks.filter(c=>c.status==='mismatch').map(c=>c.key),['days','time','budget','area']);
 assert(p.conditionChange.checks.find(c=>c.key==='budget').message.includes('1,000円'));
 const pending=(await ok('dashboard',waiting)).applications[0];assert(!JSON.stringify(pending).includes('PRIVATE_'));assert.equal(pending.conditionChange.checks.filter(c=>c.status==='mismatch').length,0);
 const ownerDash=await ok('dashboard',owner);assert(!JSON.stringify(ownerDash.applications).includes('希望予算'));assert(ownerDash.applications.every(a=>!a.conditionChange.checks));
 const notices=(await ok('dashboard',student)).notifications.filter(n=>n.unique_key?.startsWith('condition-change:'));assert.equal(notices.length,1);
 await ok('dashboard',student);assert.equal((await ok('dashboard',student)).notifications.filter(n=>n.unique_key?.startsWith('condition-change:')).length,1);
 assert.equal((await api('condition-changes/'+proposal.changeId+'/ack',other,{})).status,404);
 await ok('condition-changes/'+proposal.changeId+'/ack',student,{});await ok('condition-changes/'+proposal.changeId+'/ack',student,{});
 assert((await ok('dashboard',student)).applications[0].conditionChange.ackAt);
 assert.equal((await api('applications/'+wait+'/approve',owner,{})).status,409);
 await ok('condition-changes/'+proposal.changeId+'/ack',waiting,{});await ok('applications/'+wait+'/approve',owner,{});
 const unknown=await propose(aid,{...changes,feeAmount:null});await ok('review/'+aid+'/approve',admin,{type:'activity',changeId:unknown.changeId,note:'金額の未確認を明示'});
 p=(await ok('dashboard',student)).applications[0];assert.equal(p.conditionChange.checks.find(c=>c.key==='budget').status,'unknown');assert(!p.conditionChange.ackAt);
 assert.equal((await api('condition-changes/'+proposal.changeId+'/ack',student,{})).status,409);
 const rejected=await propose(aid,{...changes,feeAmount:5000});await ok('review/'+aid+'/return',admin,{type:'activity',changeId:rejected.changeId,note:'条件を再確認してください'});
 assert.equal((await ok('catalog')).activities[0].feeAmount,null);assert.equal((await ok('review',admin)).activityChanges.length,0);
 assert.throws(()=>cleanPreferences({budget:-1}),/上限/);assert.throws(()=>cleanPreferences({from:'18:00',until:'09:00'}),/時間帯/);
 assert.equal(evaluate({startsAt:'2030-10-04T15:30:00Z',endsAt:'2030-10-04T16:00:00Z',feeAmount:0},{days:[saturday],participation:{budget:0,from:'00:00',until:'02:00'}}).find(c=>c.key==='days').status,'match');
 assert.equal(evaluate({startsAt:details.startsAt,endsAt:details.endsAt,feeAmount:2000},{}).find(c=>c.key==='budget').status,'unset');
 // 所属メンバー限定の活動は、明示的な所属確認が必要。
 const membersOnly=(await ok('activities',owner,{communityId:cid})).id;
 await ok('activities/'+membersOnly,owner,{...details,participationScope:'members'});await ok('activities/'+membersOnly+'/submit',owner,{});await ok('review/'+membersOnly+'/approve',admin,{type:'activity',note:'検証'});
 for(const confirmation of [{},{memberConfirmed:false},{memberConfirmed:'true'}]){
  const rejected=await api('apply/'+membersOnly,other,{kind:'体験参加',...confirmation});
  assert.equal(rejected.status,400);assert.equal(rejected.data.error,'この活動は団体の所属メンバーのみ申し込めます。所属していることを確認してください。');
 }
 assert.equal((await api('apply/'+membersOnly,other,{kind:'体験参加',memberConfirmed:true})).status,201);
 console.log('PASS: reviewed update → automatic personal checks → private diffs → notifications → acknowledgement; intake pause, roles, stale versions, duplicate prevention, changed preferences, unknown values, JST and rejection.');
}finally{service.close();db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
