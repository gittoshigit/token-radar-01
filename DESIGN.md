# Token Radar — design (token-radar-01 entry)

Status: design v1, 2026-11-18. Deadline 2026-12-14 19:00 JST (10:00 UTC). Snapshot `as_of` 2026-11-14,
758 protocols, watchlist 40, floor $50,000,000.

**The one idea behind every choice:** the judge can only see the screenshots and the dashboard's
own source (`dashboard/`, capped at 65,536 bytes of text). It never sees `main.ts` or `lib/`. So
**the model and the farm-plan generator live in `dashboard/model.js` and `dashboard/plans.js`**.
`main.ts` loads those same two files with `createRequire` to write `board.json`, and the page runs them
again in the browser on the raw snapshot. The model the judge reads is the model that produced the board,
and the page shows a "reproduced in-page: 198/198 rows" check, so screenshots and code visibly agree
(criterion 1). The house starter keeps its model in `lib/model.ts`, which the judge never sees; we do not.

---

## 1. Value model

### 1.1 What the snapshot gives us (measured 2026-11-18)

| Set | Count |
| --- | --- |
| Protocols | 758 |
| Token-bearing (`gecko_id` or `symbol` non-null) | 416 |
| …of which carry `mcap_usd > 0` | **128** (287 record a token but no market cap) |
| Peer set used (with `mcap_usd`, category not in the excluded six and not `Chain`) | **93** |
| Records no token (pre-token) | 342 (none of them carries an `mcap_usd`) |
| Pre-token and eligible (exclusions in §2) | **198** = 40 watchlist + 20 at or above the floor but off the list + 138 below the floor |

The raw mcap/TVL across all 128: q25 0.047, median 0.214, q75 1.047, min 0.0003, max 400.2. It is
heavy-tailed, so **all statistics are taken in log10 space and on medians or quartiles, never means.**

Raw per-category peer evidence (token-bearing with mcap; ratio = mcap_usd / tvl_usd):

| Category | protocols | pre-token | watchlist | peers w/ mcap | q25 | median | q75 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Dexs | 99 | 26 | 1 | 11 | 0.085 | 0.342 | 1.639 |
| Lending | 75 | 16 | 2 | 15 | 0.037 | 0.132 | 0.725 |
| Risk Curators | 39 | 34 | 12 | **1** | 2.975 | 2.975 | 2.975 |
| Yield | 39 | 16 | 2 | 9 | 0.121 | 0.191 | 0.999 |
| RWA | 33 | 16 | 7 | 9 | 0.140 | 0.275 | 0.414 |
| Onchain Capital Allocator | 29 | 20 | 3 | **2** | 0.009 | 0.012 | 0.016 |
| Derivatives | 26 | 13 | 0 | **2** | 1.769 | 2.162 | 2.555 |
| Yield Aggregator | 23 | 9 | 0 | 4 | 0.046 | 0.151 | 0.308 |
| Basis Trading | 21 | 8 | 2 | 7 | 0.257 | 0.654 | 1.057 |
| CDP | 20 | 10 | 1 | 3 | 0.088 | 0.169 | 0.207 |
| (excluded) Liquid Staking / CEX / Bridge / Canonical Bridge | 78 / 56 / 55 / 32 | | 0 | 9 / 9 / 6 / 8 | | 0.041 / 0.075 / 0.557 / 0.746 | |

What this tells us:
1. The three categories that hold 15 of the 40 watchlist rows (Risk Curators, Onchain Capital
   Allocator, Derivatives) have 1–2 peers each, and those peers point in opposite directions (2.98× vs
   0.012×). A per-category median used alone would be noise, so **shrinkage is the core of the model,
   not a corner case.**
