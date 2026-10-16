// Fetch public, registered sources only. Pin the validated DNS result to the socket.
const http=require('node:http'),https=require('node:https'),dns=require('node:dns'),net=require('node:net');
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
function safeLookup(host,options,callback){dns.lookup(host,{family:4,all:true},(error,addresses)=>{
 if(error)return callback(sourceError('情報元のサイトに接続できませんでした。'));
 if(!addresses.length||addresses.some(a=>!isPublicIPv4(a.address)))return callback(sourceError('公開されている公式サイトにのみ接続できます。'));
 const selected=addresses[0];options.all?callback(null,[selected]):callback(null,selected.address,4);
});}
async function fetchPublicPage(value,{signal,redirects=0}={}){
 const u=publicURL(value);if(redirects>3)throw sourceError('転送先が多すぎるため取得できませんでした。');
 return new Promise((resolve,reject)=>{
  let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(deadline);error?reject(error):resolve(result);};
  const request=(u.protocol==='https:'?https:http).request(u,{method:'GET',agent:false,family:4,lookup:safeLookup,signal,headers:{'User-Agent':'Tobiyori-OfficialUpdates/1.0','Accept':'application/rss+xml, application/atom+xml, text/html, application/xml, text/xml','Accept-Encoding':'identity'}},response=>{
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
function plain(s='',max=160){return decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,max);}
function attr(tag,key){const match=tag.match(new RegExp('(?:^|\\s)'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));return match?decodeEntities(match[1]??match[2]??match[3]):'';}
function inner(xml,name){return new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i').exec(xml)?.[1]||'';}
function linkURL(v,base){if(!v)return '';try{return publicURL(v,base).href;}catch{return '';}}
function parsePage(page){
 const {body,url}=page;if(/<!DOCTYPE|<!ENTITY/i.test(body)&&!/<html\b/i.test(body))throw sourceError('このフィードの形式には対応していません。');
 if(/<(rss|feed|rdf:RDF)\b/i.test(body)){
  const entries=[...body.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0,100).map(([,kind,x],i)=>{
   const link=kind.toLowerCase()==='entry'?[...x.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).find(t=>!attr(t,'rel')||attr(t,'rel')==='alternate'):null;
   const href=linkURL(link?attr(link,'href'):plain(inner(x,'link'),2000),url);
   const published=plain(inner(x,'pubDate')||inner(x,'published')||inner(x,'updated')||inner(x,'dc:date'),80),time=Date.parse(published);
   return {title:plain(inner(x,'title'),100),text:plain(inner(x,'description')||inner(x,'summary'),140),url:href,publishedAt:Number.isFinite(time)?new Date(time).toISOString():null,index:i};
  }).filter(x=>x.title&&x.url);
  const unique=[...new Map(entries.map(x=>[x.url,x])).values()];unique.sort((a,b)=>a.publishedAt&&b.publishedAt?b.publishedAt.localeCompare(a.publishedAt):a.publishedAt?-1:b.publishedAt?1:a.index-b.index);
  return {mode:'feed',items:unique.slice(0,5).map(({index,...x})=>x)};
 }
 if(!/<html\b|<title\b/i.test(body))throw sourceError('読み取れる記事が見つかりませんでした。');
 const tags=[...body.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);const meta=key=>attr(tags.find(t=>attr(t,'property')===key||attr(t,'name')===key)||'','content');
 const alternate=[...body.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).find(t=>attr(t,'rel').split(/\s+/).includes('alternate')&&/^application\/(rss|atom)\+xml$/i.test(attr(t,'type')));
 const title=plain(meta('og:title')||inner(body,'title'),100);if(!title)throw sourceError('読み取れるページ情報が見つかりませんでした。');
 return {mode:'page',items:[{title,text:plain(meta('og:description')||meta('description'),140),url,publishedAt:null}],feedURL:alternate?linkURL(attr(alternate,'href'),url):''};
}
async function readOfficialSource(source,{signal,fetcher=fetchPublicPage}={}){
 const page=await fetcher(publicURL(source).href,{signal}),parsed=parsePage(page);
 if(parsed.feedURL){try{const feed=parsePage(await fetcher(parsed.feedURL,{signal}));if(feed.mode==='feed')return {...feed,sourceURL:page.url,feedURL:parsed.feedURL};}catch{/* Keep a clearly labelled page summary if the site's feed is unavailable. */}}
 return {...parsed,sourceURL:page.url};
}
module.exports={isPublicIPv4,publicURL,safeLookup,fetchPublicPage,parsePage,readOfficialSource};
