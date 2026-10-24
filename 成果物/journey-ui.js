let dailyVisitRequest=null,dailyVisitUser='',dailyVisitNextCheck=0,dailyVisitError='',dailyVisitNotice='';
function showDailyVisitNotice(result){const key=accountUser?.id+':'+result?.dailyVisit?.day;if(result?.dailyVisit?.awarded&&key!==dailyVisitNotice){dailyVisitNotice=key;toast('今日のよりみちで +1pt！');}}
async function recordDailyVisit(announce=true){
 if(!ACCOUNT_SERVER||OPERATOR_APP||!accountReady||!accountUser||document.visibilityState==='hidden')return null;
 const uid=accountUser.id,epoch=accountEpoch;
 if(dailyVisitUser!==uid){dailyVisitUser=uid;dailyVisitNextCheck=0;dailyVisitRequest=null;dailyVisitError='';}
 if(dailyVisitRequest)return dailyVisitRequest;
 if(performance.now()<dailyVisitNextCheck)return null;
 const request=(async()=>{try{
  const started=performance.now(),result=await accountAPI('live/daily-visit','POST',{});
  if(accountUser?.id!==uid||accountEpoch!==epoch)return null;
  dailyVisitNextCheck=started+Math.max(0,result.dailyVisit.nextCheckInMs);dailyVisitError='';
  if(LIVE.dashboard){Object.assign(LIVE.dashboard,result);updateDailyVisitDisplay();}
  if(announce)showDailyVisitNotice(result);
  return result;
 }catch(e){if(accountUser?.id===uid&&accountEpoch===epoch){dailyVisitNextCheck=performance.now()+3000;dailyVisitError='訪問ポイントを確認できませんでした。通信を確認して再読み込みしてください。';updateDailyVisitDisplay();}return null;}
 })();
 dailyVisitRequest=request;try{return await request;}finally{if(dailyVisitRequest===request)dailyVisitRequest=null;}
}
function dailyVisitStatusHTML(){if(!ACCOUNT_SERVER)return '';const d=LIVE.dashboard?.dailyVisit;return `<p class="daily-visit-status ${d?.claimedToday?'daily-visit-earned':''}" role="status">${d?.claimedToday?'✦ 今日の訪問ポイント +1pt 獲得済み':dailyVisitError?escapeHtml(dailyVisitError):'訪問ポイントを確認しています…'}</p>`;}
function updateDailyVisitDisplay(){
 const panel=document.querySelector('.points-personal');if(panel){const opened=!!panel.querySelector('.journey-details[open]');panel.outerHTML=pointsCardHTML();if(opened)document.querySelector('.points-personal .journey-details')?.setAttribute('open','');}
 const badge=document.querySelector('.profile-journey-badge,.journey-badge-preview');if(badge)badge.outerHTML=profileJourneyBadgeHTML();
}
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void recordDailyVisit();});
if(typeof window!=='undefined')window.addEventListener('hashchange',()=>{void recordDailyVisit();});
function journeyChapter(points){return 1+Math.floor(Math.max(0,points-150)/100);}
function journeyNextChapter(points){return 150+journeyChapter(points)*100;}
function journeyMedalSVG(chapter){return `<svg viewBox="0 0 76 86" aria-hidden="true"><path d="m19 52-5 30 20-8 10 9 9-30" fill="#C7F238" stroke="#075333" stroke-width="2"/><circle cx="38" cy="35" r="31" fill="#FFF0B6" stroke="#D7A847" stroke-width="3"/><circle cx="38" cy="35" r="24" fill="#075333"/><path d="M27 49V29a11 11 0 0 1 22 0v20Z" fill="#C7F238"/><circle cx="43" cy="40" r="3" fill="#FAA11F"/><path d="m58 13 2-6 2 6 6 2-6 2-2 6-2-6-6-2" fill="#EFAC2D"/><text x="38" y="66" text-anchor="middle" font-size="14" font-weight="800" fill="#075333">${chapter}</text></svg>`;}
function profileJourneyBadgeHTML(){const badge=LIVE.dashboard?.journeyBadges?.[0];return badge?`<div class="profile-journey-badge" aria-label="旅のバッジ 第${badge.chapter}章 獲得済み">${journeyMedalSVG(badge.chapter)}<span><small>とびらの旅</small><b>第${badge.chapter}章のバッジ</b></span></div>`:'<p class="journey-badge-preview">扉をひらくと、ここに旅のバッジが増えるよ。</p>';}
function journeyBadgeCollectionHTML(){const badges=LIVE.dashboard?.journeyBadges||[];return `<section class="journey-badge-collection"><h3>集めた旅のバッジ</h3>${badges.length?`<div class="journey-medal-grid">${badges.map(b=>`<figure>${journeyMedalSVG(b.chapter)}<figcaption>第${b.chapter}章<small>${escapeHtml(new Date(b.earnedAt).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'}))} 獲得</small></figcaption></figure>`).join('')}</div>`:'<p>150ptで最初の扉をひらこう。第1章のバッジをプロフィールに飾れます。</p>'}</section>`;}
function displayedParticipationBadges(){const selected=new Map();for(const b of LIVE.dashboard?.participationBadges||[]){const key=b.kind+':'+b.group;if(!selected.has(key)||selected.get(key).threshold<b.threshold)selected.set(key,b);}return [...selected.values()].sort((a,b)=>b.earnedAt.localeCompare(a.earnedAt)||b.threshold-a.threshold);}
function participationBadgeIcon(b){return `<span class="participation-badge-icon" aria-hidden="true">${{genre:'★',continuity:'❋',variety:'✦'}[b.kind]||'✦'}</span>`;}
function profileParticipationBadgesHTML(){const badges=displayedParticipationBadges().slice(0,3);return badges.length?`<div class="profile-participation-badges" aria-label="参加の積み重ねで獲得したバッジ">${badges.map(b=>`<span class="participation-earned-badge" title="${escapeHtml(b.description)}">${participationBadgeIcon(b)}${escapeHtml(b.title)}</span>`).join('')}</div>`:'';}
function participationBadgeCollectionHTML(){const d=LIVE.dashboard||{},s=d.participationSummary||{genres:[],genreCount:0,longestMonths:0},badges=d.participationBadges||[];return `<section class="participation-badge-collection"><h3>わたしの参加の足あと</h3><p>好きな分野を深めるのも、新しい分野へ寄り道するのも、あなたらしい旅。</p><div class="participation-facts"><span><b>${s.genreCount}</b> ジャンルに参加</span><span>同じ団体で最長 <b>${s.longestMonths}</b> か月連続</span></div>${s.genres.length?`<ul class="participation-genre-progress">${s.genres.slice(0,8).map(g=>`<li><b>${escapeHtml(g.genre)}</b><span>${g.count}回参加${g.count<5?` · マスターまであと${5-g.count}回`:g.count<10?` · 達人まであと${10-g.count}回`:g.count<20?` · グランドマスターまであと${20-g.count}回`:''}</span></li>`).join('')}</ul>`:''}${badges.length?`<div class="participation-earned-grid">${[...badges].sort((a,b)=>b.threshold-a.threshold).map(b=>`<article>${participationBadgeIcon(b)}<div><b>${escapeHtml(b.title)}</b><p>${escapeHtml(b.description)}</p></div></article>`).join('')}</div>`:'<p class="hint">参加の記録が増えると、ここにバッジが集まります。</p>'}<details><summary>バッジの獲得条件</summary><ul><li>同じジャンル：5回でマスター、10回で達人、20回でグランドマスター。</li><li>同じ団体に毎月1回以上：3・6・12か月連続で継続のバッジ。参加しない月があると、新しい連続記録を数えます。</li><li>異なるジャンル：3・5・8分野で、発見のバッジ。</li></ul><p class="hint">担当者が完了を確認した参加を1活動1回で数えます。過去の記録も含め、獲得済みのバッジは残ります。性格や能力の診断ではなく、参加の積み重ねを表しています。自分のペースで楽しんでください。</p></details></section>`;}
/* Region-neutral participation journey and guided community registration. */
function journeyGlyph(color,size){
 return `<svg width="${size}" height="${size}" viewBox="95 63 343 337" aria-hidden="true"><image href="tobiyori-logo-transparent.png" width="1345" height="937"/></svg>`;
}
function doorJourneyHTML(rawPoints){
 const points=Math.max(0,Number(rawPoints)||0),next=nextLevelFor(points),index=Math.max(0,LEVELS.findLastIndex(l=>points>=l.min));
 const captions=['どこへでも、一歩から。','少し寄り道してみよう。','知らなかった世界に出会う。','一緒に過ごす時間が増える。','次の扉は、どこにある？'];
 return `<figure class="door-journey"><div class="door-journey-heading"><span>とびらの旅</span><span>自分のペースで、少しずつ。</span></div><svg viewBox="0 0 560 170" role="img" aria-label="とびらの旅。現在${escapeHtml(LEVELS[index].name)}、${points}ポイント"><path d="M48 137 Q106 97 162 133 T278 130 T390 127 T512 117" stroke="#DCE7CF" stroke-width="16" stroke-linecap="round" fill="none"/><path d="M48 137 Q106 97 162 133 T278 130 T390 127 T512 117" stroke="#729372" stroke-width="2" stroke-dasharray="3 9" fill="none"/>${LEVELS.map((l,i)=>{const x=24+i*112,done=i<=index;return `<g transform="translate(${x} ${i===index?22:38})"><path d="M0 82V30a28 28 0 0 1 56 0v52Z" fill="${done?'#F4FFD6':'#F3F6EF'}" stroke="${done?'#0C573B':'#B0BFA9'}" stroke-width="4"/><path d="M5 80V31a23 23 0 0 1 46 0v49Z" fill="${done?'#C7F238':'#E0E9D7'}"/>${i===index?'<circle cx="22" cy="38" r="5" fill="white"/><circle cx="35" cy="38" r="5" fill="white"/><circle cx="23" cy="39" r="2.5" fill="#075333"/><circle cx="36" cy="39" r="2.5" fill="#075333"/>':''}<circle cx="43" cy="58" r="4" fill="${done?'#EE961D':'#A6B49B'}"/><text x="28" y="111" text-anchor="middle" font-size="12" font-weight="700" fill="#315440">${l.min}pt</text>${i===index?'<path d="M24 -8l4 -6 4 6" fill="none" stroke="#EB9419" stroke-width="3"/>':''}</g>`;}).join('')}<circle cx="533" cy="23" r="10" fill="#FFDDA3"/></svg><figcaption><b>${captions[index]}</b><span>${next?`次の「${escapeHtml(next.name)}」まで ${next.min-points}pt`:`旅の第${journeyChapter(points)}章。次の章まで ${journeyNextChapter(points)-points}pt`}</span></figcaption><ol class="door-journey-stages">${LEVELS.map((l,i)=>`<li ${i===index?'aria-current="step"':''} class="${i<=index?'reached':''}"><span>${i+1}</span>${escapeHtml(l.name)}</li>`).join('')}</ol></figure>`;
}

