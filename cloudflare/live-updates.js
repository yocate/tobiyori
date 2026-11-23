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
export function liveSocketAtCapacity(ctx,userId,ipTag){
 return ctx.getWebSockets().length>=1024||(!userId&&ipTag&&ctx.getWebSockets(ipTag).length>=32)||
  (userId?ctx.getWebSockets('account:'+userId).length>=16:ctx.getWebSockets('public').length>=256);
}
export async function liveSocketIpTag(request){
 let address=request.headers.get('CF-Connecting-IP');if(!address)return null;
 if(address.includes(':'))try{address=new URL('http://['+address+']/').hostname.slice(1,-1);}catch{return null;}
 // Cross-zone Worker requests share this Cloudflare address, not a visitor IP.
 if(address==='2a06:98c0:3600::103')return null;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(address));
 return 'ip:'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function openLiveSocket(request,env,ctx,db,app){
 if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json(426,'WebSocket接続が必要です。');
 if(request.headers.get('Origin')!==new URL(env.APP_ORIGIN).origin)return json(403,'アプリを開き直してください。');
 const ipTag=await liveSocketIpTag(request);
 const user=app.userFor({headers:{cookie:request.headers.get('Cookie')||''}});
 if(liveSocketAtCapacity(ctx,user?.id,ipTag))return json(503,'接続が混み合っています。');
 const pair=new WebSocketPair(),client=pair[0],server=pair[1];
 ctx.acceptWebSocket(server,[user?'account:'+user.id:'public',...(!user&&ipTag?[ipTag]:[])]);
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
