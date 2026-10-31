'use strict';
// メモリDBとローカルHTTPだけで、下書き・審査・公開後変更を検証する。
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
const {createApp}=require('./app.cjs');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
const failures=[],preview=path.join(__dirname,'.build-internship-form-preview');
let app,browser,base,context,owner;
const server=http.createServer(async(req,res)=>{try{
  if(await app.handle(req,res)!==false)return;
  const pathname=new URL(req.url,base).pathname;
  const relative=['/','/index.html','/operator.html'].includes(pathname)?'gunma-community-map.html':decodeURIComponent(pathname).slice(1);
  const root=path.join(__dirname,'成果物'),file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!['.html','.js','.css','.png'].includes(path.extname(file))){res.writeHead(404);return res.end();}
  const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[path.extname(file)]});res.end(content);
}catch(error){res.writeHead(500);res.end(error.message);}});
async function request(route,data){return context.request[data===undefined?'get':'post'](base+'/api/live/'+route,{headers:{Origin:base,'X-Tobiyori-Account':owner},...(data===undefined?{}:{data})});}
async function api(route,data){const r=await request(route,data);assert(r.ok(),route+': '+await r.text());return r.json();}
async function activity(id){return (await api('dashboard')).activities.find(a=>a.id===id);}
async function edit(page,id){await page.goto(base+'/#/org/edit-'+id);await page.reload();await page.locator('#liveActivityForm').waitFor();}
async function save(page,id){const response=page.waitForResponse(r=>r.url()===base+'/api/live/activities/'+id&&r.request().method()==='POST');await page.locator('#liveActivityForm button[type=submit]').click();const r=await response;assert(r.ok(),await r.text());await page.waitForURL(url=>url.hash==='#/org');}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390pxで横にはみ出さない');}
const basic=['title','startsAt','endsAt','capacity'];
const content={companyRole:'地域企画の仕事を体験',purpose:'地域の仕事を知る',tasks:'企画会議と見学',staff:'担当社員',requirements:'未経験歓迎',fees:'無料',remuneration:'なし',belongings:'筆記具',risk:'移動時は担当者が同行',insurance:'主催者加入',photoPolicy:'撮影前に同意を確認',transport:'公共交通機関',prohibited:'無断撮影',location:'検証会場の受付',emergency:'当日の担当窓口',workplace:'高崎市内',workSchedule:'午後に実施',selectionProcess:'申込み後に担当者が確認',applicationURL:'https://example.test/internship'};
(async()=>{try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  app=createApp({db,origins:[base],hosts:[new URL(base).host],community:{schedule:false}});
  browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'})});
  context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
  const registered=await context.request.post(base+'/api/register',{headers:{Origin:base},data:{email:'internship-form@example.test',password:'local-internship-test-password',nickname:'募集フォーム検証',consent:true}});assert.equal(registered.status(),201,await registered.text());owner=(await registered.json()).user.id;
  db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(owner);
  const company=await api('communities',{name:'インターン検証企業',city:'高崎市',type:'企業・店舗',sector:'company',intro:'ローカル検証用です。',adminInfo:{consentConfirmed:true}});
  await api('review/'+company.id+'/approve',{type:'community',note:'ローカル検証',identityChecked:true,consentChecked:true});
  const a=await api('activities',{communityId:company.id});
  await api('activities/'+a.id,{title:'インターンの下書き',startsAt:new Date(Date.now()+3*86400000).toISOString(),endsAt:new Date(Date.now()+3*86400000+7200000).toISOString(),capacity:8,companyKind:'internship'});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>failures.push(e.message));await edit(page,a.id);
  const form=page.locator('#liveActivityForm');
  for(const section of ['content','safety','optional']){const details=form.locator('details[data-activity-section="'+section+'"]');assert.equal(await details.count(),1);assert.equal(await details.evaluate(el=>el.open),false);}
  assert.deepEqual(await form.locator('[required]').evaluateAll(els=>els.map(el=>el.name).sort()),[...basic].sort(),'下書きの必須は基本4項目');
  for(const name of ['companyKind',...basic,'genre'])assert(await form.locator('[name="'+name+'"]').isVisible(),name+'は初期表示');
  assert.equal(await form.locator('[name=companyRole]').getAttribute('data-review-required')!==null,true);
  await noOverflow(page);await fs.mkdir(preview,{recursive:true});await page.screenshot({path:path.join(preview,'initial-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1366,height:900});await page.screenshot({path:path.join(preview,'initial-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
  await form.locator('[name=title]').fill('初めての地域企画インターン');
  const localDate=offset=>{const d=new Date(Date.now()+offset);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  await form.locator('[name=startsAt]').fill(localDate(3*86400000));await form.locator('[name=endsAt]').fill(localDate(3*86400000+7200000));await form.locator('[name=capacity]').fill('8');
  await save(page,a.id);assert.equal((await activity(a.id)).status,'DRAFT');
  const incomplete=await request('activities/'+a.id+'/submit',{});assert.equal(incomplete.status(),400,'基本4項目だけでは審査依頼不可');
  await edit(page,a.id);
  await form.locator('[name=companyKind]').selectOption('recruitment');
  assert(await form.locator('[data-activity-section=safety]').evaluate(el=>el.hidden),'採用では安全情報を非表示');
  assert.equal(await form.locator('[name=employmentType]').evaluate(el=>!!el.closest('[hidden]')),false,'採用では雇用形態を非表示にしない');
  await form.locator('[name=companyKind]').selectOption('internship');
  assert.equal(await form.locator('[data-activity-section=safety]').evaluate(el=>el.hidden),false);
  assert(await form.locator('[name=employmentType]').evaluate(el=>!!el.closest('[hidden]')),'インターンでは雇用形態を非表示');
  // 一時保存の復元もchangeと同じ表示更新を行う。
  await form.locator('[name=companyKind]').selectOption('recruitment');
  await form.locator('.live-draft-tools summary').click();
  await form.locator('[data-draft-save]').click();await form.locator('[data-draft-status]').filter({hasText:'入力途中を保存しました。'}).waitFor();
  await form.locator('[name=companyKind]').selectOption('internship');
  await form.locator('[data-draft-load]').click();await form.locator('[data-draft-status]').filter({hasText:'保存した入力を復元しました。'}).waitFor();
  assert.equal(await form.locator('[name=companyKind]').inputValue(),'recruitment');
  assert(await form.locator('[data-activity-section=safety]').evaluate(el=>el.hidden),'一時保存復元後も採用の安全情報を非表示');
  assert.equal(await form.locator('[name=employmentType]').evaluate(el=>!!el.closest('[hidden]')),false,'復元後に雇用形態を表示');
  assert.deepEqual(await form.locator('[required]').evaluateAll(els=>els.map(el=>el.name).sort()),[...basic].sort(),'復元後も下書き必須4項目');
  // 入力済みの折りたたみ項目も通常の保存で維持する。
  await api('activities/'+a.id,{...await activity(a.id),...content,companyKind:'internship'});await edit(page,a.id);
  await form.locator('[name=title]').fill('インターンの下書き更新');await save(page,a.id);
  const retained=await activity(a.id);for(const [key,value] of Object.entries(content))assert.equal(retained[key],value,key+'を保持');
  await edit(page,a.id);await form.locator('details').evaluateAll(els=>els.forEach(el=>el.open=true));
  for(const [key,value] of Object.entries(content))await form.locator('[name="'+key+'"]').fill(value);
  await noOverflow(page);await page.screenshot({path:path.join(preview,'expanded-mobile.png'),fullPage:true});await save(page,a.id);
  await api('activities/'+a.id+'/submit',{});
  await page.goto(base+'/operator.html#/admin');await page.reload();
  const search=page.locator('[data-approval-search=review]');await search.waitFor();
  await search.locator('[name=query]').fill('インターン');await search.locator('[name=status]').selectOption('REVIEW');await search.locator('[type=submit]').click();
  await page.getByText(/^1件表示 \/ 全\d+件$/).waitFor();assert.equal(await page.locator('[data-live-review=activity][data-action=approve]').count(),1);
  await noOverflow(page);await page.screenshot({path:path.join(preview,'approval-search-mobile.png'),fullPage:true});
  await search.locator('[name=query]').fill('見つからない');await search.locator('[type=submit]').click();
  await page.getByText(/^0件表示 \/ 全\d+件$/).waitFor();assert.equal(await page.locator('[data-live-review=activity]').count(),0);
  await search.locator('[data-approval-clear=review]').click();await page.getByText(/^\d+件表示 \/ 全\d+件$/).waitFor();
  assert.equal(await search.locator('[name=query]').inputValue(),'');assert.equal(await search.locator('[name=status]').inputValue(),'');
  assert.equal(await page.locator('[data-live-review=activity][data-action=approve]').count(),1);await noOverflow(page);
  await api('review/'+a.id+'/approve',{type:'activity',note:'情報が揃っていることを確認'});
  // 公開ページでも企業向けの入力内容を確認できる。
  const publicPage=await context.newPage();publicPage.on('pageerror',e=>failures.push(e.message));
  await publicPage.goto(base+'/#/liveactivity/'+a.id);
  const publicFacts=publicPage.locator('.live-verification').filter({has:publicPage.getByRole('heading',{name:'インターン',exact:true})});
  await publicFacts.waitFor();
  for(const key of ['companyRole','workplace','workSchedule','selectionProcess'])assert((await publicFacts.textContent()).includes(content[key]),key+'を公開詳細に表示');
  const officialLink=publicFacts.getByRole('link',{name:'公式の募集情報を見る'});
  assert.equal(await officialLink.getAttribute('href'),content.applicationURL);assert.equal(await officialLink.getAttribute('rel'),'noopener noreferrer');
  await noOverflow(publicPage);await publicPage.close();
  await edit(page,a.id);assert.equal(await form.getAttribute('data-published'),'true');
  for(const name of ['companyRole','fees','remuneration','risk','location'])assert(await form.locator('[name='+name+']').evaluate(el=>el.required),name+'は公開後変更の必須');
  // 実際のネイティブ制約検証を発生させ、閉じた必須欄へ誘導できることを確認。
  const risk=form.locator('[name=risk]');await risk.evaluate(el=>{el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));el.closest('details').open=false;});
  await form.locator('button[type=submit]').click();assert(await risk.evaluate(el=>el.closest('details').open),'invalid発火で該当detailsが開く');
  assert.equal((await activity(a.id)).risk,content.risk,'不正な変更で公開値を壊さない');
  await noOverflow(page);assert.deepEqual(failures,[]);
  console.log('PASS: 下書き4項目、折りたたみ、入力値保持、募集区分切替と一時保存復元、審査検索、審査、公開インターン詳細、公開後必須の展開、390px表示');
  console.log('Screenshots: '+preview);
}finally{if(failures.length)console.error('Browser errors:',failures);if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));app?.close();db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
