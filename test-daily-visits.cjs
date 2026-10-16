const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{spawn}=require('node:child_process');
const {createDailyVisits}=require('./daily-visits.cjs');
// Midnight is Japanese calendar midnight, even for browsers in a different time zone.
{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE accounts(id TEXT PRIMARY KEY);INSERT INTO accounts VALUES('a'),('b')");
 let time=Date.parse('2026-12-31T14:59:59.999Z');const visits=createDailyVisits({db,clock:()=>time});
 let r=visits.claim('a');assert.equal(r.day,'2026-12-31');assert.equal(r.awarded,true);assert.equal(r.nextCheckInMs,1);assert.equal(visits.claim('a').awarded,false);assert.equal(visits.snapshot('b').totalPoints,0);
 time++;r=visits.claim('a');assert.equal(r.day,'2027-01-01');assert.equal(r.totalPoints,2);assert.equal(r.nextCheckInMs,86400000);
 time=Date.parse('2027-01-05T10:00:00Z');assert.equal(visits.claim('a').totalPoints,3,'skipped days neither reset nor earn points');
 assert.equal(createDailyVisits({db,clock:()=>time}).claim('a').awarded,false);db.close();
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-daily-visits-')),base='http://127.0.0.1:4196';let server,browser;
async function start(){server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:'4196',TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});let output='';server.stderr.on('data',c=>output+=c);for(let i=0;i<200;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error(output);}
async function stop(){if(!server||server.exitCode!==null)return;const done=new Promise(r=>server.once('exit',r));server.kill();await done;}
async function api(route,user,body,method,overrides={}){const headers={Origin:base,...(user?{Cookie:user.cookie,'X-Tobiyori-Account':user.id}:{}),...(body?{'Content-Type':'application/json'}:{}),...overrides};const res=await fetch(base+'/api/'+route,{method:method||(body?'POST':'GET'),headers,body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};}
async function ok(...args){const r=await api(...args);assert(r.status<300,JSON.stringify(r.data));return r.data;}
async function signup(name){const r=await api('register',null,{email:name+'@example.test',password:'daily-visit-test-123',nickname:name,consent:true});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie.split(';')[0]};}
function editDB(fn){const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));try{fn(db);}finally{db.close();}}
(async()=>{try{
 await start();const a=await signup('a'),b=await signup('b'),visitor=await signup('visitor'),operator=await signup('operator');
 assert.equal((await api('live/daily-visit',null,{})).status,401);
 assert.equal((await api('live/daily-visit',a,{},'POST',{'X-Tobiyori-Account':b.id})).status,409);
 assert.equal((await api('live/daily-visit',a,{},'POST',{Origin:'https://example.test'})).status,403);
 assert.equal((await api('live/daily-visit',a,undefined,'GET')).status,405);
 assert.equal((await ok('live/dashboard',a)).dailyVisit.totalPoints,0,'reading a dashboard alone does not claim');
 const claims=await Promise.all(Array.from({length:8},()=>ok('live/daily-visit',a,{userId:b.id,date:'2099-01-01',points:999})));
 assert.equal(claims.filter(r=>r.dailyVisit.awarded).length,1);assert(claims.every(r=>r.journeyPoints===1));
 assert.equal((await ok('live/dashboard',b)).dailyVisit.totalPoints,0);
 let dashboard=await ok('live/dashboard',a);assert.equal(dashboard.journeyPoints,1);assert.equal(dashboard.participationPoints,0);assert.deepEqual(dashboard.participationBadges,[]);
 const stored=await ok('state',a);await ok('state',a,{state:{...stored.state,points:999999,dailyVisit:{totalPoints:99999}},revision:stored.revision},'PUT');assert.equal((await ok('live/dashboard',a)).journeyPoints,1);
 // Seed earlier visits only in the disposable database, then earn a chapter through the real endpoint.
 editDB(db=>{const insert=db.prepare('INSERT INTO live_daily_visits VALUES(?,?,1,?)');for(let i=0;i<149;i++){const day=new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10);insert.run(b.id,day,day+'T00:00:00Z');}db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(operator.id);});
 const chapter=await ok('live/daily-visit',b,{});assert.equal(chapter.journeyPoints,150);assert.equal(chapter.journeyBadges[0].chapter,1);assert.equal((await ok('live/dashboard',b)).participationBadges.length,0);
 const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'})});
 async function contextFor(user){const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'});await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await context.addCookies([{name:'tobiyori_session',value:user.cookie.split('=')[1],url:base}]);return context;}
 const context=await contextFor(visitor),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#/home');await page.getByText('今日のよりみちで +1pt！',{exact:true}).waitFor();assert.equal((await ok('live/dashboard',visitor)).journeyPoints,1);
 await page.goto(base+'/#/mypage');await page.locator('.daily-visit-earned').waitFor();assert((await page.locator('.points-personal').innerText()).includes('1pt'));assert.equal(await page.locator('.journey-details').getAttribute('open'),null);
 await page.locator('.journey-details>summary').click();assert((await page.locator('.journey-details').innerText()).includes('午前0時'));assert((await page.locator('.journey-details').innerText()).includes('訪問：1pt'));
 await page.locator('.journey-details>summary').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));fs.mkdirSync('.audit-20261003/daily-visits',{recursive:true});await page.locator('.points-personal').screenshot({path:'.audit-20261003/daily-visits/points-mobile.png'});
 const another=await context.newPage();await another.goto(base+'/#/mypage');await another.locator('.daily-visit-earned').waitFor();await page.reload();await page.locator('.daily-visit-earned').waitFor();assert.equal((await ok('live/dashboard',visitor)).journeyPoints,1,'reload and second tab cannot farm points');
 const op=await contextFor(operator),opPage=await op.newPage();await opPage.goto(base+'/operator.html');await opPage.getByRole('heading',{name:'今日の運営メニュー'}).waitFor();assert.equal((await ok('live/dashboard',operator)).dailyVisit.totalPoints,0,'operator page does not claim a participant visit');
 assert.deepEqual(errors,[]);await browser.close();browser=null;await stop();await start();assert.equal((await ok('live/daily-visit',visitor,{})).dailyVisit.awarded,false);assert.equal((await ok('live/dashboard',b)).journeyPoints,150);
 console.log('PASS: JST midnight; duplicate/concurrent claims; skipped days; authenticated own-account scope; spoof protection; chapter unlock without participation badges; real visit from home; mobile points display; multiple tabs and reload; operator exclusion; restart persistence.');
}finally{if(browser)await browser.close();await stop();const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('tobiyori-daily-visits-'));fs.rmSync(target,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
