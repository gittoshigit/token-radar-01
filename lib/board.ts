import type { Snapshot } from './snapshot.ts';
import { model, plans } from './shared.ts';
export function buildBoard(snapshot:Snapshot) {
 const result=model.build(snapshot);
 let padding_used=false;
 const rows=result.rows.map(p=>{
  const generated=plans.planFor(p); padding_used ||= generated.padding_used;
  return {slug:p.slug,name:p.name,rank:p.rank,implied_value_usd:p.implied_value_usd,farm_steps:generated.farm_steps,
   category:p.category,chains:p.chains,tvl_usd:p.tvl_usd,change_7d:p.change_7d,listed_at:p.listed_at,
   age_days:p.age_days,watchlist:p.watchlist,tags:p.tags,low_usd:p.low_usd,high_usd:p.high_usd,factors:p.factors,plan:generated.plan};
 });
 return {rows,max_adjust_usd:result.max_adjust_usd,padding_used};
}
export type Board = ReturnType<typeof buildBoard>;
