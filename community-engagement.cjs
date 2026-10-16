'use strict';

const WEIGHTS=Object.freeze({participation:30,review:10,save:5,view:1});
const DAY=86400000;
function createCommunityEngagement({db,clock=Date.now}){
  db.exec(`CREATE TABLE IF NOT EXISTS live_community_saves(
    community_id TEXT NOT NULL REFERENCES live_communities(id),
    user_id TEXT NOT NULL REFERENCES accounts(id),created_at TEXT NOT NULL,
    PRIMARY KEY(community_id,user_id));
    CREATE INDEX IF NOT EXISTS live_community_saves_user ON live_community_saves(user_id);
    CREATE TABLE IF NOT EXISTS live_community_views(
    community_id TEXT NOT NULL REFERENCES live_communities(id),
    user_id TEXT NOT NULL REFERENCES accounts(id),day TEXT NOT NULL,
    PRIMARY KEY(community_id,user_id,day));
    CREATE INDEX IF NOT EXISTS live_community_views_day ON live_community_views(day);`);
  const one=(sql,...args)=>db.prepare(sql).get(...args);
  const run=(sql,...args)=>db.prepare(sql).run(...args);
  const dayAt=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
  const window=()=>({from:dayAt(clock()-29*DAY),to:dayAt(clock())});
  // Count account/day pairs, not requests. Management activity does not boost popularity.
  const eligible=`s.user_id<>c.owner_id AND NOT EXISTS (SELECT 1 FROM account_roles r WHERE r.user_id=s.user_id AND r.role='ADMIN')`;
  function buzz(cid){
    const {from,to}=window();
    const participants=one("SELECT COUNT(*) AS n FROM live_applications p JOIN live_activities a ON a.id=p.activity_id WHERE a.community_id=? AND p.status='DONE'",cid).n;
    const reviews=one("SELECT COUNT(*) AS n FROM live_reviews r JOIN live_activities a ON a.id=r.activity_id JOIN live_applications p ON p.activity_id=r.activity_id AND p.user_id=r.user_id WHERE a.community_id=? AND p.status='DONE'",cid).n;
    const saves=one(`SELECT COUNT(*) AS n FROM live_community_saves s JOIN live_communities c ON c.id=s.community_id WHERE c.id=? AND ${eligible}`,cid).n;
    const views=one(`SELECT COUNT(*) AS n FROM live_community_views s JOIN live_communities c ON c.id=s.community_id WHERE c.id=? AND s.day>=? AND s.day<=? AND ${eligible}`,cid,from,to).n;
    return {participants,reviews,saves,views,points:participants*WEIGHTS.participation+reviews*WEIGHTS.review+saves*WEIGHTS.save+views*WEIGHTS.view};
  }
  function setSaved(cid,uid,saved){
    if(saved)run('INSERT OR IGNORE INTO live_community_saves VALUES(?,?,?)',cid,uid,new Date(clock()).toISOString());
    else run('DELETE FROM live_community_saves WHERE community_id=? AND user_id=?',cid,uid);
  }
  function recordView(cid,uid){
    const c=one('SELECT owner_id FROM live_communities WHERE id=?',cid);
    if(c.owner_id===uid||one("SELECT 1 FROM account_roles WHERE user_id=? AND role='ADMIN'",uid))return false;
    return !!run('INSERT OR IGNORE INTO live_community_views VALUES(?,?,?)',cid,uid,dayAt(clock())).changes;
  }
  function purgeExpired(){run('DELETE FROM live_community_views WHERE day<?',window().from);}
  return {buzz,setSaved,recordView,purgeExpired};
}
module.exports={createCommunityEngagement,WEIGHTS};