2. **The multiple falls with size.** A regression of log10(ratio) on log10(TVL) over the 93 peers
   gives a slope of −0.546 (Theil–Sen −0.532). By TVL band, the median ratio is 0.567 at $5–20M,
   0.334 at $20–50M, 0.169 at $50–200M, 0.044 at $200M–1B and 0.017 above $1B. One global multiple
   (the starter's 0.25×) values a $2.75B vault curator at $690M and a $10M perp DEX at $2.5M. The peer
   evidence contradicts both.
3. The week was down overall. The median `change_7d` over all 758 is **−8.23%**, and among the peers it is
   −9.06%. A raw `change_7d` would mostly be measuring the market, not the protocol.

### 1.2 Peer statistic (computed at runtime in `model.js`)

Notation: `L(p) = clamp(log10(mcap_usd / tvl_usd), −2.5, 1.5)` (winsorised to 0.003×–31.6×, which
keeps the one 400× Prediction Market peer from dominating anything).

**Step A — size elasticity.** Fit OLS over the peer set: `L = a + b·(log10 TVL − m)`, where `m` = the mean
log10 TVL of the peers (7.556 on this snapshot, about $36M). The fitted `b` is −0.546. We use
`b_used = clamp(b_fit, −0.35, 0)`, so −0.35 here, and implied value scales as TVL^0.65.
*Choice:* we cap the fitted slope instead of using it as is, because the small-TVL end of the peer set is
selection-biased: a token that still trades with $5M of TVL is priced on more than its TVL. Uncapped, the board compresses to a 40× spread
from top to bottom, which reads as broken.

**Step B — size-adjusted residuals.** `r(p) = L(p) − b_used·(log10 TVL(p) − m)`. Global median
`G` = −0.647, q25 −1.096, q75 −0.106.

**Step C — three-level shrinkage (category → family → global).** Families group DefiLlama categories
by business model. It is a static map of *category strings*, never of protocol names:

| Family | Categories |
| --- | --- |
| Trading | Dexs, Derivatives, Options, Synthetics, Interest Rate Derivatives, Prediction Market, OTC Marketplace, Options Vault, NFT Marketplace, Launchpad, Token Locker |
| Credit | Lending, CDP, CDP Manager, Uncollateralized Lending, Collateral Markets, Collateral Management, Dual-Token Stablecoin, Algo-Stables, Stablecoin Issuer, Stablecoin Wrapper, Reserve Currency |
| Vaults | Yield, Yield Aggregator, Risk Curators, Onchain Capital Allocator, Liquidity Manager, Leveraged Farming, Farm, Basis Trading, Indexes, Staking Pool, Restaking |
| Real-world | RWA, CeDeFi, Payments, Crypto Card Issuer, Anchor BTC, Decentralized BTC |
| Other | everything else, including `Chain` and any category unseen by the map |

```
K = 6          // prior strength, in peer-equivalents
MIN_PEERS = 3  // below this a category's own median gets zero weight

level_fam(f) = (n_f · median(r in f) + K · G) / (n_f + K)
level_cat(c) = n_c >= MIN_PEERS
             ? (n_c · median(r in c) + K · level_fam(fam(c))) / (n_c + K)
             : level_fam(fam(c))
```

Values on this snapshot (b_used = −0.35):

| Family | n | median r | shrunk level | q25 off | q75 off |
| --- | ---: | ---: | ---: | ---: | ---: |
| Trading | 19 | −0.045 | −0.190 | −0.86 | +0.25 |
| Credit | 20 | −0.804 | −0.768 | −0.67 | +0.35 |
| Vaults | 32 | −0.744 | −0.729 | −0.46 | +0.53 |
| Real-world | 11 | −0.647 | −0.647 | −0.24 | +0.31 |
| Other | 11 | −0.288 | −0.415 | −0.54 | +0.54 |

So Risk Curators (one peer) and Onchain Capital Allocator (two peers) both take the Vaults level
−0.729. At $50M TVL that is a 0.15× multiple, and at $2.75B it is 0.041×. Derivatives (two peers) takes the
Trading level, about 0.45× at $50M. Lending (15 peers) blends to about 0.11× at $50M.

The peer multiple for a protocol:
`peer_mult(p) = 10^( level_cat(cat(p)) + b_used·(log10 TVL(p) − m) )`

### 1.3 Momentum (from `change_7d`)

```
drift  = median(change_7d over all snapshot protocols, nulls dropped)      // −8.23 here
g      = clamp((change_7d ?? drift) − drift, −40, +60)                      // percentage points
mom(p) = sqrt(1 + g/100)                                                    // range 0.775 … 1.265
```
Why it goes this way: net TVL inflow, relative to that week's market, is the record's only demand
signal. A protocol gaining share is worth more if its record holds. The square root and the clamps are
there because seven days is one noisy week, and a +4,448% outlier on this snapshot is a migration, not
growth. A null counts as the market drift, so the factor is exactly 1.0 (2 eligible rows).

### 1.4 Maturity (from `listed_at` age = days from `listed_at` to `as_of`)

```
age    = listed_at ? max(0, floor((as_of − listed_at) / 86400000)) : median_age_of_eligible   // 418 d here
mat(p) = clamp(0.70 + 0.40 · ln(1 + age/30) / ln(1 + 730/30), 0.70, 1.10)
```
This gives 0.70 at day 0, about 0.88 at 90 days, 1.00 at about 270 days, and the cap of 1.10 at 730 days and after.
Why it goes this way: TVL that has stayed without a token is sticky, earned TVL. TVL in a protocol a
few weeks old is often mercenary points capital that leaves at the token generation event (TGE). The log shape puts the
discount on the first months, where the risk is. The 2-year cap is there because the peer data shows no
premium past it (median ratio by peer age: 0.20 under 1 year, 0.41 at 1–2 years, 0.25 at 2–4 years, 0.19 beyond).
A null takes the eligible set's runtime median age, which counts as neither young nor old (7 eligible rows).

### 1.5 Final formula, rounding, monotonicity

```
raw(p)   = tvl_usd · peer_mult(p) · mom(p) · mat(p)
order    = sort by raw desc, then slug asc (string compare)    // deterministic total order
v[1]     = max(1, round(raw[1]))
v[i]     = max(1, min(round(raw[i]), v[i−1] − 1))              // strictly decreasing
rank[i]  = i
```
The `v[i−1] − 1` step only touches rows whose rounded values collide, and moves them by a few dollars.
`model.js` reports `max_adjust_usd`, and the methodology states it (expected: $0). The values stay as
full-precision integers in `board.json`. The page displays three significant figures.

Prototype run on this snapshot (constants above): top of board Steakhouse Financial $124M, Sentora
Curator $122M, Polymarket International $110M, Gauntlet $89M, Veda $84M. The 198th row is $1.4M, and the lowest
watchlist row ranks 74th. That spread is about 87×, against about 3,000× under the starter's linear model.

### 1.6 Range band

The band takes its quartile offsets from the narrowest pool with at least 8 peers: the category if
n_c ≥ 8, else the family, else global. Offsets are clamped: `lo_off ∈ [−0.90, −0.15]`,
`hi_off ∈ [+0.10, +0.70]`.
```
low  = round(raw · 10^lo_off)     high = round(raw · 10^hi_off)
```
The detail view draws the band on a log axis with the point value marked. The board shows `low–high` in
compact form. Example: a Vaults-family row gets about 0.35×–3.4× of the point value.

### 1.7 Nulls and empty categories
- `category` null: none on this snapshot. The code still maps it to `"Uncategorised"` → family
  Other, and the playbook becomes the generic fallback.
- `change_7d` null → momentum 1.0 (§1.3). `listed_at` null → median age (§1.4). Both are shown in the
  detail view as "not reported, neutral factor used".
- A category with no live peers (e.g. Risk Curators effectively, Farm, Insurance, CeDeFi) takes its
  family level. A family with no peers takes `G`. If the whole peer set has fewer than 10 rows, the model
  falls back to `b_used = −0.35` and `G = log10(0.25)` and says so on the page. That cannot happen on this snapshot, but the code
  does not assume the snapshot.

### 1.8 Separating trading tokens from the ones still to come (criterion 2)
- The board ranks only protocols that **record no token**. The 416 token-bearing protocols appear only in
  a separate "Trading tokens" tab: the 128 with a market cap are listed as the peer evidence, with
  their own mcap/TVL, and are never ranked by implied value.
- **Family-token flag:** a pre-token row whose name's lead word (≥3 chars, lowercase, split on
  space/-/.) matches the lead word of a token-bearing protocol's name is flagged "family token trades:
  SYMBOL". There are 7 on this snapshot, 1 of them on the watchlist. *Choice:* we flag and filter instead of discounting, because
  implied value is a claim about what a launch would be worth, not about whether one happens.
