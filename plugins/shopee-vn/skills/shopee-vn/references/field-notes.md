# Field notes from live runs (numbered, cited as §8.N)

Part of the shopee-vn skill — see ../SKILL.md.

## 8. Live run checklist

First run 2026-09-15 (in-app Browser, v3.0 → fixed in 3.1). ✅ works · ❌ broken · ⏭ not reached

1. ✅ BOOT eval restore after a reload (2026-09-15 afternoon). One-line patch without re-pasting: `src = localStorage.__shlib.replace(A, B)`,
   `delete window.SH; (0,eval)(src)`, **then `localStorage.__shlib = src`** (evaluating it does not re-save), re-run `SH.use`.
   Verify: whitespace-stripped string hash of `localStorage.__shlib.slice(1,-3)` = hash of the file's `function SHLIB…});`
   (comment-only lines stripped). A local http server to load the file was refused by the permission classifier — paste or patch.
2. ✅ `SH.sweep` `S` lines: 15/15, no MISS, no captcha/90309999 during 45 hops.
3. ✅ field locations found (see §2 "Payload shapes"). ❌→fixed: `SH.keys` had nothing to show after a sweep (raw payloads nulled) — 3.1 keeps a small sample.
4. ❌ `SH.wallet`: tabs ✅, cards 0 (fixed 3.1), ~280/1 410 loaded (open). `SH.tc`: 2/4 rendered in-app (timeout raised).
5. ⏭ Category / Shopee Mall URL params.
6. **Next run with 3.2**: re-paste (version changed), check `SH.wallet` returns `ranking` buckets and `SH.rank` with the
   stored `data/pickers.json` entry moves 24%/22% to `notForItem`, confirm `kit?` candidates → PDP find real 2×16 models in
   "8/16/32GB" listings, `st:` shows numbers, `seller_flag` Mall value, wallet `PARTIAL` count, BOOT after reload,
   and the Claude-in-Chrome `javascript_tool` timeout.

Second run 2026-09-16 (in-app Browser, v3.3 → 3.4), a facial cleanser, a **non-RAM category**:

7. ✅ 3.3 as pasted worked end to end: sweep 9/9 `S` (284 listings), PDP 12/12, wallet, T&C — no MISS, no 90309999.
   ✅ `shipFromPc` per-address fees (28.7k/32.2k to the test address). ✅ `SH.use` retargeted at cosmetics.
8. ⚠️ **The pane profile was empty** (`NEED_PASTE`) and the user was logged out — budget the ~10 k paste plus a login
   pause at the start of any run, and don't assume last session's localStorage survived.
9. ⚠️ **Card price ≠ variant price.** All 8 official-store listings showed the card ~14 % under the real model price;
   `product_price.final_price_info.final_price_vouchers.platform_voucher` named it (`EXAMPLE14`, −49 000 on a 350 000 item)
   and the DOM said "After Voucher". Quote the model price and name the voucher — `shown-price-includes-shop-voucher` fires but
   attributes it to the shop.
10. ❌→fixed in **3.4**: T&C was re-read every session — `db.tc` is localStorage-only and had a flat 3-day TTL.
    Now cached until the voucher's own `endsAt` (30 d when unreadable), with `SH.tcExport`/`SH.tcImport` ↔ `data/vouchers.json`
    and `SH.vouchers()` to look before hopping. **`codeFromUrl`** decodes `evcode` so every card's code is free.
11. ⏭ still open: wallet `PARTIAL` (49/1918 here — worse than run 1), category/Mall URL params, a proven checkout picker
    for this account (`advice` is still `UNPROVEN`).

Third run 2026-09-16 (in-app Browser, same cleanser question, cache still warm):

12. ✅ **The pane's localStorage did survive** this time — `HAS_SHLIB` + 284 items / 24 PDPs / 48 prices still cached from
    run 2, and the account was still logged in. So run 2's item 8 is not a rule: **BOOT first, then decide** whether to spend
    the ~10 k paste. The stored lib was v3.3 while the file is v3.4; 3.3 served the whole sweep/report/PDP path fine, so a
    version gap is only worth the paste when a 3.4-only call is actually needed (`SH.vouchers`, `tcImport/tcExport`).
13. ✅ Mining `SH.db().pdp` for variants costs **no hops** and is the only way to get size-level prices (§3b) — the whole
    second half of this run used 5 hops total, all on the missed bundles.
