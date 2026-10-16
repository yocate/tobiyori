const assert=require('node:assert/strict'),{participationBadges}=require('./participation-badges.cjs');
const row=(id,month,genre='音楽')=>({activityId:id,endsAt:month+'-15T03:00:00Z',genre,communityId:'one',communityName:'地域の会'});
let r=participationBadges([row('1','2024-12'),row('2','2025-01'),row('3','2025-02'),row('4','2025-02'),row('5','2025-02'),row('5','2025-02')]);
assert.equal(r.summary.attendances,5);assert.equal(r.summary.longestMonths,3);assert.equal(r.badges.filter(b=>b.kind==='genre').length,1);assert(r.badges.some(b=>b.kind==='continuity'&&b.threshold===3));
r=participationBadges([row('1','2025-01'),row('2','2025-03'),row('3','2025-05')]);assert.equal(r.summary.longestMonths,1);assert(!r.badges.some(b=>b.kind==='continuity'));
r=participationBadges([row('1','2025-01','写真'),row('2','2025-01','音楽'),row('3','2025-01','料理'),row('4','2099-01','未参加')]);assert.equal(r.summary.genreCount,3);assert(r.badges.some(b=>b.kind==='variety'&&b.threshold===3));
r=participationBadges([row('1','2025-01'),{...row('2','2025-02'),communityId:'two'},row('3','2025-03')]);assert.equal(r.summary.longestMonths,1);
console.log('PASS: genre milestones, repeated event deduplication, distinct fields, completed dates, consecutive months including year boundary, missing months and separate communities.');
