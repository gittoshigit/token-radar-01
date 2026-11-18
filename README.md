# Token Radar

A token launch radar over the sealed DefiLlama snapshot, built for make.fun's “Build the best token launch radar” bounty. The snapshot dated 2026-11-14 yields 198 ranked protocols and covers all 40 watchlist entries. Implied launch values describe the snapshot; they do not promise a token launch.

Run with Node.js supporting native TypeScript (Node 22.18+):

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Open `out/dashboard/index.html` directly in a browser. The build writes `board.json`, `data.js`, the dashboard, screenshots and `dossier.json`, and prints seven self-check results. No dependencies or dashboard network requests are required.

The model in five lines:

1. Select eligible protocols recording neither a symbol nor a Gecko token ID, including every watchlist slug.
2. Estimate peer market-cap/TVL ratios in log space and adjust for size with a capped slope.
3. Shrink category evidence toward business-family and global medians to handle sparse peers.
4. Apply market-relative seven-day momentum and snapshot-relative maturity, then rank deterministic integer values.
5. Derive uncertainty bands from peer quartiles and generate category plans with chain fees, capital, active time and hold days.

The dashboard offers a sortable board with category, chain, TVL, watchlist and text filters; protocol details with value waterfall, peer evidence and numbered plans; a separate trading-token evidence table; and methodology with live constants and fee assumptions. The browser reproduces the board using the same model and plan code as the CLI.

To reproduce the three screenshots, set `RADAR_SHOT_HOST` (SSH target), `RADAR_SHOT_DIR` (dedicated absolute remote directory), and `RADAR_CHROME` (absolute remote Chrome executable). Optionally set `RADAR_SSH_OPTS` for SSH/scp options, then run:

```sh
node tools/shoot.mjs --input <snapshot.json>
```

This developer tool builds fresh output, copies it to the remote machine, captures three 1440×960 views and verifies the returned PNGs in `screenshots/`. Run the CLI again afterward to include those captures in the dossier. The grading sandbox never runs the screenshot tool.

Licensed under the [MIT License](LICENSE). See [DESIGN.md](DESIGN.md) for the complete model and byte budgets.
