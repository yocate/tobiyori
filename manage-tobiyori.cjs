const path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const [command,email]=process.argv.slice(2);
if(command!=='admin'||!email){console.error('使い方: node manage-tobiyori.cjs admin 登録済みメールアドレス');process.exit(1);}
const db=new DatabaseSync(path.join(__dirname,'.tobiyori-data','accounts.sqlite'));
try{db.exec('CREATE TABLE IF NOT EXISTS account_roles(user_id TEXT PRIMARY KEY REFERENCES accounts(id),role TEXT NOT NULL)');
 const u=db.prepare('SELECT id FROM accounts WHERE email=?').get(email.trim().toLowerCase());
 if(!u)throw Error('そのメールアドレスは未登録です。先にアプリで新規登録してください。');
 db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN') ON CONFLICT(user_id) DO UPDATE SET role='ADMIN'").run(u.id);
 console.log('運営管理者を設定しました。アプリのページを再読み込みしてください。');
}catch(e){console.error(e.message);process.exitCode=1;}finally{db.close();}
