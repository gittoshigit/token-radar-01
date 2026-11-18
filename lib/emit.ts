import { mkdirSync, readdirSync, lstatSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot } from './snapshot.ts';
import type { Board } from './board.ts';
import { model } from './shared.ts';
export const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const round=(n:number)=>Math.round(n*1e4)/1e4;
export function emit(out:string,s:Snapshot,b:Board) {
 mkdirSync(out,{recursive:true});
 const rows=b.rows.map(p=>({...p,factors:{peer_mult:round(p.factors.peer_mult),peer_pool:p.factors.peer_pool,peer_n:p.factors.peer_n,mom:round(p.factors.mom),mat:round(p.factors.mat),size_term:round(p.factors.size_term)},plan:{...p.plan,fees_usd:round(p.plan.fees_usd),active_minutes:round(p.plan.active_minutes)}}));
 writeFileSync(join(out,'board.json'),JSON.stringify({rows})+'\n');
 const data={as_of:s.as_of,source:s.source,floor_usd:s.floor_usd,watchlist:s.watchlist,
  protocols:s.protocols.map(p=>model.fields.map(k=>p[k as keyof typeof p])),
  board:b.rows.map(p=>[p.slug,p.rank,p.implied_value_usd]),built:{model_version:model.constants.version,rows:b.rows.length,max_adjust_usd:b.max_adjust_usd}};
 writeFileSync(join(out,'data.js'),'window.RADAR = '+JSON.stringify(data).replace(/</g,'\\u003c')+';\n');
}
export function copyDir(from:string,to:string) {
 if(!existsSync(from)) return;
 mkdirSync(to,{recursive:true});
 for(const name of readdirSync(from).sort(cmp)) {
  const src=join(from,name),dst=join(to,name),st=lstatSync(src);
  if(st.isDirectory()) copyDir(src,dst);
  else if(st.isFile()) copyFileSync(src,dst);
  else throw new Error('copyDir: non-regular entry '+name);
 }
}