- The 20 pre-token rows at or above the floor but off the watchlist get the tag "above floor · off
  list". Wording: "the house rule also drops products DefiLlama links to a parent protocol, a field
  this snapshot does not carry".

### 1.9 Constants block (exported from `model.js`, rendered verbatim in the methodology)
`{ winsor:[−2.5,1.5], slope_cap:[−0.35,0], K:6, min_peers:3, band_pool_min:8, band_lo:[−0.9,−0.15],
band_hi:[0.1,0.7], mom_clamp:[−40,60], mom_power:0.5, mat_floor:0.70, mat_span:0.40, mat_tau_days:30,
mat_full_days:730, mat_cap:1.10, version:"peer-1" }`

---

## 2. Board composition

Eligibility applies the house's own rule to the records-no-token set. "Records no token" means
`gecko_id === null && symbol === null` (mcap is null for all of them anyway):
- category ∉ {Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX};
- name !~ `/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/` (version marker);
- name !~ `/\b(wrapped|staked|staking)\b/i`;
- name !~ `/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/`. This is the rule's exchange list
  of brand prefixes, copied from the published rule, not a list of protocols we rate.
- then every watchlist slug is forced in (union), whatever the filters say.

All 40 watchlist slugs pass our filter on this snapshot (verified), so union = filter = **198 rows**.

