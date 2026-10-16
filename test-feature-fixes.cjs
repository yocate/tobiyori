// Browser checks for flows that used to be broken: cancel after closing, edit/cancel visibility,
// members-only applications, full review details, real achievements, retired sample pages,
// save conflicts between tabs, load failures and the operator account-ID hint.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-fixes-')),port=4197,base='http://127.0.0.1:'+port;
let server,browser;
async function start(){server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:String(port),TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});let output='';server.stderr.on('data',c=>output+=c);for(let i=0;i<400;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Test server not ready: '+output);}
async function stop(){if(!server||server.exitCode!==null)return;const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;}
function editDB(fn){const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));try{return fn(db);}finally{db.close();}}
async function api(route,user,body,method){const headers={Origin:base};if(user){headers.Cookie=user.cookie;headers['X-Tobiyori-Account']=user.id;}if(body)headers['Content-Type']='application/json';const r=await fetch(base+'/api/'+route,{method:method||(body?'POST':'GET'),headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
async function ok(route,user,body,method){const r=await api(route,user,body,method);assert(r.status<300,JSON.stringify({route,...r}));return r.data;}
async function signup(name){const r=await fetch(base+'/api/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:name+'@example.test',password:'feature-fixes-123',nickname:name,consent:true})});assert.equal(r.status,201);return {id:(await r.json()).user.id,cookie:r.headers.get('set-cookie').split(';')[0]};}
const safety=Object.fromEntries(['purpose','tasks','staff','requirements','belongings','risk','insurance','photoPolicy','transport','prohibited','location','emergency'].map(k=>[k,'確認用の案内']));
async function publish(operator,cid,extra={}){
 const aid=(await ok('live/activities',operator,{communityId:cid})).id;
 await ok('live/activities/'+aid,operator,{title:'検証活動',startsAt:new Date(Date.now()+3*86400000).toISOString(),endsAt:new Date(Date.now()+3*86400000+7200000).toISOString(),capacity:5,genre:'学習支援',activityCity:'高崎市',feeAmount:500,fees:'材料費500円',...safety,...extra});
 await ok('live/activities/'+aid+'/submit',operator,{});return aid;
}
async function pageFor(user,width=1280){const ctx=await browser.newContext({viewport:{width,height:900}});await ctx.addCookies([{name:'tobiyori_session',value:user.cookie.split('=')[1],url:base}]);const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return page;}
const errors=[];
(async()=>{try{
 await start();const operator=await signup('operator'),student=await signup('student'),stranger=await signup('stranger');
 editDB(db=>db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(operator.id));
 const cid=(await ok('live/communities',operator,{name:'検証コミュニティ',city:'高崎市',type:'地域団体',intro:'実在しない検証用団体',adminInfo:{consentConfirmed:true}})).id;
 await ok('live/review/'+cid+'/approve',operator,{type:'community',note:'検証',identityChecked:true});
 const open=await publish(operator,cid),members=await publish(operator,cid,{title:'メンバー限定の練習会',participationScope:'members'});
 const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'})});

 // Review page shows the city, fee and participation scope, not only the safety fields.
 const admin=await pageFor(operator);await admin.goto(base+'/operator.html#/admin');await admin.getByText('募集の審査',{exact:true}).waitFor();
 const reviewText=await admin.locator('#app').innerText();for(const label of ['会場の市町村：高崎市','参加費：材料費500円 ／ 500円','団体外からの参加：所属メンバーのみ','持ち物：確認用の案内'])assert(reviewText.includes(label),label);
 for(const aid of [open,members])await ok('live/review/'+aid+'/approve',operator,{type:'activity',note:'検証'});

 // Members-only: the form asks for membership and the server requires it.
 const sp=await pageFor(student,390);const applyFrom=async(aid)=>{await sp.goto(base+'/#/liveactivity/'+aid);await sp.waitForLoadState('networkidle');await sp.locator('[data-live-apply][data-kind=体験参加]').click();await sp.locator('#liveApplyForm').waitFor();};
 await applyFrom(members);assert.match(await sp.locator('#app').innerText(),/所属メンバーのみが対象/);await sp.locator('#liveApplyForm [name=memberConfirmed]').waitFor();
 await sp.locator('#liveApplyForm [name=year]').selectOption('大学1年生');await sp.locator('#liveApplyForm [name=memberConfirmed]').check();
 const applied=sp.waitForResponse(r=>r.url().includes('/api/live/apply/'));await sp.locator('#liveApplyForm button.btn-primary').click();assert.equal((await applied).status(),201);
 assert.equal((await api('live/apply/'+members,stranger,{kind:'体験参加',year:'大学1年生'})).status,400);
 await applyFrom(open);assert.equal(await sp.locator('#liveApplyForm [name=memberConfirmed]').count(),0);await sp.locator('.modal-close').click();

 // Achievements follow the real application, not the sample counters.
 await sp.goto(base+'/#/mypage');await sp.waitForLoadState('networkidle');await sp.locator('[data-mtab=achievements]').click();
 assert.match(await sp.locator('.achv-item.unlocked').first().innerText(),/地域デビュー/);

 // A closed activity keeps "cancel"; a cancelled one offers neither edit nor cancel.
 const app=(await ok('live/dashboard',student)).applications.find(p=>p.activity_id===members);await ok('live/applications/'+app.id+'/approve',operator,{});
 await ok('live/activities/'+members+'/close',operator,{});
 await admin.goto(base+'/operator.html#/org');await admin.reload();await admin.waitForLoadState('networkidle');await admin.locator('details summary',{hasText:'終了した募集'}).click();
 const closedCard=admin.locator('article',{hasText:'メンバー限定の練習会'});await closedCard.locator('[data-activity-cancel]').waitFor();
 await closedCard.locator('[data-activity-cancel]').click();await admin.locator('#activityCancelForm [name=reason]').fill('会場の都合のため');await admin.locator('#activityCancelForm button').click();
 await admin.getByText('会場の都合のため').count();for(let i=0;i<50&&(await ok('live/dashboard',operator)).activities.find(a=>a.id===members).status!=='CANCELLED';i++)await admin.waitForTimeout(100);
 assert.equal((await ok('live/dashboard',student)).applications.find(p=>p.activity_id===members).status,'CANCELLED');
 await admin.goto(base+'/operator.html#/org');await admin.reload();await admin.waitForLoadState('networkidle');await admin.locator('details summary',{hasText:'終了した募集'}).click();
 const cancelled=admin.locator('article',{hasText:'メンバー限定の練習会'});await cancelled.waitFor();
 assert.equal(await cancelled.locator('[data-param^=edit-]').count(),0);assert.equal(await cancelled.locator('[data-activity-cancel]').count(),0);

 // Old sample URLs no longer accept applications that would never reach anyone.
 await sp.goto(base+'/#/detail/a1');await sp.getByText('このページは公開を終了しました',{exact:true}).waitFor();

 // Two tabs: the stale one is offered reload/overwrite instead of an endless retry.
 const tabA=await pageFor(student),tabB=await pageFor(student);
 for(const t of [tabA,tabB]){await t.goto(base+'/#/mypage');await t.waitForLoadState('networkidle');}
 await tabA.locator('#pf_nickname, [name=nickname]').first().fill('タブA');await tabA.getByRole('button',{name:'登録情報を保存',exact:true}).click();await tabA.getByText('保存済み',{exact:true}).waitFor();
 await tabB.locator('#pf_nickname, [name=nickname]').first().fill('タブB');await tabB.getByRole('button',{name:'登録情報を保存',exact:true}).click();
 await tabB.locator('#accountReload').waitFor();assert.equal(await tabB.locator('#accountRetry').count(),0);
 tabB.once('dialog',d=>d.accept());await tabB.locator('#accountOverwrite').click();await tabB.getByText('保存済み',{exact:true}).waitFor();
 assert.equal((await ok('state',student)).state.profile.nickname,'タブB');

 // A failed catalogue load is reported, not shown as "no listings".
 const offline=await pageFor(stranger);await offline.route('**/api/live/catalog',r=>r.abort());await offline.goto(base+'/#/regional');
 await offline.getByText('情報を読み込めませんでした。通信状況を確認して、もう一度お試しください。',{exact:true}).waitFor();

 // Non-operators on the operator screen see their account ID to hand to the administrator (public host only).
 assert.equal(fs.readFileSync(path.join(__dirname,'成果物','gunma-community-map.html'),'utf8').includes('次のアカウントIDを伝えてください'),true);

 assert.deepEqual(errors,[]);
 console.log('PASS: review details, members-only apply, real achievements, cancel after close, no edit/cancel when cancelled, retired sample pages, tab conflict overwrite, catalogue load error.');
}finally{if(browser)await browser.close();await stop();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
