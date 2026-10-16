/* Badges describe verified attendance records, not personality or ability. */
function participationBadges(rows,now=Date.now()){
 const genres=new Map(),communities=new Map(),seen=new Set(),badges=[];
 for(const r of rows){
  const end=Date.parse(r.endsAt);if(!r.activityId||seen.has(r.activityId)||!Number.isFinite(end)||end>now)continue;seen.add(r.activityId);
  const genre=String(r.genre||'').normalize('NFKC').trim();if(genre)genres.set(genre,(genres.get(genre)||0)+1);
  if(!r.communityId)continue;
  const date=new Date(end+9*3600000),month=date.getUTCFullYear()*12+date.getUTCMonth();
  if(!communities.has(r.communityId))communities.set(r.communityId,{id:r.communityId,name:r.communityName,months:new Set()});
  communities.get(r.communityId).months.add(month);
 }
 for(const [genre,count] of genres){for(const [threshold,title] of [[5,'マスター'],[10,'達人'],[20,'グランドマスター']])if(count>=threshold)badges.push({key:'genre:'+encodeURIComponent(genre)+':'+threshold,kind:'genre',title:genre+title,description:genre+'の活動に'+threshold+'回参加',threshold,group:genre,icon:'star'});}
 let longestMonths=0;
 for(const c of communities.values()){
  let last=null,streak=0,best=0;for(const m of [...c.months].sort((a,b)=>a-b)){streak=last!==null&&m===last+1?streak+1:1;best=Math.max(best,streak);last=m;}longestMonths=Math.max(longestMonths,best);
  for(const [threshold,title] of [[3,'3か月のつながり'],[6,'6か月の伴走者'],[12,'1年の旅仲間']])if(best>=threshold)badges.push({key:'continuity:'+c.id+':'+threshold,kind:'continuity',title,description:c.name+'に、毎月1回以上・'+threshold+'か月連続で参加',threshold,group:c.id,icon:'leaf'});
 }
 for(const [threshold,title] of [[3,'好奇心のたね'],[5,'よりみちコレクター'],[8,'世界をめぐる探検家']])if(genres.size>=threshold)badges.push({key:'variety:'+threshold,kind:'variety',title,description:threshold+'ジャンルの活動に参加',threshold,group:'variety',icon:'spark'});
 return {badges,summary:{attendances:seen.size,genreCount:genres.size,longestMonths,genres:[...genres].map(([genre,count])=>({genre,count})).sort((a,b)=>b.count-a.count||a.genre.localeCompare(b.genre,'ja'))}};
}
module.exports={participationBadges};
