const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),dns=require('node:dns');
const {isPublicIPv4,publicURL,safeLookup,parsePage,readOfficialSource,fetchPublicPage}=require('./official-source-fetch.cjs');
const {createOfficialUpdates,DISCLAIMER}=require('./official-updates.cjs');
const {createCommunityService}=require('./community-service.cjs');
async function main(){
 for(const ip of ['127.0.0.1','0.0.0.0','10.1.2.3','169.254.169.254','172.16.1.2','192.168.1.1','100.100.100.100','198.18.0.1','192.0.2.1','224.0.0.1','::1','::ffff:127.0.0.1'])assert(!isPublicIPv4(ip),ip);
 assert(isPublicIPv4('8.8.8.8'));
 for(const url of ['http://localhost','http://127.1','http://2130706433','http://0x7f000001','http://[::1]','http://example.org:4177','https://user:pass@example.org','file:///test','https://www.instagram.com/example/'])assert.throws(()=>publicURL(url));
 await assert.rejects(fetchPublicPage('http://169.254.169.254/latest/meta-data'));
 const oldLookup=dns.lookup;try{dns.lookup=(host,opts,cb)=>cb(null,[{address:'127.0.0.1',family:4}]);await assert.rejects(new Promise((resolve,reject)=>safeLookup('example.org',{},(e,x)=>e?reject(e):resolve(x))));dns.lookup=(host,opts,cb)=>cb(null,[{address:'8.8.8.8',family:4}]);assert.deepEqual(await new Promise((resolve,reject)=>safeLookup('example.org',{all:true},(e,x)=>e?reject(e):resolve(x))),[{address:'8.8.8.8',family:4}]);}finally{dns.lookup=oldLookup;}
 const rss='<rss><channel><item><title>旧記事</title><link>https://example.org/old</link><pubDate>2026-09-01</pubDate></item><item><title><![CDATA[<b>新しい活動</b>]]></title><link>https://example.org/new</link><description><![CDATA[<script>alert(1)</script><p>短い説明 &amp; お知らせ</p>]]></description><pubDate>2026-09-30</pubDate></item><item><title>悪いリンク</title><link>javascript:alert(1)</link></item><item><title>リンクなし</title></item></channel></rss>';
 const parsed=parsePage({url:'https://example.org/feed',body:rss});assert.equal(parsed.items.length,2);assert.equal(parsed.items[0].title,'新しい活動');assert(!parsed.items[0].text.includes('alert'));assert.equal(parsed.mode,'feed');
 const atom=parsePage({url:'https://example.org/feed',body:'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom記事</title><link href="/article"/><updated>2026-09-30T00:00:00Z</updated></entry></feed>'});assert.equal(atom.items[0].url,'https://example.org/article');
 assert.throws(()=>parsePage({url:'https://example.org',body:'<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///secret">]><rss></rss>'}));
 const html='<html><head><title>公式ホームページ</title><meta name="description" content="団体の紹介"><link rel="alternate" type="application/rss+xml" href="/feed"></head></html>';
 const result=await readOfficialSource('https://example.org',{fetcher:async url=>({url,body:url.endsWith('/feed')?rss:html})});assert.equal(result.mode,'feed');assert.equal(result.feedURL,'https://example.org/feed');
 const fallback=await readOfficialSource('https://example.org',{fetcher:async url=>{if(url.endsWith('/feed'))throw Error('down');return {url,body:html};}});assert.equal(fallback.mode,'page');assert.equal(fallback.items[0].publishedAt,null);
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE accounts(id TEXT PRIMARY KEY,nickname TEXT,email TEXT);CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,content TEXT);');for(const id of ['admin','member'])db.prepare('INSERT INTO accounts VALUES(?,?,?)').run(id,id,id+'@example.test');
 let time=Date.now(),calls=0,fail=false,resolveReader=null;
 const reader=async()=>{calls++;if(resolveReader)return await new Promise(r=>{resolveReader=r;});if(fail)throw Error('request failure');return parsed;};
 const service=createCommunityService({db,sourceOptions:{reader,schedule:false,clock:()=>time}});db.prepare("INSERT INTO account_roles VALUES('admin','ADMIN')").run();
 async function api(path,user,input){let result;try{await service.handle({req:{method:input?'POST':'GET',headers:{'x-tobiyori-account':user}},res:{},url:new URL('http://localhost/api/live/'+path),user:user?{id:user}:null,readBody:async()=>input,respond:(_,status,data)=>result={status,data}});}catch(e){result={status:e.status||500,data:{error:e.message}};}return result;}
 try{
  const data={name:'情報取得の検証団体',city:'高崎市',type:'地域団体',intro:'確認済みの紹介文',genres:[],links:{website:'https://example.org',instagram:'https://www.instagram.com/example/'},officialUpdatesEnabled:true,adminInfo:{consentConfirmed:true}};
  assert.equal((await api('communities','admin',{...data,links:{website:'http://localhost'}})).status,400);
  const {data:{id}}=await api('communities','admin',data);assert(id);
  assert.equal((await api('official-updates/'+id)).status,404);assert.equal((await api('official-updates/'+id,'admin',{})).status,400);
  assert.equal((await api('review/'+id+'/approve','admin',{type:'community',note:'検証',identityChecked:true,consentChecked:true})).status,200);
  const before=db.prepare('SELECT data,confirmed_at FROM live_communities WHERE id=?').get(id);
  assert.equal((await api('official-updates/'+id,'member',{})).status,403);assert.equal(calls,0);
  const update=await api('official-updates/'+id,'admin',{});assert.equal(update.status,200);assert.equal(update.data.updates.verification,'unreviewed');assert.equal(update.data.updates.disclaimer,DISCLAIMER);assert.equal(update.data.updates.instagram.status,'not_connected');assert.equal(update.data.updates.items.length,2);
  assert.deepEqual(db.prepare('SELECT data,confirmed_at FROM live_communities WHERE id=?').get(id),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM live_activities').get().n,0);
  assert.equal((await api('official-updates/'+id,'admin',{})).status,429);
  time+=300001;fail=true;const failed=(await api('official-updates/'+id,'admin',{})).data.updates;assert(failed.stale&&failed.error);assert.equal(failed.items.length,2);assert.equal(failed.fetchedAt,update.data.updates.fetchedAt);
  const scheduler=createOfficialUpdates({db,reader,schedule:false,clock:()=>time});const startCalls=calls;await scheduler.tick();assert.equal(calls,startCalls);time+=86400001;fail=false;await scheduler.tick();assert.equal(calls,startCalls+1);
  time+=300001;resolveReader=true;const pending=scheduler.refresh(id);db.prepare('UPDATE live_communities SET paused=1 WHERE id=?').run(id);resolveReader(parsed);assert.equal(await pending,null);scheduler.close();assert.equal((await api('official-updates/'+id)).status,404);
  console.log('PASS: public network guard, DNS pinning, RSS/Atom parsing, HTML fallback, no unsafe links, no private entity expansion, disclosure, ownership, rate limits, cache preservation, no auto-approval/field overwrite, daily schedule and paused-source race');
 }finally{service.close();db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
