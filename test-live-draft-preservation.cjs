const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),{createApp}=require('./app.cjs'),{chromium}=require('playwright');
const db=new DatabaseSync(':memory:');let app;
const source=fs.readFileSync('成果物/gunma-community-map.html','utf8');
const server=http.createServer(async(req,res)=>{
 if(await app.handle(req,res)!==false)return;
 const url=new URL(req.url,'http://localhost');
 if(['/', '/operator.html'].includes(url.pathname)){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(source);}
 else{res.statusCode=404;res.end();}
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 app=createApp({db,origins:[base],hosts:[new URL(base).host],community:{schedule:false}});
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const browser=await chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
 const errors=[];
 try{
  const owner=await browser.newContext(),student=await browser.newContext(),password=crypto.randomBytes(18).toString('hex');
  const users=new Map();
  async function api(ctx,route,data){const r=await ctx.request[ data===undefined?'get':'post'](base+'/api/'+route,{headers:{Origin:base,...(users.has(ctx)?{'X-Tobiyori-Account':users.get(ctx)}:{})},...(data===undefined?{}:{data})});assert(r.ok(),route+': '+await r.text());return r.json();}
  const registered=await api(owner,'register',{email:crypto.randomUUID()+'@example.test',password,nickname:'検証担当',consent:true});
  users.set(owner,registered.user.id);
  db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(registered.user.id);
  const studentRegistered=await api(student,'register',{email:crypto.randomUUID()+'@example.test',password,nickname:'検証参加者',consent:true});users.set(student,studentRegistered.user.id);
  const community=await api(owner,'live/communities',{name:'【ローカル検証】入力保持',city:'高崎市',type:'学生団体',intro:'入力保持を確認します'});
  await api(owner,'live/review/'+community.id+'/approve',{type:'community',note:'ローカルのみの検証',identityChecked:true,consentChecked:true});
  await api(student,'live/community-questions/'+community.id,{body:'回答を入力している途中でも保持されますか？'});
  const adminPage=await owner.newPage(),userPage=await student.newPage();for(const page of [adminPage,userPage])page.on('pageerror',error=>errors.push(error.message));
  let revision=0;const bump=()=>db.prepare('UPDATE live_communities SET name=? WHERE id=?').run('【ローカル検証】入力保持 '+(++revision),community.id);
  await adminPage.goto(base+'/operator.html#/admin/new');
  const intro=adminPage.locator('#liveCommunityForm [name=intro]');await intro.fill('通信エラーが起きても消してはいけない団体紹介です。');
  let fail=true;await adminPage.route('**/api/live/catalog',route=>fail?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'ローカルの通信失敗試験'})}):route.continue());
  await adminPage.locator('#liveSyncNotice').waitFor();assert.equal(await intro.inputValue(),'通信エラーが起きても消してはいけない団体紹介です。');
  fail=false;bump();await adminPage.waitForFunction(()=>!document.getElementById('liveSyncNotice'));
  assert.equal(await intro.inputValue(),'通信エラーが起きても消してはいけない団体紹介です。');
  console.log('PASS browser: operator registration draft survives a failed background refresh and recovery');
  let failQuestion=true;await userPage.route('**/api/live/community-questions/'+community.id,route=>route.request().method()==='GET'&&failQuestion?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'質問取得の失敗試験'})}):route.continue());
  await userPage.goto(base+'/#/livecommunity/'+community.id);
  await userPage.locator('[data-question-load-error]').waitFor();assert.equal(await userPage.locator('[data-community-questions] [role=status]').count(),0);
  failQuestion=false;bump();
  const question=userPage.locator('[data-community-question-form] [name=body]');await question.fill('途中の質問を保持してください');bump();
  await userPage.waitForFunction(n=>document.querySelector('#app')?.textContent.includes('入力保持 '+n),revision);await pause(600);
  assert.equal(await question.inputValue(),'途中の質問を保持してください');assert(await question.evaluate(el=>el===document.activeElement));
  await adminPage.goto(base+'/operator.html#/org');
  const answer=adminPage.locator('[data-community-question-answer] [name=answer]').first();await answer.fill('入力中の回答も保持してください');bump();await pause(3500);
  assert.equal(await answer.inputValue(),'入力中の回答も保持してください');assert(await answer.evaluate(el=>el===document.activeElement));
  await userPage.locator('[data-community-question-form] button.btn-primary').click();await userPage.waitForFunction(()=>document.querySelector('[data-community-question-form] [name=body]')?.value==='');
  assert(!(await userPage.locator('[data-community-question-form] button.btn-primary').isDisabled()));
  let release,started=false;await userPage.route('**/api/live/community-questions/'+community.id,async route=>{if(route.request().method()==='POST'){started=true;await new Promise(resolve=>release=resolve);}await route.continue();});
  await question.fill('送信した本文');await userPage.locator('[data-community-question-form] button.btn-primary').click();
  for(let n=0;n<50&&!started;n++)await pause(20);assert(started);await question.fill('送信した本文に追記しました');release();await pause(1000);
  assert.equal(await question.inputValue(),'送信した本文に追記しました');
  console.log('PASS browser: async question/answer drafts and focus survive redraw; sent question clears and remains usable');
  // Make a genuine profile save fail, revoke its session, then sign in again.
  await userPage.goto(base+'/#/mypage');await userPage.locator('[data-mtab="profile"]').click();
  let failSave=true;await userPage.route('**/api/state',route=>route.request().method()==='PUT'&&failSave?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'保存失敗の検証'})}):route.continue());
  await userPage.locator('#pf_nickname').fill('復元するニックネーム');await userPage.locator('#profileForm button[type=submit]').click();
  await userPage.waitForFunction(()=>document.querySelector('#accountBar')?.textContent.includes('未保存'));
  const studentMe=await api(student,'me');db.prepare('DELETE FROM sessions WHERE user_id=?').run(studentMe.user.id);
  await userPage.getByRole('heading',{name:'おかえりなさい。'}).waitFor();
  assert((await userPage.locator('#accountBar').innerText()).includes('同じアカウントでログイン'));
  failSave=false;
  // Logging in through the API and reloading would discard the in-memory draft;
  // use the real form in this same page instead.
  const accountEmail=registered.user.email; // owner account first: never offer another person's recovery.
  await userPage.locator('#accountEmail').fill(accountEmail);await userPage.locator('#accountPassword').fill(password);await userPage.locator('#accountForm button[type=submit]').click();
  await userPage.waitForFunction(()=>!document.getElementById('accountForm'));
  assert.equal(await userPage.getByRole('button',{name:'未保存の変更を復元して保存',exact:true}).count(),0);
  assert(await userPage.getByRole('button',{name:'保持した変更をすべて破棄',exact:true}).isVisible());
  assert(!(await userPage.locator('#app').innerText()).includes('復元するニックネーム'));
  // The other account logs out in another tab; use its API cookie to switch the
  // same browser context back to the original user, retaining this page's memory.
  const studentEmail=studentMe.user.email;
  users.set(student,registered.user.id);await api(student,'logout',{});
  await userPage.goto(base+'/#/login');
  await userPage.locator('#accountForm').waitFor();
  await userPage.locator('#accountEmail').fill(studentEmail);await userPage.locator('#accountPassword').fill(password);await userPage.locator('#accountForm button[type=submit]').click();users.set(student,studentRegistered.user.id);
  const restore=userPage.getByRole('button',{name:'未保存の変更を復元して保存',exact:true});await restore.waitFor();
  await userPage.setViewportSize({width:390,height:844});assert(await userPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const output=process.env.TOBIYORI_TEST_OUTPUT_DIR;if(output){fs.mkdirSync(output,{recursive:true});await userPage.locator('#accountBar').screenshot({path:path.join(output,'recovery-mobile.png')});}
  userPage.once('dialog',dialog=>dialog.accept());await restore.click();
  await userPage.waitForFunction(()=>!document.querySelector('#accountBar')?.textContent.includes('未保存'));
  assert.equal((await api(student,'state')).state.profile.nickname,'復元するニックネーム');
  console.log('PASS browser: unsaved state survives revocation, stays hidden from another account, restores only after original-account confirmation');
  if(output)await answer.locator('..').screenshot({path:path.join(output,'answer-draft-preserved.png')});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await new Promise(resolve=>server.close(resolve));app?.close();db.close();});