**Target: every eligible protocol, so 198 on this snapshot. No arbitrary cut.** We considered
cutting to the top N by model rank and rejected it. The eligible set is the whole defensible pre-token universe at
≥$5M. Each row has a real parameterised plan, and 198 rows with all fields stay small in `board.json`
(about 400 KB). If a future snapshot left fewer than 100 eligible rows, the board would top up from the
excluded pre-token rows by model rank, tagged "excluded category". If it left more than 1,500, it would cut by
model rank. Neither applies here.

`board.json` row: the gate fields (`slug, name, rank, implied_value_usd, farm_steps`) plus `category, chains,
tvl_usd, change_7d, listed_at, age_days, watchlist, tags[], low_usd, high_usd, factors{peer_mult,
peer_pool, peer_n, mom, mat, size_term}, plan{chain, capital_usd, fees_usd, active_minutes, hold_days}`.

---

## 3. Farm plan generation (`dashboard/plans.js`)

### 3.1 Parameters derived from the record
- **chain**: the cheapest of the protocol's `chains` in the cost table (unknown chains count as the
  default row). The step text adds "also on: X, Y" when there are other chains. *Choice:* we pick the cheapest chain, not
  `chains[0]`, because the snapshot does not say which chain holds the TVL, and fees are the cost we can state.
- **capital** by TVL tier: ≥$1B → $1,000; $200M–1B → $500; $50–200M → $300; $20–50M → $200;
  <$20M → $100. A larger pool dilutes a small position. A smaller, younger pool is a riskier place for money.
- **hold_days** by age: <90 d → 90; 90–365 d → 60; >365 d → 45; null → 60. Young programs run
  longer points seasons.
- **TVL tier word** (for the text): "deep" (≥$500M), "mid-size" ($50–500M), "thin" (<$50M). A thin pool
  gets an explicit slippage check step.

### 3.2 Chain-cost assumption table (shown on the page as "Assumptions, Nov 2026 typical")

| Chain(s) | one tx (approve/deposit/swap) | bridge in from a CEX or L2 | bridge time |
| --- | --- | --- | --- |
| Ethereum | $1.50–6.00 (use $3) | $1–3 | 5–15 min |
| Base, Arbitrum, Optimism, Unichain, Katana, Plume Mainnet, Robinhood Chain, Arc | $0.02–0.10 ($0.05) | $0.50–2 | 2–10 min |
| Solana | $0.001–0.02 ($0.01) | $0.50–2 | 2–10 min |
| Binance (BNB Chain) | $0.05–0.30 ($0.15) | $0.50–1 | 2–5 min |
| Avalanche, Polygon, Sonic, Berachain, Monad, Flare, Plasma, Hyperliquid L1 | $0.01–0.15 ($0.05) | $0.50–2 | 2–15 min |
| Bitcoin | $0.50–3.00 ($1.50) | n/a (native BTC) | 10–60 min |
| default (any other) | $0.10–0.50 ($0.25) | $1–3 | 5–20 min |

Perps venue fees are stated separately: taker 0.035–0.06% and maker 0–0.02% of notional (assumption). For DEX
swaps, 0.05–0.30% of notional.

### 3.3 Step format
Each step is `{text, cost, time}`, rendered as `"<text> Cost: <cost>. Time: <time>."`. A step is trimmed to
≤600 and padded to ≥20 characters, but the self-check *fails* the build if padding is ever needed, so padding
is never shipped. Plan totals = Σ fee estimates and Σ active minutes, plus hold days. They are shown
in the detail header and as the board's "Plan cost" column (sortable).

