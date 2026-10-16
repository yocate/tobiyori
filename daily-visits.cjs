// Award one point per authenticated account and Japan calendar date.
// Never trust the browser's date, user ID or point amount.
function createDailyVisits({db,clock=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS live_daily_visits(
 user_id TEXT NOT NULL REFERENCES accounts(id),visit_date TEXT NOT NULL,
 points INTEGER NOT NULL DEFAULT 1 CHECK(points=1),earned_at TEXT NOT NULL,
 PRIMARY KEY(user_id,visit_date));`);
 const dayAt=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
 function snapshot(userId,ms=clock()){
  const day=dayAt(ms),row=db.prepare('SELECT points FROM live_daily_visits WHERE user_id=? AND visit_date=?').get(userId,day);
  const total=db.prepare('SELECT COALESCE(SUM(points),0) AS points FROM live_daily_visits WHERE user_id=?').get(userId).points;
  const next=Date.parse(day+'T00:00:00+09:00')+86400000;
  return {day,claimedToday:!!row,todayPoints:row?.points||0,totalPoints:total,pointsPerDay:1,nextCheckInMs:next-ms};
 }
 function claim(userId){
  const ms=clock(),day=dayAt(ms);
  const inserted=db.prepare('INSERT OR IGNORE INTO live_daily_visits(user_id,visit_date,points,earned_at) VALUES(?,?,1,?)').run(userId,day,new Date(ms).toISOString());
  return {...snapshot(userId,ms),awarded:inserted.changes===1};
 }
 return {claim,snapshot};
}
module.exports={createDailyVisits};
