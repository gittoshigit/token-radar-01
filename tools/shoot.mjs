// Dev only: captures run in the caller's remote Chrome, never in the grading sandbox.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const required = ['RADAR_SHOT_HOST', 'RADAR_SHOT_DIR', 'RADAR_CHROME'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Set '+missing.join(', ')+'. RADAR_SHOT_HOST is the SSH target; RADAR_SHOT_DIR is a dedicated remote output directory; RADAR_CHROME is the remote Chrome executable. Optional RADAR_SSH_OPTS supplies SSH/scp options.');
  process.exit(1);
}
const host = process.env.RADAR_SHOT_HOST, remote = process.env.RADAR_SHOT_DIR, chrome = process.env.RADAR_CHROME;
if (!remote.startsWith('/') || !chrome.startsWith('/') || host.startsWith('-')) throw new Error('Use absolute remote paths and a valid SSH target');
// Parse shell-style option words without evaluating substitutions or commands.
function words(s) {
  const result=[]; let word='', quote='', started=false;
  for(let i=0;i<s.length;i++) {
    const c=s[i];
    if(c==='\\' && quote!=="'") { if(++i===s.length) throw new Error('Trailing option escape'); word+=s[i]; started=true; }
    else if(quote) { if(c===quote) quote=''; else word+=c; }
    else if(c==='"'||c==="'") {quote=c;started=true;}
    else if(/\s/.test(c)) {if(started) {result.push(word);word='';started=false;}}
    else {word+=c;started=true;}
  }
  if(quote) throw new Error('Unclosed option quote');
  if(started) result.push(word);
  return result;
}
const opts=words(process.env.RADAR_SSH_OPTS || '');
const q=s=>"'"+s.replaceAll("'", "'\\''")+"'";
function run(command,args,allowFailure=false) {
  const r=spawnSync(command,args,{cwd:root,stdio:'inherit'});
  if(r.error) throw r.error;
  if(r.status!==0&&!allowFailure) throw new Error(command+' exited '+r.status);
  return r.status;
}
const out=join(root,'out');
rmSync(out,{recursive:true,force:true});
// Before first capture main can report missing screenshots/dossier; require fresh data.
const status=run(process.execPath,[join(root,'main.ts'),...process.argv.slice(2),'--output',out],true);
for(const file of ['board.json','data.js','dashboard/index.html']) if(!existsSync(join(out,file))) throw new Error('Build missing '+file);
const board=JSON.parse(readFileSync(join(out,'board.json'),'utf8'));
const detail=board.rows.filter(p=>p.watchlist).sort((a,b)=>a.rank-b.rank)[0];
if(!detail) throw new Error('No watchlist row');
if(status!==0) console.warn('Initial build reported failed checks; final build must pass after capture.');
run('ssh',[...opts,host,'mkdir -p -- '+q(remote)]);
run('scp',[...opts,'-r',join(out,'board.json'),join(out,'data.js'),join(out,'dashboard'),host+':'+q(remote+'/')]);
const shots=[['1-board.png','#/'],['2-detail.png','#/p/'+encodeURIComponent(detail.slug)],['3-filtered.png','#/?cat=Risk%20Curators&wl=1']];
const local=join(root,'screenshots'); mkdirSync(local,{recursive:true});
for(const [name,route] of shots) {
  const url=pathToFileURL(remote+'/dashboard/index.html').href+route;
  const command='profile=$(mktemp -d) && trap \'rm -rf -- "$profile"\' EXIT; '+q(chrome)+' --headless=new --no-sandbox --disable-gpu --hide-scrollbars --virtual-time-budget=5000 --window-size=1440,960 --user-data-dir="$profile" --screenshot='+q(remote+'/'+name)+' '+q(url);
  run('ssh',[...opts,host,command]);
  run('scp',[...opts,host+':'+q(remote+'/'+name),join(local,name)]);
}
console.log('Screenshot | Bytes | Dimensions | Status');
for(const [name] of shots) {
  const b=readFileSync(join(local,name));
  if(!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||b.readUInt32BE(8)!==13||b.toString('ascii',12,16)!=='IHDR') throw new Error(name+': invalid PNG IHDR');
  const w=b.readUInt32BE(16),h=b.readUInt32BE(20);
  if(w!==1440||h!==960||b.length>524288) throw new Error(name+': dimensions or hard size cap failed');
  const warning=b.length>350000;
  if(warning) console.warn(name+': warning: exceeds 350 KB target');
  console.log(`${name} | ${b.length} | ${w}×${h} | ${warning?'WARN':'PASS'}`);
}
console.log('Detail rank '+detail.rank+': '+detail.slug);
