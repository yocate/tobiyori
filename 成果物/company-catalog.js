const COMPANY_KINDS={recruitment:'採用・求人',internship:'インターン',experience:'職場体験',visit:'会社見学',briefing:'会社説明会',exchange:'社員との交流・座談会',project:'共同プロジェクト',regional:'地域交流・ボランティア',other:'その他'};
const COMPANY_SEARCH_KINDS={community:{label:'地域づくり・共同活動',kinds:['regional','project','other']},meet:{label:'見学・交流',kinds:['visit','briefing','exchange']},experience:{label:'インターン・仕事体験',kinds:['internship','experience']},recruitment:{label:'採用・求人',kinds:['recruitment']}};
const CAREER_KINDS=['recruitment','internship','experience','visit','briefing','exchange'];
function isCareerListing(a){return CAREER_KINDS.includes(a.companyKind);}
function isRecruitment(a){return a.companyKind==='recruitment';}
if(typeof module!=='undefined'&&module.exports)module.exports={COMPANY_SEARCH_KINDS,COMPANY_KINDS,CAREER_KINDS,isCareerListing,isRecruitment};
