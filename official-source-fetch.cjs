// Fetch public, registered sources only. Pin the validated DNS result to the socket.
// On Cloudflare Workers, outbound fetch cannot reach private networks; fetchPublicPageWeb keeps the
// URL, redirect, size and time checks. Node modules load lazily so the Worker bundle does not use them.
const isIP=host=>/^\d{1,3}(\.\d{1,3}){3}$/.test(host)&&host.split('.').every(n=>Number(n)<=255)?4:host.includes(':')?6:0;
const net={isIP};
const sourceError=message=>Object.assign(new Error(message),{status:400});
function isPublicIPv4(address){
 if(net.isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
function publicURL(value,base){
 let u;try{u=new URL(value,base);}catch{throw sourceError('情報元のURLを確認してください。');}
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||u.href.length>2000)throw sourceError('標準の http / https の公開ページを指定してください。');
 const host=u.hostname.toLowerCase();
 if(!host.includes('.')||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||(net.isIP(host)&&!isPublicIPv4(host))||host.includes(':'))throw sourceError('公開されている公式サイトを指定してください。');
 if(host==='instagram.com'||host.endsWith('.instagram.com'))throw sourceError('Instagramの自動取得には公式連携が必要です。Instagram欄に公式リンクを登録してください。');
 u.hash='';return u;
}
function safeLookup(host,options,callback){require('node:dns').lookup(host,{family:4,all:true},(error,addresses)=>{
 if(error)return callback(sourceError('情報元のサイトに接続できませんでした。'));
 if(!addresses.length||addresses.some(a=>!isPublicIPv4(a.address)))return callback(sourceError('公開されている公式サイトにのみ接続できます。'));
 const selected=addresses[0];options.all?callback(null,[selected]):callback(null,selected.address,4);
});}
async function fetchPublicPage(value,{signal,redirects=0}={}){
 const u=publicURL(value);if(redirects>3)throw sourceError('転送先が多すぎるため取得できませんでした。');
 return new Promise((resolve,reject)=>{
  let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(deadline);error?reject(error):resolve(result);};
  const request=require(u.protocol==='https:'?'node:https':'node:http').request(u,{method:'GET',agent:false,family:4,lookup:safeLookup,signal,headers:{'User-Agent':'Tobiyori-OfficialUpdates/1.0','Accept':'application/rss+xml, application/atom+xml, text/html, application/xml, text/xml','Accept-Encoding':'identity'}},response=>{
   if([301,302,303,307,308].includes(response.statusCode)&&response.headers.location){response.destroy();let next;try{next=publicURL(response.headers.location,u).href;}catch(e){finish(e);request.destroy();return;}finish(null,{redirect:next});return;}
   if(response.statusCode!==200){response.destroy();finish(sourceError('情報元が取得を受け付けませんでした。公式ページでご確認ください。'));return;}
   const contentType=String(response.headers['content-type']||'');
   if(!/(text\/(html|xml)|application\/(rss\+xml|atom\+xml|xml|xhtml\+xml))/i.test(contentType)){response.destroy();finish(sourceError('この情報元の形式は自動取得に対応していません。'));return;}
   if(response.headers['content-encoding']&&!/^identity$/i.test(response.headers['content-encoding'])){response.destroy();finish(sourceError('この情報元の配信形式には対応していません。'));return;}
   let bytes=0;const chunks=[];
   response.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024*1024){finish(sourceError('情報元のページが大きすぎるため取得できませんでした。'));request.destroy();}else chunks.push(chunk);});
   response.on('error',()=>finish(sourceError('情報元の読み込みが中断されました。')));
   response.on('end',()=>{try{const buffer=Buffer.concat(chunks),charset=/charset=["']?([\w-]+)/i.exec(contentType)?.[1]||/encoding=["']([\w-]+)/i.exec(buffer.subarray(0,200).toString())?.[1]||'utf-8';finish(null,{url:u.href,contentType,body:new TextDecoder(charset).decode(buffer)});}catch{finish(sourceError('情報元の文字を読み取れませんでした。'));}});
  });
  const deadline=setTimeout(()=>{finish(sourceError('情報元への接続に時間がかかっています。あとでお試しください。'));request.destroy();},10000);
  request.on('error',()=>finish(sourceError('情報元に接続できませんでした。公式ページでご確認ください。')));request.end();
 }).then(result=>result.redirect?fetchPublicPage(result.redirect,{signal,redirects:redirects+1}):result);
}
function decodeEntities(s){return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(match,key)=>{if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[key.toLowerCase()];});}
// タグは一度だけ前へ走査する。閉じタグがない入力でも末尾の再走査を繰り返さない。
function* tags(source){
 const namePattern=/<\/?([A-Za-z][\w:.-]*)/y;let cursor=0;
 while(cursor<source.length){
  const start=source.indexOf('<',cursor);if(start<0)return;
  const special=source.startsWith('<!--',start)?['-->',4]:source.startsWith('<![CDATA[',start)?[']]>',9]:null;
  if(special){const close=source.indexOf(special[0],start+special[1]);if(close<0)return;cursor=close+special[0].length;yield {name:'',start,end:cursor};continue;}
  namePattern.lastIndex=start;const match=namePattern.exec(source);
  if(!match&&!source.startsWith('<!',start)&&!source.startsWith('<?',start)){cursor=start+1;continue;}
  let end=match?namePattern.lastIndex:start+2,quote='';
  for(;end<source.length;end++){const char=source[end];if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='>')break;}
  if(end===source.length)return;
  cursor=end+1;const tag={name:match?match[1].toLowerCase():'',closing:source[start+1]==='/',selfClosing:source[end-1]==='/',start,end:cursor,raw:source.slice(start,cursor)};
  yield tag;
  // raw text内の比較演算子・引用符・偽タグは解釈せず、対応する閉じタグへ進む。
  if(!tag.closing&&!tag.selfClosing&&(tag.name==='script'||tag.name==='style')){
   const closing=new RegExp('</'+tag.name+'(?=[\\s/>])','gi');closing.lastIndex=cursor;
   const close=closing.exec(source);if(!close)return;cursor=close.index;
  }
 }
}
function* blocks(source,names,limit=1){
 let open=null,count=0;
 for(const tag of tags(source)){
  if(!open){if(!tag.closing&&!tag.selfClosing&&names.includes(tag.name))open=tag;}
  else if(tag.closing&&tag.name===open.name){yield {name:open.name,body:source.slice(open.end,tag.start)};open=null;if(++count>=limit)return;}
 }
}
function plain(s='',max=160){
 const expanded=[];let offset=0;
 for(;;){const start=s.indexOf('<![CDATA[',offset);if(start<0){expanded.push(s.slice(offset));break;}expanded.push(s.slice(offset,start));const end=s.indexOf(']]>',start+9);if(end<0){expanded.push(s.slice(start+9));break;}expanded.push(s.slice(start+9,end));offset=end+3;}
 const source=expanded.join(''),chunks=[];let cursor=0,blocked='';
 for(const tag of tags(source)){
  if(!blocked){chunks.push(source.slice(cursor,tag.start),' ');if(!tag.closing&&['script','style'].includes(tag.name))blocked=tag.name;}
  else if(tag.closing&&tag.name===blocked)blocked='';
  cursor=tag.end;
 }
 if(!blocked)chunks.push(source.slice(cursor));
 return decodeEntities(chunks.join('')).replace(/\s+/g,' ').trim().slice(0,max);
}
function attr(tag,key){const match=tag.match(new RegExp('(?:^|\\s)'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));return match?decodeEntities(match[1]??match[2]??match[3]):'';}
function inner(xml,name){return blocks(xml,[name.toLowerCase()]).next().value?.body||'';}
function linkURL(v,base){if(!v)return '';try{return publicURL(v,base).href;}catch{return '';}}
function parsePage(page){
 const {body,url}=page;if(/<!DOCTYPE|<!ENTITY/i.test(body)&&!/<html\b/i.test(body))throw sourceError('このフィードの形式には対応していません。');
 if(/<(rss|feed|rdf:RDF)\b/i.test(body)){
  const entries=[...blocks(body,['item','entry'],100)].map(({name:kind,body:x},i)=>{
   const link=kind.toLowerCase()==='entry'?[...tags(x)].filter(t=>t.name==='link'&&!t.closing).map(t=>t.raw).find(t=>!attr(t,'rel')||attr(t,'rel')==='alternate'):null;
   const href=linkURL(link?attr(link,'href'):plain(inner(x,'link'),2000),url);
   const published=plain(inner(x,'pubDate')||inner(x,'published')||inner(x,'updated')||inner(x,'dc:date'),80),time=Date.parse(published);
   return {title:plain(inner(x,'title'),100),text:plain(inner(x,'description')||inner(x,'summary'),140),url:href,publishedAt:Number.isFinite(time)?new Date(time).toISOString():null,index:i};
  }).filter(x=>x.title&&x.url);
  const unique=[...new Map(entries.map(x=>[x.url,x])).values()];unique.sort((a,b)=>a.publishedAt&&b.publishedAt?b.publishedAt.localeCompare(a.publishedAt):a.publishedAt?-1:b.publishedAt?1:a.index-b.index);
  return {mode:'feed',items:unique.slice(0,5).map(({index,...x})=>x)};
 }
 if(!/<html\b|<title\b/i.test(body))throw sourceError('読み取れる記事が見つかりませんでした。');
 const pageTags=[...tags(body)],metaTags=pageTags.filter(t=>t.name==='meta'&&!t.closing).map(t=>t.raw);const meta=key=>attr(metaTags.find(t=>attr(t,'property')===key||attr(t,'name')===key)||'','content');
 const alternate=pageTags.filter(t=>t.name==='link'&&!t.closing).map(t=>t.raw).find(t=>attr(t,'rel').split(/\s+/).includes('alternate')&&/^application\/(rss|atom)\+xml$/i.test(attr(t,'type')));
 const title=plain(meta('og:title')||inner(body,'title'),100);if(!title)throw sourceError('読み取れるページ情報が見つかりませんでした。');
 return {mode:'page',items:[{title,text:plain(meta('og:description')||meta('description'),140),url,publishedAt:null}],feedURL:alternate?linkURL(attr(alternate,'href'),url):''};
}
const ACCEPT='application/rss+xml, application/atom+xml, text/html, application/xml, text/xml';
async function fetchPublicPageWeb(value,{signal,redirects=0}={}){
 const u=publicURL(value);if(redirects>3)throw sourceError('転送先が多すぎるため取得できませんでした。');
 const timeout=AbortSignal.timeout(10000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 let response;
 try{response=await fetch(u.href,{redirect:'manual',signal:combined,headers:{'User-Agent':'Tobiyori-OfficialUpdates/1.0','Accept':ACCEPT,'Accept-Encoding':'identity'}});}
 catch{throw sourceError(timeout.aborted?'情報元への接続に時間がかかっています。あとでお試しください。':'情報元に接続できませんでした。公式ページでご確認ください。');}
 if([301,302,303,307,308].includes(response.status)&&response.headers.get('location')){response.body?.cancel();return fetchPublicPageWeb(publicURL(response.headers.get('location'),u).href,{signal,redirects:redirects+1});}
 if(response.status!==200){response.body?.cancel();throw sourceError('情報元が取得を受け付けませんでした。公式ページでご確認ください。');}
 const contentType=String(response.headers.get('content-type')||'');
 if(!/(text\/(html|xml)|application\/(rss\+xml|atom\+xml|xml|xhtml\+xml))/i.test(contentType)){response.body?.cancel();throw sourceError('この情報元の形式は自動取得に対応していません。');}
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024){reader.cancel();throw sourceError('情報元のページが大きすぎるため取得できませんでした。');}chunks.push(value);}}
 catch(e){if(e.status)throw e;throw sourceError('情報元の読み込みが中断されました。');}
 const buffer=new Uint8Array(bytes);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
 try{const head=new TextDecoder().decode(buffer.subarray(0,200)),charset=/charset=["']?([\w-]+)/i.exec(contentType)?.[1]||/encoding=["']([\w-]+)/i.exec(head)?.[1]||'utf-8';return {url:u.href,contentType,body:new TextDecoder(charset).decode(buffer)};}
 catch{throw sourceError('情報元の文字を読み取れませんでした。');}
}
const defaultFetcher=globalThis.navigator?.userAgent==='Cloudflare-Workers'?fetchPublicPageWeb:fetchPublicPage;
async function readOfficialSource(source,{signal,fetcher=defaultFetcher}={}){
 const page=await fetcher(publicURL(source).href,{signal}),parsed=parsePage(page);
 if(parsed.feedURL){try{const feed=parsePage(await fetcher(parsed.feedURL,{signal}));if(feed.mode==='feed')return {...feed,sourceURL:page.url,feedURL:parsed.feedURL};}catch{/* Keep a clearly labelled page summary if the site's feed is unavailable. */}}
 return {...parsed,sourceURL:page.url};
}
module.exports={isPublicIPv4,publicURL,safeLookup,fetchPublicPage,fetchPublicPageWeb,parsePage,readOfficialSource};
