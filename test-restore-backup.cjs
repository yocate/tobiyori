// Moving to another Cloudflare account: a daily backup restored into a fresh database keeps accounts,
// passwords, roles and communities, and drops everything the destination had before.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {restoreBackup,dumpDatabase}=require('./restore-backup.cjs');
const port=4191,base=`http://127.0.0.1:${port}`;
let handle;
async function start(dir){
 handle=spawn(process.execPath,['tobiyori-server.cjs'],{cwd:__dirname,env:{...process.env,TOBIYORI_PORT:String(port),TOBIYORI_DATA_DIR:dir},stdio:'pipe',windowsHide:true});
 let output='';handle.stderr.on('data',x=>output+=x);
 for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}
 throw Error('Server did not start '+output);
}
async function stop(){if(handle.exitCode!==null||handle.signalCode!==null)return;const exited=new Promise(r=>handle.once('exit',r));handle.kill();await exited;}
async function request(route,{method='GET',data,cookie,id}={}){
 const headers={Origin:base};if(data)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;if(id)headers['X-Tobiyori-Account']=id;
 const r=await fetch(base+'/api/'+route,{method,headers,body:data?JSON.stringify(data):undefined});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
}
const open=dir=>{const db=new DatabaseSync(path.join(dir,'accounts.sqlite'));db.exec('PRAGMA foreign_keys=ON;');return db;};
(async()=>{
 const source=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-restore-src-')),target=fs.mkdtempSync(path.join(os.tmpdir(),'tobiyori-restore-dst-'));
 try{
  // Old site: an operator account with one community.
  await start(source);
  const owner={email:'owner@example.test',password:'owner-password-123',nickname:'移行元の運営者',consent:true};
  const reg=await request('register',{method:'POST',data:owner});assert.equal(reg.status,201);
  const id=reg.data.user.id,cookie=reg.cookie.split(';')[0];
  await stop();
  let db=open(source);db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN')").run(id);db.close();
  await start(source);
  const made=await request('live/communities',{method:'POST',cookie,id,data:{name:'移行テスト団体',city:'高崎市',type:'学生サークル',intro:'引っ越しの確認用です'}});assert.equal(made.status,201,JSON.stringify(made.data));
  await stop();
  db=open(source);const dump=JSON.parse(JSON.stringify(dumpDatabase(db)));db.close();
  assert(!('sessions' in dump.tables),'sessions are not part of a backup');

  // New site: already used for testing, with its own account.
  await start(target);
  assert.equal((await request('register',{method:'POST',data:{email:'tester@example.test',password:'tester-password-123',nickname:'試験',consent:true}})).status,201);
  await stop();

  db=open(target);
  assert.throws(()=>restoreBackup(db,dump),/すでにアカウント/,'refuses to overwrite without replace');
  assert.throws(()=>restoreBackup(db,{tables:{}}),/形式/);
  const before=JSON.parse(JSON.stringify(dumpDatabase(db)));
  // Incomplete or malformed backups are refused before anything is deleted.
  const countAccounts=()=>db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
  const missingTable=JSON.parse(JSON.stringify(dump));delete missingTable.tables.live_communities;
  assert.throws(()=>restoreBackup(db,missingTable,{replace:true}),/不完全/,'a table named in the schema but missing from the rows');
  const badRows=JSON.parse(JSON.stringify(dump));badRows.tables.live_communities='oops';
  assert.throws(()=>restoreBackup(db,badRows,{replace:true}),/形式/,'rows that are not a list');
  assert.equal(countAccounts(),1,'refused restores leave the destination as it was');
  assert.deepEqual(JSON.parse(JSON.stringify(dumpDatabase(db))).tables,before.tables);
  // A row pointing at an account that is not in the backup is caught before commit and rolled back.
  const dangling=JSON.parse(JSON.stringify(dump));
  dangling.tables.live_communities.push({...dangling.tables.live_communities[0],id:'dangling-community',owner_id:'no-such-account'});
  assert.throws(()=>restoreBackup(db,dangling,{replace:true}),/参照関係/,'dangling foreign key');
  assert.equal(db.prepare('SELECT email FROM accounts').get().email,'tester@example.test','destination data survives a dangling-reference restore');
  // A failure while loading rows rolls back everything, including tables created for the backup.
  const broken=JSON.parse(JSON.stringify(dump));
  broken.schema.push('CREATE TABLE restore_probe (id INTEGER PRIMARY KEY)');broken.tables.restore_probe=[{id:1}];
  broken.tables.accounts.push({...broken.tables.accounts[0]});
  assert.throws(()=>restoreBackup(db,broken,{replace:true}));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='restore_probe'").get().n,0,'no half-made table remains');
  assert.equal(db.prepare('SELECT email FROM accounts').get().email,'tester@example.test','destination data survives a failed restore');
  const result=restoreBackup(db,dump,{replace:true});
  assert.equal(result.counts.accounts,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0,'nobody stays signed in on the new site');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  // The pre-restore copy can bring the test site back.
  assert.equal(before.tables.accounts[0].email,'tester@example.test');
  db.close();

  await start(target);
  assert.equal((await request('login',{method:'POST',data:{email:'tester@example.test',password:'tester-password-123'}})).status,401,'destination accounts are replaced');
  const login=await request('login',{method:'POST',data:{email:owner.email,password:owner.password}});assert.equal(login.status,200,'same password works after the move');
  assert.equal(login.data.user.id,id,'account id is kept, so ADMIN_ACCOUNT_IDS can stay the same');
  const dash=await request('live/dashboard',{cookie:login.cookie.split(';')[0],id});
  assert.equal(dash.status,200);assert.equal(dash.data.communities[0].name,'移行テスト団体');
  await stop();

  // Rolling back: restoring the saved copy returns the test site as it was.
  db=open(target);restoreBackup(db,before,{replace:true});assert.equal(db.prepare('SELECT email FROM accounts').get().email,'tester@example.test');db.close();
  console.log('restore backup tests passed');
 }finally{await stop().catch(()=>{});for(const d of [source,target])fs.rmSync(d,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
