const {matchesCommunityOffer}=require('./成果物/community-genres.js');
const {isCareerListing,isRecruitment}=require('./成果物/company-catalog.js');
const {participationBadges}=require('./participation-badges.cjs');
const {createDailyVisits}=require('./daily-visits.cjs');
const {PROFILE_SKILLS,profileSkillsFor}=require('./成果物/profile-signals.js');
const crypto=require('node:crypto');
const {communityExtras,activityExtras}=require('./community-discovery-data.cjs');
const {createOfficialUpdates}=require('./official-updates.cjs');
const {conditionFields,createParticipationConditions}=require('./participation-conditions.cjs');
const {createSerendipity}=require('./serendipity.cjs');
const id=()=>crypto.randomUUID();
const bad=(status,message)=>Object.assign(new Error(message),{status});
const now=()=>new Date().toISOString();
function text(value,max=3000){if(typeof value!=='string'||value.length>max)throw bad(400,'入力が長すぎるか、形式が違います。');return value.trim();}
function required(value,label,max=3000){const v=text(value,max);if(!v)throw bad(400,label+'を入力してください。');return v;}
function date(value){const d=Date.parse(value);if(!Number.isFinite(d))throw bad(400,'開催日時を確認してください。');return new Date(d).toISOString();}
function safeURL(value){if(!value)return '';try{const u=new URL(text(value,1000));if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw 0;return u.href;}catch{throw bad(400,'ホームページ・SNSは https:// から始まるURLを入力してください。');}}
function communityData(input){
 const photos=input.photos||[];
 if(!Array.isArray(photos)||photos.length>3||photos.some(p=>!p||typeof p.src!=='string'||p.src.length>900000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.src)))throw bad(400,'写真はJPEG・PNG・WebPで3枚までです。');
 const links={};for(const k of ['website','instagram','x','youtube','other'])if(input.links?.[k])links[k]=safeURL(input.links[k]);
 const genres=input.genres||[];if(!Array.isArray(genres)||genres.length>30)throw bad(400,'活動ジャンルを確認してください。');
 return {sponsorListed:input.sponsorListed===true,sponsorMessage:text(input.sponsorMessage||'',300),intro:required(input.intro,'紹介文'),type:required(input.type,'団体の種類',60),university:text(input.university||'',100),genres:[...new Set(genres.map(g=>required(g,'ジャンル',60)))],schedule:text(input.schedule||'',500),audience:text(input.audience||'',500),welcome:text(input.welcome||'',1500),transport:text(input.transport||'',500),links,photos:photos.map(p=>({src:p.src,caption:text(p.caption||'',100)})),...communityExtras(input)};
}
function adminCommunityData(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw bad(400,'運営用の情報を確認してください。');
 const email=text(input.email||'',254);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw bad(400,'担当者のメールアドレスを確認してください。');
 if(input.consentConfirmed!==undefined&&typeof input.consentConfirmed!=='boolean')throw bad(400,'掲載同意の確認形式を確認してください。');
 return {representative:text(input.representative||'',100),email,phone:text(input.phone||'',60),source:text(input.source||'',1000),notes:text(input.notes||'',3000),consentConfirmed:input.consentConfirmed===true};
}
function activityData(input){
 const data={};
 for(const k of ['purpose','tasks','staff','requirements','belongings','risk','insurance','photoPolicy','transport','prohibited','location','emergency'])data[k]=text(input[k]||'');
 data.genre=text(input.genre||'その他',60);data.beginner=input.beginner===true;data.help=input.help===true;
 return {...data,...activityExtras(input),...conditionFields(input)};
}
function createCommunityService({db,sourceOptions={}}){
 db.exec(`CREATE TABLE IF NOT EXISTS account_roles(user_id TEXT PRIMARY KEY REFERENCES accounts(id),role TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_communities(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES accounts(id),name TEXT NOT NULL,city TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',paused INTEGER NOT NULL DEFAULT 0,review_note TEXT NOT NULL DEFAULT '',confirmed_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_community_admin(community_id TEXT PRIMARY KEY REFERENCES live_communities(id),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_activities(id TEXT PRIMARY KEY,community_id TEXT NOT NULL REFERENCES live_communities(id),title TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,capacity INTEGER NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'DRAFT',review_note TEXT NOT NULL DEFAULT '',published_at TEXT,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_applications(id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES live_activities(id),user_id TEXT NOT NULL REFERENCES accounts(id),kind TEXT NOT NULL,message TEXT NOT NULL,minor INTEGER NOT NULL,guardian INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'APPLIED',created_at TEXT NOT NULL,UNIQUE(activity_id,user_id));
 CREATE TABLE IF NOT EXISTS live_messages(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES live_applications(id),sender_id TEXT NOT NULL REFERENCES accounts(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_activity_messages(id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES live_activities(id),sender_id TEXT NOT NULL REFERENCES accounts(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_reviews(id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES live_activities(id),user_id TEXT NOT NULL REFERENCES accounts(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL,anonymous INTEGER NOT NULL DEFAULT 1 CHECK(anonymous IN (0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(activity_id,user_id));
 CREATE INDEX IF NOT EXISTS live_applications_status_activity ON live_applications(status,activity_id);
 CREATE INDEX IF NOT EXISTS live_activities_community ON live_activities(community_id);
 CREATE TABLE IF NOT EXISTS live_community_verifications(community_id TEXT PRIMARY KEY REFERENCES live_communities(id),checked_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_follows(community_id TEXT NOT NULL REFERENCES live_communities(id),user_id TEXT NOT NULL REFERENCES accounts(id),PRIMARY KEY(community_id,user_id));
 CREATE TABLE IF NOT EXISTS live_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),body TEXT NOT NULL,route TEXT NOT NULL,created_at TEXT NOT NULL,is_read INTEGER NOT NULL DEFAULT 0,unique_key TEXT UNIQUE);
 CREATE TABLE IF NOT EXISTS live_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);`);
 db.exec(`CREATE TABLE IF NOT EXISTS live_community_changes(community_id TEXT PRIMARY KEY REFERENCES live_communities(id),content TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),community_id TEXT NOT NULL REFERENCES live_communities(id),activity_id TEXT,kind TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',reply TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS live_blocks(user_id TEXT NOT NULL REFERENCES accounts(id),community_id TEXT NOT NULL REFERENCES live_communities(id),PRIMARY KEY(user_id,community_id));
 CREATE TABLE IF NOT EXISTS live_form_drafts(user_id TEXT NOT NULL REFERENCES accounts(id),draft_key TEXT NOT NULL,content TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,draft_key));
 CREATE TABLE IF NOT EXISTS live_offers(id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES live_activities(id),user_id TEXT NOT NULL REFERENCES accounts(id),body TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'NEW',created_at TEXT NOT NULL,UNIQUE(activity_id,user_id));
 CREATE TABLE IF NOT EXISTS live_offer_campaigns(id TEXT PRIMARY KEY,community_id TEXT NOT NULL REFERENCES live_communities(id),created_at TEXT NOT NULL,sent_count INTEGER NOT NULL);`);
 db.exec('CREATE TABLE IF NOT EXISTS live_journey_badges(user_id TEXT NOT NULL REFERENCES accounts(id),chapter INTEGER NOT NULL CHECK(chapter>0),earned_at TEXT NOT NULL,PRIMARY KEY(user_id,chapter));');
 db.exec('CREATE TABLE IF NOT EXISTS live_participation_badges(user_id TEXT NOT NULL REFERENCES accounts(id),badge_key TEXT NOT NULL,data TEXT NOT NULL,earned_at TEXT NOT NULL,PRIMARY KEY(user_id,badge_key));');
 const engagement=require('./community-engagement.cjs').createCommunityEngagement({db});
 const officialUpdates=createOfficialUpdates({db,...sourceOptions});
 const dailyVisits=createDailyVisits({db});
 const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 const admin=user=>!!user&&one('SELECT role FROM account_roles WHERE user_id=?',user.id)?.role==='ADMIN';
 const adminInfo=cid=>JSON.parse(one('SELECT data FROM live_community_admin WHERE community_id=?',cid)?.data||'{}');
 const saveAdminInfo=(cid,data)=>run('INSERT INTO live_community_admin VALUES(?,?) ON CONFLICT(community_id) DO UPDATE SET data=excluded.data',cid,JSON.stringify(data));
 function notify(userId,body,route,key=null){run('INSERT OR IGNORE INTO live_notifications VALUES(?,?,?,?,?,0,?)',id(),userId,body,route,now(),key);}
 function blocked(user,cid){return !!user&&!!one('SELECT 1 FROM live_blocks WHERE user_id=? AND community_id=?',user.id,cid);}
 function notifyAdmins(body,route='reports'){for(const u of all("SELECT user_id FROM account_roles WHERE role='ADMIN'"))notify(u.user_id,body,route);}
 function audit(user,action,target,note=''){run('INSERT INTO live_audit VALUES(?,?,?,?,?,?)',id(),user.id,action,target,note,now());}
 const conditions=createParticipationConditions({db,notify,audit,activity,validForReview});
 const waitingRooms=require('./waiting-room.cjs').createWaitingRooms({db,notify,activity,blocked,conditions,isAdmin:admin});
 const serendipity=createSerendipity({db,activitiesForUser:user=>all("SELECT a.* FROM live_activities a JOIN live_communities c ON c.id=a.community_id WHERE a.status='PUBLISHED' AND c.status='VERIFIED' AND c.paused=0 ORDER BY a.starts_at")
   .filter(a=>!isCareerListing(JSON.parse(a.data))&&!blocked(user,a.community_id)&&!conditions.pending(a.id)&&org(a.community_id).owner_id!==user.id&&listingDeadline(a)>now()&&a.starts_at>now())
   .filter(a=>!one("SELECT 1 FROM live_applications WHERE activity_id=? AND user_id=? AND status<>'CANCELLED'",a.id,user.id)&&one("SELECT COUNT(*) AS n FROM live_applications WHERE activity_id=? AND status='APPROVED'",a.id).n<a.capacity)
   .map(a=>({...publicActivity(a),communityName:org(a.community_id).name}))});
 function tidy(){
   engagement.purgeExpired();
   waitingRooms.reconcileAll();
   run("UPDATE live_activities SET status='CLOSED',updated_at=? WHERE status='PUBLISHED' AND ends_at<=? AND NOT EXISTS (SELECT 1 FROM live_activity_change_requests q WHERE q.activity_id=live_activities.id)",now(),now());
   for(const p of all("SELECT p.id,p.user_id,a.title FROM live_applications p JOIN live_activities a ON a.id=p.activity_id WHERE p.status='APPLIED' AND a.ends_at<>'' AND a.ends_at<=? AND NOT EXISTS (SELECT 1 FROM live_activity_change_requests q WHERE q.activity_id=a.id)",now())){
     run("UPDATE live_applications SET status='EXPIRED' WHERE id=? AND status='APPLIED'",p.id);
     notify(p.user_id,'「'+p.title+'」は開催終了までに承認されなかったため、受付終了になりました。','myactivity','expired:'+p.id);
   }
   for(const a of all("SELECT DISTINCT a.id,a.title,c.owner_id FROM live_activities a JOIN live_communities c ON c.id=a.community_id JOIN live_applications p ON p.activity_id=a.id WHERE p.status='APPROVED' AND a.ends_at<>'' AND a.ends_at<=?",now()))notify(a.owner_id,'「'+a.title+'」の開催が終了しました。実際の参加を確認し、活動完了を記録してください。','org','complete-reminder:'+a.id);
   const due=new Date(Date.now()-60*86400000).toISOString();
   for(const c of all("SELECT * FROM live_communities WHERE confirmed_at<? AND status='VERIFIED' AND paused=0",due))notify(c.owner_id,'団体情報が今も正しいか確認してください。変更がなければワンタップで更新できます。','org','remind:'+c.id+':'+c.confirmed_at);
 }
 const timer=setInterval(tidy,60000);timer.unref();tidy();
 function org(orgId,user,checkOwner=false){const c=one('SELECT * FROM live_communities WHERE id=?',orgId);if(!c)throw bad(404,'団体が見つかりません。');if(checkOwner&&c.owner_id!==user?.id)throw bad(403,'この団体は編集できません。');return c;}
 function activity(actId){const a=one('SELECT a.*,c.owner_id,c.name AS community_name,c.status AS community_status,c.paused FROM live_activities a JOIN live_communities c ON c.id=a.community_id WHERE a.id=?',actId);if(!a)throw bad(404,'募集が見つかりません。');return a;}
 function buzz(cid){
   return engagement.buzz(cid);
 }
 function retention(cid){
   const rows=all("SELECT p.user_id,a.id,a.ends_at FROM live_applications p JOIN live_activities a ON a.id=p.activity_id WHERE a.community_id=? AND p.status='DONE' AND a.ends_at<=? ORDER BY a.ends_at,a.id",cid,now());
   const byPerson=new Map();for(const r of rows){if(!byPerson.has(r.user_id))byPerson.set(r.user_id,[]);byPerson.get(r.user_id).push(r);}
   let repeatPeople=0,eligible=0,returned=0;for(const visits of byPerson.values()){if(visits.length>1)repeatPeople++;const limit=Date.parse(visits[0].ends_at)+30*86400000;if(limit<=Date.now()){eligible++;if(visits.slice(1).some(v=>Date.parse(v.ends_at)<=limit))returned++;}}
   return {attendances:rows.length,people:byPerson.size,repeatPeople,eligible,returned};
 }
 function participationPointsFor(uid){const done=all("SELECT a.data FROM live_applications p JOIN live_activities a ON a.id=p.activity_id JOIN live_communities c ON c.id=a.community_id WHERE p.user_id=? AND p.status='DONE' AND c.owner_id<>p.user_id",uid);const genres=new Set(done.map(a=>JSON.parse(a.data).genre).filter(Boolean));const reviews=one("SELECT COUNT(*) AS n FROM live_reviews r JOIN live_applications p ON p.activity_id=r.activity_id AND p.user_id=r.user_id JOIN live_activities a ON a.id=r.activity_id JOIN live_communities c ON c.id=a.community_id WHERE r.user_id=? AND p.status='DONE' AND c.owner_id<>p.user_id",uid).n;return done.length*30+genres.size*20+reviews*10;}
 function awardJourneyBadges(uid,points){
   if(points===undefined)points=participationPointsFor(uid)+dailyVisits.snapshot(uid).totalPoints;
   const chapter=points<150?0:1+Math.floor((points-150)/100);
   for(let n=1;n<=chapter;n++)run('INSERT OR IGNORE INTO live_journey_badges VALUES(?,?,?)',uid,n,now());
   return all('SELECT chapter,earned_at AS earnedAt FROM live_journey_badges WHERE user_id=? ORDER BY chapter DESC',uid);
 }
 function awardParticipationBadges(uid){
   const rows=all("SELECT a.id AS activityId,a.ends_at AS endsAt,a.data,a.community_id AS communityId,c.name AS communityName FROM live_applications p JOIN live_activities a ON a.id=p.activity_id JOIN live_communities c ON c.id=a.community_id WHERE p.user_id=? AND p.status='DONE' AND c.owner_id<>p.user_id",uid).map(r=>({...r,genre:JSON.parse(r.data).genre}));
   const result=participationBadges(rows);
   for(const b of result.badges)run('INSERT OR IGNORE INTO live_participation_badges VALUES(?,?,?,?)',uid,b.key,JSON.stringify(b),now());
   return {participationBadges:all('SELECT data,earned_at FROM live_participation_badges WHERE user_id=? ORDER BY earned_at DESC,badge_key',uid).map(r=>({...JSON.parse(r.data),earnedAt:r.earned_at})),participationSummary:result.summary};
 }
 function publicReview(r){return {id:r.id,activityId:r.activity_id,communityId:r.community_id,activityTitle:r.activity_title,rating:r.rating,text:r.body,anonymous:true,author:'匿名の参加者',createdAt:r.created_at,updatedAt:r.updated_at};}
 const reviewSelect="SELECT r.*,a.community_id,a.title AS activity_title,u.nickname FROM live_reviews r JOIN live_activities a ON a.id=r.activity_id JOIN accounts u ON u.id=r.user_id JOIN live_applications p ON p.activity_id=r.activity_id AND p.user_id=r.user_id AND p.status='DONE'";
 function publicOrg(c){const verification=one('SELECT checked_at FROM live_community_verifications WHERE community_id=?',c.id);return {id:c.id,name:c.name,city:c.city,...JSON.parse(c.data),status:c.status,paused:!!c.paused,confirmedAt:c.confirmed_at,updatedAt:c.updated_at,buzz:buzz(c.id),verification:verification?{checkedAt:verification.checked_at,checkedBy:'トビヨリ運営',items:['代表者の本人確認','活動の実態・目的','掲載同意']}:null};}
 function publicActivity(a,privateAccess=false){const d=JSON.parse(a.data);if(!privateAccess){delete d.location;delete d.emergency;}return {id:a.id,communityId:a.community_id,title:a.title,startsAt:a.starts_at,endsAt:a.ends_at,capacity:a.capacity,status:a.status,publishedAt:a.published_at,updatedAt:a.updated_at,changePending:!!conditions.pending(a.id),...d};}
 function listingDeadline(a){const d=JSON.parse(a.data);return d.deadline||(isRecruitment(d)?a.ends_at:a.starts_at);}
 function validForReview(a){
  const d=JSON.parse(a.data),c=JSON.parse(org(a.community_id).data),job=isRecruitment(d),company=c.sector==='company'||/企業|店舗/.test(c.type||'');
  if(!company&&d.companyKind&&d.companyKind!=='regional')throw bad(400,'企業の募集区分は、企業・店舗の団体で設定してください。');
  const requiredKeys=job?['purpose','tasks','staff','requirements','companyRole','employmentType','workplace','workSchedule','selectionProcess','applicationURL']:['purpose','tasks','staff','requirements','belongings','risk','insurance','photoPolicy','transport','prohibited','location','emergency'];
  if(requiredKeys.some(k=>!d[k]))throw bad(400,job?'仕事内容・応募条件・雇用形態・勤務地・勤務時間・選考の流れ・公式応募URLを記入してください。':'審査に必要な活動内容・安全情報をすべて入力してください。');
  if(isCareerListing(d)&&!d.companyRole)throw bad(400,'職種・体験する仕事を記入してください。');
  if(a.ends_at<=now()||a.starts_at>=a.ends_at)throw bad(400,'終了日時は未来、開始日時より後にしてください。');
  if(d.deadline&&(d.deadline<=now()||d.deadline>(job?a.ends_at:a.starts_at)))throw bad(400,'申込期限は、採用募集の終了日時または活動の開始日時までにしてください。');
  if(company&&(!d.fees||!d.remuneration))throw bad(400,'企業の募集には参加費と報酬・謝礼（採用は給与）の情報を記入してください。');
 }
 function application(appId,user){const a=one('SELECT p.*,a.community_id,c.owner_id,a.title FROM live_applications p JOIN live_activities a ON a.id=p.activity_id JOIN live_communities c ON c.id=a.community_id WHERE p.id=?',appId);if(!a)throw bad(404,'申込みが見つかりません。');if(!user||![a.user_id,a.owner_id].includes(user.id))throw bad(403,'この申込みは確認できません。');return a;}
 function activityRoom(aid,user){
   const a=activity(aid),participant=user&&one("SELECT id FROM live_applications WHERE activity_id=? AND user_id=? AND status IN ('APPROVED','DONE')",aid,user.id);
   if(!user||(a.owner_id!==user.id&&!participant))throw bad(403,'この活動の担当者と、参加を承認された方だけが連絡板を利用できます。');
   if(blocked(user,a.community_id))throw bad(403,'ブロック中の団体の連絡板は利用できません。相談窓口をご利用ください。');
   return a;
 }
 async function handle({req,res,url,user,readBody,respond}){
   if(!url.pathname.startsWith('/api/live/'))return false;
   tidy();const parts=url.pathname.slice(10).split('/'),[resource,key,action]=parts;
   const send=(value,status=200)=>{respond(res,status,value);return true;};
   if(req.method==='GET'&&resource==='catalog'){
     const communities=all("SELECT * FROM live_communities WHERE status='VERIFIED' AND paused=0 ORDER BY name").filter(c=>!blocked(user,c.id)).map(publicOrg);
     const activities=all("SELECT a.* FROM live_activities a JOIN live_communities c ON c.id=a.community_id WHERE a.status='PUBLISHED' AND c.status='VERIFIED' AND c.paused=0 ORDER BY a.starts_at").filter(a=>!blocked(user,a.community_id)&&!conditions.pending(a.id)).map(a=>publicActivity(a));
     return send({communities,activities});
   }
   if(req.method==='GET'&&resource==='official-updates'){
     const c=org(key);if(blocked(user,key)||(c.status!=='VERIFIED'||c.paused)&&!admin(user)&&c.owner_id!==user?.id)throw bad(404,'現在、この団体の情報は公開されていません。');
     return send({updates:officialUpdates.snapshot(c)});
   }
   if(req.method==='GET'&&['reviews','community-reviews'].includes(resource)){
     const a=resource==='reviews'?activity(key):null,c=org(a?a.community_id:key);
     if(c.status!=='VERIFIED'||c.paused||blocked(user,c.id)||(a&&(!a.published_at||!['PUBLISHED','CLOSED'].includes(a.status))))throw bad(404,'現在、この団体・活動の口コミは公開されていません。');
     const offset=Number(url.searchParams.get('offset')||0);
     if(!Number.isSafeInteger(offset)||offset<0)throw bad(400,'表示する範囲が正しくありません。');
     const condition=a?'r.activity_id=?':'a.community_id=?',target=a?a.id:c.id;
     const total=one("SELECT COUNT(*) AS n FROM live_reviews r JOIN live_activities a ON a.id=r.activity_id JOIN live_applications p ON p.activity_id=r.activity_id AND p.user_id=r.user_id AND p.status='DONE' WHERE "+condition,target).n;
     const reviews=all(reviewSelect+' WHERE '+condition+' ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET ?',target,offset).map(publicReview);
     return send({reviews,total,nextOffset:offset+reviews.length<total?offset+reviews.length:null});
   }
   if(!user)throw bad(401,'ログインしてください。');
   if(req.headers['x-tobiyori-account']!==user.id)throw bad(409,'別の画面でログイン状態が変わりました。再読み込みしてください。');
   if(resource==='waiting-room'){
     if(req.method==='GET'&&!key)return send({joinedActivityIds:waitingRooms.joinedFor(user)});
     if(req.method==='GET'&&key==='operator')return send(waitingRooms.operatorSnapshot(user));
     if(req.method==='GET'&&key&&!action)return send(waitingRooms.snapshot(key,user));
     if(req.method==='POST'&&key){const input=await readBody(req);if(action==='join')return send(waitingRooms.join(key,user,input));if(action==='leave')return send(waitingRooms.leave(key,user));if(action==='greet')return send(waitingRooms.greet(key,user,input));}
     throw bad(404,'待合室の操作が見つかりません。');
   }
   if(resource==='serendipity'){
     if(req.method==='GET'&&!key)return send(serendipity.payload(user));
     if(req.method==='POST'){const input=await readBody(req);if(key==='pick'&&!action)return send(serendipity.pick(user));if(key&&action==='feedback')return send(serendipity.feedback(user,key,input.feedback));if(key&&action==='awareness')return send(serendipity.awareness(user,key,input.awareness));}
     throw bad(404,'よりみち発見の操作が見つかりません。');
   }
   if(req.method==='POST'&&resource==='official-updates'){
     const c=org(key);if(!admin(user)&&c.owner_id!==user.id)throw bad(403,'この団体の更新は操作できません。');
     const updates=await officialUpdates.refresh(key);audit(user,'official_source_refresh',key);return send({updates});
   }
   if(req.method==='GET'&&resource==='reports'){
     const rows=admin(user)?all('SELECT * FROM live_reports ORDER BY created_at DESC'):all('SELECT * FROM live_reports WHERE user_id=? ORDER BY created_at DESC',user.id);
     return send({reports:rows.map(({user_id,...r})=>({...r,communityName:org(r.community_id).name}))});
   }
   if(req.method==='GET'&&resource==='drafts')return send({draft:one('SELECT content,updated_at FROM live_form_drafts WHERE user_id=? AND draft_key=?',user.id,key)||null});
   if(req.method==='GET'&&resource==='offers'){
     const rows=all('SELECT * FROM live_offers WHERE user_id=? ORDER BY created_at DESC',user.id).map(o=>{const a=activity(o.activity_id),c=org(a.community_id);const available=c.status==='VERIFIED'&&!c.paused&&!blocked(user,c.id)&&a.status==='PUBLISHED'&&!conditions.pending(a.id)&&listingDeadline(a)>now();return {id:o.id,status:o.status,createdAt:o.created_at,available,...(available?{body:o.body,reason:o.reason,activity:publicActivity(a),communityName:c.name}:{communityName:'受付終了・非公開のコミュニティ'})};});return send({offers:rows});
   }
   if(req.method==='GET'&&resource==='dashboard'){
     const communities=all('SELECT * FROM live_communities WHERE owner_id=?',user.id).map(c=>({...publicOrg(c),reviewNote:c.review_note,retention:retention(c.id)}));
     const activities=all('SELECT a.* FROM live_activities a JOIN live_communities c ON c.id=a.community_id WHERE c.owner_id=? ORDER BY a.updated_at DESC',user.id).map(a=>({...publicActivity(a,true),reviewNote:a.review_note}));
     const applications=all('SELECT p.*,a.title,c.owner_id,c.name AS community_name,u.nickname FROM live_applications p JOIN live_activities a ON a.id=p.activity_id JOIN live_communities c ON c.id=a.community_id JOIN accounts u ON u.id=p.user_id WHERE p.user_id=? OR c.owner_id=? ORDER BY p.created_at DESC',user.id,user.id).map(p=>({...p,owned:p.owner_id===user.id,conditionChange:conditions.summary(p,p.owner_id===user.id),activity:publicActivity(activity(p.activity_id),p.owner_id===user.id||['APPROVED','DONE'].includes(p.status))}));
     const followedCommunities=all('SELECT c.* FROM live_follows f JOIN live_communities c ON c.id=f.community_id WHERE f.user_id=? ORDER BY c.name',user.id).map(c=>c.status==='VERIFIED'&&!c.paused?{...publicOrg(c),available:true}:{id:c.id,name:'確認中・休止中のコミュニティ',available:false});
     const savedCommunities=all('SELECT c.* FROM live_community_saves s JOIN live_communities c ON c.id=s.community_id WHERE s.user_id=? ORDER BY s.created_at DESC,c.id',user.id).filter(c=>!blocked(user,c.id)).map(c=>c.status==='VERIFIED'&&!c.paused?{...publicOrg(c),available:true}:{id:c.id,name:'確認中・休止中のコミュニティ',available:false});
     const unreadRows=all('SELECT route,COUNT(*) AS n FROM live_notifications WHERE user_id=? AND is_read=0 GROUP BY route',user.id);
     const unreadBySurface={operator:0,user:0};for(const n of unreadRows)unreadBySurface[['org','admin','orgSignup','manage','participants','reports'].includes(n.route.split('/')[0])?'operator':'user']+=n.n;
     const reviews=all(reviewSelect+' WHERE r.user_id=? ORDER BY r.created_at DESC,r.id DESC',user.id).map(publicReview);
     const done=applications.filter(p=>!p.owned&&p.status==='DONE');
     const genres=[...new Set(done.map(p=>p.activity.genre).filter(Boolean))];
     const dailyVisit=dailyVisits.snapshot(user.id),journeyPoints=done.length*30+genres.length*20+reviews.length*10+dailyVisit.totalPoints;
     const journeyBadges=awardJourneyBadges(user.id,journeyPoints);
     const participationAchievements=awardParticipationBadges(user.id);
     const blocks=all('SELECT b.community_id AS id,c.name FROM live_blocks b JOIN live_communities c ON c.id=b.community_id WHERE b.user_id=?',user.id);
     return send({...participationAchievements,dailyVisit,journeyPoints,journeyBadges,unreadBySurface,role:admin(user)?'ADMIN':'MEMBER',communities,activities,applications,reviews,followedCommunities,follows:followedCommunities.map(c=>c.id),savedCommunities,saves:savedCommunities.map(c=>c.id),blocks,participationPoints:done.length*30+genres.length*20+reviews.length*10,reviewPoints:reviews.length*10,participationGenres:genres,unreadCount:one('SELECT COUNT(*) AS n FROM live_notifications WHERE user_id=? AND is_read=0',user.id).n,notifications:all('SELECT * FROM live_notifications WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100',user.id)});
   }
   if(req.method==='GET'&&resource==='messages'){
     application(key,user);return send({canSend:false,messages:all('SELECT m.id,m.sender_id,m.body,m.created_at,u.nickname FROM live_messages m JOIN accounts u ON u.id=m.sender_id WHERE application_id=? ORDER BY m.created_at,m.rowid',key)});
   }
   if(req.method==='GET'&&resource==='activity-messages'){
     const a=activityRoom(key,user);
     const messages=all('SELECT m.id,m.sender_id,m.body,m.created_at,u.nickname FROM live_activity_messages m JOIN accounts u ON u.id=m.sender_id WHERE activity_id=? ORDER BY m.created_at,m.rowid',key).map(m=>({...m,nickname:m.sender_id===a.owner_id?'団体の窓口':m.nickname,isStaff:m.sender_id===a.owner_id}));
     return send({title:a.title,canSend:a.community_status==='VERIFIED'&&!a.paused,messages});
   }
   if(req.method==='GET'&&resource==='review'){
     if(!admin(user))throw bad(403,'運営管理者専用です。');
     return send({communities:all("SELECT * FROM live_communities ORDER BY updated_at DESC").map(c=>{const change=one('SELECT content FROM live_community_changes WHERE community_id=?',c.id);return {...publicOrg(c),reviewNote:c.review_note,adminInfo:adminInfo(c.id),pendingChange:change?JSON.parse(change.content):null};}),activities:all("SELECT * FROM live_activities WHERE status='REVIEW' ORDER BY updated_at").map(a=>({...publicActivity(a,true),reviewNote:a.review_note})),activityChanges:all('SELECT q.*,a.title FROM live_activity_change_requests q JOIN live_activities a ON a.id=q.activity_id ORDER BY q.created_at').map(q=>({id:q.id,activityId:q.activity_id,title:q.title,createdAt:q.created_at,proposed:publicActivity(JSON.parse(q.content),true),differences:conditions.difference(conditions.snapshot(activity(q.activity_id)),conditions.snapshot(JSON.parse(q.content)),true)}))});
   }
   if(req.method!=='POST')throw bad(405,'この操作には対応していません。');
   const input=await readBody(req);
   if(resource==='saved-communities'&&key&&!action){
     if(typeof input.saved!=='boolean')throw bad(400,'保存するかどうかを確認してください。');
     const c=org(key);
     if(input.saved&&(c.status!=='VERIFIED'||c.paused||blocked(user,c.id)))throw bad(404,'現在、この団体の情報は公開されていません。');
     engagement.setSaved(c.id,user.id,input.saved);
     return send({saved:input.saved,...(c.status==='VERIFIED'&&!c.paused&&!blocked(user,c.id)?{buzz:buzz(c.id)}:{})});
   }
   if(resource==='community-views'&&key&&!action){
     const c=org(key);
     if(c.status!=='VERIFIED'||c.paused||blocked(user,c.id))throw bad(404,'現在、この団体の情報は公開されていません。');
     if(input.activityId){const a=activity(input.activityId);if(a.community_id!==c.id||!a.published_at||!['PUBLISHED','CLOSED'].includes(a.status))throw bad(404,'現在、この募集は公開されていません。');}
     return send({counted:engagement.recordView(c.id,user.id),buzz:buzz(c.id)});
   }
   if(resource==='daily-visit'&&!key){const dailyVisit=dailyVisits.claim(user.id),journeyPoints=participationPointsFor(user.id)+dailyVisit.totalPoints;return send({dailyVisit,journeyPoints,journeyBadges:awardJourneyBadges(user.id,journeyPoints)});}
   if(resource==='condition-changes'&&action==='ack')return send(conditions.acknowledge(key,user));
   if(resource==='offers'){
     if(action==='send'){
       const a=activity(key),c=org(a.community_id),d=JSON.parse(a.data),cd=JSON.parse(c.data);
       if(c.owner_id!==user.id)throw bad(403,'担当する団体の募集だけ招待できます。');
       if(c.status!=='VERIFIED'||c.paused||a.status!=='PUBLISHED'||conditions.pending(a.id)||listingDeadline(a)<=now())throw bad(400,'確認済み団体の、受付中の募集から招待してください。');
       const interest=text(input.interest||'',80),city=text(input.city||'',60),skill=text(input.skill||'',40);if(skill&&!PROFILE_SKILLS.some(s=>s[0]===skill))throw bad(400,'得意分野を確認してください。');if(!interest&&!city&&!skill)throw bad(400,'興味・希望地域・得意分野のいずれかを指定してください。');
       const since=new Date(Date.now()-86400000).toISOString();if(one('SELECT 1 FROM live_offer_campaigns WHERE community_id=? AND created_at>?',c.id,since))throw bad(429,'招待は1団体につき24時間に1回までです。');
       const body=required(input.body,'招待文',500);let sent=0;
       const hasWorkspaces=one("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'");
       const candidates=hasWorkspaces?all('SELECT user_id,content FROM workspaces'):[];
       const week=new Date(Date.now()-7*86400000).toISOString();
       for(const row of candidates){
         let p;try{p=JSON.parse(row.content).profile||{};}catch{continue;}
         if(p.receiveOffers!==true||row.user_id===user.id||blocked({id:row.user_id},c.id))continue;
         if((cd.sector==='company'||/企業|店舗/.test(cd.type||''))&&(isCareerListing(d)?p.receiveCareerOffers!==true:p.receiveCompanyOffers!==true))continue;
         if(interest&&!matchesCommunityOffer(p.interests,interest)||city&&!(p.areas||[]).includes(city))continue;
         if(skill&&!profileSkillsFor(p).some(s=>s.id===skill))continue;
         if(p.year==='高校生'&&!['allowed','visit'].includes(d.highSchoolParticipation))continue;
         if(d.targetYears?.length&&p.year!=='高校生'&&!d.targetYears.includes(p.year))continue;
         if(one('SELECT 1 FROM live_applications WHERE activity_id=? AND user_id=?',a.id,row.user_id)||one('SELECT 1 FROM live_offers WHERE activity_id=? AND user_id=?',a.id,row.user_id))continue;
         if(one('SELECT COUNT(*) AS n FROM live_offers WHERE user_id=? AND created_at>?',row.user_id,week).n>=3)continue;
         const reason=[skill?'自己PRから選んだ得意分野：'+PROFILE_SKILLS.find(s=>s[0]===skill)[1]:'',interest?'登録した興味に合う招待':'',city?'希望地域の'+city:''].filter(Boolean).join(' ／ ');
         run('INSERT INTO live_offers VALUES(?,?,?,?,?,?,?)',id(),a.id,row.user_id,body,reason,'NEW',now());notify(row.user_id,'「'+c.name+'」から活動への招待が届きました。','offers');sent++;
       }
       run('INSERT INTO live_offer_campaigns VALUES(?,?,?,?)',id(),c.id,now(),sent);audit(user,'offers_send',a.id,String(sent));return send({sent});
     }
     if(!['SEEN','DECLINED'].includes(input.status))throw bad(400,'招待の操作を確認してください。');
     const changed=run('UPDATE live_offers SET status=? WHERE id=? AND user_id=?',input.status,key,user.id);if(!changed.changes)throw bad(404,'招待が見つかりません。');return send({ok:true});
   }
   if(resource==='drafts'){
     const allowed=key==='community-new'||key?.startsWith('community-')||key?.startsWith('activity-');if(!allowed)throw bad(400,'保存先を確認してください。');
     if(key.startsWith('community-')&&!admin(user))throw bad(403,'運営者専用です。');
     if(key.startsWith('activity-')&&activity(key.slice(9)).owner_id!==user.id)throw bad(403,'担当する募集だけ保存できます。');
     if(input.clear){run('DELETE FROM live_form_drafts WHERE user_id=? AND draft_key=?',user.id,key);return send({ok:true});}
     if(!input.content||typeof input.content!=='object'||Array.isArray(input.content))throw bad(400,'下書きの内容を確認してください。');
     const content=JSON.stringify(input.content);if(content.length>500000)throw bad(400,'下書きが大きすぎます。');
     run('INSERT INTO live_form_drafts VALUES(?,?,?,?) ON CONFLICT(user_id,draft_key) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at',user.id,key,content,now());return send({ok:true});
   }
   if(resource==='reports'){
     if(key){if(!admin(user))throw bad(403,'運営者専用です。');const report=one('SELECT * FROM live_reports WHERE id=?',key);if(!report)throw bad(404,'相談が見つかりません。');if(!['OPEN','WORKING','RESOLVED'].includes(input.status))throw bad(400,'対応状況を選んでください。');const reply=text(input.reply||'',2000);run('UPDATE live_reports SET status=?,reply=?,updated_at=? WHERE id=?',input.status,reply,now(),key);notify(report.user_id,'相談・通報の対応状況が更新されました。','support');audit(user,'report_update',key,input.status);return send({ok:true});}
     const c=org(input.communityId);if(input.activityId&&activity(input.activityId).community_id!==c.id)throw bad(400,'対象を確認してください。');
     if(!['相談','通報','事故','変更依頼'].includes(input.kind))throw bad(400,'相談の種類を選んでください。');
     const rid=id(),body=required(input.body,'相談内容',3000);run('INSERT INTO live_reports VALUES(?,?,?,?,?,?,\'OPEN\',\'\',?,?)',rid,user.id,c.id,input.activityId||null,input.kind,body,now(),now());notifyAdmins('新しい'+input.kind+'が届きました。');audit(user,'report_create',rid);return send({id:rid},201);
   }
   if(resource==='blocks'){
     const c=org(key);if(c.owner_id===user.id)throw bad(400,'自分の担当団体はブロックできません。');
     if(input.block===true){run('INSERT OR IGNORE INTO live_blocks VALUES(?,?)',user.id,key);run('DELETE FROM live_follows WHERE user_id=? AND community_id=?',user.id,key);
       engagement.setSaved(key,user.id,false);
       for(const p of all("SELECT p.id,a.title FROM live_applications p JOIN live_activities a ON a.id=p.activity_id WHERE p.user_id=? AND a.community_id=? AND p.status IN ('APPLIED','APPROVED')",user.id,key)){run("UPDATE live_applications SET status='CANCELLED' WHERE id=?",p.id);notify(c.owner_id,'「'+p.title+'」の申込みが取り消されました。','participants');}
     }else run('DELETE FROM live_blocks WHERE user_id=? AND community_id=?',user.id,key);
     audit(user,input.block===true?'block':'unblock',key);return send({ok:true});
   }
   if(resource==='reviews'){
     activity(key);
     const existing=one('SELECT * FROM live_reviews WHERE activity_id=? AND user_id=?',key,user.id);
     if(action==='delete'){
       if(existing){run('DELETE FROM live_reviews WHERE id=? AND user_id=?',existing.id,user.id);audit(user,'review_delete',existing.id);}
       return send({ok:true});
     }
     if(action)throw bad(404,'口コミの操作が見つかりません。');
     if(!one("SELECT id FROM live_applications WHERE activity_id=? AND user_id=? AND status='DONE'",key,user.id))throw bad(403,'担当者が参加完了を確認した活動にのみ口コミを投稿できます。');
     const body=required(input.text,'感想',1000);
     if(body.length<10||!Number.isInteger(input.rating)||input.rating<1||input.rating>5||typeof input.anonymous!=='boolean')throw bad(400,'満足度（1〜5）と10〜1,000文字の感想、匿名表示の設定を確認してください。');
     const rid=existing?.id||id(),timestamp=now();
     run('INSERT INTO live_reviews VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(activity_id,user_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,anonymous=excluded.anonymous,updated_at=excluded.updated_at',rid,key,user.id,input.rating,body,1,timestamp,timestamp);
     awardJourneyBadges(user.id);
     audit(user,existing?'review_update':'review_create',rid);
     return send({id:rid},existing?200:201);
   }
   if(resource==='communities'){
     if(!key){
       if(!admin(user))throw bad(403,'団体の登録はアプリの運営者が行います。');
       const cid=id(),d=communityData(input),privateData=adminCommunityData(input.adminInfo);
       run('INSERT INTO live_communities(id,owner_id,name,city,data,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?)',cid,user.id,required(input.name,'団体名',100),required(input.city,'市町村',60),JSON.stringify(d),now(),now());
       saveAdminInfo(cid,privateData);audit(user,'community_create',cid);return send({id:cid},201);
     }
     const c=org(key);if(c.owner_id!==user.id&&!admin(user))throw bad(403,'この団体は編集できません。');
     if(action==='transfer'){
       if(!admin(user))throw bad(403,'運営者専用です。');const email=required(input.email,'引継ぎ先の登録メールアドレス',254).toLowerCase();const target=one('SELECT id FROM accounts WHERE email=?',email);if(!target)throw bad(400,'登録済みのアカウントを指定してください。');
       run('UPDATE live_communities SET owner_id=?,updated_at=? WHERE id=?',target.id,now(),key);notify(target.id,'団体の担当を引き継ぎました。','org');notify(c.owner_id,'団体の担当者が変更されました。','org');audit(user,'community_transfer',key,target.id);return send({ok:true});
     }
     if(action==='confirm'){run('UPDATE live_communities SET confirmed_at=? WHERE id=?',now(),key);return send({ok:true});}
     if(action==='pause'){run('UPDATE live_communities SET paused=?,updated_at=? WHERE id=?',input.paused===true?1:0,now(),key);return send({ok:true});}
     if(!admin(user))throw bad(403,'団体情報の登録・編集はアプリの運営者が行います。');
     const d=communityData(input),name=required(input.name,'団体名',100),city=required(input.city,'市町村',60),privateData=adminCommunityData(input.adminInfo===undefined?adminInfo(key):input.adminInfo);
     if(c.status==='VERIFIED')run('INSERT INTO live_community_changes VALUES(?,?,?) ON CONFLICT(community_id) DO UPDATE SET content=excluded.content,created_at=excluded.created_at',key,JSON.stringify({name,city,...d}),now());
     else run("UPDATE live_communities SET name=?,city=?,data=?,status='PENDING',review_note='',confirmed_at=?,updated_at=? WHERE id=?",name,city,JSON.stringify(d),now(),now(),key);
     saveAdminInfo(key,privateData);
     audit(user,'community_update',key);return send({ok:true});
   }
   if(resource==='activities'){
     if(!key){
       const c=org(input.communityId,user,true),aid=id();
       run('INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,updated_at) VALUES(?,?,?,?,?,?,?,?)',aid,c.id,'新しい活動','','',5,JSON.stringify(activityData({})),now());return send({id:aid},201);
     }
     const a=activity(key);if(a.owner_id!==user.id)throw bad(403,'この募集は編集できません。');
     if(action==='propose-change'){
       const start=date(input.startsAt),end=date(input.endsAt),capacity=Number(input.capacity);
       if(start>=end||!Number.isInteger(capacity)||capacity<1||capacity>500)throw bad(400,'日時と募集人数（1〜500人）を確認してください。');
       return send(conditions.propose(a,{...a,title:required(input.title,'活動名',120),starts_at:start,ends_at:end,capacity,data:JSON.stringify(activityData(input))},input,user));
     }
     if(action==='duplicate'){
       const aid=id();run('INSERT INTO live_activities(id,community_id,title,starts_at,ends_at,capacity,data,updated_at) VALUES(?,?,?,?,?,?,?,?)',aid,a.community_id,a.title+'（コピー）','','',a.capacity,a.data,now());return send({id:aid},201);
     }
     if(action==='close'||action==='cancel'){
       if(action==='cancel'&&a.ends_at<=now())throw bad(400,'終了した活動は中止できません。');
       const reason=action==='cancel'?required(input.reason,'中止の理由',1000):'';
       if(action==='close'&&conditions.pending(key))throw bad(409,'変更案の確認中です。先に変更案の審査を完了してください。');
       if(action==='cancel')conditions.clear(key);
       run('UPDATE live_activities SET status=?,updated_at=? WHERE id=?',action==='cancel'?'CANCELLED':'CLOSED',now(),key);
       const statuses=action==='cancel'?"('APPLIED','APPROVED')":"('APPLIED')";
       for(const p of all('SELECT id,user_id FROM live_applications WHERE activity_id=? AND status IN '+statuses,key)){run('UPDATE live_applications SET status=? WHERE id=?',action==='cancel'?'CANCELLED':'EXPIRED',p.id);notify(p.user_id,'「'+a.title+'」'+(action==='cancel'?'は中止になりました。'+reason:'は受付を終了しました。'),'myactivity');}
       audit(user,'activity_'+action,key,reason);return send({ok:true});
     }
     if(action==='submit'){if(a.status!=='DRAFT')throw bad(409,'審査に送れるのは下書きの募集です。');validForReview(a);if(a.community_status!=='VERIFIED')throw bad(400,'先に団体の確認が必要です。');run("UPDATE live_activities SET status='REVIEW',review_note='',updated_at=? WHERE id=?",now(),key);return send({ok:true});}
     if(conditions.pending(key))throw bad(409,'変更案を確認中です。');
     if(a.published_at)throw bad(409,'公開後の変更は「変更案を送って審査を依頼」から行ってください。');
     if(one("SELECT id FROM live_applications WHERE activity_id=? AND status IN ('APPROVED','DONE')",key))throw bad(409,'承認済みの参加者がいるため内容を変更できません。次回募集は複製してください。');
     const start=date(input.startsAt),end=date(input.endsAt),capacity=Number(input.capacity);if(start>=end||!Number.isInteger(capacity)||capacity<1||capacity>500)throw bad(400,'日時と募集人数（1〜500人）を確認してください。');
     run("UPDATE live_activities SET title=?,starts_at=?,ends_at=?,capacity=?,data=?,status='DRAFT',review_note='',updated_at=? WHERE id=?",required(input.title,'活動名',120),start,end,capacity,JSON.stringify(activityData(input)),now(),key);return send({ok:true});
   }
   if(resource==='apply'){
     if(conditions.pending(key))throw bad(409,'活動内容の変更を運営が確認中です。新しい申込みは保留しています。');
     const a=activity(key),details=JSON.parse(a.data);if(isRecruitment(details))throw bad(400,'採用・求人への応募は、募集に掲載された公式ページから行ってください。');if(a.status!=='PUBLISHED'||(details.deadline||a.starts_at)<=now()||a.community_status!=='VERIFIED'||a.paused)throw bad(400,'現在、この活動は申込みを受け付けていません。');
     if(blocked(user,a.community_id))throw bad(400,'ブロック中の団体には申し込めません。');
     if(input.year==='高校生'&&!(['allowed','visit'].includes(details.highSchoolParticipation)))throw bad(400,'この活動は高校生の参加を受け付けていません。');
     if(input.year==='高校生'&&details.highSchoolParticipation==='visit'&&input.kind!=='見学')throw bad(400,'高校生は見学のみ申し込めます。');
     if(details.targetYears?.length&&input.year!=='高校生'&&!details.targetYears.includes(input.year))throw bad(400,'対象学年を確認してください。');
     if(a.owner_id===user.id)throw bad(400,'自分が管理する募集には申し込めません。');
     if(!['見学','体験参加','継続参加の相談'].includes(input.kind))throw bad(400,'参加方法を選択してください。');
     if(['minor','guardian'].some(k=>input[k]!==undefined&&typeof input[k]!=='boolean'))throw bad(400,'保護者同意の入力形式を確認してください。');
     if(input.minor===true&&input.guardian!==true)throw bad(400,'18歳未満の方は保護者の同意が必要です。');
     const previous=one('SELECT id,status FROM live_applications WHERE activity_id=? AND user_id=?',key,user.id);
     if(previous&&previous.status!=='CANCELLED')throw bad(409,'この活動には申込み済みです。マイページを確認してください。');
     const aid=previous?.id||id();if(previous)run("UPDATE live_applications SET kind=?,message=?,minor=?,guardian=?,status='APPLIED',created_at=? WHERE id=?",input.kind,text(input.message||'',2000),input.minor?1:0,input.guardian?1:0,now(),aid);else run('INSERT INTO live_applications VALUES(?,?,?,?,?,?,?,?,?)',aid,key,user.id,input.kind,text(input.message||'',2000),input.minor?1:0,input.guardian?1:0,'APPLIED',now());notify(a.owner_id,'「'+a.title+'」に新しい申込みがあります。','participants');audit(user,previous?'application_reapply':'application_create',aid);return send({id:aid},201);
   }
   if(resource==='applications'){
     const p=application(key,user),a=activity(p.activity_id);
     if(action==='cancel'){
       if(p.user_id!==user.id||!['APPLIED','APPROVED'].includes(p.status))throw bad(400,'この申込みは取り消せません。');
       run("UPDATE live_applications SET status='CANCELLED' WHERE id=?",key);waitingRooms.reconcile(a.id);notify(p.owner_id,'「'+p.title+'」の申込みが取り消されました。','org');return send({ok:true});
     }
     if(p.owner_id!==user.id)throw bad(403,'団体の担当者だけが承認できます。');
     const next={approve:'APPROVED',decline:'DECLINED',complete:'DONE'}[action];
     if(!next||(action==='complete'?p.status!=='APPROVED':p.status!=='APPLIED'))throw bad(409,'申込み状況が変わっています。再読み込みしてください。');
     if(action==='approve'){
       if(conditions.pending(a.id)||conditions.required(p))throw bad(409,'活動の変更確認と、参加者による変更内容の確認をお待ちください。');
       if(a.community_status!=='VERIFIED'||a.paused||a.ends_at<=now()||a.status!=='PUBLISHED')throw bad(400,'公開中の募集のみ承認できます。');
       if(p.minor&&input.guardianChecked!==true)throw bad(400,'保護者同意の確認が必要です。');
       if(one("SELECT COUNT(*) AS n FROM live_applications WHERE activity_id=? AND status IN ('APPROVED','DONE')",a.id).n>=a.capacity)throw bad(409,'募集人数の上限です。');
     }
     if(action==='complete'&&a.ends_at>now())throw bad(400,'活動終了後に完了を記録してください。');
     if(action==='complete'&&(conditions.pending(a.id)||conditions.required(p)))throw bad(409,'活動の変更確認と、参加者による変更内容の確認が必要です。');
     run('UPDATE live_applications SET status=? WHERE id=?',next,key);waitingRooms.reconcile(a.id);if(next==='DONE'){awardJourneyBadges(p.user_id);awardParticipationBadges(p.user_id);}notify(p.user_id,'「'+p.title+'」：'+{APPROVED:'参加が承認されました。集合場所を確認してください。',DECLINED:'今回は参加を受け入れられませんでした。',DONE:'参加完了が記録されました。'}[next],'myactivity');audit(user,'application_'+action,key);return send({ok:true});
   }
   if(resource==='messages'){
     application(key,user);throw bad(410,'個別のメッセージは終了しました。承認後に活動の連絡板をご利用ください。');
   }
   if(resource==='activity-messages'){
     const a=activityRoom(key,user);if(a.community_status!=='VERIFIED'||a.paused)throw bad(400,'この団体は確認中・休止中のため、新しい連絡を停止しています。');
     run('INSERT INTO live_activity_messages VALUES(?,?,?,?,?)',id(),key,user.id,required(input.body,'連絡内容',2000),now());
     const recipients=new Set([a.owner_id,...all("SELECT user_id FROM live_applications WHERE activity_id=? AND status IN ('APPROVED','DONE')",key).map(p=>p.user_id)]);
     for(const recipient of recipients)if(recipient!==user.id&&!blocked({id:recipient},a.community_id))notify(recipient,'「'+a.title+'」の活動連絡板に投稿があります。',recipient===a.owner_id?'org':'myactivity');
     return send({ok:true},201);
   }
   if(resource==='follow'){
     const c=org(key);if(input.follow===true&&(c.status!=='VERIFIED'||c.paused||blocked(user,key)))throw bad(400,'この団体は現在フォローできません。');
     if(input.follow===true)run('INSERT OR IGNORE INTO live_follows VALUES(?,?)',key,user.id);else run('DELETE FROM live_follows WHERE community_id=? AND user_id=?',key,user.id);return send({ok:true});
   }
   if(resource==='notifications'){
     if(input.id){const result=run('UPDATE live_notifications SET is_read=1 WHERE id=? AND user_id=?',text(input.id,100),user.id);if(!result.changes)throw bad(404,'お知らせが見つかりません。');}
     else if(input.surface){
       if(!['operator','user'].includes(input.surface))throw bad(400,'お知らせの種類が正しくありません。');
       const condition="(route='org' OR route='admin' OR route='participants' OR route='manage' OR route='orgSignup' OR route='reports' OR route LIKE 'org/%' OR route LIKE 'admin/%' OR route LIKE 'participants/%' OR route LIKE 'manage/%' OR route LIKE 'orgSignup/%' OR route LIKE 'reports/%')";
       run('UPDATE live_notifications SET is_read=1 WHERE user_id=? AND '+(input.surface==='operator'?'':'NOT ')+condition,user.id);
     }
     else run('UPDATE live_notifications SET is_read=1 WHERE user_id=?',user.id);
     return send({ok:true});
   }
   if(resource==='review'){
     if(!admin(user))throw bad(403,'運営管理者専用です。');
     const note=required(input.note,'確認内容・理由',1000);
     if(input.type==='community'){
       const c=org(key);const status={approve:'VERIFIED',return:'PENDING',suspend:'SUSPENDED'}[action];if(!status)throw bad(400,'操作を確認してください。');
       if(action==='approve'&&input.identityChecked!==true)throw bad(400,'代表者の確認を完了してから承認してください。');
       if(action==='approve'){
         const details=adminInfo(key);
         if(details.consentConfirmed!==true&&input.consentChecked!==true)throw bad(400,'団体の掲載同意を確認してから公開してください。');
         saveAdminInfo(key,{...details,consentConfirmed:true});
         run('INSERT INTO live_community_verifications VALUES(?,?) ON CONFLICT(community_id) DO UPDATE SET checked_at=excluded.checked_at',key,now());
         const pending=one('SELECT content FROM live_community_changes WHERE community_id=?',key);
         if(pending){const {name,city,...data}=JSON.parse(pending.content);run('UPDATE live_communities SET name=?,city=?,data=?,confirmed_at=? WHERE id=?',name,city,JSON.stringify(data),now(),key);run('DELETE FROM live_community_changes WHERE community_id=?',key);}
       }
       if(action==='return'&&c.status==='VERIFIED'&&one('SELECT 1 FROM live_community_changes WHERE community_id=?',key)){run('DELETE FROM live_community_changes WHERE community_id=?',key);notify(c.owner_id,'変更案を差し戻しました：'+note,'org');audit(user,'community_change_return',key,note);return send({ok:true});}
       run('UPDATE live_communities SET status=?,review_note=?,updated_at=? WHERE id=?',status,note,now(),key);notify(c.owner_id,'団体の確認結果：'+note,'org');
     }else if(input.type==='activity'){
       if(conditions.review(activity(key),{...input,note},action,user))return send({ok:true});
       const a=activity(key);if(action==='approve'){validForReview(a);if(a.status!=='REVIEW'||a.community_status!=='VERIFIED'||a.paused)throw bad(400,'団体と募集の確認状態を見直してください。');run("UPDATE live_activities SET status='PUBLISHED',published_at=?,review_note=?,updated_at=? WHERE id=?",now(),note,now(),key);for(const f of all('SELECT user_id FROM live_follows WHERE community_id=?',a.community_id))notify(f.user_id,'フォロー中の団体の募集：「'+a.title+'」','liveactivity/'+a.id);}
       else if(action==='return')run("UPDATE live_activities SET status='DRAFT',review_note=?,updated_at=? WHERE id=?",note,now(),key);else throw bad(400,'操作を確認してください。');
       notify(a.owner_id,'「'+a.title+'」の審査結果：'+note,'org');
     }else throw bad(400,'対象を確認してください。');
     audit(user,'review_'+input.type+'_'+action,key,note);return send({ok:true});
   }
   throw bad(404,'操作が見つかりません。');
 }
 return {handle,tidy,close:()=>{clearInterval(timer);officialUpdates.close();}};
}
module.exports={createCommunityService};
