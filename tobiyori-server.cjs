// Local account server for the single-file Tobiyori prototype. Node.js 24+.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const { createGoogleAuth } = require('./google-auth.cjs');
const { createCommunityService } = require('./community-service.cjs');
const { cleanPreferences } = require('./participation-conditions.cjs');
const scrypt = promisify(crypto.scrypt);
const PORT = Number(process.env.TOBIYORI_PORT || 4177);
const ROOT = path.join(__dirname, '成果物');
const dataDir = process.env.TOBIYORI_DATA_DIR || path.join(__dirname, '.tobiyori-data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'accounts.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS workspaces(user_id TEXT PRIMARY KEY REFERENCES accounts(id), content TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);`);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const googleAuth = createGoogleAuth({db,port:PORT,configPath:path.join(dataDir,'google-oauth.json')});
const communityService = createCommunityService({db});
const limits = new Map();
function limited(key, max) {
  const now = Date.now();
  if (limits.size > 2000) for (const [k,v] of limits) if (v.until < now) limits.delete(k);
  let v = limits.get(key);
  if (!v || v.until < now) limits.set(key, v = { count: 0, until: now + 15*60*1000 });
  return ++v.count > max;
}
function respond(res, status, body) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); }
function failure(status, message) { return Object.assign(new Error(message), {status}); }
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw failure(415,'送信形式を確認してください。');
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if(size > 4*1024*1024) throw failure(413,'保存する情報が大きすぎます。写真を減らしてください。'); chunks.push(c); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); if(!data || Array.isArray(data) || typeof data !== 'object') throw 0; return data; }
  catch { throw failure(400,'入力内容を確認してください。'); }
}
function userFor(req) {
  const token = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('tobiyori_session='))?.slice(17);
  if(!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare('SELECT a.id,a.email,a.nickname,s.token_hash FROM accounts a JOIN sessions s ON a.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token), Date.now());
}
function publicUser(u) { return {id:u.id,email:u.email,nickname:u.nickname,googleLinked:!!db.prepare('SELECT 1 FROM google_identities WHERE user_id=?').get(u.id)}; }
function session(res, id) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),id,Date.now()+12*60*60*1000);
  res.setHeader('Set-Cookie',`tobiyori_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`);
}
async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password,salt,64);
  return `${salt}:${key.toString('hex')}`;
}
async function verify(password, stored) {
  if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)){await scrypt(password,'unavailable-password',64);return false;}
  const [salt,key] = stored.split(':');
  const actual = await scrypt(password,salt,64);
  return crypto.timingSafeEqual(actual,Buffer.from(key,'hex'));
}
const dummyHash = crypto.randomBytes(16).toString('hex')+':'+crypto.randomBytes(64).toString('hex');
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Cache-Control','no-store');
  const origin = `http://localhost:${PORT}`;
  try {
    if (![ `localhost:${PORT}`, `127.0.0.1:${PORT}` ].includes(req.headers.host)) throw failure(403,'このアドレスからは利用できません。');
    const requestURL = new URL(req.url,origin);
    const pathname = requestURL.pathname;
    if(pathname.startsWith('/api/')) {
      if(!['GET','POST','PUT'].includes(req.method)) throw failure(405,'この操作には対応していません。');
      if(req.method !== 'GET' && ![origin,`http://127.0.0.1:${PORT}`].includes(req.headers.origin)) throw failure(403,'アプリを開き直してから操作してください。');
      if(pathname === '/api/health') return respond(res,200,{ok:true,app:'tobiyori'});
      if(pathname === '/api/auth-options' && req.method==='GET')return respond(res,200,{googleEnabled:googleAuth.enabled()});
      if(pathname === '/api/google/start' && req.method==='POST') {
        if(req.headers.host!==`localhost:${PORT}`)throw failure(400,`http://localhost:${PORT}/ から開き直してください。`);
        if(limited('google:'+req.socket.remoteAddress,30))throw failure(429,'試行回数が多いため、15分後にお試しください。');
        const input=await body(req),user=userFor(req);
        if(input.intent==='link' && (!user || req.headers['x-tobiyori-account']!==user.id))throw failure(401,'ログインしてから連携してください。');
        try {const flow=googleAuth.start({intent:input.intent,consent:input.consent,surface:input.surface,user});res.setHeader('Set-Cookie',flow.cookie);return respond(res,200,{url:flow.url});}
        catch(e){throw failure(400,e.googleCode==='not_configured'?'Googleログインは初期設定が必要です。':e.googleCode==='already_signed_in'?'ログアウトしてからお試しください。':'利用上の確認にチェックしてからお試しください。');}
      }
      if(pathname === '/api/google/callback' && req.method==='GET') {
        const operator=googleAuth.surfaceForCallback(req,requestURL)==='operator';
        let destination=operator?'/operator.html#/manage':'/#/mypage';
        try {
          const result=await googleAuth.callback(req,requestURL);
          if(result.revokeSession)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(result.revokeSession);
          session(res,result.user.id);
        }catch(e){const allowed=['not_configured','state','cancelled','verification','network','client_config','authorization','email_exists','email_mismatch','link_conflict','login_required'];const reason=allowed.includes(e.googleCode)?e.googleCode:'failed';console.warn(JSON.stringify({event:'google-login-failed',reason,time:new Date().toISOString()}));destination=(operator?'/operator.html':'/')+'#/login/google-'+reason;}
        const cookies=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(cookies?[cookies]:[]),googleAuth.clearCookie]);
        res.writeHead(303,{'Location':destination});return res.end();
      }
      if(req.method === 'POST' && ['/api/register','/api/login'].includes(pathname)) {
        if(limited('ip:'+req.socket.remoteAddress,60)) throw failure(429,'試行回数が多いため、15分後にお試しください。');
        const input = await body(req);
        const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
        const password = input.password;
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) throw failure(400,'メールアドレスと8〜128文字のパスワードを入力してください。');
        if(limited(pathname+':'+email,15)) throw failure(429,'試行回数が多いため、15分後にお試しください。');
        let user = db.prepare('SELECT * FROM accounts WHERE email=?').get(email);
        if(pathname === '/api/register') {
          const nickname = typeof input.nickname === 'string' ? input.nickname.trim() : '';
          if(!nickname || nickname.length > 40 || /[<>]/.test(nickname) || input.consent !== true) throw failure(400,'ニックネーム（40文字以内）と利用上の確認が必要です。');
          if(user) throw failure(409,'このメールアドレスは登録済みです。ログインしてください。');
          const hash = await passwordHash(password);
          user = {id:crypto.randomUUID(),email,nickname};
          try { db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run(user.id,email,nickname,hash,Date.now()); }
          catch(e) { if(e.code?.includes('SQLITE_CONSTRAINT')) throw failure(409,'このメールアドレスは登録済みです。'); throw e; }
        } else {
          const valid = await verify(password,user?.password_hash || dummyHash);
          if(!user || !valid) throw failure(401,'メールアドレスまたはパスワードが違います。');
        }
        const old = userFor(req);
        if(old) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(old.token_hash);
        session(res,user.id);
        return respond(res,pathname==='/api/register'?201:200,{user:publicUser(user)});
      }
      if(await communityService.handle({req,res,url:requestURL,user:userFor(req),readBody:body,respond}))return;
      const user = userFor(req);
      if(!user) throw failure(401,'ログインしてください。');
      if(['/api/state','/api/logout'].includes(pathname) && req.headers['x-tobiyori-account']!==user.id) throw failure(409,'別の画面でログイン状態が変わりました。ページを再読み込みしてください。');
      if(pathname==='/api/me' && req.method==='GET') return respond(res,200,{user:publicUser(user)});
      if(pathname==='/api/logout' && req.method==='POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);
        res.setHeader('Set-Cookie','tobiyori_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
        return respond(res,200,{ok:true});
      }
      if(pathname==='/api/state') {
        if(req.method==='GET') {
          const row = db.prepare('SELECT content,revision FROM workspaces WHERE user_id=?').get(user.id);
          return respond(res,200,{state:row?JSON.parse(row.content):null,revision:row?.revision||0});
        }
        if(req.method==='PUT') {
          const input = await body(req);
          if(!Number.isInteger(input.revision) || !input.state || typeof input.state !== 'object' || Array.isArray(input.state)) throw failure(400,'保存内容を確認してください。');
          const allowed = ['profile','points','badges','achievements','trustChecklist','reviews','applications','messages','reports','orgQueue','orgPendingVerification','blocked','communityMedia'];
          const state = Object.fromEntries(allowed.filter(k=>Object.hasOwn(input.state,k)).map(k=>[k,input.state[k]]));
          const nickname=state.profile?.nickname;
          if(state.profile?.birthDate!==undefined&&state.profile.birthDate!==''){
            const value=state.profile.birthDate,today=new Date(Date.now()+9*3600000).toISOString().slice(0,10),d=new Date(String(value)+'T00:00:00Z');
            if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value||value>today||value<'1900-01-01')throw failure(400,'生年月日を確認してください。未来の日付や存在しない日付は登録できません。');
          }
          if(state.profile?.skills!==undefined&&(typeof state.profile.skills!=='string'||state.profile.skills.length>3000))throw failure(400,'自己PRは3,000文字以内で入力してください。');
          if(state.profile?.excludedSkills!==undefined&&(!Array.isArray(state.profile.excludedSkills)||state.profile.excludedSkills.length>30||state.profile.excludedSkills.some(s=>typeof s!=='string'||s.length>40)))throw failure(400,'得意分野の設定を確認してください。');
          if(state.profile?.participation!==undefined)state.profile.participation=cleanPreferences(state.profile.participation);
          if(nickname!==undefined&&(typeof nickname!=='string'||nickname.trim().length>40))throw failure(400,'ニックネームは40文字以内で入力してください。');
          db.prepare('INSERT OR IGNORE INTO workspaces VALUES(?,?,0)').run(user.id,'{}');
          const result = db.prepare('UPDATE workspaces SET content=?,revision=revision+1 WHERE user_id=? AND revision=?').run(JSON.stringify(state),user.id,input.revision);
          if(!result.changes) throw failure(409,'別の画面で更新されています。内容を確認してページを再読み込みしてください。');
          if(nickname?.trim())db.prepare('UPDATE accounts SET nickname=? WHERE id=?').run(nickname.trim(),user.id);
          return respond(res,200,{revision:input.revision+1});
        }
      }
      throw failure(404,'ページが見つかりません。');
    }
    if(!['GET','HEAD'].includes(req.method)) throw failure(405,'この操作には対応していません。');
    const name = decodeURIComponent(['/', '/operator.html'].includes(pathname) ? '/gunma-community-map.html' : pathname);
    if(!/^\/(gunma-community-map\.html|google-login-setup\.html|tobiyori-logo-source\.png|tobiyori-lounge-cute-v2\.png|vendor\/leaflet\/(leaflet\.(js|css)|images\/[\w.-]+\.png))$/.test(name)) throw failure(404,'ページが見つかりません。');
    const full = path.join(ROOT,name.slice(1));
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
    const content=await fs.promises.readFile(full);
    res.writeHead(200,{'Content-Type':types[path.extname(full)]}); res.end(req.method==='HEAD'?undefined:content);
  } catch(e) { if(!res.headersSent) respond(res,e.status || 500,{error:e.status?e.message:'処理できませんでした。時間をおいて再度お試しください。'}); else res.end(); }
});
server.listen(PORT,'127.0.0.1',()=>console.log(`トビヨリ: http://localhost:${PORT}`));
server.on('error',e=>{ console.error(e.code==='EADDRINUSE'?'すでに起動しているか、ポートが使用されています。':e.message);process.exitCode=1; });
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
