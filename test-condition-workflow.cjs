const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-conditions-')),base='http://127.0.0.1:4191';
let server;
async function start(){server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:'4191',TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});let output='';server.stderr.on('data',chunk=>output+=chunk);server.on('error',e=>output+=e.message);for(let i=0;i<400;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Test server not ready: '+output);}
async function stop(){if(!server||server.exitCode!==null)return;const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;}
function editDB(fn){const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));try{fn(db);}finally{db.close();}}
async function api(route,user,body,method){const headers={Origin:base};if(user){headers.Cookie=user.cookie;headers['X-Tobiyori-Account']=user.id;}if(body)headers['Content-Type']='application/json';const r=await fetch(base+'/api/'+route,{method:method||(body?'POST':'GET'),headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
async function ok(route,user,body,method){const r=await api(route,user,body,method);assert(r.status<300,JSON.stringify({route,...r}));return r.data;}
async function signup(name){const r=await api('register',null,{email:name+'@example.test',password:'local-workflow-test-123',nickname:name,consent:true});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie.split(';')[0]};}

const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
let browser;const screenshotDir=path.join(__dirname,'.audit-20260930','conditions');fs.mkdirSync(screenshotDir,{recursive:true});
(async()=>{try{
 await start();const operator=await signup('operator'),student=await signup('student');editDB(db=>db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(operator.id));
 const cid=(await ok('live/communities',operator,{name:'動作確認用コミュニティ',city:'高崎市',type:'地域団体',intro:'実在しない検証用団体',adminInfo:{consentConfirmed:true}})).id;
 await ok('live/review/'+cid+'/approve',operator,{type:'community',note:'検証',identityChecked:true});
 const aid=(await ok('live/activities',operator,{communityId:cid})).id;
 const details={title:'週末の活動・変更確認テスト',startsAt:'2030-10-05T01:00:00Z',endsAt:'2030-10-05T03:00:00Z',capacity:5,feeAmount:0,activityCity:'高崎市',fees:'無料',genre:'学習支援',...Object.fromEntries(['purpose','tasks','staff','requirements','belongings','risk','insurance','photoPolicy','transport','prohibited','location','emergency'].map(k=>[k,'確認用の案内']))};
 await ok('live/activities/'+aid,operator,details);await ok('live/activities/'+aid+'/submit',operator,{});await ok('live/review/'+aid+'/approve',operator,{type:'activity',note:'検証'});
 const app=(await ok('live/apply/'+aid,student,{kind:'体験参加'})).id;await ok('live/applications/'+app+'/approve',operator,{});
 const participation={budget:1000,from:'09:00',until:'17:00'};
 const old=await ok('state',student);
 await ok('state',student,{state:{...old.state,profile:{...old.state?.profile,participation,days:['土'],areas:['高崎市']}},revision:old.revision},'PUT');
 const profile=(await ok('state',student)).state.profile;assert.deepEqual(profile.participation,participation);assert.deepEqual(profile.days,['土']);assert.deepEqual(profile.areas,['高崎市']);
 browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'}),args:['--disable-gpu']});const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addCookies([{name:'tobiyori_session',value:student.cookie.split('=')[1],url:base}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const operatorContext=await browser.newContext({viewport:{width:1280,height:900}});await operatorContext.addCookies([{name:'tobiyori_session',value:operator.cookie.split('=')[1],url:base}]);const operatorPage=await operatorContext.newPage();operatorPage.on('pageerror',e=>errors.push(e.message));
 await operatorPage.goto(base+'/operator.html#/org/edit-'+aid);await operatorPage.locator('[name="feeAmount"]').waitFor();await operatorPage.locator('[name="feeAmount"]').fill('2000');await operatorPage.locator('[name="fees"]').fill('参加費2000円');await operatorPage.locator('[name="activityCity"]').selectOption('前橋市');
 await operatorPage.locator('[name="startsAt"]').fill('2030-10-06T18:00');await operatorPage.locator('[name="endsAt"]').fill('2030-10-06T19:00');const changeResponse=operatorPage.waitForResponse(r=>r.url().includes('/propose-change'));await operatorPage.getByRole('button',{name:'変更案を送って審査を依頼',exact:true}).click();const cr=await changeResponse;assert(cr.ok(),JSON.stringify(await cr.json()));await operatorPage.getByText('変更確認中・受付保留',{exact:true}).waitFor();
 await operatorPage.goto(base+'/operator.html#/admin');await operatorPage.getByRole('button',{name:'変更を承認して通知',exact:true}).waitFor();await operatorPage.screenshot({path:path.join(screenshotDir,'operator-review.png'),fullPage:true});
 await operatorPage.getByRole('button',{name:'変更を承認して通知',exact:true}).click();await operatorPage.locator('#conditionReviewForm [name="note"]').fill('変更した条件と案内を確認しました（動作検証）');await operatorPage.locator('#conditionReviewForm button').click();await operatorPage.getByText('変更案の確認結果を保存しました',{exact:true}).waitFor();
 await page.goto(base+'/#/myactivity');await page.getByText('希望予算を1,000円超えています。',{exact:true}).waitFor();await page.getByText('参加できる曜日から外れています。',{exact:true}).waitFor();await page.screenshot({path:path.join(screenshotDir,'changes-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(screenshotDir,'changes-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'変更内容を確認しました',exact:true}).click();await page.getByText('変更内容を確認済み',{exact:true}).waitFor();assert((await ok('live/dashboard',student)).applications[0].conditionChange.ackAt);
 await stop();await start();assert((await ok('live/dashboard',student)).applications[0].conditionChange.ackAt);const restored=(await ok('state',student)).state.profile;assert.deepEqual(restored.participation,participation);assert.deepEqual(restored.days,['土']);assert.deepEqual(restored.areas,['高崎市']);assert.deepEqual(errors,[]);
 console.log('PASS: API participation setup → browser operator workflow → operator change request → reviewed update → personalized notification/display → acknowledgement; 390px layout and restart persistence.');
}catch(e){if(browser){let i=0;for(const context of browser.contexts())for(const page of context.pages()){await page.screenshot({path:path.join(screenshotDir,'failure-'+(++i)+'.png'),fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));}}throw e;}finally{if(browser)await browser.close();await stop();const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('tobiyori-conditions-'));fs.rmSync(target,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
