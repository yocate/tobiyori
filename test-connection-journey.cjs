const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('成果物/gunma-community-map.html','utf8');
for(const file of ['connection-journey-ui.js','connection-journey-ui.css'])assert(html.includes(fs.readFileSync('成果物/'+file,'utf8')),file+' must match the embedded source');
const recordsLine=s=>s.split('\n').find(l=>l.startsWith('function liveRecordsHTML()'));
assert.equal(recordsLine(html),recordsLine(fs.readFileSync('成果物/live-community-ui.js','utf8')));
let source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
source=source.replace(/\/\* ---------------- Boot ---------------- \*\/[\s\S]*?\}\)\(\);/,`globalThis.ui={connectionReturns,connectionContinueHTML,connectionJourneyHTML,setup(data,user=true){accountUser=user?{id:'student'}:null;LIVE=data;}};})();`);
function surface(pathname='/'){
  const context={location:{protocol:'http:',pathname,hash:'#/home'},window:{addEventListener(){}},document:{addEventListener(){},getElementById(){return null;}},console,setTimeout,clearTimeout,setInterval(){},URL,URLSearchParams};
  vm.createContext(context);vm.runInContext(source,context);return context.ui;
}
const ui=surface(),now=Date.now(),iso=offset=>new Date(now+offset).toISOString();
const next=(id,offset,extra={})=>({id,communityId:'one',title:id,status:'PUBLISHED',startsAt:iso(offset),endsAt:iso(offset+3600000),...extra});
const record=(id,offset,extra={})=>({id,activity_id:id,status:'DONE',owned:false,created_at:iso(offset),activity:{communityId:'one',title:id,endsAt:iso(offset)},...extra});
const data={loaded:true,error:'',catalog:{communities:[{id:'one',name:'いつもの団体'},{id:'two',name:'次回未定の団体'}],activities:[
  next('later',200000),next('first',100000),next('past',-1000),next('deadline',50000,{deadline:iso(-1000)}),next('pending',30000,{changePending:true}),next('closed',20000,{status:'CLOSED'}),next('job',10000,{companyKind:'recruitment'}),next('joined',15000),next('approved',16000),next('done',17000),next('invalid',18000,{deadline:'bad-date'})
]},dashboard:{follows:[],applications:[record('old',-900000),record('recent',-100000),record('owned',-50000,{owned:true}),record('cancelled',-20000,{status:'CANCELLED'}),record('applied',-20000,{status:'APPLIED'}),record('hidden',-10000,{activity:{communityId:'hidden',title:'hidden'}}),record('second',-110000,{activity:{communityId:'two',title:'別の活動',endsAt:iso(-110000)}}),record('joined',10000,{status:'APPLIED'}),record('approved',10000,{status:'APPROVED'}),record('done',-800000)]}};
ui.setup(data);const before=JSON.stringify(data),rows=ui.connectionReturns(now);
assert.equal(rows.length,2);assert.equal(rows[0].previous.id,'recent');assert.equal(rows[0].next.id,'first');assert.equal(rows[1].next,null);assert.equal(JSON.stringify(data),before,'derive without mutating shared state');
let rendered=ui.connectionContinueHTML();assert(rendered.includes('data-param="first"'));assert(rendered.includes('次の募集を待つあいだも'));assert(rendered.includes('data-live-follow="one"'));
data.dashboard.follows=['one'];ui.setup(data);rendered=ui.connectionContinueHTML();assert(rendered.includes('フォロー中'));assert(!rendered.includes('data-live-follow="one"'));
data.catalog.communities[0].name='<img src=x onerror=alert(1)>';data.catalog.activities.find(a=>a.id==='first').title='<script>bad()</script>';
rendered=ui.connectionContinueHTML();assert(!rendered.includes('<img src=x'));assert(!rendered.includes('<script>bad()'));assert(rendered.includes('&lt;script&gt;'));
ui.setup(data,false);assert.equal(ui.connectionReturns(now).length,0);assert.equal(ui.connectionContinueHTML(),'');
ui.setup({...data,error:'offline'});assert.equal(ui.connectionReturns(now).length,0);
ui.setup({...data,loaded:false});assert.equal(ui.connectionReturns(now).length,0);
ui.setup({...data,dashboard:null});assert.equal(ui.connectionReturns(now).length,0);
ui.setup({...data,dashboard:{applications:[record('pending',-1,{status:'APPROVED'})]}});assert.equal(ui.connectionReturns(now).length,0);
const operator=surface('/operator.html');operator.setup(data);assert.equal(operator.connectionReturns(now).length,0);
console.log('PASS: verified personal history, deduplication, next activity eligibility, follow state, guest/error/operator guards, escaping, immutable state and embedded source parity');
