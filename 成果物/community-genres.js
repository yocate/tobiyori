/* Eight public themes. Old labels and interests remain intact in stored records. */
const COMMUNITY_GENRES=[
 {id:'local_town',label:'まちづくり・交流',reading:'まちづくり',interests:['festival','global','interest_language','interest_disaster'],aliases:['お祭り・イベント運営','お祭り','イベント運営','留学生との国際交流','国際交流','語学・異文化交流','語学','異文化交流','防災・地域の安全','防災','学生自治・大学祭','ボランティア','地域交流','地方創生','まちづくり','国際交流・語学','ボランティア・地域交流']},
 {id:'local_learning',label:'子ども・学び',reading:'こども',interests:['study','interest_books'],aliases:['子どもの学習支援','学習支援','読書・読み聞かせ','読書','読み聞かせ','学術・研究','資格・勉強会','天文・宇宙']},
 {id:'local_care',label:'福祉・暮らし',reading:'ふくし',interests:['elder','interest_health'],aliases:['高齢者との交流','高齢者交流','健康・福祉','健康','福祉','手話']},
 {id:'local_nature',label:'自然・農業・環境',reading:'しぜん',interests:['nature','interest_animals','interest_hiking'],aliases:['農業・環境保全','農業','環境保全','動物・ペット','動物','ペット','登山・アウトドア','登山','アウトドア']},
 {id:'local_culture',label:'文化・スポーツ',reading:'ぶんか',interests:['sports','interest_art','interest_anime','interest_music','interest_dance','interest_history'],aliases:['スポーツ・文化活動','スポーツ','アート・イラスト','アート','イラスト','アニメ・ゲーム','アニメ','ゲーム','音楽・楽器','音楽','楽器','ダンス・演劇','ダンス','演劇','歴史・伝統文化','歴史','伝統文化','映画・映像制作','演劇・ミュージカル','音楽・軽音・バンド','合唱・アカペラ','楽器・オーケストラ','ゲーム・eスポーツ','ボードゲーム','茶道・華道','書道','スポーツ観戦','ダンス・よさこい','美術・絵画','文芸・創作','バドミントン','バスケットボール','サッカー・フットサル','テニス','野球・ソフトボール','武道・格闘技','スポーツ・運動','ゲーム・アニメ','趣味・アウトドア']},
 {id:'local_industry',label:'観光・地域産業',reading:'かんこう',interests:['shop','interest_tourism','interest_business'],aliases:['空き店舗・地域資源活用','空き店舗','観光・まち歩き','観光','まち歩き','起業・商品づくり','起業','地域産業']},
 {id:'local_food',label:'食・ものづくり',reading:'しょく',interests:['interest_craft','interest_cooking'],aliases:['手芸・ものづくり','手芸','ものづくり','料理・食文化','料理','食文化','料理・お菓子づくり']},
 {id:'local_digital',label:'発信・デジタル',reading:'はっしん',interests:['sns','interest_it','interest_photo','interest_design'],aliases:['商店街SNS・動画制作','SNS・動画制作','動画制作','IT・プログラミング','プログラミング','写真・カメラ','写真','カメラ','デザイン','放送・ラジオ','写真・映像・美術']}
];
const communityGenreNormal=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s・/]/g,'');
function communityGenreKey(value){const s=communityGenreNormal(value);if(!s)return null;return COMMUNITY_GENRES.find(g=>[g.id,g.label,...g.interests,...g.aliases].some(v=>communityGenreNormal(v)===s))?.id||null;}
function communityGenreMatches(selected,values){const key=communityGenreKey(selected);return values.some(v=>v===selected||key&&communityGenreKey(v)===key);}
function communityInterestChoices(){return [...COMMUNITY_GENRES].sort((a,b)=>a.reading.localeCompare(b.reading,'ja')).map(g=>[g.id,g]);}
function communityInterestSelected(ids,key){return (ids||[]).some(v=>communityGenreKey(v)===key);}
function preserveCommunityGenres(previous,selected){const output=[];for(const label of selected){const key=communityGenreKey(label),old=previous.filter(v=>key&&communityGenreKey(v)===key);output.push(...(old.length?old:[label]));}return [...new Set(output)];}
function matchesCommunityOffer(ids,choice){const values=Array.isArray(ids)?ids:[],key=communityGenreKey(choice);return choice.startsWith('local_')?communityInterestSelected(values,choice):values.includes(choice)||!!key&&values.includes(key);}
function matchingCommunityInterests(ids,genres){return (ids||[]).some(id=>communityGenreMatches(id,genres));}
if(typeof module!=='undefined'&&module.exports)module.exports={COMMUNITY_GENRES,communityGenreKey,communityGenreMatches,communityInterestChoices,communityInterestSelected,preserveCommunityGenres,matchesCommunityOffer,matchingCommunityInterests};
