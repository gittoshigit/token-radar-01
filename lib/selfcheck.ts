import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier, PLAIN_NAME } from '../vendor/makefun-board.ts';
import type { Snapshot } from './snapshot.ts';
import { cmp } from './emit.ts';
export const CAPS={text_max_bytes:65536,screenshots:{max:4,max_bytes:524288},dashboard:{max_files:400,max_bytes:4194304}};
export interface Check {name:string;pass:boolean;detail:string}
function assert(ok:unknown,message:string):asserts ok {if(!ok) throw new Error(message);}
function walk(dir:string):string[] {
 const result:string[]=[];
 for(const name of readdirSync(dir).sort(cmp)) {
  assert(PLAIN_NAME.test(name),'invalid name '+name);
  const path=join(dir,name),st=lstatSync(path);
  if(st.isDirectory()) result.push(...walk(path));
  else {assert(st.isFile(),'non-regular file');result.push(path);}
 }
 return result;
}
export function dimensions(b:Buffer):[number,number] {
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
  let at=8,width=0,height=0,ended=false;
  while(at+12<=b.length) {
   const n=b.readUInt32BE(at),kind=b.toString('ascii',at+4,at+8);
   assert(at+12+n<=b.length,'truncated PNG');
   if(at===8) {assert(kind==='IHDR'&&n===13,'invalid IHDR');width=b.readUInt32BE(at+8);height=b.readUInt32BE(at+12);}
   at+=12+n;
   if(kind==='IEND') {assert(n===0&&at===b.length,'invalid IEND');ended=true;break;}
  }
  assert(ended&&width>0&&height>0,'incomplete PNG');return [width,height];
 }
 assert(b[0]===255&&b[1]===216&&b[2]===255&&b.at(-2)===255&&b.at(-1)===217,'invalid JPEG magic or ending');
 let at=2;
 while(at<b.length-2) {
  assert(b[at++]===255,'invalid JPEG marker');
  while(b[at]===255) at++;
  const marker=b[at++];
  if(marker===0xda||marker===0xd9) break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7)) continue;
  assert(at+2<=b.length,'truncated JPEG length');const len=b.readUInt16BE(at);
  assert(len>=2&&at+len<=b.length,'invalid JPEG segment');
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
   assert(len>=8,'invalid SOF');const count=b[at+7];assert(len===8+3*count&&count>0,'invalid SOF components');
   const h=b.readUInt16BE(at+3),w=b.readUInt16BE(at+5);assert(w>0&&h>0,'invalid JPEG dimensions');return [w,h];
  }
  at+=len;
 }
 throw new Error('JPEG missing SOF');
}
function check(name:string,fn:()=>string):Check {
 try{return {name,pass:true,detail:fn()};}catch(e){return {name,pass:false,detail:(e as Error).message};}
}
export function selfcheck(out:string,s:Snapshot,padding_used:boolean):Check[] {
 const boardPath=join(out,'board.json');
 const rows=JSON.parse(readFileSync(boardPath,'utf8')).rows;
 return [
 check('dashboard_files',()=>{
  const dir=join(out,'dashboard'),files=walk(dir),total=files.reduce((n,p)=>n+lstatSync(p).size,0);
  assert(existsSync(join(dir,'index.html'))&&files.some(p=>p.endsWith('.css'))&&files.some(p=>p.endsWith('.js')),'missing shell files');
  assert(files.length<=400&&total<=4194304&&total<=60000,'dashboard byte/count budget');
  const budgets=[['index.html',2500],['app.css',10000],['model.js',12000],['plans.js',13000],['app.js',22000]] as const;
  for(const [file,cap] of budgets) assert(lstatSync(join(dir,file)).size<=cap,file+' own budget');
  for(const file of files) {
   const text=readFileSync(file,'utf8');
   if(file.endsWith('.css')) assert(!/https?:\/\//i.test(text),'remote CSS');
   if(file.endsWith('.html')) {
    // Attribute values (quoted and unquoted), plus inline style bodies.
    const values=[...text.matchAll(/[^\s<>/=]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>m[1]??m[2]??m[3]);
    values.push(...[...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(m=>m[1]));
    assert(values.every(v=>!/https?:\/\//i.test(v)),'remote HTML attribute/style');
   }
   if(/\.(?:js|mjs)$/.test(file)) {
    const specs=[...text.matchAll(/(?:\b(?:import|export)\s+(?:[^;]*?\bfrom\s*)?|\b(?:require|import)\s*\(\s*)['"]([^'"]+)['"]/g)];
    assert(specs.every(m=>!/https?:\/\//i.test(m[1])),'remote JS specifier');
   }
  }
  return files.length+' files, '+total+' bytes';
 }),
 check('board_file',()=>{
  assert(lstatSync(boardPath).size<=8*1024*1024&&Array.isArray(rows)&&rows.length>=100&&rows.length<=4000,'board size/count');
  const known=new Set(s.protocols.map(p=>p.slug)),seen=new Set();
  for(const p of rows) {
   assert(typeof p.slug==='string'&&!/\s/.test(p.slug)&&known.has(p.slug)&&!seen.has(p.slug),'invalid slug');seen.add(p.slug);
   assert(typeof p.name==='string'&&p.name.trim().length>0,'invalid name');
   assert(Number.isInteger(p.rank)&&p.rank>0,'invalid rank');
   assert(Number.isSafeInteger(p.implied_value_usd)&&p.implied_value_usd>=1&&p.implied_value_usd<=1e14,'invalid value');
  }
  return rows.length+' rows, '+lstatSync(boardPath).size+' bytes';
 }),
 check('sorted_by_value',()=>{
  const sorted=rows.slice().sort((a:any,b:any)=>a.rank-b.rank||cmp(a.slug,b.slug));
  sorted.forEach((p:any,i:number)=>{assert(p.rank===i+1,'rank gap');if(i) assert(sorted[i-1].implied_value_usd>p.implied_value_usd,'values not strictly decreasing');});
  assert(sorted[0].implied_value_usd!==sorted.at(-1).implied_value_usd,'flat board');return 'strictly decreasing';
 }),
 check('coverage',()=>{const found=s.watchlist.filter(slug=>rows.some((p:any)=>p.slug===slug));assert(found.length===s.watchlist.length,'watchlist missing');return found.length+'/'+s.watchlist.length;}),
 check('farm_steps',()=>{
  assert(!padding_used,'padding was needed');
  for(const p of rows) {
   assert(Array.isArray(p.farm_steps)&&p.farm_steps.length>=3&&p.farm_steps.length<=12,'invalid step count');
   for(const step of p.farm_steps) assert(typeof step==='string'&&step===step.trim()&&step.length>=20&&step.length<=600&&step.includes('Cost:')&&step.includes('Time:'),'invalid step for '+p.slug);
  }return 'cost/time present; no padding';
 }),
 check('screenshots',()=>{
  const dir=join(out,'screenshots');assert(existsSync(dir),'missing screenshots/ (expected in iteration 1)');
  const files=walk(dir);assert(files.length===3,'need exactly 3 screenshots');
  for(const file of files) {const b=readFileSync(file);assert(b.length<=350000,'screenshot over 350 KB');const [w,h]=dimensions(b);assert(Math.max(w,h)<=1440&&Math.min(w,h)>=800,'screenshot dimensions');}
  return '3 complete images';
 })];
}
export function dossierCheck(out:string,buildError?:string):Check {
 return check('dossier_matches',()=>{
  if(buildError) throw new Error(buildError);
  const file=join(out,'dossier.json');assert(existsSync(file),'dossier missing');
  const bytes=readFileSync(file),expected=Buffer.from(buildDossier(out,CAPS));
  assert(bytes.length<=1500000&&bytes.equals(expected),'dossier bytes mismatch or size');
  const text=JSON.parse(bytes.toString('utf8')).text;
  assert(!/lines (?:are )?not shown|\[Cut at /.test(text),'dossier source truncated');return 'byte-identical rebuild';
 });
}
