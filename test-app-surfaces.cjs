const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('成果物/gunma-community-map.html','utf8');
let source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
source=source.replace(/\/\* ---------------- Boot ---------------- \*\/[\s\S]*?\}\)\(\);/,`globalThis.ui={surfaceTarget,surfaceRoutes,accountGate,viewAccount,viewHome,operatorHome,operatorParticipants,surfaceNotifications,refreshLive,
 setup(role){accountReady=true;accountUser=role?{id:'test',nickname:'テスト'}:null;LIVE={loaded:true,catalog:{communities:[],activities:[]},dashboard:role?{role,communities:[],activities:[],applications:[],notifications:[{route:'org',body:'運営通知'},{route:'myactivity',body:'参加通知'}]}:null,review:{communities:[],activities:[]}};},setView(view){current.view=view;}};})();`);
function surface(pathname){const requests=[];const context={location:{protocol:'http:',pathname,hash:'#/home'},window:{addEventListener(){}},document:{addEventListener(){},getElementById(){return null;}},console,setTimeout,clearTimeout,setInterval(){},URL,URLSearchParams,fetch:async url=>{requests.push(url);return {ok:true,json:async()=>url.endsWith('dashboard')?{role:'ADMIN',communities:[],activities:[],applications:[],notifications:[]}:url.endsWith('review')?{communities:[],activities:[]}:{communities:[],activities:[]}};}};vm.createContext(context);vm.runInContext(source,context);return {ui:context.ui,requests};}
(async()=>{
 assert(!html.includes('登録された団体・活動を探す'));
 assert(!html.includes('既存の体験用カードはサンプルです'));
 const user=surface('/'),operator=surface('/operator.html');
 user.ui.setup('ADMIN');assert(!user.ui.surfaceRoutes().some(r=>['admin','org','manage','participants'].includes(r.id)));
 assert.equal(user.ui.surfaceTarget('admin','new').url,'/operator.html#/admin/new');
 assert.equal(user.ui.surfaceTarget('admin').cross,true);
 assert.equal(user.ui.surfaceTarget('myactivity').cross,false);
 assert.equal(user.ui.surfaceNotifications()[0].body,'参加通知');
 await user.ui.refreshLive(false);assert(!user.requests.includes('/api/live/review'));
 operator.ui.setup(null);assert(operator.ui.accountGate().includes('運営者ログイン'));
 assert(!operator.ui.viewAccount('register').includes('id="accountConfirm"'));
 assert(!operator.ui.viewAccount('register').includes('data-nav="register"'));
 operator.ui.setup('MEMBER');assert(operator.ui.accountGate().includes('権限がありません'));assert.equal(operator.ui.surfaceRoutes().length,0);
 operator.ui.setup('ADMIN');assert.equal(operator.ui.accountGate(),null);
 assert(operator.ui.surfaceRoutes().some(r=>r.id==='participants'));assert(!operator.ui.surfaceRoutes().some(r=>['mypage','map','list'].includes(r.id)));
 assert.equal(operator.ui.surfaceTarget('home').view,'manage');
 assert.equal(operator.ui.surfaceTarget('register').view,'login');
 assert.equal(operator.ui.surfaceTarget('mypage').url,'/#/mypage');
 assert.equal(operator.ui.surfaceTarget('mypage').cross,true);
 assert.equal(operator.ui.surfaceNotifications()[0].body,'運営通知');
 assert(operator.ui.operatorHome().includes('団体を登録'));assert(operator.ui.operatorParticipants().includes('申込みはまだありません'));
 await operator.ui.refreshLive(false);assert(operator.requests.includes('/api/live/review'));
 console.log('PASS: separate navigation and entry routes, operator access gate, no operator signup, notification scope, no review fetch in user app, requested banner removed');
})().catch(e=>{console.error(e);process.exitCode=1;});
