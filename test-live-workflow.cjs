const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-workflow-')),base='http://127.0.0.1:4188';
let server;
async function start(){server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:'4188',TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});let output='';server.stderr.on('data',chunk=>output+=chunk);server.on('error',e=>output+=e.message);for(let i=0;i<400;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Test server not ready: '+output);}
async function stop(){if(!server||server.exitCode!==null)return;const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;}
function editDB(fn){const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));try{fn(db);}finally{db.close();}}
async function api(route,user,body){const headers={Origin:base};if(user){headers.Cookie=user.cookie;headers['X-Tobiyori-Account']=user.id;}if(body)headers['Content-Type']='application/json';const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
async function ok(route,user,body){const r=await api(route,user,body);assert(r.status<300,JSON.stringify({route,...r}));return r.data;}
async function signup(name){const r=await api('register',null,{email:name+'@example.test',password:'local-workflow-test-123',nickname:name,consent:true});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie.split(';')[0]};}
(async()=>{try{
 await start();const operator=await signup('operator'),student=await signup('student'),peer=await signup('peer'),waiting=await signup('waiting');
 editDB(db=>db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(operator.id));
 const c=await ok('live/communities',operator,{name:'検証専用コミュニティ',city:'高崎市',type:'学生団体',intro:'実在しない検証用データ',adminInfo:{notes:'PRIVATE_OPERATOR_NOTE',consentConfirmed:true}});
 assert.equal((await ok('live/catalog')).communities.length,0);
 await ok('live/review/'+c.id+'/approve',operator,{type:'community',note:'検証用の確認',identityChecked:true,consentChecked:true});
 await ok('live/follow/'+c.id,student,{follow:true});
 const a=await ok('live/activities',operator,{communityId:c.id});
 const activity={title:'検証用の地域活動',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),capacity:2,genre:'学習支援',purpose:'目的',tasks:'学習支援',staff:'団体窓口',requirements:'初参加歓迎',belongings:'飲み物',risk:'転倒に注意',insurance:'検証用の保険情報',photoPolicy:'同意なく撮影しない',transport:'駅から徒歩',prohibited:'勧誘禁止',location:'PRIVATE_MEETING_PLACE',emergency:'PRIVATE_EMERGENCY'};
 await ok('live/activities/'+a.id,operator,activity);await ok('live/activities/'+a.id+'/submit',operator,{});await ok('live/review/'+a.id+'/approve',operator,{type:'activity',note:'検証用の安全確認'});
 const catalog=await ok('live/catalog');assert.equal(catalog.activities.length,1);assert(!JSON.stringify(catalog).includes('PRIVATE_'));
 assert((await ok('live/dashboard',student)).notifications.some(n=>n.body.includes('フォロー中')));
 const p1=await ok('live/apply/'+a.id,student,{kind:'体験参加'}),p2=await ok('live/apply/'+a.id,peer,{kind:'見学'}),p3=await ok('live/apply/'+a.id,waiting,{kind:'体験参加'});
 assert.equal((await api('live/activity-messages/'+a.id,student)).status,403);
 assert.equal((await api('live/reviews/'+a.id,student,{rating:5,text:'まだ参加が完了していない口コミです。',anonymous:true})).status,403);
 assert(!JSON.stringify(await ok('live/dashboard',student)).includes('PRIVATE_MEETING_PLACE'));
 await ok('live/applications/'+p1.id+'/approve',operator,{});await ok('live/applications/'+p2.id+'/approve',operator,{});
 assert.equal((await api('live/applications/'+p3.id+'/approve',operator,{})).status,409);
 assert(JSON.stringify(await ok('live/dashboard',student)).includes('PRIVATE_MEETING_PLACE'));
 await ok('live/activity-messages/'+a.id,operator,{body:'集合前の案内です'});await ok('live/activity-messages/'+a.id,student,{body:'当日はよろしくお願いします'});
 assert.equal((await ok('live/activity-messages/'+a.id,peer)).messages.length,2);
 assert.equal((await api('live/activity-messages/'+a.id,waiting)).status,403);
 assert.equal((await api('live/messages/'+p1.id,student,{body:'個別連絡は不可'})).status,410);
 let dash=await ok('live/dashboard',student);assert(dash.unreadCount>0);const notice=dash.notifications[0];await ok('live/notifications',student,{id:notice.id});assert.equal((await ok('live/dashboard',student)).notifications.find(n=>n.id===notice.id).is_read,1);
 const duplicate=await ok('live/activities/'+a.id+'/duplicate',operator,{});const copied=(await ok('live/dashboard',operator)).activities.find(x=>x.id===duplicate.id);assert.equal(copied.startsAt,'');assert.equal(copied.status,'DRAFT');assert.equal(copied.tasks,activity.tasks);
 editDB(db=>db.prepare('UPDATE live_activities SET ends_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),a.id));
 assert.equal((await ok('live/catalog')).activities.length,0);assert.equal((await ok('live/dashboard',waiting)).applications[0].status,'EXPIRED');
 assert.equal((await ok('live/dashboard',student)).applications[0].status,'APPROVED');await ok('live/applications/'+p1.id+'/complete',operator,{});
 let buzz=(await ok('live/catalog')).communities[0].buzz;assert.deepEqual(buzz,{participants:1,reviews:0,saves:0,views:0,points:30});
 assert.equal((await api('live/applications/'+p1.id+'/complete',operator,{})).status,409);
 const review=await ok('live/reviews/'+a.id,student,{rating:1,text:'初参加でしたが、活動の流れを丁寧に教えてもらいました。',anonymous:true});
 buzz=(await ok('live/catalog')).communities[0].buzz;assert.deepEqual(buzz,{participants:1,reviews:1,saves:0,views:0,points:40});
 const publicReviews=await ok('live/community-reviews/'+c.id);assert.equal(publicReviews.reviews[0].author,'匿名の参加者');assert(!JSON.stringify(publicReviews).includes(student.id));assert(!JSON.stringify(publicReviews).includes('student@example.test'));assert(!('user_id' in publicReviews.reviews[0]));
 await ok('live/reviews/'+a.id,student,{rating:5,text:'また参加したいです。交流できてよい経験になりました。',anonymous:false});
 assert.equal((await ok('live/catalog')).communities[0].buzz.points,40);assert.equal((await ok('live/reviews/'+a.id)).reviews[0].id,review.id);assert.equal((await ok('live/reviews/'+a.id)).reviews[0].author,'匿名の参加者');
 assert.equal((await api('live/reviews/'+a.id,waiting,{rating:5,text:'ほかの人として投稿できないことを確認します。',anonymous:true,user_id:student.id})).status,403);
 await ok('live/reviews/'+a.id+'/delete',waiting,{});assert.equal((await ok('live/reviews/'+a.id)).total,1);
 await ok('live/reviews/'+a.id+'/delete',student,{});assert.equal((await ok('live/catalog')).communities[0].buzz.points,30);
 await ok('live/reviews/'+a.id,student,{rating:5,text:'初参加でも安心して交流することができました。',anonymous:true});
 await ok('live/applications/'+p2.id+'/complete',operator,{});await ok('live/reviews/'+a.id,peer,{rating:3,text:'地域の方と話せて、新しい活動を知ることができました。',anonymous:true});
 assert.deepEqual((await ok('live/catalog')).communities[0].buzz,{participants:2,reviews:2,saves:0,views:0,points:80});
 await stop();await start();
 dash=await ok('live/dashboard',student);assert.equal(dash.applications[0].status,'DONE');assert.equal(dash.followedCommunities[0].id,c.id);assert.equal((await ok('live/activity-messages/'+a.id,peer)).messages.length,2);
 assert.equal((await ok('live/review',operator)).communities[0].adminInfo.notes,'PRIVATE_OPERATOR_NOTE');
 assert.equal((await api('live/review',student)).status,403);assert(!JSON.stringify(dash).includes('PRIVATE_OPERATOR_NOTE'));
 assert.deepEqual((await ok('live/catalog')).communities[0].buzz,{participants:2,reviews:2,saves:0,views:0,points:80});assert.equal((await ok('live/community-reviews/'+c.id)).total,2);assert.equal(dash.reviews.length,1);
 await ok('live/saved-communities/'+c.id,student,{saved:true});
 await ok('live/community-views/'+c.id,student,{activityId:a.id});
 await ok('live/community-views/'+c.id,student,{});
 const wrongAccount=await fetch(base+'/api/live/saved-communities/'+c.id,{method:'POST',headers:{Origin:base,Cookie:student.cookie,'Content-Type':'application/json','X-Tobiyori-Account':peer.id},body:JSON.stringify({saved:false})});assert.equal(wrongAccount.status,409);
 const noOrigin=await fetch(base+'/api/live/community-views/'+c.id,{method:'POST',headers:{Cookie:student.cookie,'Content-Type':'application/json','X-Tobiyori-Account':student.id},body:'{}'});assert.equal(noOrigin.status,403);
 assert.equal((await api('live/community-views/'+c.id,null,{})).status,401);
 await stop();await start();
 assert.deepEqual((await ok('live/dashboard',student)).saves,[c.id]);
 assert.deepEqual((await ok('live/dashboard',peer)).saves,[]);
 assert.deepEqual((await ok('live/catalog')).communities[0].buzz,{participants:2,reviews:2,saves:1,views:1,points:86});
 assert.equal((await ok('live/community-views/'+c.id,student,{})).counted,false);
 console.log('PASS: real completed-participant totals, private saved communities and deduplicated views survive server restart; CSRF and account-switch protection; anonymous reviews');
 if(process.env.TOBIYORI_REVIEW_PREVIEW==='1'){console.log('Review UI fixture ready: '+base+'/#/livecommunity/'+c.id);await new Promise(r=>setTimeout(r,180000));}
 console.log('PASS: HTTP signup → operator review → follow notification → application → approval → shared activity board → duplicate → automatic expiry → completion; database and permissions survive restart');
}finally{await stop();const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('tobiyori-workflow-'));fs.rmSync(target,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
