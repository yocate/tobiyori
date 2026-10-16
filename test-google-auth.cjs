const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
const {DatabaseSync}=require('node:sqlite');
const {OAuth2Client}=require('google-auth-library');
const {createGoogleAuth}=require('./google-auth.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-google-'));
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE,nickname TEXT,password_hash TEXT,created_at INTEGER);
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);
 CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,content TEXT,revision INTEGER);`);
const configPath=path.join(temp,'config.json'),clientId='test.apps.googleusercontent.com';
const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const publicKey=key.publicKey.export({type:'spki',format:'pem'});
const badKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
let nonce,claims={},badSignature=false,tokenCalls=0,verificationCalls=0,lastTokenOptions,tokenFailure;
const service=createGoogleAuth({db,port:4177,configPath,createClient:opts=>{
 const client=new OAuth2Client(opts);
 client.certificateCache={'test-key':publicKey};client.certificateExpiry=new Date(Date.now()+3600000);
 client.getToken=async options=>{
   tokenCalls++;lastTokenOptions=options;if(tokenFailure)throw tokenFailure;
   return {tokens:{id_token:jwt.sign({iss:'https://accounts.google.com',aud:clientId,sub:'google-subject-1',email:'person@example.com',email_verified:true,nonce,exp:Math.floor(Date.now()/1000)+600,...claims},badSignature?badKey.privateKey:key.privateKey,{algorithm:'RS256',keyid:'test-key'})}};
 };
 const verify=client.verifyIdToken.bind(client);client.verifyIdToken=(...args)=>{verificationCalls++;return verify(...args);};
 return client;
}});
function begin(user=null,surface){const flow=service.start({intent:user?'link':'login',consent:true,user,surface});const url=new URL(flow.url);nonce=url.searchParams.get('nonce');return {...flow,authURL:url,callbackURL:new URL('http://localhost:4177/api/google/callback?code=test-code&state='+url.searchParams.get('state')),request:{headers:{cookie:flow.cookie.split(';')[0]}}};}
async function rejected(flow,code){await assert.rejects(service.callback(flow.request,flow.callbackURL),e=>e.googleCode===code);}
(async()=>{try {
 assert.equal(service.enabled(),false);assert.throws(()=>begin(),e=>e.googleCode==='not_configured');
 fs.writeFileSync(configPath,JSON.stringify({client_id:clientId,client_secret:'test-secret-not-real'}));assert.equal(service.enabled(),true);
 assert.throws(()=>service.start({intent:'login',consent:false}),e=>e.googleCode==='consent');
 assert.throws(()=>service.start({intent:'link',consent:true}),e=>e.googleCode==='login_required');
 const first=begin();assert.equal(first.authURL.origin,'https://accounts.google.com');assert.equal(first.authURL.searchParams.get('scope'),'openid email');assert.equal(first.authURL.searchParams.get('code_challenge_method'),'S256');assert(!first.url.includes('test-secret'));assert.match(first.cookie,/HttpOnly; SameSite=Lax/);
 const success=await service.callback(first.request,first.callbackURL);assert.equal(success.user.email,'person@example.com');assert.equal(success.user.nickname,'とびよりさん');
 assert.equal(crypto.createHash('sha256').update(lastTokenOptions.codeVerifier).digest('base64url'),first.authURL.searchParams.get('code_challenge'));
 assert.equal(lastTokenOptions.redirect_uri,'http://localhost:4177/api/google/callback');
 await rejected(first,'state');
 db.prepare('INSERT INTO workspaces VALUES(?,?,0)').run(success.user.id,'{"profile":{"nickname":"記録を保持"}}');
 const again=begin();const same=await service.callback(again.request,again.callbackURL);assert.equal(same.user.id,success.user.id);assert(db.prepare('SELECT content FROM workspaces WHERE user_id=?').get(same.user.id).content.includes('記録を保持'));
 claims={email:'new-address@example.com'};const changed=begin();assert.equal((await service.callback(changed.request,changed.callbackURL)).user.id,success.user.id);claims={};
 const wrongBrowser=begin();wrongBrowser.request.headers.cookie='tobiyori_google='+crypto.randomBytes(32).toString('base64url');const before=tokenCalls;await rejected(wrongBrowser,'state');assert.equal(tokenCalls,before);
 const expired=begin();db.prepare('UPDATE google_flows SET expires_at=0').run();await rejected(expired,'state');
 const cancel=begin();cancel.callbackURL.searchParams.set('error','access_denied');await rejected(cancel,'cancelled');
 for(const invalid of [{nonce:'wrong'},{aud:'other-client'},{iss:'https://attacker.example'},{email_verified:false},{exp:Math.floor(Date.now()/1000)-10},{azp:'other-client'},{sub:''}]) {claims=invalid;await rejected(begin(),'verification');}
 claims={};badSignature=true;await rejected(begin(),'verification');badSignature=false;
 for(const [error,reason] of [[{code:'EACCES'},'network'],[{cause:{code:'ECONNRESET'}},'network'],[{name:'AbortError'},'network'],[{response:{data:{error:'invalid_client'}}},'client_config'],[{response:{data:{error:'invalid_grant'}}},'authorization'],[{response:{data:{error:'unexpected-secret-response'}}},'verification']]){tokenFailure=error;await rejected(begin(),reason);}tokenFailure=null;
 db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run('local-user','existing@example.com','既存の人','local-password',Date.now());
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('session-hash','local-user',Date.now()+60000);
 claims={sub:'google-local-sub',email:'existing@example.com'};await rejected(begin(),'email_exists');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,2);
 const local={id:'local-user',email:'existing@example.com',token_hash:'session-hash'};
 const linked=await service.callback(...(()=>{const f=begin(local);return [f.request,f.callbackURL];})());assert.equal(linked.user.id,'local-user');assert.equal(linked.revokeSession,'session-hash');
 const relog=begin();assert.equal((await service.callback(relog.request,relog.callbackURL)).user.id,'local-user');
 claims={sub:'different-sub',email:'different@example.com'};await rejected(begin(local),'email_mismatch');
 claims={sub:'other-sub',email:'existing@example.com'};await rejected(begin(local),'link_conflict');
 claims={sub:'google-local-sub',email:'existing@example.com'};const stale=begin(local);db.prepare('DELETE FROM sessions WHERE token_hash=?').run('session-hash');await rejected(stale,'login_required');
 assert(verificationCalls>10);
 const portal=begin(null,'operator');assert.equal(service.surfaceForCallback(portal.request,portal.callbackURL),'operator');
 assert.equal(service.surfaceForCallback({headers:{}},portal.callbackURL),'user');
 const injected=begin(null,'https://example.test');assert.equal(service.surfaceForCallback(injected.request,injected.callbackURL),'user');
 portal.callbackURL.searchParams.set('error','access_denied');await rejected(portal,'cancelled');assert.equal(service.surfaceForCallback(portal.request,portal.callbackURL),'user');
 console.log('PASS: official-library signature/audience/issuer verification; nonce, PKCE, consent, state/browser binding, expiry, cancellation, replay; subject identity, safe explicit linking and saved-data preservation. No live Google account used.');
}finally{db.close();const resolved=path.resolve(temp);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert(path.basename(resolved).startsWith('tobiyori-google-'));fs.rmSync(resolved,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
