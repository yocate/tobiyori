'use strict';
// 実データを使わず、同一プロセス内のメモリDBで入室・認証・活動申込みを確認する。
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
const {createApp}=require('./app.cjs');
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
const password='local-lounge-test-password';
const failures=[];
let app,browser,base;
const server=http.createServer(async(req,res)=>{
  try{
    if(await app.handle(req,res)!==false)return;
    const pathname=new URL(req.url,base).pathname;
    const relative=['/','/index.html','/operator.html'].includes(pathname)?'gunma-community-map.html':decodeURIComponent(pathname).slice(1);
    const root=path.join(__dirname,'成果物'),file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)||!['.html','.js','.css','.png'].includes(path.extname(file))){res.writeHead(404);return res.end();}
    const content=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[path.extname(file)]});
    res.end(content);
  }catch(error){res.writeHead(500);res.end(error.message);}
});
async function context(){
  const c=await browser.newContext({viewport:{width:390,height:844}});
  await c.route('https://fonts.googleapis.com/**',r=>r.abort());
  await c.route('https://tile.openstreetmap.org/**',r=>r.abort());
  return c;
}
async function pageFor(c,route){const p=await c.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>failures.push(e.message));await p.goto(base+route);return p;}
async function signup(name){const c=await context();const r=await c.request.post(base+'/api/register',{headers:{Origin:base},data:{email:name+'@example.test',password,nickname:name,consent:true}});assert.equal(r.status(),201,await r.text());return {context:c,id:(await r.json()).user.id};}
async function api(user,route,data){const r=await user.context.request[data?'post':'get'](base+'/api/live/'+route,{headers:{Origin:base,'X-Tobiyori-Account':user.id},...(data?{data}:{})});assert(r.ok(),route+': '+await r.text());return r.json();}
async function noOverflow(p){assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'390pxで横にはみ出さない');}
async function login(p,name){await p.locator('#accountEmail').fill(name+'@example.test');await p.locator('#accountPassword').fill(password);await p.locator('#accountSubmit').click();}
async function expectNoJoin(p,user,aid){await p.locator('#waitingJoinForm').waitFor();assert.equal((await api(user,'waiting-room/'+aid)).state,'NOT_JOINED','認証だけでは自動入室しない');await noOverflow(p);}
(async()=>{try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
  app=createApp({db,origins:[base],hosts:[new URL(base).host],community:{schedule:false}});
  browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'})});
  const empty=await pageFor(await context(),'/#/home');
  await empty.getByText(/現在、申込みを受け付けている活動はありません/).waitFor();await noOverflow(empty);
  await empty.goto(base+'/#/waiting');await empty.getByText('現在、入室できるラウンジはありません',{exact:true}).waitFor();await noOverflow(empty);
  // 通信障害を空の募集一覧として扱わない。
  await empty.route('**/api/live/catalog',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'検証用の読込エラー'})}));
  for(const route of ['home','waiting']){
    await empty.goto(base+'/#/'+route);await empty.reload();await empty.locator('#app [role=alert]').filter({hasText:'検証用の読込エラー'}).first().waitFor();
    assert.equal(await empty.getByText(/現在、申込みを受け付けている活動はありません/).count(),0);
    assert.equal(await empty.getByText('現在、入室できるラウンジはありません',{exact:true}).count(),0);
  }
  await empty.close();
  const owner=await signup('lounge-owner'),member=await signup('lounge-member');
  db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(owner.id);
  const c=await api(owner,'communities',{name:'入室導線の検証団体',city:'高崎市',type:'地域団体',sector:'regional',intro:'ローカルテスト用の団体です。',adminInfo:{consentConfirmed:true}});
  await api(owner,'review/'+c.id+'/approve',{type:'community',note:'ローカルテストでの確認',identityChecked:true,consentChecked:true});
  const a=await api(owner,'activities',{communityId:c.id});
  await api(owner,'activities/'+a.id,{title:'入室導線の検証活動',startsAt:new Date(Date.now()+3*86400000).toISOString(),endsAt:new Date(Date.now()+3*86400000+7200000).toISOString(),capacity:12,genre:'イベント・お祭り',purpose:'地域の人と交流する',tasks:'会場づくり',staff:'担当者',requirements:'初めての方も歓迎',belongings:'飲み物',risk:'転倒に注意',insurance:'当日の保険案内をご確認ください',photoPolicy:'本人同意',transport:'公共交通機関',prohibited:'勧誘禁止',location:'検証場所',emergency:'検証連絡先',beginner:true,highSchoolParticipation:'allowed',activityKind:'event',participationScope:'open'});
  await api(owner,'activities/'+a.id+'/submit',{});await api(owner,'review/'+a.id+'/approve',{type:'activity',note:'ローカルテストでの確認'});
  const room='waiting/'+a.id,activity='liveactivity/'+a.id;
  const browse=await pageFor(await context(),'/#/livecommunity/'+c.id);
  const communityAction=browse.getByRole('button',{name:'参加できる活動を見る',exact:true});
  await communityAction.waitFor();
  assert.equal(await browse.locator('.community-primary-actions').count(),1);
  assert(await browse.locator('#communityActivities').getByText('入室導線の検証活動').count());
  assert((await browse.locator('[data-live-follow]').getAttribute('class')).includes('btn-secondary'));
  assert.equal(await browse.locator('.feedback-fab').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await browse.locator('.topbar').evaluate(el=>getComputedStyle(el).position),'static');
  await communityAction.click();
  assert(await browse.locator('#communityActivities').evaluate(el=>el.getBoundingClientRect().top>=0));
  await browse.locator('#communityActivities [data-nav=liveactivity]').click();
  await browse.waitForURL('**/#/'+activity);
  assert.match(await browse.locator('.activity-requirements').innerText(),/団体に入っていなくても参加できます|初めての方も歓迎/);
  const applyButton=browse.getByRole('button',{name:'参加を申し込む',exact:true});
  await applyButton.waitFor();
  await browse.setViewportSize({width:320,height:568});await noOverflow(browse);
  await applyButton.scrollIntoViewIfNeeded();
  const visibility=await browse.evaluate(()=>({button:document.querySelector('[data-live-apply]').getBoundingClientRect().bottom,menu:document.querySelector('#bottomTabs').getBoundingClientRect().top}));
  assert(visibility.button<=visibility.menu,'申込みボタンが下部メニューに隠れない');
  await browse.setViewportSize({width:390,height:500});
  assert.equal(await browse.locator('#bottomTabs').evaluate(el=>getComputedStyle(el).position),'static');
  await browse.close();
  const guest=await context(),p=await pageFor(guest,'/#/'+room);
  const loginLink=p.getByRole('link',{name:'ログインして入室する',exact:true}),registerLink=p.getByRole('link',{name:'新規登録して入室する',exact:true});
  await loginLink.waitFor();assert.equal(await loginLink.getAttribute('href'),'#/login/'+encodeURIComponent(room));assert.equal(await registerLink.getAttribute('href'),'#/register/'+encodeURIComponent(room));await noOverflow(p);
  await loginLink.click();await p.getByRole('button',{name:'新規登録へ',exact:true}).click();await p.waitForURL('**/#/register/'+encodeURIComponent(room));
  await p.getByRole('button',{name:'ログインへ',exact:true}).click();await p.waitForURL('**/#/login/'+encodeURIComponent(room));
  await p.reload();await login(p,'lounge-member');await p.waitForURL('**/#/'+room);
  const signedMember={context:guest,id:member.id};await expectNoJoin(p,signedMember,a.id);
  await p.locator('#waitingJoinForm input[name=name]').fill('入室テスター');await p.locator('#waitingJoinForm select').selectOption('adult');await p.locator('#waitingJoinForm input[type=checkbox]').check();
  await p.getByRole('button',{name:'ラウンジに入室する',exact:true}).click();await p.locator('[data-waiting-state="WAITING"]').waitFor();
  assert.equal((await api(signedMember,'dashboard')).applications.length,0,'入室は活動申込みではない');await noOverflow(p);
  await p.getByRole('link',{name:'活動内容を確認して申し込む',exact:true}).click();await p.waitForURL('**/#/'+activity);
  await p.getByRole('button',{name:'参加を申し込む',exact:true}).click();await p.locator('#liveApplyForm [name=year]').selectOption('大学1年生');await p.locator('#liveApplyForm button.btn-primary').click();await p.waitForURL('**/#/myactivity');
  const applications=(await api(signedMember,'dashboard')).applications;assert.equal(applications.length,1);assert.equal(applications[0].status,'APPLIED');
  await p.goto(base+'/#/'+room);await p.locator('[data-waiting-state="WAITING"]').waitFor();assert.match(await p.locator('.flow-card .flow-now').innerText(),/確認待ち|承認待ち/);
  assert.equal(await p.getByRole('link',{name:'活動内容を確認して申し込む',exact:true}).count(),0);assert.equal(await p.locator('[data-live-apply]').count(),0);await noOverflow(p);
  // 新規登録への切替・再読込でも、認証後は元の部屋へ戻る。
  const newContext=await context(),newPage=await pageFor(newContext,'/#/'+room);
  await newPage.getByRole('link',{name:'新規登録して入室する',exact:true}).click();await newPage.reload();
  await newPage.locator('#accountNickname').fill('新規入室テスター');await newPage.locator('#accountEmail').fill('lounge-new@example.test');await newPage.locator('#accountPassword').fill(password);await newPage.locator('#accountConfirm').fill(password);await newPage.locator('#accountConsent').check();await newPage.locator('#accountSubmit').click();await newPage.waitForURL('**/#/'+room);
  const me=await newContext.request.get(base+'/api/me');assert(me.ok());const newUser={context:newContext,id:(await me.json()).user.id};await expectNoJoin(newPage,newUser,a.id);
  // 活動から申込みを始めたゲストも、認証後に元の活動へ戻れる。
  const activityContext=await context(),activityPage=await pageFor(activityContext,'/#/'+activity);
  await activityPage.getByRole('button',{name:'参加を申し込む',exact:true}).click();await activityPage.waitForURL('**/#/login/'+encodeURIComponent(activity));await activityPage.reload();await login(activityPage,'lounge-new');await activityPage.waitForURL('**/#/'+activity);await activityPage.getByRole('button',{name:'参加を申し込む',exact:true}).waitFor();await noOverflow(activityPage);
  assert.equal((await api(newUser,'dashboard')).applications.length,0,'ログインだけでは活動にも申し込まない');
  assert.deepEqual(failures,[]);
  console.log('PASS: empty/error distinction, login/register return routes and reload, explicit lounge entry, independent activity application, pending state, guest activity return and 390px layout');
}finally{
  if(failures.length)console.error('Browser errors:',failures);
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  app?.close();db.close();
}})().catch(error=>{console.error(error);process.exitCode=1;});
