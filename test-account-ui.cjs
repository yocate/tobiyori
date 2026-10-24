const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let source=[...fs.readFileSync('成果物/gunma-community-map.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
source=source.replace(/\/\* ---------------- Boot ---------------- \*\/[\s\S]*?\}\)\(\);/,`globalThis.testUI={viewAccount,viewMypage,queueAccountSave,flushAccount,accountGate,loadAccountState,viewLivePage,liveApplicationCard,
 refreshLive,clearLivePrivate,liveApplyControls,liveHomeActivitiesHTML,liveVerificationHTML,liveFollowsHTML,liveBuzzHTML,liveReviewCard,liveReviewControls,
 setMypageTab(v){mypageTab=v;},getLive(){return LIVE;},setLive(v){LIVE=v;},
 setParam(v){current.param=v;},
 setUser(u){accountUser=u;accountReady=true;},setDB(d){DB=Object.assign(defaultStore(),d);},getDB(){return DB;},setView(v){current.view=v;},getError(){return accountError;}};})();`);
const requests=[];
const context={location:{protocol:'http:',hostname:'localhost',hash:'#/home'},window:{addEventListener(){}},document:{visibilityState:"hidden",addEventListener(){},getElementById(){return null;}},console,setTimeout,clearTimeout,setInterval(){},URL,URLSearchParams,fetch:async(url,options)=>{
 requests.push({url,...options});return {ok:true,json:async()=>({revision:requests.length})};
}};
vm.createContext(context);vm.runInContext(source,context);
const ui=context.testUI;
(async()=>{
 ui.setUser(null);
 assert(ui.viewAccount('register').includes('accountConfirm'));
 assert(ui.viewAccount('register').includes('autocomplete="new-password"'));
 assert(ui.viewAccount('login').includes('autocomplete="current-password"'));
 // Google login was removed: the sign-in screen must not offer it.
 assert(!ui.viewAccount('login').includes('Google'));assert(!ui.viewAccount('register').includes('Google'));
 // The setup page exists only on the PC-local server; the public site must not link to it.
 ui.setView('mypage');assert(ui.accountGate().includes('accountForm'));
 ui.setUser({id:'one',nickname:'<script>alert(1)</script>',email:'test@example.com'});
 assert(ui.viewAccount().includes('&lt;script&gt;'));assert(!ui.viewAccount().includes('<script>'));
 ui.setLive({catalog:{communities:[],activities:[]},loaded:true,dashboard:{role:'MEMBER',applications:[],communities:[],activities:[],notifications:[],follows:[]}});
 ui.setView('admin');assert(ui.viewLivePage().includes('権限がありません'));
 ui.setView('live');assert(!ui.viewLivePage().includes('data-nav="orgSignup"'));
 ui.setView('org');assert(!ui.viewLivePage().includes('団体を新しく登録'));
 ui.setView('orgSignup');assert(!ui.viewLivePage().includes('id="liveCommunityForm"'));assert(ui.viewLivePage().includes('アプリの運営者が行います'));
 ui.setView('admin');ui.setParam('new');assert(!ui.viewLivePage().includes('id="liveCommunityForm"'));
 ui.setLive({catalog:{communities:[],activities:[]},loaded:true,dashboard:{role:'ADMIN',applications:[],communities:[],activities:[],notifications:[],follows:[]},review:{communities:[],activities:[]}});
 const form=ui.viewLivePage();assert(form.includes('id="liveCommunityForm"'));assert(form.includes('運営だけに表示'));assert(form.includes('name="consentConfirmed"'));assert(form.includes('確認待ちで保存する'));assert(form.includes('高崎経済大学'));assert(form.includes('name="genres"'));assert(form.includes('id="lf_schedule"'));
 ui.setParam(null);assert(ui.viewLivePage().includes('data-param="new"'));
 ui.setView('myactivity');assert(ui.viewLivePage().includes('まだ申込みはありません'));
 ui.setView('notifications');assert(ui.viewLivePage().includes('お知らせ'));
 const appCard=ui.liveApplicationCard({id:'sample',title:'<script>alert(1)</script>',status:'APPLIED',message:'<img src=x>',activity:{},kind:'見学',community_name:'団体'});assert(!appCard.includes('<script>'));assert(!appCard.includes('<img src=x>'));assert(!appCard.includes('集合場所：'));
 ui.setView('mypage');assert.equal(ui.accountGate(),null);
 ui.setDB({profile:{nickname:'テスト',school:'大学',interests:[],skills:'',days:[],transport:[],areas:[]}});
 assert(ui.viewMypage().includes('テスト'));
 const dashboard={role:'MEMBER',applications:[{id:'real-app',activity_id:'real',title:'実際の参加記録',status:'APPROVED',message:'',activity:{endsAt:'2099-01-01',startsAt:'2098-12-31'},kind:'体験参加',community_name:'地域団体',owned:false}],communities:[],activities:[],notifications:[],follows:['org'],followedCommunities:[{id:'org',name:'フォロー済み団体',available:true,city:'高崎市',type:'サークル'}]};
 ui.setLive({catalog:{communities:[],activities:[]},loaded:true,dashboard});ui.setMypageTab('apps');assert(ui.viewMypage().includes('実際の参加記録'));assert(ui.viewMypage().includes('活動の連絡板'));
 assert(!ui.viewMypage().includes('data-live-message='));ui.setMypageTab('history');assert(!ui.viewMypage().includes('実際の参加記録'));
 ui.setMypageTab('following');assert(ui.viewMypage().includes('フォロー済み団体'));
 assert(ui.liveApplyControls({id:'real',status:'PUBLISHED'}).includes('参加確定'));assert(ui.liveApplyControls({id:'real',status:'PUBLISHED'}).includes('集合場所・連絡板を見る'));assert(!ui.liveApplyControls({id:'real',status:'PUBLISHED'}).includes('data-live-apply'));
 assert(ui.liveHomeActivitiesHTML().includes('自分の申込み・参加記録（1件）'));
 assert(ui.liveVerificationHTML({verification:{checkedBy:'運営',checkedAt:'2026-09-25',items:['代表者の本人確認']}}).includes('参加人数・口コミ・ポイントとは別'));
 assert(!ui.liveReviewControls('real').includes('data-live-review-edit'));
 dashboard.applications[0].status='DONE';dashboard.reviews=[];assert(ui.liveReviewControls('real').includes('口コミを書く'));
 dashboard.reviews=[{activityId:'real'}];assert(ui.liveReviewControls('real').includes('口コミを編集'));assert(ui.liveReviewControls('real').includes('口コミを削除'));
 assert(!ui.liveReviewCard({author:'<img src=x>',text:'<script>alert(1)</script>',activityTitle:'<img src=y>',rating:1}).includes('<script>'));
 ui.setLive({catalog:{communities:[{id:'c1',name:'実際の登録団体',city:'高崎市',buzz:{participants:2,reviews:2,points:8}}],activities:[]},loaded:true,dashboard});
 const realBuzz=ui.liveBuzzHTML();assert(realBuzz.includes('実際の登録団体'));assert(realBuzz.includes('8 <small>pt'));assert(!realBuzz.includes('288'));assert(!realBuzz.includes('サンプルデータ／'));
 ui.setMypageTab('profile');
 assert(ui.queueAccountSave());await ui.flushAccount();
 assert.equal(requests[0].url,'/api/state');assert.equal(requests[0].headers['X-Tobiyori-Account'],'one');assert.equal(requests[0].credentials,'same-origin');
 assert.equal(JSON.parse(requests[0].body).state.profile.nickname,'テスト');
 context.fetch=async()=>({ok:false,status:503,json:async()=>({error:'保存できません'})});
 ui.queueAccountSave();await assert.rejects(ui.flushAccount());assert(ui.getError().includes('未保存'));
 context.fetch=async()=>({ok:true,json:async()=>({revision:2})});await ui.flushAccount();assert.equal(ui.getError(),'');
 context.fetch=async()=>({ok:false,status:401,json:async()=>({error:'ログインしてください'})});await ui.refreshLive(false);assert.equal(ui.getLive().dashboard,null);assert.equal(ui.getLive().review,null);
 let delayed;context.fetch=()=>new Promise(resolve=>delayed=resolve);const oldRefresh=ui.refreshLive(false);await new Promise(setImmediate);ui.clearLivePrivate();const latest={catalog:{communities:[],activities:[]},dashboard:null,review:null,loaded:true,error:'新しい状態'};ui.setLive(latest);delayed({ok:false,status:503,json:async()=>({error:'古いエラー'})});await oldRefresh;assert.equal(ui.getLive().error,'新しい状態');
 console.log('PASS: signup/login rendering, escaping, private route gates, mypage rendering, account-scoped save request, save failure and retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
