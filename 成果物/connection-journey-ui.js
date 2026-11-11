/* Connection journey: discover, join, return. Embedded in gunma-community-map.html. */
function connectionJourneyHTML(){
  return `<section class="section container connection-journey" aria-labelledby="connection-journey-title">
    <div class="section-head"><div><div class="eyebrow">トビヨリで、つながりが育つ</div><h2 id="connection-journey-title">見つけて、参加して、その先へ。</h2><p>気になった活動との出会いを、一度きりで終わらせないために。</p></div></div>
    <ol class="connection-steps">
      <li><span class="connection-step-number">01</span><h3>まだ知らない「好き」に出会う</h3><p>条件を決めきれなくても大丈夫。よりみち発見で、普段は探さない活動ものぞいてみよう。</p><button class="btn btn-secondary btn-sm" data-nav="serendipity">よりみち発見へ</button></li>
      <li><span class="connection-step-number">02</span><h3>初めての一歩を、仲間と</h3><p>気になる活動のラウンジで、参加を考えている人とあいさつ。申込みの前に、ひと息つける場所です。</p><button class="btn btn-secondary btn-sm" data-nav="waiting">ラウンジを見る</button></li>
      <li><span class="connection-step-number">03</span><h3>「また行こう」につなげる</h3><p>参加記録から、同じ団体の次の活動へ。フォローして、これからの募集も見つけられます。</p><button class="btn btn-secondary btn-sm" data-nav="myactivity">参加記録を見る</button></li>
    </ol>
  </section>`;
}

function connectionReturns(now=Date.now()){
  if(OPERATOR_APP||!accountUser||!LIVE.loaded||LIVE.error||!LIVE.dashboard)return [];
  const communities=new Map((LIVE.catalog?.communities||[]).map(c=>[c.id,c]));
  const applications=liveOwnApplications();
  const alreadyJoined=new Set(applications.filter(p=>['APPLIED','APPROVED','DONE'].includes(p.status)).map(p=>p.activity_id));
  const completed=applications.filter(p=>p.status==='DONE'&&communities.has(p.activity?.communityId))
    .slice().sort((a,b)=>(Date.parse(b.activity.endsAt)||Date.parse(b.created_at)||0)-(Date.parse(a.activity.endsAt)||Date.parse(a.created_at)||0)||String(a.id).localeCompare(String(b.id)));
  const seen=new Set();
  return completed.filter(p=>{const id=p.activity.communityId;if(seen.has(id))return false;seen.add(id);return true;}).slice(0,3).map(p=>{
    const community=communities.get(p.activity.communityId);
    const next=(LIVE.catalog?.activities||[]).filter(a=>a.communityId===community.id&&a.status==='PUBLISHED'&&!a.changePending&&!isRecruitment(a)&&Date.parse(a.startsAt)>now&&Date.parse(a.deadline||a.startsAt)>now&&!alreadyJoined.has(a.id))
      .slice().sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||String(a.id).localeCompare(String(b.id)))[0]||null;
    return {community,previous:p,next,followed:(LIVE.dashboard.follows||[]).includes(community.id)};
  });
}

function connectionContinueHTML(inRecords=false){
  const returns=connectionReturns();
  if(!returns.length)return '';
  const cards=returns.map(({community,previous,next,followed})=>`<article class="card connection-return-card">
    <p class="connection-return-label">参加したコミュニティ</p><h3>${escapeHtml(community.name)}</h3>
    <p class="connection-previous">前回：${escapeHtml(previous.activity.title||previous.title||'参加した活動')}</p>
    <div class="connection-next">${next?`<span class="connection-return-label">次の活動</span><h4>${escapeHtml(next.title)}</h4><p>${escapeHtml(liveDate(next.startsAt))}</p><button class="btn btn-primary btn-sm" data-nav="liveactivity" data-param="${escapeHtml(next.id)}">次の活動を見てみる</button>`:'<h4>次の募集を待つあいだも</h4><p>現在、参加できる次の活動はありません。団体のページやフォローから、新しい募集を確認できます。</p>'}</div>
    <div class="connection-return-actions"><button class="btn btn-secondary btn-sm" data-nav="livecommunity" data-param="${escapeHtml(community.id)}">団体を見る</button>${followed?'<span class="connection-followed">フォロー中</span>':`<button class="btn btn-secondary btn-sm" data-live-follow="${escapeHtml(community.id)}" data-follow="true">フォローする</button>`}</div>
  </article>`).join('');
  return `<section class="${inRecords?'connection-continue':'section container connection-continue'}" aria-labelledby="connection-continue-title"><div class="section-head"><div><div class="eyebrow">参加のあとも、つながる</div><h2 id="connection-continue-title">この前の、つづき。</h2><p>一度参加した場所には、次のきっかけが待っているかもしれません。</p></div>${inRecords?'':'<button class="btn btn-ghost btn-sm" data-nav="myactivity">参加記録をすべて見る</button>'}</div><div class="connection-return-grid">${cards}</div></section>`;
}
