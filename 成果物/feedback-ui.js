/* ---------------- Feedback (ご意見): anonymous sending + operator analysis ---------------- */
// Non-identifying context for analysis: which screens, how long, which device. No account, name or contact.
const FEEDBACK_CONTEXT={pages:0,from:'',page:'',since:Date.now(),errors:[]};
function trackFeedbackPage(){const page=location.hash||'#/home';if(page===FEEDBACK_CONTEXT.page)return;FEEDBACK_CONTEXT.from=FEEDBACK_CONTEXT.page;FEEDBACK_CONTEXT.page=page;FEEDBACK_CONTEXT.since=Date.now();FEEDBACK_CONTEXT.pages++;}
window.addEventListener('hashchange',trackFeedbackPage);trackFeedbackPage();
const rememberFeedbackError=message=>{FEEDBACK_CONTEXT.errors=[...FEEDBACK_CONTEXT.errors,String(message||'error').slice(0,200)].slice(-3);};
window.addEventListener('error',e=>rememberFeedbackError(e.message));
window.addEventListener('unhandledrejection',e=>rememberFeedbackError(e.reason?.message||e.reason));
function feedbackClientContext(){
 const ua=navigator.userAgent,w=innerWidth,h=innerHeight,mq=q=>!!window.matchMedia?.(q).matches;
 const os=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac OS X/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'other';
 const browser=/Edg\//.test(ua)?'Edge':/SamsungBrowser/.test(ua)?'Samsung':/Firefox|FxiOS/.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':'other';
 return {device:w<700?'mobile':w<1024?'tablet':'desktop',context:{fromPage:FEEDBACK_CONTEXT.from,viewport:w+'x'+h,orientation:w>h?'landscape':'portrait',os,browser,
  language:navigator.language||'',darkMode:mq('(prefers-color-scheme: dark)'),reducedMotion:mq('(prefers-reduced-motion: reduce)'),touch:navigator.maxTouchPoints>0,
  installed:mq('(display-mode: standalone)'),secondsOnPage:Math.round((Date.now()-FEEDBACK_CONTEXT.since)/1000),pagesViewed:FEEDBACK_CONTEXT.pages,loadError:!!LIVE.error,recentErrors:FEEDBACK_CONTEXT.errors}};
}
const FEEDBACK_CATEGORIES={hard:'使いにくい・分かりにくい',bug:'不具合・エラー',idea:'こうしてほしい',good:'よかったこと',other:'その他'};
function openFeedback(){
 const page=FEEDBACK_CONTEXT.page;
 openModal(`<div class="modal-head"><h3>ご意見・不具合を送る</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div>
 <p>いただいた声は、トビヨリの改善に使います。送信は匿名のため、返信はできません。</p>
 <form id="feedbackForm"><div class="field"><label>どんな内容ですか？</label><div class="filter-row">${Object.entries(FEEDBACK_CATEGORIES).map(([k,v])=>`<button type="button" class="chip" data-feedback-category="${k}" aria-pressed="false">${v}</button>`).join('')}</div></div>
 <div class="field"><label for="feedbackBody">くわしく教えてください</label><textarea id="feedbackBody" name="body" rows="5" maxlength="2000" placeholder="例：活動の申込みボタンが見つけにくかった"></textarea></div>
 <div class="field"><label>トビヨリの使いやすさ（任意）</label><div class="filter-row">${[1,2,3,4,5].map(n=>`<button type="button" class="chip" data-feedback-rating="${n}" aria-pressed="false">${n}</button>`).join('')}</div><p class="hint">1：使いにくい ／ 5：使いやすい</p></div>
 <p class="hint">名前・メールアドレス・電話番号は書かないでください（連絡先は自動で伏せ字になります）。分析のため、開いていた画面・端末の種類・画面サイズなど、個人を特定しない情報を一緒に送ります。</p>
 <p class="live-form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">送信する</button></form>`,root=>{
  const f=root.querySelector('#feedbackForm');let category='',rating=null;
  const choose=(attr,set)=>root.querySelectorAll(`[${attr}]`).forEach(b=>b.onclick=()=>{set(b.getAttribute(attr));f.querySelector('.live-form-error').textContent='';root.querySelectorAll(`[${attr}]`).forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});});
  choose('data-feedback-category',v=>{category=v;});choose('data-feedback-rating',v=>{rating=Number(v);});
  f.onsubmit=async e=>{e.preventDefault();const error=f.querySelector('.live-form-error'),b=f.querySelector('[type=submit]');error.textContent='';
   if(!category){error.textContent='どんな内容か選んでください。';return;}
   if(!f.elements.body.value.trim()){error.textContent='内容を入力してください。';f.elements.body.focus();return;}
   b.disabled=true;
   try{const c=feedbackClientContext();await accountAPI('feedback','POST',{category,rating,body:f.elements.body.value,page,surface:OPERATOR_APP?'operator':'user',device:c.device,context:c.context});closeModal();toast('ご意見を送りました。ありがとうございます');}
   catch(err){error.textContent=err.message||'送信できませんでした。';b.disabled=false;}};
 });
}
// Any element with data-feedback opens the form (menus, footer, operator home).
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-feedback]');if(!b)return;e.preventDefault();openFeedback();});

