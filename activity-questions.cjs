'use strict';
// 活動への質問（公開Q&A）。個別メッセージは終了しているため、1対1にはしない。
// 質問者の名前は団体にも他の人にも出さず、団体が回答したものだけを活動ページに公開する。
const {randomUUID}=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const TEMPLATES=Object.freeze(['初めてでも参加できますか？','一人で参加しても大丈夫ですか？','服装や持ち物で気をつけることはありますか？','途中参加・途中退出はできますか？','当日の雰囲気や、参加者の年代を教えてください。']);
const MAX_OPEN=3;
function createActivityQuestions({db,activity,blocked,notify,isAdmin,clock=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS live_questions(id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES live_activities(id),user_id TEXT NOT NULL REFERENCES accounts(id),body TEXT NOT NULL,answer TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,answered_at TEXT,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)));
 CREATE INDEX IF NOT EXISTS live_questions_activity ON live_questions(activity_id,created_at);`);
 const one=(s,...v)=>db.prepare(s).get(...v),all=(s,...v)=>db.prepare(s).all(...v),run=(s,...v)=>db.prepare(s).run(...v);
 const now=()=>new Date(clock()).toISOString();
 const visible=a=>a.community_status==='VERIFIED'&&!a.paused&&['PUBLISHED','CLOSED'].includes(a.status);
 const manages=(a,user)=>!!user&&(a.owner_id===user.id||isAdmin(user));
 const text=(v,label,max)=>{const s=typeof v==='string'?v.trim():'';if(!s||s.length>max)throw fail(400,label+'は1〜'+max+'文字で入力してください。');return s;};
 function list(aid,user){
  const a=activity(aid);if(!manages(a,user)&&(!visible(a)||blocked(user,a.community_id)))throw fail(404,'この活動の質問は現在公開されていません。');
  const answered=all("SELECT id,body,answer,answered_at FROM live_questions WHERE activity_id=? AND hidden=0 AND answer<>'' ORDER BY answered_at DESC,id",aid).map(q=>({id:q.id,body:q.body,answer:q.answer,answeredAt:q.answered_at}));
  const mine=user?all("SELECT id,body,created_at FROM live_questions WHERE activity_id=? AND user_id=? AND hidden=0 AND answer='' ORDER BY created_at",aid,user.id).map(q=>({id:q.id,body:q.body,createdAt:q.created_at})):[];
  return {answered,mine,templates:TEMPLATES,canAsk:!!user&&a.status==='PUBLISHED'&&visible(a)&&a.owner_id!==user.id&&!isAdmin(user)};
 }
 function ask(aid,user,input){
  const a=activity(aid);
  if(a.status!=='PUBLISHED'||!visible(a)||blocked(user,a.community_id))throw fail(400,'現在、この活動には質問できません。');
  if(manages(a,user))throw fail(403,'担当者・運営者は質問できません。');
  const body=text(input.body,'質問',300);
  if(one("SELECT COUNT(*) AS n FROM live_questions WHERE activity_id=? AND user_id=? AND answer='' AND hidden=0",aid,user.id).n>=MAX_OPEN)throw fail(429,'回答待ちの質問が'+MAX_OPEN+'件あります。回答が届いてから、もう一度お試しください。');
  run('INSERT INTO live_questions(id,activity_id,user_id,body,created_at) VALUES(?,?,?,?,?)',randomUUID(),aid,user.id,body,now());
  notify(a.owner_id,'「'+a.title+'」に質問が届きました。回答すると活動ページに公開されます。','org');
  return list(aid,user);
 }
 function inbox(user){
  const rows=all("SELECT q.id,q.body,q.created_at,a.id AS activity_id,a.title FROM live_questions q JOIN live_activities a ON a.id=q.activity_id JOIN live_communities c ON c.id=a.community_id WHERE q.answer='' AND q.hidden=0 AND (c.owner_id=? OR ?=1) ORDER BY q.created_at",user.id,isAdmin(user)?1:0);
  return {questions:rows.map(q=>({id:q.id,body:q.body,createdAt:q.created_at,activityId:q.activity_id,title:q.title}))};
 }
 function question(qid,user){
  const q=one('SELECT * FROM live_questions WHERE id=?',qid);if(!q)throw fail(404,'質問が見つかりません。');
  const a=activity(q.activity_id);if(!manages(a,user))throw fail(403,'団体の担当者だけが回答できます。');return {q,a};
 }
 function answer(qid,user,input){
  const {q,a}=question(qid,user);if(q.hidden)throw fail(409,'この質問は非表示にしています。');
  run('UPDATE live_questions SET answer=?,answered_at=? WHERE id=?',text(input.answer,'回答',1000),now(),qid);
  if(!q.answer)notify(q.user_id,'「'+a.title+'」への質問に、団体が回答しました。','liveactivity/'+a.id,'question-answer:'+qid);
  return {ok:true};
 }
 function hide(qid,user){question(qid,user);run('UPDATE live_questions SET hidden=1 WHERE id=?',qid);return {ok:true};}
 return {list,ask,inbox,answer,hide};
}
module.exports={createActivityQuestions,TEMPLATES};
