/* Shared participation totals and reviews come exclusively from the server. */
function liveBuzzSummary(c){
 const b=c.buzz||{participants:0,reviews:0,points:0};
 return `<div class="live-buzz-summary"><div><span>にぎわいポイント</span><strong>${b.points.toLocaleString()} <small>pt</small></strong></div><dl><div><dt>のべ参加</dt><dd>${b.participants.toLocaleString()}人</dd></div><div><dt>口コミ</dt><dd>${b.reviews.toLocaleString()}件</dd></div></dl></div>`;
}
function liveBuzzHTML(){
 const communities=[...(LIVE.catalog?.communities||[])].sort((a,b)=>(b.buzz?.points||0)-(a.buzz?.points||0)||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id)).slice(0,6);
 return `<section class="section container live-buzz"><div class="section-head"><div><div class="eyebrow">Community Voices</div><h2>みんなの参加・声が集まるコミュニティ</h2><p>参加した人の記録と感想から、気になる活動を見つけよう。</p></div></div><details class="live-buzz-help"><summary>にぎわいポイントの計算方法</summary><p>担当者が確認した参加完了1人・1回＝1pt、口コミ1件＝3pt。全利用者の記録を団体ごとに合計します。同じ活動には1人1件まで投稿でき、星の数による加点の差はありません。編集では増えず、削除すると3ptを取り消します。</p><p>ポイントが多い順に最大6団体を紹介します。順位番号は付けません。団体の規模や活動期間で差が出るため、安全性や運営の質の評価には使いません。サンプルの参加・口コミは集計に含みません。</p></details>${!LIVE.loaded?'<p role="status">参加と口コミを集計しています…</p>':LIVE.error?'<p role="alert">集計を読み込めませんでした。</p><button class="btn btn-secondary" data-live-refresh>もう一度読み込む</button>':`<div class="act-grid">${communities.map(c=>`<article class="card live-card"><span class="badge badge-neutral">${escapeHtml(c.city)}</span><h3>${escapeHtml(c.name)}</h3>${liveBuzzSummary(c)}<p class="hint">確認状況は団体の紹介で確認できます。</p><button class="btn btn-secondary btn-sm" data-nav="livecommunity" data-param="${c.id}">紹介・口コミを見る →</button></article>`).join('')||'<div class="card live-card"><h3>これから、参加の記録が集まります</h3><p>確認を終えた団体が掲載されると、参加完了・口コミの合計をここに表示します。</p><button class="btn btn-secondary" data-nav="live">コミュニティを探す</button></div>'}</div>`}</section>`;
}
function liveOwnReview(aid){return (LIVE.dashboard?.reviews||[]).find(r=>r.activityId===aid);}
function liveReviewControls(aid){
 if(OPERATOR_APP||!liveOwnApplications().some(p=>p.activity_id===aid&&p.status==='DONE'))return '';
 const r=liveOwnReview(aid);
 return `<button class="btn btn-secondary btn-sm" data-live-review-edit="${escapeHtml(aid)}">${r?'口コミを編集':'口コミを書く'}</button>${r?`<button class="btn btn-ghost btn-sm" data-live-review-delete="${escapeHtml(aid)}">口コミを削除</button>`:''}`;
}
function liveReviewsSection(id,community=false){return `<section class="live-reviews"><h2>参加者の口コミ</h2><p class="hint">参加完了を確認できた方の感想です。満足度は安全性の評価ではありません。</p>${community?'':`<div class="live-navigation">${liveReviewControls(id)}</div>`}<div data-live-review-feed="${escapeHtml(id)}" data-review-community="${community}" aria-live="polite"><p role="status">口コミを読み込んでいます…</p></div></section>`;}
function liveReviewCard(r){return `<article class="card live-card"><div class="review-card-head"><strong>匿名の参加者</strong><span class="review-stars" aria-label="満足度5点中${r.rating}点">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div><p class="hint">${escapeHtml(r.activityTitle)} ／ 参加完了を確認済み</p><p class="live-copy">${escapeHtml(r.text)}</p><small class="faint">${escapeHtml(liveDate(r.createdAt))}${r.updatedAt!==r.createdAt?'・編集済み':''}</small></article>`;}
async function loadLiveReviews(feed,offset=0){
 const epoch=accountEpoch,resource=feed.dataset.reviewCommunity==='true'?'community-reviews':'reviews';
 feed.innerHTML='<p role="status">口コミを読み込んでいます…</p>';
 try{
   const result=await accountAPI('live/'+resource+'/'+encodeURIComponent(feed.dataset.liveReviewFeed)+'?offset='+offset);
   if(!feed.isConnected||epoch!==accountEpoch)return;
   feed.innerHTML=`<p>${result.total}件の口コミ${result.total?` ／ ${offset+1}〜${offset+result.reviews.length}件`:''}</p>${result.reviews.map(liveReviewCard).join('')||'<p>まだ口コミはありません。参加後の感想をお待ちしています。</p>'}<div class="live-navigation">${offset?`<button class="btn btn-ghost btn-sm" data-review-offset="${Math.max(0,offset-20)}">前の口コミ</button>`:''}${result.nextOffset!==null?`<button class="btn btn-secondary btn-sm" data-review-offset="${result.nextOffset}">次の口コミ</button>`:''}</div>`;
   feed.querySelectorAll('[data-review-offset]').forEach(b=>b.onclick=()=>loadLiveReviews(feed,Number(b.dataset.reviewOffset)));
 }catch(e){if(!feed.isConnected||epoch!==accountEpoch)return;feed.innerHTML=`<p role="alert">${escapeHtml(e.message)}</p><button class="btn btn-ghost btn-sm" data-review-retry>もう一度読み込む</button>`;feed.querySelector('[data-review-retry]').onclick=()=>loadLiveReviews(feed,offset);}
}
function openLiveReviewEditor(aid){
 const p=liveOwnApplications().find(p=>p.activity_id===aid&&p.status==='DONE');
 if(!p){toast('担当者による参加完了の確認後に口コミを投稿できます。');return;}
 const r=liveOwnReview(aid),epoch=accountEpoch;
 openModal(`<div class="modal-head"><h3>${r?'口コミを編集':'参加した感想を書く'}</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div><p>${escapeHtml(p.title)}</p><form id="liveReviewForm"><div class="field"><label for="liveReviewRating">活動の満足度</label><select id="liveReviewRating" name="rating" required><option value="">選んでください</option>${[5,4,3,2,1].map(n=>`<option value="${n}" ${r?.rating===n?'selected':''}>${'★'.repeat(n)} ${['','不満','やや不満','ふつう','満足','とても満足'][n]}</option>`).join('')}</select></div><div class="field"><label for="liveReviewText">感想（10〜1,000文字）</label><textarea id="liveReviewText" name="text" minlength="10" maxlength="1000" rows="5" required>${escapeHtml(r?.text||'')}</textarea></div><p class="hint">名前を出さず「匿名の参加者」として公開します。運営は参加確認・相談対応のために投稿者を確認できます。本名・連絡先・正確な集合場所などの個人情報は書かないでください。</p><p class="hint">あなたの参加ポイントに10pt、団体のにぎわいポイントに3pt。星の数に関係なく同じ点数です。編集でポイントは増えません。安全上の問題を星評価だけで伝えないでください。</p><p class="live-form-error" role="alert"></p><div class="live-navigation"><button class="btn btn-primary" type="submit">${r?'変更を保存':'口コミを公開する'}</button><button class="btn btn-ghost" type="button" data-modal-close>キャンセル</button></div></form>`,root=>{
   const form=root.querySelector('form');form.onsubmit=async e=>{e.preventDefault();if(epoch!==accountEpoch)return;const b=form.querySelector('[type=submit]');b.disabled=true;try{await accountAPI('live/reviews/'+encodeURIComponent(aid),'POST',{rating:Number(form.elements.rating.value),text:form.elements.text.value,anonymous:true});await refreshLive(false);if(epoch!==accountEpoch)return;closeModal();render();toast(r?'口コミを更新しました。ポイントは変わりません。':'口コミを公開しました。あなたに10pt、団体に3ptを反映しました。');}catch(e){if(epoch===accountEpoch){form.querySelector('.live-form-error').textContent=e.message;b.disabled=false;}}};
 });
}
function deleteLiveReview(aid){
 if(!liveOwnReview(aid))return;const epoch=accountEpoch;
 openModal('<div class="modal-head"><h3>口コミを削除しますか？</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div><p>公開した口コミを削除し、あなたの参加ポイントから10pt、団体のにぎわいポイントから3ptを取り消します。参加完了の記録・ポイントは残ります。</p><p class="live-form-error" role="alert"></p><div class="live-navigation"><button class="btn btn-ghost" data-modal-close>キャンセル</button><button class="btn btn-primary" id="liveReviewDelete">削除する</button></div>',root=>{
   const b=root.querySelector('#liveReviewDelete');b.onclick=async()=>{if(epoch!==accountEpoch)return;b.disabled=true;try{await accountAPI('live/reviews/'+encodeURIComponent(aid)+'/delete','POST',{});await refreshLive(false);if(epoch!==accountEpoch)return;closeModal();render();toast('口コミを削除し、集計を更新しました。');}catch(e){if(epoch===accountEpoch){root.querySelector('.live-form-error').textContent=e.message;b.disabled=false;}}};
 });
}
function bindLiveReviewUI(scope){
 scope.querySelectorAll('[data-live-review-edit]').forEach(b=>b.onclick=()=>openLiveReviewEditor(b.dataset.liveReviewEdit));
 scope.querySelectorAll('[data-live-review-delete]').forEach(b=>b.onclick=()=>deleteLiveReview(b.dataset.liveReviewDelete));
 scope.querySelectorAll('[data-live-review-feed]').forEach(feed=>loadLiveReviews(feed));
}
