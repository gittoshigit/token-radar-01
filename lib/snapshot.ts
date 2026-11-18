export interface Protocol {
 slug:string; name:string; category:string|null; chains:string[]; tvl_usd:number;
 change_7d:number|null; mcap_usd:number|null; listed_at:string|null;
 gecko_id:string|null; symbol:string|null;
}
export interface Snapshot {
 as_of:string; source:string; floor_usd:number; protocols:Protocol[]; watchlist:string[];
}
const date = (v:unknown):v is string => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
export function parseSnapshot(text:string):Snapshot {
 const s=JSON.parse(text);
 const fail=(message:string):never=>{throw new Error('snapshot: '+message);};
 if(!s || typeof s!=='object' || !date(s.as_of) || typeof s.source!=='string' || !Number.isFinite(s.floor_usd) || s.floor_usd<=0 || !Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) fail('invalid envelope');
 const slugs=new Set<string>();
 for(const p of s.protocols) {
  if(!p || typeof p!=='object') fail('invalid protocol');
  for(const key of ['slug','name']) if(typeof p[key]!=='string'||!p[key].trim()) fail('invalid '+key);
  if(/\s/.test(p.slug)||slugs.has(p.slug)) fail('duplicate or whitespace slug');
  slugs.add(p.slug);
  for(const key of ['category','gecko_id','symbol']) if(p[key]!==null&&typeof p[key]!=='string') fail('invalid '+key);
  if(!Array.isArray(p.chains)||!p.chains.every((c:unknown)=>typeof c==='string'&&c.length>0)) fail('invalid chains');
  if(!Number.isFinite(p.tvl_usd)||p.tvl_usd<=0) fail('invalid TVL');
  for(const key of ['change_7d','mcap_usd']) if(p[key]!==null&&!Number.isFinite(p[key])) fail('invalid '+key);
  if(p.listed_at!==null&&!date(p.listed_at)) fail('invalid listed_at');
 }
 if(!s.watchlist.every((v:unknown)=>typeof v==='string'&&slugs.has(v))||new Set(s.watchlist).size!==s.watchlist.length) fail('invalid watchlist');
 return s;
}
