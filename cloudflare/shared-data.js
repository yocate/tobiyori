// Optional shared backend. All account/activity operations use one authoritative database;
// there is no second acceptance queue or asynchronous seat counter.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 4 * 1024 * 1024;
const COOKIE = '__Host-tobiyori_session';
const json = (status, error) => new Response(JSON.stringify({error}), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

export function sharedDataConfig(env) {
  if (!env.SHARED_DATA_ORIGIN) return null;
  const target = new URL(env.SHARED_DATA_ORIGIN), app = new URL(env.APP_ORIGIN);
  if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash || target.origin === app.origin)
    throw new Error('共通の保存先の設定を確認してください。');
  // Only explicitly configured server-side origins are used; URL/query/body input cannot select a target.
  const aliases = JSON.parse(env.SHARED_DATA_ID_ALIASES || '{}');
  if (!aliases || Array.isArray(aliases) || typeof aliases !== 'object' || Object.keys(aliases).length > 1000 || Object.entries(aliases).some(([a,b]) => !UUID.test(a) || typeof b !== 'string' || !UUID.test(b)))
    throw new Error('移行した団体・活動の対応表を確認してください。');
  return {origin:target.origin, applicationOrigin:app.origin, aliases};
}

export async function forwardSharedData(request, config, fetcher = fetch) {
  const url = new URL(request.url), api = url.pathname.startsWith('/api/'), media = url.pathname.startsWith('/media/');
  if (url.origin !== config.applicationOrigin || (!api && !media)) return json(404,'見つかりません。');
  if (request.headers.has('X-Tobiyori-Shared-Hop')) return json(508,'保存先の接続設定を確認してください。');
  const read = ['GET','HEAD'].includes(request.method);
  if (media && !read || api && !['GET','POST','PUT','DELETE'].includes(request.method)) return json(405,'この操作には対応していません。');
  if (!read && request.headers.get('Origin') !== config.applicationOrigin) return json(403,'アプリを開き直してから操作してください。');
  const target = new URL(config.origin);
  target.pathname = url.pathname.split('/').map(part => config.aliases[part] || part).join('/');
  target.search = url.search;
  const headers = new Headers({'X-Tobiyori-Shared-Hop':'1'});
  for (const name of ['Accept','Content-Type','X-Tobiyori-Account','If-None-Match','If-Modified-Since','Range','CF-Connecting-IP']) {
    if (request.headers.has(name)) headers.set(name,request.headers.get(name));
  }
  if (!read) headers.set('Origin',config.origin);
  const cookieName = config.applicationOrigin.startsWith('https:') ? COOKIE : 'tobiyori_session';
  const cookie = (request.headers.get('Cookie') || '').split(';').map(v=>v.trim()).find(v=>new RegExp('^'+cookieName+'=[a-f0-9]{64}$').test(v));
  if (api && cookie) headers.set('Cookie',cookie);
  let body;
  if (!read) {
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return json(413,'保存する情報が大きすぎます。');
    const reader=request.body?.getReader(), chunks=[];let size=0;
    if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();return json(413,'保存する情報が大きすぎます。');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    body=bytes;
    // Existing tabs and already shared URLs can still contain the former independent IDs.
    if(api&&(headers.get('Content-Type')||'').startsWith('application/json')){
      try { const input=JSON.parse(new TextDecoder().decode(bytes));if(input&&typeof input==='object'&&!Array.isArray(input)){for(const key of ['communityId','activityId'])if(typeof input[key]==='string'&&config.aliases[input[key]])input[key]=config.aliases[input[key]];body=JSON.stringify(input);} } catch { /* The authoritative API validates malformed JSON. */ }
    }
  }
  let response;
  try {
    // Never follow a redirect with account cookies or retry a potentially committed write.
    response=await fetcher(new Request(target,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(20000)}));
  } catch { return json(503,'現在、活動情報に接続できません。時間をおいてもう一度お試しください。'); }
  if(response.status>=300&&response.status<400&&response.status!==304)return json(502,'保存先の応答を確認できませんでした。');
  const output=new Headers(response.headers);
  output.delete('Set-Cookie');output.delete('Access-Control-Allow-Origin');output.delete('Access-Control-Allow-Credentials');
  // Keep sessions host-only on this front end; do not copy unrelated upstream cookies.
  const cookies=response.headers.getSetCookie?.() || (response.headers.get('Set-Cookie')?[response.headers.get('Set-Cookie')]:[]);
  for(const value of cookies)if(value.startsWith(cookieName+'=')&&!/;\s*Domain=/i.test(value)&&/;\s*HttpOnly(?:;|$)/i.test(value)&&/;\s*Path=\/(?:;|$)/i.test(value)&&/;\s*SameSite=Strict(?:;|$)/i.test(value)&&(!config.applicationOrigin.startsWith('https:')||/;\s*Secure(?:;|$)/i.test(value)))output.append('Set-Cookie',value);
  if(api)output.set('Cache-Control','no-store');
  output.set('X-Tobiyori-Data-Source',new URL(config.origin).host);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:output});
}

