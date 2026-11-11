/* Server-backed communities and participation. Sample records remain separate. */
let LIVE={catalog:{communities:[],activities:[]},dashboard:null,review:null,loaded:false,error:''};
let liveQuery='';
let liveRequest=0,liveRecordFilter='all',liveOnlyFollowed=false,liveBackgroundBusy=false;
const liveStatus={PENDING:'団体を確認中',VERIFIED:'運営確認済み',SUSPENDED:'掲載停止',DRAFT:'下書き',REVIEW:'募集を審査中',PUBLISHED:'募集中',CLOSED:'募集終了',APPLIED:'承認待ち',APPROVED:'参加予定',DECLINED:'受入れ不可',CANCELLED:'取消済み',EXPIRED:'受付終了',DONE:'参加完了'};
function clearLivePrivate(){liveApprovalSearch={review:{query:'',status:''},participants:{query:'',status:''}};liveRequest++;LIVE.dashboard=null;LIVE.review=null;liveOnlyFollowed=false;clearSerendipity();}
async function refreshLive(redraw=true,{background=false}={}){
 if(background&&(liveBackgroundBusy||Date.now()<accountRetryUntil))return;
 if(background)liveBackgroundBusy=true;
 const epoch=accountEpoch,uid=accountUser?.id,request=++liveRequest;
 try{
   const visit=uid&&!OPERATOR_APP?await recordDailyVisit(false):null;
   const fetchCatalog=!background||!LIVE.catalogFetchedAt||Date.now()-LIVE.catalogFetchedAt>=120000||LIVE.catalogUserId!==uid;
   const catalog=fetchCatalog?await accountAPI('live/catalog'):LIVE.catalog;
   const catalogFetchedAt=fetchCatalog?Date.now():LIVE.catalogFetchedAt;
   const dashboard=uid?await accountAPI('live/dashboard'):null;
   const review=OPERATOR_APP&&dashboard?.role==='ADMIN'?await accountAPI('live/review'):null;
   const feedbackNew=OPERATOR_APP&&dashboard?.role==='ADMIN'?(await accountAPI('feedback/summary').catch(()=>null))?.newCount||0:0;
   if(request!==liveRequest||epoch!==accountEpoch||uid!==accountUser?.id)return;
   LIVE={catalog,dashboard,review,feedbackNew,loaded:true,error:'',fetchedAt:Date.now(),catalogFetchedAt,catalogUserId:uid};
   showDailyVisitNotice(visit);
 }catch(e){if(request!==liveRequest||epoch!==accountEpoch||uid!==accountUser?.id)return;LIVE.loaded=true;LIVE.error=e.message||'募集を読み込めませんでした。';if([401,403,409].includes(e.status)){clearLivePrivate();}}finally{if(background)liveBackgroundBusy=false;}
 accountNotice();
 if(redraw)render();
}
function liveUnreadCount(){return LIVE.dashboard?.unreadBySurface?.[OPERATOR_APP?'operator':'user']??surfaceNotifications().filter(n=>!n.is_read).length;}
function liveOwnApplications(){return (LIVE.dashboard?.applications||[]).filter(p=>!p.owned);}
function liveSaveButton(c){
 const saved=!!accountUser&&!!LIVE.dashboard?.saves?.includes(c.id);
 return `<button type="button" class="btn btn-sm community-save ${saved?'is-saved':'btn-secondary'}" data-community-save="${escapeHtml(c.id)}" data-saved="${saved}" aria-pressed="${saved}" aria-label="${escapeHtml(c.name)}を${saved?'保存から外す':'保存する'}"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>${saved?'保存済み':'保存する'}</button>`;
}
function liveSavedHTML(){
 if(!LIVE.dashboard)return '<p>保存したコミュニティを取得できませんでした。</p><button class="btn btn-secondary" data-live-refresh>もう一度読み込む</button>';
 const rows=LIVE.dashboard.savedCommunities||[];
 return `<p>気になる団体を、あとから見返せます。保存した人の名前や保存一覧は、ほかの人には表示されません。</p><div class="act-grid">${rows.map(c=>`<article class="card live-card"><h3>${escapeHtml(c.name)}</h3>${c.available?`<p>${escapeHtml(c.city)} ／ ${escapeHtml(c.type||'')}</p><a class="btn btn-secondary btn-sm" href="#/livecommunity/${encodeURIComponent(c.id)}">団体・募集中の活動を見る</a>`:'<p>現在は非公開です。保存から外すことはできます。</p>'}${liveSaveButton(c)}</article>`).join('')||'<div class="card live-card"><h3>気になる団体を保存しよう</h3><p>団体の紹介や一覧の「保存する」から追加できます。</p><button class="btn btn-primary" data-nav="list">活動を探す</button></div>'}</div>`;
}
function liveRecordRows(filter='all'){
 const rows=liveOwnApplications().filter(p=>({waiting:p.status==='APPLIED',upcoming:p.status==='APPROVED',history:p.status==='DONE',closed:['DECLINED','CANCELLED','EXPIRED'].includes(p.status)}[filter]??true));
 return `${LIVE.error?`<p class="live-form-error" role="alert">${escapeHtml(LIVE.error)}</p>`:''}<button class="btn btn-ghost btn-sm" data-live-refresh>最新の状況に更新</button>${rows.map(liveApplicationCard).join('')||'<div class="card live-card"><p>この区分の参加記録はまだありません。</p><button class="btn btn-primary" data-nav="live">募集中の活動を探す</button></div>'}${filter==='history'?'<p class="hint">運営担当者が参加完了を記録した活動を表示します。正式な活動証明書の発行は今後対応します。</p>':''}`;
}
function liveRecordsHTML(){return `${connectionContinueHTML(true)}<p>申込み状況、集合場所、担当者との連絡をまとめて確認できます。</p><div data-lounge-considering></div><div class="live-navigation" aria-label="参加記録の絞り込み">${Object.entries({all:'すべて',waiting:'承認待ち',upcoming:'参加確定',history:'参加完了',closed:'取消・受付終了'}).map(([k,l])=>`<button class="btn ${liveRecordFilter===k?'btn-primary':'btn-ghost'} btn-sm" data-live-record="${k}" aria-pressed="${liveRecordFilter===k}">${l}</button>`).join('')}</div>${liveOwnApplications().length?liveRecordRows(liveRecordFilter):'<div class="card live-card"><p>まだ申込みはありません。</p><button class="btn btn-primary" data-nav="live">募集中の活動を探す</button></div>'}`;}
function liveFollowsHTML(){
 const communities=LIVE.dashboard?.followedCommunities||[];
 return `<p>フォローすると、新しい募集が公開されたときにアプリ内でお知らせします。</p><div class="act-grid">${communities.map(c=>`<article class="card live-card"><h3>${escapeHtml(c.name)}</h3>${c.available?`<p>${escapeHtml(c.city)} ／ ${escapeHtml(c.type)}</p><button class="btn btn-secondary btn-sm" data-nav="livecommunity" data-param="${c.id}">紹介・募集中の活動を見る</button>`:'<p>現在、団体の情報は公開されていません。フォローは続けられます。</p>'}<button class="btn btn-ghost btn-sm" data-live-follow="${c.id}" data-follow="false">フォローをやめる</button></article>`).join('')||'<div class="card live-card"><p>フォロー中の団体はまだありません。</p><button class="btn btn-primary" data-nav="live">コミュニティを探す</button></div>'}</div>`;
}
function liveNotificationsHTML(){const rows=surfaceNotifications();return `<p>${OPERATOR_APP?'団体情報の確認、申込み、活動連絡をお知らせします。':'フォロー先の新着募集、申込みの結果、活動連絡をお知らせします。'}</p><div class="live-navigation"><span class="badge badge-neutral">未読 ${liveUnreadCount()}件</span><button class="btn btn-ghost btn-sm" data-live-refresh>最新のお知らせを確認</button><button class="btn btn-ghost btn-sm" data-live-read ${liveUnreadCount()?'':'disabled'}>すべて既読にする</button></div>${rows.map(n=>`<article class="card live-card ${n.is_read?'':'live-unread'}">${n.is_read?'':'<span class="badge badge-warn">未読</span>'}<p>${escapeHtml(n.body)}</p><small>${escapeHtml(liveDate(n.created_at))}</small><button class="btn btn-secondary btn-sm" data-live-notice="${escapeHtml(n.route)}" data-notice-id="${n.id}">内容を確認する</button></article>`).join('')||'<p>新しいお知らせはありません。</p>'}<p class="hint">最近100件を表示します。通知はこのアプリ内に届きます。</p>`;}
function liveHomeActivitiesHTML(){return `<section class="section container live-home"><div class="section-head"><div><h2>参加できる活動</h2></div><button class="btn btn-secondary btn-sm" data-nav="list">すべて見る</button></div>${!LIVE.loaded?'<p role="status">活動を読み込んでいます…</p>':LIVE.error?`<p role="alert">${escapeHtml(LIVE.error)}</p><button class="btn btn-secondary" data-live-refresh>もう一度読み込む</button>`:`<div class="act-grid">${LIVE.catalog.activities.slice(0,3).map(liveCard).join('')||'<div class="card live-card"><p>現在、申込みを受け付けている活動はありません。</p><button class="btn btn-primary" data-nav="list">コミュニティを探す</button></div>'}</div>`}</section>`;}
// 参加までの流れ: ラウンジ（任意）→申込み→団体が確認→参加確定→参加完了。いまの位置と次にすることを示す。
const FLOW_STEPS=['ラウンジで検討','申し込む','団体が確認','参加確定','参加完了'];
function flowState(aid,status,inLounge){
 if(status==='APPLIED')return {step:2,label:'申込み済み（団体の確認待ち）',note:'まだ参加確定ではありません。団体が申込み内容を確認しています。',next:'承認されるとお知らせが届き、集合場所が表示されます。予定が変わったら、申込みを取り消せます。',href:'#/myactivity',cta:'申込み状況を見る'};
 if(status==='APPROVED')return {step:3,label:'参加確定',note:'団体が参加を承認しました。',next:'集合場所・緊急連絡先と、活動の連絡板を確認して当日に備えましょう。',href:'#/myactivity',cta:'集合場所・連絡板を見る'};
 if(status==='DONE')return {step:4,label:'参加完了',note:'参加が記録されました。おつかれさまでした。',next:'よければ口コミを書いて、次に参加する人の参考にしてください。',href:'#/myactivity',cta:'口コミを書く'};
 if(status==='DECLINED'||status==='EXPIRED')return {step:-1,label:liveStatus[status],note:status==='DECLINED'?'今回は参加を受け入れられませんでした。':'開催までに承認されなかったため、受付終了になりました。',next:'ほかの活動も探してみましょう。',href:'#/live',cta:'ほかの活動を探す'};
 if(inLounge)return {step:0,label:'ラウンジで検討中',note:'ラウンジへの入室は、申込みではありません。',next:'参加を決めたら、活動ページの申込みボタンから申し込みます。',href:'#/waiting/'+encodeURIComponent(aid),cta:'ラウンジを見る'};
 return {step:-1,label:'まだ申し込んでいません',note:'',next:'気になったら、ラウンジや質問で様子を確かめてから申し込めます。'};
}
// 活動ページ上では、申込みボタンはすぐ上にある
const activityFlowState=(aid,inLounge)=>{const st=flowState(aid,null,inLounge);return {...st,next:st.step===0?'参加を決めたら、上の「参加を申し込む」から申し込めます。':st.next};};
function flowHTML(st,compact=false){if(compact)return `<section class="flow-card compact" aria-label="参加までの流れ"><ol class="flow-steps">${FLOW_STEPS.map((t,i)=>`<li class="${i<st.step?'done':i===st.step?'current':''}"${i===st.step?' aria-current="step"':''}><b>${i<st.step?'✓':i+1}</b><span>${t}</span></li>`).join('')}</ol><p class="flow-now"><strong>${escapeHtml(st.label)}</strong>　${escapeHtml(st.next)}</p></section>`;return `<section class="flow-card" aria-label="参加までの流れ"><ol class="flow-steps">${FLOW_STEPS.map((t,i)=>`<li class="${i<st.step?'done':i===st.step?'current':''}"${i===st.step?' aria-current="step"':''}><b>${i<st.step?'✓':i+1}</b><span>${t}${i===0?'<small>（任意）</small>':''}</span></li>`).join('')}</ol><p class="flow-now">いまの状態：<strong>${escapeHtml(st.label)}</strong></p>${st.note?`<p>${escapeHtml(st.note)}</p>`:''}<p class="flow-next"><b>次にすること</b>${escapeHtml(st.next)}</p>${st.href?`<a class="btn btn-secondary btn-sm" href="${st.href}">${escapeHtml(st.cta)}</a>`:''}</section>`;}
const APPLY_KINDS={見学:'活動の様子を見に行きます。作業には加わりません。',体験参加:'1回だけ、実際に参加してみます。',継続参加の相談:'続けて参加したい方向けです。まず団体に相談します。'};
function applyStepsHTML(){return '<div class="apply-steps"><b>申し込むと、こうなります</b><ol><li>団体に、ニックネームと入力した内容が届きます（<strong>まだ参加確定ではありません</strong>）。</li><li>団体が確認し、承認されるとアプリ内にお知らせが届きます。</li><li>承認後、集合場所と緊急連絡先が「申込み・参加記録」に表示されます。</li><li>予定が変わったら、申込みはいつでも取り消せます。</li></ol></div>';}
const ACTIVITY_DETAIL_GROUPS=[['活動の内容',{purpose:'活動の目的',tasks:'具体的な内容',staff:'責任者'}],['費用・持ち物・アクセス',{fees:'費用の補足',remuneration:'報酬・謝礼',transportFee:'交通費の補助',belongings:'持ち物',transport:'交通手段'}],['安全・ルール',{risk:'危険性と対策',insurance:'保険',photoPolicy:'写真撮影',prohibited:'禁止事項'}]];
const filled=v=>v===0||(v!==undefined&&v!==null&&String(v).trim()!=='');
function activityFee(a){return a.feeAmount===0||a.feeAmount==='0'?'無料':filled(a.feeAmount)?Number(a.feeAmount).toLocaleString()+'円':filled(a.fees)?a.fees:'記載なし';}
function activitySummaryHTML(a,c){
 const targets=[a.beginner?'初めての方歓迎':'',HIGH_SCHOOL_LABELS[a.highSchoolParticipation]||HIGH_SCHOOL_LABELS.unknown,a.targetYears?.length?'大学生：'+a.targetYears.join('・'):''].filter(Boolean);
 const rows=[['日時',`${liveDate(a.startsAt)} 〜 ${liveDate(a.endsAt)}`],['場所',`${escapeHtml(a.activityCity||c?.city||'未定')}<small>正確な集合場所は参加確定後に表示します</small>`,true],['参加費',activityFee(a)],['募集人数',a.capacity+'人']];
 const scope=a.participationScope==='members'?'所属メンバーのみ':a.participationScope==='open'?'団体に入っていなくても参加できます':'参加資格は主催者に確認してください';
 return `<section class="activity-summary" aria-label="活動の要点"><dl>${rows.map(([k,v,html])=>`<div><dt>${k}</dt><dd>${html?v:escapeHtml(v)}</dd></div>`).join('')}<div><dt>対象</dt><dd class="activity-targets">${targets.map(t=>`<span>${escapeHtml(t)}</span>`).join('')}</dd></div><div class="activity-requirements"><dt>参加条件</dt><dd><strong>${escapeHtml(scope)}</strong>${filled(a.requirements)?`<span class="live-copy">${escapeHtml(a.requirements)}</span>`:''}</dd></div><div><dt>主催</dt><dd><button class="link-button" data-nav="livecommunity" data-param="${a.communityId}">${escapeHtml(c?.name||'登録団体')}</button></dd></div></dl>${liveApplyControls(a)}${c?`<div class="activity-summary-sub">${liveSaveButton(c)}</div>`:''}</section>`;
}
function activityDetailsHTML(a){return ACTIVITY_DETAIL_GROUPS.map(([title,fields],i)=>{const rows=Object.entries(fields).filter(([k])=>filled(a[k]));return rows.length?`<details class="activity-detail-group" ${i===0?'open':''}><summary>${title}</summary><dl>${rows.map(([k,label])=>`<div><dt>${label}</dt><dd class="live-copy">${escapeHtml(String(a[k]))}</dd></div>`).join('')}</dl></details>`:'';}).join('');}
function liveApplyControls(a){
 const own=liveOwnApplications().find(p=>p.activity_id===a.id);
 if(own&&own.status!=='CANCELLED')return flowHTML(flowState(a.id,own.status,false));
 if(LIVE.dashboard?.activities.some(x=>x.id===a.id))return '<button class="btn btn-secondary" data-nav="org">この募集を管理する</button>';
 if(isRecruitment(a))return a.status==='PUBLISHED'&&!a.changePending&&(a.deadline||a.endsAt)>new Date().toISOString()&&a.applicationURL?`<div class="card live-card"><p>採用への応募は企業の公式ページで行います。</p><a class="btn btn-primary" href="${escapeHtml(a.applicationURL)}" target="_blank" rel="noopener noreferrer">公式ページで応募する ↗</a></div>`:'<p>現在は応募受付を行っていません。</p>';
 return a.status==='PUBLISHED'&&!a.changePending&&(a.deadline||a.startsAt||'9999')>new Date().toISOString()?`${a.participationScope==='members'?'<p class="hint">この活動は団体の所属メンバーのみが対象です。申込み時に所属を確認し、担当者が承認します。</p>':''}<div class="apply-main"><button class="btn btn-primary" data-live-apply="${a.id}">参加を申し込む</button><small>見学・体験参加・継続参加の相談から選べます。申込みの時点では、まだ参加確定ではありません。</small></div><div data-flow="${escapeHtml(a.id)}" data-compact>${flowHTML(activityFlowState(a.id,waitingJoined.includes(a.id)),true)}</div>`:'';
}
function liveRecommendationsHTML(){
 const p=DB.profile,labels=interestChoices().filter(([key])=>(p.interests||[]).includes(key)).map(([,v])=>v.label);
 const recommendations=LIVE.catalog.activities.map(a=>{
  const c=LIVE.catalog.communities.find(c=>c.id===a.communityId);
  if(!c||c.status!=='VERIFIED'||isCareerListing(a)&&p.receiveCareerOffers!==true)return null;
  const reasons=[];
  let score=0;
  if(matchingCommunityInterests(p.interests,[a.genre,...(c.genres||[])])){
   reasons.push('登録した興味に合う活動');score+=3;
  }
  if((p.areas||[]).includes(c.city)){
   reasons.push('希望している地域');score+=2;
  }
  if((p.days||[]).includes(['日','月','火','水','木','金','土'][new Date(a.startsAt).getDay()])){
   reasons.push('参加できる曜日');score+=1;
  }
  if((p.transport||[]).some(t=>a.transport?.includes(t))){
   reasons.push('登録した移動手段の案内あり');score+=1;
  }
  const skills=matchingProfileSkills(p,a);if(skills.length){score+=2;reasons.push('自己PRの得意分野：'+skills.map(s=>s.label).join('・'));}
  return {a,reasons,score};
 }).filter(x=>x?.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
 return `${serendipityEntryHTML()}<section class="card live-card"><h2>興味に合わせたおすすめ</h2><p class="hint">あなたの興味や得意なことに合う活動をご紹介します。</p><details class="live-buzz-help"><summary>おすすめの選び方</summary><p>興味3点・地域2点・曜日1点・移動手段1点。自己PRの活用をオンにすると、得意分野の一致で2点を加えます。</p><p>文章のキーワードで判定し、外部AIには送信しません。</p></details>${recommendations.length?`<div class="act-grid">${recommendations.map(({a,reasons})=>`<div><p class="hint">${reasons.map(escapeHtml).join(' ／ ')}</p>${liveCard(a)}</div>`).join('')}</div>`:'<p>興味や参加できる曜日を登録すると、確認済みの団体の募集から条件に合う活動を紹介します。合う募集がないときは、公開されるのをお待ちください。</p>'}<button class="btn btn-ghost btn-sm" data-nav="mypage">登録情報を確認する</button></section>`;
}
function liveDate(value){return value?new Date(value).toLocaleString('ja-JP',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'日時未設定';}
function liveBadge(status){return `<span class="badge badge-neutral">${escapeHtml(liveStatus[status]||status)}</span>`;}
function liveOrgById(cid){return LIVE.catalog.communities.find(c=>c.id===cid)||LIVE.dashboard?.communities.find(c=>c.id===cid)||LIVE.review?.communities.find(c=>c.id===cid);}
function liveActivityById(aid){return LIVE.catalog.activities.find(a=>a.id===aid)||LIVE.dashboard?.activities.find(a=>a.id===aid)||LIVE.dashboard?.applications.find(p=>p.activity_id===aid)?.activity||LIVE.review?.activities.find(a=>a.id===aid);}
const COMMUNITY_ACTIVITY_TYPES={event:'イベント',volunteer:'ボランティア',experience:'見学・体験',exchange:'交流会',activity:'その他の活動'};
function activityEntryBadge(a){if(isCareerListing(a))return '';const kind=COMMUNITY_ACTIVITY_TYPES[a.activityKind]||COMMUNITY_ACTIVITY_TYPES.activity;return `<span class="badge badge-neutral">${kind}</span>${a.participationScope==='open'?'<span class="badge badge-neutral">団体に入っていなくても参加可</span>':a.participationScope==='members'?'<span class="badge badge-neutral">所属メンバー向け</span>':''}`;}
function activityEntryFields(a){return `<div class="field" data-community-event-fields><label for="lf_activityKind">募集する活動の種類</label><select id="lf_activityKind" name="activityKind">${Object.entries(COMMUNITY_ACTIVITY_TYPES).map(([k,v])=>`<option value="${k}" ${(a.activityKind||'activity')===k?'selected':''}>${v}</option>`).join('')}</select><label for="lf_participationScope">団体に所属していない方の参加</label><select id="lf_participationScope" name="participationScope">${Object.entries({unknown:'確認中・参加条件に記載',open:'団体に入っていなくても参加できる',members:'所属メンバーのみ'}).map(([k,v])=>`<option value="${k}" ${(a.participationScope||'unknown')===k?'selected':''}>${v}</option>`).join('')}</select><p class="hint">団体への加入とは別に、イベントやボランティアの参加者を募集できます。</p></div>`;}
function communityHostedActivities(c){const rows=LIVE.catalog.activities.filter(a=>a.communityId===c.id);return `<section class="community-hosted" id="communityActivities" aria-labelledby="communityActivitiesTitle"><h2 id="communityActivitiesTitle">参加できる活動・募集 <small>${rows.length}件</small></h2>${rows.length?Object.entries(COMMUNITY_ACTIVITY_TYPES).map(([kind,label])=>{const items=rows.filter(a=>(a.activityKind||'activity')===kind);return items.length?`<section><h3>${label} <small>${items.length}件</small></h3><div class="act-grid">${items.map(a=>liveCard(a,{lounge:true})).join('')}</div></section>`:'';}).join(''):'<div class="card live-card"><p>現在、申込みを受け付けている活動はありません。</p><p>フォローすると、新しい募集が公開されたときにお知らせします。</p></div>'}</section>`;}
function liveCard(a,{lounge=false}={}){const c=liveOrgById(a.communityId),recruitment=isRecruitment(a);return `<article class="card live-card activity-card">${recruitment?companyKindBadge(a):`<span class="badge badge-neutral">${escapeHtml(COMMUNITY_ACTIVITY_TYPES[a.activityKind]||COMMUNITY_ACTIVITY_TYPES.activity)}</span>`}<h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(c?.name||'コミュニティ')} ／ ${escapeHtml(c?.city||'')}</p><p>${recruitment?'応募締切：'+escapeHtml(liveDate(a.deadline||a.endsAt)):'日時：'+escapeHtml(liveDate(a.startsAt))}</p><div class="live-card-actions"><button class="btn btn-primary btn-sm" data-nav="liveactivity" data-param="${a.id}">${recruitment?'募集内容・応募条件を見る':'内容・参加条件を見る'}</button>${lounge?waitingCardEntry(a):''}</div></article>`;}
function livePhotos(c){return `<div class="community-photos">${(c.photos||[]).map(p=>`<figure><img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.caption||'活動の様子')}"><figcaption>${escapeHtml(p.caption)}</figcaption></figure>`).join('')}</div><div class="live-navigation">${Object.entries(c.links||{}).map(([k,v])=>`<a class="btn btn-ghost btn-sm" href="${escapeHtml(v)}" target="_blank" rel="noopener noreferrer">${escapeHtml(COMMUNITY_LINKS[k]||'公式サイト')} ↗</a>`).join('')}</div>`;}
function liveShell(title,body){return `<div class="container section live-page"><h1>${title}</h1>${LIVE.error?`<p class="account-form-error" role="alert">${escapeHtml(LIVE.error)} <button class="btn btn-ghost btn-sm" data-live-refresh>再読み込み</button></p>`:''}${body}</div>`;}
function viewLivePage(){
 const waitingPage=viewWaitingPage();if(waitingPage!==null)return waitingPage;
 const serendipityPage=viewSerendipity();if(serendipityPage!==null)return serendipityPage;
 const supportPage=viewSupportPage();if(supportPage!==null)return supportPage;
 const feedbackPage=viewFeedbackPage();if(feedbackPage!==null)return feedbackPage;
 const discoveryPage=viewDiscoveryPage();if(discoveryPage!==null)return discoveryPage;
 if(!['live','liveactivity','livecommunity','myactivity','notifications','following','saved','org','orgSignup','admin','manage','participants'].includes(current.view))return null;
 if(!ACCOUNT_SERVER)return liveShell('アプリを起動してください','<p>登録された募集を見るには、トビヨリを起動してアクセスしてください。</p><a class="btn btn-primary" href="http://localhost:4177/">アプリを開く</a>');
 if(!LIVE.loaded)return liveShell('読み込み中','<p role="status">募集・申込みを確認しています…</p>');
 if(current.view==='live'){
   const q=liveQuery.normalize('NFKC').toLowerCase();
   const activities=LIVE.catalog.activities.filter(a=>{const c=liveOrgById(a.communityId);return (!liveOnlyFollowed||LIVE.dashboard?.follows.includes(a.communityId))&&(!q||q.trim().split(/\s+/).every(word=>[a.title,a.genre,c?.name,c?.city,c?.university,...(c?.genres||[])].join(' ').normalize('NFKC').toLowerCase().includes(word)));});
   return liveShell('募集中の活動',`<form id="liveSearch" class="live-search"><label for="liveKeyword">活動名・地域・大学名・ジャンルで検索</label><div><input id="liveKeyword" value="${escapeHtml(liveQuery)}" placeholder="例：高崎、学習支援"><button class="btn btn-primary">検索</button></div>${accountUser?`<label class="live-follow-filter"><input type="checkbox" id="liveOnlyFollowed" ${liveOnlyFollowed?'checked':''}> フォロー中の団体の募集だけ表示</label>`:''}</form><p>${activities.length}件の募集</p><div class="act-grid">${activities.map(liveCard).join('')||'<div class="card live-card"><h3>募集中の活動はまだありません</h3><p>団体の確認・募集の審査が終わると、ここに表示されます。</p></div>'}</div><h2>コミュニティ</h2><div class="act-grid">${LIVE.catalog.communities.filter(c=>!q||q.trim().split(/\s+/).every(word=>[c.name,c.city,c.type,c.university,c.intro,...(c.genres||[])].join(' ').normalize('NFKC').toLowerCase().includes(word))).map(c=>`<article class="card live-card"><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.city)} ／ ${escapeHtml(c.type)}</p><button class="btn btn-secondary" data-nav="livecommunity" data-param="${c.id}">紹介・フォロー</button>${liveSaveButton(c)}</article>`).join('')||'<p>確認済みの団体が登録されると表示されます。</p>'}</div>`);
 }
 if(current.view==='livecommunity'){
   const c=liveOrgById(current.param);if(!c)return liveShell('コミュニティ','<p>現在、この団体は公開されていません。</p>');
   const following=LIVE.dashboard?.follows.includes(c.id);
   return liveShell(escapeHtml(c.name),`${liveBadge(c.status)}${supporterBadge(c)}<p>${escapeHtml(c.city)} ／ ${escapeHtml(c.type)} ${escapeHtml(c.university||'')}</p><div class="community-primary-actions"><button class="btn btn-primary" type="button" data-community-activities>参加できる活動を見る</button><span>活動ごとの参加条件を確認してから申し込めます。</span></div><p class="live-copy">${escapeHtml(c.intro)}</p><div class="community-save-actions">${liveSaveButton(c)}<button class="btn btn-secondary btn-sm" data-live-follow="${c.id}" data-follow="${!following}">${following?'フォローをやめる':'新着通知を受け取る（フォロー）'}</button></div>${communityHostedActivities(c)}${communityQuestionsSection(c.id)}<details class="community-more"><summary>コミュニティの詳しい情報</summary>${liveVerificationHTML(c)}${liveBuzzSummary(c)}${liveCommunityFacts(c)}${communityDiscoveryFacts(c)}${livePhotos(c)}${officialSourcePanel(c)}<p class="hint">情報確認日：${escapeHtml(liveDate(c.confirmedAt))} ／ 最終更新：${escapeHtml(liveDate(c.updatedAt))}</p></details>${liveSupportActions(c)}<details class="community-more"><summary>参加者の口コミ</summary>${liveReviewsSection(c.id,true)}</details>`);
 }
 if(current.view==='liveactivity'){
   const a=liveActivityById(current.param);if(!a)return liveShell('活動の詳細','<p>現在、この募集は公開されていません。申込み済みの方は「申込み・参加記録」を確認してください。</p>');
   const c=liveOrgById(a.communityId);
   const fields=isRecruitment(a)?{purpose:'募集の目的',tasks:'仕事内容',staff:'採用の窓口',requirements:'応募条件',fees:'応募にかかる費用',remuneration:'給与・賃金'}:{feeAmount:'参加費の金額（円）',activityCity:'会場の市町村',fees:'費用の補足',remuneration:'報酬・謝礼',transportFee:'交通費の補助',purpose:'活動の目的',tasks:'具体的な内容',staff:'責任者',requirements:'参加条件',belongings:'持ち物',risk:'危険性と対策',insurance:'保険',photoPolicy:'写真撮影',transport:'交通手段',prohibited:'禁止事項'};
   if(!isRecruitment(a))return liveShell(escapeHtml(a.title),`<div class="activity-badges">${liveBadge(a.status)} ${activityEntryBadge(a)}${a.changePending?'<span class="badge badge-warn">変更確認中・受付保留</span>':''}</div>${activitySummaryHTML(a,c)}${companyListingFacts(a)}${waitingEntry(a)}<h2 class="activity-section-title">活動の詳しい内容</h2>${activityDetailsHTML(a)}<section class="card live-card activity-questions" data-questions="${escapeHtml(a.id)}"><h3>主催者への質問</h3><p role="status">質問を読み込んでいます…</p></section>${liveSupportActions(c,a.id)}${liveReviewsSection(a.id)}`);
   return liveShell(escapeHtml(a.title),`${liveBadge(a.status)} ${companyKindBadge(a)} ${activityEntryBadge(a)}${a.changePending?'<span class="badge badge-warn">変更確認中・受付保留</span>':''}<p>${isRecruitment(a)?'募集期間：':''}${escapeHtml(liveDate(a.startsAt))} 〜 ${escapeHtml(liveDate(a.endsAt))}</p><p>${escapeHtml(c?.name||'登録団体')} ／ ${escapeHtml(c?.city||'')} ／ 募集 ${a.capacity}人</p><button class="btn btn-ghost btn-sm" data-nav="livecommunity" data-param="${a.communityId}">団体の紹介を見る</button>${c?liveSaveButton(c):''}${companyListingFacts(a)}<div class="live-details">${Object.entries(fields).filter(([k])=>filled(a[k])).map(([k,label])=>`<section class="card live-card"><h3>${label}</h3><p class="live-copy">${escapeHtml(String(a[k]))}</p></section>`).join('')}</div>${isRecruitment(a)?'':'<p class="hint">正確な集合場所と緊急連絡先は、参加承認後に申込み画面へ表示します。</p>'}<p><b>${HIGH_SCHOOL_LABELS[a.highSchoolParticipation]||HIGH_SCHOOL_LABELS.unknown}</b></p><p>大学生の対象学年：${escapeHtml(a.targetYears?.length?a.targetYears.join("・"):"学年不問")}</p>${waitingEntry(a)}${liveApplyControls(a)}${isRecruitment(a)?'':`<section class="card live-card activity-questions" data-questions="${escapeHtml(a.id)}"><h3>主催者への質問</h3><p role="status">質問を読み込んでいます…</p></section>`}${liveSupportActions(c,a.id)}${isRecruitment(a)?'':liveReviewsSection(a.id)}`);
 }
 if(current.view==='manage')return operatorHome();
 if(current.view==='participants')return operatorParticipants();
 if(current.view==='orgSignup')return liveAdminRegistration();
 if(current.view==='org')return liveOwnerPage();
 if(current.view==='myactivity')return liveShell('申込み・参加記録',liveRecordsHTML());
 if(current.view==='saved')return liveShell('保存したコミュニティ',liveSavedHTML());
 if(current.view==='following')return liveShell('フォロー中のコミュニティ',liveFollowsHTML());
 if(current.view==='notifications')return liveShell('お知らせ',liveNotificationsHTML());
 if(current.view==='admin')return liveReviewPage();
}
function liveField(name,label,value='',type='text',required=false){return `<div class="field"><label for="lf_${name}">${label}</label>${type==='textarea'?`<textarea id="lf_${name}" name="${name}" rows="3" maxlength="3000" ${required?'required':''}>${escapeHtml(value)}</textarea>`:`<input id="lf_${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required?'required':''} ${type==='number'?'min="1" max="500"':''}>`}</div>`;}
function liveAdminRegistration(cid){
 if(LIVE.dashboard?.role!=='ADMIN')return liveShell('団体の登録について','<div class="card live-card"><h2>団体の登録は、アプリの運営者が行います</h2><p>運営者が団体に活動内容を伺い、情報を確認して掲載します。利用者・団体向けの新規登録フォームはありません。</p><button class="btn btn-secondary" data-nav="live">掲載中の活動を見る</button></div>');
 const c=cid?LIVE.review?.communities.find(c=>c.id===cid):{};
 if(!c)return liveShell('団体情報','<p>団体情報を取得できませんでした。運営管理からもう一度開いてください。</p>');
 return liveShell(cid?'団体情報を編集':'コミュニティを登録',`<div class="live-register-intro"><span class="badge badge-neutral">運営者専用</span><p>団体に伺った内容をまとめて登録します。学生団体・サークル、大学・ゼミ、地域団体、企業・店舗にも対応しています。</p><ol class="live-register-steps"><li>情報を入力</li><li>確認待ちで保存</li><li>本人確認・掲載同意を確認して公開</li></ol></div>${liveCommunityForm(c)}`);
}
function liveSelect(name,label,value,options,required=false){const values=[...new Set([...options,...(value?[value]:[])])];return `<div class="field"><label for="lf_${name}">${label}</label><select id="lf_${name}" name="${name}" ${required?'required':''}><option value="">選択してください</option>${values.map(v=>`<option value="${escapeHtml(v)}" ${v===value?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></div>`;}
function liveCommunityForm(c={}){
 const info=c.adminInfo||{};c={...c,...(c.pendingChange||{})};
 return `<form id="liveCommunityForm" data-id="${c.id||''}" class="live-register-form">
 <section class="card live-card live-registration-required" aria-labelledby="registrationRequiredTitle"><h2 id="registrationRequiredTitle"><span class="registration-tag registration-tag-required">必須</span>まずは、この4項目</h2><p class="registration-description">この4項目だけで、確認待ちとして保存できます。</p><div class="live-form-grid">${liveField('name','団体名（必須）',c.name||'','text',true)}${liveSelect('type','団体の種類（必須）',c.type||'',['学生団体・サークル','大学・ゼミ','自治会','NPO・ボランティア団体','地域サークル','商店街','企業・店舗','その他'],true)}${liveSelect('city','主な活動市町村（必須）',c.city||'高崎市',GUNMA_MUNICIPALITIES,true)}</div>${liveField('intro','団体の紹介・普段の活動（必須）',c.intro||'','textarea',true)}<p class="hint">例：地域の子どもたちと一緒に、月2回の学習支援を行っています。</p><button type="button" class="btn btn-secondary" data-form-save>この内容で確認待ち保存</button><p class="hint">写真やSNSはあとから追加できます。保存だけでは公開されません。</p></section>
 <details class="live-registration-options" ${c.id?'open':''}><summary><span class="registration-tag registration-tag-optional">任意</span><span class="registration-option-title">追加情報を入力する<small>写真・SNS・活動の詳しい情報など。あとから追加・変更できます。</small></span></summary><div class="live-registration-option-body"><p class="registration-option-hint">ここから下はすべて任意です。わかる項目だけ入力してください。</p>
 <section class="card live-card"><h2>活動の詳しい情報 <small>公開する内容</small></h2>${liveField('university','大学・学校名（該当する場合）',c.university||'').replace('type="text"','type="text" list="liveUniversities"')}<datalist id="liveUniversities">${GUNMA_UNIVERSITIES.map(u=>`<option value="${escapeHtml(u)}"></option>`).join('')}</datalist><fieldset class="live-genres" data-genres="${escapeHtml(JSON.stringify(c.genres||[]))}">${communityGenreFields(c)}</fieldset><div class="live-form-grid">${liveField('schedule','普段の活動日時・頻度',c.schedule||'')}${liveField('audience','参加対象・学年',c.audience||'')}</div>${liveField('welcome','初参加の方への案内・受け入れ方針',c.welcome||'','textarea')}${liveField('transport','アクセス・利用できる交通手段',c.transport||'')}<p class="hint">ここには最寄り駅や大まかな地域を記載します。正確な集合場所は募集ごとに設定します。</p></section>
 ${communityDiscoveryFields(c)}${officialSourceSettings(c)}<section class="card live-card"><h2>写真・SNS <small>公開する内容</small></h2>${communityMediaFields(c).replace('この試作版では自分のアカウントのサンプル記録として保存されます。','登録した情報は確認後に団体紹介へ表示します。')}</section>
 <section class="card live-card live-admin-private"><h2>連絡先・確認メモ <small>運営だけに表示</small></h2><p>団体への確認や更新連絡に使います。利用者や団体の公開ページには表示しません。</p><div class="live-form-grid">${liveField('representative','代表者・連絡担当者の氏名',info.representative||'')}${liveField('email','連絡用メールアドレス',info.email||'','email')}${liveField('phone','連絡用電話番号',info.phone||'','tel')}</div>${liveField('source','情報の入手先・確認方法',info.source||'','textarea')}${liveField('notes','運営メモ・追加で確認すること',info.notes||'','textarea')}<p class="hint">本人確認書類の画像や番号は入力しません。</p></section>
 <section class="card live-card"><h2>協賛の紹介 <small>公開する内容</small></h2><label class="account-consent"><input type="checkbox" name="sponsorListed" ${c.sponsorListed?'checked':''}><span>協賛団体として紹介する（協賛・名称掲載の同意を確認済み）</span></label>${liveField('sponsorMessage','協賛の紹介文（300文字以内）',c.sponsorMessage||'')}<p class="hint">募集がなくてもホームに紹介します。協賛を確認状況やおすすめの点数には使いません。</p></section>
 </div></details>
 <section class="card live-card live-registration-consent" aria-labelledby="registrationConsentTitle"><h2 id="registrationConsentTitle"><span class="registration-tag registration-tag-review">公開前に確認</span>掲載の同意</h2><label class="account-consent"><input name="consentConfirmed" type="checkbox" ${info.consentConfirmed?'checked':''}><span>団体から、紹介文・写真・リンクを掲載する同意を得ています。</span></label><p class="hint">まだ確認できていなくても保存できます。公開までに、代表者の確認と掲載同意の確認が必要です。</p></section>
 <div class="card live-card live-register-submit"><p class="live-form-error" role="alert"></p><p>保存しただけでは公開されません。運営が確認してから公開します。公開中の団体の変更案は、今の紹介を表示したまま確認します。</p><div class="live-navigation"><button class="btn btn-primary" type="submit">確認待ちで保存する</button><button class="btn btn-ghost" type="button" data-nav="admin">運営管理に戻る</button></div></div></form>`;
}
function liveActivityForm(a){
 if(a.changePending)return '<div class="card live-card"><h2>変更案を確認中です</h2><p>審査結果をお待ちください。現在の参加者への案内は変更前の内容を保持しています。</p><button class="btn btn-secondary" data-nav="org">募集管理へ戻る</button></div>';
 const local=value=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 const company=discoverySector(liveOrgById(a.communityId)||{})==='company';
 const field=(key,label,type='textarea',example='')=>liveField(key,label,a[key]||'',type).replace('name="'+key+'"','name="'+key+'"'+(example?' placeholder="'+escapeHtml(example)+'"':''));
 return `<form id="liveActivityForm" class="card live-card activity-editor" data-id="${a.id}" data-published="${!!a.publishedAt}" data-updated="${escapeHtml(a.updatedAt||'')}">
 <p class="activity-form-intro">${a.publishedAt?'変更案は運営の確認後に反映します。公開前に必要な情報も入力してください。':'まずは募集名・開始日時・終了日時・募集人数を入力すると、下書き保存できます。詳しい内容はあとから追加できます。'}</p>
 ${a.publishedAt?'<p class="hint">変更案の送信後は新規受付を保留します。運営の確認後に参加者へ通知し、希望条件に合うか判定し直します。</p>':''}
 <section class="activity-form-basics" aria-labelledby="activityBasicsTitle"><h3 id="activityBasicsTitle">基本情報</h3>
 ${company?`<div class="field"><label for="lf_companyKind">募集の種類</label><select id="lf_companyKind" name="companyKind">${Object.entries(COMPANY_KINDS).map(([k,l])=>`<option value="${k}" ${(a.companyKind||'regional')===k?'selected':''}>${l}</option>`).join('')}</select></div>`:''}
 ${liveField('title','募集名（必須）',a.title,'text',true).replace('name="title"','name="title" placeholder="例：地域の企画づくりを学ぶ1日インターン"')}
 <div class="live-form-grid">${liveField('startsAt','開始日時（必須）',local(a.startsAt),'datetime-local',true)}${liveField('endsAt','終了日時（必須）',local(a.endsAt),'datetime-local',true)}${liveField('capacity','募集人数（必須）',String(a.capacity),'number',true)}${communityActivityGenreField(a)}</div></section>
 <details class="activity-form-section" data-activity-section="content"><summary><span>実施内容・費用 <small>公開前に入力</small></span><span class="activity-form-progress" data-form-progress></span></summary><div class="activity-form-body">
 ${field('purpose','募集の目的','textarea','例：地域の課題を知り、企画づくりを体験してもらいます')}${field('tasks','実際に行うこと','textarea','例：午前は業務説明、午後は企画ワークと社員からのフィードバック')}
 <div class="live-form-grid">${field('staff','担当者・責任者','text')}${field('requirements','応募・参加条件','textarea','例：大学生・学年不問。経験は問いません')}</div>
 ${companyListingFields(a)}
 <div class="live-form-grid">${field('fees','参加費の説明（無料の場合は「無料」）','text','例：無料。昼食代は各自負担')}${field('remuneration','報酬・謝礼（ない場合は「なし」）','text','例：なし')}</div>
 ${conditionActivityFields(a)}
 </div></details>
 <details class="activity-form-section" data-activity-section="safety"><summary><span>当日の案内・安全情報 <small>公開前に入力</small></span><span class="activity-form-progress" data-form-progress></span></summary><div class="activity-form-body">
 <p class="hint">参加者が準備できるように記入します。集合場所と緊急連絡先は、参加承認後だけ表示します。</p>
 <div class="live-form-grid">${field('location','正確な集合場所（承認後のみ表示）')}${field('emergency','当日の緊急連絡先（承認後のみ表示）')}${field('belongings','持ち物','text','例：筆記用具、飲み物')}${field('transport','会場への行き方','text','例：最寄り駅から徒歩10分')}</div>
 ${field('risk','気をつけること・対策')}${field('insurance','保険の加入状況')}${field('photoPolicy','写真撮影・掲載の方針')}${field('prohibited','禁止事項')}
 </div></details>
 <details class="activity-form-section" data-activity-section="optional"><summary><span>対象者・補足情報 <small>任意</small></span></summary><div class="activity-form-body">
 ${activityEntryFields(a)}${activityDiscoveryFields(a)}<label class="account-consent"><input name="beginner" type="checkbox" ${a.beginner?'checked':''}><span>初参加歓迎</span></label><label class="account-consent" data-help-field><input name="help" type="checkbox" ${a.help?'checked':''}><span>おたすけ募集（急な人手不足）</span></label>
 </div></details>
 <div class="activity-form-submit"><p class="live-form-error" role="alert"></p><button class="btn btn-primary" type="submit">${a.publishedAt?'変更案を送って審査を依頼':'下書きを保存'}</button><p class="hint">${a.publishedAt?'参加承認や取消は自動では行いません。':'下書きは公開されません。「公開前に入力」を整えてから、募集管理で「審査を依頼」を押してください。'}</p></div></form>`;
}

function liveOwnerPage(){
 const d=LIVE.dashboard;if(!d)return liveShell('団体の管理','<p>ログインしてください。</p>');
 if(current.param?.startsWith('edit-')){const a=d.activities.find(a=>a.id===current.param.slice(5));return liveShell('募集を編集する',a?liveActivityForm(a):'<p>募集が見つかりません。</p>');}
 if(current.param?.startsWith('community-'))return liveAdminRegistration(current.param.slice(10));
 return liveShell('募集管理',`<p>登録済みの団体の募集・参加者を管理できます。団体の新規登録と紹介内容の編集は、アプリの運営者が行います。</p>${d.role==='ADMIN'?'<button class="btn btn-primary" data-nav="admin" data-param="new">コミュニティを登録</button>':''}${d.communities.map(c=>`<section class="card live-card"><h2>${escapeHtml(c.name)}</h2>${liveBadge(c.status)}${c.paused?' <span class="badge">受付を休止中</span>':''}${liveBuzzSummary(c)}<p>情報確認：${escapeHtml(liveDate(c.confirmedAt))}</p>${c.reviewNote?`<p class="live-copy">運営から：${escapeHtml(c.reviewNote)}</p>`:''}${officialSourcePanel(c,true)}${communityRetentionHTML(c)}${communityUpdateChoicesHTML(c,d.role==='ADMIN')}<div class="live-navigation"><button class="btn btn-primary" data-live-new="${c.id}">募集を作る</button></div></section>`).join('')||'<p>管理できる団体はありません。団体の掲載はアプリの運営者が行います。</p>'}<h2>募集中・準備中の活動</h2>${d.activities.filter(a=>!['CLOSED','CANCELLED'].includes(a.status)).map(liveManagedActivity).join('')||'<p>活動はまだありません。</p>'}<details><summary>終了した募集（${d.activities.filter(a=>['CLOSED','CANCELLED'].includes(a.status)).length}件）</summary>${d.activities.filter(a=>['CLOSED','CANCELLED'].includes(a.status)).map(liveManagedActivity).join('')}</details><p><button class="btn btn-secondary" data-nav="participants">申込み・参加者の対応へ</button></p>`);
}
// Mirrors the server rules: drafts are edited directly; published activities only via a change request before they end.
function liveActivityEditable(a){const now=new Date().toISOString();return !a.changePending&&a.status!=='CANCELLED'&&(!a.publishedAt||(['PUBLISHED','CLOSED'].includes(a.status)&&!!a.endsAt&&a.endsAt>now));}
function liveActivityCancellable(a){return ['PUBLISHED','CLOSED'].includes(a.status)&&!!a.endsAt&&a.endsAt>new Date().toISOString();}
function liveManagedActivity(a){return `<article class="card live-card"><h3>${escapeHtml(a.title)}</h3>${liveBadge(a.status)}${a.changePending?'<span class="badge badge-warn">変更確認中・受付保留</span>':''}<p>${escapeHtml(liveDate(a.startsAt))}</p>${a.reviewNote?`<p>運営から：${escapeHtml(a.reviewNote)}</p>`:''}<div class="live-navigation">${liveActivityEditable(a)?`<button class="btn btn-secondary btn-sm" data-nav="org" data-param="edit-${a.id}">内容を編集</button>`:''}<button class="btn btn-secondary btn-sm" data-live-act="duplicate" data-id="${a.id}">前回の募集を複製</button>${a.status==='DRAFT'?`<button class="btn btn-primary btn-sm" data-live-act="submit" data-id="${a.id}">審査を依頼</button>`:''}${a.status==='PUBLISHED'?`<button class="btn btn-ghost btn-sm" data-live-act="close" data-id="${a.id}">募集を終了</button><button class="btn btn-secondary btn-sm" data-offer-compose="${a.id}">活動へのオファー</button>`:''}${liveActivityCancellable(a)?`<button class="btn btn-ghost btn-sm" data-activity-cancel="${a.id}">開催を中止</button>`:''}</div></article>`;}
function liveApplicationCard(p){return `<article class="card live-card"><h3>${escapeHtml(p.title)}</h3>${liveBadge(p.status)}${conditionReceiptHTML(p)}<p>${escapeHtml(liveDate(p.activity.startsAt))} 〜 ${escapeHtml(liveDate(p.activity.endsAt))}</p>${p.status==='EXPIRED'?'<p class="hint">開催終了までに承認されなかったため、受付終了になりました。</p>':''}${p.status==='APPROVED'&&p.activity.endsAt<=new Date().toISOString()?'<p class="hint">開催は終了しました。担当者による参加完了の確認を待っています。</p>':''}<p>${escapeHtml(p.kind)} ／ ${escapeHtml(p.owned?p.nickname:p.community_name)}</p><p class="live-copy">${escapeHtml(p.message)}</p>${p.minor?'<p class="hint">18歳未満・保護者同意の申告あり。団体は承認前に同意を確認してください。</p>':''}${p.activity.location?`<div class="live-private"><b>参加者への案内</b><p>集合場所：${escapeHtml(p.activity.location)}</p><p>緊急連絡先：${escapeHtml(p.activity.emergency)}</p></div>`:''}<div class="live-navigation">${p.owned||['APPROVED','DONE'].includes(p.status)?`<button class="btn btn-secondary btn-sm" data-live-room="${p.activity_id}">活動の連絡板</button>`:''}${p.owned&&p.status==='APPLIED'?`<button class="btn btn-primary btn-sm" data-live-app="approve" data-id="${p.id}" data-minor="${!!p.minor}">承認する</button><button class="btn btn-ghost btn-sm" data-live-app="decline" data-id="${p.id}">受入れ不可</button>`:''}${p.owned&&p.status==='APPROVED'&&p.activity.endsAt<=new Date().toISOString()?`<button class="btn btn-primary btn-sm" data-live-app="complete" data-id="${p.id}">活動完了を記録</button>`:''}${!p.owned&&p.status==='DONE'?(liveReviewControls(p.activity_id)+nextParticipationLink(p)):''}${!p.owned&&['APPLIED','APPROVED'].includes(p.status)?`<button class="btn btn-ghost btn-sm" data-live-app="cancel" data-id="${p.id}">申込みを取り消す</button>`:''}</div></article>`;}
let liveApprovalSearch={review:{query:'',status:''},participants:{query:'',status:''}};
function liveApprovalMatches(query,values){const text=values.filter(v=>v!=null).join(' ').normalize('NFKC').toLowerCase();return query.normalize('NFKC').toLowerCase().trim().split(/\s+/).every(word=>text.includes(word));}
function liveApprovalSearchForm(key,label,statuses){const state=liveApprovalSearch[key];return `<form class="live-search card live-card" data-approval-search="${key}"><label for="${key}ApprovalQuery">${label}</label><input id="${key}ApprovalQuery" name="query" type="search" value="${escapeHtml(state.query)}" placeholder="キーワードを入力（空白区切りで絞り込み）"><label for="${key}ApprovalStatus">状態</label><select id="${key}ApprovalStatus" name="status"><option value="">すべての状態</option>${Object.entries(statuses).map(([value,text])=>`<option value="${value}" ${state.status===value?'selected':''}>${text}</option>`).join('')}</select><p><button type="submit" class="btn btn-primary">検索</button> <button type="button" class="btn btn-ghost" data-approval-clear="${key}">クリア</button></p></form>`;}
function bindApprovalSearchUI(scope){
 scope.querySelectorAll('[data-approval-search]').forEach(form=>form.onsubmit=e=>{e.preventDefault();const data=new FormData(form);liveApprovalSearch[form.dataset.approvalSearch]={query:String(data.get('query')||'').trim(),status:String(data.get('status')||'')};render();});
 scope.querySelectorAll('[data-approval-clear]').forEach(button=>button.onclick=()=>{liveApprovalSearch[button.dataset.approvalClear]={query:'',status:''};render();});
}
function liveReviewPage(){
 if(LIVE.dashboard?.role!=='ADMIN')return liveShell('運営管理',LOCAL_APP?'<p>このアカウントには運営管理の権限がありません。管理者は、このパソコンで「運営管理者を設定.cmd」から指定してください。</p>':`<p>このアカウントには運営管理の権限がありません。運営権限が必要な場合は、アプリの管理者に次のアカウントIDを伝えてください。</p>${accountUser?`<p><code>${escapeHtml(accountUser.id)}</code></p>`:''}`);
 if(current.param==='new')return liveAdminRegistration();
 if(current.param?.startsWith('edit-'))return liveAdminRegistration(current.param.slice(5));
 const review=LIVE.review||{communities:[],activities:[]},state=liveApprovalSearch.review;
 const communityName=id=>review.communities.find(c=>c.id===id)?.name||'';
 const communities=review.communities.filter(c=>(!state.status||c.status===state.status)&&liveApprovalMatches(state.query,[c.name,c.city,c.type,c.intro]));
 const activities=review.activities.filter(a=>(!state.status||a.status===state.status)&&liveApprovalMatches(state.query,[a.title,communityName(a.communityId),COMPANY_KINDS[a.companyKind],a.companyRole,a.purpose,a.tasks]));
 const changes=(review.activityChanges||[]).filter(c=>(!state.status||state.status==='CHANGE_PENDING')&&liveApprovalMatches(state.query,[c.title,c.proposed?.title,communityName(c.proposed?.communityId),COMPANY_KINDS[c.proposed?.companyKind],c.proposed?.companyRole]));
 const count=communities.length+activities.length+changes.length,total=review.communities.length+review.activities.length+(review.activityChanges||[]).length;
 return liveShell('運営管理・公開前の確認',`<p>代表者の本人確認や活動内容の確認を、実際に完了してから承認してください。確認理由は記録されます。</p><div class="live-admin-banner"><div><h2>コミュニティの登録・管理</h2><p>運営者が情報を登録し、内容を確認してから掲載します。</p></div><button class="btn btn-primary" data-nav="admin" data-param="new">＋ コミュニティを登録</button></div><a class="btn btn-secondary" href="/operator.html#/reports">相談・通報・変更依頼を確認</a>${liveApprovalSearchForm('review','団体名・募集名・募集種類・職種・地域・内容で検索',{PENDING:'団体：確認中',VERIFIED:'団体：運営確認済み',SUSPENDED:'団体：掲載停止',REVIEW:'募集：審査中',CHANGE_PENDING:'活動変更：確認待ち'})}<p role="status">${count}件表示 / 全${total}件</p>${!count&&total?'<p>検索条件に一致する確認対象はありません。キーワードや状態を変更するか、クリアしてください。</p>':''}<h2>登録した団体（${communities.length}件 / 全${review.communities.length}件）</h2>${communities.map(c=>`<article class="card live-card"><h3>${escapeHtml(c.name)}</h3>${liveBadge(c.status)}<p>${escapeHtml(c.city)} ／ ${escapeHtml(c.type)}</p><p class="live-copy">${escapeHtml(c.intro)}</p>${liveBuzzSummary(c)}${livePhotos(c)}${officialSourcePanel(c,true)}${liveAdminNotes(c)}${pendingChangeHTML(c)}<div class="live-navigation"><button class="btn btn-secondary" data-nav="admin" data-param="edit-${c.id}">団体情報を編集</button><button class="btn btn-ghost" data-transfer-community="${c.id}">担当者を引き継ぐ</button><button class="btn btn-primary" data-live-review="community" data-id="${c.id}" data-action="approve">代表者を確認して承認</button><button class="btn btn-ghost" data-live-review="community" data-id="${c.id}" data-action="return">確認事項を返す</button><button class="btn btn-ghost" data-live-review="community" data-id="${c.id}" data-action="suspend">掲載を停止</button></div></article>`).join('')||'<p>表示対象の団体はありません。</p>'}${conditionReviewHTML(changes)}<h2>募集の審査（${activities.length}件 / 全${review.activities.length}件）</h2>${activities.map(a=>`<article class="card live-card"><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(communityName(a.communityId))}</p><p>${escapeHtml(liveDate(a.startsAt))} 〜 ${escapeHtml(liveDate(a.endsAt))} ／ ${a.capacity}人</p>${liveReviewDetails(a)}<div class="live-navigation"><button class="btn btn-primary" data-live-review="activity" data-id="${a.id}" data-action="approve">確認して公開</button><button class="btn btn-ghost" data-live-review="activity" data-id="${a.id}" data-action="return">差し戻す</button></div></article>`).join('')||'<p>審査待ちの募集はありません。</p>'}`);
}
// Everything the organizer entered, so operators can review job listings and conditions, not only safety fields.
function liveReviewDetails(a){
 const pick=(map,k)=>map[k]||k,yesNo={unknown:'確認中',yes:'あり',no:'なし'};
 const rows=[['募集の種類',isCareerListing(a)?pick(COMPANY_KINDS,a.companyKind):pick(COMMUNITY_ACTIVITY_TYPES,a.activityKind||'activity')],['ジャンル',a.genre],
  ['団体外からの参加',{unknown:'確認中・参加条件に記載',open:'団体に入っていなくても参加できる',members:'所属メンバーのみ'}[a.participationScope||'unknown']],
  ['開催頻度',{single:'単発',continuous:'継続'}[a.frequency]],['会場の市町村',a.activityCity],['申込期限',a.deadline&&liveDate(a.deadline)],
  ['対象学年',(a.targetYears||[]).join('・')],['高校生の参加',HIGH_SCHOOL_LABELS[a.highSchoolParticipation||'unknown']],
  ['目的',a.purpose],['作業',a.tasks],['責任者',a.staff],['条件',a.requirements],['持ち物',a.belongings],['危険性',a.risk],['保険',a.insurance],['撮影',a.photoPolicy],
  ['交通',a.transport],['駐車場',a.parking&&a.parking!=='unknown'?yesNo[a.parking]:''],['交通費',a.transportFee],['禁止事項',a.prohibited],['集合場所',a.location],['緊急連絡先',a.emergency],
  ['参加費',[a.fees,Number.isFinite(a.feeAmount)&&a.feeAmount>0?a.feeAmount.toLocaleString('ja-JP')+'円':''].filter(Boolean).join(' ／ ')],['報酬・謝礼・給与',a.remuneration],
  ['職種・体験する仕事',a.companyRole],['雇用形態',a.employmentType],['勤務地',a.workplace],['勤務時間',a.workSchedule],['選考の流れ',a.selectionProcess],
  ['初参加歓迎',a.beginner?'はい':''],['手伝い募集',a.help?'はい':'']];
 return rows.filter(([,v])=>v).map(([l,v])=>`<p class="live-copy"><b>${l}：</b>${escapeHtml(String(v))}</p>`).join('')+(a.applicationURL?`<p class="live-copy"><b>公式応募URL：</b><a href="${escapeHtml(a.applicationURL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.applicationURL)}</a></p>`:'');
}
function liveCommunityFacts(c){return '<div class="live-details">'+Object.entries({genres:'活動ジャンル',schedule:'普段の活動日時',audience:'参加対象',welcome:'初参加の方へ',transport:'アクセス'}).filter(([k])=>Array.isArray(c[k])?c[k].length:c[k]).map(([k,label])=>'<section class="card live-card"><h3>'+label+'</h3><p class="live-copy">'+escapeHtml(Array.isArray(c[k])?c[k].join('・'):c[k])+'</p></section>').join('')+'</div>';}
function liveAdminNotes(c){const info=c.adminInfo||{};return '<details class="live-admin-private"><summary>運営用の連絡先・確認メモ（非公開）</summary>'+Object.entries({representative:'代表者・連絡担当者',email:'メール',phone:'電話',source:'情報の入手先・確認方法',notes:'運営メモ'}).map(([k,l])=>'<p class="live-copy"><b>'+l+'：</b>'+escapeHtml(info[k]||'未入力')+'</p>').join('')+'<p>掲載同意：'+(info.consentConfirmed?'確認済み':'未確認')+'</p></details>';}
async function liveAction(route,data={},button){
 if(!accountUser){nav('login');return null;}if(button)button.disabled=true;
 try{const result=await accountAPI('live/'+route,'POST',data);await refreshLive(false);return result;}catch(e){toast(e.message);return null;}finally{if(button)button.disabled=false;}
}
function bindRegistrationShortcuts(scope){
 for(const form of scope.querySelectorAll('#liveCommunityForm,#liveActivityForm')){
  form.querySelectorAll('[data-form-save]').forEach(button=>button.onclick=()=>form.requestSubmit());
  form.addEventListener('invalid',e=>{let el=e.target.parentElement;while(el&&el!==form){if(el.tagName==='DETAILS')el.open=true;el=el.parentElement;}},true);
 }
}
function communityQuestionsSection(cid){return `<section class="card live-card community-questions" data-community-questions="${escapeHtml(cid)}"><h2>コミュニティへの匿名質問</h2><p role="status">質問を読み込んでいます…</p></section>`;}
function communityQuestionsHTML(q){
 const item=x=>`<article class="question-item"><p class="question-q"><b aria-hidden="true">Q</b>${escapeHtml(x.body)}</p>${x.answer?`<p class="question-a"><b aria-hidden="true">A</b>${escapeHtml(x.answer)}</p>`:''}</article>`;
 return `<h2>コミュニティへの匿名質問</h2><p class="hint">参加前の疑問を送れます。質問者の名前はコミュニティや他の利用者に表示しません。運営へのご意見とは別の掲示板です。</p>${q.answered.length?`<div class="question-list">${q.answered.map(item).join('')}</div>`:'<p>まだ公開された回答はありません。</p>'}${q.mine.length?`<h3>回答待ちのあなたの質問</h3><div class="question-list mine">${q.mine.map(item).join('')}</div>`:''}${q.canAsk?`<details class="question-ask" ${q.answered.length?'':'open'}><summary>匿名で質問する</summary><form data-community-question-form><div class="question-templates">${q.templates.map(t=>`<button type="button" class="btn btn-ghost btn-sm" data-community-question-template>${escapeHtml(t)}</button>`).join('')}</div><label>質問<textarea name="body" maxlength="300" rows="3" required placeholder="例：初参加でも大丈夫？"></textarea></label><p class="hint">名前や連絡先は書かないでください。担当者の回答後、質問と回答を公開します。</p><p class="live-form-error" role="alert"></p><button class="btn btn-primary btn-sm">質問を送る</button></form></details>`:accountUser?'':'<a class="btn btn-secondary btn-sm" href="#/login">ログインして質問する</a>'}`;
}
async function loadCommunityQuestions(box){
 const cid=box.dataset.communityQuestions,uid=accountUser?.id,epoch=accountEpoch;
 try{
  const q=await accountAPI('live/community-questions/'+encodeURIComponent(cid));
  if(uid!==accountUser?.id||epoch!==accountEpoch||!box.isConnected)return;
  box.innerHTML=communityQuestionsHTML(q);
  const form=box.querySelector('[data-community-question-form]');if(!form)return;
  form.querySelectorAll('[data-community-question-template]').forEach(button=>button.onclick=()=>{form.elements.body.value=button.textContent;form.elements.body.focus();});
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button.btn-primary');button.disabled=true;form.querySelector('[role="alert"]').textContent='';try{await accountAPI('live/community-questions/'+encodeURIComponent(cid),'POST',{body:form.elements.body.value});toast('匿名の質問を送りました。回答が届くとお知らせします。');await loadCommunityQuestions(box);}catch(error){form.querySelector('[role="alert"]').textContent=error.message;button.disabled=false;}};
 }catch(error){if(box.isConnected)box.innerHTML=`<h2>コミュニティへの匿名質問</h2><p role="alert">${escapeHtml(error.message)}</p>`;}
}
async function loadCommunityQuestionInbox(box){
 const uid=accountUser?.id,epoch=accountEpoch;
 try{
  const response=await accountAPI('live/community-questions');if(uid!==accountUser?.id||epoch!==accountEpoch||!box.isConnected)return;
  box.innerHTML=response.questions.length?`<p class="hint">回答した質問だけがコミュニティのページに公開されます。質問者の名前は表示されません。</p>${response.questions.map(q=>`<form class="card live-card question-inbox-item" data-community-question-answer="${escapeHtml(q.id)}"><small>${escapeHtml(q.communityName)}・${escapeHtml(liveDate(q.createdAt))}</small><p class="question-q"><b aria-hidden="true">Q</b>${escapeHtml(q.body)}</p><label>回答<textarea name="answer" maxlength="1000" rows="3" required></textarea></label><p class="live-form-error" role="alert"></p><div class="live-navigation"><button class="btn btn-primary btn-sm">回答して公開する</button><button type="button" class="btn btn-ghost btn-sm" data-community-question-hide>非表示にする</button></div></form>`).join('')}`:'<p>回答待ちの質問はありません。</p>';
  box.querySelectorAll('[data-community-question-answer]').forEach(form=>{
   const qid=form.dataset.communityQuestionAnswer;
   form.onsubmit=async event=>{event.preventDefault();try{await accountAPI('live/community-questions/'+encodeURIComponent(qid)+'/answer','POST',{answer:form.elements.answer.value});toast('回答を公開しました。');await loadCommunityQuestionInbox(box);}catch(error){form.querySelector('[role="alert"]').textContent=error.message;}};
   form.querySelector('[data-community-question-hide]').onclick=async()=>{if(!confirm('この質問を非表示にしますか？'))return;try{await accountAPI('live/community-questions/'+encodeURIComponent(qid)+'/hide','POST',{});await loadCommunityQuestionInbox(box);}catch(error){toast(error.message);}};
  });
 }catch(error){if(box.isConnected)box.innerHTML=`<p role="alert">${escapeHtml(error.message)}</p>`;}
}
function bindLiveUI(scope){
 bindApprovalSearchUI(scope);
 scope.querySelectorAll('[data-community-questions]').forEach(box=>void loadCommunityQuestions(box));
 const communityInbox=scope.querySelector('[data-community-question-inbox]');if(communityInbox&&accountUser)void loadCommunityQuestionInbox(communityInbox);
 bindRegistrationShortcuts(scope);
 bindSerendipityUI(scope);
 bindNearbyUI(scope);
 bindLiveReviewUI(scope);
 bindDiscoveryUI(scope);
 bindSupportUI(scope);
 bindOfficialSources(scope);
 bindConditionUI(scope);
 scope.querySelectorAll('[data-live-refresh]').forEach(b=>b.onclick=()=>refreshLive());
 const search=document.getElementById('liveSearch');if(search)search.onsubmit=e=>{e.preventDefault();liveQuery=document.getElementById('liveKeyword').value;liveOnlyFollowed=!!document.getElementById('liveOnlyFollowed')?.checked;render();};
 const cf=document.getElementById('liveCommunityForm');if(cf){cf.addEventListener('invalid',event=>{let parent=event.target.parentElement;while(parent&&parent!==cf){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}},true);const c=LIVE.review?.communities.find(x=>x.id===cf.dataset.id)||{},read=bindCommunityMediaEditor(cf,c);cf.onsubmit=async e=>{e.preventDefault();const err=cf.querySelector('.live-form-error'),button=cf.querySelector('button[type=submit]');err.textContent='';try{const form=new FormData(cf),data=Object.fromEntries(form);data.genres=preserveCatalogueGenres(c.pendingChange?.genres||c.genres||[],form.getAll('genres'),data.sector);data.activityDays=form.getAll('activityDays');data.campusYears=form.getAll('campusYears');data.campusAllYears=cf.elements.campusAllYears.checked;data.beginnerWelcome=cf.elements.beginnerWelcome.checked;data.sponsorListed=cf.elements.sponsorListed.checked;data.officialUpdatesEnabled=cf.elements.officialUpdatesEnabled.checked;data.adminInfo=Object.fromEntries(['representative','email','phone','source','notes'].map(k=>[k,form.get(k)||'']));data.adminInfo.consentConfirmed=cf.elements.consentConfirmed.checked;Object.assign(data,read());button.disabled=true;await accountAPI('live/communities'+(cf.dataset.id?'/'+cf.dataset.id:''),'POST',data);await refreshLive(false);nav('admin');toast('団体情報を保存しました。確認後に公開できます');}catch(e){err.textContent=e.message;button.disabled=false;}};}
 bindCommunityGenreFields(cf);
 bindCommunityWizard(cf);
 const af=document.getElementById('liveActivityForm');bindCompanyListingForm(af);if(af)af.onsubmit=async e=>{e.preventDefault();const err=af.querySelector('.live-form-error'),button=af.querySelector('button[type=submit]')||af.querySelector('button:not([type=button])');err.textContent='';try{const formData=new FormData(af),data=Object.fromEntries(formData);data.targetYears=formData.getAll('targetYears');data.baseUpdatedAt=af.dataset.updated;data.startsAt=new Date(data.startsAt).toISOString();data.endsAt=new Date(data.endsAt).toISOString();data.beginner=af.elements.beginner.checked;data.help=af.elements.help.checked;button.disabled=true;await accountAPI('live/activities/'+af.dataset.id+(af.dataset.published==='true'?'/propose-change':''),'POST',data);await refreshLive(false);nav('org');toast(af.dataset.published==='true'?'変更案を送信しました。運営の確認まで新規受付を保留します':'下書きを保存しました');}catch(e){err.textContent=e.message;button.disabled=false;}};
 scope.querySelectorAll('[data-live-confirm]').forEach(b=>b.onclick=async()=>{if(await liveAction('communities/'+b.dataset.liveConfirm+'/confirm',{},b)){render();toast('情報確認日を更新しました');}});
 scope.querySelectorAll('[data-live-pause]').forEach(b=>b.onclick=async()=>{if(await liveAction('communities/'+b.dataset.livePause+'/pause',{paused:b.dataset.paused==='true'},b))render();});
 scope.querySelectorAll('[data-live-new]').forEach(b=>b.onclick=async()=>{const r=await liveAction('activities',{communityId:b.dataset.liveNew},b);if(r)nav('org','edit-'+r.id);});
 scope.querySelectorAll('[data-live-act]').forEach(b=>b.onclick=async()=>{const r=await liveAction('activities/'+b.dataset.id+'/'+b.dataset.liveAct,{},b);if(r){if(r.id)nav('org','edit-'+r.id);else render();}});
 scope.querySelector('[data-community-activities]')?.addEventListener('click',()=>document.getElementById('communityActivities')?.scrollIntoView({behavior:'smooth',block:'start'}));
 scope.querySelectorAll('[data-live-follow]').forEach(b=>b.onclick=async()=>{if(await liveAction('follow/'+b.dataset.liveFollow,{follow:b.dataset.follow==='true'},b))render();});
 scope.querySelectorAll('[data-live-read]').forEach(b=>b.onclick=async()=>{if(await liveAction('notifications',{surface:OPERATOR_APP?'operator':'user'},b))render();});
 scope.querySelectorAll('[data-live-notice]').forEach(b=>b.onclick=async()=>{if(await liveAction('notifications',{id:b.dataset.noticeId},b)){const [view,param]=b.dataset.liveNotice.split('/');nav(view,param);}});
 scope.querySelectorAll('[data-live-record]').forEach(b=>b.onclick=()=>{liveRecordFilter=b.dataset.liveRecord;render();});
 scope.querySelectorAll('[data-live-apply]').forEach(b=>b.onclick=()=>openLiveApply(b.dataset.liveApply,b.dataset.kind));
 scope.querySelectorAll('[data-live-room]').forEach(b=>b.onclick=()=>openLiveRoom(b.dataset.liveRoom));
 scope.querySelectorAll('[data-live-app]').forEach(b=>b.onclick=()=>openLiveDecision(b));
 scope.querySelectorAll('[data-live-review]').forEach(b=>b.onclick=()=>openLiveReview(b));
}
function liveProfileIsMinor(){const birth=DB.profile.birthDate;if(typeof birth!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birth))return false;const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),cutoff=String(Number(today.slice(0,4))-18)+today.slice(4);return birth<=today&&birth>cutoff;}
function openLiveApply(aid,kind){
 if(!accountUser){nav('login',encodeURIComponent('liveactivity/'+aid));return;}
 const activity=liveActivityById(aid);if(!activity){toast('募集を確認できません。');return;}const knownMinor=liveProfileIsMinor();
 openModal(`<div class="modal-head"><h3>${escapeHtml(kind||'参加')}の申込み</h3><button class="modal-close" data-modal-close>✕</button></div><p>登録された団体へ、ニックネームと次の内容を送信します。</p>${applyStepsHTML()}<form id="liveApplyForm">${kind?'':`<fieldset class="apply-kind-choice"><legend>参加のしかた</legend>${Object.entries(APPLY_KINDS).map(([k,desc],i)=>`<label><input type="radio" name="kind" value="${k}" required ${activity.highSchoolParticipation==='visit'&&k==='見学'||i===1&&activity.highSchoolParticipation!=='visit'?'checked':''}><span><b>${k}</b><small>${desc}</small></span></label>`).join('')}${activity.highSchoolParticipation==='visit'?'<p class="hint">高校生は見学のみ申し込めます。</p>':''}</fieldset>`}<label>学年・参加区分<select name="year" required><option value="">選択してください</option>${discoveryOptions(['高校生',...STUDENT_YEARS,'地域住民・その他'],DB.profile.year||'')}</select></label><p>${HIGH_SCHOOL_LABELS[activity.highSchoolParticipation]||HIGH_SCHOOL_LABELS.unknown}</p>${liveField('message','自己紹介・質問（任意）','','textarea')}${activity.participationScope==='members'?'<label class="account-consent"><input name="memberConfirmed" type="checkbox" required><span>この団体に所属しています（所属メンバーのみの活動です）</span></label>':''}<label class="account-consent"><input name="minor" type="checkbox" ${knownMinor?'checked disabled':''}><span>18歳未満です${knownMinor?'（登録した生年月日から判定）':''}</span></label><label class="account-consent"><input name="guardian" type="checkbox" ${knownMinor?'required':''}><span>18歳未満の場合：保護者の同意を得ています。団体の確認手続きにも協力します。</span></label><p class="live-form-error" role="alert"></p><button class="btn btn-primary">申し込む</button></form>`,root=>{const f=root.querySelector('form');f.elements.minor.onchange=()=>{f.elements.guardian.required=knownMinor||f.elements.minor.checked;};f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{await accountAPI('live/apply/'+aid,'POST',{kind:kind||f.elements.kind.value,year:f.elements.year.value,message:f.elements.message.value,minor:f.elements.minor.checked,guardian:f.elements.guardian.checked,memberConfirmed:!!f.elements.memberConfirmed?.checked});await refreshLive(false);closeModal();nav('myactivity');toast('申込みを団体へ送りました');}catch(e){f.querySelector('.live-form-error').textContent=e.message;b.disabled=false;}};});
}
function liveVerificationHTML(c){return '<section class="live-verification"><h2>団体情報の確認状況</h2>'+(c.verification?'<p>'+escapeHtml(c.verification.checkedBy)+'が '+escapeHtml(liveDate(c.verification.checkedAt))+' に確認</p><div class="live-navigation">'+c.verification.items.map(item=>'<span class="badge badge-neutral">✓ '+escapeHtml(item)+'</span>').join('')+'</div>':'<p>詳しい確認項目は運営が整理中です。</p>')+'<p class="hint">確認状況は、参加人数・口コミ・ポイントとは別の情報です。確認済みでも、活動の安全を保証するものではありません。</p></section>';}
async function openLiveRoom(aid,draft=''){
 const epoch=accountEpoch;
 try{const room=await accountAPI('live/activity-messages/'+aid);if(epoch!==accountEpoch)return;
 openModal(`<div class="modal-head"><h3>活動の連絡板</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div><p><b>${escapeHtml(room.title)}</b></p><p class="hint">団体の窓口と、この活動の承認済み参加者が読む連絡板です。個人宛てには送れません。本名・電話番号・個人SNSは書かないでください。</p><button class="btn btn-ghost btn-sm" id="liveRoomRefresh">最新の投稿を読む</button><div class="live-message-list">${room.messages.map(m=>`<div class="live-message ${m.sender_id===accountUser.id?'mine':''}"><b>${escapeHtml(m.nickname)}${m.isStaff?'（担当者）':''}</b><p class="live-copy">${escapeHtml(m.body)}</p><small>${escapeHtml(liveDate(m.created_at))}</small></div>`).join('')||'<p>まだ投稿はありません。担当者への質問や、参加に必要な連絡を書けます。</p>'}</div>${room.canSend?`<form id="liveRoomForm">${liveField('body','活動の連絡内容',draft,'textarea',true)}<p class="live-form-error" role="alert"></p><button class="btn btn-primary">連絡板に投稿する</button></form>`:'<p>現在、新しい投稿は停止しています。過去の連絡は確認できます。</p>'}`,root=>{
 const f=root.querySelector('form');root.querySelector('#liveRoomRefresh').onclick=()=>openLiveRoom(aid,f?.elements.body.value||'');
 if(f)f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{await accountAPI('live/activity-messages/'+aid,'POST',{body:f.elements.body.value});await refreshLive(false);if(epoch===accountEpoch)await openLiveRoom(aid);}catch(e){f.querySelector('.live-form-error').textContent=e.message;b.disabled=false;}};
 });}catch(e){toast(e.message);}
}
function openLiveDecision(button){const action=button.dataset.liveApp;openModal(`<div class="modal-head"><h3>${escapeHtml(button.textContent)}</h3><button class="modal-close" data-modal-close>✕</button></div><p>申込み状況を更新し、相手にサービス内で通知します。</p><form id="liveDecisionForm">${action==='approve'&&button.dataset.minor==='true'?'<label class="account-consent"><input name="guardian" type="checkbox" required><span>保護者同意の手続きを確認しました。</span></label>':''}<button class="btn btn-primary">確定する</button></form>`,root=>{root.querySelector('form').onsubmit=async e=>{e.preventDefault();if(await liveAction('applications/'+button.dataset.id+'/'+action,{guardianChecked:!!e.target.elements.guardian?.checked},e.target.querySelector('button'))){closeModal();render();}};});}
function openLiveReview(button){openModal(`<div class="modal-head"><h3>${escapeHtml(button.textContent)}</h3><button class="modal-close" data-modal-close>✕</button></div><form id="liveReviewForm">${liveField('note','確認方法・内容、または理由（団体にも通知）','','textarea',true)}${button.dataset.liveReview==='community'&&button.dataset.action==='approve'?'<label class="account-consent"><input name="identity" type="checkbox" required><span>代表者の本人確認と、団体の活動実態・目的を確認し、禁止する勧誘が目的ではないことを確かめました。</span></label><label class="account-consent"><input name="consent" type="checkbox" required><span>団体から紹介文・写真・リンクの掲載同意を得ていることを確認しました。</span></label>':''}<button class="btn btn-primary">記録して確定する</button></form>`,root=>{root.querySelector('form').onsubmit=async e=>{e.preventDefault();if(await liveAction('review/'+button.dataset.id+'/'+button.dataset.action,{type:button.dataset.liveReview,note:e.target.elements.note.value,identityChecked:!!e.target.elements.identity?.checked,consentChecked:!!e.target.elements.consent?.checked},e.target.querySelector('button'))){closeModal();render();}};});}
setInterval(()=>{if(ACCOUNT_SERVER&&accountReady&&document.visibilityState==='visible')void refreshLive(false,{background:true});},60000);

function operatorParticipants(){
  const all=(LIVE.dashboard?.applications||[]).filter(p=>p.owned),state=liveApprovalSearch.participants;
  const applications=all.filter(p=>(!state.status||p.status===state.status)&&liveApprovalMatches(state.query,[p.title,p.nickname,p.community_name,p.kind,p.message]));
  return liveShell('参加者対応',`<p>自分が担当する活動への申込み・連絡・参加完了を確認します。</p><button class="btn btn-ghost btn-sm" data-live-refresh>最新の状況に更新</button>${liveApprovalSearchForm('participants','募集名・団体名・ニックネーム・申込み内容で検索',Object.fromEntries(['APPLIED','APPROVED','DECLINED','CANCELLED','EXPIRED','DONE'].map(s=>[s,liveStatus[s]])))}<p role="status">${applications.length}件表示 / 全${all.length}件</p>${applications.length?applications.map(liveApplicationCard).join(''):all.length?'<p>検索条件に一致する申込みはありません。キーワードや状態を変更するか、クリアしてください。</p>':'<div class="card live-card"><h2>申込みはまだありません</h2><p>募集を公開すると、この画面で届いた申込みを確認できます。</p><button class="btn btn-secondary" data-nav="org">募集管理へ</button></div>'}`);
}
