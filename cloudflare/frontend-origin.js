// Extra frontends are an explicit allowlist for shared-data mode only.
// The Durable Object and authoritative data source retain their configured identities.
export function frontendOrigin(url,env){
 const primary=new URL(env.APP_ORIGIN),extra=String(env.SHARED_FRONTEND_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(extra.length>10||extra.length&&!env.SHARED_DATA_ORIGIN)throw new Error('追加の公開先の設定を確認してください。');
 const origins=[primary];
 for(const raw of extra){
  const item=new URL(raw);
  if(item.protocol!=='https:'||item.username||item.password||item.pathname!=='/'||item.search||item.hash||item.origin===new URL(env.SHARED_DATA_ORIGIN).origin)throw new Error('追加の公開先の設定を確認してください。');
  origins.push(item);
 }
 return origins.find(item=>item.host===url.host)?.origin||null;
}
