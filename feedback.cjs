'use strict';
// App feedback ("ご意見"): anyone may send, anonymously; only operators (ADMIN) list, triage and export it.
// Kept apart from live_reports, which are safety reports about a community.
// Nothing identifies the sender: no account id, e-mail or IP is stored; contact details in the text are masked.
const crypto=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const CATEGORIES={hard:'使いにくい・分かりにくい',bug:'不具合・エラー',idea:'こうしてほしい',good:'よかったこと',other:'その他'};
const STATUSES={NEW:'未確認',SEEN:'確認済み',PLANNED:'対応予定',DONE:'対応済み',WONTFIX:'見送り'};
// Feedback is read for analysis: keep personal contact details out of the stored text.
function mask(text){
 return text.replace(/[^\s@<>()（）「」、。]+@[^\s@<>()（）「」、。]+\.[A-Za-z]{2,}/g,'［メール］')
  .replace(/(?<!\d)(\+81[-\s]?|0)\d{1,4}[-\s(（]?\d{1,4}[-\s)）]?\d{3,4}(?!\d)/g,'［電話番号］');
}
// "#/liveactivity/<uuid>?x" -> "#/liveactivity/:id" so pages group together in the analysis.
function normalizePage(value){
 if(typeof value!=='string')return '';
 return value.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,':id').replace(/[^\w#/:.-]/g,'').slice(0,120);
}
// Whitelisted, non-identifying context sent by the page for analysis.
const pick=(v,list,dflt='')=>list.includes(v)?v:dflt;
const num=(v,max)=>Number.isInteger(v)&&v>=0?Math.min(v,max):null;
function cleanContext(c){
 c=c&&typeof c==='object'&&!Array.isArray(c)?c:{};
 const size=v=>typeof v==='string'&&/^\d{2,5}x\d{2,5}$/.test(v)?v:'';
 return {fromPage:normalizePage(c.fromPage),viewport:size(c.viewport),orientation:pick(c.orientation,['portrait','landscape']),
  os:pick(c.os,['iOS','Android','macOS','Windows','Linux','other'],'other'),browser:pick(c.browser,['Safari','Chrome','Edge','Firefox','Samsung','other'],'other'),
  language:typeof c.language==='string'&&/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(c.language)?c.language:'',
  darkMode:c.darkMode===true,reducedMotion:c.reducedMotion===true,touch:c.touch===true,installed:c.installed===true,
  secondsOnPage:num(c.secondsOnPage,86400),pagesViewed:num(c.pagesViewed,1000),loadError:c.loadError===true,
  recentErrors:Array.isArray(c.recentErrors)?c.recentErrors.filter(e=>typeof e==='string').slice(0,3).map(e=>mask(e).slice(0,200)):[]};
}
const bucket=(n,edges,labels)=>labels[edges.findIndex(e=>n<=e)]??labels[labels.length-1];
const jst=iso=>new Date(Date.parse(iso)+9*3600000).toISOString().slice(0,16).replace('T',' ');
// Excel opens UTF-8 with a BOM; a leading = + - @ would run as a formula, so quote it as text.
function csvCell(v){let s=v==null?'':String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}

function createFeedback({db,release='local',clock=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS app_feedback(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
  role TEXT NOT NULL,category TEXT NOT NULL,rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,page TEXT NOT NULL,surface TEXT NOT NULL,device TEXT NOT NULL,release TEXT NOT NULL,context TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'NEW',tags TEXT NOT NULL DEFAULT '[]',note TEXT NOT NULL DEFAULT '');
  CREATE INDEX IF NOT EXISTS app_feedback_created ON app_feedback(created_at);
  CREATE INDEX IF NOT EXISTS app_feedback_status ON app_feedback(status,created_at);`);
 const one=(s,...v)=>db.prepare(s).get(...v),all=(s,...v)=>db.prepare(s).all(...v),run=(s,...v)=>db.prepare(s).run(...v);
 const isAdmin=user=>!!user&&one("SELECT 1 FROM account_roles WHERE user_id=? AND role='ADMIN'",user.id);
 function roleOf(user){
  if(!user)return 'guest';if(isAdmin(user))return 'admin';
  return one('SELECT 1 FROM live_communities WHERE owner_id=?',user.id)?'organizer':'user';
 }
 function submit(user,input){
  const body=typeof input.body==='string'?input.body.trim():'';
  if(!Object.hasOwn(CATEGORIES,input.category))throw fail(400,'ご意見の種類を選んでください。');
  if(!body||body.length>2000)throw fail(400,'内容を2,000文字以内で入力してください。');
  if(input.rating!==undefined&&input.rating!==null&&!(Number.isInteger(input.rating)&&input.rating>=1&&input.rating<=5))throw fail(400,'使いやすさは1〜5で選んでください。');
  const now=new Date(clock()).toISOString(),fid=crypto.randomUUID(),context=cleanContext(input.context);
  // Coarse facts about the account (never the account itself) help tell newcomers' problems from regulars'.
  if(user){
   const created=one('SELECT created_at FROM accounts WHERE id=?',user.id)?.created_at||clock(),days=Math.floor((clock()-created)/86400000);
   const apps=one('SELECT COUNT(*) AS n FROM live_applications WHERE user_id=?',user.id).n;
   Object.assign(context,{accountAge:bucket(days,[0,7,30],['当日','1週間以内','1か月以内','1か月超']),applications:bucket(apps,[0,1,4],['0件','1件','2〜4件','5件以上'])});
  }
  run('INSERT INTO app_feedback(id,created_at,updated_at,role,category,rating,body,page,surface,device,release,context) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
   fid,now,now,roleOf(user),input.category,input.rating??null,mask(body),normalizePage(input.page),
   input.surface==='operator'?'operator':'user',pick(input.device,['mobile','tablet','desktop'],'desktop'),String(release).slice(0,64),JSON.stringify(context));
  return {id:fid};
 }
 function publicRow(r){return {id:r.id,createdAt:r.created_at,updatedAt:r.updated_at,role:r.role,category:r.category,rating:r.rating,body:r.body,page:r.page,surface:r.surface,device:r.device,release:r.release,status:r.status,tags:JSON.parse(r.tags),note:r.note,context:JSON.parse(r.context)};}
 const select="SELECT f.* FROM app_feedback f";
 function filters(q){
  const where=[],args=[];
  if(Object.hasOwn(STATUSES,q.get('status')))where.push('f.status=?'),args.push(q.get('status'));
  if(Object.hasOwn(CATEGORIES,q.get('category')))where.push('f.category=?'),args.push(q.get('category'));
  const page=q.get('page');if(page)where.push('f.page=?'),args.push(normalizePage(page));
  const text=(q.get('q')||'').trim().slice(0,100);if(text)where.push("(f.body LIKE ? ESCAPE '\\' OR f.note LIKE ? ESCAPE '\\' OR f.tags LIKE ? ESCAPE '\\')"),args.push(...Array(3).fill('%'+text.replace(/[\\%_]/g,m=>'\\'+m)+'%'));
  return {sql:where.length?' WHERE '+where.join(' AND '):'',args};
 }
 function list(q){
  const {sql,args}=filters(q),offset=Math.max(0,Math.min(100000,Number(q.get('offset'))||0));
  return {items:all(select+sql+' ORDER BY f.created_at DESC LIMIT 50 OFFSET ?',...args,offset).map(publicRow),total:one('SELECT COUNT(*) AS n FROM app_feedback f'+sql,...args).n,offset};
 }
 function summary(){
  const since=new Date(clock()-56*86400000).toISOString();
  const weeks=all('SELECT created_at FROM app_feedback WHERE created_at>=?',since).reduce((m,r)=>{const w=Math.floor((clock()-Date.parse(r.created_at))/(7*86400000));m[w]=(m[w]||0)+1;return m;},{});
  return {total:one('SELECT COUNT(*) AS n FROM app_feedback').n,newCount:one("SELECT COUNT(*) AS n FROM app_feedback WHERE status='NEW'").n,
   averageRating:one('SELECT ROUND(AVG(rating),2) AS v FROM app_feedback WHERE rating IS NOT NULL').v,
   byCategory:all('SELECT category,COUNT(*) AS count,ROUND(AVG(rating),2) AS averageRating FROM app_feedback GROUP BY category ORDER BY count DESC'),
   byStatus:all('SELECT status,COUNT(*) AS count FROM app_feedback GROUP BY status'),
   byDevice:all('SELECT device,COUNT(*) AS count,ROUND(AVG(rating),2) AS averageRating FROM app_feedback GROUP BY device ORDER BY count DESC'),
   byRole:all('SELECT role,COUNT(*) AS count,ROUND(AVG(rating),2) AS averageRating FROM app_feedback GROUP BY role ORDER BY count DESC'),
   byPage:all("SELECT page,COUNT(*) AS count,SUM(category IN ('hard','bug')) AS problems,ROUND(AVG(rating),2) AS averageRating FROM app_feedback GROUP BY page ORDER BY problems DESC,count DESC LIMIT 10"),
   weekly:Array.from({length:8},(_,w)=>({weeksAgo:w,count:weeks[w]||0})),categories:CATEGORIES,statuses:STATUSES};
 }
 function triage(fid,input){
  const row=one('SELECT * FROM app_feedback WHERE id=?',fid);if(!row)throw fail(404,'ご意見が見つかりません。');
  const status=input.status===undefined?row.status:input.status;if(!Object.hasOwn(STATUSES,status))throw fail(400,'対応状況を確認してください。');
  const tags=input.tags===undefined?JSON.parse(row.tags):input.tags;
  if(!Array.isArray(tags)||tags.length>10||tags.some(t=>typeof t!=='string'||!t.trim()||t.length>30))throw fail(400,'タグは30文字以内で10個までです。');
  const note=input.note===undefined?row.note:input.note;if(typeof note!=='string'||note.length>2000)throw fail(400,'メモは2,000文字以内で入力してください。');
  run('UPDATE app_feedback SET status=?,tags=?,note=?,updated_at=? WHERE id=?',status,JSON.stringify([...new Set(tags.map(t=>t.trim()))]),note,new Date(clock()).toISOString(),fid);
  return publicRow(one(select+' WHERE f.id=?',fid));
 }
 function csv(q){
  const {sql,args}=filters(q);
  const head=['ID','送信日時(JST)','種類','使いやすさ(1-5)','内容','画面','直前の画面','画面の種類','端末','OS','ブラウザ','表示サイズ','向き','ダークモード','画面にいた秒数','閲覧した画面数','読み込みエラー','直近の画面エラー','送信者の役割','登録からの期間','申込み件数','アプリの版','対応状況','タグ','運営メモ'];
  const yes=v=>v?'はい':'';
  const rows=all(select+sql+' ORDER BY f.created_at DESC',...args).map(r=>{const c=JSON.parse(r.context);return [r.id,jst(r.created_at),CATEGORIES[r.category],r.rating??'',r.body,r.page,c.fromPage||'',r.surface==='operator'?'運営画面':'利用者画面',{mobile:'スマホ',tablet:'タブレット',desktop:'PC'}[r.device],c.os||'',c.browser||'',c.viewport||'',{portrait:'縦',landscape:'横'}[c.orientation]||'',yes(c.darkMode),c.secondsOnPage??'',c.pagesViewed??'',yes(c.loadError),(c.recentErrors||[]).join(' | '),{guest:'ゲスト',user:'利用者',organizer:'団体担当',admin:'運営'}[r.role],c.accountAge||'',c.applications||'',r.release,STATUSES[r.status],JSON.parse(r.tags).join(' / '),r.note];});
  return '\uFEFF'+[head,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
 }
 // Returns true when the request was handled.
 async function handle({req,res,url,user,readBody,respond,limited}){
  if(url.pathname!=='/api/feedback'&&!url.pathname.startsWith('/api/feedback/'))return false;
  const key=url.pathname.slice(14);
  if(req.method==='POST'&&!key){
   if(limited('feedback:'+req.socket.remoteAddress,20))throw fail(429,'送信が続いたため、しばらくしてからお試しください。');
   respond(res,201,submit(user,await readBody(req)));return true;
  }
  if(!user)throw fail(401,'ログインしてください。');
  if(!isAdmin(user))throw fail(403,'ご意見の一覧は運営者だけが確認できます。');
  if(req.method==='GET'&&!key){respond(res,200,list(url.searchParams));return true;}
  if(req.method==='GET'&&key==='summary'){respond(res,200,summary());return true;}
  if(req.method==='GET'&&key==='export.csv'){
   res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="tobiyori-feedback-${jst(new Date(clock()).toISOString()).slice(0,10)}.csv"`});
   res.end(csv(url.searchParams));return true;
  }
  if(req.method==='POST'&&/^[0-9a-f-]{36}$/.test(key)){
   if(req.headers['x-tobiyori-account']!==user.id)throw fail(409,'別の画面でログイン状態が変わりました。再読み込みしてください。');
   respond(res,200,triage(key,await readBody(req)));return true;
  }
  throw fail(404,'操作が見つかりません。');
 }
 return {handle,submit,list,summary,triage,csv};
}
module.exports={createFeedback,mask,normalizePage,cleanContext,CATEGORIES,STATUSES};
