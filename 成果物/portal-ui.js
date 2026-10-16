/* Separate participant and operator surfaces; server permissions remain authoritative. */
const OPERATOR_VIEWS=['manage','admin','org','orgSignup','participants','reports'];
function canOperate(){return LIVE.dashboard?.role==='ADMIN'||!!LIVE.dashboard?.communities?.length;}
function surfaceTarget(view,param){
  if(OPERATOR_APP&&view==='home')view='manage';
  if(OPERATOR_APP&&view==='register')view='login';
  const shared=['login','notifications'];
  const operator=OPERATOR_VIEWS.includes(view)||(OPERATOR_APP&&shared.includes(view));
  return {view,param,url:(operator?'/operator.html':'/')+'#/'+view+(param?'/'+encodeURIComponent(param):''),cross:operator!==OPERATOR_APP};
}
function routeToSurface(){
  const target=surfaceTarget(current.view,current.param);
  if(target.cross){location.replace(target.url);return true;}
  current.view=target.view;
  return false;
}
function surfaceRoutes(){
  if(!OPERATOR_APP)return ROUTES;
  if(!canOperate())return [];
  return [{id:'manage',label:'運営ホーム',icon:'home'},
    ...(LIVE.dashboard?.role==='ADMIN'?[{id:'admin',label:'団体・審査',icon:'shield'},{id:'reports',label:'相談対応',icon:'info'},{id:'feedback',label:'ご意見',icon:'megaphone'}]:[]),
    {id:'org',label:'募集管理',icon:'list'},
    {id:'participants',label:'参加者対応',icon:'user'},
    {id:'notifications',label:'お知らせ',icon:'bell'}];
}
function renderSurfaceChrome(){
  document.body.classList.toggle('operator-app',OPERATOR_APP);
  document.title=OPERATOR_APP?'トビヨリ｜運営者用':'トビヨリ｜地域との出会い';
  const brand=document.querySelector('.brand');
  if(brand){brand.dataset.nav=OPERATOR_APP?'manage':'home';brand.setAttribute('aria-label',OPERATOR_APP?'トビヨリ 運営ホームへ':'トビヨリ ホームへ');}
  const actions=document.querySelector('.topbar-cta');
  if(actions)actions.innerHTML=OPERATOR_APP?'<span class="operator-label">運営者用</span><a class="btn btn-ghost btn-sm" href="/#/home">利用者画面へ ↗</a>':'<button class="btn btn-ghost btn-sm participant-more" data-more aria-label="その他のメニュー">その他</button>';
  actions?.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));
}
function operatorHome(){
  const d=LIVE.dashboard,review=LIVE.review||{communities:[],activities:[]};
  const waiting=d.applications.filter(p=>p.owned&&p.status==='APPLIED').length;
  const completion=d.applications.filter(p=>p.owned&&p.status==='APPROVED'&&p.activity.endsAt<=new Date().toISOString()).length;
  const stats=[['団体の確認待ち',review.communities.filter(c=>c.status==='PENDING').length,'admin'],['募集の審査待ち',review.activities.length,'admin'],['申込みの承認待ち',waiting,'participants'],['活動完了の確認',completion,'participants'],['未確認のご意見',LIVE.feedbackNew||0,'feedback']].filter(x=>d.role==='ADMIN'||!['admin','feedback'].includes(x[2]));
  return liveShell('運営ホーム',`<div class="operator-intro"><span class="operator-label">TOBIYORI MANAGEMENT</span><p>団体の情報を整えて、次の参加につなげましょう。</p></div><div class="operator-stats">${stats.map(([label,count,view])=>`<button class="card operator-stat" data-nav="${view}"><span>${label}</span><strong>${count}<small>件</small></strong><span class="hint">確認する →</span></button>`).join('')}</div><h2>今日の運営メニュー</h2><div class="operator-actions">${d.role==='ADMIN'?'<section class="card live-card"><h3>団体を登録・確認する</h3><p>活動紹介、写真、連絡先を登録し、確認後に公開します。</p><button class="btn btn-primary" data-nav="admin" data-param="new">＋ 団体を登録</button><button class="btn btn-ghost" data-nav="admin">団体・審査を見る</button></section>':''}<section class="card live-card"><h3>募集をつくる・更新する</h3><p>前回の募集を複製して、次の活動を準備できます。</p><button class="btn btn-secondary" data-nav="org">募集管理へ</button></section><section class="card live-card"><h3>参加者に対応する</h3><p>申込みの承認、活動の連絡板、参加完了の記録をまとめて確認。</p><button class="btn btn-secondary" data-nav="participants">参加者対応へ</button></section>${d.role==='ADMIN'?'<section class="card live-card"><h3>利用者の声を確認する</h3><p>匿名で届いたご意見を、画面・種類ごとに集計して改善に使います。</p><button class="btn btn-secondary" data-nav="feedback">ご意見へ</button></section>':''}<section class="card live-card"><h3>運営画面へのご意見</h3><p>使いにくい点や不具合があれば、匿名で送れます。</p><button class="btn btn-ghost" data-feedback>ご意見・不具合を送る</button></section></div><p class="hint">申込みの承認・連絡は、自分が担当する団体の活動を表示します。</p>`);
}
function operatorParticipants(){
  const applications=(LIVE.dashboard?.applications||[]).filter(p=>p.owned);
  return liveShell('参加者対応',`<p>自分が担当する活動への申込み・連絡・参加完了を確認します。</p><button class="btn btn-ghost btn-sm" data-live-refresh>最新の状況に更新</button>${applications.length?applications.map(liveApplicationCard).join(''):'<div class="card live-card"><h2>申込みはまだありません</h2><p>募集を公開すると、この画面で届いた申込みを確認できます。</p><button class="btn btn-secondary" data-nav="org">募集管理へ</button></div>'}`);
}
function surfaceNotifications(){return (LIVE.dashboard?.notifications||[]).filter(n=>OPERATOR_VIEWS.includes(n.route.split('/')[0])===OPERATOR_APP);}
