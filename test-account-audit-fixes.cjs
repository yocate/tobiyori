const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {createApp}=require('./app.cjs');

const db=new DatabaseSync(':memory:');
let verifications=0;
const app=createApp({db,origins:['http://audit.local'],hosts:['audit.local'],community:{schedule:false},hasher:{
  async hash(password){return password;},
  async verify(password,stored){verifications++;return password===stored;},
}});
const correct='correct-password',token=crypto.randomBytes(32).toString('hex');
db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run('member','member@example.test','利用者',correct,Date.now());
db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),'member',Date.now()+3600000);

async function api(path,{method='POST',data,ip='profile-source',session=false}={}){
  const bytes=Buffer.from(JSON.stringify(data||{}));
  const req={method,url:'/api/'+path,headers:{host:'audit.local',origin:'http://audit.local','content-type':'application/json',...(session?{cookie:'tobiyori_session='+token,'x-tobiyori-account':'member'}:{})},socket:{remoteAddress:ip},async *[Symbol.asyncIterator](){yield bytes;}};
  let status,body;
  const res={headersSent:false,setHeader(){},writeHead(value){status=value;},end(value){body=JSON.parse(value);this.headersSent=true;}};
  await app.handle(req,res);
  return {status,body};
}
const login=(password,ip,email='member@example.test')=>api('login',{ip,data:{email,password}});
const save=profile=>api('state',{method:'PUT',session:true,data:{revision:0,state:{profile}}});

(async()=>{try{
  // 別の送信元での失敗は、本人の正しいログインを妨げない。
  for(let i=0;i<15;i++)assert.equal((await login('wrong-password','attacker')).status,401);
  const checked=verifications;
  assert.equal((await login(correct,'attacker')).status,429);
  assert.equal(verifications,checked,'制限済みの送信元では再検証しない');
  assert.equal((await login(correct,'legitimate')).status,200);

  // 成功後は同じメール・IPの失敗回数がリセットされる。
  for(let round=0;round<2;round++){
    for(let i=0;i<14;i++)assert.equal((await login('wrong-password','reset-source')).status,401);
    assert.equal((await login(correct,'reset-source')).status,200);
  }

  // 成功自体はメール別の失敗回数に含めないが、既存のIP上限は維持する。
  for(let i=0;i<60;i++)assert.equal((await login(correct,'ip-budget')).status,200);
  assert.equal((await login(correct,'ip-budget')).status,429);

  // 登録のメール単位制限は、送信元が変わっても従来どおり適用する。
  for(let i=0;i<15;i++)assert.equal((await api('register',{ip:'register-'+i,data:{email:'member@example.test',password:correct,nickname:'利用者',consent:true}})).status,409);
  assert.equal((await api('register',{ip:'register-new',data:{email:'member@example.test',password:correct,nickname:'利用者',consent:true}})).status,429);

  // IPv6の表記や端末部分を変えても/64内の失敗制限を共有する。
  for(let i=0;i<15;i++)assert.equal((await login('wrong-password',`2001:db8:12:34::${i+1}`)).status,401);
  assert.equal((await login(correct,'2001:0db8:0012:0034:ffff:0000:0000:1234')).status,429);
  assert.equal((await login(correct,'2001:db8:12:35::1')).status,200);
  for(let i=0;i<60;i++)assert.equal((await login(correct,`2001:db8:99:10::${i+1}`)).status,200);
  assert.equal((await login(correct,'2001:db8:99:10::ffff')).status,429,'IPv6のIP全体枠も共有');
  for(let i=0;i<15;i++)assert.equal((await login('wrong-password','::ffff:192.0.2.10')).status,401);
  assert.equal((await login(correct,'192.0.2.10')).status,429);

  // 後続処理で配列・文字列・booleanとして扱う項目を保存時に検証する。
  for(const profile of [null,[],true,'text',{areas:{}},{interests:'nature'},{days:[1]},{transport:[{}]},{areas:Array(51).fill('前橋市')},{days:Array(8).fill('月')},{interests:['x'.repeat(81)]},{excludedSkills:[false]},{year:{}},{school:123},{skills:[]},{nickname:[]},{receiveOffers:'true'},{receiveCompanyOffers:1},{receiveCareerOffers:null},{useSkillsMatching:'false'}]){
    const result=await save(profile);
    assert.equal(result.status,400,JSON.stringify({profile,result}));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n,0,'不正な状態を保存しない');
  const profile={nickname:'更新名',school:'地域の学校',year:'大学1年生',birthDate:'2000-01-01',areas:['前橋市'],interests:['nature'],days:['月'],transport:['徒歩'],skills:'自己PR',excludedSkills:[],receiveOffers:true,receiveCompanyOffers:false,receiveCareerOffers:true,useSkillsMatching:true,participation:{budget:0,from:'09:00',until:'17:00'},avatar:{color:'green'},futurePreference:{keep:true}};
  assert.equal((await save(profile)).status,200);
  const stored=await api('state',{method:'GET',session:true});
  assert.deepEqual(stored.body.state.profile,profile,'合法的な既存項目や未知の補足項目を消さない');
  assert.equal(db.prepare('SELECT nickname FROM accounts WHERE id=?').get('member').nickname,'更新名');

  // 期限を過ぎたIP・メール組の失敗制限は解除される。
  const realNow=Date.now,after=realNow()+15*60*1000+1;
  try{Date.now=()=>after;assert.equal((await login(correct,'attacker')).status,200);assert.equal((await login(correct,'ip-budget')).status,200);}
  finally{Date.now=realNow;}
  // 記録の上限に達しても、新規の正規利用者を一律に遮断しない。
  for(let i=0;i<10005;i++)assert.equal((await api('login',{ip:'cap-source-'+i,data:{}})).status,400);
  assert.equal((await login(correct,'fresh-after-cap')).status,200);

  console.log('PASS: account-scoped IP failure limits, success reset, expiry, retained IP/register limits, profile type/size checks and field preservation');
}finally{app.close();db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
