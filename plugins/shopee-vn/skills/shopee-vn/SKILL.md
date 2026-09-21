---
name: shopee-vn
description: Shop on Shopee Vietnam (shopee.vn) as the user's own logged-in account in a real browser — sweep hundreds of listings, re-price the exact variant, expose listings whose title lies (used stock, bait variants, wrong part number, missing kit option), read reviews, cart and orders, and work out which of the account's vouchers really apply (wallet → T&C → checkout picker) to give the true checkout price. Use when the user wants to find, compare or buy something on Shopee, "tìm trên shopee", VN prices, "mã giảm giá / voucher của tôi", which coupon to use, their cart/orders, or wants an item put in the cart / taken to checkout.
compatibility: Designed for Claude Code with the Claude in Chrome extension (Chrome or Edge); needs a shopee.vn tab the user is logged into, and Node.js 18+ for the report linter and tests.
license: MIT
---

# Shopee VN — live-browser shopping (tested on Windows, Chrome/Edge)

Everything runs as page
JavaScript inside a browser **the user logged into themselves**. Facts marked (2026-09-15) were seen live;
the v3 library had its first live run the same day (§8); items still marked **[unverified live]** passed
offline tests only — confirm on next use and update this file.

## 0. HARD RULES for every report — checked by a tool, not by memory

These travel with the skill folder (any machine, any session). A report that breaks one is not finished.

1. **Every "Giá mua ngay" / "Buy now price" cell = `**App: …**` first, then `<br>**Web: …**`.** Both lines, always, even
   when the numbers are equal (then say no voucher layer differs). App line = picker-proven vouchers + app-only perks
   (ShopeeVIP free ship, app-only VIP %); Web line = only vouchers not tagged `device:'app'`. `SH.report()` (v3.9)
   already prints each row as `App: … || Web: …` - copy both halves, never just one.
2. **Before sending, lint the draft:** write the report to the scratchpad, then
   `node <this skill's folder>/tools/lint-report.js <draft.md>` must print `OK`. On `FAIL`, fix the listed rows and
   re-run. Send only the linted text. (Why: 2026-09-17 three reports went out with one number per cell although
   `report-template.md` required App + Web; the rule was written down but nothing checked it.)
3. "Một số sản phẩm" vouchers stay out of every price until a picker applied them (§3 step 5).
4. When recording vouchers use `SH.config({shopee:[{pct,cap,min,code,device:'app'|'both'}], shipVouchers:[{cap,min,device}]})`
   - `device:'app'` is what keeps an app-only card off the Web line.

## Reference files

Sections cited as §2, §4, §5, §5a, §5b, §7 and §8 live in `references/` — read the one you need, when you need it:

- 2 → [references/api-notes.md](references/api-notes.md) — Shopee data access — what works, payload shapes
- 4 → [references/listing-traps.md](references/listing-traps.md) — Listing traps and the flags that catch them
- 5 → [references/vouchers.md](references/vouchers.md) — Vouchers: wallet → T&C → checkout picker, ranking
- 7 → [references/constraints.md](references/constraints.md) — Known constraints and their status
- 8 → [references/field-notes.md](references/field-notes.md) — Field notes from live runs (numbered, cited as §8.N)

## 1. Setup — one library, one-liners

