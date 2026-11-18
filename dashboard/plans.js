(function(root) {
'use strict';
// Assumptions, Nov 2026 typical. Fee totals use bridge-range midpoints.
const costs=[
 {chains:['Ethereum'],tx:3,tx_range:'$1.50–6.00',bridge:2,bridge_range:'$1–3',bridge_time:'5–15 min'},
 {chains:['Base','Arbitrum','Optimism','Unichain','Katana','Plume Mainnet','Robinhood Chain','Arc'],tx:0.05,tx_range:'$0.02–0.10',bridge:1.25,bridge_range:'$0.50–2',bridge_time:'2–10 min'},
 {chains:['Solana'],tx:0.01,tx_range:'$0.001–0.02',bridge:1.25,bridge_range:'$0.50–2',bridge_time:'2–10 min'},
 {chains:['Binance'],tx:0.15,tx_range:'$0.05–0.30',bridge:0.75,bridge_range:'$0.50–1',bridge_time:'2–5 min'},
 {chains:['Avalanche','Polygon','Sonic','Berachain','Monad','Flare','Plasma','Hyperliquid L1'],tx:0.05,tx_range:'$0.01–0.15',bridge:1.25,bridge_range:'$0.50–2',bridge_time:'2–15 min'},
 {chains:['Bitcoin'],tx:1.5,tx_range:'$0.50–3.00',bridge:0,bridge_range:'n/a (native BTC)',bridge_time:'10–60 min'},
 {chains:[],tx:0.25,tx_range:'$0.10–0.50',bridge:2,bridge_range:'$1–3',bridge_time:'5–20 min'}
];
const costFor=c=>costs.find(r=>r.chains.includes(c))||costs[costs.length-1];
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const dollars=n=>'$'+Number(n.toFixed(4));
function parameters(p) {
 const chains=p.chains.slice().sort((a,b)=>costFor(a).tx-costFor(b).tx||cmp(a,b));
 const chain=chains[0]||'Unreported chain',cost=costFor(chain),t=p.tvl_usd;
 const capital_usd=t>=1e9?1000:t>=2e8?500:t>=5e7?300:t>=2e7?200:100;
 const hold_days=p.listed_at===null?60:p.age_days<90?90:p.age_days<=365?60:45;
 return {chain,others:chains.slice(1),cost,capital_usd,hold_days,tier:t>=5e8?'deep':t>=5e7?'mid-size':'thin'};
}
function formatStep(step) {
 const suffix=' Cost: '+step.cost+'. Time: '+step.time+'.';
 let text=step.text.trim().slice(0,599-suffix.length).trim();
 if(!text.endsWith('.')) text+='.';
 const trimmed=(text+suffix).trim();
 return {value:trimmed.padEnd(20,' '),padded:trimmed.length<20};
}
function planFor(p) {
 const params=parameters(p),{chain:C,capital_usd:K,hold_days:H,cost,tier,others}=params;
 const N=p.name,g=cost.tx,w=H/7,steps=[];
 const add=(text,fee,minutes,time,costText)=>steps.push({text,cost:costText||dollars(fee),time:time||minutes+' min',fee,minutes});
 const tx=n=>dollars(n*g);
 const weekly=(n,extra=0)=>dollars(n*g+extra)+'/week';
 add(`Create a fresh wallet used only for ${N}. Withdraw ${dollars(K)} USDC to ${C} from an exchange or bridge it in, and keep $5 of the gas token. While ${N} records no token, log activity without assuming a launch.${others.length?' Also on: '+others.join(', ')+'.':''}`,cost.bridge+g,15,'15 min',cost.bridge_range+' bridge + '+tx(1)+'; bridge '+cost.bridge_time);
 if(tier==='thin') add(`Quote check in ${N} on ${C}: if the price impact on ${dollars(K)} is above 0.5%, halve the size`,0,5);
 const hold=extra=>add(`Hold the ${dollars(K)} position in ${N} on ${C} for ${H} days${extra||''}`,0,0,H+' days (0 active min)');
 switch(p.category) {
 case 'Dexs':
  add(`Swap half of ${dollars(K)} into the pool's other asset on ${N} on ${C}`,K/2*0.00175+g,5,undefined,'0.05–0.30% of '+dollars(K/2)+' + '+tx(1));
  add(`Add ${dollars(K)} liquidity to ${N}'s deepest stable or major pair on ${C}. For a concentrated pool, set a ±5% range`,2*g,10,undefined,tx(2)+' (approve and deposit)');
  add(`Make 3 swaps of $20–50 a week through ${N}'s router on ${C} so trading activity is recorded`,(0.30+3*g)*w,10*w,'10 min/week',weekly(3,0.30));
  add(`Check the ${dollars(K)} range at ${N} twice a week and re-centre it when it is out of range`,2*g*w,10*w,'5 min/check, twice a week',tx(1)+' each time; estimate two/week');
  hold();break;
 case 'Lending':
  add(`Supply ${dollars(K)} USDC to ${N}'s main market on ${C}`,2*g,10);
  add(`Borrow ${dollars(K*0.25)} in a different stablecoin on ${N} and keep the health factor above 2.0`,g,5);
  add(`Repay and re-borrow the ${dollars(K*0.25)} loan at ${N} once a week so you are active in more than one snapshot`,2*g*w,10*w,'10 min/week',weekly(2));
  add(`Set a price alert for the ${dollars(K)} position at ${N} at a health factor of 1.5 (or ±15% on volatile collateral)`,0,5);
  hold(', then repay in full before you withdraw');break;
 case 'Yield':case 'Yield Aggregator':case 'Basis Trading':
  add(`Read ${N}'s vault page on ${C}: strategy, withdrawal delay, performance fee. Note them in the log before placing ${dollars(K)}`,0,15);
  add(`Deposit $10 into ${N} on ${C} as a test and withdraw it the same day to check the exit path`,4*g,20);
  add(`Deposit ${dollars(K)} into the checked ${N} vault on ${C}`,2*g,5);
  add(`Each week, compare the ${N} vault share price with the day you deposited ${dollars(K)} so a loss shows early`,0,5*w,'5 min/week');
  hold('. Ask for the withdrawal early if the exit has a queue');break;
 case 'Risk Curators':
  add(`Open ${N}'s curated USDC (or ETH) vault list on ${C} and pick the vault with the largest deposits, the vault where the curator's own TVL sits, for ${dollars(K)}`,0,10);
  add(`Check that ${N} vault's market exposures and its liquid share before placing ${dollars(K)}`,0,10);
  add(`Deposit $10 as a test in ${N}'s selected vault on ${C}, withdraw it, then deposit ${dollars(K)}`,4*g,20);
  add(`Each week, check ${N}'s ${dollars(K)} vault allocation for new markets that are not on the original list`,0,5*w,'5 min/week');
  hold();break;
 case 'Onchain Capital Allocator':
  add(`Read ${N}'s strategy on ${C}; find the withdrawal delay on the vault page. If it is longer than 7 days, cut the deposit to half of ${dollars(K)}`,0,15);
  add(`Test ${N}'s exit path on ${C}: deposit $10 and withdraw it before the main deposit`,4*g,20);
  add(`Deposit ${dollars(K)} into ${N}'s checked vault on ${C}, or half that if its withdrawal delay exceeds 7 days`,2*g,5);
  add(`Check ${N}'s vault share price weekly against the entry price of the ${dollars(K)} position and record changes`,0,5*w,'5 min/week');
  hold('. Request withdrawal early enough for the queue');break;
 case 'RWA':
  add(`Complete ${N}'s onboarding or KYC if the product asks for it on ${C}`,0,30,'1–3 days (30 active min)','free');
  add(`Mint or subscribe ${dollars(K)} of ${N}'s tokenised asset on ${C}, minding the minimum ticket`,2*g,15,undefined,tx(2)+' + issuer fee shown at mint (not included in estimate)');
  add(`Note ${N}'s redemption window and its notice period for the ${dollars(K)} asset in the log`,0,5);
  add(`Hold ${dollars(K)} of ${N}'s asset for ${H} days and check the stated NAV each week`,0,5*w,`${H} days; 5 min/week`);
  add(`Redeem the ${dollars(K)} asset through ${N}'s issuer window, not a thin DEX pool`,g,15,'1–5 days (15 active min)');break;
 case 'Derivatives':
  add(`Deposit ${dollars(K)} USDC as margin on ${N} on ${C}`,2*g,10);
  if(/perp/i.test(N)) {
   add(`Place maker limit orders on one major pair on ${N} at 2× leverage at most; aim for about ${dollars(5*K)} weekly volume`,0.001*K*w,15*w,'15 min/week',`about 0.02% × volume = ${dollars(0.001*K)}/week; maker assumption 0–0.02%`);
   add(`Close each ${N} position the same day so funding does not pile up; budget closes for ${dollars(5*K)} weekly notional`,0.0025*K*w,5*w,'5 min/week','0.05% on close; taker assumption 0.035–0.06% of notional');
   add(`Keep at least 50% of ${dollars(K)} margin unused on ${N}; check funding before each order and never hold through a funding spike`,0,5*w,'5 min/week');
  } else {
   add(`Buy one small option or structured position on ${N} on ${C}, using at most ${dollars(K*0.1)} (10% of capital); read the maximum loss`,K*0.1*0.0005+g,15,undefined,tx(1)+' + 0.05% venue fee; up to '+dollars(K*0.1)+' premium at risk');
   add(`Roll the position at expiry once a week on ${N}, keeping the new premium at or below ${dollars(K*0.1)}`, (2*g+K*0.1*0.0005)*w,15*w,'15 min/week',weekly(2,K*0.1*0.0005)+'; replacement premium at risk');
   add(`Check the ${N} account each week and keep at least 50% of ${dollars(K)} margin unused; log expiry and maximum loss`,0,5*w,'5 min/week');
  }
  hold(' with the margin account active; close positions before exit');break;
 case 'CDP':
  add(`Deposit ${dollars(K)} of accepted collateral on ${N} on ${C}`,2*g,10);
  add(`Mint ${N}'s stablecoin against ${dollars(K)} collateral at a collateral ratio of 250% or more; record the borrowing rate`,g,5,undefined,tx(1)+' + variable borrowing interest (not included in estimate)');
  add(`Put the minted stablecoin in ${N}'s stability or savings pool if it offers one; otherwise retain it for repayment`,2*g,5);
  add(`Set a liquidation-price alert 20% above liquidation for the ${dollars(K)} collateral on ${N}`,0,5);
  hold(', then remove the stablecoin from savings, repay the debt and close');break;
 case 'Chain':
  add(`Confirm the bridged ${dollars(K)} on ${C} in the wallet and open ${N}'s native DEX or lending app from its ecosystem directory`,0,5);
  add(`Make 3 transactions a week on ${N}'s native DEX or lending app on ${C}, using $20–50 per transaction`,(3*g+0.30)*w,10*w,'10 min/week',weekly(3,0.30)+'; DEX swaps assume 0.05–0.30%');
  add(`Use one app deployed only on ${N}: test a $10 deposit and withdraw it on ${C}`,4*g,20);
  add(`Check the ${dollars(K)} balance and app withdrawal availability on ${N} each week and log transaction hashes`,0,5*w,'5 min/week');
  hold();break;
 default:
  add(`Test the ${N} app on ${C}: deposit $10 and withdraw it to confirm the exit path`,4*g,20);
  add(`Deposit ${dollars(K)} into the tested ${N} product on ${C} after reading its rules`,2*g,10);
  add(`Perform one qualifying action a week with the ${dollars(K)} position in the ${N} app on ${C}; check the app's own eligibility rules`,g*w,10*w,'10 min/week',weekly(1));
  add(`Check the ${dollars(K)} position in ${N} on ${C} each week and log its balance and withdrawal availability`,0,5*w,'5 min/week');
  hold();
 }
 add(`Before withdrawing the ${dollars(K)} position, check ${N}'s own points or rewards page from the link inside its app, record the wallet, dates and every transaction hash in a log, then withdraw on ${C}`,2*g,15);
 const formatted=steps.map(formatStep);
 return {farm_steps:formatted.map(s=>s.value),padding_used:formatted.some(s=>s.padded),steps,
  plan:{chain:C,capital_usd:K,fees_usd:Math.round(steps.reduce((s,x)=>s+x.fee,0)*100)/100,active_minutes:Math.round(steps.reduce((s,x)=>s+x.minutes,0)),hold_days:H}};
}
const API={costs,costFor,parameters,formatStep,planFor};
if (typeof module === 'object' && module.exports) module.exports = API; else
root.RadarPlans = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
