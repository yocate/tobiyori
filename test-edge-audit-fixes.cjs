const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const ipModule=require('./rate-limit-ip.cjs');

// Cloudflare固有の入口だけを差し替え、実際のWorker処理をモック環境で実行する。
const source=fs.readFileSync(path.join(__dirname,'cloudflare/worker.js'),'utf8')
  .replace(/^import .*;\n/gm,'')
  .replace('export default {','const worker = {')
  .replace('export class TobiyoriDatabase','class TobiyoriDatabase')+'\nworker;';
function limiter(max){
  const counts=new Map(),keys=[];
  return {keys,counts,async limit({key}){keys.push(key);const n=(counts.get(key)||0)+1;counts.set(key,n);return {success:n<=max};}};
}
function harness(extractMedia,{apiMax=2,networkMax=100,authMax=2,bucket,respond}={}){
  const sessionCalls=[],forwarded=[],credentialCalls=[],hashCalls=[];
  const sessions=new Map([['session-a','member-a'],['session-b','member-b']]);
  const db={
    async sessionUserId(cookie){sessionCalls.push(cookie);return sessions.get(cookie)||null;},
    async credential(email){credentialCalls.push(email);return 'stored-hash';},
    async fetch(request){forwarded.push(request);return respond?respond(request):new Response('{}',{status:200});},
  };
  const worker=vm.runInNewContext(source,{ipModule,DurableObject:class{},appModule:{createApp(){},localHasher:{async hash(password){hashCalls.push(password);return 'hash';},async verify(){return false;}}},DurableSqlite:class{},nodeRequest(){},nodeResponse(){},extractMedia,serveMedia(){},csp:{scriptHashes:[]},Response,Request,Headers,URL,TextEncoder,TextDecoder,Date,setTimeout,console});
  const env={APP_ORIGIN:'https://audit.local',DB:{idFromName:()=> 'primary',get:()=>db},API_LIMITER:limiter(apiMax),NETWORK_LIMITER:limiter(networkMax),AUTH_LIMITER:limiter(authMax),MEDIA:bucket};
  const pending=[];const ctx={waitUntil(p){pending.push(p);}};
  const request=({cookie,ip='shared-campus',account='forged-account',method='GET',url='/api/live/catalog',body,extraHeaders={}}={})=>worker.fetch(new Request('https://audit.local'+url,{method,headers:{'cf-connecting-ip':ip,'x-tobiyori-account':account,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin:env.APP_ORIGIN}:{}),...extraHeaders},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
  return {request,env,sessionCalls,credentialCalls,hashCalls,forwarded,pending};
}

(async()=>{
  const {extractMedia}=await import(pathToFileURL(path.join(__dirname,'cloudflare/media.js')).href);
  const {rateLimitIp}=ipModule;
  assert.equal(rateLimitIp('2001:db8:1:2::a'),rateLimitIp('2001:0db8:0001:0002:ffff:0000:0000:000b'));
  assert.notEqual(rateLimitIp('2001:db8:1:2::1'),rateLimitIp('2001:db8:1:3::1'));
  assert.equal(rateLimitIp('192.0.2.1'),'192.0.2.1');
  assert.equal(rateLimitIp('::ffff:192.0.2.1'),'192.0.2.1');
  assert.equal(rateLimitIp('0:0:0:0:0:ffff:c000:201'),'192.0.2.1');
  assert.notEqual(rateLimitIp('192.0.2.1'),rateLimitIp('192.0.2.2'));
  for(const mode of ['auth','network','anonymous']){
    const subnet=harness(extractMedia,{apiMax:mode==='anonymous'?1:100,networkMax:mode==='network'?1:100,authMax:1});
    const opts=mode==='auth'?{method:'POST',url:'/api/login',body:{email:'a@example.test',password:'password'}}:{};
    assert.equal((await subnet.request({...opts,ip:'2001:db8:1:2::a'})).status,200);
    assert.equal((await subnet.request({...opts,ip:'2001:0db8:0001:0002:ffff::b'})).status,429,mode+'は/64を共有');
    assert.equal((await subnet.request({...opts,ip:'2001:db8:1:3::a'})).status,200);
    assert.equal((await subnet.request({...opts,ip:'192.0.2.1'})).status,200);
    assert.equal((await subnet.request({...opts,ip:'::ffff:c000:201'})).status,429,mode+'はmapped IPv4を共有');
  }
  const h=harness(extractMedia);
  assert.equal((await h.request({cookie:'session-a'})).status,200);
  assert.equal((await h.request({cookie:'session-a'})).status,200);
  const blocked=await h.request({cookie:'session-a'});
  assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'60');
  assert.equal((await h.request({cookie:'session-b',account:'member-a'})).status,200,'同じIPでも別利用者の枠を利用できる');
  assert.deepEqual(h.env.API_LIMITER.keys,['user:member-a','user:member-a','user:member-a','user:member-b'],'申告IDではなく検証済みのIDを使用');

  const anonymous=harness(extractMedia);
  assert.equal((await anonymous.request({cookie:'forged-session-a',account:'member-a'})).status,200);
  assert.equal((await anonymous.request({cookie:'forged-session-b',account:'member-b'})).status,200);
  assert.equal((await anonymous.request({cookie:'forged-session-c',account:'member-c'})).status,429,'無効なCookieを変えてもIP枠を共有');
  assert.deepEqual(anonymous.env.API_LIMITER.keys,['ip:shared-campus','ip:shared-campus','ip:shared-campus']);
  assert.equal((await anonymous.request({ip:'another-network'})).status,200,'未認証でも異なる回線は別枠');
  assert.equal(anonymous.sessionCalls.length,3,'Cookieなしでは不要なセッションRPCをしない');

  const network=harness(extractMedia,{networkMax:2});
  await network.request({cookie:'invalid-1'});await network.request({cookie:'invalid-2'});
  const overNetwork=await network.request({cookie:'invalid-3'});
  assert.equal(overNetwork.status,429);assert.equal(overNetwork.headers.get('retry-after'),'60');
  assert.equal(network.sessionCalls.length,2,'回線全体の上限はセッション照会より前');
  assert.equal(network.env.API_LIMITER.keys.length,2);

  const auth=harness(extractMedia);
  for(let i=0;i<2;i++)assert.equal((await auth.request({method:'POST',url:'/api/login',body:{email:'member@example.test',password:'password'}})).status,200);
  assert.equal((await auth.request({method:'POST',url:'/api/login',body:{email:'member@example.test',password:'password'}})).status,429);
  assert.equal(auth.credentialCalls.length,2);assert.equal(auth.sessionCalls.length,0);
  assert.deepEqual(auth.env.AUTH_LIMITER.keys,['auth:shared-campus','auth:shared-campus','auth:shared-campus']);
  assert.equal(auth.env.API_LIMITER.keys.length,0,'ログインは従来の認証専用上限を使う');
  await auth.request({method:'PUT',url:'/api/login',body:{email:'member@example.test',password:'password'},extraHeaders:{'x-tobiyori-internal-password-ok':'1'}});
  assert.equal(auth.credentialCalls.length,2,'認証以外のメソッドでパスワード計算を起動しない');
  assert.equal(auth.forwarded.at(-1).headers.get('x-tobiyori-internal-password-ok'),null);

  // 同じ画像の存在確認が両方で未保存となり、片方だけDBで拒否される競合を作る。
  const objects=new Map();let heads=0,release,deleteCalls=0;
  const barrier=new Promise(resolve=>release=resolve);
  const bucket={async head(key){const found=objects.has(key)?{}:null;if(++heads===2)release();await barrier;return found;},async put(key,value){objects.set(key,value);},async delete(key){deleteCalls++;objects.delete(key);}};
  let acceptedUrl='';
  const media=harness(extractMedia,{apiMax:10,bucket,respond:async request=>{
    const body=await request.json();if(body.revision===0)acceptedUrl=body.state.profile.photo;
    return new Response('{}',{status:body.revision===0?200:409});
  }});
  const photo='data:image/jpeg;base64,'+Buffer.from([0xff,0xd8,0xff,0xe0,0,1]).toString('base64');
  const saved=await Promise.all([0,1].map(revision=>media.request({cookie:'session-a',method:'PUT',url:'/api/state',body:{revision,state:{profile:{photo}}}})));
  await Promise.all(media.pending);
  assert.deepEqual(saved.map(r=>r.status),[200,409]);
  assert.equal(heads,2);assert.equal(deleteCalls,0);
  assert.equal(objects.size,1);assert(objects.has(acceptedUrl.slice(1)),'成功した保存が参照する共通画像を残す');
  assert.equal(media.sessionCalls.length,2,'画像処理はリクエスト内のセッション確認を再利用');

  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
  for(const [value,id] of [[config,'41003'],[config.env.staging,'41013'],[config.env.production,'41023']]){
    const network=value.ratelimits.find(r=>r.name==='NETWORK_LIMITER');assert.equal(network.namespace_id,id);assert.deepEqual(network.simple,{limit:6000,period:60});
    assert.equal(value.ratelimits.find(r=>r.name==='API_LIMITER').simple.limit,600);
    assert.equal(value.ratelimits.find(r=>r.name==='AUTH_LIMITER').simple.limit,10);
  }
  console.log('PASS: verified-user API budgets, anonymous IP budget, network guard before session lookup, auth budget, Retry-After, header stripping and concurrent-image preservation');
})().catch(error=>{console.error(error);process.exitCode=1;});
