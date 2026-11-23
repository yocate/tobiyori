const assert=require('node:assert/strict');
(async()=>{
 const {frontendOrigin}=await import('./cloudflare/frontend-origin.js'),{sharedDataConfig,forwardSharedData}=await import('./cloudflare/shared-data.js');
 const original={APP_ORIGIN:'https://existing.example.test',SHARED_DATA_ORIGIN:'https://source.example.test',SHARED_FRONTEND_ORIGINS:'https://custom.example.test,https://www.custom.example.test'};
 for(const host of ['existing.example.test','custom.example.test','www.custom.example.test']){
  const request=new Request('https://'+host+'/api/login',{method:'POST',headers:{Origin:'https://'+host,'Content-Type':'application/json'},body:'{}'}),origin=frontendOrigin(new URL(request.url),original),cfg=sharedDataConfig({...original,APP_ORIGIN:origin});
  assert.equal(origin,'https://'+host);let calls=0;
  const result=await forwardSharedData(request,cfg,async upstream=>{calls++;assert.equal(upstream.url,'https://source.example.test/api/login');assert.equal(upstream.headers.get('Origin'),'https://source.example.test');return new Response('{}');});assert.equal(result.status,200);assert.equal(calls,1);
  const cross=new Request(request.url,{method:'POST',headers:{Origin:'https://different.example.test'},body:'{}'});assert.equal((await forwardSharedData(cross,cfg)).status,403);
 }
 assert.equal(original.APP_ORIGIN,'https://existing.example.test');assert.equal(frontendOrigin(new URL('https://evil.example.test'),original),null);assert.equal(frontendOrigin(new URL('http://custom.example.test'),original),'https://custom.example.test');
 for(const extra of ['https://source.example.test','http://insecure.example.test','https://custom.example.test/path','https://u:p@custom.example.test','https://custom.example.test/?x=1'])assert.throws(()=>frontendOrigin(new URL('https://custom.example.test'),{...original,SHARED_FRONTEND_ORIGINS:extra}));
 assert.throws(()=>frontendOrigin(new URL('https://custom.example.test'),{...original,SHARED_DATA_ORIGIN:''}));
 console.log('PASS explicit frontend hosts: existing URL retained, same-source forwarding, cross-origin writes denied, arbitrary hosts and unsafe configuration rejected');
})().catch(e=>{console.error(e);process.exitCode=1;});
