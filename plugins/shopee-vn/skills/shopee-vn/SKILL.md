---
name: shopee-vn
description: Shop on Shopee Vietnam (shopee.vn) as the user's own logged-in account in a real browser — sweep hundreds of listings, re-price the exact variant, expose listings whose title lies (used stock, bait variants, wrong part number, missing kit option), read reviews, cart and orders, and work out which of the account's vouchers really apply (wallet → T&C → checkout picker) to give the true checkout price. Use when the user wants to find, compare or buy something on Shopee, "tìm trên shopee", VN prices, "mã giảm giá / voucher của tôi", which coupon to use, their cart/orders, or wants an item put in the cart / taken to checkout.
compatibility: Designed for Claude Code with the Claude in Chrome extension (Chrome or Edge); needs a shopee.vn tab the user is logged into, and Node.js 18+ for the report linter and tests.
license: MIT
---

# Shopee VN — live-browser shopping

Everything runs as page
JavaScript inside a browser **the user logged into themselves**. Facts marked (2026-09-15) were seen live;
the v3 library had its first live run the same day; items still marked **[unverified live]** passed
offline tests only — confirm on next use and update this file.

## 0. HARD RULES for every report — checked by a tool

These travel with the skill folder (any machine, any session). A report that breaks one is not finished.

1. **Every "Giá mua ngay" / "Buy now price" cell = `**App: …**` first, then `<br>**Web: …**`.** Both lines, always, even
   when the numbers are equal (then say no voucher layer differs). App line = picker-proven vouchers + app-only perks
   (ShopeeVIP free ship, app-only VIP %); Web line = only vouchers not tagged `device:'app'`. `SH.report()` (v3.9+)
   already prints each row as `App: … || Web: …` - copy both halves.
   **Nothing else goes in the cell** (rule 2026-10-26): each line is the calculation + the best voucher of that side,
   e.g. `**App: 34.509.000₫** = 37.509.000 + ship 0 − 3.000.000 [Giảm 20% tối đa 3Trđ (EXAMPLE20)]`. Fallback and
   promo-ship total → "Gợi ý mua"; flash sale → "Giá mua sau" (it decides whether to wait); the list of vouchers that
   do not apply is dropped. The linter fails a third line or a line without "=".
2. **Before sending, lint the draft:** write the report to the scratchpad, then
   `node <this skill's folder>/tools/lint-report.js <draft.md>` must print `OK`. On `FAIL`, fix the listed rows and
   re-run. Send only the linted text — **verbatim, the whole file, all 6 columns**. Never re-summarise it into a
   shorter chat table (2026-10-04: the linted report passed, then a condensed 5-column version without the
   "Giá mua sau" column and without voucher names in "Giá mua ngay" was sent instead; the user caught it). (Why: 2026-09-17 three reports went out with one number per cell although
   `report-template.md` required App + Web; the rule was written down but nothing checked it.)
3. **Plain words, every voucher named, every sum computed by code** (rule 2026-10-22). The linter (v2026-10-22)
   also fails: a code that the report names "(CODE)" somewhere but writes bare elsewhere (V3, whole document); a %
   voucher not named once in "Khuyến nghị" with "chạm mức giảm tối đa từ đơn …" (V8, only there since 2026-10-26); a Buy-later voucher that differs from the
   row's Buy-now voucher without "thay cho …" (V10); internal terms in the text (GATE 0, hop, MISS, bait, spec, VCX,
   shopid/itemid, wallet index "#29", PARTIAL/COMPLETE). Totals are computed by the workflow code.
4. **Product-browsing rules live in §0a, voucher-browsing rules in §0b** (rule 2026-10-15: one place each).
   Read both before the first sweep.

## 0a. Product-browsing rules (duyệt sản phẩm) — all in one place

P1. **"Vận Chuyển: Không hỗ trợ" = rejected on the spot, and the read STOPS there** (rule 2026-10-04 and
   2026-10-15). A listing that does not deliver to the account's default address cannot be bought: it never enters any
   table — not even the rejected-listings table; the coverage line just counts it ("N tin không giao tới <ward,
   province>"). `summarizePdp` (v4.0) rejects it (`NO-DELIVERY …`) from the DOM line or from a get_pc whose channels are
   all unserviceable, and `SH.report()` drops it (`noDelivery: N`).
   - **Stop reading the moment it is seen** — no scroll, no wait for spec/description/shop vouchers/reviews; log
     `STOP-EARLY no-delivery <k>` and go to the next listing. In `pdp()` this is the guard before
     `window.scrollBy(0, 700); await sleep(1500);` (live-patched into the browser copy v4.3 on 2026-10-15; port it
     into `js/sh.js` on the next version bump).
   - **Do not re-read known no-delivery listings.** `SH.forget(/model/)` wipes their `NO-DELIVERY` verdicts too, so a
     daily tracker re-spent **70 of 84** PDP hops on shops already known not to ship (2026-10-15, user caught it).
     Before `SH.forget`, save the no-delivery keys; skip them in the next queue and re-check them at most once a week
     (coverage changes, but rarely).
   - Large appliances: expect most PDPs to be no-delivery (16/18 on 2026-10-04, 70/84 on 2026-10-15) — queue more.
P2. **Price the intended variant.** Card price = cheapest variant, often another model, a gift SKU or
   a spatula (§4). Filter `p.kit` to the model + colour asked for before ranking; a row flagged
   `multi-variant` is unpriced until re-priced.
P3. **Bait costs no hop.** ≤ ~65 % of the market band, 0 sold, "IB ĐẶT HÀNG / ib shop", junk shop names, a whole shop
   priced uniformly low → reject at search stage. A suspiciously cheap ship fee on bulky goods is bait too.
P4. **Spec table beats title**: title model ≠ spec model → do not rank. Suffixes matter (`…X` = other colours,
   `Y1` = other model, `-ZEX` Japan 100 V).
P5. **Coverage is part of the answer** (§3 step 3): loop PDPs until `nextPdp` is empty or the hop budget ends; state
   swept / read / unchecked / no-delivery. With K > 0 unchecked, say "cheapest of the N read".
P6. **Shipping decides heavy goods**: never rank a row with `?ship`; a DOM fee ≥ half the item price is
   a parse error (`ship-text-suspect`); get_pc ship can miss checkout by 2× — treat outliers as suspect.
   "Người bán tự vận chuyển / Phí ship 0₫" is real.
P7. **Rank inside one size / one model** (§3b), and compare "sale" prices to the brand's list price (the seller's strikethrough is often inflated). "Chính hãng"/official ≠ cheapest.
P8. Keep page-read outputs narrow (≈1 000-char cap in Chrome); never `navigate` inside a job flow (§1).
P9. **List pages: scroll for real, read with JS — screenshots miss cards and misread prices** (rule 2026-10-22). A search
   page renders only ~12 of its 60 cards; the rest appear as you scroll. Before scrolling, install an in-page collector
   that keeps every card it ever sees (cards scrolled past are kept even if the page drops them):
   ```js
   window.__cards=()=>[...document.querySelectorAll('a[href*="-i."],a[href*="/product/"]')].filter(a=>/\d+\.\d+/.test(a.href)&&/₫|\d\.\d{3}/.test(a.innerText));
   window.__acc=new Map(); window.__grab=()=>{for(const a of __cards()){const m=a.href.match(/i\.(\d+)\.(\d+)|product\/(\d+)\/(\d+)/); if(!m) continue;
     const t=a.innerText.split('\n').map(s=>s.trim()).filter(Boolean); __acc.set((m[1]||m[3])+'/'+(m[2]||m[4]),{title:t.reduce((x,y)=>y.length>x.length?y:x,''),
     price:t.find(s=>/^₫?[\d.]{6,}/.test(s)), sold:t.find(s=>/đã bán/i.test(s))||''});}};
   new MutationObserver(()=>__grab()).observe(document.body,{childList:true,subtree:true}); __grab(); __acc.size
   ```
   Then **scroll with the mouse wheel**: `computer scroll` 10 ticks × 4 over the result grid, in one `browser_batch`.
   Then read `__acc` with JS (one narrow `javascript_tool` call). Ignore the screenshots the scroll action returns.
   Live 2026-10-22 ("tủ lạnh branda 600 lít"): 12 cards after load → **62 after 4 wheel scrolls**, every one with a
   price; the card text also carries the pending flash price ("3?.???.???₫ 24.10"). **Page_Down / End do NOT
   scroll the search page** (focus sits in a section; clicking the margin did not help); `window.scrollTo` does not
   trigger lazy rendering either. Only the real wheel works. The `SH.sweep` API capture stays the main source;
   this DOM read is the check that all cards were seen, and the fallback when a hop `MISS`es.
