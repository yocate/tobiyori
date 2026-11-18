'use strict';
// Key used for per-IP rate limits. IPv4 (including IPv4-mapped IPv6) is used as is;
// IPv6 is grouped by its /64 prefix, because one user or device usually holds a whole /64.
function expandIPv6(value){
 let v=value;
 const dotted=v.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if(dotted){
  const b=dotted.slice(1).map(Number);if(b.some(n=>n>255))return null;
  v=v.slice(0,dotted.index)+((b[0]<<8)|b[1]).toString(16)+':'+((b[2]<<8)|b[3]).toString(16);
 }
 const halves=v.split('::');if(halves.length>2)return null;
 const head=halves[0]?halves[0].split(':'):[],tail=halves.length===2&&halves[1]?halves[1].split(':'):[];
 const fill=halves.length===2?8-head.length-tail.length:0;if(fill<0||(halves.length===1&&head.length!==8))return null;
 const groups=[...head,...Array(fill).fill('0'),...tail];
 if(groups.length!==8||groups.some(g=>!/^[0-9a-f]{1,4}$/.test(g)))return null;
 return groups.map(g=>parseInt(g,16));
}
function rateLimitIp(address){
 const raw=String(address||'unknown').trim().toLowerCase().replace(/^\[|\]$/g,'').replace(/%.*$/,'');
 if(/^\d{1,3}(\.\d{1,3}){3}$/.test(raw))return raw;
 if(!raw.includes(':'))return raw||'unknown';
 const g=expandIPv6(raw);if(!g)return raw;
 if(g.slice(0,5).every(n=>n===0)&&g[5]===0xffff)return [g[6]>>8,g[6]&255,g[7]>>8,g[7]&255].join('.');
 return g.slice(0,4).map(n=>n.toString(16)).join(':')+'::/64';
}
module.exports={rateLimitIp};
