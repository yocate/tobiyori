const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite'),{restoreBackup,dumpDatabase}=require('./restore-backup.cjs');
// Exercise the real Worker RPC method with an in-memory DB and private backup stub.
const source=fs.readFileSync('cloudflare/worker.js','utf8');
const start=source.indexOf('  async restoreFromBackup('),end=source.indexOf('  // Daily logical backup',start);
assert(start>=0&&end>start);
const Host=vm.runInNewContext('(class {'+source.slice(start,end)+'})',{restoreBackup,dumpDatabase,console:{log(){},error(){}}});
function database(name){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE accounts(id TEXT PRIMARY KEY); CREATE TABLE children(id TEXT PRIMARY KEY,user_id TEXT REFERENCES accounts(id)); CREATE TABLE sessions(id TEXT PRIMARY KEY);');db.prepare('INSERT INTO accounts VALUES(?)').run(name);return db;}
function host(db,dump,{adminFails=false,snapshotFails=false}={}){
 const rpc=new Host(),snapshots=[];let locked=false,adminCalls=0;
 rpc.db=db;rpc.ctx={async blockConcurrencyWhile(fn){assert(!locked);locked=true;try{return await fn();}finally{locked=false;}}};
 rpc.env={BACKUPS:{async get(){return{text:async()=>JSON.stringify(dump)};},async put(key,value){assert(locked,'snapshot must be inside the exclusion window');if(snapshotFails)throw Error('simulated backup write failure');snapshots.push(JSON.parse(value));}}};
 rpc.syncAdmins=()=>{assert(locked);adminCalls++;if(adminFails)throw Error('simulated admin sync failure');};
 return{rpc,snapshots,get adminCalls(){return adminCalls;}};
}
(async()=>{
 const original=database('restored'),dump=dumpDatabase(original);original.close();
 for(const adminFails of [false,true]){
  const db=database('existing'),h=host(db,dump,{adminFails});
  try{const result=await h.rpc.restoreFromBackup('restore/test.json',true);assert.equal(result.ok,true);assert.equal(result.adminSync,adminFails?'failed':'ok');assert.equal(result.counts.accounts,1);assert.equal(db.prepare('SELECT id FROM accounts').get().id,'restored');assert.equal(h.snapshots[0].tables.accounts[0].id,'existing');assert.equal(h.adminCalls,1);}finally{db.close();}
 }
 {
  const db=database('existing'),broken=JSON.parse(JSON.stringify(dump));broken.tables.children=[{id:'bad',user_id:'missing'}];const h=host(db,broken);
  try{const result=await h.rpc.restoreFromBackup('restore/test.json',true);assert.equal(result.status,400);assert.match(result.error,/参照関係/);assert.equal(db.prepare('SELECT id FROM accounts').get().id,'existing');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM children').get().n,0);assert.equal(h.adminCalls,0);}finally{db.close();}
 }
 {
  const db=database('existing'),h=host(db,dump,{snapshotFails:true});
  try{const result=await h.rpc.restoreFromBackup('restore/test.json',true);assert.equal(result.status,500);assert.equal(db.prepare('SELECT id FROM accounts').get().id,'existing');assert.equal(h.adminCalls,0);}finally{db.close();}
 }
 console.log('PASS restore RPC: valid restore, admin-only failure reported separately, bad references rolled back, snapshot failure preserves current data');
})().catch(error=>{console.error(error);process.exitCode=1;});