14. ❌ **Reported 24 of 284 listings as if it were the answer.** `SH.report()` said `// 15 unchecked`; the report never
    mentioned it, and the user found the missing best-per-unit bundle themselves. Fixed by process, not code: §3 PDP loop
    + per-unit pre-queue, and a mandatory **Coverage** line in `report-template.md`. Re-read both before the next report.
15. ⚠️ New PDP error seen: `api-error 266900504` on 2 listings (`1506174776/…`) — **not** the `90309999` block code, the job
    carried on normally. Treat it as the listing being gone/unavailable, not as pacing pushback.
16. ❌→fixed in **3.5**: shop-voucher savings were computed from `percentage_used`, which is Shopee's **% of the voucher
    stock already claimed**, not a discount rate. Pharmacity `PHARMSP35` (flat **35k**, min 350k, `percentage_used:48`)
    was estimated as 48 % = **−261.5k**, so `SH.report()` showed that listing at ≈299.8k instead of ≈526.4k. `voucherSave`
    now takes the **smaller** of the pct and flat readings, and `parseShopVoucherJson` ignores `percentage_used` entirely.
    **Lesson: an estimate that flatters a listing is still a wrong estimate** — sanity-check any shop-voucher deduction
    against the voucher's own text (`p.shopVouchers`) before ranking on it; `-shop 261.5k` on a 544.9k item was not credible.
