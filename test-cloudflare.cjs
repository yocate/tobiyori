// End-to-end check of the Cloudflare build. Start it first: npm run cf:dev (or point TOBIYORI_BASE at staging).
const assert=require('node:assert/strict');
const base=(process.env.TOBIYORI_BASE||'http://localhost:8877').replace(/\/$/,'');
const jpeg='data:image/jpeg;base64,'+Buffer.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xd9]).toString('base64');
async function api(route,{method,data,user,origin=base}={}){
 const headers={Origin:origin};if(data)headers['Content-Type']='application/json';if(user){headers.Cookie=user.cookie;headers['X-Tobiyori-Account']=user.id;}
 const r=await fetch(base+'/api/'+route,{method:method||(data?'POST':'GET'),headers,body:data?JSON.stringify(data):undefined,redirect:'manual'});
 return {status:r.status,data:await r.json().catch(()=>null),headers:r.headers};
}
(async()=>{
 const stamp=Date.now(),email=`cf-${stamp}@example.test`,password='cloudflare-test-123';
 const page=await fetch(base+'/');assert.equal(page.status,200);
 const policy=page.headers.get('content-security-policy');assert.match(policy,/script-src 'self' 'sha256-/);assert(!/script-src[^;]*unsafe-inline/.test(policy));assert.match(policy,/frame-ancestors 'none'/);
 assert.equal((await fetch(base+'/operator.html')).status,200);
 assert.equal((await fetch(base+'/vendor/leaflet/leaflet.js')).status,200);
 assert.equal((await fetch(base+'/google-login-setup.html')).status,404,'local setup page must not be published');
 assert.equal((await api('me')).status,401);
 assert.equal((await api('register',{data:{email,password,nickname:'検証',consent:true},origin:'https://evil.example'})).status,403,'cross-origin write must fail');
 const reg=await api('register',{data:{email,password,nickname:'検証',consent:true}});assert.equal(reg.status,201,JSON.stringify(reg.data));
 const cookie=reg.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
 assert.equal((await api('register',{data:{email,password,nickname:'検証',consent:true}})).status,409);
 assert.equal((await api('login',{data:{email,password:'wrong-password-1'}})).status,401);
 const login=await api('login',{data:{email,password}});assert.equal(login.status,200);
 const user={id:login.data.user.id,cookie:login.headers.get('set-cookie').split(';')[0]};
 assert.equal((await api('me',{user})).data.user.email,email);
 // Images inside JSON go to R2; the database keeps only the /media/ URL.
 const saved=await api('state',{method:'PUT',user,data:{revision:0,state:{profile:{nickname:'検証'},communityMedia:{x:{pending:{photos:[{src:jpeg,caption:''}],links:{}}}}}}});assert.equal(saved.status,200,JSON.stringify(saved.data));
 const state=(await api('state',{user})).data.state,src=state.communityMedia.x.pending.photos[0].src;
 assert.match(src,/^\/media\/[0-9a-f]{64}\.jpg$/);
 const resent=await api('state',{method:'PUT',user,data:{revision:1,state:{communityMedia:{x:{pending:{photos:[{src:jpeg,caption:''}],links:{}}}}}}});assert.equal(resent.status,200);
 assert.equal((await api('state',{user})).data.state.communityMedia.x.pending.photos[0].src,src,'re-sent photo reuses the stored object');
 const media=await fetch(base+src);assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'image/jpeg');assert.match(media.headers.get('cache-control'),/immutable/);
 assert.equal(Buffer.from(await media.arrayBuffer()).toString('base64'),jpeg.split(',')[1]);
 const fake=await api('state',{method:'PUT',user,data:{revision:2,state:{x:'data:image/png;base64,'+Buffer.from('not an image').toString('base64')}}});assert.equal(fake.status,400,'mislabelled image must be rejected');
 // Anyone can send feedback; reading it needs an operator. Not sent to production, where it would skew the analysis.
 const local=/^http:\/\/(localhost|127\.0\.0\.1)/.test(base);
 if(local)assert.equal((await api('feedback',{data:{category:'idea',body:'Cloudflare確認用のご意見',page:'#/home',device:'desktop',context:{viewport:'1280x900'}}})).status,201);
 assert.equal((await api('feedback/summary')).status,401);
 // Operator flow needs an account listed in ADMIN_ACCOUNT_IDS (TOBIYORI_ADMIN_EMAIL / TOBIYORI_ADMIN_PASSWORD).
 if(process.env.TOBIYORI_ADMIN_EMAIL){
  const a=await api('login',{data:{email:process.env.TOBIYORI_ADMIN_EMAIL,password:process.env.TOBIYORI_ADMIN_PASSWORD}});assert.equal(a.status,200);
  const admin={id:a.data.user.id,cookie:a.headers.get('set-cookie').split(';')[0]};
  const community=await api('live/communities',{user:admin,data:{name:'CF検証団体'+stamp,city:'前橋市',type:'学生団体',intro:'検証用',photos:[{src:jpeg,caption:'検証'}]}});assert(community.status<300,JSON.stringify(community.data));
  const dash=await api('live/dashboard',{user:admin});assert.equal(dash.status,200);assert(JSON.stringify(dash.data).includes('/media/'),'community photo stored as media URL');
  if(local){const fb=await api('feedback?q='+encodeURIComponent('Cloudflare確認用'),{user:admin});assert.equal(fb.status,200);assert(fb.data.total>=1);assert(fb.data.items[0].release&&fb.data.items[0].release!=='local','release recorded');}
  await api('logout',{user:admin,data:{}});
 }
 assert.equal((await api('live/catalog')).status,200);
 assert.equal((await api('logout',{user,data:{}})).status,200);assert.equal((await api('me',{user})).status,401);
 const anonymous=await api('state',{method:'PUT',user:{id:user.id,cookie:'tobiyori_session='+'0'.repeat(64)},data:{revision:0,state:{x:jpeg}}});assert.equal(anonymous.status,401,'uploads need a valid session');
 const forged=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Tobiyori-Internal-Password-Ok':'1'},body:JSON.stringify({email,password:'wrong-password-2'})});
 assert.equal(forged.status,401,'internal headers from the client must be ignored');
 console.log('PASS: Cloudflare build — CSP, static allowlist, origin check, register/login/logout, Worker-side hashing, internal header stripping, R2 media (session-gated, deduplicated), community photos');
})().catch(e=>{console.error(e);process.exitCode=1;});
