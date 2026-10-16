const {readOfficialSource}=require('./official-source-fetch.cjs');
const DISCLAIMER='この情報は、コミュニティの公式サイトに掲載された内容を自動で取り込んでいます。運営による内容の確認は行っておらず、正確性・最新性を保証するものではありません。最新の内容や参加条件は、情報元でご確認ください。';
function createOfficialUpdates({db,reader=readOfficialSource,schedule=true,clock=()=>Date.now()}){
 db.exec('CREATE TABLE IF NOT EXISTS live_official_updates(community_id TEXT PRIMARY KEY REFERENCES live_communities(id),source_url TEXT NOT NULL,content TEXT NOT NULL DEFAULT \'{}\',fetched_at TEXT,attempted_at TEXT NOT NULL,error TEXT NOT NULL DEFAULT \'\');');
 const one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 const active=new Map();let closed=false,busy=false;
 function configuration(c){const d=JSON.parse(c.data);return {enabled:d.officialUpdatesEnabled===true,sourceURL:d.feedURL||d.links?.website||'',instagram:d.links?.instagram||''};}
 function snapshot(c){
  const cfg=configuration(c),row=one('SELECT * FROM live_official_updates WHERE community_id=?',c.id),data=cfg.enabled&&row?.source_url===cfg.sourceURL?row:null;
  return {enabled:cfg.enabled,sourceURL:cfg.sourceURL,disclaimer:DISCLAIMER,verification:'unreviewed',instagram:{url:cfg.instagram,status:cfg.instagram?'not_connected':'not_set'},...(data?{...JSON.parse(data.content),fetchedAt:data.fetched_at,attemptedAt:data.attempted_at,error:data.error,stale:!!data.error||!data.fetched_at||clock()-Date.parse(data.fetched_at)>2*86400000}:{items:[],fetchedAt:null,attemptedAt:null,error:'',stale:false})};
 }
 async function refresh(cid){
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  if(closed)fail(503,'更新処理を停止しています。');
  const c=one('SELECT * FROM live_communities WHERE id=?',cid);if(!c)fail(404,'団体が見つかりません。');
  const cfg=configuration(c);
  if(c.status!=='VERIFIED'||c.paused||!cfg.enabled||!cfg.sourceURL)fail(400,'団体の公開・自動取得の設定を確認してください。');
  if(active.has(cid))fail(429,'この団体の情報を取得中です。');
  const last=one('SELECT * FROM live_official_updates WHERE community_id=?',cid);
  if(last?.source_url===cfg.sourceURL&&clock()-Date.parse(last.attempted_at)<300000)fail(429,'再取得は5分ほど空けてください。');
  const controller=new AbortController();active.set(cid,controller);
  const attempted=new Date(clock()).toISOString();let content={},fetchedAt=null,error='';
  if(last?.source_url===cfg.sourceURL){content=JSON.parse(last.content);fetchedAt=last.fetched_at;}
  try{content=await reader(cfg.sourceURL,{signal:controller.signal});fetchedAt=new Date(clock()).toISOString();}
  catch(e){error=e.status===400?e.message:'情報元に接続できませんでした。公式ページでご確認ください。';}
  finally{active.delete(cid);}
  if(closed)return null;
  const current=one('SELECT * FROM live_communities WHERE id=?',cid);
  // A source changed, paused or revoked during the request must not publish its result.
  if(!current||current.status!=='VERIFIED'||current.paused||!configuration(current).enabled||configuration(current).sourceURL!==cfg.sourceURL)return null;
  run('INSERT INTO live_official_updates VALUES(?,?,?,?,?,?) ON CONFLICT(community_id) DO UPDATE SET source_url=excluded.source_url,content=excluded.content,fetched_at=excluded.fetched_at,attempted_at=excluded.attempted_at,error=excluded.error',cid,cfg.sourceURL,JSON.stringify(content),fetchedAt,attempted,error);
  return snapshot(current);
 }
 async function tick(){
  if(busy||closed)return;busy=true;
  try{for(const c of db.prepare("SELECT * FROM live_communities WHERE status='VERIFIED' AND paused=0").all()){
   if(closed)break;const cfg=configuration(c);if(!cfg.enabled||!cfg.sourceURL)continue;
   const row=one('SELECT source_url,attempted_at FROM live_official_updates WHERE community_id=?',c.id);
   if(!row||row.source_url!==cfg.sourceURL||clock()-Date.parse(row.attempted_at)>=86400000){try{await refresh(c.id);}catch{/* A concurrent manual refresh will finish the same work. */}}
  }}finally{busy=false;}
 }
 const timer=schedule?setInterval(tick,60000):null;timer?.unref();
 return {snapshot,refresh,tick,close(){closed=true;if(timer)clearInterval(timer);for(const controller of active.values())controller.abort();}};
}
module.exports={createOfficialUpdates,DISCLAIMER};
