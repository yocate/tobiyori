const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-auth-'));
const port=4189,base=`http://127.0.0.1:${port}`;
let processHandle;
async function start(){
 processHandle=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:String(port),TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});
 let output='';processHandle.stderr.on('data',x=>output+=x);
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}
 throw Error('Server did not start '+output);
}
async function stop(){if(processHandle.exitCode!==null)return;const exited=new Promise(r=>processHandle.once('exit',r));processHandle.kill();await exited;}
async function request(route,{method='GET',data,cookie,id,origin=base}={}){
 const headers={Origin:origin};if(data)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;if(id)headers['X-Tobiyori-Account']=id;
 const response=await fetch(base+'/api/'+route,{method,headers,body:data?JSON.stringify(data):undefined});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
}
(async()=>{try{
 await start();
 assert.equal((await request('me')).status,401);
 assert.equal((await request('auth-options')).data.googleEnabled,false);
 assert.equal((await request('google/start',{method:'POST',data:{intent:'login',consent:true}})).status,400);
 const badCallback=await fetch(base+'/api/google/callback?code=invalid&state=invalid',{redirect:'manual'});assert.equal(badCallback.status,303);assert.equal(badCallback.headers.get('location'),'/#/login/google-state');
 assert.equal((await request('register',{method:'POST',data:{email:'no',password:'short'}})).status,400);
 const details={email:'Test@example.com',password:'test-password-123',nickname:'テスト参加者',consent:true};
 const a=await request('register',{method:'POST',data:details});assert.equal(a.status,201);assert.equal(a.data.user.email,'test@example.com');assert(!('password_hash' in a.data.user));
 assert.match(a.cookie,/HttpOnly/);assert.match(a.cookie,/SameSite=Strict/);
 const cookie=a.cookie.split(';')[0],id=a.data.user.id;
 assert.equal((await request('me',{cookie})).data.user.id,id);
 const communityInput={name:'権限テスト団体',city:'高崎市',type:'学生サークル',intro:'HTTP経由の動作確認用です',adminInfo:{notes:'非公開のテスト用確認記録'}};
 assert.equal((await request('live/communities',{method:'POST',cookie,id,data:communityInput})).status,403);
 assert.equal((await request('live/review',{cookie,id})).status,403);
 const adminFixture=new DatabaseSync(path.join(dir,'accounts.sqlite'));adminFixture.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(id);adminFixture.close();
 const community=await request('live/communities',{method:'POST',cookie,id,data:communityInput});assert.equal(community.status,201);
 assert.equal((await request('live/dashboard',{cookie,id})).data.communities.length,1);
 assert.equal((await request('live/catalog')).data.communities.length,0);
 assert.equal((await request('live/review',{cookie,id})).data.communities[0].adminInfo.notes,communityInput.adminInfo.notes);
 assert.equal((await request('register',{method:'POST',data:details})).status,409);
 assert.equal((await request('login',{method:'POST',data:{email:details.email,password:'wrong-password'}})).status,401);
 assert.equal((await request('state',{cookie,id})).data.state,null);
 const saved=await request('state',{method:'PUT',cookie,id,data:{revision:0,state:{profile:{nickname:'保存テスト',interests:['nature']},applications:[{id:'sample',status:'pending'}],role:'OPERATOR'}}});assert.equal(saved.status,200);
 const state=await request('state',{cookie,id});assert.equal(state.data.state.profile.nickname,'保存テスト');assert(!('role' in state.data.state));
 assert.equal((await request('state',{method:'PUT',cookie,id,data:{revision:0,state:{}}})).status,409);
 assert.equal((await request('state',{method:'PUT',cookie,id,origin:'https://evil.example',data:{revision:1,state:{}}})).status,403);
 const b=await request('register',{method:'POST',data:{...details,email:'other@example.com'}});assert.equal(b.status,201);
 const cookieB=b.cookie.split(';')[0],idB=b.data.user.id;
 assert.equal((await request('live/dashboard',{cookie:cookieB,id:idB})).data.communities.length,0);
 assert.equal((await request('live/review',{cookie:cookieB,id:idB})).status,403);
 assert.equal((await request('live/communities',{method:'POST',cookie:cookieB,id:idB,data:communityInput})).status,403);
 assert.equal((await request('live/communities/'+community.data.id+'/confirm',{method:'POST',cookie:cookieB,id:idB,data:{}})).status,403);
 assert.equal((await request('live/dashboard',{cookie:cookieB,id})).status,409);
 assert.equal((await request('state',{cookie:cookieB,id:idB})).data.state,null);
 assert.equal((await request('state',{cookie:cookieB,id})).status,409);
 assert.equal((await request('state',{method:'PUT',cookie:cookieB,id,data:{revision:1,state:{}}})).status,409);
 assert.equal((await request('logout',{method:'POST',cookie,id,data:{}})).status,200);
 assert.equal((await request('me',{cookie})).status,401);
 const login=await request('login',{method:'POST',data:details});assert.equal(login.status,200);
 const loginCookie=login.cookie.split(';')[0];
 assert.equal((await request('state',{cookie:loginCookie,id})).data.state.profile.nickname,'保存テスト');
 for(const file of ['/','/operator.html','/vendor/leaflet/leaflet.js','/tobiyori-logo-source.png'])assert.equal((await fetch(base+file)).status,200);
 assert.equal((await fetch(base+'/tobiyori-server.cjs')).status,404);
 assert.equal((await fetch(base+'/.tobiyori-data/accounts.sqlite')).status,404);
 await stop();await start();
 assert.equal((await request('me',{cookie:loginCookie})).status,200);
 assert.equal((await request('state',{cookie:loginCookie,id})).data.state.applications[0].id,'sample');
 assert.equal((await request('live/review',{cookie:loginCookie,id})).data.communities[0].adminInfo.notes,communityInput.adminInfo.notes);
 const inspect=new DatabaseSync(path.join(dir,'accounts.sqlite'));
 const row=inspect.prepare('SELECT password_hash FROM accounts WHERE id=?').get(id);assert(!row.password_hash.includes(details.password));assert.match(row.password_hash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);
 inspect.prepare('UPDATE sessions SET expires_at=0').run();inspect.close();
 assert.equal((await request('me',{cookie:loginCookie})).status,401);
 for(let i=0;i<15;i++)await request('login',{method:'POST',data:{email:'limited@example.com',password:'wrong-password'}});
 assert.equal((await request('login',{method:'POST',data:{email:'limited@example.com',password:'wrong-password'}})).status,429);
 console.log('PASS: registration, validation, login, cookies, logout, expiry, persistence, account isolation, cross-tab protection, CSRF, revisions, password hashing, rate limits, static allowlist');
}finally{if(processHandle)await stop();const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert(path.basename(resolved).startsWith('tobiyori-auth-'));fs.rmSync(resolved,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
