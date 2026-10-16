const AVATAR_OPTIONS={
 type:{label:'キャラクター',values:['とびら','まる','しずく','ねこ','ふたば','ほし','おばけ','ひと']},
 body:{label:'からだの色',values:['#C7F238','#FFA51D','#67D5AF','#80C9EF','#ECA6C0','#B8A2E8']},
 eyes:{label:'目',values:['まるい目','にっこり','ぱっちり','きょろきょろ','ウインク','ねむたい']},
 mouth:{label:'口',values:['にっこり','おすまし','わくわく','びっくり','にやり']},
 accessory:{label:'アクセサリー',values:['なし','おひさま','お花','王冠','ぼうし','リボン','まるメガネ']},
 background:{label:'背景',values:['#075333','#EDF3E1','#FFF0CE','#DCEAF9','#F7DDE6','#E8E1F6','#DDEFE5']},
 ...Object.fromEntries(Object.entries(LEGACY_AVATAR_OPTIONS).filter(([k])=>!['eyes','mouth','background'].includes(k)))
};
function cleanAvatar(raw={}){
 raw=raw&&typeof raw==='object'?raw:{};
 const a=Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([k,o])=>[k,o.values.includes(raw[k])?raw[k]:o.values[0]]));
 if(!raw.type && raw.hair)a.type='ひと';
 return a;
}
function avatarSVG(raw){
 const a=cleanAvatar(raw),ink='#08352E',c=a.body;
 if(a.type==='ひと')return legacyAvatarSVG(a);
 const shapes={
 'とびら':'<path d="M51 43Q51 37 58 37H77Q83 37 83 43V82L151 96Q157 98 157 105V127Q157 134 150 132L83 119V165H51Z"/>',
 'まる':'<circle cx="100" cy="107" r="63"/>',
 'しずく':'<path d="M100 36C90 60 39 91 43 126C48 188 157 188 158 123C158 86 119 65 100 36Z"/>',
 'ねこ':'<path d="M43 98L43 43Q45 32 55 40L81 62Q100 55 119 62L146 40Q156 34 158 44L158 113Q163 173 100 174Q36 173 43 98Z"/>',
 'ふたば':'<ellipse cx="100" cy="122" rx="57" ry="50"/><path d="M100 77Q58 80 57 38Q98 34 100 77Q104 31 145 37Q147 79 100 77Z"/>',
 'ほし':'<path d="M100 32Q105 29 109 41L123 74L161 78Q179 78 166 94L141 120L150 158Q154 176 139 167L100 146L63 167Q47 176 51 158L60 120L33 94Q21 80 39 78L77 74L92 41Q95 32 100 32Z"/>',
 'おばけ':'<path d="M43 107Q43 49 100 49Q157 49 157 107V166L136 152L118 169L99 153L79 169L62 153L43 168Z"/>'};
 const eye=(x,closed)=>closed?`<path d="M${x-10} 103q10-14 20 0" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`:`<ellipse cx="${x}" cy="101" rx="14" ry="${a.eyes==='ねむたい'?10:19}" fill="white"/><ellipse cx="${x+(a.eyes==='きょろきょろ'?6:3)}" cy="103" rx="8" ry="12" fill="${ink}"/>${a.eyes==='ぱっちり'?`<circle cx="${x+5}" cy="98" r="3" fill="white"/>`:''}`;
 const eyes=eye(80,a.eyes==='にっこり')+eye(114,['にっこり','ウインク'].includes(a.eyes));
 const mouths={'にっこり':'<path d="M88 132q12 14 24 0" fill="none"/>','おすまし':'<path d="M94 137h12"/>','わくわく':'<path d="M85 130Q100 162 115 130Z"/>','びっくり':'<ellipse cx="100" cy="138" rx="7" ry="10"/>','にやり':'<path d="M86 139q20 3 29-12" fill="none"/>'};
 const accessories={
 'おひさま':'<circle cx="156" cy="46" r="17" fill="#FFA51D"/><path d="M151 19V10m24 19 7-7m-48 8-6-8" stroke="#FFE035" stroke-width="6" stroke-linecap="round"/>',
 'お花':'<g fill="#ECA6C0"><circle cx="146" cy="44" r="10"/><circle cx="164" cy="44" r="10"/><circle cx="146" cy="62" r="10"/><circle cx="164" cy="62" r="10"/></g><circle cx="155" cy="53" r="9" fill="#FFE035"/>',
 '王冠':'<path d="M71 45L65 19L87 31L101 13L116 31L137 19L130 45Z" fill="#FFCF38" stroke="#965006" stroke-width="3"/>',
 'ぼうし':'<path d="M62 55Q63 18 99 19Q136 18 138 55Z" fill="#FFA51D"/><path d="M51 55H151" stroke="#965006" stroke-width="8" stroke-linecap="round"/>',
 'リボン':'<path d="M119 48L143 32V68L119 55L95 68V32Z" fill="#E86B86"/><circle cx="119" cy="51" r="7" fill="#FFF0CE"/>',
 'まるメガネ':`<g fill="none" stroke="${ink}" stroke-width="4"><circle cx="80" cy="101" r="22"/><circle cx="114" cy="101" r="22"/></g>`};
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${a.type}のアバター" style="width:100%;height:100%;display:block;border-radius:24%"><rect width="200" height="200" rx="43" fill="${a.background}"/><g fill="${c}">${shapes[a.type]}</g>${eyes}${a.type==='とびら'?'':`<g stroke="${ink}" stroke-width="4" stroke-linecap="round" fill="${ink}">${mouths[a.mouth]}</g>`}${accessories[a.accessory]||''}</svg>`;
}
function openAvatarEditor(){
 let draft=cleanAvatar(DB.profile.avatar);
 const legacyKeys=['face','hair','skin','hairColor','shirt','glasses'];
 const names=['ライム','オレンジ','ミント','そら','ピンク','ラベンダー'];
 openModal(`<div class="modal-head"><h3 id="avatarHeading">わたしの相棒をつくろう</h3><button class="modal-close" data-modal-close aria-label="保存せず閉じる">✕</button></div><p class="faint">ロゴみたいな大きな目。色も表情も、じぶんらしく。</p><form id="avatarForm"><div class="avatar-workbench"><div class="avatar-preview-panel"><div id="avatarPreview">${avatarSVG(draft)}</div><strong id="avatarName"></strong><button type="button" id="avatarRandom" class="btn btn-secondary">おまかせで作る</button></div><div class="avatar-options">${Object.entries(AVATAR_OPTIONS).map(([k,o])=>`<fieldset data-avatar-field="${k}"><legend>${o.label}</legend><div class="avatar-choice-grid">${o.values.map((v,i)=>`<button type="button" class="avatar-choice ${v.startsWith('#')?'avatar-swatch':''}" data-part="${k}" data-value="${v}" aria-pressed="false">${k==='type'?`<span class="avatar-mini">${avatarSVG({...draft,type:v})}</span>`:''}${v.startsWith('#')?`<span style="background:${v}" class="avatar-color"></span><span>${k==='body'?names[i]:k==='background'?['深緑','若葉','クリーム','そら','さくら','すみれ','ミント'][i]:'色 '+(i+1)}</span>`:v}</button>`).join('')}</div></fieldset>`).join('')}</div></div><div class="avatar-actions"><button type="button" class="btn btn-ghost" data-modal-close>キャンセル</button><button type="submit" class="btn btn-primary">このアバターを保存</button></div><p class="faint">このブラウザに保存されます。以前の人型も選べます。</p></form>`,root=>{
 root.querySelector('[role=dialog]').setAttribute('aria-labelledby','avatarHeading');
 const update=()=>{
 root.querySelector('#avatarPreview').innerHTML=avatarSVG(draft);
 root.querySelector('#avatarName').textContent=draft.type+'の相棒';
 root.querySelectorAll('[data-part]').forEach(b=>b.setAttribute('aria-pressed',String(draft[b.dataset.part]===b.dataset.value)));
 root.querySelectorAll('[data-avatar-field]').forEach(f=>{const k=f.dataset.avatarField;f.hidden=legacyKeys.includes(k)?draft.type!=='ひと':(['body','accessory'].includes(k)?draft.type==='ひと':k==='mouth'&&draft.type==='とびら');});
 };
 root.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>{draft[b.dataset.part]=b.dataset.value;update();});
 root.querySelector('#avatarRandom').onclick=()=>{Object.entries(AVATAR_OPTIONS).forEach(([k,o])=>draft[k]=o.values[Math.floor(Math.random()*o.values.length)]);update();};
 root.querySelector('#avatarForm').onsubmit=e=>{e.preventDefault();const previous=DB.profile.avatar;DB.profile.avatar=cleanAvatar(draft);if(!save()){DB.profile.avatar=previous;toast('保存できませんでした。ブラウザの保存容量をご確認ください。');return;}closeModal();document.querySelectorAll('[data-avatar-picture]').forEach(el=>el.innerHTML=avatarSVG(DB.profile.avatar));toast('新しい相棒を保存しました');};
 update();
 });
}
