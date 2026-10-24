'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./tx.cjs');
const {isCareerListing}=require('./成果物/company-catalog.js');
const fail=(status,message)=>Object.assign(new Error(message),{status});
// 初めての人でも選ぶだけで会話を始められるよう、場面ごとに分けた定型メッセージ。キーは保存済みデータと共通なので変えない。
const GREETINGS=Object.freeze({hello:'はじめまして。よろしくお願いします！',first:'初めての参加で、少し緊張しています。',looking:'当日、みなさんと活動できるのが楽しみです。',
 alone:'一人で参加するのは初めてです。',unsure:'まだ参加するか迷っています。',curious:'どんな雰囲気の活動なのか、気になっています。',
 askWhy:'みなさんは、どんなところが気になりましたか？',askBefore:'似た活動に参加したことはありますか？',askApply:'もう申し込みましたか？',
 same:'わたしも同じです！',thanks:'教えてくれてありがとうございます。',together:'一緒に参加できたらうれしいです。'});
const PHRASE_GROUPS=Object.freeze([{label:'あいさつ',keys:['hello','first','looking']},{label:'いまの気持ち',keys:['alone','unsure','curious']},{label:'聞いてみる',keys:['askWhy','askBefore','askApply']},{label:'返事をする',keys:['same','thanks','together']}]);
// よりみちひろば: マッチしたグループだけの2D空間。位置とスタンプは一時的な状態なのでメモリにだけ持つ。
const STAMPS=Object.freeze({wave:'👋',smile:'😊',clap:'👏',thanks:'🙏',spark:'✨'});
const SEATS=[[28,58],[50,42],[72,58],[50,74]],STAMP_MS=6000,STAMP_GAP_MS=1500,ONLINE_MS=20000,FORGET_MS=10*60000,HISTORY_MS=24*3600000,HISTORY_MAX=8;
function createWaitingRooms({db,activity,blocked,conditions,notify,isAdmin,clock=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS live_waiting_groups(id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES live_activities(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_waiting_members(activity_id TEXT NOT NULL REFERENCES live_activities(id),user_id TEXT NOT NULL REFERENCES accounts(id),display_name TEXT NOT NULL,group_id TEXT REFERENCES live_waiting_groups(id),joined_at TEXT NOT NULL,minor INTEGER NOT NULL CHECK(minor IN (0,1)),PRIMARY KEY(activity_id,user_id));
 CREATE INDEX IF NOT EXISTS live_waiting_members_group ON live_waiting_members(group_id);
 CREATE TABLE IF NOT EXISTS live_waiting_greetings(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES live_waiting_groups(id),user_id TEXT NOT NULL REFERENCES accounts(id),display_name TEXT NOT NULL,phrase TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(group_id,user_id,phrase));`);
 // spaces: グループごとの位置。histories: 後から来た人にも届くよう、スタンプを24時間だけ残す。
 const spaces=new Map(),histories=new Map();
 const one=(s,...v)=>db.prepare(s).get(...v),all=(s,...v)=>db.prepare(s).all(...v),run=(s,...v)=>db.prepare(s).run(...v);
 const now=()=>new Date(clock()).toISOString();
 function available(a){const d=JSON.parse(a.data);return a.status==='PUBLISHED'&&a.community_status==='VERIFIED'&&!a.paused&&a.starts_at>now()&&(!d.deadline||d.deadline>now())&&d.participationScope!=='members'&&!isCareerListing(d);}
 function requirePublic(aid,user){const a=activity(aid);if(!available(a)||blocked(user,a.community_id))throw fail(404,'この活動のラウンジは現在利用できません。');return a;}
 function reconcile(aid){
  const a=activity(aid);
  transaction(db,()=>{
   if(!available(a)){run('DELETE FROM live_waiting_members WHERE activity_id=?',aid);return;}
   const rows=all('SELECT * FROM live_waiting_members WHERE activity_id=? ORDER BY joined_at,user_id',aid);
   for(const m of rows)if(blocked({id:m.user_id},a.community_id))run('DELETE FROM live_waiting_members WHERE activity_id=? AND user_id=?',aid,m.user_id);
   // Interest is independent of an application. Pending activity changes pause grouping.
   for(const g of all('SELECT DISTINCT group_id FROM live_waiting_members WHERE activity_id=? AND group_id IS NOT NULL',aid)){
    const members=all('SELECT user_id FROM live_waiting_members WHERE group_id=?',g.group_id);
    if(conditions.pending(aid)||members.length<3)run('UPDATE live_waiting_members SET group_id=NULL WHERE group_id=?',g.group_id);
   }
   if(!conditions.pending(aid)){
    // Keep self-declared under-18 participants in a separate cohort for this activity.
    for(const minor of [0,1]){
     const queue=all('SELECT * FROM live_waiting_members WHERE activity_id=? AND group_id IS NULL AND minor=? ORDER BY joined_at,user_id',aid,minor);
     for(const g of all('SELECT group_id,COUNT(*) AS n FROM live_waiting_members WHERE activity_id=? AND group_id IS NOT NULL AND minor=? GROUP BY group_id HAVING COUNT(*)=3 ORDER BY MIN(joined_at),group_id',aid,minor)){
      if(!queue.length)break;assign(g.group_id,[queue.shift()]);
     }
     while(queue.length>=3){const gid=randomUUID();run('INSERT INTO live_waiting_groups VALUES(?,?,?)',gid,aid,now());assign(gid,queue.splice(0,Math.min(4,queue.length)));}
    }
   }
  });
  function assign(gid,members){
   for(const m of members){run('UPDATE live_waiting_members SET group_id=? WHERE activity_id=? AND user_id=?',gid,aid,m.user_id);notify(m.user_id,'「'+a.title+'」を気にしているラウンジの仲間が見つかりました。参加するかは、これから決められます。','waiting/'+aid,'waiting-match:'+gid+':'+m.user_id);}
  }
 }
 function reconcileAll(){for(const r of all('SELECT DISTINCT activity_id FROM live_waiting_members'))reconcile(r.activity_id);}
 function snapshot(aid,user){
  const a=requirePublic(aid,user);reconcile(aid);
  const p=one('SELECT * FROM live_applications WHERE activity_id=? AND user_id=?',aid,user.id),m=one('SELECT * FROM live_waiting_members WHERE activity_id=? AND user_id=?',aid,user.id);
  const cohort=m?.minor||0,waiting=one('SELECT COUNT(*) AS n FROM live_waiting_members WHERE activity_id=? AND minor=? AND group_id IS NULL',aid,cohort).n;
  const state=!m?'NOT_JOINED':conditions.pending(aid)?'ON_HOLD':m.group_id?'MATCHED':'WAITING';
  const peers=state==='MATCHED'?all('SELECT user_id,display_name FROM live_waiting_members WHERE group_id=? ORDER BY joined_at,user_id',m.group_id).map(r=>({name:r.display_name,isMe:r.user_id===user.id})):[];
  const greetings=state==='MATCHED'?all('SELECT * FROM live_waiting_greetings WHERE group_id=? ORDER BY created_at,id',m.group_id).map(r=>({id:r.id,name:r.display_name,isMe:r.user_id===user.id,text:GREETINGS[r.phrase],phrase:r.phrase,createdAt:r.created_at})):[];
  return {activityId:aid,title:a.title,communityId:a.community_id,communityName:a.community_name,startsAt:a.starts_at,state,joined:!!m,applicationStatus:p?.status||null,canJoin:a.owner_id!==user.id&&!isAdmin(user)&&!conditions.pending(aid),displayName:m?.display_name||'',waiting,peers,greetings,phrases:GREETINGS,phraseGroups:PHRASE_GROUPS};
 }
 function join(aid,user,input){
  const a=requirePublic(aid,user);
  if(a.owner_id===user.id||isAdmin(user))throw fail(403,'担当者・運営者は、運営画面からラウンジの様子を確認できます。');
  if(conditions.pending(aid))throw fail(409,'活動内容の変更を確認中です。確認が終わるまでお待ちください。');
  const name=typeof input.name==='string'?input.name.trim():'';
  if(input.consent!==true||typeof input.minor!=='boolean'||!name||name.length>20||/[\r\n\u0000-\u001f]/.test(name))throw fail(400,'ラウンジで使う呼び名（20文字以内）、年齢区分、利用の同意を確認してください。');
  let minor=input.minor;
  if(one("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'")){
   const row=one('SELECT content FROM workspaces WHERE user_id=?',user.id);let birth='';try{birth=JSON.parse(row?.content||'{}').profile?.birthDate||'';}catch{}
   if(/^\d{4}-\d{2}-\d{2}$/.test(birth)){const today=new Date(clock()+9*3600000).toISOString().slice(0,10),cutoff=String(Number(today.slice(0,4))-18)+today.slice(4);if(birth>cutoff)minor=true;}
  }
  if(one('SELECT minor FROM live_applications WHERE activity_id=? AND user_id=?',aid,user.id)?.minor)minor=true;
  if(minor&&!['allowed','visit'].includes(JSON.parse(a.data).highSchoolParticipation))throw fail(400,'18歳未満の方は、高校生の参加・見学を受け付けている活動のラウンジをご利用ください。');
  const inserted=run('INSERT OR IGNORE INTO live_waiting_members VALUES(?,?,?,NULL,?,?)',aid,user.id,name,now(),minor?1:0).changes;
  reconcile(aid);
  if(inserted){
   // 仲間待ちの人に「同じ活動が気になる人が来た」と知らせる（誰かは伝えない）。担当者には1日1回まで。
   const me=one('SELECT * FROM live_waiting_members WHERE activity_id=? AND user_id=?',aid,user.id);
   if(me&&!me.group_id){
    const others=all('SELECT user_id FROM live_waiting_members WHERE activity_id=? AND minor=? AND group_id IS NULL AND user_id<>?',aid,me.minor,user.id),left=3-others.length-1;
    for(const o of others)notify(o.user_id,'「'+a.title+'」のラウンジに、同じ活動が気になる人が来ました。'+(left>0?'あと'+left+'人でグループになります。':''),'waiting/'+aid,'waiting-arrival:'+aid+':'+user.id+':'+o.user_id);
   }
   notify(a.owner_id,'「'+a.title+'」のラウンジに、参加を検討している人が来ました。質問への回答や活動内容の補足が、参加の後押しになります。','waitingManage','waiting-owner:'+aid+':'+now().slice(0,10));
  }
  return snapshot(aid,user);
 }
 function leave(aid,user){
  activity(aid);run('DELETE FROM live_waiting_members WHERE activity_id=? AND user_id=?',aid,user.id);reconcile(aid);return {ok:true};
 }
 function greet(aid,user,input){
  const data=snapshot(aid,user);if(data.state!=='MATCHED')throw fail(403,'3人以上の仲間がそろうと、グループにあいさつを送れます。');
  if(!Object.hasOwn(GREETINGS,input.phrase))throw fail(400,'用意されたあいさつから選んでください。');
  const m=one('SELECT * FROM live_waiting_members WHERE activity_id=? AND user_id=?',aid,user.id);
  run('INSERT OR IGNORE INTO live_waiting_greetings VALUES(?,?,?,?,?,?)',randomUUID(),m.group_id,user.id,m.display_name,input.phrase,now());return snapshot(aid,user);
 }
 function operatorSnapshot(user){
  reconcileAll();
  const activities=all('SELECT DISTINCT a.id FROM live_waiting_members w JOIN live_activities a ON a.id=w.activity_id JOIN live_communities c ON c.id=a.community_id WHERE c.owner_id=? OR ?=1',user.id,isAdmin(user)?1:0);
  return {rooms:activities.map(({id:aid})=>{
   const a=activity(aid),members=all('SELECT * FROM live_waiting_members WHERE activity_id=? ORDER BY joined_at,user_id',aid);
   const groups=[...new Set(members.map(m=>m.group_id).filter(Boolean))].map((gid,index)=>({label:'グループ '+(index+1),members:members.filter(m=>m.group_id===gid).map(m=>m.display_name),greetings:all('SELECT id,display_name,phrase,created_at FROM live_waiting_greetings WHERE group_id=? ORDER BY created_at,id',gid).map(m=>({name:m.display_name,text:GREETINGS[m.phrase],createdAt:m.created_at}))}));
   return {activityId:aid,title:a.title,startsAt:a.starts_at,waiting:members.filter(m=>!m.group_id).length,groups};
  })};
 }
 function spaceMember(aid,user){
  requirePublic(aid,user);
  const m=one('SELECT * FROM live_waiting_members WHERE activity_id=? AND user_id=?',aid,user.id);
  if(!m?.group_id||conditions.pending(aid))throw fail(403,'3人以上の仲間がそろうと、ひろばに入れます。');
  const t=clock();
  for(const [gid,room] of spaces){for(const [uid,p] of room)if(t-p.seenAt>FORGET_MS)room.delete(uid);if(!room.size)spaces.delete(gid);}
  for(const [gid,list] of histories){while(list.length&&t-list[0].at>HISTORY_MS)list.shift();if(!list.length)histories.delete(gid);}
  if(!spaces.has(m.group_id))spaces.set(m.group_id,new Map());
  return {m,room:spaces.get(m.group_id),t};
 }
 function spaceView({m,room,t},user){
  const members=all('SELECT user_id,display_name FROM live_waiting_members WHERE group_id=? ORDER BY joined_at,user_id',m.group_id);
  for(const uid of room.keys())if(!members.some(r=>r.user_id===uid))room.delete(uid);
  const names=new Map(members.map(r=>[r.user_id,r.display_name]));
  const history=(histories.get(m.group_id)||[]).filter(h=>names.has(h.userId)).slice(-HISTORY_MAX).reverse().map(h=>({name:names.get(h.userId),isMe:h.userId===user.id,stamp:h.stamp,ago:Math.max(0,Math.floor((t-h.at)/1000))}));
  return {stamps:STAMPS,history,members:members.map((r,i)=>{
   const p=room.get(r.user_id),[x,y]=p?[p.x,p.y]:SEATS[i%SEATS.length],stamp=p&&t-p.stampAt<STAMP_MS?p.stamp:null;
   return {name:r.display_name,isMe:r.user_id===user.id,tone:i%4,x,y,online:!!p&&t-p.seenAt<ONLINE_MS,stamp,stampId:stamp?String(p.stampAt):null};
  })};
 }
 function presence(ctx,user){
  const members=all('SELECT user_id FROM live_waiting_members WHERE group_id=? ORDER BY joined_at,user_id',ctx.m.group_id),i=members.findIndex(r=>r.user_id===user.id);
  if(!ctx.room.has(user.id)){const [x,y]=SEATS[Math.max(i,0)%SEATS.length];ctx.room.set(user.id,{x,y,stamp:null,stampAt:0,seenAt:ctx.t});}
  const p=ctx.room.get(user.id);p.seenAt=ctx.t;return p;
 }
 function space(aid,user){const ctx=spaceMember(aid,user);presence(ctx,user);return spaceView(ctx,user);}
 function move(aid,user,input){
  const ctx=spaceMember(aid,user);
  if(!Number.isFinite(input.x)||!Number.isFinite(input.y))throw fail(400,'移動先を確認してください。');
  const p=presence(ctx,user),clamp=(v,lo,hi)=>Math.round(Math.min(hi,Math.max(lo,v))*10)/10;
  p.x=clamp(input.x,10,90);p.y=clamp(input.y,14,90);return spaceView(ctx,user);
 }
 function stamp(aid,user,input){
  const ctx=spaceMember(aid,user);
  if(!Object.hasOwn(STAMPS,input.stamp))throw fail(400,'用意されたスタンプから選んでください。');
  const p=presence(ctx,user);if(ctx.t-p.stampAt<STAMP_GAP_MS)throw fail(429,'少し待ってから、もう一度送ってください。');
  p.stamp=input.stamp;p.stampAt=ctx.t;
  if(!histories.has(ctx.m.group_id))histories.set(ctx.m.group_id,[]);
  const list=histories.get(ctx.m.group_id);list.push({userId:user.id,stamp:input.stamp,at:ctx.t});if(list.length>HISTORY_MAX*4)list.splice(0,list.length-HISTORY_MAX*4);
  return spaceView(ctx,user);
 }
 function joinedFor(user){return all('SELECT activity_id FROM live_waiting_members WHERE user_id=?',user.id).map(r=>r.activity_id);}
 return {snapshot,join,leave,greet,space,move,stamp,reconcile,reconcileAll,operatorSnapshot,joinedFor};
}
module.exports={createWaitingRooms};
