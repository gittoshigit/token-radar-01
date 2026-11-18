import { createRequire } from 'node:module';
import type { Protocol, Snapshot } from './snapshot.ts';
export interface ModelRow extends Protocol {
 rank:number; implied_value_usd:number; age_days:number; watchlist:boolean; tags:string[];
 low_usd:number; high_usd:number;
 factors:{peer_mult:number; peer_pool:string; peer_n:number; mom:number; mat:number; size_term:number};
}
export interface Plan {chain:string; capital_usd:number; fees_usd:number; active_minutes:number; hold_days:number}
export interface ModelResult {rows:ModelRow[];max_adjust_usd:number}
const require=createRequire(import.meta.url);
export const model=require('../dashboard/model.js') as {
 fields:string[]; constants:{version:string}; build(s:Snapshot):ModelResult;
};
export const plans=require('../dashboard/plans.js') as {
 planFor(p:ModelRow):{farm_steps:string[];padding_used:boolean;plan:Plan};
};