### 3.4 Playbooks (`{N}`=name, `{C}`=chain, `{K}`=capital, `{H}`=hold_days, `{g}`=tx cost)

Every playbook opens with **S0 Fund**: "Create a fresh wallet used only for {N}. Withdraw {K} USDC to {C}
from an exchange or bridge it in, and keep $5 of the gas token." Cost: the bridge fee + {g}, time 15 min.
It closes with **SZ Exit and log**: "Before withdrawing, check {N}'s own points or rewards page from the link
inside its app, record the wallet, dates and every transaction hash in a log, then withdraw." Cost: 2×{g},
time 15 min. The middle steps are per category:

- **Dexs**: (1) Swap half of {K} into the pool's other asset on {N}: 0.05–0.3% fee + {g}, 5 min. (2) Add
  liquidity to {N}'s deepest stable or major pair. For a concentrated pool, set a ±5% range: 2×{g} (approve and
  deposit), 10 min. (3) Make 3 swaps of $20–50 a week through {N}'s router so trading activity is recorded: about
  $0.30 of fees + 3×{g} a week, 10 min/week. (4) Check the range twice a week and re-centre it when it is out
  of range: {g} each time, 5 min. (5) Hold {H} days.
- **Lending**: (1) Supply {K} USDC to {N}'s main market on {C}: 2×{g}, 10 min. (2) Borrow 25% of
  that in a different stablecoin and keep the health factor above 2.0: {g}, 5 min. (3) Repay and re-borrow once a
  week so you are active in more than one snapshot: 2×{g}/week, 10 min/week. (4) Set a price alert at a health factor of 1.5
  (or ±15% on volatile collateral): free, 5 min. (5) Hold {H} days, then repay in full before you withdraw.
- **Yield / Yield Aggregator / Basis Trading**: (1) Read the vault page: strategy, withdrawal delay,
  performance fee. Note them in the log: free, 15 min. (2) Deposit $10 as a test and withdraw it the same day to
  check the exit path: 4×{g}, 20 min. (3) Deposit {K}: 2×{g}, 5 min. (4) Each week, compare the vault's share
  price with the day you deposited so a loss shows early: free, 5 min/week. (5) Hold {H} days. Ask for the withdrawal early if the exit
  has a queue.
- **Risk Curators**: (1) Open {N}'s curated USDC (or ETH) vault list on {C} and pick the vault with the largest
  deposits, the vault where the curator's own TVL sits: free, 10 min. (2) Check that vault's market exposures and its
  liquid share: free, 10 min. (3) Deposit $10 as a test, withdraw it, then deposit {K}: 4×{g}, 20 min. (4) Each week, check the
  vault's allocation for new markets that are not on the original list: free, 5 min/week. (5) Hold {H} days.
- **Onchain Capital Allocator**: like Risk Curators, plus an explicit lock or withdrawal-queue step:
  "find the withdrawal delay on the vault page. If it is longer than 7 days, cut the deposit to half of
  {K}". Steps: read the strategy, test deposit, deposit, weekly share-price check, hold {H} days.
- **RWA**: (1) Complete {N}'s onboarding or KYC if the product asks for it: free, 1–3 days. (2) Mint or subscribe
  {K} of its tokenised asset on {C}, minding the minimum ticket: 2×{g} + the issuer fee shown at mint, 15 min.
  (3) Note the redemption window and its notice period: free, 5 min. (4) Hold the asset {H} days. Check the stated NAV
  each week: free, 5 min/week. (5) Redeem through the issuer's window, not a thin DEX pool: {g}, 1–5 days.
- **Perps** (Derivatives whose name matches `/perp/i`; 6 of the 13 pre-token Derivatives rows):
  (1) Deposit {K} USDC as margin on {N}: 2×{g}, 10 min. (2) Place maker limit orders on one major
  pair at 2× leverage at most, and aim for about 5×{K} of weekly volume: about 0.02% × volume, so $1 a week per $1,000 of
  capital, 15 min/week. (3) Close each position the same day so funding does not pile up: taker fee
  0.05% on close, 5 min. (4) Keep at least 50% of margin unused, and never hold through a funding spike: free.
  (5) Hold the margin account active {H} days.
