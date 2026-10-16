/* Shared, transparent keyword matching; profile text never goes to an external AI. */
const PROFILE_SKILLS = [
 ['photo','写真・撮影',['写真','撮影','カメラ']],
 ['video','動画・映像',['動画','映像','編集','youtube']],
 ['design','デザイン',['デザイン','イラスト','ポスター','canva']],
 ['social','SNS・広報',['sns','広報','発信','instagram']],
 ['study','学習支援',['勉強','学習','教える','家庭教師','塾']],
 ['children','子どもとの活動',['子ども','子供','保育','児童']],
 ['language','語学・国際交流',['英語','語学','翻訳','通訳','国際交流']],
 ['music','音楽',['音楽','楽器','演奏','歌','バンド']],
 ['sport','スポーツ',['スポーツ','運動','サッカー','バスケ']],
 ['nature','自然・農業',['農業','自然','環境','園芸']],
 ['cooking','料理',['料理','調理','お菓子']],
 ['planning','企画・運営',['企画','運営','司会','イベント']]
];
function profileSkillSignals(value){
 const clauses=String(value||'').normalize('NFKC').toLowerCase().slice(0,3000).split(/[。！!？?\n、,；;]/).filter(s=>!/(苦手|できない|出来ない|興味がない|経験がない|未経験|不得意|やりたくない)/.test(s));
 return PROFILE_SKILLS.filter(([, ,words])=>clauses.some(s=>words.some(w=>s.includes(w)))).map(([id,label])=>({id,label}));
}
function profileSkillsFor(p){return p.useSkillsMatching===true?profileSkillSignals(p.skills).filter(s=>!(p.excludedSkills||[]).includes(s.id)):[];}
function matchingProfileSkills(p,a){const target=profileSkillSignals([a.title,a.genre,a.purpose,a.tasks].join(' '));return profileSkillsFor(p).filter(s=>target.some(t=>t.id===s.id));}
if(typeof module!=='undefined'&&module.exports)module.exports={PROFILE_SKILLS,profileSkillSignals,profileSkillsFor,matchingProfileSkills};
