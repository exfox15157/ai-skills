# Known constraints and their status

Part of the shopee-vn skill — see ../SKILL.md.

## 7. Constraints — status in v3

| # | constraint | v3 status |
|---|---|---|
| 1 | 45 s `javascript_tool` limit | **Fixed**: background jobs + in-page `SH.wait` (40 s) returns progress/result in one call |
| 2 | Snippets pasted in full; reload wipes them | **Fixed**: library self-stores in localStorage, BOOT one-liner restores it; commands are one-liners |
| 3 | Direct API = one call per page load | **Can't fix safely** — capture via route change; results cached so hops aren't repeated |
| 4 | ≤60 items/page, hops that don't refire | **Works live** (2026-09-15: 15/15 `S`, 0 `MISS`, 550 listings from 2 terms × 2 sorts × 2 pages + 7 part numbers). Category/Mall filters: click the filter once in the search sidebar, read `location.search`, save with `SH.config({urlParams})` **[param names not yet recorded — not reached in the first run]** |
| 5 | Huge raw payloads | **Fixed**: summarized in-page, raw JSON dropped, outputs capped at 6–7 k chars |
| 6 | Wallet lazy-load (~260/1 433) | **Still open**: tabs + in-app route work live; v3.1 card finder fixed (v3.0 found 0); scrolling stalls at ~280/1 410 → logged as `PARTIAL`. Next idea: find the list's own scroll container / "load more" on a real wallet page |
| 7 | App-only vouchers | **Workaround**: user screenshot of the app picker. Emulator not recommended (Shopee flags emulators; account risk) |
| 8 | Consent per cart step | **Fixed by process**: pre-approved test-checkout run (§6) |
| 9 | Specs missing from listings | **Mostly fixed**: part-number decoder (speed/CL/kit offline); voltage/height cached in `data/specs.json` |
| 10 | Bot pacing | **Fixed**: 5–7 s jittered dwell, hop budget 45/h · 200/day persisted, any `90309999`/captcha → job stops + 30 min cooldown. **45/h is our own throttle, not Shopee's** (`sh.js:433` default) — Shopee has never quoted a rate, so there is no external window to discover. The window is a **rolling 60 min** (`sh.js:470` `now - t < 3.6e6`), **not a clock hour**: budget frees continuously, there is no top-of-the-hour cliff, so never tell the user to "wait for the hour to reset". Live 2026-09-16: `/h` read 39 → 25 → 17 while `/day` went 39 → 44. Check real headroom with `SH.db().hops.filter(t=>Date.now()-t<3.6e6).length` before saying a run is out of budget. Evidence on the real ceiling: 45 hops in one hour (run 1) and 26 in one burst (run 3) drew **0** captcha and **0** `90309999` — 45 is untested, not proven. Raising `perHour` is the **user's** call (it is their account's risk score); `sh.js:471` says so too. |
| 11 | Cross-border shops, ads | **Fixed**: overseas dropped pre-hop; ads flagged; bait scoring (official shops exempt from catalog-size rule) |
| 12 | No Mall flag / price history | **Partly**: on PDP `MALL` from `get_pc` `is_official_shop` (seen live: AGI Technology Vietnam). Search stage has no `is_official_shop`; v3.1 reads `seller_flag.name` — only `PREFERRED`/`PREFERRED_PLUS` seen so far, the Mall value is a guess (`OFFICIAL|MALL`). Price history keyed by `model_id` since 3.1 (3.0 stored `#undefined`) |
