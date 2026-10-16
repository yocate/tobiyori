const crypto=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const stamp=()=>new Date().toISOString();
const list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'):[];
function money(v,label){
 if(v===undefined||v===null||v==='')return null;
 if((typeof v!=='number'&&typeof v!=='string')||!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)>1000000)throw fail(400,label+'は0〜1,000,000円の整数で入力してください。');
 return Number(v);
}
function cleanPreferences(v={}){
 if(!v||typeof v!=='object'||Array.isArray(v))throw fail(400,'参加条件の形式を確認してください。');
 const from=v.from||'',until=v.until||'';
 for(const t of [from,until])if(typeof t!=='string'||(t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw fail(400,'参加できる時間帯を確認してください。');
 if(!!from!==!!until||(from&&from>=until))throw fail(400,'時間帯は開始・終了を両方入力し、同じ日の開始より後の時刻を選んでください。');
 return {budget:money(v.budget,'参加費の上限'),from,until};
}
function conditionFields(input){
 const activityCity=input.activityCity||'';
 if(typeof activityCity!=='string'||activityCity.length>60)throw fail(400,'会場の市町村を確認してください。');
 return {feeAmount:money(input.feeAmount,'参加費'),activityCity:activityCity.trim()};
}
const format=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function local(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;const parts=Object.fromEntries(format.formatToParts(date).map(p=>[p.type,p.value]));return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`,day:['日','月','火','水','木','金','土'][new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day)).getUTCDay()]};}
function snapshot(a){const d=JSON.parse(a.data);return {startsAt:a.starts_at,endsAt:a.ends_at,...Object.fromEntries(['activityKind','participationScope','companyKind','companyRole','employmentType','workplace','workSchedule','selectionProcess','applicationURL','feeAmount','fees','activityCity','targetYears','highSchoolParticipation','requirements','location','transport','staff','insurance','risk','emergency','photoPolicy'].map(k=>[k,d[k]??(k==='targetYears'?[]:k==='feeAmount'?null:'')]))};}
const labels={activityKind:'活動の種類',participationScope:'団体に所属していない方の参加',companyKind:'企業の募集区分',companyRole:'職種・体験内容',employmentType:'雇用形態',workplace:'勤務・実施場所',workSchedule:'勤務・実施時間',selectionProcess:'選考の流れ',applicationURL:'公式応募ページ',startsAt:'開始日時',endsAt:'終了日時',feeAmount:'参加費（円）',fees:'費用の補足',activityCity:'会場の市町村',targetYears:'対象学年',highSchoolParticipation:'高校生の参加',requirements:'参加条件',location:'集合場所',transport:'交通手段',staff:'担当者',insurance:'保険',risk:'危険性と対策',emergency:'緊急連絡先',photoPolicy:'写真撮影'};
function difference(before,after,privateAccess=false){return Object.entries(labels).filter(([k])=>JSON.stringify(before[k])!==JSON.stringify(after[k])).map(([key,label])=>({key,label,before:!privateAccess&&['location','emergency'].includes(key)?'承認後に表示':before[key],after:!privateAccess&&['location','emergency'].includes(key)?'承認後に表示':after[key]}));}
function evaluate(s,p={}){
 let preferences;try{preferences=cleanPreferences(p.participation||{});}catch{preferences={budget:null,from:'',until:''};}
 const start=local(s.startsAt),end=local(s.endsAt),rows=[];
 const row=(key,label,status,message)=>rows.push({key,label,status,message});
 const days=list(p.days),areas=list(p.areas);
 if(days.length)row('days','曜日',!start||!end?'unknown':start.date!==end.date?'unknown':days.includes(start.day)?'match':'mismatch',!start||!end?'日時を確認してください。':start.date!==end.date?'日をまたぐ活動です。参加できる日程か確認してください。':days.includes(start.day)?'登録した参加可能曜日に合っています。':'参加できる曜日から外れています。');
 else row('days','曜日','unset','参加できる曜日が未登録です。');
 if(preferences.from)row('time','時間帯',!start||!end?'unknown':start.date===end.date&&start.time>=preferences.from&&end.time<=preferences.until?'match':'mismatch',start&&end&&start.date===end.date&&start.time>=preferences.from&&end.time<=preferences.until?'登録した時間帯に収まっています。':'登録した時間帯に収まらないため、予定を確認してください。');
 else row('time','時間帯','unset','参加できる時間帯が未登録です。');
 if(preferences.budget!==null)row('budget','参加費',s.feeAmount===null||s.feeAmount===undefined?'unknown':s.feeAmount>preferences.budget?'mismatch':'match',s.feeAmount===null||s.feeAmount===undefined?'参加費の金額が未確認です。':s.feeAmount>preferences.budget?`希望予算を${(s.feeAmount-preferences.budget).toLocaleString('ja-JP')}円超えています。`:'登録した参加費の上限以内です。');
 else row('budget','参加費','unset','参加費の上限が未登録です。');
 if(areas.length)row('area','地域',!s.activityCity?'unknown':areas.includes(s.activityCity)?'match':'mismatch',!s.activityCity?'会場の市町村が未登録です。':areas.includes(s.activityCity)?'希望する地域に含まれています。':'希望する地域から外れています。');
 else row('area','地域','unset','希望する地域が未登録です。');
 if(p.year==='高校生')row('year','参加対象',['allowed','visit'].includes(s.highSchoolParticipation)?'match':s.highSchoolParticipation==='unknown'?'unknown':'mismatch',s.highSchoolParticipation==='visit'?'高校生は見学のみです。参加方法も確認してください。':s.highSchoolParticipation==='allowed'?'高校生の参加を受け付けています。':'高校生の受け入れ条件を確認してください。');
 else if(list(s.targetYears).length)row('year','参加対象',!p.year?'unknown':s.targetYears.includes(p.year)?'match':'mismatch',!p.year?'学年が未登録のため、対象学年を確認してください。':s.targetYears.includes(p.year)?'登録した学年が対象に含まれます。':'登録した学年が対象に含まれていません。');
 return rows;
}
function createParticipationConditions({db,notify,audit,activity,validForReview}){
 db.exec(`CREATE TABLE IF NOT EXISTS live_activity_change_requests(activity_id TEXT PRIMARY KEY REFERENCES live_activities(id),id TEXT NOT NULL UNIQUE,content TEXT NOT NULL,base_updated_at TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_condition_changes(id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES live_activities(id),before_data TEXT NOT NULL,after_data TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_condition_receipts(change_id TEXT NOT NULL REFERENCES live_condition_changes(id),application_id TEXT NOT NULL REFERENCES live_applications(id),user_id TEXT NOT NULL REFERENCES accounts(id),ack_at TEXT,PRIMARY KEY(change_id,application_id));
 CREATE INDEX IF NOT EXISTS live_condition_changes_activity ON live_condition_changes(activity_id,created_at);
 CREATE INDEX IF NOT EXISTS live_condition_receipts_user ON live_condition_receipts(user_id);`);
 const one=(sql,...v)=>db.prepare(sql).get(...v),all=(sql,...v)=>db.prepare(sql).all(...v),run=(sql,...v)=>db.prepare(sql).run(...v);
 const pending=aid=>one('SELECT * FROM live_activity_change_requests WHERE activity_id=?',aid);
 const transaction=fn=>require('./tx.cjs').transaction(db,fn,'participation_change');
 function profile(uid){if(!one("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'"))return {};try{return JSON.parse(one('SELECT content FROM workspaces WHERE user_id=?',uid)?.content||'{}').profile||{};}catch{return {};}}
 function latest(p){return one('SELECT c.*,r.ack_at FROM live_condition_changes c JOIN live_condition_receipts r ON r.change_id=c.id WHERE r.application_id=? AND c.created_at>=(SELECT created_at FROM live_applications WHERE id=r.application_id) ORDER BY c.rowid DESC LIMIT 1',p.id);}
 function required(p){const r=latest(p);return !!r&&!r.ack_at;}
 function summary(p,owned){
  const waiting=!!pending(p.activity_id),r=latest(p);if(!r)return {pending:waiting};
  if(owned)return {pending:waiting,changeId:r.id,ackAt:r.ack_at,needsConfirmation:!r.ack_at};
  const before=JSON.parse(r.before_data),after=JSON.parse(r.after_data),prefs=profile(p.user_id);
  return {pending:waiting,changeId:r.id,createdAt:r.created_at,ackAt:r.ack_at,needsConfirmation:!r.ack_at,differences:difference(before,after,['APPROVED','DONE'].includes(p.status)),beforeChecks:evaluate(before,prefs),checks:evaluate(after,prefs)};
 }
 function propose(a,candidate,input,user){
  if(!a.published_at||!['PUBLISHED','CLOSED'].includes(a.status)||a.ends_at<=stamp()||one("SELECT 1 FROM live_applications WHERE activity_id=? AND status='DONE'",a.id))throw fail(409,'公開済みで、開催前・参加完了前の活動だけ変更できます。');
  if(pending(a.id))throw fail(409,'変更案を確認中です。差し戻し後に修正してください。');
  if(input.baseUpdatedAt!==a.updated_at)throw fail(409,'募集が更新されています。再読み込みしてください。');
  validForReview(candidate);
  if(candidate.capacity<one("SELECT COUNT(*) AS n FROM live_applications WHERE activity_id=? AND status='APPROVED'",a.id).n)throw fail(400,'承認済みの人数より定員を減らせません。');
  if(!difference(snapshot(a),snapshot(candidate),true).length&&candidate.title===a.title&&candidate.capacity===a.capacity&&candidate.data===a.data)throw fail(400,'変更する内容がありません。');
  const changeId=crypto.randomUUID();
  transaction(()=>{
   run('INSERT INTO live_activity_change_requests VALUES(?,?,?,?,?)',a.id,changeId,JSON.stringify(candidate),a.updated_at,stamp());
   for(const p of all("SELECT * FROM live_applications WHERE activity_id=? AND status IN ('APPLIED','APPROVED')",a.id))notify(p.user_id,'「'+a.title+'」の変更案を運営が確認中です。確定後に変更内容をお知らせします。','myactivity','condition-pending:'+changeId+':'+p.id);
   for(const u of all("SELECT user_id FROM account_roles WHERE role='ADMIN'"))notify(u.user_id,'「'+a.title+'」の変更案を確認してください。新規受付は保留中です。','admin','condition-review:'+changeId+':'+u.user_id);
   audit(user,'activity_change_propose',a.id,changeId);
  });return {ok:true,changeId};
 }
 function review(a,input,action,user){
  const request=pending(a.id);if(!request)return false;
  if(input.changeId!==request.id)throw fail(409,'変更案が更新されています。再読み込みしてください。');
  if(!['approve','return'].includes(action))throw fail(400,'変更案の操作を確認してください。');
  const next=JSON.parse(request.content);
  if(action==='approve'){
   if(a.updated_at!==request.base_updated_at||!['PUBLISHED','CLOSED'].includes(a.status))throw fail(409,'募集の状況が変わりました。変更案を差し戻してください。');
   if(a.community_status!=='VERIFIED'||a.paused)throw fail(400,'団体の確認状態を見直してください。');
   validForReview(next);
   if(next.capacity<one("SELECT COUNT(*) AS n FROM live_applications WHERE activity_id=? AND status='APPROVED'",a.id).n)throw fail(409,'承認済みの人数を確認してください。');
  }
  transaction(()=>{
   if(action==='approve'){
    const before=snapshot(a),after=snapshot(next),when=stamp();
    run('UPDATE live_activities SET title=?,starts_at=?,ends_at=?,capacity=?,data=?,review_note=?,updated_at=? WHERE id=?',next.title,next.starts_at,next.ends_at,next.capacity,next.data,input.note,when,a.id);
    run('INSERT INTO live_condition_changes VALUES(?,?,?,?,?)',request.id,a.id,JSON.stringify(before),JSON.stringify(after),when);
    for(const p of all("SELECT * FROM live_applications WHERE activity_id=? AND status IN ('APPLIED','APPROVED')",a.id)){
     run('INSERT INTO live_condition_receipts VALUES(?,?,?,NULL)',request.id,p.id,p.user_id);
     const warnings=evaluate(after,profile(p.user_id)).filter(c=>c.status==='mismatch').map(c=>c.label);
     notify(p.user_id,'「'+next.title+'」の条件が変更されました。'+(warnings.length?'希望と合わない項目：'+warnings.join('・')+'。':'')+'変更前後を確認してください。','myactivity','condition-change:'+request.id+':'+p.id);
    }
   }
   run('DELETE FROM live_activity_change_requests WHERE activity_id=?',a.id);
   if(action==='return')for(const p of all("SELECT * FROM live_applications WHERE activity_id=? AND status IN ('APPLIED','APPROVED')",a.id))notify(p.user_id,'「'+a.title+'」の変更案は差し戻されました。現在の条件をご確認ください。','myactivity','condition-return:'+request.id+':'+p.id);
   notify(a.owner_id,'「'+a.title+'」の変更案：'+(action==='approve'?'承認・参加者へ通知しました。':'差し戻しました。')+input.note,'org');
   audit(user,'activity_change_'+action,a.id,input.note);
  });return true;
 }
 function acknowledge(changeId,user){
  const r=one('SELECT r.*,p.status,p.activity_id FROM live_condition_receipts r JOIN live_applications p ON p.id=r.application_id WHERE r.change_id=? AND r.user_id=?',changeId,user.id);
  if(!r)throw fail(404,'変更通知が見つかりません。');
  if(!['APPLIED','APPROVED'].includes(r.status)||pending(r.activity_id)||latest({id:r.application_id})?.id!==changeId)throw fail(409,'新しい変更内容と申込み状況を確認してください。');
  run('UPDATE live_condition_receipts SET ack_at=COALESCE(ack_at,?) WHERE change_id=? AND user_id=?',stamp(),changeId,user.id);
  audit(user,'activity_change_ack',r.activity_id,changeId);return {ok:true};
 }
 return {pending,summary,required,propose,review,acknowledge,snapshot,difference,clear:aid=>run('DELETE FROM live_activity_change_requests WHERE activity_id=?',aid)};
}
module.exports={cleanPreferences,conditionFields,snapshot,evaluate,difference,createParticipationConditions};