- **Derivatives (non-perp)**: deposit margin, then buy one small option or structured position (≤10% of
  {K}), roll it at expiry once a week, and hold the account {H} days. Each step is costed as above.
- **CDP**: (1) Deposit {K} of the accepted collateral on {N}: 2×{g}, 10 min. (2) Mint the stablecoin at
  a collateral ratio of 250% or more: {g}, 5 min. (3) Put the minted stablecoin in {N}'s stability or savings
  pool if it offers one: 2×{g}, 5 min. (4) Set a liquidation-price alert 20% above liquidation: free, 5 min. (5) Hold {H} days, then
  repay and close.
- **Chain**: bridge in, make 3 transactions a week on the chain's native DEX or lending app, use one
  app deployed only on {N}, and hold {H} days.
- **Generic fallback** (any other category): the {N} app on {C}: test deposit, deposit {K}, one
  qualifying action a week, a weekly position check, hold {H} days.

Every playbook has 7 steps including S0 and SZ, so 7 strings a row, which sits within 3–12. Thin pools get an extra
"quote check: if the price impact on {K} is above 0.5%, halve the size" step (8 strings). The language
rules hold in every template: "while {N} records no token", never "has no token". There are no slogans: each
step has a verb, an amount, a place and a cost.

---

## 4. Dashboard

### 4.1 Views (one page, hash-routed so screenshots are reproducible by URL)
- **Board** (`#/`): a header strip with the counts "198 ranked · 40/40 watchlist covered · 416 trading
  tokens kept off the board · model peer-1 · snapshot 2026-11-14". It has a model-check badge, "198/198 values
  reproduced in-page", computed live by comparing `RadarModel.build(snapshot)` with the board values
  (tolerance $1). Columns, all sortable (click the header, click again to reverse, with an aria-sort indicator):
  Rank · Protocol (with watchlist / above-floor / family-token badges) · Category · Chains (first + "+n") · TVL ·
  7d · Age · Peer × · Implied value · Range · Plan cost. A small bar inside the implied-value cell gives
  scale on a log axis.
- **Filters** (`#/?cat=RWA&chain=Base&tvl=50-200&wl=1&q=…`): a category select (with counts), a chain
  select (with counts), TVL band chips (5–20M, 20–50M, 50–200M, 200M–1B, 1B+), a watchlist-only toggle, a
  "hide family-token rows" toggle, and text search on name, slug and category. A results line reads "37 of 198 rows".
- **Detail** (`#/p/<slug>`): a side panel at 1440 px. It shows (a) the value breakdown as a waterfall: TVL → ×
  peer multiple (pool, n, level) → × momentum (Δ vs drift) → × maturity (age) → implied; (b) the range band
  on a log axis; (c) the peer strip: every peer in the protocol's pool as a dot at its mcap/TVL, with
  this protocol's implied multiple drawn as a ring, and the 5 peers nearest in TVL listed with name, TVL, mcap and ×;
  (d) the farm plan as numbered steps with cost/time chips and totals; (e) record facts: slug, category,
  chains, TVL, change_7d, listed_at, age, "records no token: gecko_id and symbol are null", watchlist.
- **Trading tokens** (`#/live`): the 128 token-bearing peers by mcap, with their ratio and pool. This is the
  evidence table, and nothing in it is ranked by implied value.
