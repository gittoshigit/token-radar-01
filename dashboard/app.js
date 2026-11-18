(function(){
'use strict';
const data=window.RADAR,result=RadarModel.build(data);
const expected=new Map(data.board.map(p=>[p[0],p]));
const reproduced=result.rows.filter(p=>{const e=expected.get(p.slug);return e&&e[1]===p.rank&&Math.abs(e[2]-p.implied_value_usd)<=1;}).length;
const matching=reproduced===data.board.length&&result.rows.length===data.board.length;
document.getElementById('reproduced').textContent='reproduced in-page: '+reproduced+'/'+data.board.length+' rows'+(matching?'':' · MISMATCH');
if(!matching) document.getElementById('reproduced').style.color='var(--down)';
const coverage=result.rows.filter(p=>p.watchlist).length;
document.getElementById('summary').textContent=result.rows.length+' ranked · '+coverage+'/'+data.watchlist.length+' watchlist covered · '+data.protocols.filter(p=>p[8]!==null||p[9]!==null).length+' trading tokens kept off the board · model '+RadarModel.constants.version+' · snapshot '+data.as_of;
const money=v=>'$'+Number(v.toPrecision(3)).toString();
const fragment=document.createDocumentFragment();
for(const p of result.rows){
 const tr=document.createElement('tr');
 for(const value of [p.rank,p.name,p.category,money(p.tvl_usd),money(p.implied_value_usd)]){const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);}
 fragment.appendChild(tr);
}
document.getElementById('board').appendChild(fragment);
})();
