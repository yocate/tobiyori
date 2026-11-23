/* LIVE_REFRESH_START */
async function refreshLive(redraw=true,{background=false,fresh=false,quiet=false}={}){
 if(background&&(liveBackgroundBusy||Date.now()<accountRetryUntil))return;
 if(background)liveBackgroundBusy=true;
 const epoch=accountEpoch,uid=accountUser?.id,request=++liveRequest;
 try{
  const visit=uid&&!OPERATOR_APP&&!background?await recordDailyVisit(false):null;
  const fetchCatalog=fresh||!background||!LIVE.catalogFetchedAt||Date.now()-LIVE.catalogFetchedAt>=120000||LIVE.catalogUserId!==uid;
  const [catalog,dashboard]=await Promise.all([fetchCatalog?accountAPI('live/catalog'):LIVE.catalog,uid?accountAPI('live/dashboard'):null]);
  const catalogFetchedAt=fetchCatalog?Date.now():LIVE.catalogFetchedAt;
  const review=OPERATOR_APP&&dashboard?.role==='ADMIN'?await accountAPI('live/review'):null;
  const feedbackNew=OPERATOR_APP&&dashboard?.role==='ADMIN'?(await accountAPI('feedback/summary').catch(()=>null))?.newCount||0:0;
  if(request!==liveRequest||epoch!==accountEpoch||uid!==accountUser?.id)return;
  LIVE={catalog,dashboard,review,feedbackNew,loaded:true,error:'',errorStatus:0,fetchedAt:Date.now(),catalogFetchedAt,catalogUserId:uid};
  if(!quiet)showDailyVisitNotice(visit);
 }catch(e){if(request!==liveRequest||epoch!==accountEpoch||uid!==accountUser?.id)return;LIVE.loaded=true;LIVE.error=e.message||'募集を読み込めませんでした。';LIVE.errorStatus=e.status||0;if([401,403,409].includes(e.status))clearLivePrivate();}finally{if(background)liveBackgroundBusy=false;}
 if(!quiet)accountNotice();
 if(redraw)render();
}
/* LIVE_REFRESH_END */

/* LIVE_ROOM_START */
let liveRoomOpenRequest=0;
function liveRoomMessagesHTML(room){return room.messages.map(m=>`<div class="live-message ${m.sender_id===accountUser?.id?'mine':''}"><b>${escapeHtml(m.nickname)}${m.isStaff?'（担当者）':''}</b><p class="live-copy">${escapeHtml(m.body)}</p><small>${escapeHtml(liveDate(m.created_at))}</small></div>`).join('')||'<p>まだ投稿はありません。担当者への質問や、参加に必要な連絡を書けます。</p>';}
function liveRoomPermission(root,canSend,message=''){
 root.dataset.canSend=String(canSend);const form=root.querySelector('#liveRoomForm'),status=root.querySelector('[data-room-sync-status]');
 if(form)for(const el of form.elements)el.disabled=!canSend||form.dataset.sending==='true';
 if(status)status.textContent=message||(canSend?'最新の投稿を自動で確認しています。':'現在、新しい投稿は停止しています。過去の連絡は確認できます。');
}
async function refreshOpenLiveRoom(){
 const root=document.querySelector('#modalRoot .modal[data-live-room-id]');if(!root)return;
 const epoch=accountEpoch,uid=accountUser?.id,aid=root.dataset.liveRoomId,request=String(Number(root.dataset.syncRequest||0)+1);root.dataset.syncRequest=request;
 try{
  const room=await accountAPI('live/activity-messages/'+aid);
  if(!root.isConnected||epoch!==accountEpoch||uid!==accountUser?.id||root.dataset.syncRequest!==request)return;
  const list=root.querySelector('.live-message-list'),signature=JSON.stringify([room.messages,room.canSend]);
  if(list&&root.dataset.syncSignature!==signature){
   const previousHeight=list.offsetHeight,top=root.scrollTop,atBottom=root.scrollHeight-root.clientHeight-root.scrollTop<40,typing=root.querySelector('#liveRoomForm')?.contains(document.activeElement);
   list.innerHTML=liveRoomMessagesHTML(room);root.dataset.syncSignature=signature;
   if(typing)root.scrollTop=top+list.offsetHeight-previousHeight;else if(atBottom)root.scrollTop=root.scrollHeight;else root.scrollTop=top;
  }
  liveRoomPermission(root,room.canSend);
 }catch(e){
  if(!root.isConnected||epoch!==accountEpoch||root.dataset.syncRequest!==request)return;
  if([401,403,404].includes(e.status)){root.querySelector('.live-message-list')?.replaceChildren();delete root.dataset.syncSignature;liveRoomPermission(root,false,e.status===401?'ログインし直してください。':'この連絡板は現在閲覧できません。');}
  else{const status=root.querySelector('[data-room-sync-status]');if(status)status.textContent='通信が戻ると、自動で新しい投稿を確認します。入力中の文章は保持しています。';}
 }
}
async function openLiveRoom(aid,draft=''){
 const epoch=accountEpoch,request=++liveRoomOpenRequest,container=document.getElementById('modalRoot'),previous=container.firstElementChild;
 try{
  const room=await accountAPI('live/activity-messages/'+aid);if(epoch!==accountEpoch||request!==liveRoomOpenRequest||container.firstElementChild!==previous)return;
  openModal(`<div class="modal-head"><h3>活動の連絡板</h3><button class="modal-close" data-modal-close aria-label="閉じる">✕</button></div><p><b>${escapeHtml(room.title)}</b></p><p class="hint">団体の窓口と、この活動の承認済み参加者が読む連絡板です。個人宛てには送れません。本名・電話番号・個人SNSは書かないでください。</p><button class="btn btn-ghost btn-sm" id="liveRoomRefresh">最新の投稿を読む</button><p class="hint" data-room-sync-status role="status"></p><div class="live-message-list">${liveRoomMessagesHTML(room)}</div><form id="liveRoomForm">${liveField('body','活動の連絡内容',draft,'textarea',true)}<p class="live-form-error" role="alert"></p><button class="btn btn-primary">連絡板に投稿する</button></form>`,outer=>{
   const root=outer.querySelector('.modal'),form=root.querySelector('#liveRoomForm');root.dataset.liveRoomId=aid;root.dataset.syncSignature=JSON.stringify([room.messages,room.canSend]);liveRoomPermission(root,room.canSend);
   root.querySelector('#liveRoomRefresh').onclick=()=>refreshOpenLiveRoom();
   form.onsubmit=async e=>{
    e.preventDefault();if(root.dataset.canSend!=='true'||form.dataset.sending==='true')return;
    const sent=form.elements.body.value;form.dataset.sending='true';form.querySelector('.live-form-error').textContent='';liveRoomPermission(root,true);
    try{await accountAPI('live/activity-messages/'+aid,'POST',{body:sent});if(epoch!==accountEpoch||!root.isConnected)return;if(form.elements.body.value===sent)form.elements.body.value='';await refreshLive(false);await refreshOpenLiveRoom();}
    catch(error){if(root.isConnected)form.querySelector('.live-form-error').textContent=error.message;}
    finally{form.dataset.sending='false';if(root.isConnected)liveRoomPermission(root,root.dataset.canSend==='true');}
   };
  });
 }catch(e){if(request===liveRoomOpenRequest&&container.firstElementChild===previous)toast(e.message);}
}
/* LIVE_ROOM_END */