- **Browser — Claude in Chrome FIRST, the in-app pane only as a fallback** (rule 2026-09-21). Decide this
  **before BOOT**, in this order:
  1. **Check.** One ToolSearch for the core set (`select:mcp__claude-in-chrome__list_connected_browsers,…tabs_context_mcp,
     …navigate,…javascript_tool,…computer,…find`). If the only Chrome tool listed is `enable__mcp__claude-in-chrome`,
     call it first. Then `list_connected_browsers`: **non-empty → use Claude in Chrome**, done.
  2. **Not installed / not connected → encourage the install, once per session**, before touching the pane. In the
     user's language, give the 3–4 benefits from the table below that matter most (captcha, already logged in,
     no re-paste) plus the setup steps, and say what it costs (it acts in their own browser). Setup steps:
     install the **Claude** extension ("Claude in Chrome") from the Chrome Web Store — **it works in Microsoft Edge
     too** (verified: the 2026-09-21 run was Edge 153); sign in with **the same Claude account** as this app; keep that
     browser open during the run. Tools still missing → CLI: `/chrome` → Reconnect extension; otherwise start a new
     session. Example opener (Vietnamese user): *"Mình khuyên bạn cài Claude in Chrome trước khi chạy: trình duyệt
     tích hợp của Claude bị Shopee chặn bằng trang xác minh ngay lần tải đầu, còn Chrome/Edge thật của bạn thì
     không — và bạn đã đăng nhập Shopee sẵn ở đó."*
  3. **Fall back to the pane only if the user declines or cannot install now — ask first**, and warn up front that
     it tends to land on `/verify/captcha` and to lose its login and library between sessions.

  **Why Claude in Chrome beats the default pane** — measured, same account and delivery address, 2026-09-15 → 09-21:

  | | **Claude in Chrome** (user's real Chrome/Edge) | **In-app pane** (`mcp__Claude_Browser__*`) |
  |---|---|---|
  | Shopee anti-bot | 20 hops, peak **13 in 112 s (≈418/h)**, **no captcha, no `90309999`** (§8.52) | **`/verify/captcha` on the first load at 0 hops** — happened again 2026-09-21 |
  | Window size (`outerWidth/Height`) | the real screen size | **0 × 0** — the classic embedded-webview/headless signature |
  | User-Agent | plain `Chrome/153 … Edg/153` | contains **`Claude/2.2553.1`** — announces a non-browser client |
  | Shopee login | the user's existing session — GATE 0 passed at once | started **logged out in 3 of 5 runs** → a login pause each time |
  | Library paste (~40 k tokens) | once per profile — **verified**: survived a tab-group reset (2026-09-21, `restored`) | **re-pasted in 3 of 5 runs** — pane profile wiped |
  | Price history for "Giá mua sau" (§3d) | keeps accumulating in the user's profile — the only way the verdict can ever say more than "chưa đủ" | wiped with the profile, so the series keeps restarting from day 1 |
  | Hop throttle | 45/h proved conservative (9× ran clean) | no rate is safe — it blocked at 0 |
  | Buy Now | auto-ticks the new cart row | did not |
  | Cached work between days | localStorage stays with the user's profile | lost whenever the pane profile resets |

  **Costs — state these too, never oversell:**
  - It **acts in the user's real browser**, in new tabs next to theirs, with their real sign-ins. If Shopee ever did
    block it, the block lands on the profile they actually shop with, not a throwaway one.
  - First use needs **the user to allow shopee.vn** in the extension; that permission is theirs to grant.
  - The wallet read loaded **fewer cards** there (83 / 1 837 vs 354 / 1 950 in the pane, §8.60).
  - In-app route changes **fire the API but do not re-render the product view** → `spec`/`desc` empty on every PDP,
    and no Buy Now button; use a real `navigate` for the checkout flow (§8.54).
  - `XMLHttpRequest` is patched there too (by the extension) — that tamper signal does not go away (§8.53).
  - Tool quirks: an **async IIFE returns `{}`** — write top-level `await` and end on `JSON.stringify(...)`; results
    that look like cookie/query-string data come back `[BLOCKED: Cookie/query string data]` — keep outputs narrow and
    strip `?&=` from free text.

  **Using each browser:**
  - **Claude in Chrome** (`mcp__claude-in-chrome__*`): `tabs_context_mcp` (createIfEmpty) → work in the group's own
    tab or `tabs_create_mcp`, never the user's tabs → `navigate` to `https://shopee.vn/`. Same `javascript_tool` /
    `find` / `computer` / `browser_batch` names as below; every call needs `tabId`. Close tabs you opened before
    finishing unless the user wants them.
  - **In-app pane (fallback)** (`mcp__Claude_Browser__*`) — `preview_start {url:"https://shopee.vn/buyer/login"}`.
    `javascript_exec` accepts top-level `await` and async IIFEs; a 40 s `SH.wait` returns normally. **Check
    `location.href` right after opening**; `/verify/` → the user solves the puzzle (never Claude), then continue.
  - **GATE 0 — logged in before anything else. No login, no run.** Every number this skill produces is account-specific
    (see "Why the price is not one number" below), so a logged-out sweep does not give a rougher answer — it gives a
    *wrong* one, with no shipping fee and no voucher layer. Run the session check below **before** the sweep, never after.
    No `username` back → **stop, tell the user, wait for them to log in themselves.** Do not sweep "in the meantime",
    do not fall back to quoting card prices, do not promise to "adjust later" — the whole ranking would have to be redone.
    **The user logs in. Never type passwords, OTPs, QR, card or ShopeePay data.** A CAPTCHA/login page = pause and let the user handle it.
- After any real page load run **BOOT** (≈40 tokens):
  ```js
  window.SH ? SH.v : (localStorage.__shlib ? (0, eval)(localStorage.__shlib) : 'NEED_PASTE')
  ```
  - `NEED_PASTE`, or a version ≠ the `SH vX.Y` on line 1 of `js/sh.js` → Read `js/sh.js` and paste it **once**
    (v3.9 = 65.5 k chars ≈ 20 k tokens to read + 20 k to write — by far the costliest step of a run; strip
    comment-only lines first, it saves ~5 k chars). It stores itself in shopee.vn localStorage, so later sessions
    only BOOT. The paste runs fine live (no CSP block), and the eval restore after a reload is **verified**
    (2026-09-16 run 3 across sessions, 2026-09-20 after a mid-run `navigate`).
  - **Do not re-try the clipboard shortcuts — both are dead ends** (tested 2026-09-20): in-page
    `navigator.clipboard.readText()` throws `NotAllowedError` (no user gesture), and `PowerShell Set-Clipboard` +
    a real `computer` click into a focused `<textarea>` + `ctrl+v` pastes **nothing** — the pane is not wired to the
    OS clipboard. A local http server is refused by the permission classifier (§8.1, §8.32). Paste is the only route.
  - **After a manual paste, spend one call on a smoke test** — a hand-copied 65 k-char file can carry a silent typo
    in a regex or a money constant, and this skill quotes prices. Assert against known-good values, e.g.
    `SH._t.money('1,5m')`=1500000, `codeFromUrl('?evcode=RVhBTVBMRTIy')`='EXAMPLE22',
    `voucherSave({pct:16,cap:300000,min:250000},10000000)`=300000, and the verified soft-drink reproduction
    `checkoutEstimate({price:259000,was:300000,ship:{min:91100,max:91100},shopee:[{pct:19,cap:1000000,min:2000000}],shipVouchers:[{cap:50000,min:0}]})`
    → `total` 300100, `missing` []. 15/15 passed on the 2026-09-20 paste.
- Session + default address check — **run every session, never store or hard-code the address** (the user changes it; skill notes say only "same delivery address"):
  ```js
  [(await fetch('/api/v4/account/basic/get_account_info',{headers:{'x-api-source':'pc'}}).then(r=>r.json())).data?.username,
   (await fetch('/api/v4/account/address/get_user_address_list',{headers:{'x-api-source':'pc'}}).then(r=>r.json())).data?.addresses?.filter(a=>a.is_delivery_address).map(a=>a.city+', '+a.state)]
  ```
  Default = `is_delivery_address: true` (2026-09-15: `status` 2 on it, 1 on the other; don't use `status`). Only province/ward goes into
  the chat — never name, phone or street. `get_pc` shipping fees are for this address; if it changed since a recorded checkout, treat that checkout as stale.
- **Why the price is not one number — state this in every report, it is not a disclaimer but the reason GATE 0 exists:**
  1. **Shipping is priced for the account's default address.** `get_pc` returns fees for that address and nothing else.
     Live to one test address: 16.5k–37.7k across facial-cleanser shops (2026-09-16); run 1 saw the *same* drinks carton
     at 37.7k / 91.1k / **208.6k** depending on shop, where express-only shops (§4) made shipping outweigh the item price.
     A different address therefore changes **which shop wins**, not just the total — the ranking itself is address-bound.
  2. **Vouchers belong to the account, not the listing.** The wallet is this user's cards; the web picker blocked
     **125 of 128** on a real item (§5.3). Another account holds different cards, different ShopeeVIP tier, different Coins.
  3. **The card price may already carry a voucher tied to the session** — all 4 official-store cards read exactly
     −14 % vs the real model price ("After Voucher", platform voucher `EXAMPLE14`, §8.9). Logged out, that layer is absent.
  4. Bank-card promos and first-order/returning-buyer offers vary per user too (§5 stacking).
  So never write "the price on Shopee is X". Write **"X for this account, shipping to <ward, province>, on <date>"** — and
  if the user asks for a number to pass to someone else, say plainly that the shipping and voucher parts will not transfer.
- `javascript_tool` times out at **45 s**: long work runs as a background job; each `await SH.wait('<job>')`
  blocks up to 40 s in-page and returns progress or the compact result. One wait ≈ 6 hops.
- **Never `navigate` inside a job flow.** `navigate` reloads (wipes SH + hook); `SH.*` moves by in-app route change.
- `read_network_requests` misses Shopee's API calls — the library's hook captures them.

| call | does |
|---|---|
| `SH.status()` | version, hop budget used, cooldown, stored counts |
| `SH.sweep(SH.queries({terms, parts, sorts, pages}))` → `SH.wait('sweep')` | search hops, results stored (cached 12 h) |
| `SH.report({keys})` | filtered candidates, rejected counts, checked listings **ranked by checkout total** with ⚠ flags, `nextPdp`; `keys` = **listing keys** `shopid/itemid` (not query keys — those give 0 rows), e.g. `Object.values(SH.db().items).filter(o=>/<keyword>/i.test(o.name)).map(o=>o.k)` (output is capped at 7 k chars) |
| `SH.pdp(SH.last.nextPdp)` → `SH.wait('pdp')` | product pages → verdict ✓ ok / ~ warn / ✗ reject (cached 24 h) |
| `SH.detail('shopid/itemid')` | full stored summary (spec, desc, shop vouchers, models, `ship`, `shopV`) |
| `SH.config({shopee:[{pct:20,cap:50000,min:0}], shipVouchers:[{cap:50000,min:0}]})` | the account's Shopee + free-ship vouchers used by the checkout estimate (from the app picker/checkout) | **Setting one of these is what opens the voucher gate (below).** `SH.config({vouchersNone:true})` is the ONLY other way through, and it means "wallet read, nothing applicable" - not "skipped". |
| `SH.checkout('shopid/itemid', {items, productDisc, shopV, voucher, ship, shipDisc, total})` | record a real checkout (screenshot); lines must add up; overrides the estimate in `SH.report()` (kept 7 d; also save to `data/pickers.json` → `checkouts`) |
| `SH.picker('shopid/itemid', {best, shipVoucher, applied, blocked, source})` | record a **checkout Select-Voucher read for one listing** — `best` is the ticked "Lựa chọn tốt nhất" card. It **overrides the wallet guess** for that listing's platform *and* free-ship voucher, and its row turns `≈` into `✓`. Needs a PDP first; save it to `data/pickers.json` too |
| `SH.forget(/regex/)` | **clear the cache for one product line**: drops matching `db.items` + `db.pdp` + price history + their `db.searched` query stamps (without the last, a re-sweep inside `searchTTLh` just logs `cached <kw>/<page>` and re-reads nothing), plus that listing's stored checkouts/pickers. Use before a deliberate re-run; matches search names AND stored PDP titles |
| `SH.wallet({order:[5300000], proven})` → `SH.wait('wallet')` | all wallet tabs → `ranking` buckets (§5a), `#index` per voucher |
| `SH.rank({order:[5300000], proven})` | re-rank the last wallet read for another total or after a picker read — no hop |
| `SH.tc([3,7,12])` → `SH.wait('tc')` | T&C of those vouchers: WEB-OK / APP-ONLY / SELECTED-ITEMS (cached until the voucher expires) |
| `SH.vouchers()` · `SH.tcImport(<data/vouchers.json>)` · `SH.tcExport()` | **check the cache before spending hops** · seed it on a fresh profile · dump new reads back to `data/vouchers.json` |
| `SH.cart()` · `await SH.checkoutVouchers()` | read cart · read the checkout voucher picker |
| `SH.use({kit:/…/, bad:/…/})` | switch filters for a non-RAM category (`kit` may be `{test:(s)=>…}`: model names ≤40 chars, titles longer; example in `data/pickers.json` `_profiles`) |
| `SH.config({urlParams:'…', perHour:45})` · `SH.keys(/get_pc/)` · `SH.history(k)` · `SH.stop(job)` | tuning · payload field discovery · price log · abort |

## 3. Workflow

0. **Browser first (§1):** Claude in Chrome if connected; if not, encourage the install once, and use the pane only
   after the user declines — ask before falling back. Name the browser used in the report header.
1. **BOOT** on `https://shopee.vn/` → `SH.status()` → **GATE 0: session + default address check (§1) — no `username`, no sweep.**
   Both facts go in the report header: signed-in account and "shipping to <ward, province> (account default)", plus the
   one-line reason the numbers are account-specific (§1 "Why the price is not one number").
2. **Sweep**: terms in Vietnamese **and** exact part numbers, 2 sorts × 2 pages for generic terms:
   `SH.sweep(SH.queries({terms:['ram ddr4 32gb 2x16gb 3200','kit ram ddr4 32gb'], parts:['KF432C16BBK2/32','CMK32GX4M2E3200C16','F4-3200C16D-32GVK'], sorts:['relevancy','sales'], pages:2}))`
   then `SH.wait('sweep')` until `done`. (One generic query found ~40 listings; the multi-query sweep 373.)
   `MISS` lines = a hop that didn't refire even after the home bounce — rerun with another page/sort.
3. **PDP loop — repeat until the tail is empty**, one pass is not the workflow: `SH.report()` → `SH.pdp(SH.last.nextPdp)`
   → `SH.wait('pdp')` → `SH.report()` again, **while `nextPdp` still says `// N unchecked`**. Only ✓/~ rows go to the user.
   2026-09-16 a cleanser run stopped after a single pass with 15 unchecked, and the entire "Bộ sản phẩm" family — holding the
   best-per-unit bundles — never reached a table (§4). The user found it; the report never admitted the tail existed.
   **Before writing the per-unit table, force the per-unit candidates into the queue.** A checkout-total ranking hides them
   by construction, because a bigger pack costs more in total:
   ```js
   SH.pdp(Object.values(SH.db().items).filter(o=>/bộ sản phẩm|combo|refill|túi|set\b|\d{2,3}\s*[+&]\s*\d{2,3}/i.test(o.name) && !SH.db().pdp[o.k]).map(o=>o.k))
   ```
   **If the hop budget ends before the tail does**, say the unchecked count in the report's coverage line and drop the words
   "cheapest / best per unit" — write "best among the N read". An unread listing is not a rejected one.
   **`pdp` rows are ranked by checkout total** (v3.3): item − shop voucher − Shopee voucher + shipping − ship voucher,
   ✅ recorded checkout › ≈ estimate › `?ship` (no shipping read, ranked last). `candidates_itemPriceOnly` is search-stage
   item price — **never recommend from it**. Set `SH.config({shopee, shipVouchers})` first; with `vouchers: NONE SET` the
   estimate is item + shipping only. Never name a "cheapest" listing whose row is `?ship`; say shipping is unknown.
3b. **Rank inside one size, never across sizes.** `SH.report()` puts 88ml, 236ml, 473ml and refill bundles in one
   checkout-total list, which answers nothing for the reader. Mine the stored PDPs for the variant level — **no hops**:
   ```js
   Object.values(SH.db().pdp).map(p=>[p.k,(p.shop||{}).name,p.shown,((p.spec||'').match(/Volume [\d.]+ml/)||[''])[0],(p.ship||{}).min,
     (p.kit||[]).map(m=>(m.name||'(single)')+'='+m.price+(m.was?'/was'+m.was:'')+(m.stock===0?'✗':''))])
   ```
   Fields: `p.title`, `p.shown` (**card** price), `p.kit[]` `{name,price,was,stock}`, `p.spec` (`Volume Nml`, `Stock N`), `p.ship.min`.
   Quote `kit[].price` — `shown` can sit ~14 % under it (platform voucher, §8.9). For `(single)` listings the size is only in
   the title or `spec`, never in the model name. Compute ₫/100ml for **every** row before deciding which table it belongs to.
3c. **"Giá mua ngay" is four layers, and the row must say which ones it actually read** (rule 2026-09-16, after a report
   quoted `item + ship` as if it were a buy-now price). `checkoutEstimate` stacks them in Shopee's own order:
   **shop voucher** (from the listing, always read at PDP time) → **platform voucher** on the amount *after* it →
   **shipping** → **free-ship voucher**. Precedence of proof: **✅ recorded checkout › ✓ picker-backed (`SH.picker`) › ≈ estimate**.
   - Layers never read are printed as **`[NOT COUNTED: shopee-vouchers+ship-vouchers]`**. A row carrying that marker is a
     **no-voucher ceiling, not a price** — never call it "giá mua ngay", and never rank a marked row against an unmarked one.
   - `SH.config({shopee, shipVouchers})` fills the wallet layers; `SH.picker(k, …)` replaces both with what a real picker showed.
   - An estimate that *flatters* a listing is still wrong: sanity-check every `−shop` against the voucher's own text
     (`p.shopVouchers`) before ranking on it.
   - **The gate is enforced in code, not left to judgement** (v3.6): with no voucher layer read, `SH.report()` returns no
     priced rows at all. Do not work around it by reading totals out of `SH.detail()` or `db.pdp` by hand and writing them
     into a table - that is the same error the gate exists to stop, just done manually. If the wallet genuinely holds nothing
     for this order, record that with `SH.config({vouchersNone:true})`; the report then prints `OPEN via vouchersNone` so the
     reader knows the layer was read and came back empty rather than skipped.
3d. **Price history → the Buy-later verdict** (rule 2026-09-21). Every variant read on a PDP is logged in
   `db.prices` under `shopid/itemid#modelid`, one row per change `[day, price, was]`, kept 120 days / 40 rows. Mine
   it with **no hops** for the exact variant being priced — verified live 2026-09-21 in Claude in Chrome:
   ```js
   JSON.stringify(Object.values(SH.db().pdp).flatMap(p=>(p.kit||[]).map(m=>{const h=(SH.db().prices[p.k+'#'+m.id]||{}).h||[];
     const low=h.reduce((a,x)=>!a||x[1]<a[1]?x:a,null);return [p.k.split('/')[1],(m.name||'single').slice(0,18),m.price,low&&low[1],low&&low[0],new Set(h.map(x=>x[0])).size];})))
   ```
   → `[itemid, variant, today, lowest, lowestDate, distinctDays]`. The thresholds and the cell wording live in
   `report-template.md` (Buy later price); the linter fails any Buy-later cell without a `Lịch sử: …` verdict.
   Limits — state them, never paper over them:
   - **History lives in that browser profile's localStorage.** Claude in Chrome and the pane keep separate logs, and
     a profile wipe erases one. It survived a tab-group reset in Edge (2026-09-21: `restored`, 11 rows intact); the
     pane lost its store in 3 of 5 runs. Another reason to stay on one browser (§1).
   - Only **PDP reads** are logged. A search card price is not history, and the card is often another variant
     (§8.59: the "lowest in shop history" card was a spatula).
   - On the first day every row reads `distinctDays: 1` — the verdict must be "chưa đủ", not "đang ở đáy".
   - Shopee's `lowest_past_price` has been null on every listing checked, and the "was" price is seller-set and was
     inconsistent inside one shop (§8.47). Neither replaces the log.
   - A useful series needs repeated reads: when the user cares about waiting, offer a scheduled daily re-read of the
     chosen listings (§5b) — PDP hops only, a handful per day.
4. Voltage / height not in listings → look up `data/specs.json` by part number; if missing, WebFetch the
   maker's page once and add it there (`{"part": {"voltage":1.35,"heightMm":34,"src":"url","checked":"date"}}`).
5. **"Một số sản phẩm" vouchers are OUT of every estimate** (rule 2026-09-17). A platform voucher whose card says
   `Specific Product(s)` / whose T&C says `một số sản phẩm` (SH.tc -> SELECTED-ITEMS) is never put into `SH.config({shopee})`
   and never quoted in a Buy-now cell until a picker (`SH.picker` / app screenshot) shows it applied - `rankVouchers` (v3.8)
   files it under `notForItem: selected-items-unproven`. A voucher that a picker DID apply (e.g. a 16% cap 300k platform voucher
   on a 2026-09-17 checkout) is counted: exact on that listing (✓/✅), and as the ≈ estimate for the
   other listings of the same product line, labelled "proven on <listing>, unproven here".
5. **Vouchers - GATE 1, mandatory before any report** (rule 2026-09-16). Read the wallet for the real candidate
   totals (`SH.wallet({order:[...]})`), then record what you found with `SH.config({shopee, shipVouchers})`, or prove a
   listing with `SH.picker`/`SH.checkout`. **`SH.report()` now WITHHOLDS every estimate-only priced row until you do**, and
   returns `voucherGate: REFUSED - N priced row(s) withheld` instead. Rows already backed by a recorded checkout or picker
   are shown regardless, because their voucher layers are proven. Budget the hop for this **before** the PDP loop, not after:
   on a large order a single 19%-cap-1M platform voucher moves every row by ~1.000.000d, which is larger than the gaps the
   ranking is built on. Details §5 - **Reminders** §5b - **Cart/checkout** §6 (only with the user's OK).
6. **Report**: always follow `report-template.md` — app first, web second, ✅ verified vs ≈ estimate; two tables,
   **Best prices** then **Better price per unit**, one shop per row within each list; **written in the language the
   user asked in**. The header carries a **coverage line** (swept / PDP-read / unchecked) — never present a partial read
   as the finished answer.

## 6. Cart and checkout

Ask in chat before: add to cart, Buy Now, qty change, remove, claiming/saving vouchers, following shops —
**unless the user approved a test-checkout run** (below). **Never click Place Order / Đặt hàng, never pick
the payment method, never edit the address — no approval covers these.**

**Optional standing approval.** If the user has said (in chat, CLAUDE.md or memory) that the test-checkout picker read
may run without asking, do it as part of the normal workflow, before writing any buy-now price — "picker not run" is a **blocker for
the recommendation**, not a footnote. Why this matters: `EXAMPLE25` (25%, cap 2tr) passed all three
text-reading layers (card "Valid Till 30.09", T&C "01–30 Sept", `WEB-OK`) and went into a headline price as
−1.426.500₫; at a real checkout Shopee said **"Voucher này không còn hiệu lực"** — it was out of **lượt sử
dụng** ("Số lượng có hạn"), a live state no wallet card or T&C page exposes. Without a standing approval, ask once per run (the test-checkout
approval below covers it). The cheapest form of the check is typing the code into the checkout **Mã Voucher** box and pressing
ÁP DỤNG — no need to scroll the whole picker to learn a code is dead. The absolute limits are unchanged and no
approval touches them: never Đặt hàng / Place Order, never pick a payment method, never edit the address,
never type passwords/OTP/card data. App-only cards still need the user's own app screenshot — never spoof a
mobile device. Afterwards, say the item is in the cart and offer to remove it.

**Test-checkout run** — one approval ("test checkout <listing> <variant> qty <n>") covers exactly:
open listing → select variant → Buy Now → set qty → tick only that row → Check Out → read total →
open platform Select Voucher → `SH.checkoutVouchers()` → Cancel/Escape → back to cart → report →
ask whether to remove the item. Anything outside that list needs a new OK.

- Read cart: `SH.cart()` (qty from `input:not([type=checkbox])`). Row indices shift after every delete; the header badge can exceed visible rows.
- Add (verified): product page → `find "Buy Now"` → click → lands on `/cart` with that item ticked. **Check qty
  and unit price** — it arrived with qty 3 at list price; real `computer` clicks on "−" fixed it (JS `.click()` on
  the qty widget is ignored). Variants: click `button[aria-label="<option>"]` one per call, wait 2 s, verify the
  `selection-box` class lost `unselected` **[unverified live]**.
- Checkout: only the intended item ticked → `find "check out"` → `/checkout`. Read `Total Payment`; the separate
  "Electronics insurance" line must not be included. Close the voucher picker with Cancel / Escape (don't press OK unless asked).
- Remove **[unverified live]**: row button `/^(delete|xóa)$/i`; confirm only inside a visible modal.
- After a checkout test, tell the user the item is still in the cart and offer to remove it.

## Files

`js/sh.js` (page library) · `report-template.md` · `references/*.md` · `data/specs.json` (maker specs by part number) ·
`data/pickers.json` (your picker/checkout reads per listing, §5a — starts empty) · `data/vouchers.json` (T&C cache, §5 —
starts empty) · `tools/lint-report.js` (report linter, §0) · `tests/*.test.js`
(`node --test tests/sh.test.js tests/sh.smoke.test.js tests/lint.test.js` — rerun after editing sh.js)
