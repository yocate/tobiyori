'use strict';
const {randomUUID}=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const TEMPLATES=['初参加でも大丈夫？','見学だけでもいい？','活動の雰囲気を教えてください。'];
function createCommunityQuestions({db,org,blocked,notify,isAdmin,clock=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS live_community_questions(id TEXT PRIMARY KEY,community_id TEXT NOT NULL REFERENCES live_communities(id),user_id TEXT NOT NULL REFERENCES accounts(id),body TEXT NOT NULL,answer TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,answered_at TEXT,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)));
 CREATE INDEX IF NOT EXISTS live_community_questions_community ON live_community_questions(community_id,created_at);`);
 const one=(sql,...v)=>db.prepare(sql).get(...v),all=(sql,...v)=>db.prepare(sql).all(...v),run=(sql,...v)=>db.prepare(sql).run(...v);
 const now=()=>new Date(clock()).toISOString();
 const text=(v,label,max)=>{const s=typeof v==='string'?v.trim():'';if(!s||s.length>max)throw fail(400,`${label}は1〜${max}文字で入力してください。`);return s;};
 const manages=(c,user)=>!!user&&(c.owner_id===user.id||isAdmin(user));
 function list(cid,user){
  const c=org(cid);
  if(!manages(c,user)&&(c.status!=='VERIFIED'||c.paused||blocked(user,cid)))throw fail(404,'このコミュニティの質問は現在公開されていません。');
  const answered=all("SELECT id,body,answer,answered_at FROM live_community_questions WHERE community_id=? AND hidden=0 AND answer<>'' ORDER BY answered_at DESC,id LIMIT 50",cid).map(q=>({id:q.id,body:q.body,answer:q.answer,answeredAt:q.answered_at}));
  const mine=user?all("SELECT id,body,created_at FROM live_community_questions WHERE community_id=? AND user_id=? AND hidden=0 AND answer='' ORDER BY created_at",cid,user.id).map(q=>({id:q.id,body:q.body,createdAt:q.created_at})):[];
  return {answered,mine,templates:TEMPLATES,canAsk:!!user&&!manages(c,user)&&c.status==='VERIFIED'&&!c.paused&&!blocked(user,cid)};
 }
 function ask(cid,user,input){
  const c=org(cid);
  if(c.status!=='VERIFIED'||c.paused||blocked(user,cid))throw fail(404,'現在、このコミュニティには質問できません。');
  if(manages(c,user))throw fail(403,'担当者・運営者は質問できません。');
  const body=text(input.body,'質問',300);
  if(one("SELECT COUNT(*) AS n FROM live_community_questions WHERE community_id=? AND user_id=? AND answer='' AND hidden=0",cid,user.id).n>=3)throw fail(429,'回答待ちの質問は3件までです。回答をお待ちください。');
  run('INSERT INTO live_community_questions(id,community_id,user_id,body,created_at) VALUES(?,?,?,?,?)',randomUUID(),cid,user.id,body,now());
  notify(c.owner_id,`「${c.name}」に匿名の質問が届きました。`,`org`);
  return list(cid,user);
 }
 function inbox(user){
  const rows=all("SELECT q.id,q.body,q.created_at,c.id AS community_id,c.name FROM live_community_questions q JOIN live_communities c ON c.id=q.community_id WHERE q.answer='' AND q.hidden=0 AND (c.owner_id=? OR ?=1) ORDER BY q.created_at",user.id,isAdmin(user)?1:0);
  return {questions:rows.map(q=>({id:q.id,body:q.body,createdAt:q.created_at,communityId:q.community_id,communityName:q.name}))};
 }
 function ownedQuestion(qid,user){
  const q=one('SELECT * FROM live_community_questions WHERE id=?',qid);if(!q)throw fail(404,'質問が見つかりません。');
  const c=org(q.community_id);if(!manages(c,user))throw fail(403,'このコミュニティの担当者だけが回答できます。');
  return {q,c};
 }
 function answer(qid,user,input){
  const {q,c}=ownedQuestion(qid,user);if(q.hidden)throw fail(409,'この質問は非表示です。');
  run('UPDATE live_community_questions SET answer=?,answered_at=? WHERE id=?',text(input.answer,'回答',1000),now(),qid);
  if(!q.answer)notify(q.user_id,`「${c.name}」から匿名質問への回答が届きました。`,'livecommunity/'+c.id,'community-question-answer:'+qid);
  return {ok:true};
 }
 function hide(qid,user){ownedQuestion(qid,user);run('UPDATE live_community_questions SET hidden=1 WHERE id=?',qid);return {ok:true};}
 return {list,ask,inbox,answer,hide};
}
module.exports={createCommunityQuestions,TEMPLATES};