/* LIVE_SYNC_INSTALL_START */
function liveSyncIdentity(){return {account:String(accountEpoch)+':'+(accountUser?.id||''),route:current.view+'/'+(current.param||'')};}
function liveSyncSignature(){return JSON.stringify([LIVE.catalog,LIVE.dashboard,LIVE.review,LIVE.feedbackNew,LIVE.error]);}
function liveHandleAuthChange(){
 accountEpoch++;accountUser=null;clearLivePrivate();DB=defaultStore();pendingAccountState=null;accountRevision=0;accountError='';accountReady=false;closeModal();void startAccount();
}
function liveSafeRender(){
 const mapView=activeCircleMap?{center:activeCircleMap.getCenter(),zoom:activeCircleMap.getZoom()}:null;
 TobiyoriAutoSync.renderPreservingInput(()=>{accountNotice();render();},document,window);
 if(mapView&&activeCircleMap)activeCircleMap.setView(mapView.center,mapView.zoom,{animate:false});
}
function startLiveAutoSync(){
 if(!ACCOUNT_SERVER)return;
 const mark=e=>{if(e.target?.closest?.('#app')){const form=e.target.closest('form');if(form)form.dataset.autoSyncDirty='true';}};
 document.addEventListener('input',mark,true);document.addEventListener('change',mark,true);
 window.TobiyoriLiveSync=TobiyoriAutoSync.create({
  ready:()=>ACCOUNT_SERVER&&accountReady,
  context:liveSyncIdentity,signature:liveSyncSignature,
  retryUntil:()=>accountRetryUntil,
  capabilities:()=>accountAPI('health'),
  refresh:async()=>{await refreshLive(false,{background:true,fresh:true,quiet:true});if(LIVE.errorStatus===401||LIVE.errorStatus===409&&/ログイン状態/.test(LIVE.error)){liveHandleAuthChange();return;}if(LIVE.error){if(LIVE.errorStatus===403)closeModal();liveSafeRender();throw new Error('retry later');}},
  render:liveSafeRender,room:refreshOpenLiveRoom,authChanged:liveHandleAuthChange
 });
}
startLiveAutoSync();
/* LIVE_SYNC_INSTALL_END */