export function sharedEntryScript(config) {
  return `(()=>{'use strict';const aliases=${JSON.stringify(config.aliases)};function route(){const parts=location.hash.split('/');for(let i=0;i<parts.length;i++){const prefix=parts[i].startsWith('edit-')?'edit-':'';const id=parts[i].slice(prefix.length);if(aliases[id])parts[i]=prefix+aliases[id];}const hash=parts.join('/');if(hash!==location.hash)history.replaceState(null,'',location.pathname+location.search+hash);}route();addEventListener('hashchange',route);function notice(){const f=document.getElementById('accountForm');if(f&&!f.querySelector('[data-shared-account-notice]')){const p=document.createElement('p');p.dataset.sharedAccountNotice='';p.className='hint';p.textContent='これまでのトビヨリのアカウントでログインできます。';f.prepend(p);}}addEventListener('DOMContentLoaded',()=>{notice();new MutationObserver(notice).observe(document.body,{childList:true,subtree:true});});})();`;
}

// Internal Durable Object RPC only. No HTTP export/admin endpoint or account data is exposed.
export async function prepareSharedCutover(db, storage, backups, config) {
  const signature=JSON.stringify([config.origin,Object.entries(config.aliases).sort()]);
  const previous=await storage.get('shared-data:cutover');
  if(previous?.signature===signature)return previous;
  const communities=db.prepare('SELECT id,name FROM live_communities').all();
  const disposableNames=new Set(['【動作確認用】新環境の申込み・連絡テスト','【動作確認用】トビヨリ運営テスト','トビヨリ開発コミュニティ']);
  const real=communities.filter(c=>!disposableNames.has(c.name));
  const ids=new Set(real.map(c=>c.id));
  const activities=db.prepare('SELECT id,community_id FROM live_activities').all().filter(a=>ids.has(a.community_id));
  const activityIds=new Set(activities.map(a=>a.id));
  const unknownCommunities=real.filter(c=>!config.aliases[c.id]).length;
  const unknownActivities=activities.filter(a=>!config.aliases[a.id]).length;
  const applications=db.prepare('SELECT activity_id FROM live_applications').all().filter(a=>activityIds.has(a.activity_id)).length;
  const messages=db.prepare('SELECT activity_id FROM live_activity_messages').all().filter(a=>activityIds.has(a.activity_id)).length;
  if(unknownCommunities||unknownActivities||applications||messages)throw new Error('新サイトの未移行データを確認する必要があります。');
  if(!backups)throw new Error('切替前の保存先がありません。');
  // A private, unique snapshot is required before the independent database stops serving writes.
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
  const createdAt=new Date().toISOString(),dump={createdAt,reason:'before-shared-data-cutover',schema:tables.map(t=>t.sql),tables:{}};
  for(const t of tables)if(!['sessions','google_flows'].includes(t.name))dump.tables[t.name]=db.prepare('SELECT * FROM "'+t.name.replaceAll('"','""')+'"').all();
  const backupKey='shared-data/'+createdAt.replaceAll(':','-')+'-'+crypto.randomUUID()+'.json';
  await backups.put(backupKey,JSON.stringify(dump),{httpMetadata:{contentType:'application/json'}});
  const value={signature,source:config.origin,createdAt,backupKey,applications,messages};
  await storage.put('shared-data:cutover',value);
  return value;
}
