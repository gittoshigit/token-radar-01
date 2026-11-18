(function (root) {
'use strict';
const constants = {winsor:[-2.5,1.5],slope_cap:[-0.35,0],K:6,min_peers:3,band_pool_min:8,band_lo:[-0.9,-0.15],band_hi:[0.1,0.7],mom_clamp:[-40,60],mom_power:0.5,mat_floor:0.70,mat_span:0.40,mat_tau_days:30,mat_full_days:730,mat_cap:1.10,version:'peer-1'};
const families = [
 ['Trading','Dexs|Derivatives|Options|Synthetics|Interest Rate Derivatives|Prediction Market|OTC Marketplace|Options Vault|NFT Marketplace|Launchpad|Token Locker'],
 ['Credit','Lending|CDP|CDP Manager|Uncollateralized Lending|Collateral Markets|Collateral Management|Dual-Token Stablecoin|Algo-Stables|Stablecoin Issuer|Stablecoin Wrapper|Reserve Currency'],
 ['Vaults','Yield|Yield Aggregator|Risk Curators|Onchain Capital Allocator|Liquidity Manager|Leveraged Farming|Farm|Basis Trading|Indexes|Staking Pool|Restaking'],
 ['Real-world','RWA|CeDeFi|Payments|Crypto Card Issuer|Anchor BTC|Decentralized BTC']
];
const excluded = ['Bridge','Canonical Bridge','Liquid Staking','Liquid Restaking','Restaked BTC','CEX'];
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function quantile(values,q) {
 const a=values.slice().sort((a,b)=>a-b); if(!a.length) return null;
 const x=(a.length-1)*q,i=Math.floor(x); return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(x-i);
}
const median = a => quantile(a,0.5);
const category = p => p.category ?? 'Uncategorised';
const family = c => (families.find(f=>f[1].split('|').includes(c)) || ['Other'])[0];
const noToken = p => p.gecko_id === null && p.symbol === null;
function eligible(p) {
 return noToken(p) && !excluded.includes(category(p)) && !/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name) && !/\b(wrapped|staked|staking)\b/i.test(p.name) && !/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/.test(p.name);
}
const fields=['slug','name','category','chains','tvl_usd','change_7d','mcap_usd','listed_at','gecko_id','symbol'];
function unpack(s) { return {...s,protocols:s.protocols.map(p=>Array.isArray(p)?Object.fromEntries(fields.map((k,i)=>[k,p[i]])):p)}; }
function ageDays(p,s) { return p.listed_at === null ? null : Math.max(0,Math.floor((Date.parse(s.as_of)-Date.parse(p.listed_at))/86400000)); }
function buildPeers(s) {
 const peers=s.protocols.filter(p=>!noToken(p)&&p.mcap_usd>0&&p.tvl_usd>0&&!excluded.includes(category(p))&&category(p)!=='Chain').slice().sort((a,b)=>cmp(a.slug,b.slug));
 const fallback=peers.length<10;
 const xs=peers.map(p=>Math.log10(p.tvl_usd));
 const ls=peers.map(p=>clamp(Math.log10(p.mcap_usd/p.tvl_usd),...constants.winsor));
 const m=xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
 const mean=ls.length?ls.reduce((a,b)=>a+b,0)/ls.length:0;
 const denominator=xs.reduce((a,x)=>a+(x-m)**2,0);
 const b_fit=denominator?xs.reduce((a,x,i)=>a+(x-m)*(ls[i]-mean),0)/denominator:0;
 const b_used=fallback?-0.35:clamp(b_fit,...constants.slope_cap);
 const residuals=peers.map((p,i)=>({...p,residual:ls[i]-b_used*(xs[i]-m)}));
 const G=fallback?Math.log10(0.25):median(residuals.map(p=>p.residual));
 function pool(c) {
  const f=family(c), fp=residuals.filter(p=>family(category(p))===f),cp=residuals.filter(p=>category(p)===c);
  const fl=fp.length?(fp.length*median(fp.map(p=>p.residual))+constants.K*G)/(fp.length+constants.K):G;
  const level=cp.length>=constants.min_peers?(cp.length*median(cp.map(p=>p.residual))+constants.K*fl)/(cp.length+constants.K):fl;
  const evidence=cp.length>=constants.min_peers?cp:fp.length?fp:residuals;
  const band=cp.length>=8?cp:fp.length>=8?fp:residuals;
  const center=median(band.map(p=>p.residual)) ?? G;
  return {level,peer_pool:cp.length>=3?'category: '+c:fp.length?'family: '+f:'global',peer_n:evidence.length,
   lo_off:clamp((quantile(band.map(p=>p.residual),0.25)??G)-center,...constants.band_lo),
   hi_off:clamp((quantile(band.map(p=>p.residual),0.75)??G)-center,...constants.band_hi)};
 }
 return {peers:residuals,m,b_fit,b_used,G,fallback,pool};
}
function impliedValue(p,context) {
 const {s,peers,drift,median_age}=context, c=category(p), pool=peers.pool(c);
 const age=ageDays(p,s), age_days=age??median_age;
 const size_term=10**(peers.b_used*(Math.log10(p.tvl_usd)-peers.m));
 const peer_mult=10**pool.level*size_term;
 const mom=Math.sqrt(1+clamp((p.change_7d??drift)-drift,...constants.mom_clamp)/100);
 const mat=clamp(0.70+0.40*Math.log(1+age_days/30)/Math.log(1+730/30),0.70,1.10);
 const raw=p.tvl_usd*peer_mult*mom*mat;
 return {...p,category:c,age_days,raw,low_usd:Math.round(raw*10**pool.lo_off),high_usd:Math.round(raw*10**pool.hi_off),factors:{peer_mult,peer_pool:pool.peer_pool,peer_n:pool.peer_n,mom,mat,size_term}};
}
function build(input) {
 const s=unpack(input),watch=new Set(s.watchlist), peers=buildPeers(s);
 const selected=s.protocols.filter(p=>eligible(p)||watch.has(p.slug));
 const median_age=median(selected.map(p=>ageDays(p,s)).filter(v=>v!==null))??0;
 const drift=median(s.protocols.map(p=>p.change_7d).filter(v=>v!==null))??0;
 const context={s,peers,drift,median_age};
 let rows=selected.map(p=>impliedValue(p,context));
 const order=(a,b)=>b.raw-a.raw||cmp(a.slug,b.slug);
 if(rows.length<100) {
  const used=new Set(rows.map(p=>p.slug));
  rows.push(...s.protocols.filter(p=>noToken(p)&&!used.has(p.slug)).map(p=>({...impliedValue(p,context),excluded:true})).sort(order).slice(0,100-rows.length));
 }
 rows.sort(order); rows=rows.slice(0,1500);
 const lead=p=>p.name.toLowerCase().split(/[ .-]/)[0];
 const live=s.protocols.filter(p=>!noToken(p)).slice().sort((a,b)=>cmp(a.slug,b.slug));
 let previous=Infinity,max_adjust_usd=0;
 rows=rows.map((p,i)=>{
  const value=Math.max(1,Math.min(Math.round(p.raw),previous-1)); previous=value;
  max_adjust_usd=Math.max(max_adjust_usd,Math.abs(value-Math.round(p.raw)));
  const related=lead(p).length>=3?live.find(q=>lead(q)===lead(p)):null;
  const tags=[];
  if(related) tags.push('family token trades: '+(related.symbol??related.gecko_id));
  if(p.tvl_usd>=s.floor_usd&&!watch.has(p.slug)) tags.push('above floor · off list');
  if(p.excluded) tags.push('excluded category');
  return {...p,rank:i+1,implied_value_usd:value,watchlist:watch.has(p.slug),tags};
 });
 return {rows,max_adjust_usd,peers,drift,median_age,constants};
}
const API={constants,fields,unpack,category,family,noToken,eligible,ageDays,quantile,buildPeers,impliedValue,build};
if (typeof module === 'object' && module.exports) module.exports = API; else
root.RadarModel = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
