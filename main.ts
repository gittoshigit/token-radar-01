import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './lib/snapshot.ts';
import { buildBoard } from './lib/board.ts';
import { emit, copyDir } from './lib/emit.ts';
import { selfcheck, dossierCheck, CAPS } from './lib/selfcheck.ts';
import { buildDossier } from './vendor/makefun-board.ts';
function arg(name:string,fallback:string) {
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--'+name) {if(!args[i+1]||args[i+1].startsWith('--')) throw new Error('missing --'+name+' value');return args[i+1];}
  if(args[i].startsWith('--'+name+'=')) return args[i].slice(name.length+3);
 }
 return fallback;
}
try {
 const input=arg('input','/input/snapshot.json');
 const snapshot=parseSnapshot(readFileSync(input.endsWith('.json')?input:join(input,'snapshot.json'),'utf8'));
 const out=resolve(arg('output',process.env.MAKEFUN_OUTPUT_DIR??'/output'));
 const here=fileURLToPath(new URL('.',import.meta.url));
 if(out===resolve(here)) throw new Error('output must differ from the source directory');
 const board=buildBoard(snapshot);
 emit(out,snapshot,board);
 // Remove prior copied assets so rerunning does not preserve stale files.
 for(const name of ['dashboard','screenshots']) {
  rmSync(join(out,name),{recursive:true,force:true});
  copyDir(join(here,name),join(out,name));
 }
 rmSync(join(out,'dossier.json'),{force:true});
 const checks=selfcheck(out,snapshot,board.padding_used);
 let dossierError:string|undefined;
 try {
  // Last filesystem write. The unchanged kit refuses missing screenshots.
  writeFileSync(join(out,'dossier.json'),buildDossier(out,CAPS));
 } catch(e) {dossierError=(e as Error).message;}
 checks.push(dossierCheck(out,dossierError));
 for(const c of checks) console.log(`${c.pass?'PASS':'FAIL'} ${c.name}: ${c.detail}`);
 console.log(`board rows: ${board.rows.length}; max_adjust_usd: ${board.max_adjust_usd}`);
 console.log('top 5:');for(const p of board.rows.slice(0,5)) console.log(`${p.name}: $${p.implied_value_usd}`);
 console.log(`last value: $${board.rows.at(-1)?.implied_value_usd}`);
 console.log(`lowest watchlist rank: ${Math.max(...board.rows.filter(p=>p.watchlist).map(p=>p.rank))}`);
 if(checks.some(c=>!c.pass&&c.name!=='screenshots')) process.exitCode=1;
} catch(e) {console.error('token radar: '+(e as Error).message);process.exitCode=1;}
