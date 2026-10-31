// 公式情報の不正フィードと、取得途中の再起動を隔離DBで確認する。
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {performance}=require('node:perf_hooks');
const {parsePage}=require('./official-source-fetch.cjs');
const {createOfficialUpdates}=require('./official-updates.cjs');
const url='https://example.org/feed';
const item=(n,extra='')=>`<item><title>記事 ${n}</title><link>https://example.org/${n}</link><pubDate>${new Date(Date.UTC(2026,0,1+n)).toISOString()}</pubDate>${extra}</item>`;
async function main(){
 // 上限後にある新しい記事は取得しない。全件マッチしてから切り捨てる必要がない。
 const many=parsePage({url,body:'<rss>'+Array.from({length:101},(_,i)=>item(i)).join('')+'</rss>'});
 assert.equal(many.items.length,5);assert.deepEqual(many.items.map(x=>x.url),[99,98,97,96,95].map(n=>`https://example.org/${n}`));
 for(const malformed of ['<item>'.repeat(12000),'<entry>'.repeat(12000),'<item '.repeat(12000)])assert.deepEqual(parsePage({url,body:'<rss>'+malformed}).items,[]);
 const cdata=parsePage({url,body:'<rss><!--'+item(200)+'--><![CDATA['+item(201)+']]><item><title><![CDATA[<b>日本語 &amp; 記事</b>]]></title><link>https://example.org/real</link><description><![CDATA[<script>alert(1)</script><style>bad-css</style><p>説明 &lt;確認&gt;</p>]]></description></item></rss>'});
 assert.equal(cdata.items.length,1);assert.equal(cdata.items[0].title,'日本語 & 記事');assert.equal(cdata.items[0].text,'説明 <確認>');
 const atom=parsePage({url,body:'<feed><entry><title>Atom</title><link rel="self" href="/ignored"/><link rel="alternate" href="/real?x=1&amp;y=2"/><summary>本文</summary></entry></feed>'});
 assert.equal(atom.items[0].url,'https://example.org/real?x=1&y=2');
 const html=parsePage({url,body:'<html><head><title>代替のタイトル</title><meta property="og:title" content="比較 A > B"><meta name="description" content="説明"><link rel="alternate" type="application/rss+xml" href="/news"></head></html>'});
 assert.equal(html.items[0].title,'比較 A > B');assert.equal(html.feedURL,'https://example.org/news');
 // JS/CSS本文の < と未対の引用符で、後続メタ情報を飲み込まない。
 for(const name of ['script','style']){
  const raw=`<${name}>for(i=0;i<n;i++){} // don't <meta property="og:title" content="偽物"><title>偽タイトル</title><link rel="alternate" type="application/rss+xml" href="/fake"></${name}ure></${name.toUpperCase()} >`;
  const page=parsePage({url,body:`<html><head>${raw}<meta property="og:title" content="X"><meta name="description" content="本文"><title>Fallback</title></head></html>`});
  assert.equal(page.items[0].title,'X');assert.equal(page.items[0].text,'本文');assert.equal(page.feedURL,'');
  const fallback=parsePage({url,body:`<html><head>${raw}<title>後続タイトル</title></head></html>`});assert.equal(fallback.items[0].title,'後続タイトル');
  const feed=parsePage({url,body:`<rss>${item(1,`<description><![CDATA[前 ${raw} 後]]></description>`)}</rss>`});assert.equal(feed.items[0].text,'前 後');
 }
 const longScript=parsePage({url,body:'<html><script>'+"<n // don't ".repeat(12000)+'</script><title>末尾</title></html>'});assert.equal(longScript.items[0].title,'末尾');
 const scripts=parsePage({url,body:'<rss><item><title>記事</title><link>https://example.org/a</link><description><![CDATA[説明<script>'+ '<script>'.repeat(12000)+']]></description></item></rss>'});
 assert.equal(scripts.items[0].text,'説明');

 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE live_communities(id TEXT PRIMARY KEY,status TEXT,paused INTEGER,data TEXT);');
 db.prepare('INSERT INTO live_communities VALUES(?,?,?,?)').run('org','VERIFIED',0,JSON.stringify({officialUpdatesEnabled:true,feedURL:url}));
 let time=Date.parse('2026-10-30T00:00:00Z'),finish,calls=0;
 const successful={mode:'feed',items:[{title:'前回の成功記事',url:'https://example.org/previous'}]};
 const service=createOfficialUpdates({db,schedule:false,clock:()=>time,reader:async()=>{calls++;if(calls===1)return successful;return new Promise(resolve=>finish=resolve);}});
 let restarted;
 try{
  const first=await service.refresh('org');time+=300001;
  const pending=service.refresh('org');
  const inProgress=db.prepare('SELECT * FROM live_official_updates WHERE community_id=?').get('org');
  assert.equal(inProgress.attempted_at,new Date(time).toISOString(),'外部処理を待つ前に試行時刻が保存される');
  assert.equal(inProgress.fetched_at,first.fetchedAt);assert.deepEqual(JSON.parse(inProgress.content),successful,'前回の成功内容を維持する');
  let restartCalls=0;
  restarted=createOfficialUpdates({db,schedule:false,clock:()=>time,reader:async()=>{restartCalls++;throw Error('取得失敗');}});
  await assert.rejects(restarted.refresh('org'),e=>e.status===429,'再起動後も手動再取得間隔を守る');
  await restarted.tick();assert.equal(restartCalls,0,'次の定期処理で即再試行しない');
  service.close();finish(successful);assert.equal(await pending,null);
  time+=86400001;await restarted.tick();assert.equal(restartCalls,1);
  const failed=restarted.snapshot(db.prepare('SELECT * FROM live_communities WHERE id=?').get('org'));
  assert.deepEqual(failed.items,successful.items);assert.equal(failed.fetchedAt,first.fetchedAt);assert(failed.error&&failed.stale);
 }finally{service.close();restarted?.close();db.close();}
 const timings=[];
 for(const count of [3000,6000,12000]){const body='<rss>'+'<item>'.repeat(count),start=performance.now();parsePage({url,body});timings.push({bytes:Buffer.byteLength(body),elapsedMs:Math.round((performance.now()-start)*100)/100});}
 console.log('PASS: bounded RSS/Atom parsing, malformed tags, CDATA, HTML metadata, script stripping, persisted attempts, restart cooldown and prior-content preservation');
 console.log('Local malformed-feed timing (informational): '+JSON.stringify(timings));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
