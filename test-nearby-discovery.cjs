const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-nearby-'));
const base='http://127.0.0.1:4198';let server,browser;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function start(){server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:'4198',TOBIYORI_DATA_DIR:dir},stdio:'pipe'});for(let i=0;i<400;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await delay(50);}throw Error('server unavailable');}
async function stop(){if(!server||server.exitCode!==null)return;const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}
(async()=>{try{
 await start();
 const registered=await fetch(base+'/api/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'nearby@example.test',password:'workflow-testing-123',nickname:'担当者',consent:true})});assert.equal(registered.status,201);const ownerCookie=registered.headers.get('set-cookie').split(';')[0],owner=(await registered.json()).user.id;
 const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));const now=Date.now(),iso=ms=>new Date(now+ms).toISOString();
 try{
  for(const [id,name,city,point] of [['near','高崎の会','高崎市',[36.32,139.00]],['far','桐生の会','桐生市',[36.40,139.33]]])db.prepare("INSERT INTO live_communities(id,owner_id,name,city,data,status,confirmed_at,updated_at) VALUES(?,?,?,?,?,'VERIFIED',?,?)").run(id,owner,name,city,JSON.stringify({type:'地域団体',intro:'動作確認用',publicPoint:point}),iso(0),iso(0));
  for(const [id,cid,start,end] of [['ongoing','near',-3600000,3600000],['soon','near',2*86400000,2*86400000+3600000],['later','near',10*86400000,10*86400000+3600000],['distant','far',86400000,86400000+3600000],['ended','near',-2*86400000,-86400000]])db.prepare("INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,status,published_at,updated_at) VALUES(?,?,?,?,?,10,?,'PUBLISHED',?,?)").run(id,cid,id,iso(start),iso(end),JSON.stringify({genre:'地域活動',activityCity:cid==='near'?'高崎市':'桐生市'}),iso(0),iso(0));
 }finally{db.close();}
 browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'}),args:['--disable-gpu']});
 const context=await browser.newContext({viewport:{width:390,height:844},geolocation:{latitude:36.32,longitude:139.00},permissions:['geolocation']});const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/#/serendipity');await page.locator('[data-nearby-city]').waitFor();await page.locator('[data-nearby-city]').selectOption('高崎市');
 await page.getByText('見つかった活動 2件').waitFor();assert(await page.getByText('ongoing',{exact:true}).isVisible());assert(await page.getByText('soon',{exact:true}).isVisible());assert.equal(await page.getByText('distant',{exact:true}).count(),0);
 await page.locator('[data-nearby-days]').selectOption('14');await page.getByText('見つかった活動 3件').waitFor();
 await page.locator('[data-nearby-current]').click();await page.getByText('現在地から20km以内').waitFor();assert.equal(await page.getByText('見つかった活動 3件').count(),1);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const visitorResponse=await fetch(base+'/api/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'visitor@example.test',password:'workflow-testing-123',nickname:'匿名テスト利用者',consent:true})});assert.equal(visitorResponse.status,201);const visitorCookie=visitorResponse.headers.get('set-cookie').split(';')[0],visitor=(await visitorResponse.json()).user.id;
 await context.addCookies([{name:'tobiyori_session',value:visitorCookie.split('=')[1],url:base}]);await page.goto(base+'/#/livecommunity/near');await page.reload();
 const form=page.locator('[data-community-question-form]');await form.waitFor();await form.locator('[data-community-question-template]').first().click();await form.getByRole('button',{name:'質問を送る'}).click();await page.getByText('回答待ちのあなたの質問').waitFor();
 const inboxResponse=await fetch(base+'/api/live/community-questions',{headers:{Origin:base,Cookie:ownerCookie,'X-Tobiyori-Account':owner}});assert.equal(inboxResponse.status,200);const inbox=(await inboxResponse.json()).questions;assert.equal(inbox.length,1);
 const answered=await fetch(base+'/api/live/community-questions/'+inbox[0].id+'/answer',{method:'POST',headers:{Origin:base,Cookie:ownerCookie,'X-Tobiyori-Account':owner,'Content-Type':'application/json'},body:JSON.stringify({answer:'初めての方も歓迎します。'})});assert.equal(answered.status,200);
 await page.reload();await page.getByText('初めての方も歓迎します。').waitFor();assert(!await page.locator('.community-questions').innerText().then(text=>text.includes('匿名テスト利用者')));
 assert.deepEqual(errors,[]);console.log('PASS: nearby guest, ongoing/soon, date/radius, geolocation, mobile layout; community question browser flow');
}finally{if(browser)await browser.close();await stop();assert(path.basename(dir).startsWith('tobiyori-nearby-'));fs.rmSync(dir,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