17. ✅ **3.5 makes the four voucher layers explicit** (2026-09-16). `checkoutEstimate` now takes `proven`
    (a `SH.picker` read) and returns `src` provenance per layer + `missing`; `fmtCheckout` appends `[NOT COUNTED: …]`;
    `SH.picker()` persists per-listing picker reads (7 d) and upgrades a row from `≈` to `✓`. Tests: 29 pass, and the
    **verified soft-drink checkout reproduction still matches to the đồng** — the safest signal the refactor changed nothing real.
    Note `missing` deliberately has **no `shop-vouchers` entry**: those are read at PDP time, so an empty list means the
    listing has none. (Tests compare cross-realm arrays through the file's `plain()` helper — sh.js runs in a `vm` context.)
18. ❌→fixed in **3.5**: `SH.report()` priced every listing at `Math.min(...kit.price)` — its **cheapest** variant — so a
    473ml listing was ranked by its `Combo 5x30ml = 175k` option (Sumy). Our own code reproducing the §4 card-price trap.
    Rows with >1 model now carry `multi-variant: priced at the CHEAPEST of N options (a–b) — re-price the variant you mean`.
19. ⚠️ Per-listing **review text is not stored** by `SH.pdp` (`db.pdp` has no ratings field) and `db.items` has no star or
    rating count either — only `sold`. The template's "caveats from comments" column therefore needs its own read; say
    "comments not read this session" rather than dressing up shop-level stars as listing feedback.

Token-heavy moments in run 1: the library paste (~10 k), eye-checks returning raw model JSON (~2 k each), the
wallet debug. The hop budget (45/h) was the real limit: sweep 15 + PDP 20 + eye-checks 4 + wallet 1 + T&C 4 + 1 debug = 45,
so the T&C step ended the hour. Budget ≈ 15 sweep / 15 PDP / 4 eye / 1 wallet / 5 T&C / 5 spare.

Fourth run 2026-09-16 (in-app Browser, Bosch Series 6 dishwashers - a heavy-goods category):

20. OK BOOT found v3.3 still cached in the pane (localStorage survived again, account still logged in) - run 3's item 12 holds:
    BOOT first, decide about the ~10k paste after. Sweep 12/12 `S`, 361 new listings, no MISS, no 90309999.
21. **Shipping dominates this category and the spread is enormous**: to the test address the same class of machine shipped
    at 63.8k / 758k / 781.4k / 959.2k / 1.123M / **1.287M**. That is several percent of even a large order and it reorders the ranking
    outright - never quote a dishwasher (or any large appliance) without `ship`. A **suspiciously CHEAP** ship fee is itself a
    bait signal: the 63.8k shop was pricing a ~60kg appliance like a small parcel.
22. **Uniform under-pricing across a whole catalogue = bait**, and it is visible with no hops. `GIA DUNG CHINH HANG VN`
    (shop 2.5mo, 0 ratings) listed *every* Series 6 model at 11.4-14.5M, i.e. ~55-60% of market, **0 sold across all 7
    listings**. Group a shop's listings and compare its whole price band to the median before spending a PDP hop on it.
23. **The `no-part-number` flag is noise outside RAM.** The decoder only knows memory part numbers, so every Bosch listing
    got flagged. Say so rather than reporting it as a defect - and conversely, `bad:/bep tu/` wrongly REJECTed a listing whose
    'bep tu' was a *free gift*. In gift-heavy appliance categories, write `bad` against the product being sold, not words that
    only appear in the bundled-gift blurb.
24. **A phantom `-shop 5.69M` appeared on a listing whose `shopVouchers` was `null`** (v3.3 in the pane, i.e. the
    `percentage_used` bug fixed in 3.5 - the pane was running the old lib while the file was newer). It would have made a
    0.4-month-old shop look 5.7M cheaper than anyone. §8-16's lesson held: **a deduction with no voucher text behind it is
    not a discount.** Check `p.shopVouchers` before ranking on any `-shop` figure, and re-paste when the pane's lib is older
    than the file.
25. **The report was written with the voucher layer entirely unread** (45/45 hop ceiling hit at the wallet step) and every
    total was a `[NOT COUNTED]` ceiling. The user's fix: make it impossible. **v3.6 adds the `SH.report()` voucher gate**
    (§3 step 5, §3c) and **`SH.forget()`** so a product line can be cleared and re-run cleanly. Plan the hop budget as
    sweep -> **wallet** -> PDP loop, so the gate is already open when the PDP rows arrive.

Fifth run 2026-09-16 (a high-end water ionizer, two model variants) - **first proven app checkout**:

26. **A real app checkout finally arrived** (user screenshot) and it graded the estimator:
    item price **exact to the dong** (after the listing's product discount) and
    `ship` **exact to the dong**. Only the voucher layer was wrong. That is now the third independent
    confirmation of the standing rule: **goods + shipping estimate well, vouchers never do until a picker proves them.**
27. **The card I ranked as 'today's best' was stream-only.** `#40 20% cap 500k 'Voucher doc quyen cua KOL'` decodes to
    **`VIDEO-1000000000000002`** - a `VIDEO-` prefix, i.e. purchase must go through that video/livestream (SKILL.md §5).
    `SH.rank` forces `liveVideoOnly` on those, but it had ranked into `candidates` here and I quoted it as the -500k in two
    reports. **Decode every candidate's evcode before quoting it**, not only the winner.
28. **`freeShip: []` was wrong.** The checkout waived the full shipping fee, yet the ranking's freeShip bucket was empty:
    the 4 `FSV-` cards sit in the Shopee tab and the bucket never picked them up. Worse, once read, **none of the 4 matched
    this listing's channel** (`Nhanh`; the cards are Hoa Toc / Trong Ngay / Express). So the waiver was a **Shopee shipping
    promo of unknown origin** - do not credit it to a voucher. Never write 'no free-ship voucher' from an empty bucket alone.
29. **A capped % voucher is a flat voucher above the binding point** (2026-09-16 -> `report-template.md`
    'Name the voucher, not just the saving'). `EXAMPLEVIP16` = 16% cap 300k min 250k, so it pays 16% only up to an
    order of **1,875,000d** (cap/pct) and is a **flat 300k** above that - on a 10M order that is **3%**, not 16%.
    The Buy-now cell must name the code, its terms and the binding point, so the headline % cannot mislead.
30. **Platform vouchers are mutually exclusive, and the calendar can hide it.** `EXAMPLEVIP16` **expires 20.09.2026**,
    the exact day the 20%/cap-4.5M card becomes valid. One Shopee voucher per order => on 20/09 the app may auto-pick the
    expiring 300k card; the buyer must untick it and check the 4.5M one. Delta **4,200,000d**.
31. ⚠️ `spec` and `desc` came back **empty on all 14 ionizer PDPs** across both models, so voltage / warranty / origin
    were unreadable from the listings - matters here because a Japan-domestic (100V) variant and the
    Vietnam version share the model name. Say 'not readable' and push the question to the shop rather than inferring from the suffix.

Sixth run 2026-09-17 (dishwasher tablets, consumables with per-tablet pricing):

32. ⚠️ Pane profile empty again (`NEED_PASTE`, logged out) - login pause + full paste. A local http server to serve
    `sh.js` was refused by the classifier again: paste is the only route.
33. ❌→fixed in **3.7**: `summarizePdp` kept only `kit.slice(0, 4)` - the first 4 matching models. Mixed-line listings
    here have 24-36 models (several product lines), so the wanted line was often cut and the
    run ran out of hops (43/45 after sweep 10 + wallet 1 + T&C 1 + PDP 30) before it could re-read them. Now 40.
    **Budget for mixed listings: re-reads are expensive, so get the store right the first time.**
34. When filtering stored variants by product line, **a model name often omits the line** ("Túi 18 viên" in a listing
    whose title names the line). Test the model name OR, when the name has no line word at all, the title.
35. Consumables: the ranking that matters is **₫ per tablet**, and the cap binding point (cap/pct) is well below
    a 500-700k order, so every 22%-cap-100k card is a flat 100k there.
36. ❌ **Buy-now cells were written with a single web-style number and no `App:` line** (user caught it, 2026-09-17).
    `report-template.md` already requires `App:` first and `Web:` second. Rule: always price the App line with the best
    **APP-tagged** wallet card (`SH.tc` said `APP-ONLY`, e.g. EXAMPLE23) *and* any app-only perk seen on the page
    ("Phí ship 0đ VIP"), and the Web line with WEB-OK cards only - even when the two differ by a few thousand dong. When
    the wallet read was PARTIAL, say the App line may still be beaten by cards not loaded.
37. ✅ App checkout 2026-09-17: item price exact. The picker's best was a **16%
    cap 300k** platform voucher - both wallet cards I ranked higher (22% and 23%) were NOT
    applicable: the fourth confirmation that wallet % cards are not prices. ❌ **Ship estimate missed**: get_pc gave
    37,700 but checkout charged 56,800 ("Nhanh") - first time `price_before_discount` did not match; a
    free-ship card (60k, min 0) waived it, so the total was right only by luck.

38. **v3.8**: selected-items vouchers excluded from ranking unless picker-proven (rule see §3 step 5).

39. **v3.9**: `SH.report()` rows print `App: … || Web: …`; `tools/lint-report.js` + §0 hard rules make the App/Web
    split a checked step (a user-level Stop hook was refused by the permission classifier, and would not travel with the
    skill anyway - the rule lives in the skill folder instead).

Seventh run 2026-09-20 (in-app Browser, a steam fryer — a single-unit appliance, user asked for a price-history column):

40. ⚠️ Pane profile empty again (`NEED_PASTE`, logged out) — that is 3 of 5 recent runs. **Assume the paste + a login
    pause**, and do GATE 0 **before** spending the paste: the account check is 1 cheap call and a logged-out run is
    thrown away anyway. Clipboard shortcuts to avoid the paste do not work (§1).
41. ❌ **`navigate` destroys the wallet read.** `W.__shWalletRows` / `W.__shWallet` / `W.__capKeep` are window-scoped
    and are NOT persisted to localStorage (only `db.*` is), so one `navigate` to a T&C page cost the whole
    `SH.wallet` result and with it `SH.rank`. **Read every T&C you need, and record `SH.config`/`SH.picker`, BEFORE
    navigating anywhere.** Recovering it costs a fresh wallet hop.
42. ⚠️ **Voucher T&C pages frequently refuse to render — budget ~50 % failure.** 4 of 6 here returned
    `T&C page did not render in-app`, and the documented fallback (`navigate` → BOOT → `SH.tcHere()`) **also failed**:
    `/voucher/details` redirected to the homepage and `tcHere()` parsed an empty page. A miss still costs the hop.
    So a wallet card whose code you cannot decode-and-read stays unproven — say so rather than assuming it applies.
43. ❌→**the card price trap is the whole story in appliance lines, not an edge case.** Sellers attach a cheaper
    sibling model as a variant so the card advertises it: one card read 4.86M = **a cheaper sibling model** (asked model = 6.34M);
    another 5.20M = **a different brand's model** (asked model = 6.31M). 8 of 18 listings did this. A profile whose
    `kit` accepts every model (`{test:(s)=>…||s.length<=40}`, needed so colour/bundle variants are not rejected) then
    lets `SH.report()` price each row at `Math.min(kit.price)` — our own §8.18 bug, re-created by the profile. **Fix
    before reporting, no hops:** rewrite `db.pdp[k].kit` to only the intended model
    (`p.kit=p.kit.filter(m=>/<model>/i.test(m.name))`), reject listings left with none, then `SH.report()`.
    Keep single-model listings and flag them — their model name is often generic ("nồi chiên full pkien").
44. ✅ **Spec table beats the title for identifying the model.** The cheapest row of all (5.41M, ≈5.65M total) had
    `Air Fryer Features **Knob Control**` in its spec while the title advertised "Màn OLED" — knob control is the
    *other* model. Title says one product, spec says another → do not rank it. `p.spec` is already stored, so this
    check is free.
45. ⚠️ **A phantom shop voucher appeared again, this time from the DOM text path**: the brand's official shop parsed as
    `201,441k₫ off Min. Spend 4,7m₫` — a 201-*million*-đồng discount. `parseShopVoucherText` mis-read the chip.
    §8.16/§8.24's rule held: **a deduction with no credible voucher text behind it is not a discount.** Also,
    **every one of the 8 shop vouchers in this category was tagged `Specific Product(s)`** → excluded under the
    user's selected-items rule, same as platform cards. Drop them from `p.shopV` before reporting and say so.
46. ⚠️ Heavy-appliance shipping confirmed again: 92.1k–366.4k to the test address, channel "Hàng Cồng Kềnh", and
    **the brand's own official store had both the highest price AND the worst shipping** (6.49M + 366.4k). Never let
    "chính hãng" stand in for "cheapest". Two rows finished 5.000₫ apart with the cheaper *machine* losing on ship.
47. **Price-history requests need an honest answer up front.** `db.prices` is seeded on first read, so a new product
    line has exactly one data point (27 rows, all one day here) and `wasCheck`/`fake-was` needs ≥2 days. Shopee's
    `lowest_past_price` is still null. The only real signal on day 1 is the strikethrough, and it was demonstrably
    unreliable — **the same shop listed the same machine with three different "was" prices** (8.79M / 9.98M / 9.999M).
    Say all three things (log empty, API null, was-price inconsistent) and offer a scheduled re-scan to build the series.
48. ❌ **An unreadable T&C is NOT a selected-items voucher — do not let §5's exclusion swallow the whole wallet.**
    2026-09-20 the first report excluded *every* platform card and quoted no-voucher ceilings, because 4 of 6 T&C
    pages would not render and the two that did were selected-items. The user's rule is narrower than that, and they
    said so: **exclude only vouchers whose card or T&C actually says "chỉ áp dụng cho một số sản phẩm/người bán
    nhất định".** A card with no such wording is counted as an ≈ estimate like any other wallet card, even when its
    T&C could not be opened. Re-reading the wallet and applying the rule as written moved the top row from
    ≈5.83M to **≈4.41M** — the error was worth 1.4 million đồng, in the direction of a worse recommendation.
    Corollary: `rankVouchers` already files card-level `Specific Product(s)` under `notForItem`, so **trust the
    bucket** — anything still in `candidates` is fair to quote, with the `≈`/UNPROVEN caveat.
49. ⚠️ **Read the T&C even when you expect app-only: `EXAMPLE25` came back `WEB-OK` (App + Web).** The skill's
    "most big Shopee % vouchers are APP-ONLY" heuristic is a prior, not a fact. When the winner is WEB-OK, App and
    Web lines are legitimately equal — say *why* they match, otherwise the report looks like the App/Web split was
    skipped (§0 rule 1 exists precisely because equal numbers usually mean an unread layer).
50. **Quote the cap's binding point, not just the cap.** `EXAMPLE25` 25% cap 2M binds only from an 8.000.000₫ order
    (cap ÷ pct); on a 5,7M order the buyer gets the full 25%, not "up to 2 triệu". The inverse case (§8.29) is the
    one that misleads — state which side of the binding point the order sits on.
51. **A tail can be dismissed with arithmetic instead of hops.** 81 of 99 listings went unread at the 45/h ceiling,
    but every unread card price was ≥ 6.20M and the card price is always ≤ the intended variant's price (true in all
    18 read), so their floor was ≥ 6.29M vs a 5.83M leader. State the coverage number **and** the bound — but still
    write "cheapest of the 18 read", per `report-template.md`.

Eighth run 2026-09-21 (a frying pan, **first run in Claude in Chrome** — the user's real Edge — plus a
deliberate hop-rate experiment the user asked for):

52. ✅ **Rate was never the trigger — the browser fingerprint was.** The pane hit `/verify/captcha` on its **first
    load at 0 hops** in the rolling hour, so no throttle setting could have prevented it. In the user's real Edge,
    with `perHour` raised 45 → 150 at the user's request, the run did **20 hops** (sweep 13 + wallet 1 + PDP 5 +
    route 1) with a peak of **13 hops in 112 s (≈418/h, ~9× the default)** and drew **no captcha and no `90309999`**.
    Measured difference: pane `outerWidth/outerHeight = 0/0` + UA token `Claude/2.2553.1`; Edge real screen size + a
    plain `Chrome/153 … Edg/153` UA. **Conclusion: in a real browser 45/h is conservative, not a ceiling**; in the
    pane no rate is safe. Still one run, one account — treat it as evidence, not proof, and keep `checkBlock`'s
    cooldown on. Note the hop counter lives in **per-profile localStorage**, so switching browsers resets it to 0.
