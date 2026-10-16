/* Account UI: included inside the application closure by install-account.cjs. */
const ACCOUNT_SERVER = location.protocol === 'http:' || location.protocol === 'https:';
// The PC-local server (トビヨリを起動.cmd) as opposed to the public service.
const LOCAL_APP = ['localhost','127.0.0.1'].includes(location.hostname);
const OPERATOR_APP = location.pathname === '/operator.html';
function escapeHtml(value){return campusEscape(value);}
let accountUser = null, accountReady = false, accountRevision = 0;
let pendingAccountState = null, accountSaving = null, accountError = '', accountEpoch = 0, accountConflict = false;
async function accountAPI(url, method='GET', data) {
  const headers=data?{'Content-Type':'application/json'}:{};
  if(accountUser && (['state','logout'].includes(url)||url.startsWith('live/')||url.startsWith('feedback/')))headers['X-Tobiyori-Account']=accountUser.id;
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
  if(accountUser)return `<div class="container section"><div class="card account-card"><h1>ログインしています</h1><p>${escapeHtml(accountUser.nickname)} さん</p><button class="btn btn-primary" data-nav="${OPERATOR_APP?'manage':'mypage'}">${OPERATOR_APP?'運営ホームへ':'マイページへ'}</button></div></div>`;
  return `<div class="container section"><div class="card account-card"><span class="account-kicker">TOBIYORI</span><h1>${OPERATOR_APP?'運営者ログイン':register?'新しい出会いを、ここから。':'おかえりなさい。'}</h1><p class="muted">${OPERATOR_APP?'運営者として指定されたアカウントでログインしてください。':register?'自分だけのマイページを作りましょう。':'ログインして、活動の続きを見てみましょう。'}</p>${OPERATOR_APP?'':`<div class="account-switch"><button class="${register?'':'selected'}" data-nav="login">ログイン</button><button class="${register?'selected':''}" data-nav="register">新規登録</button></div>`}
  <form id="accountForm" data-mode="${register?'register':'login'}">
    ${register?'<div class="field"><label for="accountNickname">ニックネーム</label><input id="accountNickname" name="nickname" autocomplete="nickname" required maxlength="40" placeholder="例：とびまる"><p class="hint">本名ではなく、活動で使う名前を入力してください。</p></div>':''}
    <div class="field"><label for="accountEmail">メールアドレス</label><input id="accountEmail" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"><p class="hint">メールアドレスは一般公開しません。</p></div>
    <div class="field"><label for="accountPassword">パスワード</label><input id="accountPassword" name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="8" maxlength="128" required ${register?'placeholder="8文字以上"':''}><button type="button" class="account-text-button" id="accountShowPassword" aria-pressed="false">パスワードを表示</button></div>
    ${register?'<div class="field"><label for="accountConfirm">パスワード（確認）</label><input id="accountConfirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><label class="account-consent"><input id="accountConsent" type="checkbox" required><span>地域活動のために利用し、勧誘や迷惑行為をしないこと、および下記の保存範囲を確認しました。</span></label>':''}
    <p id="accountFormError" role="alert" class="account-form-error">${escapeHtml(accountError)}</p><button class="btn btn-primary btn-block" id="accountSubmit" type="submit">${register?'登録してはじめる':'ログイン'}</button>
  </form><div class="account-explanation"><b>このアプリの利用範囲</b><p>アカウントとマイページは、${LOCAL_APP?'このパソコンのアプリ用データベース':'トビヨリのサーバー'}に保存します。「募集中の活動」の申込み・連絡は登録団体へ届きます。「サンプル」と表示された活動・口コミ・ポイントは体験用です。</p><p>メールによる本人確認・パスワード再設定は未対応です。他のサービスと同じパスワードは使わず、パスワードを保管してください。</p></div></div></div>`;
}
function bindAccountForm() {
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

