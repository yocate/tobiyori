/* Account UI: included inside the application closure by install-account.cjs. */
const ACCOUNT_SERVER = location.protocol === 'http:' || location.protocol === 'https:';
// The PC-local server (トビヨリを起動.cmd) as opposed to the public service.
const LOCAL_APP = ['localhost','127.0.0.1'].includes(location.hostname);
const OPERATOR_APP = location.pathname === '/operator.html';
function escapeHtml(value){return campusEscape(value);}
let accountUser = null, accountReady = false, accountRevision = 0;
let googleEnabled = false, googleOptionsFailed = false;
let pendingAccountState = null, accountSaving = null, accountError = '', accountEpoch = 0, accountConflict = false;
async function accountAPI(url, method='GET', data) {
  const headers=data?{'Content-Type':'application/json'}:{};
  if(accountUser && (['state','logout','google/start'].includes(url)||url.startsWith('live/')))headers['X-Tobiyori-Account']=accountUser.id;
  const response = await fetch('/api/'+url, {method, credentials:'same-origin',cache:'no-store',headers,body:data?JSON.stringify(data):undefined});
  const result = await response.json();
  if(!response.ok) throw Object.assign(new Error(result.error || '接続できませんでした。'),{status:response.status});
  return result;
}
function accountNotice() {
  const el=document.getElementById('accountBar'); if(!el)return;
  const text = !ACCOUNT_SERVER ? 'アカウント機能を使うには、起動したアプリを開いてください。' : !accountReady ? 'アカウントを確認しています…' : accountUser ? `${accountUser.nickname} さん` : OPERATOR_APP?'運営者用アカウントでログインしてください。':'ログインすると、自分のマイページを保存できます。';
  el.innerHTML=`<div>${escapeHtml(text)}${accountUser&&!OPERATOR_APP?`<span class="account-save-status" role="status">${accountError?escapeHtml(accountError):(pendingAccountState||accountSaving)?'変更を保存中…':'保存済み'}</span>`:''}</div><div class="account-bar-actions">${!ACCOUNT_SERVER?'<a class="btn btn-primary btn-sm" href="http://localhost:4177/">ログインできるアプリを開く</a>':!accountReady?'':accountUser?`<button class="btn btn-secondary btn-sm" data-account-nav="notifications" aria-label="お知らせ・未読 ${liveUnreadCount()}件">お知らせ${liveUnreadCount()?' ('+liveUnreadCount()+')':''}</button><button class="btn btn-ghost btn-sm" id="accountLogout">ログアウト</button>${accountError?(accountConflict?'<button class="btn btn-secondary btn-sm" id="accountReload">最新の内容を読み込む</button><button class="btn btn-ghost btn-sm" id="accountOverwrite">この画面の内容で上書き保存</button>':'<button class="btn btn-ghost btn-sm" id="accountRetry">保存を再試行</button>'):''}`:OPERATOR_APP?'<button class="btn btn-ghost btn-sm" data-account-nav="login">運営者ログイン</button>':'<button class="btn btn-ghost btn-sm" data-account-nav="login">ログイン</button><button class="btn btn-primary btn-sm" data-account-nav="register">新規登録</button>'}</div>`;
  el.querySelectorAll('[data-account-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.accountNav));
  el.querySelector('#accountLogout')?.addEventListener('click',logoutAccount);
  el.querySelector('#accountRetry')?.addEventListener('click',()=>flushAccount().catch(()=>{}));
  // A 409 means another tab saved first: retrying with the same revision can never succeed.
  el.querySelector('#accountReload')?.addEventListener('click',()=>{pendingAccountState=null;location.reload();});
  el.querySelector('#accountOverwrite')?.addEventListener('click',async()=>{if(!confirm('別の画面で保存された変更は、この画面の内容で置き換わります。上書きしますか？'))return;try{const latest=await accountAPI('state');accountRevision=latest.revision;accountError='';accountConflict=false;await flushAccount();toast('この画面の内容で保存しました');}catch(e){toast(e.message||'保存できませんでした');}});
  if(accountUser && googleEnabled && !OPERATOR_APP){
    const actions=el.querySelector('.account-bar-actions');
    if(actions){const button=document.createElement('button');button.className='btn btn-ghost btn-sm';button.textContent=accountUser.googleLinked?'Google連携済み':'Googleと連携';button.disabled=accountUser.googleLinked;button.onclick=openGoogleLink;actions.prepend(button);}
  }
}
function queueAccountSave() {
  if(!ACCOUNT_SERVER || !accountUser || !accountReady) { toast('保存にはログインが必要です。');return false; }
  try { pendingAccountState=JSON.parse(JSON.stringify(DB)); }
  catch {return false;}
  accountNotice();
  flushAccount().catch(()=>{});
  return true;
}
async function flushAccount() {
  if(accountSaving)return accountSaving;
  if(!pendingAccountState)return;
  const epoch=accountEpoch;
  accountSaving=(async()=>{
    while(pendingAccountState && epoch===accountEpoch) {
      const snapshot=pendingAccountState; pendingAccountState=null;
      try {
        const result=await accountAPI('state','PUT',{state:snapshot,revision:accountRevision});
        if(epoch!==accountEpoch)return;
        accountRevision=result.revision;accountError='';accountConflict=false;
      } catch(e) {
        if(epoch===accountEpoch){pendingAccountState=pendingAccountState||snapshot;accountConflict=e.status===409;accountError=e.status===409?e.message:e.status===401?'ログインの有効期限が切れました。未保存の変更があります。':'未保存の変更があります。接続を確認して保存を再試行してください。';}
        throw e;
      }
    }
  })();
  try {await accountSaving;} finally {accountSaving=null;accountNotice();}
}
async function loadAccountState() {
  const result=await accountAPI('state');
  const base=defaultStore();
  DB=Object.assign(base,result.state||{});
  DB.profile=Object.assign(defaultStore().profile,result.state?.profile||{nickname:accountUser.nickname});
  accountRevision=result.revision;
  pendingAccountState=null;accountError='';
}
async function startAccount() {
  if(!ACCOUNT_SERVER){accountReady=true;render();return;}
  try {googleEnabled=(await accountAPI('auth-options')).googleEnabled===true;googleOptionsFailed=false;}catch{googleEnabled=false;googleOptionsFailed=true;}
  try { const result=await accountAPI('me');accountUser=result.user;await loadAccountState(); }
  catch(e){accountUser=null;DB=defaultStore();if(e.status!==401)accountError='アカウントに接続できませんでした。ページを再読み込みしてください。';}
  accountReady=true;await refreshLive(false);render();
}
async function logoutAccount() {
  const button=document.getElementById('accountLogout');if(button)button.disabled=true;
  try {
    await flushAccount();
    await accountAPI('logout','POST',{});
    accountEpoch++;accountUser=null;clearLivePrivate();DB=defaultStore();accountRevision=0;pendingAccountState=null;accountError='';
    closeModal();mypageTab='profile';nav('home');accountNotice();toast('ログアウトしました');
  } catch(e){
    if([401,409].includes(e.status) && (!(pendingAccountState||accountSaving) || window.confirm('ログイン状態が変わりました。未保存の変更を破棄してログイン画面へ戻りますか？'))){
      accountEpoch++;pendingAccountState=null;accountUser=null;clearLivePrivate();DB=defaultStore();accountRevision=0;accountError='';closeModal();nav('login');accountNotice();return;
    }
    toast('ログアウトできませんでした。'+e.message);if(button)button.disabled=false;
  }
}
function viewAccount(mode='login') {
  if(!ACCOUNT_SERVER)return `<div class="container section"><div class="card account-card"><h1>アカウントを使う</h1><p>「トビヨリを起動.cmd」を開いてから、下のボタンを押してください。</p><a class="btn btn-primary" href="http://localhost:4177/">アプリを開く</a><p class="hint">ファイルを直接開いた画面では、新規登録・ログインは利用できません。</p></div></div>`;
  if(!accountReady)return '<div class="container section" role="status">アカウントを確認しています…</div>';
  const register=!OPERATOR_APP && mode==='register';
  if(accountUser)return `<div class="container section"><div class="card account-card"><h1>ログインしています</h1><p>${escapeHtml(accountUser.nickname)} さん</p>${googleResultMessage()?`<p class="account-form-error" role="alert">${escapeHtml(googleResultMessage())}</p>`:''}<button class="btn btn-primary" data-nav="${OPERATOR_APP?'manage':'mypage'}">${OPERATOR_APP?'運営ホームへ':'マイページへ'}</button></div></div>`;
  return `<div class="container section"><div class="card account-card"><span class="account-kicker">TOBIYORI</span><h1>${OPERATOR_APP?'運営者ログイン':register?'新しい出会いを、ここから。':'おかえりなさい。'}</h1><p class="muted">${OPERATOR_APP?'運営者として指定されたアカウントでログインしてください。':register?'自分だけのマイページを作りましょう。':'ログインして、活動の続きを見てみましょう。'}</p>${OPERATOR_APP?'':`<div class="account-switch"><button class="${register?'':'selected'}" data-nav="login">ログイン</button><button class="${register?'selected':''}" data-nav="register">新規登録</button></div>`}
  ${googleLoginHTML()}
  <form id="accountForm" data-mode="${register?'register':'login'}">
    ${register?'<div class="field"><label for="accountNickname">ニックネーム</label><input id="accountNickname" name="nickname" autocomplete="nickname" required maxlength="40" placeholder="例：とびまる"><p class="hint">本名ではなく、活動で使う名前を入力してください。</p></div>':''}
    <div class="field"><label for="accountEmail">メールアドレス</label><input id="accountEmail" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"><p class="hint">メールアドレスは一般公開しません。</p></div>
    <div class="field"><label for="accountPassword">パスワード</label><input id="accountPassword" name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="8" maxlength="128" required ${register?'placeholder="8文字以上"':''}><button type="button" class="account-text-button" id="accountShowPassword" aria-pressed="false">パスワードを表示</button></div>
    ${register?'<div class="field"><label for="accountConfirm">パスワード（確認）</label><input id="accountConfirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><label class="account-consent"><input id="accountConsent" type="checkbox" required><span>地域活動のために利用し、勧誘や迷惑行為をしないこと、および下記の保存範囲を確認しました。</span></label>':''}
    <p id="accountFormError" role="alert" class="account-form-error">${escapeHtml(accountError||googleResultMessage())}</p><button class="btn btn-primary btn-block" id="accountSubmit" type="submit">${register?'登録してはじめる':'ログイン'}</button>
  </form><div class="account-explanation"><b>このアプリの利用範囲</b><p>アカウントとマイページは、${LOCAL_APP?'このパソコンのアプリ用データベース':'トビヨリのサーバー'}に保存します。「募集中の活動」の申込み・連絡は登録団体へ届きます。「サンプル」と表示された活動・口コミ・ポイントは体験用です。</p><p>メールによる本人確認・パスワード再設定は未対応です。他のサービスと同じパスワードは使わず、パスワードを保管してください。</p></div></div></div>`;
}
function bindAccountForm() {
  const googleForm=document.getElementById('googleLoginForm');
  if(googleForm)googleForm.onsubmit=e=>{e.preventDefault();beginGoogle('login',googleForm);};
  const form=document.getElementById('accountForm');if(!form)return;
  const pass=form.querySelector('#accountPassword'),show=form.querySelector('#accountShowPassword');
  show.onclick=()=>{const visible=pass.type==='password';pass.type=visible?'text':'password';const confirm=form.querySelector('#accountConfirm');if(confirm)confirm.type=pass.type;show.textContent=visible?'パスワードを隠す':'パスワードを表示';show.setAttribute('aria-pressed',String(visible));};
  form.onsubmit=async e=>{
    e.preventDefault();const error=form.querySelector('#accountFormError'),submit=form.querySelector('#accountSubmit');error.textContent='';
    const register=form.dataset.mode==='register';
    if(register && pass.value!==form.querySelector('#accountConfirm').value){error.textContent='確認用パスワードが一致しません。';return;}
    submit.disabled=true;submit.textContent=register?'登録しています…':'ログインしています…';
    try {
      const result=await accountAPI(form.dataset.mode,'POST',{email:form.querySelector('#accountEmail').value,password:pass.value,...(register?{nickname:form.querySelector('#accountNickname').value,consent:form.querySelector('#accountConsent').checked}:{})});
      accountEpoch++;clearLivePrivate();accountUser=result.user;accountReady=false;DB=defaultStore();pendingAccountState=null;
      await loadAccountState();accountReady=true;await refreshLive(false);accountNotice();nav(OPERATOR_APP?'manage':'mypage');toast(register?'登録が完了しました':'ログインしました');
    }catch(e){accountUser=null;accountReady=true;accountNotice();error.textContent=e.message || '接続できませんでした。';submit.disabled=false;submit.textContent=register?'登録してはじめる':'ログイン';}
  };
}
function accountGate() {
  if(OPERATOR_APP){
    if(!ACCOUNT_SERVER||!accountUser||!accountReady)return viewAccount('login');
    if(LIVE.error)return '<div class="container section"><h1>運営画面を読み込めませんでした</h1><p>接続を確認して、ページを再読み込みしてください。</p></div>';
    if(!LIVE.loaded)return '<div class="container section" role="status">運営者の権限を確認しています…</div>';
    if(!canOperate())return '<div class="container section"><div class="card account-card"><h1>運営者専用の画面です</h1><p>このアカウントには運営画面の利用権限がありません。運営者として指定されたアカウントでログインしてください。</p><a class="btn btn-primary" href="/#/home">利用者用アプリへ</a></div></div>';
  }
  if(['mypage','orgSignup','org','admin','myactivity','notifications','following','offers','support','reports','serendipity'].includes(current.view) && (!ACCOUNT_SERVER||!accountUser||!accountReady))return viewAccount('login');
  return null;
}
window.addEventListener('beforeunload',e=>{if(pendingAccountState||accountSaving){e.preventDefault();e.returnValue='';}});

function googleResultMessage(){
  if(current.view!=='login'||!current.param?.startsWith('google-'))return '';
  return ({not_configured:'Googleログインの初期設定がまだ完了していません。',state:'Googleログインの有効期限が切れたか、別の画面で開始されました。もう一度お試しください。',cancelled:'Googleログインをキャンセルしました。',verification:'Googleアカウントを確認できませんでした。もう一度お試しください。',email_exists:'同じメールアドレスで登録済みです。パスワードでログインしてから、画面上部の「Googleと連携」を押してください。',email_mismatch:'今のアカウントと同じメールアドレスのGoogleアカウントを選んでください。',link_conflict:'そのGoogleアカウントは別のアカウントに連携されています。',login_required:'連携するには、アプリにログインし直してください。'})[current.param.slice(7)]||'Googleログインを完了できませんでした。時間をおいてお試しください。';
}
function googleMark(){return '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.84 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>';}
function googleLoginHTML(){return `<div class="google-login-area"><form id="googleLoginForm">${googleEnabled?'<label class="account-consent google-consent"><input name="googleConsent" type="checkbox" required><span>地域活動のために利用し、下記の保存範囲を確認しました。</span></label>':''}<button class="google-button" type="submit" ${googleEnabled?'':'disabled'}>${googleMark()}<span>Googleで続行</span></button><p class="google-error" role="alert"></p></form><p class="hint">${googleEnabled?(OPERATOR_APP?'指定されたGoogleアカウントを使用してください。Googleログインだけでは運営権限は付与されません。':'初めての方はアカウントを作成します。本名・写真は自動掲載しません。ChromeやEdgeでの利用をおすすめします。'):(googleOptionsFailed?'Googleログインの設定を確認できませんでした。通信状況を確認して、ページを再読み込みしてください。':LOCAL_APP?'Googleログインは、アプリ管理者の初期設定後に使えます。 <a href="/google-login-setup.html" target="_blank" rel="noopener">設定方法を見る</a>':'Googleログインは準備中です。メールアドレスでご利用ください。')}</p></div><div class="account-divider"><span>または、メールアドレスで</span></div>`;}
async function beginGoogle(intent,form){
  const button=form.querySelector('button[type="submit"]'),error=form.querySelector('.google-error');error.textContent='';
  if(!form.querySelector('[name="googleConsent"]')?.checked){error.textContent='利用上の確認にチェックしてください。';return;}
  button.disabled=true;
  try {await flushAccount();const result=await accountAPI('google/start','POST',{intent,consent:true,surface:OPERATOR_APP?'operator':'user'});window.location.assign(result.url);}
  catch(e){error.textContent=e.message||'接続できませんでした。';button.disabled=false;}
}
function openGoogleLink(){
  openModal(`<div class="modal-head"><h3>Googleアカウントと連携</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div><p>次回からGoogleでもログインできます。今のマイページや記録はそのまま使えます。</p><p style="margin:16px 0">連携するメールアドレス：<b>${escapeHtml(accountUser.email)}</b></p><form id="googleLinkForm"><label class="account-consent google-consent"><input name="googleConsent" type="checkbox" required><span>同じメールアドレスのGoogleアカウントを連携します。</span></label><button class="google-button" type="submit">${googleMark()}<span>Googleで続行</span></button><p class="google-error" role="alert"></p></form>`,root=>{const form=root.querySelector('#googleLinkForm');form.onsubmit=e=>{e.preventDefault();beginGoogle('link',form);};});
}
