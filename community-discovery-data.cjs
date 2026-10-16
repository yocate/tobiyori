const fail=message=>Object.assign(new Error(message),{status:400});
const {COMPANY_KINDS}=require('./成果物/company-catalog.js');
function values(v,allowed,label){if(v==null)return [];if(!Array.isArray(v)||v.length>30||v.some(x=>typeof x!=='string'||x.length>50||(allowed&&!allowed.includes(x))))throw fail(label+'を確認してください。');return [...new Set(v)];}
function value(v,max=500){if(v==null)return '';if(typeof v!=='string'||v.length>max)throw fail('追加情報の形式・文字数を確認してください。');return v.trim();}
function choice(v,values,fallback){if(v==null||v==='')return fallback;if(!values.includes(v))throw fail('選択項目を確認してください。');return v;}
function url(v){const s=value(v,1000);if(!s)return '';try{const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw 0;return u.href;}catch{throw fail('公式情報のURLを確認してください。');}}
function sectorFor(c){return c.sector||(/企業|店舗/.test(c.type||'')?'company':/学生|大学|ゼミ/.test(c.type||'')?'campus':'regional');}
function communityExtras(input){
 let publicPoint=null;
 if(input.publicLat!==undefined&&input.publicLat!==''||input.publicLng!==undefined&&input.publicLng!==''){
  const lat=Number(input.publicLat),lng=Number(input.publicLng);
  if(input.publicLat===''||input.publicLng===''||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<35.9||lat>37.2||lng<138.3||lng>139.8)throw fail('群馬県内の大まかな公開位置を入力してください。');
  publicPoint=[Math.round(lat*100)/100,Math.round(lng*100)/100];
 }
 const recognition=choice(input.recognition,['unconfirmed','recognized','independent','intercollegiate'],'unconfirmed');
 const recognitionSource=url(input.recognitionSource);
 if(recognition==='recognized'&&!recognitionSource)throw fail('大学公認の根拠となる公式ページを入力してください。');
 const partnerUniversities=value(input.partnerUniversities,1000).split(/[、,\n]/).map(v=>v.trim()).filter(Boolean);
 if(partnerUniversities.length>10)throw fail('関連大学は10校以内にしてください。');
 if(input.officialUpdatesEnabled!==undefined&&typeof input.officialUpdatesEnabled!=='boolean')throw fail('自動取得の設定を確認してください。');
 const feedURL=url(input.feedURL),officialUpdatesEnabled=input.officialUpdatesEnabled===true;
 if(officialUpdatesEnabled){const source=feedURL||input.links?.website;if(!source)throw fail('自動取得する公式ホームページ、または更新用URLを入力してください。');require('./official-source-fetch.cjs').publicURL(source);}
 return {localContribution:value(input.localContribution,1500),campusFeeAmount:require('./participation-conditions.cjs').conditionFields({feeAmount:input.campusFeeAmount}).feeAmount,campusParking:choice(input.campusParking,['unknown','yes','no'],'unknown'),sector:choice(input.sector,['regional','campus','company'],sectorFor(input)),activityDays:values(input.activityDays,['月','火','水','木','金','土','日'],'活動曜日'),campusYears:values(input.campusYears,null,'対象学年'),campusAllYears:input.campusAllYears===true,beginnerWelcome:input.beginnerWelcome===true,campusFrequency:choice(input.campusFrequency,['single','continuous'],''),campusHighSchoolAccess:choice(input.campusHighSchoolAccess,['unknown','no','visit','allowed'],'unknown'),campusName:value(input.campusName),partnerUniversities:[...new Set(partnerUniversities)],recognition,recognitionSource,fees:value(input.fees),highSchoolVisits:value(input.highSchoolVisits,1500),sourceURL:url(input.sourceURL),publicArea:value(input.publicArea),publicPoint,feedURL,officialUpdatesEnabled};
}
function activityExtras(input){
 const activityKind=choice(input.activityKind,['activity','event','volunteer','experience','exchange'],'activity');
 const participationScope=choice(input.participationScope,['unknown','open','members'],'unknown');
 const years=input.targetYears||[];if(!Array.isArray(years)||years.length>10||years.some(y=>typeof y!=='string'||y.length>50))throw fail('対象学年を確認してください。');
 const deadline=value(input.deadline,60);if(deadline&&!Number.isFinite(Date.parse(deadline)))throw fail('申込期限を確認してください。');
 return {activityKind,participationScope,companyKind:choice(input.companyKind,Object.keys(COMPANY_KINDS),'regional'),companyRole:value(input.companyRole),employmentType:value(input.employmentType),workplace:value(input.workplace),workSchedule:value(input.workSchedule),selectionProcess:value(input.selectionProcess,1500),applicationURL:url(input.applicationURL),fees:value(input.fees),remuneration:value(input.remuneration),frequency:choice(input.frequency,['single','continuous'],'single'),highSchoolParticipation:choice(input.highSchoolParticipation,['unknown','no','visit','allowed'],'unknown'),targetYears:[...new Set(years)],deadline:deadline?new Date(deadline).toISOString():'',parking:choice(input.parking,['unknown','yes','no'],'unknown'),transportFee:value(input.transportFee)};
}
module.exports={communityExtras,activityExtras,sectorFor};
