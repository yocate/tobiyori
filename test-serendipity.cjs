const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {genreKey,assess,draw}=require('./serendipity.cjs');
const profile={nickname:'参加者',interests:['sports'],days:['土'],areas:['高崎市'],transport:['徒歩'],year:'大学1年',participation:{budget:1000,from:'09:00',until:'17:00'}};
const activity={genre:'学習支援',beginner:true,startsAt:'2030-10-05T01:00:00Z',endsAt:'2030-10-05T03:00:00Z',activityCity:'高崎市',feeAmount:0,transport:'徒歩で来場できます',targetYears:['大学1年']};
assert.equal(genreKey('子どもの学習支援'),'study');assert.equal(genreKey('自由な未知の分野'),null);
assert(assess(activity,profile).eligible);
for(const change of [{genre:'スポーツ'},{genre:'自由な未知の分野'},{beginner:false},{feeAmount:2000},{feeAmount:null},{activityCity:'前橋市'},{startsAt:'2030-10-06T01:00:00Z',endsAt:'2030-10-06T03:00:00Z'},{endsAt:'2030-10-05T10:00:00Z'},{transport:'自転車で来場'},{targetYears:['大学4年']}])assert(!assess({...activity,...change},profile).eligible,JSON.stringify(change));
assert(!assess(activity,profile,['study']).eligible);assert(!assess(activity,{...profile,days:[]}).eligible);
assert(assess({...activity,feeAmount:null},{...profile,participation:{}}).eligible);
const choices=[{communityId:'a',id:'a1'},{communityId:'a',id:'a2'},{communityId:'b',id:'b1'}],limits=[];
assert.equal(draw(choices,n=>{limits.push(n);return n-1;}).id,'b1');assert.deepEqual(limits,[2,1]);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-serendipity-')),base='http://127.0.0.1:4192';let server,browser;
async function start(){server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:'4192',TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});let output='';server.stderr.on('data',c=>output+=c);server.on('error',e=>output+=e.message);for(let i=0;i<400;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error(output);}
async function stop(){if(!server||server.exitCode!==null)return;const done=new Promise(r=>server.once('exit',r));server.kill();await done;}
function editDB(fn){const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));try{return fn(db);}finally{db.close();}}
async function api(route,user,body,method){const headers={Origin:base};if(user){headers.Cookie=user.cookie;headers['X-Tobiyori-Account']=user.id;}if(body)headers['Content-Type']='application/json';const r=await fetch(base+'/api/'+route,{method:method||(body?'POST':'GET'),headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
async function ok(...args){const r=await api(...args);assert(r.status<300,JSON.stringify({route:args[0],...r}));return r.data;}
async function signup(name){const r=await api('register',null,{email:name+'@example.test',password:'workflow-testing-123',nickname:name,consent:true});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie.split(';')[0]};}
const screenshotDir=path.join(__dirname,'.audit-20260930','serendipity');fs.mkdirSync(screenshotDir,{recursive:true});
(async()=>{try{
 await start();const operator=await signup('operator'),student=await signup('student'),other=await signup('other');
 editDB(db=>db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(operator.id));
 assert.equal((await api('live/serendipity')).status,401);
 assert.equal((await api('live/serendipity/pick',student,{})).status,400);
 await ok('state',student,{state:{profile},revision:0},'PUT');
 const cids=[],aids=[];
 for(let i=0;i<2;i++){
  const cid=(await ok('live/communities',operator,{name:['まちの学び場（動作確認用）','里山サポーター（動作確認用）'][i],city:'高崎市',type:'地域団体',intro:'実在しない動作確認用団体',adminInfo:{consentConfirmed:true}})).id;cids.push(cid);
  await ok('live/review/'+cid+'/approve',operator,{type:'community',identityChecked:true,note:'動作確認'});
  const aid=(await ok('live/activities',operator,{communityId:cid})).id;aids.push(aid);
  await ok('live/activities/'+aid,operator,{...activity,genre:i?'農業・環境保全':'学習支援',title:i?'里山の散策路をみんなで整える':'子どもたちの「できた！」を一緒に増やす',capacity:5,fees:'無料',...Object.fromEntries(['purpose','tasks','staff','requirements','belongings','risk','insurance','photoPolicy','prohibited','location','emergency'].map(k=>[k,'動作確認用の案内']))});
  await ok('live/activities/'+aid+'/submit',operator,{});await ok('live/review/'+aid+'/approve',operator,{type:'activity',note:'動作確認'});
 }
 const count=async()=> (await ok('live/serendipity',student)).candidateActivities;
 assert.equal(await count(),2);
 // Verify exclusions against the actual service, without touching the user's database.
 const mutations=[
  [db=>db.prepare('INSERT INTO live_blocks VALUES(?,?)').run(student.id,cids[0]),db=>db.prepare('DELETE FROM live_blocks').run()],
  [db=>db.prepare("UPDATE live_communities SET status='SUSPENDED' WHERE id=?").run(cids[0]),db=>db.prepare("UPDATE live_communities SET status='VERIFIED' WHERE id=?").run(cids[0])],
  [db=>db.prepare('UPDATE live_communities SET paused=1 WHERE id=?').run(cids[0]),db=>db.prepare('UPDATE live_communities SET paused=0 WHERE id=?').run(cids[0])],
  [db=>db.prepare('UPDATE live_communities SET owner_id=? WHERE id=?').run(student.id,cids[0]),db=>db.prepare('UPDATE live_communities SET owner_id=? WHERE id=?').run(operator.id,cids[0])],
  [db=>db.prepare("UPDATE live_activities SET status='DRAFT' WHERE id=?").run(aids[0]),db=>db.prepare("UPDATE live_activities SET status='PUBLISHED' WHERE id=?").run(aids[0])],
  [db=>db.prepare('UPDATE live_activities SET capacity=0 WHERE id=?').run(aids[0]),db=>db.prepare('UPDATE live_activities SET capacity=5 WHERE id=?').run(aids[0])],
  [db=>db.prepare('INSERT INTO live_activity_change_requests VALUES(?,?,?,?,?)').run(aids[0],'pending','{}','x',new Date().toISOString()),db=>db.prepare('DELETE FROM live_activity_change_requests').run()],
  [db=>db.prepare("UPDATE live_activities SET data=json_set(data,'$.deadline','2020-01-01T00:00:00Z') WHERE id=?").run(aids[0]),db=>db.prepare("UPDATE live_activities SET data=json_remove(data,'$.deadline') WHERE id=?").run(aids[0])],
  [db=>db.prepare('INSERT INTO live_applications VALUES(?,?,?,?,?,?,?,?,?)').run('done',aids[0],student.id,'体験参加','',0,0,'DONE',new Date().toISOString()),db=>db.prepare("DELETE FROM live_applications WHERE id='done'").run()]
 ];
 for(const [set,restore] of mutations){editDB(set);assert.equal(await count(),1);editDB(restore);assert.equal(await count(),2);}
 const {chromium}=require('C:/Users/natsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--disable-gpu']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addCookies([{name:'tobiyori_session',value:student.cookie.split('=')[1],url:base}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#/list');await page.getByRole('link',{name:'扉をあけてみる'}).click();
 await page.screenshot({path:path.join(screenshotDir,'door-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'知らない扉を開く',exact:true}).click();await page.locator('.serendipity-pick').waitFor();
 await page.getByText('紹介の理由と参加条件を確認する',{exact:true}).click();
 assert(!(await page.locator('.serendipity-pick').innerText()).includes('希望と異なる'));
 const first=(await ok('live/serendipity',student)).current;
 assert(!Object.hasOwn(first.activity,'location'));assert(!Object.hasOwn(first.activity,'emergency'));
 await page.getByRole('button',{name:'初めて知った！',exact:true}).click();await page.getByRole('button',{name:'✓ 初めて知った！',exact:true}).waitFor();
 await page.getByRole('button',{name:'やってみたいかも！',exact:true}).click();await page.getByRole('button',{name:'✓ 気になるに保存済み',exact:true}).waitFor();
 assert.equal((await ok('live/serendipity',student)).stats.sparks,1);
 editDB(db=>db.prepare("INSERT INTO live_activities SELECT 'same-genre',community_id,title,starts_at,ends_at,capacity,data,status,review_note,published_at,updated_at FROM live_activities WHERE id=?").run(first.activity.id));
 assert.equal(await count(),1,'saving a genre must not create more of the same');
 editDB(db=>db.prepare("DELETE FROM live_activities WHERE id='same-genre'").run());
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:path.join(screenshotDir,'discovery-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(screenshotDir,'discovery-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal((await api('live/serendipity/'+first.id+'/feedback',other,{feedback:'pass'})).status,404);
 assert.equal((await api('live/serendipity/'+first.id+'/awareness',other,{awareness:'new'})).status,404);
 assert.equal((await api('live/serendipity/'+first.id+'/awareness',student,{awareness:'bad'})).status,400);
 assert.equal((await ok('live/serendipity',other)).history.length,0);
 await page.getByRole('button',{name:'もうひとつ扉を開く',exact:true}).click();await page.getByText('今は、新しく紹介できる活動がありません',{exact:true}).waitFor();
 const after=await ok('live/serendipity',student);assert.equal(after.history.length,2);assert.notEqual(after.current.activity.id,first.activity.id);assert.equal(after.history[1].feedback,'interested');
 await page.getByRole('button',{name:'今回は見送る',exact:true}).click();await page.getByRole('button',{name:'今回は見送りました',exact:true}).waitFor();
 const dashboard=await ok('live/dashboard',student);assert.equal(dashboard.applications.length,0);assert.equal(dashboard.follows.length,0);
 const noMore=await ok('live/serendipity/pick',student,{});assert(noMore.noCandidate);assert.equal(noMore.history.length,2);
 const state=await ok('state',student);await ok('state',student,{revision:state.revision,state:{...state.state,profile:{...profile,areas:['前橋市']}}},'PUT');
 await page.goto(base+'/#/list');await page.getByRole('link',{name:'扉をあけてみる'}).click();await page.getByText('紹介後に条件や登録情報が変わっています。現在は「よりみち発見」の条件に合いません。',{exact:true}).waitFor();
 assert.equal((await ok('live/serendipity',student)).current.eligible,false);
 editDB(db=>db.prepare("UPDATE live_activities SET status='CLOSED' WHERE id=?").run(after.current.activity.id));assert.equal((await ok('live/serendipity',student)).current.activity,null);
 await stop();await start();const persisted=await ok('live/serendipity',student);assert.equal(persisted.history[1].feedback,'interested');assert.equal(persisted.history[1].awareness,'new');assert.equal(persisted.stats.sparks,1);
 assert.deepEqual(errors,[]);
 console.log('PASS: unfamiliar-category rules; community-first selection; 9 service exclusions; auth/private feedback; no repeat; no auto apply/follow; profile recheck; closed activity hidden; 390px layout; persisted history after restart.');
}finally{if(browser)await browser.close();await stop();const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('tobiyori-serendipity-'));fs.rmSync(target,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
