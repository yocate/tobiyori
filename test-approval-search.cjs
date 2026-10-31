const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('成果物/gunma-community-map.html','utf8'),mirror=fs.readFileSync('成果物/live-community-ui.js','utf8');
function extract(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);const lineEnd=source.indexOf('\n',start);return source.slice(start,source[lineEnd-1]==='}'?lineEnd:source.indexOf('\n}',lineEnd)+2);}
const names=['liveApprovalMatches','liveApprovalSearchForm','bindApprovalSearchUI','liveReviewPage','operatorParticipants'];
for(const name of names)assert.equal(extract(html,name),extract(mirror,name),'mirror '+name);
assert.equal(extract(html,'conditionReviewHTML'),extract(fs.readFileSync('成果物/participation-conditions-ui.js','utf8'),'conditionReviewHTML'));
const context=vm.createContext({assert,FormData:class {constructor(form){this.data=form.values;}get(key){return this.data[key];}},render(){context.renders++;},renders:0});
vm.runInContext(`let liveApprovalSearch={review:{query:'',status:''},participants:{query:'',status:''}};
let liveRequest=0,liveOnlyFollowed=true;
const LIVE={dashboard:{role:'ADMIN',applications:[]},review:{communities:[],activities:[],activityChanges:[]}};
const current={},LOCAL_APP=false,accountUser={id:'admin'};
const COMPANY_KINDS={internship:'インターン',recruitment:'採用・求人'};
const liveStatus={APPLIED:'承認待ち',APPROVED:'参加予定',DECLINED:'受入れ不可',CANCELLED:'取消済み',EXPIRED:'受付終了',DONE:'参加完了'};
const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const liveShell=(title,content)=>title+content,liveBadge=s=>s,liveDate=s=>s;
const liveBuzzSummary=()=>'',livePhotos=()=>'',officialSourcePanel=()=>'',liveAdminNotes=()=>'',pendingChangeHTML=()=>'',liveReviewDetails=()=>'',conditionDiffHTML=()=>'';
const liveApplicationCard=p=>'<article data-id="'+p.id+'">'+p.title+' '+p.nickname+'</article>';
const clearSerendipity=()=>{},clearWaitingRooms=()=>{};
${names.map(n=>extract(html,n)).join('\n')}
${extract(html,'conditionReviewHTML')}
${extract(html,'clearLivePrivate')}
LIVE.review.communities=[{id:'c1',name:'学び団体',status:'PENDING',city:'高崎',intro:'支援'},{id:'c2',name:'自然団体',status:'VERIFIED'}];
LIVE.review.activities=[{id:'a1',title:'ＷＥＢ体験',communityId:'c1',status:'REVIEW',companyKind:'internship',companyRole:'開発職'},{id:'a2',title:'森の案内',communityId:'c2',status:'REVIEW'}];
LIVE.review.activityChanges=[{id:'q1',activityId:'a3',title:'旧活動',proposed:{title:'新しい活動',communityId:'c1',companyKind:'internship',companyRole:'企画職'},differences:[]}];
LIVE.dashboard.applications=[{id:'p1',owned:true,title:'WEB体験',nickname:'タロウ',community_name:'学び団体',status:'APPLIED'},{id:'p2',owned:true,title:'森',nickname:'花子',status:'APPROVED'},{id:'p3',owned:false,title:'他人の募集',nickname:'非担当者',status:'APPLIED'}];
assert(liveApprovalMatches('web 体験',['ＷＥＢ体験']));
assert(!liveApprovalMatches('web 森',['ＷＥＢ体験']));
assert(liveReviewPage().includes('5件表示 / 全5件'));
liveApprovalSearch.review={query:'学び団体',status:''};
let result=liveReviewPage();assert(result.includes('3件表示 / 全5件'));assert(result.includes('ＷＥＢ体験'));assert(!result.includes('森の案内'));
liveApprovalSearch.review={query:'',status:'VERIFIED'};result=liveReviewPage();assert(result.includes('1件表示 / 全5件'));assert(!result.includes('ＷＥＢ体験'));
liveApprovalSearch.review={query:'新しい',status:'CHANGE_PENDING'};result=liveReviewPage();assert(result.includes('1件表示 / 全5件'));assert(result.includes('data-change="q1"'));
liveApprovalSearch.review={query:'インターン',status:'REVIEW'};result=liveReviewPage();assert(result.includes('1件表示 / 全5件'));assert(result.includes('ＷＥＢ体験'));assert(!result.includes('森の案内'));
liveApprovalSearch.review={query:'開発職',status:'REVIEW'};result=liveReviewPage();assert(result.includes('1件表示 / 全5件'));assert(result.includes('ＷＥＢ体験'));
liveApprovalSearch.review={query:'インターン 企画職',status:'CHANGE_PENDING'};result=liveReviewPage();assert(result.includes('1件表示 / 全5件'));assert(result.includes('data-change="q1"'));
liveApprovalSearch.review={query:'該当しない',status:''};assert(liveReviewPage().includes('検索条件に一致する確認対象はありません'));
liveApprovalSearch.participants={query:'タロウ',status:'APPLIED'};result=operatorParticipants();assert(result.includes('1件表示 / 全2件'));assert(result.includes('data-id="p1"'));assert(!result.includes('data-id="p2"'));assert(!result.includes('非担当者'));
liveApprovalSearch.participants={query:'学び団体',status:'APPROVED'};assert(operatorParticipants().includes('検索条件に一致する申込みはありません'));
liveApprovalSearch.participants={query:'<script>',status:''};assert(operatorParticipants().includes('value="&lt;script>"'));
let form={dataset:{approvalSearch:'participants'},values:{query:' 森 ',status:'APPROVED'}},button={dataset:{approvalClear:'participants'}};
bindApprovalSearchUI({querySelectorAll:selector=>selector==='[data-approval-search]'?[form]:[button]});
let prevented=false;form.onsubmit({preventDefault(){prevented=true;}});assert(prevented);assert.equal(liveApprovalSearch.participants.query,'森');assert(operatorParticipants().includes('data-id="p2"'));button.onclick();assert.equal(liveApprovalSearch.participants.query,'');assert.equal(liveApprovalSearch.participants.status,'');
liveApprovalSearch.review.query='秘密';liveApprovalSearch.participants.query='秘密';clearLivePrivate();assert.equal(liveApprovalSearch.review.query,'');assert.equal(liveApprovalSearch.participants.query,'');assert.equal(LIVE.review,null);
LIVE.dashboard={role:'MEMBER'};assert(!liveReviewPage().includes('data-approval-search'));
`,context);
assert.equal(context.renders,2);
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
console.log('PASS: approval search normalization, AND keywords, status filters, organization joins, proposed titles, owned-only participants, counts, empty results, escaping, submit/clear, logout reset, role guard and source parity');
