// Run fn atomically on node:sqlite or the Durable Object adapter (which forbids BEGIN/SAVEPOINT SQL).
function transaction(db,fn,savepoint){
 if(typeof db.transactionSync==='function')return db.transactionSync(fn);
 db.exec(savepoint?'SAVEPOINT '+savepoint:'BEGIN IMMEDIATE');
 try{const result=fn();db.exec(savepoint?'RELEASE '+savepoint:'COMMIT');return result;}
 catch(e){db.exec(savepoint?'ROLLBACK TO '+savepoint+'; RELEASE '+savepoint:'ROLLBACK');throw e;}
}
module.exports={transaction};
