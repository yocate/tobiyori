const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.TOBIYORI_PLAYWRIGHT||'playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-review-ui-'));
const base='http://127.0.0.1:4199';
let server,browser;
async function ready(){
 server=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:'4199',TOBIYORI_DATA_DIR:dir},stdio:'pipe'});
 let output='';server.stderr.on('data',data=>output+=data);
 for(let i=0;i<200;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
 throw Error(output||'server not ready');
}
async function signup(name){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const result=await context.request.post(base+'/api/register',{headers:{Origin:base},data:{email:name+'@example.test',password:'review-test-password',nickname:name,consent:true}});
 assert.equal(result.status(),201);return {context,id:(await result.json()).user.id};
}
async function request(user,route,method='GET',data){
 const result=await user.context.request.fetch(base+'/api/live/'+route,{method,headers:{Origin:base,'X-Tobiyori-Account':user.id},...(data?{data}:{})});
 return {status:result.status(),data:await result.json()};
}
(async()=>{try{
 await ready();browser=await chromium.launch({headless:true,...(process.env.TOBIYORI_BROWSER?{executablePath:process.env.TOBIYORI_BROWSER}:{channel:'chrome'})});
 const owner=await signup('団体担当'),participant=await signup('参加者A'),reporter=await signup('閲覧者B');
 const stamp=new Date().toISOString(),cid='review-community',aid='review-activity';
 const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));
 db.prepare('INSERT INTO live_communities(id,owner_id,name,city,data,status,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(cid,owner.id,'口コミ確認コミュニティ','高崎市',JSON.stringify({type:'地域団体',intro:'口コミの確認用です'}),'VERIFIED',stamp,stamp);
 db.prepare('INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,status,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(aid,cid,'参加済みの活動','2026-01-01T01:00:00Z','2026-01-01T03:00:00Z',10,JSON.stringify({genre:'学習支援'}),'CLOSED',stamp,stamp);
 db.prepare('INSERT INTO live_applications VALUES(?,?,?,?,?,?,?,?,?)').run('review-application',aid,participant.id,'体験参加','',0,0,'DONE',stamp);
 db.close();
 const page=await participant.context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/#/mypage');await page.getByRole('button',{name:'口コミを書く'}).waitFor();
 await page.getByRole('button',{name:'口コミを書く'}).click();
 await page.locator('#liveReviewRating').selectOption('4');await page.locator('#liveReviewText').fill('活動の説明がわかりやすく、安心して参加できました。');
 await page.locator('[name=anonymous]').uncheck();await page.getByRole('button',{name:'投稿内容を確認'}).click();
 assert.equal(await page.locator('[data-review-preview-name]').innerText(),'参加者A');
 assert.match(await page.locator('[data-review-preview-text]').innerText(),/安心して参加/);
 await page.screenshot({path:'/tmp/tobiyori-review-preview.png'});
 assert.equal((await request(participant,'community-reviews/'+cid)).data.total,0,'確認前には公開されない');
 await page.getByRole('button',{name:'口コミを公開する'}).click();await page.getByText('口コミを公開しました。',{exact:true}).waitFor();
 let feed=(await request(participant,'community-reviews/'+cid)).data;
 assert.equal(feed.total,1);assert.equal(feed.reviews[0].author,'参加者A');assert.equal(feed.reviews[0].rating,4);
 assert.equal((await request(participant,'catalog')).data.communities.find(c=>c.id===cid).buzz.reviews,1);
 assert.equal((await request(participant,'reviews/'+aid,'POST',{rating:5,text:'重複した口コミを投稿しようとしました。',anonymous:true})).status,409);
 await page.getByRole('button',{name:'口コミを編集'}).click();await page.locator('#liveReviewText').fill('編集した感想です。地域の人と交流できました。');
 await page.getByRole('button',{name:'変更を確認'}).click();await page.getByRole('button',{name:'変更を保存'}).click();await page.getByText('口コミを更新しました。',{exact:true}).waitFor();
 feed=(await request(participant,'community-reviews/'+cid)).data;assert.equal(feed.total,1);assert.match(feed.reviews[0].text,/編集した感想/);
 const viewer=await reporter.context.newPage();viewer.on('pageerror',error=>errors.push(error.message));
 await viewer.goto(base+'/#/livecommunity/'+cid);await viewer.locator('.community-more > summary',{hasText:'参加者の口コミ'}).click();
 await viewer.getByText('編集した感想です。地域の人と交流できました。').waitFor();
 await viewer.getByRole('button',{name:'この口コミを通報'}).click();await viewer.locator('#liveReviewReportBody').fill('個人を特定できそうな内容があるため確認してください。');
 await viewer.getByRole('button',{name:'運営に通報する'}).click();await viewer.getByText('口コミの通報を受け付けました。',{exact:true}).waitFor();
 const report=(await request(reporter,'reports')).data.reports[0];assert.equal(report.review_id,feed.reviews[0].id);
 assert.equal((await request(reporter,'reports','POST',{communityId:cid,activityId:aid,reviewId:report.review_id,kind:'通報',body:'重複通報です。'})).status,409);
 assert.equal((await request(reporter,'reviews/'+aid,'PUT',{rating:1,text:'他人の口コミを変更しようとしました。',anonymous:true})).status,403);
 assert.equal((await request(reporter,'reviews/'+aid,'DELETE')).status,403);
 await page.getByRole('button',{name:'口コミを削除'}).click();await page.locator('#liveReviewDelete').click();await page.getByText('口コミを削除し、集計を更新しました。',{exact:true}).waitFor();
 assert.equal((await request(participant,'community-reviews/'+cid)).data.total,0);
 assert.equal((await request(participant,'catalog')).data.communities.find(c=>c.id===cid).buzz.reviews,0);
 assert.deepEqual(errors,[]);
 console.log('PASS: completed participation → preview → publish → community feed/count → edit → other-user report → delete; duplicate and permission checks');
}finally{
 if(browser)await browser.close();
 if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}
 fs.rmSync(dir,{recursive:true,force:true});
}})().catch(error=>{console.error(error);process.exitCode=1;});