P10. **Detail pages: open the product link directly and read with JS — no home page, no SH library** (rule
   2026-10-22). `navigate` to `https://shopee.vn/product/<shopid>/<itemid>`, wait 4 s, then three JS calls (`PAGE_JS`,
   `SHOPV_JS`, `VARIANT_JS`, all in `rules/scan-product.md`; copy them from there):
   - **`PAGE_JS`** reads title, price, "Vận Chuyển" line, rating/sold, shop, spec table, shop vouchers. When the line
     says **"Không hỗ trợ"** it stops (P1). Otherwise it clicks the **">" next to the delivery date** (a JS `.click()` on
     the svg's parent works; hover does not) and reads the popup: "Vận chuyển tới: <ward> <dates> **<struck fee>₫
     <promo fee>₫** <channel>". Totals use the struck fee (checkout has charged it, §2), the promo fee is mentioned.
     "Người bán tự vận chuyển · Phí ship 0₫" in the line itself is a confirmed 0₫ (no popup).
   - **`VARIANT_JS`** clicks **every "Phân loại" option** (buttons `button[class*="selection-box"]`, grouped by their
     `section`; ≤ 2 tiers, ≤ 30 combinations; skip `selection-box-selected`, mark disabled ones HẾT/KHÓA) and reads
     each option's price, strikethrough, % and stock. Selecting an option is read-only. **The requested option is
     priced from this list** (P2), and the other options feed "Gợi ý khác".
     Tier labels are seller-defined ("Phân Loại", "TỦ LẠNH", "Màu sắc"…), so the code does not match on the label.
   Live 2026-10-22: shop F → "TỦ LẠNH: R-AB640X0 đen 33.999.999₫ / 10 có sẵn; Quà tặng HẾT/KHÓA", popup ship
   1.583.200₫ → 583.500₫; shop G popup 3.127.600₫ → 2.128.000₫; shop H "Người bán tự vận chuyển · Phí ship
   0₫"; an air-fryer listing 10 options 655.000–1.050.000₫ each with its own stock. ~7 s per page, outputs < 1 000 chars.
   `SH.pdp` (route change + `get_pc` capture) stays the fallback when a field is missing (e.g. `condition` 1/4).
   **v2026-10-22b — numbers parsed in the page, raw text kept beside them** (`PAGE_JS` returns JSON): `amounts`, `was`
   (the amount followed by "-N%"), `label` ("Giá Sau Voucher" = a voucher is already inside the shown price; the page
   shows **no pre-voucher price** — not in the text, not on hover/click, not in the embedded data, checked live on shop I),
   `flash` (incl. "Chờ giá 3?.??9.000₫", the pending flash price), `ship_found` / `ship_struck` / `ship_promo` /
   `ship_self` (**-2 = no delivery line rendered**: seen live on shop H Mall, which showed only the "Miễn phí vận
   chuyển" guarantee — never read that as 0₫), `shop` (from the "Xem Shop" block), `is_official_shop` and
   `shop_location` from the page's embedded data (Mall flag, reliable), `rating` ("Chưa có đánh giá" too).
   **`SHOPV_JS`** opens the "Mã Giảm Giá Của Shop" popover by clicking a chip (read-only — never "Lưu") and reads every
   card: live on shop I "Giảm 5% Đơn Tối Thiểu 1tr₫ Giảm tối đa 1tr₫ HSD: 31.12.2026 | Giảm 1tr₫ Đơn Tối Thiểu 7tr₫ … |
   Giảm 550k₫ Đơn Tối Thiểu 6tr₫ Sản phẩm nhất định …". Scanner output fields `missing` must give a reason for every
   empty field ("không có trên trang" / "đọc lỗi" / "bị cắt").

## 0b. Voucher-browsing rules (duyệt voucher) — all in one place

V1. **Exclude only the vouchers a concrete fact rules out, then rank the rest and price the best one** (rule
   2026-10-22, replacing the 2026-09-17 "một số sản phẩm = out" rule). The T&C sentence "Chỉ áp dụng trên App (và Web)
   cho một số sản phẩm và một số người dùng…" is boilerplate on nearly every platform voucher (8/8 and 6/6 read on
   2026-10-22, CXGREE15 included) — it is **not** a reason to exclude. Per listing, drop a voucher only when:
   expired or not yet started (→ Buy-later cell); min spend not met; scope label (`icon_text`) is another category
   (Thời Trang, Khỏe & Đẹp, Hàng Quốc Tế…); "SHOPEE MALL" card on a non-Mall shop; Voucher Xtra (`…GIAM…`, `SVIPDDV…`)
   on a shop without a VCX frame (V6); Live/Video/discovery-only (V7); app-only card on the Web line (V2); a picker
   showed it blocked or beaten (V6); "không còn hiệu lực". **Rank what is left by saving** = `min(pct × amount, cap)`
   (or the flat value) and put the **best one in the Buy-now cell as ≈ "chưa chứng minh"**, naming the runner-up as the
   fallback if the picker refuses it. A picker read (✓/✅) always overrides. Until `rankVouchers` is updated, cards it
   files under `notForItem: selected-items-unproven` go back into this ranking by hand. An unreadable T&C is treated
   the same way. Vouchers with `product_limit` are then checked against their own product list, top one
   first (V12).
V2. **Record vouchers with their device**: `SH.config({shopee:[{pct,cap,min,code,device:'app'|'both'}],
   shipVouchers:[{cap,min,device}]})` — `device:'app'` is what keeps an app-only card off the Web line.
V3. **Name vouchers the way Shopee's own card does, code last in parentheses** (rule 2026-10-02): a bare code
   like `EXAMPLEVIP8` means nothing to the reader. Write `Giảm 16% tối đa 300Kđ (EXAMPLEVIP8)`, flat `Giảm 50Kđ (CODE)`,
   free ship `Miễn phí vận chuyển tối đa 100Kđ (CODE)`; add `đơn tối thiểu <min>Kđ` before the parentheses only when
   the order is near the minimum. No code known → no parentheses. The linter fails a code outside `( )` in a price cell.
V4. **A PARTIAL wallet cannot name the best voucher — say so in the price cells** (rule 2026-10-05;
   header trimmed to address + coverage by rule 2026-10-23).
   When `SH.wallet` logs `PARTIAL`, every Buy-now cell of a Mall / `vcx:true` row must read "voucher tốt
   nhất chưa xác định — ví chỉ đọc <N>/<total>", and no ≈ figure may be presented as the best price. Before accepting
   PARTIAL: bring the lane-W tab to the **foreground window**, then load the remaining pages with the End key (V11)
   until `SH.walletPages()` says `done:true`. Same wording when the wallet **could not be read at all**
   (e.g. the host's permission check refused it, 2026-10-15): "ví hôm nay không đọc được"; earlier cards may be reused
   only as ≈ "chưa chứng minh", dated, never as today's best.
   **A short read is PARTIAL even when `walletPages()` says `done:true`** (rule 2026-10-27): compare today's unique
   count with earlier days (`localStorage.__walletHist`, median of the last 7; seed 380 until 3 days exist); below 70 %
   = partial. A short read cannot prove that no voucher applies, so a side without a voucher reads "voucher tốt nhất chưa xác định —
   ví chỉ đọc N thẻ". The workflow (§1c) decides this in code and blocks/replaces the wording.
V5. **Every voucher in the "Giá mua sau" cell carries `[bắt đầu - kết thúc - Số lượng: N]` right after it** (rule
   2026-10-09), e.g. `Giảm 20% tối đa 4,5Trđ (00000000GIAM4500K0) [0h00 10/10 - 23:59 10/10 - Số lượng: 150]`.
   Read the window from T&C (`SH.tc`) / picker / wallet API `startsAt`·`endsAt` / card text; unknown parts are `?` (a guessed window skews the wait-or-buy verdict). The linter fails a Buy-later voucher without it.
V6. **Wallet = what you hold, picker = what applies** (§5a). A wallet card is ≈ until a picker shows it; a picker proves
   one listing on one day — never carry it to another day or listing. Voucher Xtra (`SVIPDDV…`,
   `…GIAM…`) needs a VCX-framed shop.
V7. **Decode before quoting**: `LIVE-`/`VIDEO-` codes are stream-only, "Chỉ có tại trang khám phá" is discovery-only. Codes that passed every text check can still be dead at checkout ("không còn hiệu lực").
V8. **Quote the cap's binding point** (cap ÷ pct): above it a % card is a flat amount.
V9. **An empty free-ship bucket is not "no free ship"**: when ship fees differ more than item prices,
   show the ranking with ship paid and with ship waived.
V10. One Shopee voucher per order; when a bigger one opens later, name which code replaces which.
V11. **Wallet list: End key first, mouse wheel when End stalls; rows read with JS.** After
   `SH.wallet({order})` returns `pages:1`, in one `browser_batch`: [`computer key "End"`, `wait 6`] ×4, then
   `SH.walletPages()`. If the page count stops growing, scroll the voucher list with the mouse wheel (`computer scroll`
   10 ticks ×4, `wait 3`) and check again. Repeat until `done:true`, then `SH.walletRead({order:[…]})`. Keep the wallet
   tab in front (V4). The rows come from the page's own `get_user_voucher_list` responses (code, %, cap, min,
   start/end, used %, scope, `productLimit`).

V12. **A voucher with `product_limit: true` has its own product list — check it only when that voucher is the top usable
   one, and fall to the next voucher when the listing is not in it** (rule 2026-10-23). `product_limit` (wallet API,
   `rows[i].productLimit` in sh.js) is set on ~88 % of platform vouchers (353/400 on 2026-10-23; free-ship cards are
   `false`), so the flag alone excludes nothing — it means "Shopee keeps a list of eligible products". That list is the page
   the T&C page's **"Dùng Ngay"** button opens: `https://shopee.vn/search?evcode=<base64 code>&promotionId=<id>&signature=<sig>`
   (the three params of the voucher's T&C url) **+ `&keyword=<model words>`**, which filters the list (`&page=N` for the
   next page, pager "x/y"). Read the cards' `shopid/itemid` with JS (§0a P9 style, wheel-scroll first); the listing is in →
   the voucher applies (still ≈ until a picker, but no longer a guess); not in, or "Không tìm thấy" → it does not apply.
   - **Order:** rank the usable vouchers per listing (V1) into a ladder. Check only the ladder's top voucher; if the
     listing is not in its list, check the next one, and so on — never check vouchers below the first one that applies.
     Do the same for the Web line (vouchers usable on Web) and for the Buy-later voucher. A voucher whose list cannot be
     read (page failed) stays usable as ≈ "chưa kiểm tra được danh sách sản phẩm".
   - In the workflow this is the **Vouchers** step (§1c, V13): code builds the ladders, Haiku scanners read the pages
     (one page load per voucher, all listings at once), code picks `app_v` / `web_v` / `later_v` / `ship_v` and the
     fallback, and writes `voucher_check_vi` for the Buy-now cell.
   - Verified live 2026-10-23 (fridge R-AB640X0, keyword "tủ lạnh branda" / "branda r-ab640x0"): CXGREE15 = 15
     Gree air conditioners only (this was why checkout said "Voucher này không còn hiệu lực" although only 11 % was used);
     CXGREE16, EXAMPLEA1, EXAMPLEB2, EXAMPLEB3 → no BrandA fridge; EXAMPLESS1 = Samsung products
     (control: "tủ lạnh samsung" → 17 results, so the keyword filter works); EXGIAM4500K19 → 71 R-AB640X0 listings
     incl. shop H đen/xám, not shop F or shop I (matches the Voucher Xtra rule). The code name can hint at the scope
     (CXGREE = Gree) but is not proof.

V13. **One ladder from the wallet API, pages read top-down only until App and Web each have a voucher** (rule
   2026-10-23, replacing the up-front read of ~15 T&C pages). The wallet API already gives dates, %, cap, min, scope label,
   `product_limit`, uses left and `distribution_time`; the T&C page adds only three facts the API does not have: **devices**
   (App only vs App + Web — `platform_type` is empty in the API), **Voucher Xtra participation**, and for free-ship cards
   the **shipping channels and delivery area** ("Hàng Cồng Kềnh", "chỉ giao đến Hà Nội và Hồ Chí Minh").
   - Per listing, rank the API vouchers into lanes, best saving first: **App** and **Web** (vouchers valid now), **Later**
     (starting within 7 days) and **Ship / Ship-Web** (free-ship cards). Concrete API facts filter before ranking: min spend,
     "SHOPEE MALL" on a non-Mall shop, Voucher Xtra codes (`…GIAM…`, `SVIPDDV…`) on a shop without the frame, other category.
   - Walk each lane from the top. For the next undecided voucher read its **T&C page** (unless cached) and, when it has
     `product_limit`, its **product list** (V12). A voucher fits App when T&C does not require Voucher Xtra the shop lacks and
     the listing is in its list; it fits Web when T&C devices also list "Web"; a free-ship card fits when its channels
     include the listing's channel and its area includes the delivery province. **Stop a lane at its first fitting voucher**;
     never read below it. The App pick may be App-only — the Web lane keeps walking until it finds a Web voucher or ends.
   - T&C reads are cached in the browser (`localStorage.__tcRaw`, by code, until the voucher ends), so a voucher seen
     yesterday costs no page today. Product-list reads are not cached (the list can change).
   - A page that fails to load leaves the voucher usable as ≈ "chưa đọc được / chưa kiểm tra được".
   - `voucherLookahead` (workflow arg; **default 99 since 2026-10-26** = read every undecided voucher in one round of 2
     parallel scanners, then walk the ladders in code; 1 = the strict walk above, one agent per step) — was: 2 reads one extra voucher per lane
     per round: simulated on the 23/10 data, strict = 5 rounds, 2 = 3 rounds, same picks.
   - Simulated on the real 23/10 data the walk gives: shop F — no platform voucher applies (6 checked), free-ship
     "giảm 97% tối đa 1Trđ" applies on App only; shop H đen/xám — none today, "Giảm 19% tối đa 4,5Trđ
     (EXGIAM4500K19)" applies on 25/10 (App only). Totals are recomputed in code, with separate free-ship on the Web line.

## Reference files

Sections cited as §2, §4, §5 (with §5a) and §7 live in `references/` — read the one you need, when you need it:

- 2 → [references/api-notes.md](references/api-notes.md) — Shopee data access — what works, payload shapes
- 4 → [references/listing-traps.md](references/listing-traps.md) — Listing traps and the flags that catch them
- 5 → [references/vouchers.md](references/vouchers.md) — Vouchers: wallet → T&C → checkout picker, ranking
- 7 → [references/constraints.md](references/constraints.md) — Known constraints and their status

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
     too** (verified in Edge); sign in with **the same Claude account** as this app; keep that
     browser open during the run. Tools still missing → CLI: `/chrome` → Reconnect extension; otherwise start a new
     session. Example opener (Vietnamese user): *"Mình khuyên bạn cài Claude in Chrome trước khi chạy: trình duyệt
     tích hợp của Claude bị Shopee chặn bằng trang xác minh ngay lần tải đầu, còn Chrome/Edge thật của bạn thì
     không — và bạn đã đăng nhập Shopee sẵn ở đó."*
  3. **Fall back to the pane only if the user declines or cannot install now — ask first**, and warn up front that
     it tends to land on `/verify/captcha` and to lose its login and library between sessions.

  **Why Claude in Chrome beats the default pane** — measured, same account and delivery address, 2026-09-15 → 09-21:

  | | **Claude in Chrome** (user's real Chrome/Edge) | **In-app pane** (`mcp__Claude_Browser__*`) |
  |---|---|---|
  | Shopee anti-bot | 20 hops, peak **13 in 112 s (≈418/h)**, **no captcha, no `90309999`** | **`/verify/captcha` on the first load at 0 hops** — happened again 2026-09-21 |
  | Window size (`outerWidth/Height`) | the real screen size | **0 × 0** — the classic embedded-webview/headless signature |
  | User-Agent | plain `Chrome/153 … Edg/153` | contains **`Claude/2.2553.1`** — announces a non-browser client |
  | Shopee login | the user's existing session — GATE 0 passed at once | started **logged out in 3 of 5 runs** → a login pause each time |
  | Library paste (~40 k tokens) | once per profile — **verified**: survived a tab-group reset (2026-09-21, `restored`) | **re-pasted in 3 of 5 runs** — pane profile wiped |
  | Local price log (§3d, feeds `fake-was`; not shown in reports) | keeps accumulating in the user's profile | wiped with the profile, so the series keeps restarting from day 1 |
  | Hop throttle | 45/h proved conservative (9× ran clean) | no rate is safe — it blocked at 0 |
  | Buy Now | auto-ticks the new cart row | did not |
  | Cached work between days | localStorage stays with the user's profile | lost whenever the pane profile resets |

  **Costs — state these too, never oversell:**
  - It **acts in the user's real browser**, in new tabs next to theirs, with their real sign-ins. If Shopee ever did
    block it, the block lands on the profile they actually shop with, not a throwaway one.
  - First use needs **the user to allow shopee.vn** in the extension; that permission is theirs to grant.
  - The wallet read loaded **fewer cards** there (83 / 1 837 vs 354 / 1 950 in the pane).
  - In-app route changes **fire the API but do not re-render the product view** → `spec`/`desc` empty on every PDP,
    and no Buy Now button; use a real `navigate` for the checkout flow.
  - `XMLHttpRequest` is patched there too (by the extension) — that tamper signal does not go away.
  - Tool quirks: an **async IIFE returns `{}`** — write top-level `await` and end on `JSON.stringify(...)`; results
    that look like cookie/query-string data come back `[BLOCKED: Cookie/query string data]` — keep outputs narrow and
    strip `?&=` from free text.

  **Using each browser:**
  - **Claude in Chrome** (`mcp__claude-in-chrome__*`): `tabs_context_mcp` (createIfEmpty) → work in the group's own
    tab or `tabs_create_mcp` → `navigate` to `https://shopee.vn/`. Same `javascript_tool` /
    `find` / `computer` / `browser_batch` names as below; every call needs `tabId`. Close tabs you opened before
    finishing unless the user wants them.
  - **In-app pane (fallback)** (`mcp__Claude_Browser__*`) — `preview_start {url:"https://shopee.vn/buyer/login"}`.
    `javascript_exec` accepts top-level `await` and async IIFEs; a 40 s `SH.wait` returns normally. **Check
    `location.href` right after opening**; `/verify/` → the user solves the puzzle (never Claude), then continue.
  - **GATE 0 — logged in before anything else. No login, no run.** Every number this skill produces is account-specific
    (see "Why the price is not one number" below), so a logged-out sweep does not give a rougher answer — it gives a
    *wrong* one, with no shipping fee and no voucher layer. Run the session check below **before** the sweep.
    No `username` back → **stop, tell the user, wait for them to log in themselves.** Do not sweep "in the meantime",
    do not fall back to quoting card prices, do not promise to "adjust later" — the whole ranking would have to be redone.
    **The user logs in. Never type passwords, OTPs, QR, card or ShopeePay data.** A CAPTCHA/login page = pause and let the user handle it.
- After any real page load run **BOOT** (≈40 tokens):
  ```js
  window.SH ? SH.v : (localStorage.__shlib ? (0, eval)(localStorage.__shlib) : 'NEED_PASTE')
  ```
  - `NEED_PASTE`, or a version ≠ the `SH vX.Y` on line 1 of `js/sh.js` → Read `js/sh.js` and paste it **once**
    (v4.3 = 81 k chars ≈ 25 k tokens to read + 25 k to write — by far the costliest step of a run; strip
    comment-only lines first, it saves ~5 k chars). It stores itself in shopee.vn localStorage, so later sessions
    only BOOT. The paste runs fine live (no CSP block), and the eval restore after a reload is **verified**
    (2026-09-16 run 3 across sessions, 2026-09-20 after a mid-run `navigate`).
  - **Do not re-try the clipboard shortcuts — both are dead ends** (tested 2026-09-20): in-page
    `navigator.clipboard.readText()` throws `NotAllowedError` (no user gesture), and `PowerShell Set-Clipboard` +
    a real `computer` click into a focused `<textarea>` + `ctrl+v` pastes **nothing** — the pane is not wired to the
    OS clipboard. A local http server is refused by the permission classifier. Paste is the only route.
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
- **Why the price is not one number — the reason GATE 0 exists** (no longer printed as a paragraph in reports, rule
  2026-10-23: the header is only the address line + the coverage line; the address line itself tells the reader whose
  account and which address the totals are for):
  1. **Shipping is priced for the account's default address.** `get_pc` returns fees for that address and nothing else.
     Live to one test address: 16.5k–37.7k across facial-cleanser shops (2026-09-16); run 1 saw the *same* drinks carton
     at 37.7k / 91.1k / **208.6k** depending on shop, where express-only shops (§4) made shipping outweigh the item price.
     A different address therefore changes **which shop wins**, not just the total — the ranking itself is address-bound.
  2. **Vouchers belong to the account, not the listing.** The wallet is this user's cards; the web picker blocked
     **125 of 128** on a real item (§5.3). Another account holds different cards, different ShopeeVIP tier, different Coins.
  3. **The card price may already carry a voucher tied to the session** — all 4 official-store cards read exactly
     −14 % vs the real model price ("After Voucher", platform voucher `EXAMPLE14`). Logged out, that layer is absent.
  4. Bank-card promos and first-order/returning-buyer offers vary per user too (§5 stacking).
  Write **"X for this account, shipping to <ward, province>, on <date>"** — and
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
| `SH.wallet({order:[5300000], proven})` → `SH.wait('wallet')` → End ×4 + `SH.walletPages()` until `done:true` → `SH.walletRead({order})` | All tab, every API page (V11) → `ranking` buckets (§5a), `#index` per voucher |
| `SH.rank({order:[5300000], proven})` | re-rank the last wallet read for another total or after a picker read — no hop |
| `SH.tc([3,7,12])` → `SH.wait('tc')` | T&C of those vouchers: WEB-OK / APP-ONLY / SELECTED-ITEMS (cached until the voucher expires) |
| `SH.vouchers()` · `SH.tcImport(<data/vouchers.json>)` · `SH.tcExport()` | **check the cache before spending hops** · seed it on a fresh profile · dump new reads back to `data/vouchers.json` |
| `SH.cart()` · `await SH.checkoutVouchers()` | read cart · read the checkout voucher picker |
| `SH.use({kit:/…/, bad:/…/})` | switch filters for a non-RAM category (`kit` may be `{test:(s)=>…}`: model names ≤40 chars, titles longer; example in `data/pickers.json` `_profiles`) |
| `SH.config({urlParams:'…', perHour:45})` · `SH.keys(/get_pc/)` · `SH.history(k)` · `SH.stop(job)` | tuning · payload field discovery · price log · abort |

## 1b. Parallel lanes — several tabs / agents at once (v4.0, rule 2026-10-04)

The user wants voucher pages and product pages read **at the same time**. v4.0 makes the
shared store safe for that: every tab of shopee.vn shares one localStorage db, and `save()` now **merges** (`mergeDb`: union of rows, newest wins, `SH.forget` tombstones), `hopCheck()` re-reads the store so **all
lanes draw on ONE hop budget**, and the wallet read is persisted (`db.wallet`, 24 h) so any tab can `SH.rank` /
`SH.tc([#i])` by index — so a `navigate` no longer loses the wallet.

**Lanes** (run after GATE 0 + BOOT in the lead tab, so `__shlib` v4.0 is already stored for the other tabs):

| lane | tab | job | needs a rendered page? |
|---|---|---|---|
| **W** wallet + T&C | foreground | `SH.wallet({order})` → End ×4 + `SH.walletPages()` until done → `SH.walletRead({order})` → `SH.tc([#top candidates])` → `SH.config({…})` | **yes** (End key must reach the page; rows are then read from the API by JS, V11) |
| **P1…Pn** product pages | one tab each | `SH.pdp(chunk)` — split the queue into n chunks | partly (spec, "Không hỗ trợ" line) |
| **S1…Sn** sweep | one tab each | `SH.sweep(queriesChunk)` | no (API capture only) |

**Ways to run them — the default is the three-agent workflow (§1c); A and B remain for one-off checks:**
- **A. One agent, many tabs (cheapest).** Jobs already run in the background *inside the page*, so the lead opens
  `tabs_create_mcp` × n, `navigate` each to `https://shopee.vn/`, BOOT, `SH.use(<same profile>)`, starts one job per
  tab, then `await SH.wait('<job>')` round-robin. No cold start, no extra context.
- **B. Subagents (`Agent`, `run_in_background: true`), one per lane.** Each starts cold, so its prompt must be
  self-contained: browser = Claude in Chrome; "create your OWN tab with `tabs_create_mcp`, never touch other tabs";
  BOOT one-liner; the exact `SH.use(...)` line (profiles hold functions and are NOT stored — every tab must set it);
  its job + chunk; "return ≤ 15 lines: log tail, hops used, errors"; "never navigate a tab you did not create,
  never Buy Now / cart / checkout". The lead keeps GATE 0, `SH.config`, the final `SH.report()` (it `sync()`s first)
  and the report itself. Whether subagents get the Chrome tools in this host is **[unverified live]** — if a lane
  reports no `mcp__claude-in-chrome__*` tools, fall back to A.

**Limits — state them, don't oversell:**
- **Parallel lanes do not raise the hop budget.** 45/h is shared, so 3 lanes finish the same 45 hops in ~2 min
  instead of ~5. Real speed-up needs a higher `perHour`, which is the **user's** call (§7.10; 150/h ran clean in
  Edge on 2026-09-21). Ask once per session when a run will clearly need > 45 hops.
- **Max 3 lanes** at once by default; each keeps its own 5–7 s dwell, so a 3-lane burst is ≈30 hops/min — inside the
  rate the 2026-09-21 run survived (≈418/h), but untested above it. Any `90309999`/captcha in any lane sets the
  shared `blockedUntil` and stops every lane on its next hop.
- **Background tabs are throttled by Chrome/Edge** (timers ≥1 s, and after ~5 min hidden only ~1 wake per minute;
  rendering may pause). API captures still arrive, but key/scroll-driven loading (wallet End key, search wheel scroll) and DOM reads (spec, "Không hỗ trợ") can come back
  empty → keep **lane W in the foreground tab**, keep PDP chunks ≤ 8 (≈1 min each), and treat a lane whose PDPs all
  show empty `spec` as "re-read in the foreground". **[unverified live]**
- Close every lane tab before finishing.

## 1c. Workflow `shopee-3agent` — the default runner (rule 2026-10-22; per-agent rules files 2026-10-26)

Every price check / daily tracker runs `workflows/shopee-3agent.js` with the **Workflow** tool (this skill's
instruction is the user's opt-in): Read the file and pass it as `script`, or pass its path as `scriptPath`, with
`args` for the product (`product`, `prefer` = the variant the user asked for, `terms`, `parts`, `profile`, `titleRe`,
`forgetRe`, `excludeRe`, `minPrice`, `orderTotals`, `noDeliveryKey`, `altHint`, `outDir`, `skillDir`) **and `nowMs`
(required: the current time in ms, e.g. `date -u +%s%3N` — workflow scripts cannot call `Date.now()`; without it the
workflow stops at once)**. Defaults are the BrandA R-AB640X0 tracker.

**Workflow tool missing → STOP and warn the user** (rule 2026-11-03). Before GATE 0, ToolSearch "Workflow".
None → do not open the browser; tell the user the run needs the Workflow tool, that doing it by hand is slower and
error-prone (2026-11-02: no links, wrong ship fee, no lint), and offer: run from Claude Code, or say "vẫn chạy".
Wait for the answer. **If the user insists:** read `workflows/shopee-3agent.js` and carry
out its steps yourself, in order, as written — including its code for totals and `renderReport`
(`awk '/^const renderReport = /,/^}$/'` cuts it out to run with Node). Finish, as the workflow does, by closing every tab in the run's
Chrome tab group (`tabs_context_mcp` → `tabs_close_mcp` on each).

**Agents never read this file** (rule 2026-10-26). Each agent reads ONE short rules file in `rules/`, written for
that agent only — no agent (the Orchestrator included) reads another agent's file, and nothing is trimmed at run time:

| file | read by | holds |
|---|---|---|
| `rules/orchestrator-lists.md` | Orchestrator, list step | browser + BOOT, GATE 0, search-list rules (P1, P3, P4, P9), Mall / Voucher Xtra flags, wallet (V11) and ladder input (V1, V13) |
| `rules/orchestrator-review.md` | Orchestrator, review step | retries, which price (P2, P4, "Giá Sau Voucher", P7), shipping (P6), shop vouchers, output rules |
| `rules/reporter.md` | Reporter | writing ONLY the "Khuyến nghị" section under the code-rendered tables, the lint loop (since 2026-10-29) |
| `rules/scan-product.md` | Product scanners | browser rules + the page JS (`PAGE_JS`, `SHOPV_JS`, `VARIANT_JS`) + field mapping. **No product / search context**: the prompt gives only `KEYS` |
| `rules/scan-voucher.md` | Voucher scanners | browser rules + `TC_JS` / `ELIG_JS` + the T&C cache. The prompt gives only `TC_JOBS` / `LIST_JOBS` |

When a rule in this file changes, update the matching `rules/*.md` file too (the JS lives only in the rules files). Roles:

| agent | model | does |
|---|---|---|
| **Orchestrator** | Opus | GATE 0; product list (API sweep, P9 for misses); voucher wallet (V11, End key); picks the detail pages: the requested product in every colour **plus up to `maxAlt` alternatives** (other colour, higher-end / newer model, deeper discount); after the scans decides retries (once per item), consolidates the data (V1 voucher ranking, requested option per listing) |
| **Code** (no agent) | — | sorts "Giá tốt nhất" by min(App, Web), renders the title, header and all three tables from the rows (`renderReport` in the script, rule 2026-10-29): the 6 columns never go through an LLM |
| **Reporter** | Sonnet | writes only `## Khuyến nghị` from DEFAULT_ADVICE + CAP_PHRASES, lints the whole file until `OK` (one agent, no checker round; the tables it returns are discarded and replaced by code's) |
| **Detail Scanner** ×`maxParallel` (3) | Haiku | product pages by direct link (P10, `rules/scan-product.md`), split over `maxParallel` agents (default 3, rule 2026-10-29); no voucher pages here (§0b V13); facts only, verbatim numbers |
| **Voucher scanner** ×`maxParallel` (3) | Haiku | after the review, **one round of up to 3 parallel agents** (rule 2026-10-26, 3 since 2026-10-29 — not one fresh agent per ladder step, which took 8 agents / 17 min on 26/10): reads every undecided voucher's T&C page (cached by code) and, for `product_limit` vouchers, its product list ("Dùng Ngay" page + model keyword), jobs split evenly; code then walks the ladders (§0b V13) on those facts. A 2nd round runs only if a lane still needs a page |

**Data package and report loop (v2026-10-22b, after the 10h30 run needed 3 report rounds and still failed):**
- The review step returns **structured rows** (item, ship, ship_promo, shop_v, app_v/web_v, totals, later voucher,
  verdict, notes) with **numbers as integers**, and **every text field already in the report language** for the buyer
  (`GLOSSARY` in the script: no GATE 0 / hop / MISS / bait / spec / VCX / "#29"; vouchers Shopee-style with the code in
  parentheses). It returns **no totals and no script** (rule 2026-10-29: the calc script cost ~2 min per round and
  every number in it was overwritten, since it ran before the voucher step).
- The workflow **computes every total in plain JS** after the voucher step (`app_total = item − shop_v + ship − app_v`,
  web, later, promo ship, difference vs the best row), logs data checks (`dataChecks`) and internal terms left in the
  text (`jargon`).
- **v2026-10-22b, the price-critical facts**: the plan adds `listing_meta` (Mall, Voucher Xtra frame, campaign
  overlay, card price, pending flash price per listing) and `ship_voucher_candidates` (free-ship cards — their T&C is
  read like platform vouchers, `kind: freeship`); scanners return numbers + shop-voucher cards; rows carry
  `price_basis` (before/after voucher), `is_mall`, `vcx`, `ship_v` (free-ship saving), `flash_vi`. Code check:
  `app_total = item − shop_v + max(0, ship − ship_v) − app_v`, unknown ship (-2) is excluded and flagged to rank last,
  a shop voucher on an after-voucher price is flagged as a possible double deduction.
- **v2026-10-29 — tables rendered in code** (rule; replaces the Sonnet-writes / Opus-checks loop of 22–26/10).
  Every user correction so far was a format rule (App/Web lines, voucher names, rating column, row order, verbatim
  6 columns), and an LLM checker passed a report that broke two of them on 29/10. `renderReport` now builds the
  title, header, "Giá tốt nhất" (sorted by min(App, Web)), "Gợi ý khác" and "Tin bị loại" from the rows; the
  rating column is `rating_vi` + Mall only, decision-changing caveats come from `advice_vi` into "Gợi ý mua",
  `notes_vi` of best/alt rows is not printed. The Sonnet reporter writes only "Khuyến nghị" (`rules/reporter.md`);
  code keeps its own tables, appends any cap phrase the reporter dropped, and returns `lintOk`. Offline test on the
  29/10 data: linter `OK` with and without a reporter result.
- **Parallelism** (`maxParallel`, default 3): detail and voucher scanners are split into up to 3 agents. The Workflow
  runtime caps concurrent agents at min(16, CPUs − 2) of the machine it runs on and queues the rest, so a cloud session
  on a 2-CPU host may still run fewer at once; the user's own PC (Claude Code) is not limited this way. Chrome load:
  3 tabs share one hop budget (§1b, max 3 lanes).
- Measured 26/10 before these changes: 36 min, ~26,8 M input tokens incl. cache reads (Opus 11,1 M · Haiku 15,0 M ·
  Sonnet 0,8 M); the voucher ladder (8 sequential Haiku rounds) was 17 min / 12 M of it, the report loop 4,7 min / 2 M.

The workflow is **read-only**: it never writes the tracker or sends notifications — the caller
does that with the returned `report`/`data`. Measured 2026-10-22 (old scanner via home page + `SH.pdp`):
13,2 min, ~5,0 M input tokens (Opus 2,18 M · Haiku 2,53 M · Sonnet 0,27 M) vs 13,5 min and ~12,5 M all-Opus for the
single-agent run; a resume that only re-ran review + report cost 0,21 M / 3,2 min. The 2026-10-22…29 runs started only **2
scanners** because the script split the pages in 2 (`ceil(n/2)`), not because of a host limit; since 2026-10-29 it is
`maxParallel` (3). With P10 the scanner needs no BOOT/library paste and the
"ship 0₫ unconfirmed" retry disappears (expected −2 to −3 min, [unverified as a full run]). First full P10 run
(10h30 the same day): 19,4 min, ~7,4 M input (Opus 3,28 M · Haiku 2,96 M · Sonnet 1,13 M) — slower, because the
report loop took 3 rounds (~1,9 M / ~7 min) and 2 pages were re-read; the ≤ 2-round loop above targets that.

## 3. Workflow

0. **Browser first (§1):** Claude in Chrome if connected; if not, encourage the install once, and use the pane only
   after the user declines — ask before falling back. (The browser is not named in the report header, rule 2026-10-23.)
1. **BOOT** on `https://shopee.vn/` → `SH.status()` → **GATE 0: session + default address check (§1) — no `username`, no sweep.**
   The report header gets one line from this: "Đã đăng nhập Shopee · giao tới <ward, province> (địa chỉ mặc định của tài
   khoản)". Nothing else from GATE 0 goes above the tables (rule 2026-10-23).
2. **Sweep**: terms in Vietnamese **and** exact part numbers, 2 sorts × 2 pages for generic terms:
   `SH.sweep(SH.queries({terms:['ram ddr4 32gb 2x16gb 3200','kit ram ddr4 32gb'], parts:['KF432C16BBK2/32','CMK32GX4M2E3200C16','F4-3200C16D-32GVK'], sorts:['relevancy','sales'], pages:2}))`
   then `SH.wait('sweep')` until `done`. (One generic query found ~40 listings; the multi-query sweep 373.)
   `MISS` lines = a hop that didn't refire even after the home bounce — rerun with another page/sort, or load that
   search page normally, wheel-scroll it and read the cards with the §0a P9 collector (no screenshot reading).
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
3b. **Rank inside one size.** `SH.report()` puts 88ml, 236ml, 473ml and refill bundles in one
   checkout-total list, which answers nothing for the reader. Mine the stored PDPs for the variant level — **no hops**:
   ```js
   Object.values(SH.db().pdp).map(p=>[p.k,(p.shop||{}).name,p.shown,((p.spec||'').match(/Volume [\d.]+ml/)||[''])[0],(p.ship||{}).min,
     (p.kit||[]).map(m=>(m.name||'(single)')+'='+m.price+(m.was?'/was'+m.was:'')+(m.stock===0?'✗':''))])
   ```
   Fields: `p.title`, `p.shown` (**card** price), `p.kit[]` `{name,price,was,stock}`, `p.spec` (`Volume Nml`, `Stock N`), `p.ship.min`.
   Quote `kit[].price` — `shown` can sit ~14 % under it (platform voucher). For `(single)` listings the size is only in
   the title or `spec`. Compute ₫/100ml for **every** row before deciding which table it belongs to.
3c. **"Giá mua ngay" is four layers, and the row must say which ones it actually read** (rule 2026-09-16, after a report
   quoted `item + ship` as if it were a buy-now price). `checkoutEstimate` stacks them in Shopee's own order:
   **shop voucher** (from the listing, always read at PDP time) → **platform voucher** on the amount *after* it →
   **shipping** → **free-ship voucher**. Precedence of proof: **✅ recorded checkout › ✓ picker-backed (`SH.picker`) › ≈ estimate**.
   - Layers never read are printed as **`[NOT COUNTED: shopee-vouchers+ship-vouchers]`**. A row carrying that marker is a
     **no-voucher ceiling, not a price** — never call it "giá mua ngay", and never rank a marked row against an unmarked one.
   - `SH.config({shopee, shipVouchers})` fills the wallet layers; `SH.picker(k, …)` replaces both with what a real picker showed.
   - An estimate that *flatters* a listing is still wrong: sanity-check every `−shop` against the voucher's own text
     (`p.shopVouchers`) before ranking on it.
   - **The gate is enforced in code** (v3.6): with no voucher layer read, `SH.report()` returns no
     priced rows at all. Do not work around it by reading totals out of `SH.detail()` or `db.pdp` by hand and writing them
     into a table - that is the same error the gate exists to stop, just done manually. If the wallet genuinely holds nothing
     for this order, record that with `SH.config({vouchersNone:true})`; the report then prints `OPEN via vouchersNone` so the
     reader knows the layer was read and came back empty rather than skipped.
3d. **Price history is NOT shown in reports** (rule 2026-09-23, withdrawing the 2026-09-21 "Lịch sử: …" rule).
   The Buy-later cell rests on vouchers, sale end times and stock only; the linter fails a `Lịch sử: …` line there.
   Why: every row read "chưa đủ (1 ngày)", and no outside source filled the gap — checked 2026-09-23: lichsugia.com
   returned only the live price (949.000₫, correct) with an empty chart and lists only Lazada/Tiki; muathongminh.com
   (ex-Beecost) is now an unrelated toplist site; AliPrice (~40k users, ★4.7, updated 05/2026, reads all site
   content) and the anonymous "Shopee price tracker" were not installed, so their data is unverified. Do not
   recommend a tracker as reliable. The local log below keeps running silently — it still feeds the `fake-was` flag.
   Every variant read on a PDP is logged in
   `db.prices` under `shopid/itemid#modelid`, one row per change `[day, price, was]`, kept 120 days / 40 rows. Mine
   it with **no hops** only when the user asks about price history directly:
   ```js
   JSON.stringify(Object.values(SH.db().pdp).flatMap(p=>(p.kit||[]).map(m=>{const h=(SH.db().prices[p.k+'#'+m.id]||{}).h||[];
     const low=h.reduce((a,x)=>!a||x[1]<a[1]?x:a,null);return [p.k.split('/')[1],(m.name||'single').slice(0,18),m.price,low&&low[1],low&&low[0],new Set(h.map(x=>x[0])).size];})))
   ```
   → `[itemid, variant, today, lowest, lowestDate, distinctDays]`. Fewer than 7 distinct days = no conclusion.
   Limits — state them when the user asks, never paper over them:
   - **History lives in that browser profile's localStorage.** Claude in Chrome and the pane keep separate logs, and
     a profile wipe erases one. It survived a tab-group reset in Edge (2026-09-21: `restored`, 11 rows intact); the
     pane lost its store in 3 of 5 runs. Another reason to stay on one browser (§1).
   - Only **PDP reads** are logged. A search card price is not history, and the card is often another variant
     (the "lowest in shop history" card was a spatula).
   - On the first day every row reads `distinctDays: 1` — the verdict must be "chưa đủ".
   - Shopee's `lowest_past_price` has been null on every listing checked, and the "was" price is seller-set and was
     inconsistent inside one shop. Neither replaces the log.
4. Voltage / height not in listings → look up `data/specs.json` by part number; if missing, WebFetch the
   maker's page once and add it there (`{"part": {"voltage":1.35,"heightMm":34,"src":"url","checked":"date"}}`).
5. **Best usable voucher per listing goes into the estimate** (rule 2026-10-22, replaces the 2026-09-17
   "một số sản phẩm = OUT" rule — see §0b V1). The "một số sản phẩm" wording alone excludes nothing; drop only the
   vouchers a concrete fact rules out for that listing (scope, Mall-only, Voucher Xtra, min, dates, device, picker),
   rank the rest and put the best into `SH.config({shopee})` as ≈ "chưa chứng minh". `rankVouchers` (v3.8) still files
   SELECTED-ITEMS cards under `notForItem: selected-items-unproven` — move them back by hand. A voucher that a picker DID
   apply (e.g. 16% cap 300k, EXAMPLEVIP16, on Finish 2026-09-17) is counted exact on that listing (✓/✅),
   and as the ≈ estimate for sibling listings, labelled "proven on <listing>, unproven here".
5. **Vouchers - GATE 1, mandatory before any report** (rule 2026-09-16). Read the wallet for the real candidate
   totals (`SH.wallet({order:[...]})`), then record what you found with `SH.config({shopee, shipVouchers})`, or prove a
   listing with `SH.picker`/`SH.checkout`. **`SH.report()` now WITHHOLDS every estimate-only priced row until you do**, and
   returns `voucherGate: REFUSED - N priced row(s) withheld` instead. Rows already backed by a recorded checkout or picker
   are shown regardless, because their voucher layers are proven. Budget the hop for this **before** the PDP loop:
   on a large order a single 19%-cap-1M platform voucher moves every row by ~1.000.000d, which is larger than the gaps the
   ranking is built on. Details §5 - **Cart/checkout** §6 (only with the user's OK).
6. **Report**: tables come only from `renderReport` (§1c, also when the run is not a Workflow run) — a hand-typed table drops links and miscounts shipping; always follow `report-template.md` — app first, web second; two tables,
   **Giá tốt nhất** (the requested option) then **Gợi ý khác** (other colours / higher-end / newer models with deeper
   discounts / per-unit deals), one shop per row within each list; **written in the language the
   user asked in**. **Above the tables there are only two items** (rule 2026-10-23): the login + delivery-address
   line and the **coverage line** (swept / PDP-read / unchecked) — never present a partial read as the finished answer.
   No account-only disclaimer paragraph, no voucher list, no "còn bỏ ngỏ" line: vouchers and caveats go in the cells.

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

## 8. New lessons go straight into rules

The run-by-run lessons file was folded into the rules above and archived on 2026-10-29. When a run teaches something new, write it
as a rule in §0a/§0b/§1c or `rules/*.md` **plus** a linter or code check — a lesson that is only written down comes back.

## Files

`js/sh.js` (page library) · `workflows/shopee-3agent.js` (default runner, §1c; renders the report tables) ·
`rules/*.md` (one short rules file per workflow step, §1c; holds the page JS) · `report-template.md` · `references/*.md` · `data/specs.json` (maker specs by part number) ·
`data/pickers.json` (your picker/checkout reads per listing, §5a — starts empty) · `data/vouchers.json` (T&C cache, §5 —
starts empty) · `tools/lint-report.js` (report linter, §0) · `tests/*.test.js`
(`node --test tests/sh.test.js tests/sh.smoke.test.js tests/lint.test.js` — rerun after editing sh.js)
