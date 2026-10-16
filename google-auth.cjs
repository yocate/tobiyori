const fs = require('node:fs');
const crypto = require('node:crypto');
const { OAuth2Client, CodeChallengeMethod } = require('google-auth-library');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const fail = code => Object.assign(new Error(code), { googleCode: code });
// Error messages from Google may contain a request/token: classify without logging them.
function verificationFailure(error){
  const code=error?.code||error?.cause?.code;
  if(['EACCES','EPERM','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN'].includes(code)||error?.name==='AbortError')return fail('network');
  const reason=error?.response?.data?.error;
  if(['invalid_client','deleted_client','unauthorized_client','redirect_uri_mismatch'].includes(reason))return fail('client_config');
  if(reason==='invalid_grant')return fail('authorization');
  return fail('verification');
}

// Dependencies can be replaced only by the local test harness, never by requests.
function createGoogleAuth({ db, port, configPath, createClient = options => new OAuth2Client({...options,transporterOptions:{timeout:15000,retry:false}}) }) {
  const redirectUri = `http://localhost:${port}/api/google/callback`;
  db.exec(`CREATE TABLE IF NOT EXISTS google_identities (
    subject TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES accounts(id), email TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS google_flows (
    state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL,
    intent TEXT NOT NULL, user_id TEXT, session_hash TEXT, expires_at INTEGER NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(google_flows)').all().some(c=>c.name==='surface'))db.exec("ALTER TABLE google_flows ADD COLUMN surface TEXT NOT NULL DEFAULT 'user'");
  function configuration() {
    let config = {};
    try { config = JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,'')); } catch {}
    const clientId = process.env.TOBIYORI_GOOGLE_CLIENT_ID || config.web?.client_id || config.client_id || '';
    const clientSecret = process.env.TOBIYORI_GOOGLE_CLIENT_SECRET || config.web?.client_secret || config.client_secret || '';
    if(typeof clientId!=='string' || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || typeof clientSecret!=='string' || clientSecret.length<8) return null;
    return { clientId, clientSecret, redirectUri };
  }
  function start({ intent, consent, user, surface }) {
    const config = configuration(); if(!config)throw fail('not_configured');
    if(consent!==true)throw fail('consent');
    if(!['login','link'].includes(intent))throw fail('invalid');
    if(intent==='link' && !user)throw fail('login_required');
    if(intent==='login' && user)throw fail('already_signed_in');
    const state=random(),browser=random(),nonce=random(),verifier=random();
    const client=createClient(config);
    const url=client.generateAuthUrl({scope:['openid','email'],response_type:'code',access_type:'online',
      prompt:'select_account',state,nonce,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:CodeChallengeMethod.S256});
    db.prepare('DELETE FROM google_flows WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO google_flows (state_hash,browser_hash,nonce,verifier,intent,user_id,session_hash,expires_at,surface) VALUES(?,?,?,?,?,?,?,?,?)').run(hash(state),hash(browser),nonce,verifier,intent,user?.id||null,user?.token_hash||null,Date.now()+10*60*1000,surface==='operator'?'operator':'user');
    return { url, cookie:`tobiyori_google=${browser}; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=600` };
  }
  // Destination is a fixed surface, bound to the same state and browser as the login flow.
  function surfaceForCallback(req,url){
    const state=url.searchParams.get('state');
    const browser=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tobiyori_google='))?.slice(16);
    if(!state||!browser)return 'user';
    const flow=db.prepare('SELECT surface FROM google_flows WHERE state_hash=? AND browser_hash=? AND expires_at>?').get(hash(state),hash(browser),Date.now());
    return flow?.surface==='operator'?'operator':'user';
  }
  async function callback(req,url) {
    const state=url.searchParams.get('state');
    const browser=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tobiyori_google='))?.slice(16);
    if(!state || !browser || !/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(browser))throw fail('state');
    const flow=db.prepare('SELECT * FROM google_flows WHERE state_hash=? AND browser_hash=? AND expires_at>?').get(hash(state),hash(browser),Date.now());
    if(!flow)throw fail('state');
    db.prepare('DELETE FROM google_flows WHERE state_hash=?').run(hash(state));
    if(url.searchParams.has('error'))throw fail(url.searchParams.get('error')==='access_denied'?'cancelled':'failed');
    const code=url.searchParams.get('code');if(!code || code.length>4096)throw fail('invalid');
    const config=configuration();if(!config)throw fail('not_configured');
    const client=createClient(config);
    let identity;
    try {
      const {tokens}=await client.getToken({code,codeVerifier:flow.verifier,redirect_uri:redirectUri});
      if(!tokens.id_token)throw Error('No ID token');
      const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:config.clientId});
      identity=ticket.getPayload();
      if(!identity || identity.nonce!==flow.nonce || identity.email_verified!==true ||
        typeof identity.sub!=='string' || !/^[\x21-\x7e]{1,255}$/.test(identity.sub) ||
        typeof identity.email!=='string' || identity.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) ||
        !Number.isFinite(identity.exp) || identity.exp<=Date.now()/1000 ||
        (identity.azp && identity.azp!==config.clientId))throw Error('Invalid identity');
    } catch(error) {throw verificationFailure(error);}
    const email=identity.email.trim().toLowerCase();
    db.exec('BEGIN IMMEDIATE');
    try {
      const linked=db.prepare('SELECT a.* FROM accounts a JOIN google_identities g ON a.id=g.user_id WHERE g.subject=?').get(identity.sub);
      let user;
      if(flow.intent==='link') {
        user=db.prepare('SELECT a.* FROM accounts a JOIN sessions s ON a.id=s.user_id WHERE a.id=? AND s.token_hash=? AND s.expires_at>?').get(flow.user_id,flow.session_hash,Date.now());
        if(!user)throw fail('login_required');
        if(user.email!==email)throw fail('email_mismatch');
        if(linked && linked.id!==user.id)throw fail('link_conflict');
        const other=db.prepare('SELECT subject FROM google_identities WHERE user_id=?').get(user.id);
        if(other && other.subject!==identity.sub)throw fail('link_conflict');
      } else {
        user=linked;
        if(!user) {
          if(db.prepare('SELECT id FROM accounts WHERE email=?').get(email))throw fail('email_exists');
          // A Google display name may be a real name. Let the user choose their nickname in My Page.
          user={id:crypto.randomUUID(),email,nickname:'とびよりさん'};
          db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run(user.id,email,user.nickname,'!google-only',Date.now());
        }
      }
      if(!linked)db.prepare('INSERT INTO google_identities VALUES(?,?,?)').run(identity.sub,user.id,email);
      db.exec('COMMIT');
      return {user,revokeSession:flow.session_hash};
    } catch(e){db.exec('ROLLBACK');throw e;}
  }
  return {enabled:()=>!!configuration(),start,callback,redirectUri,surfaceForCallback,
    clearCookie:'tobiyori_google=; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=0'};
}
module.exports={createGoogleAuth};
