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
 await start();const operator=await signup('operator'),student=await signup('student');editDB(db=>db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(operator.id));await ok('state',student,{state:{profile},revision:0},'PUT');
 const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'})});
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'tobiyori_session',value:student.cookie.split('=')[1],url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#/mypage');await page.locator('.journey-details').waitFor();assert.equal(await page.getByText('参加条件の変更をチェック',{exact:true}).count(),0);assert.equal(await page.locator('#pf_budget').count(),0);assert(!(await page.locator('.points-personal').innerText()).includes('妙義'));
 await page.locator('#pf_birthDate').fill('2004-02-29');await page.locator('#pf_skills').fill('写真撮影が得意です。料理は苦手です。');await page.locator('#pf_useSkillsMatching').check();assert.equal(await page.locator('#profileSkillPreview input').count(),1);
 await page.getByRole('button',{name:'登録情報を保存',exact:true}).click();await page.waitForTimeout(800);assert.deepEqual((await ok('state',student)).state.profile.participation,profile.participation);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(__dirname,'.audit-20261003/mypage-mobile.png'),fullPage:true});
 const op=await browser.newContext({viewport:{width:1280,height:900}});await op.addCookies([{name:'tobiyori_session',value:operator.cookie.split('=')[1],url:base}]);const admin=await op.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(base+'/operator.html#/admin/new');await admin.locator('.live-registration-required').waitFor();
 // Registration is a single form with 4 required fields (the step wizard was retired; see bindCommunityWizard).
 await admin.getByRole('button',{name:'確認待ちで保存する',exact:true}).click();assert.equal(await admin.locator('#app :invalid').count()>0||(await admin.locator('[role=alert]').count())>0,true,'required fields are enforced');
 await admin.locator('[name=name]').fill('旅のコミュニティ（動作確認用）');await admin.locator('[name=type]').selectOption('地域サークル');await admin.locator('[name=city]').selectOption('高崎市');await admin.locator('[name=intro]').fill('実在しない動作確認用の紹介です。');await admin.getByRole('button',{name:'入力途中を保存',exact:true}).click();await admin.getByText('入力途中を保存しました。',{exact:true}).waitFor();
 await admin.locator('[name=name]').fill('一時的な入力');await admin.getByRole('button',{name:'保存した入力を復元',exact:true}).click();await admin.getByText('保存した入力を復元しました。内容を確認してから保存してください。',{exact:true}).waitFor();assert.equal(await admin.locator('[name=name]').inputValue(),'旅のコミュニティ（動作確認用）');
 await admin.screenshot({path:path.join(__dirname,'.audit-20261003/community-desktop.png'),fullPage:true});
 await admin.getByRole('button',{name:'確認待ちで保存する',exact:true}).click();await admin.waitForURL(u=>u.hash==='#/admin',{waitUntil:'domcontentloaded'});let review=await ok('live/review',operator);const c=review.communities.find(c=>c.name==='旅のコミュニティ（動作確認用）');assert(c);assert.equal(c.status,'PENDING');
 await admin.goto(base+'/operator.html#/admin/edit-'+c.id);await admin.locator('[name=name]').waitFor();assert.equal(await admin.locator('[name=name]').inputValue(),'旅のコミュニティ（動作確認用）');await admin.setViewportSize({width:390,height:844});await admin.screenshot({path:path.join(__dirname,'.audit-20261003/community-mobile.png'),fullPage:true});assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await admin.goto(base+'/operator.html#/org');await admin.locator('.community-update-choices').waitFor();assert.equal(await admin.getByRole('button',{name:/変更なし/}).count(),1);assert.equal(await admin.getByRole('button',{name:/変更あり/}).count(),1);

 const saved=await ok('state',student);assert.equal(saved.state.profile.birthDate,'2004-02-29');assert.equal(saved.state.profile.useSkillsMatching,true);
 for(const birthDate of ['2004-02-30','2999-01-01','not-a-date'])assert.equal((await api('state',student,{revision:saved.revision,state:{profile:{birthDate}}},'PUT')).status,400);
 assert(!(JSON.stringify(await ok('live/catalog')).includes('2004-02-29')));assert(!(JSON.stringify(await ok('live/dashboard',operator)).includes('2004-02-29')));
 await page.reload();await page.locator('#pf_birthDate').waitFor();assert.equal(await page.locator('#pf_birthDate').inputValue(),'2004-02-29');await page.goto(base+'/#/home');await page.getByRole('heading',{name:'トビヨリを応援する団体',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'大学から、サークルを知る',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: national journey; removed profile section; profile save preserves data; registration validation, draft restore, server save and mobile layout; 3 update actions.');
}finally{if(browser)await browser.close();await stop();const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('tobiyori-serendipity-'));fs.rmSync(target,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
