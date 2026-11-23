/* Live updates carry no message bodies or account IDs. Normal authenticated APIs supply the data. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TobiyoriAutoSync=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function create(adapter,env){
  env=env||window;let timer,reconnect,heartbeat,socket,stopped=false,busy=false,again=false,pendingRender=false,connected=false,account='',failures=0,lastCapabilities=0,capable=false;
  const now=()=>env.Date?env.Date.now():Date.now(),visible=()=>env.document.visibilityState!=='hidden';
  const channel=typeof env.BroadcastChannel==='function'?new env.BroadcastChannel('tobiyori-live-updates'):null;
  const context=()=>JSON.stringify(adapter.context());
  function later(ms){env.clearTimeout(timer);if(!stopped)timer=env.setTimeout(run,Math.max(ms,adapter.retryUntil()-now(),0));}
  function kick(){if(busy){again=true;return;}later(0);}
  function closeSocket(){connected=false;env.clearTimeout(reconnect);env.clearInterval(heartbeat);const old=socket;socket=null;if(old){old.onclose=null;old.onerror=null;try{old.close();}catch{}}}
  async function connect(){
   if(stopped||!adapter.ready()||!visible())return;
   const before=context();
   if(now()-lastCapabilities>60000||!lastCapabilities){lastCapabilities=now();try{capable=!!(await adapter.capabilities()).liveUpdates;}catch{capable=false;lastCapabilities=0;}}
   if(stopped||!adapter.ready()||!visible()||before!==context())return;
   if(!capable||socket||typeof env.WebSocket!=='function')return;
   const url=new URL('/api/live/updates',env.location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
   const ws=new env.WebSocket(url.href);socket=ws;
   ws.onopen=()=>{if(socket!==ws)return;connected=true;failures=0;kick();heartbeat=env.setInterval(()=>{if(socket===ws&&ws.readyState===1)ws.send('ping');},25000);};
   ws.onmessage=e=>{if(socket!==ws)return;try{const value=JSON.parse(e.data);if(value.type==='auth-changed'){closeSocket();adapter.authChanged();lastCapabilities=0;kick();}else if(value.type==='invalidate'||value.type==='connected')kick();}catch{}};
   ws.onerror=()=>{};
   ws.onclose=e=>{if(socket!==ws)return;socket=null;connected=false;env.clearInterval(heartbeat);if(e.code===4001)adapter.authChanged();failures++;reconnect=env.setTimeout(connect,Math.min(30000,1000*2**Math.min(failures,5)));kick();};
  }
  async function run(){
   if(stopped)return;if(busy){again=true;return;}
   if(!visible()||!adapter.ready()){later(2000);return;}
   if(now()<adapter.retryUntil()){later(adapter.retryUntil()-now());return;}
   busy=true;const before=context(),signature=adapter.signature();again=false;
   try{
    const currentAccount=adapter.context().account;if(account!==currentAccount){account=currentAccount;closeSocket();lastCapabilities=0;}
    await connect();if(stopped)return;await adapter.refresh();if(stopped)return;
    if(signature!==adapter.signature())pendingRender=true;
    if(before!==context()){again=true;return;}
    if(pendingRender){adapter.render();pendingRender=false;}
    await adapter.room();failures=0;
   }catch{failures++;}
   finally{busy=false;later(again?0:failures?Math.min(30000,2000*2**Math.min(failures,4)):connected?30000:2000);}
  }
  function changed(auth=false){if(auth){closeSocket();lastCapabilities=0;}channel?.postMessage({type:'changed',auth:!!auth});kick();}
  if(channel)channel.onmessage=e=>{if(e.data?.type!=='changed')return;if(e.data.auth){closeSocket();adapter.authChanged();lastCapabilities=0;}kick();};
  const resume=()=>{if(visible()){lastCapabilities=0;kick();}};
  env.document.addEventListener('visibilitychange',resume);env.addEventListener('focus',resume);env.addEventListener('online',resume);env.addEventListener('hashchange',kick);
  later(0);
  return {changed,kick,stop(){stopped=true;env.clearTimeout(timer);closeSocket();channel?.close();env.document.removeEventListener('visibilitychange',resume);env.removeEventListener('focus',resume);env.removeEventListener('online',resume);env.removeEventListener('hashchange',kick);}};
 }

 // Keep the actual edited nodes, including FileLists and existing event handlers, across a redraw.
 function renderPreservingInput(render,doc,win){
  const app=doc.getElementById('app');if(!app)return render();
  const active=doc.activeElement,selection=active&&'selectionStart'in active?{start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}:null;
  const key=form=>form.id||Array.from(form.attributes).filter(a=>a.name.startsWith('data-')&&a.name!=='data-auto-sync-dirty').map(a=>a.name+'='+a.value).sort().join('|');
  const forms=Array.from(app.querySelectorAll('form')).map(form=>({form,key:key(form)})).filter(v=>v.key&&(v.form.dataset.autoSyncDirty==='true'||v.form.contains(active)||Array.from(v.form.querySelectorAll('input[type=file]')).some(f=>f.files?.length)));
  // Async sections first render a loading placeholder. Keep their live nodes until
  // their own refresh can reconcile the forms against the authenticated response.
  const sectionKey=node=>node.hasAttribute('data-community-questions')?'questions:'+node.dataset.communityQuestions:'inbox';
  const sections=Array.from(app.querySelectorAll('[data-community-questions],[data-community-question-inbox]')).filter(node=>forms.some(v=>node.contains(v.form))).map(node=>({node,key:sectionKey(node)}));
  const loose=active&&app.contains(active)&&!active.closest('form')&&active.id?active:null;
  const details=Array.from(app.querySelectorAll('details')).map((node,index)=>({index,label:node.querySelector('summary')?.textContent,open:node.open}));
  const sx=win.scrollX,sy=win.scrollY;render();
  const refresh=[];
  for(const old of sections){const target=Array.from(app.querySelectorAll('[data-community-questions],[data-community-question-inbox]')).find(node=>sectionKey(node)===old.key);if(target&&target!==old.node){target.replaceWith(old.node);refresh.push(old.node);}}
  const targets=Array.from(app.querySelectorAll('form')).map(form=>({form,key:key(form)}));
  for(const old of forms){const target=targets.find(v=>v.key===old.key);if(target)target.form.replaceWith(old.form);}
  if(loose){const replacement=doc.getElementById(loose.id);if(replacement&&app.contains(replacement))replacement.replaceWith(loose);}
  if(active&&app.contains(active)&&active.isConnected){try{active.focus({preventScroll:true});if(selection&&typeof active.setSelectionRange==='function')active.setSelectionRange(selection.start,selection.end,selection.direction);}catch{}}
  const current=Array.from(app.querySelectorAll('details'));for(const old of details)if(current[old.index]?.querySelector('summary')?.textContent===old.label)current[old.index].open=old.open;
  win.scrollTo(sx,sy);
  for(const node of refresh)node.dispatchEvent(new win.Event('tobiyori:auto-sync'));
 }
 return {create,renderPreservingInput};
});
