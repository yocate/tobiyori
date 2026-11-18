/* Guided entrance. Answers stay in memory and do not change the user's profile. */
const GUIDED_PURPOSES={explore:['新しいことをしてみたい','まだ、やりたいことが決まっていなくても大丈夫。'],campus:['サークルや学生団体を知りたい','普段の活動や、見学できる機会を探します。'],work:['地域の仕事や企業を知りたい','企業の紹介・仕事体験・採用情報を分けて探します。']};
const GUIDED_ACTIONS={explore:{try:'まずは一度、参加してみたい',look:'どんな活動があるか見てみたい',ask:'参加する前に質問したい',peers:'同じ活動が気になる人と話したい'},campus:{look:'サークルの雰囲気を知りたい',try:'見学や体験ができる活動を探したい',ask:'参加条件などを質問したい'},work:{look:'地域の企業がどんなことをしているか知りたい',intern:'仕事体験・インターンを探したい',career:'採用・求人情報を見たい'}};
let guidedState={step:0,purpose:'',action:'',city:''};
function guidedReset(){guidedState={step:0,purpose:'',action:'',city:''};}
function guidedCandidates(now=Date.now()){
 const {purpose,action,city}=guidedState,sector=purpose==='campus'?'campus':purpose==='work'?'company':null;
 const communities=(LIVE.catalog.communities||[]).filter(c=>!sector||discoverySector(c)===sector);
 const all=new Map(communities.map(c=>[c.id,c]));
 const activities=(LIVE.catalog.activities||[]).filter(a=>{
  const c=all.get(a.communityId);if(!c||a.status!=='PUBLISHED'||a.changePending)return false;
  if(city&&(a.activityCity||c.city)!==city)return false;
  const deadline=Date.parse(isRecruitment(a)?a.deadline||a.endsAt:a.deadline||a.startsAt);
  if(!Number.isFinite(deadline)||deadline<=now)return false;
  if(!isRecruitment(a)&&(!Number.isFinite(Date.parse(a.startsAt))||Date.parse(a.startsAt)<=now))return false;
  if(a.participationScope==='members')return false;
  if(purpose!=='work'&&isCareerListing(a))return false;
  if(action==='intern'&&a.companyKind!=='internship')return false;
  if(action==='career'&&!isRecruitment(a))return false;
  if(purpose==='work'&&action==='look'&&isRecruitment(a))return false;
  if(action==='peers'&&!waitingAvailable(a))return false;
  return true;
 }).sort((a,b)=>Date.parse(isRecruitment(a)?a.deadline||a.endsAt:a.startsAt)-Date.parse(isRecruitment(b)?b.deadline||b.endsAt:b.startsAt));
 return {communities:communities.filter(c=>!city||c.city===city),activities};
}
function guidedChoices(options,key){return `<div class="guided-choices">${Object.entries(options).map(([value,label])=>`<button class="guided-choice" data-guided-answer="${key}" data-value="${value}"><strong>${escapeHtml(Array.isArray(label)?label[0]:label)}</strong>${Array.isArray(label)?`<span>${escapeHtml(label[1])}</span>`:''}<span class="guided-arrow" aria-hidden="true">→</span></button>`).join('')}</div>`;}
function guidedResultHTML(){
 if(!LIVE.loaded)return '<p role="status">活動の情報を読み込んでいます…</p>';
 if(LIVE.error)return '<p role="alert">活動の情報を取得できませんでした。</p><button class="btn btn-secondary" data-live-refresh>もう一度読み込む</button>';
 const {purpose,action,city}=guidedState,{communities,activities}=guidedCandidates();
 const browse=purpose==='campus'?'campus':purpose==='work'?'company':'list';
 const orgFirst=action==='look'||action==='ask';
 const title=action==='ask'?'気になる団体に、まず質問してみよう':action==='peers'?'同じ活動が気になる人と、あいさつから':action==='career'?'応募条件を確かめて、企業を知ろう':action==='intern'?'仕事を体験できる機会を探そう':orgFirst?'まずは、どんな団体があるか見てみよう':'一度の参加から、はじめてみよう';
 const intro=action==='ask'?'団体の紹介ページに質問欄があります。参加条件や気になることを、申し込む前に確かめられます。':action==='peers'?'ラウンジに入っても活動への申込みにはなりません。仲間がいないときは待機になります。':action==='career'?'仕事内容や応募条件を確認し、希望する場合に公式の募集ページから応募します。':action==='intern'?'期間や対象者、活動内容を確認して、自分に合う機会を探せます。':'回答に合わせた入口です。参加を決める前に、対象者・日時・費用を詳しく確認してください。';
 const cards=orgFirst?communities.slice(0,6).map(c=>`<article class="card live-card"><span class="badge badge-neutral">${escapeHtml(DISCOVERY_SECTORS[discoverySector(c)])}</span><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.city)}</p><p class="guided-excerpt">${escapeHtml(c.intro||'')}</p><a class="btn btn-primary" href="#/livecommunity/${encodeURIComponent(c.id)}">${action==='ask'?'紹介・質問欄を見る':'団体の雰囲気を見る'}</a></article>`).join(''):activities.slice(0,6).map(a=>`<article class="card live-card"><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(liveOrgById(a.communityId)?.name||'')}</p><p>${escapeHtml(isRecruitment(a)?'応募締切：':'')}${escapeHtml(liveDate(isRecruitment(a)?a.deadline||a.endsAt:a.startsAt))}</p><a class="btn btn-primary" href="#/${action==='peers'?'waiting':'liveactivity'}/${encodeURIComponent(a.id)}">${action==='peers'?'この活動のラウンジを見る':'活動の内容・条件を見る'}</a></article>`).join('');
 return `<div class="guided-result"><p class="guided-kicker">あなたの次の一歩</p><h2 tabindex="-1" data-guided-heading>${title}</h2><p>${intro}</p><dl class="guided-answers"><div><dt>やってみたいこと</dt><dd>${escapeHtml(GUIDED_PURPOSES[purpose][0])}</dd></div><div><dt>まずしたいこと</dt><dd>${escapeHtml(GUIDED_ACTIONS[purpose][action])}</dd></div><div><dt>地域</dt><dd>${escapeHtml(city||'地域を限定しない')}</dd></div></dl><div class="act-grid">${cards||`<div class="card live-card"><h3>${orgFirst?'この条件の団体は、まだ掲載されていません':'今の条件で案内できる活動はありません'}</h3><p>条件を変えるか、団体の紹介から気になる場所を探してみてください。${action==='peers'?'ラウンジの対象は、開催前の活動に限られます。':''}</p><a class="btn btn-secondary" href="#/${browse}">一覧から探す</a></div>`}</div><div class="guided-footer"><button class="btn btn-secondary" data-guided-back>地域を変える</button><button class="btn btn-ghost" data-guided-reset>最初から選び直す</button><a class="btn btn-ghost" href="#/${browse}">自分で一覧から探す</a></div></div>`;
}
function viewGuidedEntry(){
 if(current.view!=='start')return null;
 const step=guidedState.step;
 const body=step===3?guidedResultHTML():`<p class="guided-kicker">${step+1} / 3</p><div class="guided-progress" aria-hidden="true"><span style="width:${Math.round(step/3*100)}%"></span></div><h2 tabindex="-1" data-guided-heading>${['今日は、どんなことをしてみたい？','まずは、どこから始めたい？','どのあたりで探しますか？'][step]}</h2><p>${['やりたいことが決まっていなくても、選びながら探せます。','選んだ内容に合わせて、次の一歩を案内します。','団体や会場の市町村を目安に探します。'][step]}</p>${step===0?guidedChoices(GUIDED_PURPOSES,'purpose'):step===1?guidedChoices(GUIDED_ACTIONS[guidedState.purpose],'action'):`<form id="guidedAreaForm"><label for="guidedCity">探したい市町村</label><select id="guidedCity" name="city"><option value="">地域を限定しない</option>${GUNMA_MUNICIPALITIES.map(c=>`<option value="${escapeHtml(c)}" ${guidedState.city===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select><button class="btn btn-primary" type="submit">自分に合う入口を見る</button></form>`}${step===0?'<p class="guided-note">1分ほどで終わります。答えは送信・保存されず、プロフィールも変わりません。</p>':''}<div class="guided-footer">${step?'<button class="btn btn-ghost" data-guided-back>← 前の質問に戻る</button>':''}<a href="#/list">質問せずに一覧から探す</a></div>`;
 return liveShell('あなたの「やってみたい」から探す',`<section class="guided-panel">${body}</section>`);
}
function bindGuidedEntry(scope){
 const refresh=()=>{render();document.querySelector('[data-guided-heading]')?.focus();};
 scope.querySelectorAll('[data-guided-answer]').forEach(b=>b.onclick=()=>{const key=b.dataset.guidedAnswer,value=b.dataset.value;if(key==='purpose'&&GUIDED_PURPOSES[value]){guidedState.purpose=value;guidedState.action='';guidedState.step=1;}else if(key==='action'&&GUIDED_ACTIONS[guidedState.purpose]?.[value]){guidedState.action=value;guidedState.step=2;}refresh();});
 const form=scope.querySelector('#guidedAreaForm');if(form)form.onsubmit=e=>{e.preventDefault();const city=form.elements.city.value;guidedState.city=GUNMA_MUNICIPALITIES.includes(city)?city:'';guidedState.step=3;refresh();};
 scope.querySelectorAll('[data-guided-back]').forEach(b=>b.onclick=()=>{guidedState.step=Math.max(0,guidedState.step-1);refresh();});
 scope.querySelectorAll('[data-guided-reset]').forEach(b=>b.onclick=()=>{guidedReset();refresh();});
}
