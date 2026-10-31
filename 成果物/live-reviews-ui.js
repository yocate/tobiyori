/* Shared participation totals and reviews come exclusively from the server. */
function liveBuzzSummary(c){
 const b={participants:0,reviews:0,saves:0,views:0,points:0,...c.buzz};
 return `<div class="live-buzz-summary" data-community-buzz="${escapeHtml(c.id)}"><div><span>にぎわいポイント</span><strong>${b.points.toLocaleString()} <small>pt</small></strong></div><dl><div><dt>のべ参加</dt><dd>${b.participants.toLocaleString()}人</dd></div><div><dt>口コミ</dt><dd>${b.reviews.toLocaleString()}件</dd></div><div><dt>保存</dt><dd>${b.saves.toLocaleString()}人</dd></div><div><dt>閲覧（30日）</dt><dd>${b.views.toLocaleString()}回</dd></div></dl></div>`;
}
function liveBuzzHTML(){
 const communities=[...(LIVE.catalog?.communities||[])].sort((a,b)=>(b.buzz?.points||0)-(a.buzz?.points||0)||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id)).slice(0,3);
 return `<section class="section container live-buzz"><div class="section-head"><div><div class="eyebrow">Community Voices</div><h2>にぎわっているコミュニティ</h2><p>参加・口コミ・保存・閲覧から、みんなが集まる場所を見つけよう。</p></div></div><details class="live-buzz-help"><summary>にぎわいポイントの計算方法</summary><p>参加完了1人・1回＝30pt、口コミ1件＝10pt、現在保存している1人＝5pt、詳細ページの閲覧1回＝1pt。実際の参加を一番重くして、団体ごとに合計します。</p><p>参加と口コミはこれまでの合計、保存は現在の人数です。保存は1人1団体につき1件。解除すると5ptを取り消すため、保存の繰り返しでは増えません。口コミは参加完了後に同じ活動で1人1件まで。星の数で点数は変わらず、編集では増えず、削除すると10ptを取り消します。</p><p>閲覧はログインした人が団体・活動の詳細を開いたとき、日本時間で同じ団体につき1人1日1回。検索結果に表示されただけでは加算しません。今日を含む直近30日分を集計し、期間を過ぎると取り消します。団体の担当者と運営者の保存・閲覧は加点しません。保存・閲覧した人の名前は公開しません。</p><p>ポイントが多い順に最大6団体を紹介します。順位番号は付けません。団体の規模や活動期間で差が出るため、安全性や運営の質の評価には使いません。サンプルの参加・口コミ・保存・閲覧は集計に含みません。協賛の有無も点数には影響しません。</p></details>${!LIVE.loaded?'<p role="status">にぎわいを集計しています…</p>':LIVE.error?'<p role="alert">集計を読み込めませんでした。</p><button class="btn btn-secondary" data-live-refresh>もう一度読み込む</button>':`<div class="act-grid">${communities.map(c=>`<article class="card live-card"><span class="badge badge-neutral">${escapeHtml(c.city)}</span><h3>${escapeHtml(c.name)}</h3>${liveBuzzSummary(c)}<p class="hint">確認状況は団体の紹介で確認できます。</p><button class="btn btn-secondary btn-sm" data-nav="livecommunity" data-param="${c.id}">参加できる活動を見る →</button>${liveSaveButton(c)}</article>`).join('')||'<div class="card live-card"><h3>これから、参加の記録が集まります</h3><p>確認を終えた団体が掲載されると、参加・口コミ・保存・閲覧の集計をここに表示します。</p><button class="btn btn-secondary" data-nav="live">コミュニティを探す</button></div>'}</div>`}</section>`;
}
function liveOwnReview(aid){return (LIVE.dashboard?.reviews||[]).find(r=>r.activityId===aid);}
function liveReviewControls(aid){
 if(OPERATOR_APP||!liveOwnApplications().some(p=>p.activity_id===aid&&p.status==='DONE'))return '';
 const r=liveOwnReview(aid);
 return `<button class="btn btn-secondary btn-sm" data-live-review-edit="${escapeHtml(aid)}">${r?'口コミを編集':'口コミを書く'}</button>${r?`<button class="btn btn-ghost btn-sm" data-live-review-delete="${escapeHtml(aid)}">口コミを削除</button>`:''}`;
}
function liveReviewsSection(id,community=false){return `<section class="live-reviews"><h2>参加者の口コミ</h2><p class="hint">参加完了を確認できた方の感想です。満足度は安全性の評価ではありません。</p>${community?'':`<div class="live-navigation">${liveReviewControls(id)}</div>`}<div data-live-review-feed="${escapeHtml(id)}" data-review-community="${community}" aria-live="polite"><p role="status">口コミを読み込んでいます…</p></div></section>`;}
function liveReviewCard(r){const own=liveOwnReview(r.activityId)?.id===r.id;return `<article class="card live-card"><div class="review-card-head"><strong>${escapeHtml(r.author)}</strong><span class="review-stars" aria-label="満足度5点中${r.rating}点">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div><p class="hint">${escapeHtml(r.activityTitle)} ／ 参加完了を確認済み</p><p class="live-copy">${escapeHtml(r.text)}</p><small class="faint">${escapeHtml(liveDate(r.createdAt))}${r.updatedAt!==r.createdAt?'・編集済み':''}</small>${own?'':`<div class="live-navigation"><button class="btn btn-ghost btn-sm" data-live-review-report="${escapeHtml(r.id)}" data-review-activity="${escapeHtml(r.activityId)}" data-review-community="${escapeHtml(r.communityId)}">この口コミを通報</button></div>`}</article>`;}
async function loadLiveReviews(feed,offset=0){
 const epoch=accountEpoch,resource=feed.dataset.reviewCommunity==='true'?'community-reviews':'reviews';
 feed.innerHTML='<p role="status">口コミを読み込んでいます…</p>';
 try{
   const result=await accountAPI('live/'+resource+'/'+encodeURIComponent(feed.dataset.liveReviewFeed)+'?offset='+offset);
   if(!feed.isConnected||epoch!==accountEpoch)return;
   feed.innerHTML=`<p>${result.total}件の口コミ${result.total?` ／ ${offset+1}〜${offset+result.reviews.length}件`:''}</p>${result.reviews.map(liveReviewCard).join('')||'<p>まだ口コミはありません。参加後の感想をお待ちしています。</p>'}<div class="live-navigation">${offset?`<button class="btn btn-ghost btn-sm" data-review-offset="${Math.max(0,offset-20)}">前の口コミ</button>`:''}${result.nextOffset!==null?`<button class="btn btn-secondary btn-sm" data-review-offset="${result.nextOffset}">次の口コミ</button>`:''}</div>`;
   feed.querySelectorAll('[data-review-offset]').forEach(b=>b.onclick=()=>loadLiveReviews(feed,Number(b.dataset.reviewOffset)));
   feed.querySelectorAll('[data-live-review-report]').forEach(b=>b.onclick=()=>openLiveReviewReport(b.dataset.liveReviewReport,b.dataset.reviewActivity,b.dataset.reviewCommunity));
 }catch(e){if(!feed.isConnected||epoch!==accountEpoch)return;feed.innerHTML=`<p role="alert">${escapeHtml(e.message)}</p><button class="btn btn-ghost btn-sm" data-review-retry>もう一度読み込む</button>`;feed.querySelector('[data-review-retry]').onclick=()=>loadLiveReviews(feed,offset);}
}
function openLiveReviewEditor(aid){
 const p=liveOwnApplications().find(p=>p.activity_id===aid&&p.status==='DONE');
 if(!p){toast('担当者による参加完了の確認後に口コミを投稿できます。');return;}
 const r=liveOwnReview(aid),epoch=accountEpoch;
 openModal(`<div class="modal-head"><h3>${r?'口コミを編集':'口コミを書く'}</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div><p>${escapeHtml(p.title)}</p><form id="liveReviewForm"><div data-review-fields><div class="field"><label for="liveReviewRating">満足度（5段階）</label><select id="liveReviewRating" name="rating" required><option value="">選んでください</option>${[5,4,3,2,1].map(n=>`<option value="${n}" ${r?.rating===n?'selected':''}>${'★'.repeat(n)} ${['','不満','やや不満','ふつう','満足','とても満足'][n]}</option>`).join('')}</select></div><div class="field"><label for="liveReviewText">感想（10〜1,000文字）</label><textarea id="liveReviewText" name="text" minlength="10" maxlength="1000" rows="5" required>${escapeHtml(r?.text||'')}</textarea></div><label class="review-anonymous"><input type="checkbox" name="anonymous" ${r?.anonymous===false?'':'checked'}> 名前を出さずに投稿する</label><p class="hint">名前を表示する場合はアカウントのニックネーム「${escapeHtml(accountUser?.nickname||'参加者')}」が公開されます。本名・連絡先・集合場所は書かないでください。</p></div><div class="card live-card live-review-preview" hidden><h4>公開前の確認</h4><p>表示名：<strong data-review-preview-name></strong></p><p>満足度：<span class="review-stars" data-review-preview-rating></span></p><p class="live-copy" data-review-preview-text></p><button class="btn btn-ghost btn-sm" type="button" data-review-back>入力に戻る</button></div><p class="live-form-error" role="alert"></p><div class="live-navigation"><button class="btn btn-primary" type="submit">${r?'変更を確認':'投稿内容を確認'}</button><button class="btn btn-ghost" type="button" data-modal-close>キャンセル</button></div></form>`,root=>{
   const form=root.querySelector('form'),fields=form.querySelector('[data-review-fields]'),preview=form.querySelector('.live-review-preview'),button=form.querySelector('[type=submit]');let confirmed=false;
   form.querySelector('[data-review-back]').onclick=()=>{confirmed=false;fields.hidden=false;preview.hidden=true;button.textContent=r?'変更を確認':'投稿内容を確認';};
   form.onsubmit=async e=>{e.preventDefault();if(epoch!==accountEpoch)return;
     if(!confirmed){preview.querySelector('[data-review-preview-name]').textContent=form.elements.anonymous.checked?'匿名の参加者':accountUser?.nickname||'参加者';preview.querySelector('[data-review-preview-rating]').textContent='★'.repeat(Number(form.elements.rating.value))+'☆'.repeat(5-Number(form.elements.rating.value));preview.querySelector('[data-review-preview-text]').textContent=form.elements.text.value;fields.hidden=true;preview.hidden=false;confirmed=true;button.textContent=r?'変更を保存':'口コミを公開する';return;}
     button.disabled=true;try{await accountAPI('live/reviews/'+encodeURIComponent(aid),r?'PUT':'POST',{rating:Number(form.elements.rating.value),text:form.elements.text.value,anonymous:form.elements.anonymous.checked});await refreshLive(false);if(epoch!==accountEpoch)return;closeModal();render();toast(r?'口コミを更新しました。':'口コミを公開しました。');}catch(e){if(epoch===accountEpoch){form.querySelector('.live-form-error').textContent=e.message;button.disabled=false;}};
   };
 });
}
function deleteLiveReview(aid){
 if(!liveOwnReview(aid))return;const epoch=accountEpoch;
 openModal('<div class="modal-head"><h3>口コミを削除しますか？</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div><p>公開した口コミを削除し、あなたの参加ポイントから10pt、団体のにぎわいポイントから3ptを取り消します。参加完了の記録・ポイントは残ります。</p><p class="live-form-error" role="alert"></p><div class="live-navigation"><button class="btn btn-ghost" data-modal-close>キャンセル</button><button class="btn btn-primary" id="liveReviewDelete">削除する</button></div>',root=>{
   const b=root.querySelector('#liveReviewDelete');b.onclick=async()=>{if(epoch!==accountEpoch)return;b.disabled=true;try{await accountAPI('live/reviews/'+encodeURIComponent(aid),'DELETE');await refreshLive(false);if(epoch!==accountEpoch)return;closeModal();render();toast('口コミを削除し、集計を更新しました。');}catch(e){if(epoch===accountEpoch){root.querySelector('.live-form-error').textContent=e.message;b.disabled=false;}}};
 });
}
function openLiveReviewReport(reviewId,aid,cid){
 if(!accountUser){toast('口コミの通報にはログインしてください。');nav('login');return;}
 openModal(`<div class="modal-head"><h3>口コミを通報</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div><p>不適切だと思った理由を運営へ伝えてください。内容は一般公開されません。</p><form id="liveReviewReportForm"><div class="field"><label for="liveReviewReportBody">通報理由</label><textarea id="liveReviewReportBody" name="body" minlength="10" maxlength="3000" rows="4" required></textarea></div><p class="live-form-error" role="alert"></p><div class="live-navigation"><button class="btn btn-primary" type="submit">運営に通報する</button><button class="btn btn-ghost" type="button" data-modal-close>キャンセル</button></div></form>`,root=>{
   const form=root.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;try{await accountAPI('live/reports','POST',{communityId:cid,activityId:aid,reviewId,kind:'通報',body:form.elements.body.value});closeModal();toast('口コミの通報を受け付けました。');}catch(e){form.querySelector('.live-form-error').textContent=e.message;b.disabled=false;}};
 });
}
function bindLiveReviewUI(scope){
 scope.querySelectorAll('[data-live-review-edit]').forEach(b=>b.onclick=()=>openLiveReviewEditor(b.dataset.liveReviewEdit));
 scope.querySelectorAll('[data-live-review-delete]').forEach(b=>b.onclick=()=>deleteLiveReview(b.dataset.liveReviewDelete));
 scope.querySelectorAll('[data-live-review-feed]').forEach(feed=>loadLiveReviews(feed));
}
