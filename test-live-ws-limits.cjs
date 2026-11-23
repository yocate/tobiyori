// Run only against an isolated local Wrangler environment, never production.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),WS=require('ws');
const base=process.env.TOBIYORI_BASE||'http://localhost:8892',url=new URL(base);
assert(['localhost','127.0.0.1'].includes(url.hostname),'local test environment required');
const sockets=[];
async function register(){
 const response=await fetch(base+'/api/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:crypto.randomUUID()+'@example.test',password:crypto.randomBytes(18).toString('hex'),nickname:'【ローカル検証】通知上限',consent:true})});
 assert(response.ok,await response.text());return response.headers.get('set-cookie').split(';')[0];
}
function connect(cookie){return new Promise((resolve,reject)=>{
 const socket=new WS(base.replace(/^http/,'ws')+'/api/live/updates',{headers:{Origin:base,...(cookie?{Cookie:cookie}:{})}});sockets.push(socket);
 socket.once('open',()=>resolve(socket));socket.once('error',reject);
});}
(async()=>{
 const a=await register(),b=await register();
 for(let n=0;n<16;n++){await connect(a);await connect(b);}
 await assert.rejects(()=>connect(a),/503/,'a seventeenth socket for one account is rejected');
 await connect();
 console.log('PASS workerd: per-account socket limit and anonymous access after 32 authenticated sockets from the same IP');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const socket of sockets)socket.terminate();});
