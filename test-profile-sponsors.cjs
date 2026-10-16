const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createCommunityService}=require('./community-service.cjs');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE accounts(id TEXT PRIMARY KEY,nickname TEXT,email TEXT);CREATE TABLE workspaces(user_id TEXT PRIMARY KEY REFERENCES accounts(id),content TEXT NOT NULL);');
const admin={id:'admin'},student={id:'student'},off={id:'off'},high={id:'high'},other={id:'other'},companyOpt={id:'companyOpt'};
for(const u of [admin,student,off,high,other,companyOpt]){db.prepare('INSERT INTO accounts VALUES(?,?,?)').run(u.id,u.id,u.id+'@example.test');const profile={interests:['study'],areas:['高崎市'],year:u===high?'高校生':'大学1年生',receiveOffers:u!==off,receiveCompanyOffers:u===companyOpt};db.prepare('INSERT INTO workspaces VALUES(?,?)').run(u.id,JSON.stringify({profile}));}
const service=createCommunityService({db});db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(admin.id);
async function api(route,user=null,input){let result;try{await service.handle({req:{method:input?'POST':'GET',headers:{'x-tobiyori-account':user?.id}},res:{},url:new URL('http://localhost/api/live/'+route),user,readBody:async()=>input,respond:(_,status,data)=>result={status,data}});}catch(e){result={status:e.status||500,data:{error:e.message}};}return result;}
async function ok(route,user,input){const r=await api(route,user,input);assert(r.status<300,JSON.stringify({route,...r}));return r.data;}
const orgData={name:'検証大学サークル',city:'高崎市',type:'学生団体・サークル',sector:'campus',university:'高崎経済大学',partnerUniversities:'高崎商科大学',intro:'検証用です',genres:['学習支援'],campusName:'検証キャンパス',recognition:'recognized',recognitionSource:'https://example.edu/circles',fees:'年1,000円',highSchoolVisits:'公開イベントで見学可',publicLat:'36.324567',publicLng:'139.001234',adminInfo:{consentConfirmed:true}};
async function makeOrg(data=orgData){const c=await ok('communities',admin,data);await ok('review/'+c.id+'/approve',admin,{type:'community',note:'検証',identityChecked:true,consentChecked:true});return c.id;}
async function makeActivity(cid,extras={}){const a=await ok('activities',admin,{communityId:cid});const data={title:'公開済みの検証活動',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),capacity:10,genre:'学習支援',fees:'無料',remuneration:'なし',highSchoolParticipation:'no',...Object.fromEntries(['purpose','tasks','staff','requirements','belongings','risk','insurance','photoPolicy','transport','prohibited','location','emergency'].map(k=>[k,k==='location'?'PRIVATE_EXACT_PLACE':'説明'])),...extras};await ok('activities/'+a.id,admin,data);await ok('activities/'+a.id+'/submit',admin,{});await ok('review/'+a.id+'/approve',admin,{type:'activity',note:'検証'});return a.id;}
(async()=>{try{
 assert.equal((await api('communities',admin,{...orgData,recognitionSource:''})).status,400);
 const cid=await makeOrg(),aid=await makeActivity(cid);
 const pub=(await ok('catalog')).communities[0];assert.deepEqual(pub.publicPoint,[36.32,139]);assert.deepEqual(pub.partnerUniversities,['高崎商科大学']);assert.equal(pub.recognition,'recognized');
 assert(!JSON.stringify(await ok('catalog')).includes('PRIVATE_EXACT_PLACE'));
 await ok('communities/'+cid,admin,{...orgData,name:'変更後のサークル'});assert.equal((await ok('catalog')).communities[0].name,orgData.name);
 assert.equal((await ok('review',admin)).communities[0].pendingChange.name,'変更後のサークル');
 await ok('review/'+cid+'/approve',admin,{type:'community',note:'変更を確認',identityChecked:true,consentChecked:true});assert.equal((await ok('catalog')).communities[0].name,'変更後のサークル');
 const p=await ok('apply/'+aid,student,{kind:'見学',year:'大学1年生'});await ok('applications/'+p.id+'/cancel',student,{});const pAgain=await ok('apply/'+aid,student,{kind:'体験参加',year:'大学1年生'});assert.equal(p.id,pAgain.id);
 await ok('applications/'+p.id+'/approve',admin,{});
 await ok('communities/'+cid,admin,{...orgData,name:'再変更'});await ok('activity-messages/'+aid,student,{body:'変更確認中も連絡できます'});await ok('review/'+cid+'/return',admin,{type:'community',note:'修正してください'});assert.equal((await ok('catalog')).communities[0].name,'変更後のサークル');
 assert.equal((await api('apply/'+aid,high,{kind:'体験参加',year:'高校生',minor:true,guardian:true})).status,400);
 const report=await ok('reports',student,{communityId:cid,activityId:aid,kind:'相談',body:'運営だけへの相談です'});
 assert.equal((await ok('reports',other)).reports.length,0);assert.equal((await ok('reports',admin)).reports.length,1);assert(!('user_id' in (await ok('reports',admin)).reports[0]));
 assert.equal((await api('reports/'+report.id,other,{status:'RESOLVED'})).status,403);
 await ok('reports/'+report.id,admin,{status:'WORKING',reply:'確認します'});assert.equal((await ok('reports',student)).reports[0].reply,'確認します');
 await ok('drafts/community-new',admin,{content:{name:'下書き'}});assert.equal((await ok('drafts/community-new',student)).draft,null);assert.equal((await api('drafts/community-new',student,{content:{name:'不正'}})).status,403);
 assert.equal((await api('offers/'+aid+'/send',student,{interest:'study',body:'招待'})).status,403);
 const sent=await ok('offers/'+aid+'/send',admin,{interest:'study',city:'高崎市',body:'見学から参加してみませんか？'});assert.equal(sent.sent,2);
 assert.equal((await ok('offers',off)).offers.length,0);assert.equal((await ok('offers',high)).offers.length,0);
 const offered=(await ok('offers',other)).offers[0];assert(offered.available);assert(!JSON.stringify(offered).includes('PRIVATE_EXACT_PLACE'));assert(!('user_id' in offered));
 assert.equal((await api('offers/'+offered.id,student,{status:'DECLINED'})).status,404);await ok('offers/'+offered.id,other,{status:'DECLINED'});
 assert.equal((await api('offers/'+aid+'/send',admin,{interest:'study',body:'再送'})).status,429);
 const company=await makeOrg({...orgData,name:'検証企業',sector:'company',type:'企業・店舗',recognition:'unconfirmed',recognitionSource:''});const companyAct=await makeActivity(company);
 assert.equal((await ok('offers/'+companyAct+'/send',admin,{interest:'study',body:'企業の地域活動です'})).sent,1);
 await ok('blocks/'+cid,student,{block:true});assert.equal((await ok('catalog',student)).communities.some(c=>c.id===cid),false);assert.equal((await ok('dashboard',student)).applications[0].status,'CANCELLED');assert.equal((await api('activity-messages/'+aid,student)).status,403);assert.equal((await api('apply/'+aid,student,{kind:'見学'})).status,400);
 await ok('blocks/'+cid,student,{block:false});await ok('apply/'+aid,student,{kind:'見学'});await ok('applications/'+p.id+'/approve',admin,{});
 await ok('activities/'+aid+'/cancel',admin,{reason:'開催中止の検証'});assert.equal((await ok('dashboard',student)).applications[0].status,'CANCELLED');assert.equal((await ok('offers',companyOpt)).offers.find(o=>o.id===offered.id)?.available,undefined);
 await ok('communities/'+cid+'/transfer',admin,{email:'other@example.test'});assert.equal((await ok('dashboard',other)).communities[0].id,cid);assert.equal((await api('activities',admin,{communityId:cid})).status,403);

 const sponsor=await makeOrg({...orgData,name:'協賛のみ団体',sponsorListed:true,sponsorMessage:'試験用'});
 const sponsorPublic=(await ok('catalog')).communities.find(c=>c.id===sponsor);assert(sponsorPublic.sponsorListed);assert(!(await ok('catalog')).activities.some(a=>a.communityId===sponsor));
 assert.equal((await api('communities/'+sponsor,student,{...orgData,sponsorListed:true})).status,403);
 const skillOrg=await makeOrg({...orgData,name:'写真ボランティア'}),skillAct=await makeActivity(skillOrg,{title:'写真撮影の手伝い',tasks:'イベントの写真を撮影します'});
 const setProfile=(u,p)=>db.prepare('UPDATE workspaces SET content=? WHERE user_id=?').run(JSON.stringify({profile:{year:'大学1年生',...p}}),u.id);
 setProfile(student,{skills:'カメラと写真撮影が得意です。',useSkillsMatching:true,receiveOffers:true});
 setProfile(other,{skills:'写真を撮ります',useSkillsMatching:false,receiveOffers:true});
 setProfile(companyOpt,{skills:'写真が得意',useSkillsMatching:true,excludedSkills:['photo'],receiveOffers:true});
 assert.equal((await ok('offers/'+skillAct+'/send',admin,{skill:'photo',body:'撮影の体験にご参加ください'})).sent,1);
 const invitation=(await ok('offers',student)).offers.find(o=>o.activity?.id===skillAct);assert(invitation.reason.includes('写真・撮影'));assert(!JSON.stringify(invitation).includes('カメラと写真撮影が得意です'));
 assert(!('retention' in sponsorPublic));assert((await ok('dashboard',admin)).communities.find(c=>c.id===sponsor).retention);
 console.log('PASS: real catalogue metadata, approximate locations, approval of pending changes, continued messaging, reapplication, high-school eligibility, private reports, scoped drafts, opt-in offers, enterprise consent, ownership, rate limits, block/cancel and handover');
}finally{service.close();db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
