// Notify only affected accounts. Private messages/data remain behind the ordinary authenticated APIs.
const json=(status,error)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const notificationCursor=db=>db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM live_notifications').get().n;
export function publicMutation(path){
 return /^\/api\/live\/(review\/[^/]+\/(approve|suspend)|communities(?:\/[^/]+(?:\/(?:pause|confirm))?)?|activities(?:\/[^/]+(?:\/(?:submit|close|cancel|propose-change))?)?|applications\/[^/]+\/(approve|cancel|complete))$/.test(path);
}
export function validLiveSocket(db,socket){
 const info=socket.deserializeAttachment();if(!info)return false;
 if(!info.userId)return true;
 return !!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?').get(info.tokenHash,info.userId,Date.now());
}
export function broadcastLiveUpdates(ctx,db,{actorId,cursor,publicChanged=false}){
 const recipients=new Set(db.prepare('SELECT DISTINCT user_id FROM live_notifications WHERE rowid>?').all(cursor).map(n=>n.user_id));
 if(actorId)recipients.add(actorId);
 for(const socket of ctx.getWebSockets()){
  try{
   if(!validLiveSocket(db,socket)){socket.send('{"type":"auth-changed"}');socket.close(4001,'ログインし直してください');continue;}
   const info=socket.deserializeAttachment();
   if(publicChanged||info.userId&&recipients.has(info.userId))socket.send('{"type":"invalidate"}');
  }catch{try{socket.close(1011,'接続を確認してください');}catch{}}
 }
}
export function openLiveSocket(request,env,ctx,db,app){
 if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json(426,'WebSocket接続が必要です。');
 if(request.headers.get('Origin')!==new URL(env.APP_ORIGIN).origin)return json(403,'アプリを開き直してください。');
 if(ctx.getWebSockets().length>=1024)return json(503,'接続が混み合っています。');
 const user=app.userFor({headers:{cookie:request.headers.get('Cookie')||''}}),pair=new WebSocketPair(),client=pair[0],server=pair[1];
 ctx.acceptWebSocket(server,[user?'account:'+user.id:'public']);
 server.serializeAttachment({userId:user?.id||null,tokenHash:user?.token_hash||null,lastPing:0});
 server.send('{"type":"connected"}');
 return new Response(null,{status:101,webSocket:client});
}
export function liveSocketMessage(socket,message,db){
 if(!validLiveSocket(db,socket)){socket.send('{"type":"auth-changed"}');socket.close(4001,'ログインし直してください');return;}
 const info=socket.deserializeAttachment(),now=Date.now();
 if(message!=='ping'||now-info.lastPing<1000){socket.close(1008,'接続を開き直してください');return;}
 socket.serializeAttachment({...info,lastPing:now});socket.send('{"type":"pong"}');
}