let FEEDBACK_ADMIN={loaded:false,loading:false,summary:null,list:null,filters:{status:'',category:'',page:'',q:''},error:''};
const FEEDBACK_DEVICES={mobile:'スマホ',tablet:'タブレット',desktop:'PC'},FEEDBACK_ROLES={guest:'ゲスト',user:'利用者',organizer:'団体担当',admin:'運営'};
// Operators read screen names, not routes; the route stays visible for exact filtering.
const FEEDBACK_PAGE_NAMES={home:'ホーム',list:'活動を探す',regional:'地域コミュニティを探す',campus:'大学・サークルを探す',company:'企業を探す',map:'地図で探す',liveactivity:'活動の詳細',livecommunity:'団体の紹介',mypage:'マイページ',myactivity:'申込み・参加記録',notifications:'お知らせ',following:'フォロー中',saved:'保存した団体',serendipity:'よりみち発見',waiting:'よりみちラウンジ',guide:'ご利用ガイド',safety:'安心・安全',login:'ログイン',register:'新規登録',support:'相談の対応状況',offers:'オファー',manage:'運営ホーム',admin:'団体・審査',org:'募集管理',participants:'参加者対応',reports:'相談対応',feedback:'ご意見'};
const feedbackPageName=page=>{const key=String(page||'').replace(/^#\//,'').split('/')[0];return page?(FEEDBACK_PAGE_NAMES[key]||key||'ホーム'):'画面不明';};
const feedbackQuery=()=>new URLSearchParams(Object.entries(FEEDBACK_ADMIN.filters).filter(([,v])=>v)).toString();
async function loadFeedbackAdmin(){
 FEEDBACK_ADMIN.loading=true;
 try{const q=feedbackQuery(),[summary,list]=await Promise.all([accountAPI('feedback/summary'),accountAPI('feedback'+(q?'?'+q:''))]);Object.assign(FEEDBACK_ADMIN,{summary,list,loaded:true,error:''});LIVE.feedbackNew=summary.newCount;}
 catch(e){Object.assign(FEEDBACK_ADMIN,{loaded:true,error:e.message||'読み込めませんでした。'});}
 finally{FEEDBACK_ADMIN.loading=false;}
 if(current.view==='feedback')render();
}
function viewFeedbackPage(){
 if(current.view!=='feedback')return null;
 if(!accountUser)return viewAccount('login');
 if(!LIVE.loaded)return liveShell('ご意見','<p role="status">読み込んでいます…</p>');
 if(LIVE.dashboard?.role!=='ADMIN')return liveShell('ご意見','<p>ご意見の一覧は運営者だけが確認できます。</p>');
 if(!FEEDBACK_ADMIN.loaded){if(!FEEDBACK_ADMIN.loading)void loadFeedbackAdmin();return liveShell('ご意見','<p role="status">読み込んでいます…</p>');}
 if(FEEDBACK_ADMIN.error)return liveShell('ご意見',`<p class="live-form-error" role="alert">${escapeHtml(FEEDBACK_ADMIN.error)}</p><button class="btn btn-secondary" data-feedback-reload>もう一度読み込む</button>`);
 const s=FEEDBACK_ADMIN.summary,l=FEEDBACK_ADMIN.list,f=FEEDBACK_ADMIN.filters,rate=v=>v==null?'—':Number(v).toFixed(1),maxWeek=Math.max(1,...s.weekly.map(w=>w.count));
 const table=(head,rows)=>`<div class="feedback-table-wrap"><table class="feedback-table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${head.length}">まだありません</td></tr>`}</tbody></table></div>`;
 const q=feedbackQuery();
 return liveShell('ご意見',`<p>利用者から届いたご意見です。送信は匿名で、個人を特定する情報は保存していません。</p>
 <div class="operator-stats"><div class="card operator-stat"><span>未確認</span><strong>${s.newCount}<small>件</small></strong></div><div class="card operator-stat"><span>これまでの合計</span><strong>${s.total}<small>件</small></strong></div><div class="card operator-stat"><span>使いやすさの平均</span><strong>${rate(s.averageRating)}<small>/ 5</small></strong></div></div>
 <section class="card live-card"><h2>週ごとの件数（直近8週）</h2><div class="feedback-weeks">${s.weekly.slice().reverse().map(w=>`<div><b>${w.count}</b><span style="height:${Math.round(w.count/maxWeek*60)+2}px"></span><small>${w.weeksAgo?w.weeksAgo+'週前':'今週'}</small></div>`).join('')}</div></section>
 <section class="card live-card"><h2>問題の多い画面</h2><p class="hint">「使いにくい・分かりにくい」「不具合・エラー」が多い順。画面名を押すと、その画面のご意見だけを表示します。</p>${table(['画面','使いにくい・不具合','合計','使いやすさ'],s.byPage.map(r=>[`<button class="btn btn-ghost btn-sm" data-feedback-page="${escapeHtml(r.page)}">${escapeHtml(feedbackPageName(r.page))}</button> <small class="hint">${escapeHtml(r.page)}</small>`,r.problems,r.count,rate(r.averageRating)]))}</section>
 <section class="card live-card"><h2>種類・端末・送信者別</h2>${table(['区分','件数','使いやすさ'],[...s.byCategory.map(r=>[escapeHtml(s.categories[r.category]||r.category),r.count,rate(r.averageRating)]),...s.byDevice.map(r=>[FEEDBACK_DEVICES[r.device]||escapeHtml(r.device),r.count,rate(r.averageRating)]),...s.byRole.map(r=>[FEEDBACK_ROLES[r.role]||escapeHtml(r.role),r.count,rate(r.averageRating)])])}</section>
 <h2>ご意見の一覧</h2>
 <form id="feedbackFilter" class="card live-card"><div class="feedback-filter-grid"><div class="field"><label for="fbStatus">対応状況</label><select id="fbStatus" name="status"><option value="">すべて</option>${Object.entries(s.statuses).map(([k,v])=>`<option value="${k}" ${f.status===k?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="fbCategory">種類</label><select id="fbCategory" name="category"><option value="">すべて</option>${Object.entries(s.categories).map(([k,v])=>`<option value="${k}" ${f.category===k?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="fbPage">画面</label><input id="fbPage" type="text" name="page" value="${escapeHtml(f.page)}" placeholder="#/home など"></div><div class="field"><label for="fbQuery">キーワード</label><input id="fbQuery" type="text" name="q" value="${escapeHtml(f.q)}" placeholder="内容・タグ・メモから探す"></div></div><div class="live-navigation"><button class="btn btn-primary" type="submit">絞り込む</button><a class="btn btn-secondary" href="/api/feedback/export.csv${q?'?'+escapeHtml(q):''}" download>この条件でCSVを書き出す</a></div></form>
 <p>${l.total}件${l.total>l.items.length?`（新しい順に${l.items.length}件を表示）`:''}</p>
 ${l.items.map(feedbackCardHTML).join('')||'<p>条件に合うご意見はありません。</p>'}`);
}
function feedbackCardHTML(r){
 const c=r.context||{},s=FEEDBACK_ADMIN.summary;
 const facts=[['画面',r.page],['直前の画面',c.fromPage],['端末',FEEDBACK_DEVICES[r.device]],['OS・ブラウザ',[c.os,c.browser].filter(Boolean).join(' / ')],['表示サイズ',c.viewport],['画面にいた時間',c.secondsOnPage!=null?c.secondsOnPage+'秒':''],['閲覧した画面数',c.pagesViewed],['送信者',FEEDBACK_ROLES[r.role]],['登録からの期間',c.accountAge],['申込み件数',c.applications],['ダークモード',c.darkMode?'はい':''],['読み込みエラー',c.loadError?'あり':''],['直近の画面エラー',(c.recentErrors||[]).join(' | ')],['アプリの版',r.release]].filter(([,v])=>v!==undefined&&v!==null&&v!=='');
 return `<article class="card live-card" data-feedback-id="${escapeHtml(r.id)}"><div class="live-navigation"><span class="badge">${escapeHtml(s.categories[r.category]||r.category)}</span>${r.rating?`<span class="badge badge-neutral">使いやすさ ${r.rating}/5</span>`:''}<span class="badge ${r.status==='NEW'?'badge-warn':'badge-neutral'}">${escapeHtml(s.statuses[r.status]||r.status)}</span></div><p class="live-copy">${escapeHtml(r.body)}</p><p class="hint">${escapeHtml(liveDate(r.createdAt))} ／ ${escapeHtml(feedbackPageName(r.page))} ／ ${escapeHtml(FEEDBACK_DEVICES[r.device]||'')}${r.tags.length?' ／ タグ：'+escapeHtml(r.tags.join('、')):''}</p><details><summary>送信時の状況</summary>${facts.map(([k,v])=>`<p class="live-copy"><b>${k}：</b>${escapeHtml(String(v))}</p>`).join('')}</details>${r.note?`<p class="live-copy"><b>運営メモ：</b>${escapeHtml(r.note)}</p>`:''}<details class="feedback-triage"><summary>対応を記録（状況・タグ・メモ）</summary><form><div class="feedback-filter-grid"><div class="field"><label for="fs-${escapeHtml(r.id)}">対応状況</label><select id="fs-${escapeHtml(r.id)}" name="status">${Object.entries(s.statuses).map(([k,v])=>`<option value="${k}" ${r.status===k?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="ft-${escapeHtml(r.id)}">タグ（「、」区切り）</label><input id="ft-${escapeHtml(r.id)}" type="text" name="tags" value="${escapeHtml(r.tags.join('、'))}" placeholder="例：申込み、ナビ"></div></div><div class="field"><label for="fn-${escapeHtml(r.id)}">運営メモ</label><textarea id="fn-${escapeHtml(r.id)}" name="note" rows="2" maxlength="2000">${escapeHtml(r.note)}</textarea></div><button class="btn btn-secondary btn-sm" type="submit">保存</button></form></details></article>`;
}
function bindFeedbackAdmin(scope){
 const reload=filters=>{FEEDBACK_ADMIN.filters=filters;FEEDBACK_ADMIN.loaded=false;render();};
 scope.querySelector('#feedbackFilter')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target);reload({status:fd.get('status')||'',category:fd.get('category')||'',page:String(fd.get('page')||'').trim(),q:String(fd.get('q')||'').trim()});});
 scope.querySelectorAll('[data-feedback-page]').forEach(b=>b.onclick=()=>reload({...FEEDBACK_ADMIN.filters,status:'',page:b.dataset.feedbackPage}));
 scope.querySelector('[data-feedback-reload]')?.addEventListener('click',()=>reload(FEEDBACK_ADMIN.filters));
 scope.querySelectorAll('.feedback-triage form').forEach(form=>form.onsubmit=async e=>{
  e.preventDefault();const id=form.closest('[data-feedback-id]').dataset.feedbackId,b=form.querySelector('button');b.disabled=true;
  try{
   const updated=await accountAPI('feedback/'+id,'POST',{status:form.elements.status.value,tags:form.elements.tags.value.split(/[、,]/).map(t=>t.trim()).filter(Boolean),note:form.elements.note.value});
   const i=FEEDBACK_ADMIN.list.items.findIndex(x=>x.id===id);if(i>=0)FEEDBACK_ADMIN.list.items[i]=updated;
   FEEDBACK_ADMIN.summary=await accountAPI('feedback/summary');LIVE.feedbackNew=FEEDBACK_ADMIN.summary.newCount;toast('保存しました');render();
  }catch(err){toast(err.message||'保存できませんでした');b.disabled=false;}
 });
}
