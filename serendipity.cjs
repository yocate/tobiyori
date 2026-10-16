const {COMMUNITY_GENRES,communityGenreKey}=require('./成果物/community-genres.js');
const crypto=require('node:crypto');
const {evaluate}=require('./participation-conditions.cjs');
// Explicit category aliases: unknown free-text genres are not labelled as unfamiliar.
const GENRE_ALIASES={shop:['空き店舗・地域資源活用','空き店舗'],festival:['お祭り・イベント運営','お祭り','イベント運営'],elder:['高齢者との交流','高齢者交流'],study:['子どもの学習支援','学習支援'],sns:['商店街SNS・動画制作','SNS・動画制作','動画制作'],sports:['スポーツ・文化活動','スポーツ'],nature:['農業・環境保全','農業','環境保全'],global:['留学生との国際交流','国際交流'],interest_art:['アート・イラスト','アート','イラスト'],interest_it:['IT・プログラミング','プログラミング'],interest_anime:['アニメ・ゲーム','アニメ','ゲーム'],interest_music:['音楽・楽器','音楽','楽器'],interest_tourism:['観光・まち歩き','観光','まち歩き'],interest_business:['起業・商品づくり','起業'],interest_health:['健康・福祉','健康','福祉'],interest_language:['語学・異文化交流','語学','異文化交流'],interest_photo:['写真・カメラ','写真','カメラ'],interest_craft:['手芸・ものづくり','手芸','ものづくり'],interest_dance:['ダンス・演劇','ダンス','演劇'],interest_design:['デザイン'],interest_animals:['動物・ペット','動物','ペット'],interest_books:['読書・読み聞かせ','読書','読み聞かせ'],interest_hiking:['登山・アウトドア','登山','アウトドア'],interest_disaster:['防災・地域の安全','防災'],interest_cooking:['料理・食文化','料理','食文化'],interest_history:['歴史・伝統文化','歴史','伝統文化']};
for(const g of COMMUNITY_GENRES)GENRE_ALIASES[g.id]=[g.label,...g.aliases];
const normalized=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s・/]/g,'');
function genreKey(value){if(Object.hasOwn(GENRE_ALIASES,value))return value;return Object.keys(GENRE_ALIASES).find(k=>GENRE_ALIASES[k].some(a=>normalized(a)===normalized(value)))||null;}
const list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'):[];
function profileNeeds(p){return [!list(p.interests).some(genreKey)&&'興味のあるジャンル',!list(p.days).length&&'参加できる曜日',!list(p.areas).length&&'希望する地域'].filter(Boolean);}
function assess(a,p,experienced=[]){
 const genre=genreKey(a.genre),familiar=new Set([...list(p.interests).map(genreKey),...experienced.map(genreKey)].filter(Boolean));
 const checks=evaluate(a,p);
 const transport=list(p.transport);if(transport.length)checks.push({key:'transport',label:'交通案内',status:transport.some(t=>String(a.transport||'').includes(t))?'match':'unknown',message:transport.some(t=>String(a.transport||'').includes(t))?'登録した移動手段の案内があります。経路・時刻は別途確認してください。':'登録した移動手段の案内を確認できません。'});
 return {eligible:!profileNeeds(p).length&&!!genre&&!familiar.has(genre)&&![...familiar].some(g=>communityGenreKey(g)&&communityGenreKey(g)===communityGenreKey(genre))&&a.beginner===true&&!checks.some(c=>['mismatch','unknown'].includes(c.status)),genre,checks};
}
// Pick a community first so a large catalogue does not buy more exposure.
function draw(candidates,randomInt=crypto.randomInt){const communities=[...new Set(candidates.map(a=>a.communityId))];if(!communities.length)return null;const cid=communities[randomInt(communities.length)],rows=candidates.filter(a=>a.communityId===cid);return rows[randomInt(rows.length)];}
function createSerendipity({db,activitiesForUser}){
 db.exec(`CREATE TABLE IF NOT EXISTS live_serendipity_picks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),activity_id TEXT NOT NULL REFERENCES live_activities(id),genre TEXT NOT NULL,created_at TEXT NOT NULL,feedback TEXT NOT NULL DEFAULT '' CHECK(feedback IN ('','interested','pass')));
 CREATE INDEX IF NOT EXISTS serendipity_user_created ON live_serendipity_picks(user_id,created_at);`);
 if(!db.prepare('PRAGMA table_info(live_serendipity_picks)').all().some(c=>c.name==='awareness'))db.exec("ALTER TABLE live_serendipity_picks ADD COLUMN awareness TEXT NOT NULL DEFAULT '' CHECK(awareness IN ('','new','known'))");
 const all=(sql,...v)=>db.prepare(sql).all(...v),one=(sql,...v)=>db.prepare(sql).get(...v),run=(sql,...v)=>db.prepare(sql).run(...v);
 function context(user){let p={};if(one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workspaces'")){try{p=JSON.parse(one('SELECT content FROM workspaces WHERE user_id=?',user.id)?.content||'{}').profile||{};}catch{}}
  const experienced=all("SELECT a.data FROM live_applications p JOIN live_activities a ON a.id=p.activity_id WHERE p.user_id=? AND p.status='DONE'",user.id).map(a=>JSON.parse(a.data).genre);
  const activities=activitiesForUser(user),seen=new Set(all("SELECT activity_id FROM live_serendipity_picks WHERE user_id=? AND created_at>=?",user.id,new Date(Date.now()-30*86400000).toISOString()).map(r=>r.activity_id));
  const savedGenres=all("SELECT DISTINCT genre FROM live_serendipity_picks WHERE user_id=? AND feedback='interested'",user.id).map(r=>r.genre);
  const candidates=activities.filter(a=>!seen.has(a.id)&&assess(a,p,[...experienced,...savedGenres]).eligible);return {p,experienced,activities,candidates};
 }
 function payload(user,ctx=context(user)){
  const rows=all('SELECT * FROM live_serendipity_picks WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20',user.id).map(r=>{const a=ctx.activities.find(a=>a.id===r.activity_id),check=a?assess(a,ctx.p,ctx.experienced):null;return {id:r.id,createdAt:r.created_at,feedback:r.feedback,awareness:r.awareness,genre:GENRE_ALIASES[r.genre]?.[0]||r.genre,available:!!a,eligible:!!check?.eligible,checks:check?.checks||[],activity:a||null};});
  const stats=one("SELECT COUNT(*) AS opened,COUNT(DISTINCT genre) AS genres,COALESCE(SUM(CASE WHEN awareness='new' AND feedback='interested' THEN 1 ELSE 0 END),0) AS sparks FROM live_serendipity_picks WHERE user_id=?",user.id);
  return {needs:profileNeeds(ctx.p),candidateCommunities:new Set(ctx.candidates.map(a=>a.communityId)).size,candidateActivities:ctx.candidates.length,current:rows[0]||null,history:rows,stats};
 }
 function pick(user){const ctx=context(user);if(profileNeeds(ctx.p).length)throw Object.assign(new Error('マイページで興味・曜日・地域を登録してください。'),{status:400});const selected=draw(ctx.candidates);if(!selected)return {...payload(user,ctx),noCandidate:true};run('INSERT INTO live_serendipity_picks(id,user_id,activity_id,genre,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),user.id,selected.id,genreKey(selected.genre),new Date().toISOString());return payload(user);}
 function feedback(user,pickId,value){if(!['interested','pass'].includes(value))throw Object.assign(new Error('感想の選択を確認してください。'),{status:400});if(!one('SELECT 1 FROM live_serendipity_picks WHERE id=? AND user_id=?',pickId,user.id))throw Object.assign(new Error('紹介した活動が見つかりません。'),{status:404});run('UPDATE live_serendipity_picks SET feedback=? WHERE id=? AND user_id=?',value,pickId,user.id);return payload(user);}
 function awareness(user,pickId,value){if(!['new','known'].includes(value))throw Object.assign(new Error('発見の選択を確認してください。'),{status:400});if(!one('SELECT 1 FROM live_serendipity_picks WHERE id=? AND user_id=?',pickId,user.id))throw Object.assign(new Error('紹介した活動が見つかりません。'),{status:404});run('UPDATE live_serendipity_picks SET awareness=? WHERE id=? AND user_id=?',value,pickId,user.id);return payload(user);}
 return {payload,pick,feedback,awareness};
}
module.exports={GENRE_ALIASES,genreKey,profileNeeds,assess,draw,createSerendipity};
