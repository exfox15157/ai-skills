# Vouchers: wallet → T&C → checkout picker, ranking

Part of the shopee-vn skill — see ../SKILL.md.

## 5. Vouchers — the account's own coupons

Wallet cards are marketing, not the contract. Three layers, each stricter:

1. **Wallet** → `SH.wallet({order:[candidate totals]})` opens the **All** tab and reads page 1 of the page's own
   `get_user_voucher_list` (50 per page). Load the rest as in §0b V11 (End key, mouse wheel when End stalls) →
   `SH.walletPages()` → repeat until `done:true` →
   `SH.walletRead({order})`. Log `COMPLETE: N API pages` = every voucher held; `PARTIAL` = say so (V4). The tab counters
   ("Tất Cả (1951)") add up usage multiples (x3, x5) — the real list is ~350–400 unique vouchers. Shop-tab
   cards from other shops are ignored by the ranking. If it throws `NEEDS_NAVIGATE`, navigate there, BOOT, rerun.
   (History: card-text scrolling stalled at ~280/1 410 before v4.1; mouse-wheel loading needed ~6 screenshots per
   page before 2026-10-22.)
2. **T&C** → **`SH.vouchers()` first** (free): T&C is cached until the voucher's own end date, so a code already
   listed there needs no hop. On a fresh browser profile the localStorage cache is empty — `SH.tcImport(<paste
   data/vouchers.json>)` before reading anything, and `SH.tcExport()` → write new entries back to that file at the
   end of the run. Only then `SH.tc([#indexes of the rest])`, one batched job (each voucher = 1 hop; live 2 of 4
   rendered in-app at a 10 s timeout, now 15 s — a miss still costs the hop, so plan the budget before the wallet step):
   - **The code is free, from `evcode` in the T&C link (base64): `RVhBTVBMRTIy` → `EXAMPLE22`.** `SH.wallet` decodes it
     for every card without a hop, so quote vouchers by code from the start. Live 2026-09-16: 66/69 decoded; the 3 misses
     were Digital-Products cards (`/digital-product/rnweb/…?activityId=`, no `evcode`) — irrelevant to physical goods.
   - **A `LIVE-`/`VIDEO-` code prefix means stream-only** even when neither the card nor the T&C says so — 2026-09-16
     `VIDEO-1000000000000001` read as a plain "Limited 22% off, App only" until the code was decoded. `SH.rank` now
     forces `liveVideoOnly` on those.
   - Platform % vouchers seen live were all `iOS, Android, Meta Web` with the boilerplate "Chỉ áp dụng trên App cho một số
     sản phẩm…" → APP-ONLY + SELECTED-ITEMS; e.g. `EXAMPLEVIP25` 25% cap 3M min 1M, **20 Sept only**, limited qty.
   - `device: iOS, Android, Meta Web` (no plain `Web`) = **APP-ONLY**. Most big Shopee % vouchers are.
   - `valid` may be a single future day (ShopeeVIP 25% cap 3M: 20 Sept only).
   - `một số người bán và sản phẩm nhất định` → **SELECTED-ITEMS**.
   - `details` beats the card when they differ (card "24% cap 2M min 1M" vs "tối đa 1.000.000Đ từ 2.000.000Đ").
   - Live/Video-only vouchers need purchase through that stream/video.
3. **Checkout picker** (definitive, item must be at checkout — ask first) → `await SH.checkoutVouchers()`.
   Real result for a 5.3M RAM kit on web: **125/128 blocked** (`Current device does not meet voucher T&C` /
   `Only applicable to specific products`); only coins cashback applied. ⇒ Web checkout proves the **web** price only.
   - **App-only vouchers:** ask the user for **a screenshot of the Shopee app's "Select Voucher" list at checkout**
     (and the total) and read the image — the only way to confirm app savings. Never spoof mobile UA/device.
   - Estimates from wallet/T&C were right on item price, wrong on voucher savings. Never call voucher savings confirmed until a picker shows them applied.
   - Real app picker, Asgard 5.30M, 2026-09-15 11:15: auto-picked **19% cap 1M min 2M** (−1,000,000₫) + free-ship min 500k.
     Wallet cards ranked higher on web (24% cap 2M min 1M, 23%, 22%) were **not** the picker's best → not valid for
     this item. Dated vouchers ("Use from 20.09") don't appear in the picker before that day.
- Stacking: 1 Shopee voucher + 1 shop voucher + 1 free-ship voucher + Shopee Coins; bank-card promotions
  (e.g. 150k off ≥3M) depend on the card the user selects.

### 5a. Ranking — wallet = what you hold, picker = what applies (v3.2)

`SH.wallet` output is `ranking` from `rankVouchers`, re-runnable without hops or scrolling: `SH.rank({order:[total], proven})`.

| bucket | meaning | how to quote it |
|---|---|---|
| `useNow` | matches a voucher seen in a picker for **this item** (`evidence: picker`) | ✅ with the picker's saving |
| `candidates` | valid today, in the wallet, never seen in a picker | ≈ "may apply" |
| `notForItem` | `blocked` in the picker, other shops' Shop-tab cards, or **`beaten-by-picker`**: bigger than the picker's auto-chosen best on the same day — Shopee's "Lựa chọn tốt nhất" would have taken it, so it doesn't apply | don't list (one line: "N bigger vouchers don't apply to this item") |
| `later` | `Use from:` in the future; `extraVsNow` = saving over today's proven best | "wait to <date> for ≤ +Xk, eligibility unproven" |
| `liveOnly` / `freeShip` | Live/Video-only · free shipping (app cards show no amount) | separate lines |

Rules: expired cards are dropped; `EXPIRES<24h` is tagged; `APP`/`WEB`/`SELECTED` come from T&C already read.
`advice` starts with `UNPROVEN` until a picker is recorded — then the report must say every saving is an estimate.

**Recording a picker** (the user's app screenshot, or `SH.checkoutVouchers()` on web): read the list and pass
```js
SH.rank({order:[5300000], proven:{at:Date.parse('2026-09-15T11:15+07:00'), best:{pct:19,cap:1000000,min:2000000},
  applied:[{pct:18,cap:2200000,min:2000000},{pct:16,cap:2000000,min:1000000}], blocked:[{pct:24,cap:2000000,min:1000000,why:'Chỉ áp dụng cho sản phẩm nhất định'}]}})
```
`best` = the ticked "Lựa chọn tốt nhất" card; `applied` = selectable cards; `blocked` = greyed cards with their reason.
Save it to `data/pickers.json` under `shopid/itemid` so later sessions (another browser, no localStorage) can pass it again;
a picker only proves "beaten" for **the same day** — next day pass it for `useNow`/`blocked` evidence only.

Decision the report gives: **buy now at `useNow[0]`** vs **wait for `later[0]`** (only if `extraVsNow` is worth it,
the voucher isn't limited-quantity-risky, and today's best doesn't expire first — `EXPIRES<24h`). Ask the user to scroll
the picker to the end: greyed rows are the only proof of *why* a big voucher doesn't apply.
