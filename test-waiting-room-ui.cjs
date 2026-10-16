const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
const root=__dirname,dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-waiting-ui-')),base='http://127.0.0.1:4192';
let server,browser;const failures=[];
async function start(){server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:root,env:{...process.env,TOBIYORI_PORT:'4192',TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});let output='';server.stderr.on('data',b=>output+=b);server.on('error',e=>output+=e.message);for(let i=0;i<160;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(output||'Server did not start');}
async function stop(){if(server&&server.exitCode===null){const closed=new Promise(r=>server.once('exit',r));server.kill();await closed;}}
function database(fn){const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));try{return fn(db);}finally{db.close();}}
async function signup(name){const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('https://fonts.googleapis.com/**',r=>r.abort());const response=await context.request.post(base+'/api/register',{headers:{Origin:base},data:{email:name+'@example.test',password:'local-test-password',nickname:name,consent:true}});assert.equal(response.status(),201);return {context,id:(await response.json()).user.id};}
async function api(user,route,data){const response=await user.context.request[data?'post':'get'](base+'/api/live/'+route,{headers:{Origin:base,'X-Tobiyori-Account':user.id},...(data?{data}:{})});assert(response.ok(),JSON.stringify({route,status:response.status(),body:await response.text()}));return response.json();}
async function open(user,url){const page=await user.context.newPage();page.on('pageerror',e=>failures.push(e.message));await page.goto(base+url);return page;}
(async()=>{try{
 await start();browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'})});
 const owner=await signup('owner'),one=await signup('one'),two=await signup('two'),three=await signup('three'),outsider=await signup('outsider');
 database(db=>db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(owner.id));
 const c=await api(owner,'communities',{name:'検証用・まちの交流会',city:'高崎市',type:'地域団体',sector:'regional',intro:'地域の人と一緒に楽しむテスト用の団体です。',adminInfo:{consentConfirmed:true}});
 await api(owner,'review/'+c.id+'/approve',{type:'community',note:'検証用の確認',identityChecked:true,consentChecked:true});
 const data={title:'まちのお祭りを体験しよう',startsAt:new Date(Date.now()+3*86400000).toISOString(),endsAt:new Date(Date.now()+3*86400000+7200000).toISOString(),capacity:12,genre:'イベント・お祭り',purpose:'地域の人と交流する',tasks:'当日の会場づくり',staff:'交流会の担当者',requirements:'はじめての方も歓迎',belongings:'飲み物',risk:'転倒に注意',insurance:'当日の保険案内をご確認ください',photoPolicy:'撮影は本人の同意を得ます',transport:'公共交通機関',prohibited:'勧誘禁止',location:'PRIVATE_MEETING_PLACE',emergency:'PRIVATE_EMERGENCY',beginner:true,highSchoolParticipation:'allowed'};
 const a=await api(owner,'activities',{communityId:c.id});await api(owner,'activities/'+a.id,{...data,activityKind:'activity',participationScope:'unknown'});
 const operatorPage=await open(owner,'/operator.html#/org/edit-'+a.id);
 await operatorPage.locator('#lf_activityKind').selectOption('event');await operatorPage.locator('#lf_participationScope').selectOption('open');
 await operatorPage.getByRole('button',{name:'下書きを保存',exact:true}).click();await operatorPage.locator('#liveActivityForm').waitFor({state:'detached'});
 let stored=(await api(owner,'dashboard')).activities.find(x=>x.id===a.id);assert.equal(stored.activityKind,'event');assert.equal(stored.participationScope,'open');
 assert.equal((await api(one,'catalog')).activities.length,0,'Draft must not be public');
 await api(owner,'activities/'+a.id+'/submit',{});await api(owner,'review/'+a.id+'/approve',{type:'activity',note:'検証用の公開確認'});
 const b=await api(owner,'activities',{communityId:c.id});await api(owner,'activities/'+b.id,{...data,title:'公園のボランティア',activityKind:'volunteer',participationScope:'open'});await api(owner,'activities/'+b.id+'/submit',{});await api(owner,'review/'+b.id+'/approve',{type:'activity',note:'検証用の公開確認'});
 const copied=await api(owner,'activities/'+b.id+'/duplicate',{});stored=(await api(owner,'dashboard')).activities.find(x=>x.id===copied.id);assert.equal(stored.activityKind,'volunteer');assert.equal(stored.participationScope,'open');assert.equal(stored.status,'DRAFT');
 const p=await open(one,'/#/livecommunity/'+c.id);await p.locator('.community-hosted h3').filter({hasText:'イベント'}).waitFor();assert((await p.locator('.community-hosted').innerText()).includes('ボランティア'));assert.equal(await p.locator('.community-hosted .live-card').count(),2);
 const images=path.join(root,'.build-waiting-room-preview');fs.mkdirSync(images,{recursive:true});await p.locator('.community-hosted').screenshot({path:path.join(images,'community-events-desktop.png')});
 await p.goto(base+'/#/home');await p.locator('.adventure-purpose').waitFor();await p.addStyleTag({content:'.topbar,.bottom-tabs,.toast{visibility:hidden!important}'});
 await p.locator('.adventure-purpose').screenshot({path:path.join(images,'discovery-entrances-desktop.png')});await p.locator('.waiting-home').screenshot({path:path.join(images,'lounge-home-desktop.png')});
 await p.setViewportSize({width:390,height:844});await p.locator('.adventure-purpose').screenshot({path:path.join(images,'discovery-entrances-mobile.png')});await p.locator('.waiting-home').screenshot({path:path.join(images,'lounge-home-mobile.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 for(const route of ['regional','campus','company']){await p.goto(base+'/#/home');await p.locator('.adventure-entry[href="#/'+route+'"]').click();await p.waitForURL('**/#/'+route);}
 await p.setViewportSize({width:1280,height:900});await p.goto(base+'/#/livecommunity/'+c.id);
 assert.equal(await p.locator('.community-hosted [data-waiting-card]').count(),2);await p.locator('[data-waiting-card=\"'+a.id+'\"]').click();
 async function enter(page,name){await page.locator('#waitingJoinForm input[name=name]').fill(name);await page.locator('#waitingJoinForm select').selectOption('adult');await page.locator('#waitingJoinForm input[type=checkbox]').check();await page.getByRole('button',{name:'気になる仲間を待つ',exact:true}).click();await page.locator('#waitingJoinForm').waitFor({state:'detached'});}
 await enter(p,'まちの参加者A');await p.locator('[data-waiting-state="WAITING"]').waitFor();
 const p2=await open(two,'/#/waiting/'+a.id);await enter(p2,'まちの参加者B');await p2.locator('[data-waiting-state="WAITING"]').waitFor();assert.equal(await p2.locator('.waiting-people li').count(),0);
 const p3=await open(three,'/#/waiting/'+a.id);await enter(p3,'まちの参加者C');await p3.locator('[data-waiting-state="MATCHED"]').waitFor();assert.equal(await p3.locator('.waiting-people li').count(),3);
 await p.getByRole('button',{name:'最新の様子を見る',exact:true}).click();await p.locator('[data-waiting-state="MATCHED"]').waitFor();
 await p.locator('[data-waiting-greet="hello"]').click();await p.locator('.waiting-greeting.mine').waitFor();
 await p2.reload();await p2.locator('.waiting-greeting').waitFor();assert((await p2.locator('.waiting-greeting').innerText()).includes('まちの参加者A'));
 assert.equal((await api(one,'dashboard')).applications.length,0,'Waiting room is not an application');
 const room=await api(outsider,'waiting-room/'+a.id);assert.deepEqual(room.peers,[]);assert.deepEqual(room.greetings,[]);
 assert(!JSON.stringify(await api(one,'waiting-room/'+a.id)).includes('PRIVATE_'));
 await p.locator('[data-waiting-room]').screenshot({path:path.join(images,'matched-desktop.png')});await p.setViewportSize({width:390,height:844});await p.locator('[data-waiting-room]').screenshot({path:path.join(images,'matched-mobile.png')});
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await p.goto(base+'/#/waiting');await p.locator('.waiting-invite').waitFor();await p.locator('.waiting-invite').screenshot({path:path.join(images,'waiting-mobile.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await p.goto(base+'/#/livecommunity/'+c.id);await p.locator('.community-hosted').screenshot({path:path.join(images,'community-events-mobile.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await operatorPage.goto(base+'/operator.html#/waitingManage');await operatorPage.locator('[data-waiting-operator]').getByText('グループ 1').waitFor();assert((await operatorPage.locator('[data-waiting-operator]').innerText()).includes('まちの参加者A'));
 await stop();await start();await p.goto(base+'/#/waiting/'+a.id);await p.locator('.waiting-greeting.mine').waitFor();assert.equal(await p.locator('.waiting-people li').count(),3);
 await p3.getByRole('button',{name:'ラウンジから退出',exact:true}).click();await p3.locator('#waitingJoinForm').waitFor();await p.getByRole('button',{name:'最新の様子を見る',exact:true}).click();await p.locator('[data-waiting-state="WAITING"]').waitFor();assert.equal(await p.locator('.waiting-people li').count(),0);
 const guest=await browser.newContext();const guestPage=await guest.newPage();await guestPage.goto(base+'/#/waiting/'+a.id);await guestPage.getByRole('link',{name:'ログインして使う',exact:true}).waitFor();assert.equal(await guestPage.locator('#waitingJoinForm').count(),0);
 assert.deepEqual(failures,[]);console.log('PASS: direct lounge entry from community listings; reviewed community event/volunteer creation, form fields and duplication, grouped listings, pre-application matching, preset greetings, private identities, operator view, exit, restart persistence, guest gate and mobile layout');
}finally{if(browser)await browser.close();await stop();const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('tobiyori-waiting-ui-'));fs.rmSync(target,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