53. ⚠️ **`XMLHttpRequest.prototype.open` was already non-native in Edge before `sh.js` loaded** — another extension
    (most likely the Claude one) patches it. So that tamper signal is not ours alone and does not go away by
    changing browser. Do not try to hide it (§2: never disguise the client).
54. ❌ **In-app route changes fire `get_pc` but do not re-render the product view in Edge.** Prices and shipping
    were right (they come from the API), but `spec`/`desc` came back empty on **all 5** PDPs and the page had no
    Buy Now button. For the checkout flow use a real `navigate` to the product URL, then BOOT.
55. ❌ **`SH.checkoutVouchers()` returns `cards: 0` on the Vietnamese UI** — `isCard` tests `/T&C|Điều kiện/` with
    **no `i` flag**, and the Vietnamese picker writes **"Điều Kiện"** (capital K). `orderTotal` still read fine, which
    is the tell. Workaround used: read `document.body.innerText` from "Giảm Giá & Hoàn Xu" onward. **Fix pending in
    sh.js** (add `i`, and match `Vui lòng mua hàng trên ứng dụng Shopee` as the app-only blocked reason).
56. ✅ Test-checkout mechanics in Edge: **Buy Now auto-ticks the new row** (it did not in the pane); the cart
    checkbox is a hidden `input.stardust-checkbox__input` — click the **`label.stardust-checkbox`**, and read state
    from the **`stardust-checkbox--checked` class or the footer total**, never from `input.checked` (stays `false`).
    Verify the footer total equals the intended variant's price before pressing **Mua Hàng**. Close the picker with
    **"Trở Lại"**, never "Đồng Ý". Checkout total **matched the estimate to the đồng** — 7th in a row.