- **Methodology** (`#/method`): §1 in plain language, with the live constants table and peer-pool
  table generated from `RadarModel` (so the text cannot drift from the code), the chain-cost assumptions, and
  the language note ("implied value is what a launch would be worth if the record stayed as it is. It is not
  a prediction that a token will be issued"). It also carries a short "Note to the judge" paragraph that
  names `buildPeers`, `impliedValue` and `planFor` as the functions to read.

### 4.2 Design language
- Palette (dark "radar"): bg `#0A0F13`, panel `#10181E`, raised `#16212A`, line `#1F2C36`, text
  `#D8E4EA`, muted `#7E929F`, accent radar-green `#3DDC97` (implied value, primary), cyan `#4CC9F0`
  (peer and range marks), amber `#F2B84B` (watchlist badge), up `#3DDC97`, down `#FF6B6B`, violet `#A78BFA`
  (family-token flag). The contrast of text on the bg is at least 4.5:1 for every text colour (muted on bg is about 5.9:1).
- Type: `system-ui, -apple-system, "Segoe UI", Roboto, "DejaVu Sans", sans-serif`. Numbers use
  `ui-monospace, "SFMono-Regular", Menlo, "DejaVu Sans Mono", monospace` with `tabular-nums`. Scale
  12 / 13 / 15 / 18 / 24 / 32 px, weights 400/600. Table rows are 32 px tall, so about 22 rows show in a 900 px shot.
- Spacing is on a 4 px grid (4, 8, 12, 16, 24, 32), with an 8 px radius on panels and 4 px on chips. The header logo is a CSS-only radar
  sweep (a conic-gradient circle). There are no images, no web fonts and no framework.

### 4.3 File plan and byte budgets (all in `dashboard/`, total ≤ 60 KB, with a hard check in self-check)

| File | Owns | Budget |
| --- | --- | ---: |
| `index.html` | shell, landmarks, `<script src="../data.js">`, then model, plans, app | 2.5 KB |
| `app.css` | tokens (CSS vars), layout, table, panel, chips, charts | 10 KB |
| `model.js` | eligibility, peers, shrinkage, factors, monotonic board, band, constants (UMD) | 12 KB |
| `plans.js` | cost table, parameters, playbooks, step formatting, totals (UMD) | 13 KB |
| `app.js` | state/hash router, filters, sort, render board/detail/live/method, SVG charts, self-check badge | 22 KB |
| **Total** | | **59.5 KB** |

UMD footer for the two shared files: `if (typeof module === 'object' && module.exports) module.exports = API; else
root.RadarModel = API;`. Both are plain ES2020 scripts (no `import`/`export` syntax), so Node loads them as
CommonJS via `createRequire` and the browser loads them as classic scripts. That works over `file://`,
where module scripts would be blocked.

### 4.4 Data file (`/output/data.js`, beside the page, outside the dossier text)
`window.RADAR = {as_of, source, floor_usd, watchlist:[slug…], protocols:[[slug,name,category,chains,
tvl_usd,change_7d,mcap_usd,listed_at,gecko_id,symbol]…758], board:[[slug,rank,implied_value_usd]…198],
built:{model_version, rows, max_adjust_usd}};`. It holds raw fields only, and the page recomputes everything else with the same
code. It is a positional tuple form to keep it near 130 KB. It is outside `dashboard/`, so it costs nothing in the
dossier.

---

## 5. Program structure

```
main.ts                  CLI args (--input, --output, MAKEFUN_OUTPUT_DIR), orchestration, exit codes
lib/snapshot.ts          parseSnapshot: strict shape check, the ten fields, typed
lib/shared.ts            createRequire('../dashboard/model.js' | 'plans.js'), typed wrappers
lib/board.ts             rows = model.build(snapshot) + plans.planFor(row) → board.json shape
lib/emit.ts              stable JSON writer (fixed key order), data.js writer, copyDir (sorted names)
lib/selfcheck.ts         the seven gate rows below, run on the written /output before the dossier
vendor/makefun-board.ts  kit library, unchanged (buildDossier)
dashboard/               the five files of §4.3
screenshots/             1-board.png, 2-detail.png, 3-filtered.png
tools/shoot.mjs          screenshot driver (dev only; not run in the sandbox)
```
`buildDossier(out, {text_max_bytes:65536, screenshots:{max:4,max_bytes:524288},
dashboard:{max_files:400,max_bytes:4194304}})` is written last, exactly as the starter does it.

**Determinism.** Nothing reads the clock (age uses `as_of` only), and nothing uses `Math.random`. Every sort has a total
order with a slug tiebreak and plain `<` string compare, not `localeCompare`. The program iterates over arrays only, never
object key enumeration for output. Directory copies sort `readdirSync` results. Floats are rounded only at the
emit boundary (factors to 4 dp, values to integers). It writes no timestamps, absolute paths or environment
values into output. Verification: run twice into `out1/` and `out2/` and run `diff -r` with zero lines of output, on every build.

**Self-check (`lib/selfcheck.ts`, fails the run with a named row), one-to-one with the gate:**

| Gate row | Our check |
| --- | --- |
| dashboard_files | index.html plus ≥1 .css and ≥1 .js; ≤400 files and ≤4 MiB; every name matches `^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$`, with no dot-dirs; scan every attribute value, `<style>` body, CSS file and JS `import`/`export from`/`require(`/`import(` specifier for `https?://`. Also checks our own budget: total ≤60 KB |
| board_file | object with `rows`, 100–4,000 rows, ≤8 MiB; each slug exists in the snapshot, is unique and has no whitespace; name non-empty; rank a positive integer; value a safe integer in 1..1e14 |
| sorted_by_value | the ranks sorted are exactly 1..N; values do not rise by rank; first ≠ last; we also assert strictly decreasing |
| coverage | all 40 watchlist slugs are present |
| farm_steps | 3–12 strings each, trimmed length 20–600; we also assert no padding was used and every step contains "Cost:" and "Time:" |
| screenshots | 3 files, valid names, each ≤350 KB (our cap, under the 512 KiB rule), PNG/JPEG magic plus a full parse of the IHDR or SOF dimensions: long ≤1440, short ≥800, PNG ending at IEND or JPEG ending at FFD9 |
| dossier_matches | rebuild with `buildDossier` into memory and compare bytes with the written file; ≤1.5 MiB; assert that the text part carries no "lines are not shown" truncation line |

Before every submission, also run `node <kit>/cli/makefun.mjs check --kit <kit> --repo . --transcripts …`.

---

## 6. Risks and checkpoints

**Screenshots.** Chromium is at `/opt/meta-chromium/chrome` on this box (no system Chrome; PIL 10.2
is available). `tools/shoot.mjs` runs `chrome --headless=new --disable-gpu --hide-scrollbars
--window-size=1440,960 --screenshot=… file://<out>/dashboard/index.html#<route>` for `#/`,
`#/p/<rank-1 watchlist slug>` (chosen by rank, not by name) and `#/?cat=Risk%20Curators&wl=1`. The
shots must be taken from a fresh `out/` built by `main.ts`, so the numbers in them match the board.
Size control: a flat dark UI PNG at 1440×960 should come out at 120–300 KB. If one is over 350 KB, re-encode it with PIL
(`optimize=True`), then fall back to JPEG q=90 (4:4:4). Verify fonts with `fc-list`. DejaVu is the
expected fallback, and the font stacks name it. Keep 1440×960 (long side 1440, short 960 ≥ 800).
Risk: the page could render before data.js loads. The scripts are synchronous classic scripts, so this cannot happen. Add a
`--virtual-time-budget=3000` flag anyway.

**Transcript gate.** All code is written in this repository's agent sessions, with no copying from the
starter except `vendor/makefun-board.ts`, which is 373 lines against our expected 1,500+ authored lines and so well above 30%. Build
in at least 3 visible iterations, each written and then revised by later messages:
(1) model.js + main.ts skeleton → first valid board; (2) plans.js + app.js board view; (3) detail,
filters and methodology, then visual polish after looking at screenshots. `main.ts` itself is edited in at least 2
messages. Each session has at least 5 text-bearing assistant turns. After the first steps, run `bundle --dry-run` to confirm
the sessions are found. Check modelUsage after delegated runs (per AGENTS.md, the advisor model can
be invoked). The repository also needs the README badges and the GitHub About settings (repo_readme/repo_about).

**Model risks.** (a) The judge may doubt the sub-linear TVL scaling. The methodology shows the TVL-band
medians table as evidence, and the detail waterfall shows the size term. (b) Above-floor off-list rows with
famous names may look wrong at the top. They carry the tag and its explanation, and the watchlist-only filter
is one click away. If v1 judge reasons complain about them, the fallback is to rank them but render them in a
collapsed "off-list" group. (c) A single-peer category could never swing a value, because MIN_PEERS=3 and K=6 prevent it.

**Submission budget (10 total, at most 5 per UTC day, the last one counts).**
- v1 by 2026-11-21: the full model, board, detail and filters, with plain styling. Purpose: a dev rating against the
  four house anchors, and the judge's 600-character reasons, read for what they fault.
- v2 about 2026-11-26: fixes from the v1 reasons, plus the full visual pass and charts.
- v3–v5 through 2026-12-08: one change per submission, each justified by the reasons. Never resubmit an unchanged
  dossier, since a byte-identical one shares its rate.
- Hold 3 submissions in reserve for 2026-12-09 to 12-13. The final one must be a known-good build, rechecked with `makefun
  check` and the double-run diff. Do not submit on the last day without that.
