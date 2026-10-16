// Feedback: anyone sends anonymously with analysis context; only operators list, triage and export.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-feedback-')),port=4198,base='http://127.0.0.1:'+port;
let server,browser;
async function start(){server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:String(port),TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});let out='';server.stderr.on('data',c=>out+=c);for(let i=0;i<400;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('not ready '+out);}
async function stop(){if(!server||server.exitCode!==null)return;const done=new Promise(r=>server.once('exit',r));server.kill();await done;}
const db=fn=>{const d=new DatabaseSync(path.join(dir,'accounts.sqlite'));try{return fn(d);}finally{d.close();}};
async function api(route,user,body,method){const h={Origin:base};if(user){h.Cookie=user.cookie;h['X-Tobiyori-Account']=user.id;}if(body)h['Content-Type']='application/json';const r=await fetch(base+'/api/'+route,{method:method||(body?'POST':'GET'),headers:h,body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,headers:r.headers};}
async function signup(n){const r=await fetch(base+'/api/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:n+'@example.test',password:'feedback-test-123',nickname:n,consent:true})});return {id:(await r.json()).user.id,cookie:r.headers.get('set-cookie').split(';')[0]};}
(async()=>{try{
 await start();const operator=await signup('operator'),student=await signup('student');db(d=>d.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(operator.id));
 const context={fromPage:'#/list',viewport:'390x844',orientation:'portrait',os:'iOS',browser:'Safari',language:'ja-JP',touch:true,secondsOnPage:42,pagesViewed:5,recentErrors:['TypeError: x is undefined']};
 // Anyone can send, signed in or not.
 assert.equal((await api('feedback',null,{category:'hard',rating:2,body:'申込みボタンが見つからない。連絡は taro@example.com 090-1234-5678',page:'#/liveactivity/0b3661c5-1ebe-4a5d-9ff4-61a1e78094db',device:'mobile',context})).status,201);
 assert.equal((await api('feedback',student,{category:'idea',body:'地図で日付も絞りたい',page:'#/map',device:'desktop',context:{...context,os:'Windows',evil:'x',viewport:'<script>'}})).status,201);
 assert.equal((await api('feedback',null,{category:'nope',body:'x'})).status,400);
 assert.equal((await api('feedback',null,{category:'bug',body:''})).status,400);
 assert.equal((await api('feedback',null,{category:'bug',body:'x',rating:9})).status,400);
 const bad=await fetch(base+'/api/feedback',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({category:'bug',body:'x'})});assert.equal(bad.status,403,'cross-site posts are refused');
 // Nothing identifying is stored: no account link, contact details masked, unknown context keys dropped.
 const rows=db(d=>d.prepare('SELECT * FROM app_feedback ORDER BY created_at').all());
 assert(!('user_id' in rows[0]));assert(!JSON.stringify(rows).includes('student@example.test'));assert(!JSON.stringify(rows).includes(student.id));
 assert.match(rows[0].body,/［メール］/);assert.match(rows[0].body,/［電話番号］/);assert.equal(rows[0].page,'#/liveactivity/:id');assert.equal(rows[0].role,'guest');
 const c2=JSON.parse(rows[1].context);assert.equal(rows[1].role,'user');assert.equal(c2.viewport,'');assert(!('evil' in c2));assert.equal(c2.accountAge,'当日');assert.equal(c2.applications,'0件');
 // Only operators can read.
 assert.equal((await api('feedback',student)).status,403);assert.equal((await api('feedback/summary')).status,401);
 const list=(await api('feedback',operator)).data;assert.equal(list.total,2);
 const summary=(await api('feedback/summary',operator)).data;assert.equal(summary.newCount,2);assert.equal(summary.byPage[0].page,'#/liveactivity/:id');assert.equal(summary.byPage[0].problems,1);
 const id=list.items.find(x=>x.category==='hard').id;
 const updated=(await api('feedback/'+id,operator,{status:'PLANNED',tags:['申込み','ナビ'],note:'改善計画のフェーズ2'})).data;assert.equal(updated.status,'PLANNED');assert.deepEqual(updated.tags,['申込み','ナビ']);
 assert.equal((await api('feedback/'+id,operator,{status:'MAYBE'})).status,400);
 assert.equal((await api('feedback?status=PLANNED',operator)).data.total,1);assert.equal((await api('feedback?q=地図',operator)).data.total,1);
 const csv=await api('feedback/export.csv',operator);assert.match(csv.headers.get('content-type'),/text\/csv/);assert(csv.data.startsWith('ID,送信日時(JST),種類'));{const raw=Buffer.from(await (await fetch(base+'/api/feedback/export.csv',{headers:{Cookie:operator.cookie}})).arrayBuffer());assert.deepEqual([...raw.subarray(0,3)],[0xef,0xbb,0xbf],'BOM for Excel');}assert(csv.data.includes('#/liveactivity/:id'));assert(csv.data.includes('対応予定'));
 assert.equal((await api('feedback',null,{category:'other',body:'=HYPERLINK("x")'})).status,201);assert((await api('feedback/export.csv',operator)).data.includes(`"'=HYPERLINK(""x"")"`),'formulas are neutralized in CSV');
 for(let i=0;i<20;i++)await api('feedback',null,{category:'other',body:'連投'+i});assert.equal((await api('feedback',null,{category:'other',body:'over'})).status,429);

 // Browser: a guest sends from the menu, an operator reviews it in the operator screens.
 const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'})});
 await stop();await start();// reset the in-memory rate limit
 const errors=[];const guest=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();guest.on('pageerror',e=>errors.push(e.message));
 await guest.goto(base+'/#/list');await guest.waitForLoadState('networkidle');await guest.locator('[data-more]').first().click();await guest.locator('#modalRoot [data-feedback]').click();
 await guest.locator('#feedbackForm').waitFor();await guest.locator('#feedbackForm [type=submit]').click();assert.match(await guest.locator('#feedbackForm .live-form-error').innerText(),/選んで/);
 await guest.locator('[data-feedback-category=bug]').click();await guest.locator('[data-feedback-rating="3"]').click();await guest.locator('#feedbackBody').fill('検索で結果が出ないことがある');
 const sent=guest.waitForResponse(r=>r.url().endsWith('/api/feedback'));await guest.locator('#feedbackForm [type=submit]').click();assert.equal((await sent).status(),201);await guest.getByText('ご意見を送りました。ありがとうございます').waitFor();
 const saved=db(d=>d.prepare("SELECT * FROM app_feedback WHERE body LIKE '検索で%'").get()),ctx=JSON.parse(saved.context);
 assert.equal(saved.page,'#/list');assert.equal(saved.device,'mobile');assert.equal(saved.rating,3);assert.equal(ctx.viewport,'390x844');assert.equal(ctx.orientation,'portrait');assert(ctx.pagesViewed>=1);assert(Number.isInteger(ctx.secondsOnPage));
 const opCtx=await browser.newContext({viewport:{width:1280,height:900}});await opCtx.addCookies([{name:'tobiyori_session',value:operator.cookie.split('=')[1],url:base}]);const op=await opCtx.newPage();op.on('pageerror',e=>errors.push(e.message));
 await op.goto(base+'/operator.html#/manage');await op.waitForLoadState('networkidle');assert.match(await op.locator('.operator-stats').innerText(),/未確認のご意見\s*\d+/);
 await op.locator('#desktopNav [data-nav=feedback]').click();await op.getByRole('heading',{name:'ご意見の一覧'}).waitFor();
 assert.match(await op.locator('#app').innerText(),/問題の多い画面/);
 const card=op.locator('article',{hasText:'検索で結果が出ないことがある'});await card.locator('summary',{hasText:'送信時の状況'}).click();assert.match(await card.innerText(),/390x844/);assert.match(await card.innerText(),/活動を探す/);
 await card.locator('.feedback-triage summary').click();await card.locator('[name=status]').selectOption('SEEN');await card.locator('[name=tags]').fill('検索');await card.locator('.feedback-triage button[type=submit]').click();await op.getByText('保存しました').waitFor();
 assert.equal(db(d=>d.prepare("SELECT status FROM app_feedback WHERE id=?").get(saved.id)).status,'SEEN');
 const download=op.waitForEvent('download');await op.getByText('この条件でCSVを書き出す').click();assert.match((await download).suggestedFilename(),/^tobiyori-feedback-\d{4}-\d{2}-\d{2}\.csv$/);
 const student2=await (await browser.newContext()).newPage();await student2.context().addCookies([{name:'tobiyori_session',value:student.cookie.split('=')[1],url:base}]);await student2.goto(base+'/operator.html#/feedback');await student2.waitForLoadState('networkidle');assert.equal(await student2.getByRole('heading',{name:'ご意見の一覧'}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: anonymous feedback from anyone with analysis context, masking, CSRF, validation, rate limit, operator-only list/summary/triage/CSV (BOM, formula guard), operator home count and nav, browser send and review.');
}finally{if(browser)await browser.close();await stop();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
