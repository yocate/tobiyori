'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let source=[...fs.readFileSync('成果物/gunma-community-map.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
source=source.replace(/\/\* ---------------- Boot ---------------- \*\/[\s\S]*?\}\)\(\);/,`globalThis.testUI={liveProfileIsMinor,openLiveApply,conditionValue,viewLivePage,refreshLive,
 setBirth(v){DB.profile.birthDate=v;},setUser(id){accountUser=id?{id}:null;},setLive(v){LIVE=v;},getLive(){return LIVE;},
 setPage(view,param){current.view=view;current.param=param;},epoch(){accountEpoch++;},retry(v){accountRetryUntil=v;},
 modal(fn){openModal=fn;},api(fn){accountAPI=fn;},quiet(){recordDailyVisit=async()=>null;showDailyVisitNotice=()=>{};accountNotice=()=>{};}
};})();`);
const context={location:{protocol:'http:',hostname:'localhost',hash:'#/home'},window:{addEventListener(){}},document:{visibilityState:'hidden',addEventListener(){},getElementById(){return null;}},console,setTimeout,clearTimeout,setInterval(){},URL,URLSearchParams};
vm.createContext(context);vm.runInContext(source,context);const ui=context.testUI;ui.quiet();
const empty=()=>({catalog:{communities:[],activities:[]},loaded:true,dashboard:null});
(async()=>{
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),birth=years=>String(Number(today.slice(0,4))-years)+today.slice(4);
 for(const [value,expected] of [[birth(17),true],[birth(18),false],[birth(20),false],['2999-01-01',false],['',false],[null,false],['invalid',false]]){ui.setBirth(value);assert.equal(ui.liveProfileIsMinor(),expected,String(value));}
 ui.setUser('one');ui.setLive({...empty(),catalog:{communities:[],activities:[{id:'a'}]}});
 for(const knownMinor of [true,false]){
  ui.setBirth(birth(knownMinor?17:20));let form,html;
  ui.modal((markup,bind)=>{html=markup;form={elements:{minor:{checked:knownMinor},guardian:{required:knownMinor}}};bind({querySelector:()=>form});});
  ui.openLiveApply('a','体験参加');
  const minor=html.match(/<input name="minor"[^>]*>/)[0],guardian=html.match(/<input name="guardian"[^>]*>/)[0];
  assert.equal(/checked disabled/.test(minor),knownMinor);assert.equal(/required/.test(guardian),knownMinor);
  for(const checked of [true,false]){form.elements.minor.checked=checked;form.elements.minor.onchange();assert.equal(form.elements.guardian.required,knownMinor||checked);}
 }
 for(const [key,value,expected] of [['tasks',undefined,'未登録'],['tasks','旧記録なし','旧記録なし'],['guardianRequired',true,'あり'],['guardianRequired',false,'なし'],['frequency','single','単発'],['frequency','continuous','継続'],['parking','yes','あり'],['parking','no','なし'],['parking','unknown','確認中'],['capacity',1234,'1,234人']])assert.equal(ui.conditionValue(key,value),expected);
 const deadline='2026-11-01T00:00:00Z';assert.equal(ui.conditionValue('deadline',deadline),new Date(deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'}));
 const activity={id:'a',communityId:'c',companyKind:'internship',status:'PUBLISHED',title:'公開インターン',capacity:8,startsAt:deadline,endsAt:deadline,companyRole:'職種<script>bad()</script>',workplace:'場所<img src=x>',workSchedule:'時間<b>午後</b>',selectionProcess:'条件<svg onload=bad()>',applicationURL:'https://example.test/?x=" onclick="bad()'};
 ui.setLive({...empty(),catalog:{communities:[{id:'c',name:'会社',sector:'company'}],activities:[activity]}});ui.setPage('liveactivity','a');
 const html=ui.viewLivePage();for(const label of ['職種・体験内容','勤務・実施場所','勤務時間・実施期間','応募条件・選考','公式の募集情報を見る'])assert(html.includes(label),label);
 for(const raw of ['<script>bad()','<img src=x>','<b>午後</b>','<svg onload=bad()>','href="https://example.test/?x=" onclick='])assert(!html.includes(raw),raw);
 assert(html.includes('&lt;script&gt;'));assert(html.includes('rel="noopener noreferrer"'));assert(html.includes('&quot;'));
 const calls=[];let handler=async route=>route==='live/catalog'?{communities:[],activities:[]}:{role:'MEMBER'};ui.api(async route=>{calls.push(route);return handler(route);});
 ui.setUser(null);ui.setLive(empty());await ui.refreshLive(false,{background:true});assert.deepEqual(calls,['live/catalog']);
 calls.length=0;await ui.refreshLive(false,{background:true});assert.equal(calls.length,0,'120秒以内のcatalog取得を抑止');
 ui.getLive().catalogFetchedAt=Date.now()-120001;await ui.refreshLive(false,{background:true});assert.deepEqual(calls,['live/catalog']);
 calls.length=0;await ui.refreshLive(false);assert.deepEqual(calls,['live/catalog'],'手動更新は強制取得');
 calls.length=0;ui.setUser('two');await ui.refreshLive(false,{background:true});assert.deepEqual(calls,['live/catalog','live/dashboard'],'アカウント変更で再取得');
 calls.length=0;ui.retry(Date.now()+60000);await ui.refreshLive(false,{background:true});assert.equal(calls.length,0,'429の再試行期限内は背景通信を抑止');ui.retry(0);
 ui.setUser(null);ui.setLive(empty());let resolve;handler=()=>new Promise(r=>resolve=r);const pending=ui.refreshLive(false,{background:true});await Promise.resolve();
 const before=calls.length;await ui.refreshLive(false,{background:true});assert.equal(calls.length,before,'背景通信の重複を抑止');
 ui.epoch();const latest={...empty(),error:'new account'};ui.setLive(latest);resolve({communities:[{id:'stale'}],activities:[]});await pending;assert.equal(ui.getLive(),latest,'古いepochの成功結果を破棄');
 handler=async()=>({communities:[],activities:[]});await ui.refreshLive(false,{background:true});assert.notEqual(ui.getLive(),latest,'通信終了後に背景取得を再開');
 let reject;handler=()=>new Promise((_,r)=>reject=r);const failed=ui.refreshLive(false);await Promise.resolve();ui.epoch();ui.setLive(latest);reject(new Error('old failure'));await failed;assert.equal(ui.getLive(),latest,'古いepochのエラーも破棄');
 console.log('PASS: 未成年・保護者同意、公開インターン詳細のエスケープ、条件表示、catalog TTL・手動更新・アカウント切替・背景重複・429・旧epoch破棄');
})().catch(error=>{console.error(error);process.exitCode=1;});