57. ❌ **Second wallet-ranked code dead at the picker:** `MUD08SEP2` → *"Rất tiếc! Voucher này không còn hiệu lực"*,
    same message as `EXAMPLE25` (§8.48). Two for two. On web **no price-cutting voucher applied at all** — only coins
    cashback; the real money (35% cap 120k, min 0) was app-only, same pattern as the D600 run.
58. ⚠️ **"Chỉ có tại trang khám phá"** (discovery-page only) is a purchase-channel restriction the ranking does not
    model — 3 of the top 6 candidates carried it and all stayed in `candidates`. Treat it like `LIVE-`/`VIDEO-`.
59. ⚠️ **The card price was a spatula.** A best-selling pan listing, card
    129.999₫ = variant **"Thìa đặc biệt"**; the pan is 339.999₫ — and it is a **different coating** from the
    one the user asked for. A low card price with high sales is the strongest bait signal there is: always
    split variants (§3b) before ranking, and check the coating/model word in the title, not only the brand.
60. ⚠️ Wallet read in Edge was far more PARTIAL than in the pane: **83 of 1 837** cards (50/1 781 Shopee tab) vs
    354/1 950 in the pane. The UI was Vietnamese there ("Tất Cả", "Nạp điện thoại & Dịch vụ") — tab labels differ.