function bindCommunityWizard(form){
 if(!form||form.dataset.guided||form.querySelector('.live-registration-required'))return;form.dataset.guided='true';form.noValidate=true;
 const originals=[...form.children],titles=['基本情報','活動・参加条件','写真・公式リンク','確認・保存'];
 const base=originals.find(n=>n.querySelector('[name="name"]'));
 const intro=form.querySelector('[name="intro"]')?.closest('.field');if(base&&intro)base.append(intro);
 const panels=titles.map((title,i)=>{const node=document.createElement('section');node.className='community-wizard-panel';node.dataset.step=String(i);node.id='community-step-'+i;form.append(node);return node;});
 for(const node of originals){
  if(node.classList.contains('live-draft-tools'))continue;
  const i=node===base?0:node.classList.contains('live-register-submit')||node.classList.contains('live-admin-private')?3:node.querySelector('[name="officialUpdatesEnabled"]')||node.querySelector('input[type="file"]')?2:1;
  panels[i].append(node);
 }
 // Photo editor has file inputs; preserve all original fields and their handlers.
 const nav=document.createElement('nav');nav.className='community-wizard-nav';nav.setAttribute('aria-label','団体登録の手順');nav.innerHTML=titles.map((t,i)=>`<button type="button" data-step-go="${i}" aria-controls="community-step-${i}"><span>${i+1}</span>${t}</button>`).join('');form.prepend(nav);
 const progress=document.createElement('p');progress.className='hint community-wizard-progress';progress.setAttribute('role','status');nav.after(progress);
 const summary=document.createElement('section');summary.className='card live-card community-save-summary';panels[3].prepend(summary);
 const footer=document.createElement('div');footer.className='community-wizard-footer';footer.innerHTML='<button type="button" class="btn btn-ghost" data-step-back>前へ</button><span data-step-label></span><button type="button" class="btn btn-primary" data-step-next>次へ</button>';form.append(footer);
 let step=0;
 function update(){
  const count=['name','type','city','intro'].filter(k=>form.elements[k]?.value.trim()).length;progress.textContent=`必須項目 ${count}/4 入力済み。途中でも保存できます。`;
  summary.innerHTML=`<h2>保存する内容を確認</h2><dl>${[['name','団体名'],['type','種類'],['city','地域'],['intro','紹介文']].map(([k,l])=>`<div><dt>${l}</dt><dd>${escapeHtml(form.elements[k]?.value||'未入力')}</dd></div>`).join('')}</dl><p class="hint">保存後も確認が終わるまで公開されません。連絡先・確認メモは運営だけに表示します。</p>`;
 }
 function show(n,focus=true){step=Math.max(0,Math.min(3,n));panels.forEach((p,i)=>p.hidden=i!==step);nav.querySelectorAll('button').forEach((b,i)=>{if(i===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});footer.querySelector('[data-step-back]').disabled=step===0;footer.querySelector('[data-step-next]').hidden=step===3;footer.querySelector('[data-step-label]').textContent=`${step+1} / 4`;update();if(focus){const target=panels[step].querySelector('h2');if(target){target.tabIndex=-1;target.focus({preventScroll:true});}nav.scrollIntoView({block:'start',behavior:'instant'});}}
 function invalid(root){return [...root.querySelectorAll('input,select,textarea')].find(el=>!el.checkValidity());}
 function report(el){const p=el.closest('.community-wizard-panel');if(p)show(Number(p.dataset.step));let parent=el.parentElement;while(parent&&parent!==form){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}el.reportValidity();el.focus();}
 nav.querySelectorAll('button').forEach(b=>b.onclick=()=>show(Number(b.dataset.stepGo)));
 footer.querySelector('[data-step-back]').onclick=()=>show(step-1);
 footer.querySelector('[data-step-next]').onclick=()=>{const el=invalid(panels[step]);if(el)report(el);else show(step+1);};
 form.addEventListener('input',update);form.addEventListener('draft-restored',()=>{update();show(0);});
 const save=form.onsubmit;form.onsubmit=async e=>{e.preventDefault();const el=invalid(form);if(el){report(el);return;}if(step!==3){show(3);return;}return save?.(e);};show(0,false);
}

function communityUpdateChoicesHTML(c,admin){return `<div class="community-update-choices" aria-label="団体情報の更新"><button type="button" class="community-update-choice" data-live-confirm="${escapeHtml(c.id)}"><b>✓ 変更なし</b><span>今の情報を確認して、確認日だけ更新</span></button><button type="button" class="community-update-choice" ${admin?`data-nav="admin" data-param="edit-${escapeHtml(c.id)}"`:`data-change-request="${escapeHtml(c.id)}"`}><b>✎ 変更あり</b><span>${admin?'必要な項目だけ編集して確認へ':'変わったところだけ運営に伝える'}</span></button><button type="button" class="community-update-choice" data-live-pause="${escapeHtml(c.id)}" data-paused="${!c.paused}"><b>${c.paused?'↗ 受付を再開':'Ⅱ しばらく休止'}</b><span>${c.paused?'募集を再び受け付ける':'新しい受付を止めて、記録は残す'}</span></button></div>`;}
