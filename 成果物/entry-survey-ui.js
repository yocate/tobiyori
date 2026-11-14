/* Entry survey: a few quick questions on the home screen, then a suggested door. Embedded in gunma-community-map.html. */
/* 質問文・選択肢・案内先は仮案。内容を決めたら ENTRY_SURVEY だけを書き換える。 */
const ENTRY_SURVEY={
 questions:[
  {id:'who',title:'あなたについて教えてください',options:[['student','大学生・専門学生'],['highschool','高校生'],['worker','社会人'],['other','その他']]},
  {id:'want',title:'どんなことをしてみたいですか？',options:[['hobby','好きなことに、仲間と打ち込みたい'],['local','まちや人の役に立ちたい'],['career','仕事や将来につながる体験をしたい'],['unsure','まだ決まっていない']]},
  {id:'step',title:'最初の一歩は、どんな形がいいですか？',options:[['alone','一人でも参加しやすいもの'],['friends','誰かと話してから決めたい'],['nearby','近くで、近いうちに行けるもの'],['look','まずは見てみるだけ']]}
 ],
 doors:{
  campus:{view:'campus',label:'大学・サークル',button:'キャンパスをのぞく',reason:'サークルや学生団体から、好きなことを一緒に楽しめる仲間を探せます。'},
  highschool:{view:'campus',label:'大学・サークル',button:'キャンパスをのぞく',reason:'大学のサークルや学生団体の活動を見て、進学後の過ごし方を想像できます。'},
  regional:{view:'regional',label:'地域コミュニティ',button:'まちの活動を見る',reason:'お祭りやボランティアなど、まちの人と一緒にできる活動を探せます。'},
  company:{view:'company',label:'企業',button:'企業の活動を見る',reason:'地域の企業が開く体験や募集から、仕事や将来につながる活動を探せます。'},
  serendipity:{view:'serendipity',label:'よりみち発見',button:'よりみち発見をひらく',reason:'条件を決めなくても、近くで開催中・近日開催の活動を見つけられます。'}
 },
 steps:{
  alone:{view:'list',button:'活動の一覧を見る',tip:'活動ページの「参加条件」で、初めての人や一人での参加を歓迎しているか確かめられます。'},
  friends:{view:'waiting',button:'よりみちラウンジへ',tip:'よりみちラウンジでは、同じ活動を考えている人とあいさつできます。入室しても申込みにはなりません。'},
  nearby:{view:'serendipity',button:'近くの活動をさがす',tip:'よりみち発見で現在地か市を選ぶと、近くの活動を探せます。'},
  look:{view:'list',button:'活動の一覧を見る',tip:'保存やフォローは申込みになりません。気になる団体を保存して、あとで見返せます。'}
 },
 // 回答から案内する扉を決める。
 pick(a){
  if(a.want==='hobby')return a.who==='highschool'?'highschool':'campus';
  if(a.want==='local')return 'regional';
  if(a.want==='career')return 'company';
  return 'serendipity';
 }
};
const ENTRY_SURVEY_KEY='tobiyori-entry-survey';
let entrySurveyState={answers:{},open:false};
function entrySurveyLoad(){try{const saved=JSON.parse(localStorage.getItem(ENTRY_SURVEY_KEY)||'null');if(saved&&typeof saved==='object')entrySurveyState.answers=saved;}catch{}}
function entrySurveySave(){try{localStorage.setItem(ENTRY_SURVEY_KEY,JSON.stringify(entrySurveyState.answers));}catch{}}
entrySurveyLoad();
function entrySurveyDone(){return ENTRY_SURVEY.questions.every(q=>entrySurveyState.answers[q.id]);}
function entrySurveyBody(){
 const qs=ENTRY_SURVEY.questions,answers=entrySurveyState.answers;
 if(entrySurveyDone()){
  const door=ENTRY_SURVEY.doors[ENTRY_SURVEY.pick(answers)],step=ENTRY_SURVEY.steps[answers.step],label=(q,v)=>(q.options.find(o=>o[0]===v)||[])[1]||'';
  const second=step&&step.view!==door.view?`<button class="btn btn-secondary" data-nav="${step.view}">${escapeHtml(step.button)}</button>`:'';
  return `<div class="entry-survey-result"><p class="entry-survey-eyebrow">あなたへのおすすめの入口</p><h2 id="entry-survey-title">${escapeHtml(door.label)}</h2><p>${escapeHtml(door.reason)}</p>${step?`<p class="entry-survey-tip">${escapeHtml(step.tip)}</p>`:''}
  <div class="entry-survey-actions"><button class="btn btn-primary" data-nav="${door.view}">${escapeHtml(door.button)}</button>${second}</div>
  <p class="entry-survey-answers">回答：${qs.map(q=>escapeHtml(label(q,answers[q.id]))).join('／')}　<button type="button" class="entry-survey-link" data-survey-reset>答え直す</button></p></div>`;
 }
 if(!entrySurveyState.open)return `<div class="entry-survey-start"><div><p class="entry-survey-eyebrow">どこから見ればいいか迷ったら</p><h2 id="entry-survey-title">3つの質問で、あなたに合う入口を案内します</h2><p>1分ほどで終わります。答えはこの端末だけに保存され、送信されません。</p></div><button type="button" class="btn btn-primary" data-survey-start>質問に答える</button></div>`;
 const index=qs.findIndex(q=>!answers[q.id]),q=qs[index];
 return `<div class="entry-survey-question"><p class="entry-survey-eyebrow">質問 ${index+1} / ${qs.length}</p><div class="entry-survey-progress" aria-hidden="true"><span style="width:${Math.round(index/qs.length*100)}%"></span></div><h2 id="entry-survey-title">${escapeHtml(q.title)}</h2>
 <div class="entry-survey-options">${q.options.map(([v,l])=>`<button type="button" class="entry-survey-option" data-survey-answer="${escapeHtml(q.id)}" data-value="${escapeHtml(v)}">${escapeHtml(l)}</button>`).join('')}</div>
 ${index>0?'<button type="button" class="entry-survey-link" data-survey-back>ひとつ前に戻る</button>':''}</div>`;
}
function entrySurveyHTML(){
 if(typeof OPERATOR_APP!=='undefined'&&OPERATOR_APP)return '';
 return `<section class="container entry-survey" aria-labelledby="entry-survey-title"><div class="card entry-survey-card" data-entry-survey>${entrySurveyBody()}</div></section>`;
}
function bindEntrySurvey(scope){
 const box=scope.querySelector('[data-entry-survey]');if(!box)return;
 const redraw=focusTitle=>{box.innerHTML=entrySurveyBody();box.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.nav,b.dataset.param)));if(focusTitle){const h=box.querySelector('h2');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}};
 box.onclick=e=>{
  const t=e.target.closest('button');if(!t||!box.contains(t))return;
  if(t.hasAttribute('data-survey-start')){entrySurveyState.open=true;redraw(true);}
  else if(t.dataset.surveyAnswer){entrySurveyState.answers[t.dataset.surveyAnswer]=t.dataset.value;if(entrySurveyDone())entrySurveySave();redraw(true);}
  else if(t.hasAttribute('data-survey-back')){const qs=ENTRY_SURVEY.questions,i=qs.findIndex(q=>!entrySurveyState.answers[q.id]);if(i>0)delete entrySurveyState.answers[qs[i-1].id];redraw(true);}
  else if(t.hasAttribute('data-survey-reset')){entrySurveyState={answers:{},open:true};try{localStorage.removeItem(ENTRY_SURVEY_KEY);}catch{}redraw(true);}
 };
}
