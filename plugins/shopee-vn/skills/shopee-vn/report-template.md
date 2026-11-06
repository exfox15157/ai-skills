# Shopee report format (user-approved 2026-09-15)

> **Lint before sending (mandatory):** `node <this skill's folder>/tools/lint-report.js <draft.md>` must print `OK` -
> it fails any "Giá mua ngay" cell that lacks `App:` first and `Web:` second. See SKILL.md §0.

Use this exact structure for any "find / compare / what should I buy" answer. **Shopee app first, web
second** inside every cell — the app usually has the bigger vouchers (most % and free-ship vouchers
are app-only).

**Write the report in the language the user asked in** (rule 2026-09-16): a Vietnamese prompt gets a Vietnamese
report, an English prompt an English one. This covers the headings too — "Best prices" / "Other suggestions" become
"Giá tốt nhất" / "Gợi ý khác". Listing titles, shop names and voucher codes stay verbatim as Shopee
shows them; never translate those. If the prompt mixes languages, follow the language of the request itself.

**Plain words for the buyer** (rule 2026-10-22): no internal terms in the report — not GATE 0, hop, MISS, bait,
spec, VCX, shopid/itemid, PARTIAL/COMPLETE, wallet indices like "#29". Say "đã đăng nhập Shopee", "lượt quét", "giá mồi",
"thông số", "có tham gia Voucher Xtra", "ví đã đọc đủ / ví chỉ đọc N/M". `tools/lint-report.js` fails them, and also fails a
voucher code written bare anywhere in the document (not only in price cells), a % voucher without "chạm mức giảm tối đa
từ đơn <cap/pct>", and a Buy-later voucher that does not say which voucher it replaces ("thay cho …").

## 1. Header (2 items only: address line + coverage line)

**Precondition — the report does not exist without a logged-in session** (SKILL.md GATE 0). If the account check returned
no `username`, there is no report to write: say the run is paused until the user logs in, and explain why in one line
(no address means no shipping fee, no wallet means no voucher layer — the ranking would be wrong, not just rough).
Never fill the header with card prices from a logged-out page.

**Precondition 2 - the voucher layer must have been READ** (SKILL.md §3 step 5, enforced by `SH.report()` since v3.6).
If `SH.report()` returns `voucherGate: REFUSED`, there is no table to write yet: the withheld rows are no-voucher
ceilings, not prices. Read the wallet (`SH.wallet` -> `SH.config`) or prove the listings (`SH.picker`/`SH.checkout`)
first. Do not reconstruct the withheld totals by hand from `SH.detail()` or `db.pdp` - hand-copying the numbers past a
gate is the same error the gate exists to prevent. If the wallet was read and holds nothing applicable, set
`SH.config({vouchersNone:true})` and say so in each Buy-now cell ("ví không có voucher dùng được"), so the reader can tell 'no voucher exists' from 'not checked'.

```markdown
# <Category> — Shopee app first (checked <date>)

Đã đăng nhập Shopee · giao tới **<ward, province>** (địa chỉ mặc định của tài khoản).

**Coverage:** <N> listings swept · <M> product pages read · **<K> still unchecked**<br>
<one line: how many match the model, how many do not deliver to the address, how many are bait, how many are left;
if K > 0, name what is in the unchecked tail>
```

**Nothing else above the tables** (rule 2026-10-23). Do NOT write: the browser used, the wallet read count, the
"these numbers are for this account only" paragraph, a "vouchers usable today / opening later" list, an "on web today"
line, or an "open questions / còn bỏ ngỏ" line. That information still reaches the reader where it is used: every voucher
is named in the cell that uses it (name + (CODE)), with "chạm mức giảm tối đa từ đơn …" once in "Khuyến nghị"; the
Buy-now cell holds only the App and Web calculations (rule 2026-10-26), fallbacks go in "Gợi ý mua", excluded
vouchers are not listed, flash prices go in the Buy-later cell, later vouchers with their window in the Buy-later cell, and anything that changes the
decision (a PARTIAL wallet, an unread shipping fee, a hidden flash price) in the cell of the row it affects.

The **Coverage line is mandatory** (rule added 2026-09-16 after a run reported 24 of 284 listings and silently dropped the
bundle family the user then found themselves). While `K > 0`: no row may be called "cheapest" or "best per unit" — write
"cheapest of the <M> read". An unchecked listing is **not** a rejected one and never goes in the §3 table.

## 2. Main tables — two lists, both with exactly these 6 columns

Two separate tables under these exact headings, best pick first in each:

### Best prices
The straight price answer: the **3 cheapest** checkout totals (min of App, Web), **one shop per row** — never more (rule 2026-10-29: the A07s report went out with 58 rows; `renderReport` cuts to `maxBest` = 3, the linter fails a 4th row or a repeated shop). The other listings are only counted in the coverage line.

### Other suggestions (Gợi ý khác)
(Rule 2026-10-22, replacing "Better price per unit".) Deals the user did not ask for but would want to see — rows
numbered on from the first list, ~3–5 rows, each on one of these axes:
- **Màu khác / phân loại khác** of the same model (another colour, size or edition from the listings' "Phân loại"
  options, SKILL.md §0a P10) when it is cheaper or discounted harder than the requested option.
- **Đời cao cấp hơn / mới hơn** of the same brand and size class (e.g. a premium line or the successor model) whose
  discount against the **brand list price** is deeper than the requested product's, so the step up costs little.
- **Giá tốt hơn trên mỗi đơn vị**: bigger size, refill, bundle/combo or a promo that wins on price per unit (the old table).
- **Shop uy tín** (rule 2026-10-29): the cheapest listing of a trusted shop when "Giá tốt nhất" does not already
  hold it — Shopee Mall, listing ≥ 4.8 sao, ≥ 5 đánh giá, ≥ 50 đã bán (`trustedShop` in the workflow args). Added by
  `renderReport` in code, not chosen by an agent.
Every row's Product cell **leads with the short reason** (rule 2026-10-29), then the title link, then the shop:
`**4. Mẫu cao cấp hơn**<br>[title](link)<br>Shop: …` — labels: Mẫu cao cấp hơn / Mẫu mới hơn / Màu khác: <màu> / Rẻ hơn
trên mỗi đơn vị / Shop uy tín (the linter fails a cell that does not start this way). Every row is priced exactly like the main table (best usable voucher, shipping), and
the Short buying guide says **the difference vs the requested product's best row** ("+1,2tr so với bản yêu cầu rẻ nhất, được thêm …").
Omit the table only when the sweep genuinely has nothing on any axis; say so in one line.

**Gate: do not write per-unit rows while any `bộ sản phẩm|combo|refill|túi|set|<n> + <n>` listing is still unread** — those are
exactly the rows a checkout-total ranking buries, since a bigger pack always costs more in total. Queue them first (SKILL.md
§3), then compute ₫/unit for every candidate and sort those rows by that number.

| Product | Rating (caveats from comments) | Listing price | Buy now price | Buy later price | Short buying guide |
|---|---|---|---|---|---|

Cell rules (identical for both tables):
- **Product**: `**N. [Brand model key specs](https://shopee.vn/product/<shopid>/<itemid>)**<br>Shop: <name>`
- **Rating (caveats from comments)**: kit ★ and review count (say "**no reviews**" plainly) · sold · Mall or not.
  **Nothing else** (rule
  2026-10-29): no `⚠️` listing caveats here (warranty, "Giá Sau Voucher", ship-from, stock, model differs, new shop,
  spec contradictions) — a caveat that changes the buy decision goes in "Short buying guide", the rest is dropped.
- **Order of rows**: see "Row order" below. Never item price. A row without a shipping figure goes last and says "shipping unknown".
- **Listing price**: `**<price>₫**<br>(was <strikethrough>₫, −N%, **1 per buyer** if seen)<br>Shipping <fee>₫`.
  Use the exact model price from `get_pc` (the card price is the cheapest option, often another variant or a gift). Always show `Shipping <fee>₫` from the row's `ship`; `?` when unread.
**The Buy now cell is rendered by `renderReport` from the rows (SKILL.md §1c).** Layer order: shop
voucher → platform voucher on the amount after it → shipping → free-ship voucher.

**Best usable voucher** (rule 2026-10-22, replacing the 2026-09-17 exclusion): the boilerplate
"chỉ áp dụng cho một số sản phẩm" alone excludes nothing. Per listing, drop only vouchers a concrete fact rules out (scope
label, Mall-only, Voucher Xtra on a non-VCX shop, min, dates, device, picker-blocked), rank the rest by saving and price the
Buy-now cell with the best one as ≈ "chưa chứng minh", naming the runner-up as fallback. Picker-proven vouchers (e.g. VIP 16%
cap 300k) are exact (✓/✅) on the proven listing, ≈ on sibling listings with "proven on <shop>".

**Vouchers with their own product list** (rule 2026-10-23, SKILL.md §0b V12): a voucher with `product_limit` is
named in a Buy-now / Buy-later cell only after its product list ("Dùng Ngay" page, filtered by the model) was checked for
that listing, top voucher first, falling to the next one when the listing is not in it. Say it in plain words in the cell
("đã kiểm tra: sản phẩm này có trong danh sách áp dụng của voucher" / list the ones that do not apply) — or "chưa kiểm tra
được danh sách sản phẩm" when the page could not be read.

Each cell is a price **with the vouchers that produce it**, app line first, web line second:
- **Buy now price** — `**App: <total>₫** = <item> − <shop voucher> (mã shop) + ship <fee> − <saving> [<voucher>]`<br>
  and the same `**Web: …**` line. Nothing else in the cell.
- **Name the voucher with the saving** (rule 2026-09-16): **described the way Shopee's card describes it, code
  last in parentheses** (rule 2026-10-02 - a bare code like `EXAMPLEVIP8` is unreadable for the user), e.g.
  `Giảm 16% tối đa 300Kđ (EXAMPLEVIP8)`. Flat: `Giảm 50Kđ (CODE)`; free ship:
  `Miễn phí vận chuyển tối đa 100Kđ (CODE)`; add `đơn tối thiểu <min>Kđ` before the parentheses only when the order is
  near the minimum. No code known -> no parentheses. `tools/lint-report.js` fails a code written outside `( )`.
  The order value at which a % voucher's cap starts binding (cap / pct) goes once in "Khuyến nghị" as
  "chạm mức giảm tối đa từ đơn <amount>₫". Shipping shows in *Listing price* as `Phí vận chuyển <fee>₫`.
  If a ship waiver was seen at checkout but matches **no** free-ship card in the wallet, say it is a Shopee
  shipping promo of unknown origin.
  Only one Shopee platform voucher applies per order, so when a second, bigger platform voucher becomes valid later,
  the two are **mutually exclusive** - the *Buy later* cell must name which code replaces which, and the delta.
- **Buy later price** — answers one question: **is it worth waiting?** It rests on the **voucher calendar, sale end
  times and stock** only. **No price-history line** (rule 2026-09-23, replacing the 2026-09-21 one): the local
  `db.prices` log is one day deep on almost every listing, Shopee's `lowest_past_price` is null, and the third-party
  trackers checked that day (lichsugia.com: live price only, no chart; muathongminh.com: domain now a different site;
  AliPrice / "Shopee price tracker": unverified, broad permissions) proved nothing. `tools/lint-report.js` fails a
  Buy-later cell containing `Lịch sử: …` / `Price history: …`. `fake-was`, when it fires, still goes in the Rating
  caveats, and a title claiming "giá thấp lịch sử" is seller marketing — say so there.
  **Voucher calendar** — a `later` voucher that beats today (`extraVsNow` > 0 on that channel):
     `**App <date>: ≈<price>₫**`<br>`<later voucher, e.g. Giảm 25% tối đa 3Trđ (CODE) [0h00 20/09 - 23:59 20/09 - Số lượng: ?]> + <free ship> = −<saving>₫ (+<extraVsNow>₫ vs now)`<br>
     `eligibility unproven · limited quantity` as they apply. Each voucher here carries its `[bắt đầu - kết thúc - Số lượng: N]` (below). Add a **Web <date>** line only if a web-valid later voucher beats web-now.
  **Voucher window + quantity — after EVERY voucher in this cell** (rule 2026-10-09). Right after the voucher
  name and its `(CODE)`, write `[<bắt đầu> - <kết thúc> - Số lượng: <n>]`, e.g.
  `Giảm 20% tối đa 4,5Trđ (00000000GIAM4500K0) [0h00 10/10 - 23:59 10/10 - Số lượng: 150]`.
  - Times in Vietnam time (+07), format `HHhMM DD/MM` for the start and `HH:MM DD/MM` for the end, as in the example.
  - Sources, best first: the voucher's T&C page (`SH.tc`, "Thời gian sử dụng" / "Số lượng"), the checkout picker,
    the wallet API row (`SH.db().wallet.rows[i].api` → `startsAt` / `endsAt`; `startsAt` is null once the voucher
    has started), the card text ("Hiệu lực sau: 14 giờ", "HSD: 31.10.2026", "Đã dùng 59%").
  - **Never invent a part.** Unknown → `?`: `[? - 23:59 10/10 - Số lượng: ?]`. When only the card says it,
    write what it says: `Số lượng: có hạn, đã dùng 59%`. An already-running voucher whose start was not read →
    `đang chạy`. The bracket itself is mandatory — `tools/lint-report.js` fails a Buy-later voucher without it.
  **Verdict — always the last line of the cell:**
  - `**Đáng chờ tới <date>, mục tiêu ≈<price>₫**` only when the expected saving (`extraVsNow`)
    is **≥ 5 % of today's buy-now price** and none of these outweighs it: stock ≤ 10; today's best voucher or sale
    ending first (`EXPIRES<24h`); a limited-quantity voucher already "đang hết nhanh" / "đã dùng 9x%".
  - Otherwise `**— Không đáng chờ**` plus the single deciding reason. **A bare `—` is not valid** (linter checks).
  Note if the listing's sale price or shop voucher may end before that date.
- **Short buying guide**: `**App:**` step-by-step: date → claim shop voucher → cart, tick only this item, qty →
  pick Shopee voucher + free ship → expected total → Place Order (by the user). Then `**Web:**` when it's
  worth it (e.g. only tonight with a shop voucher, or for 0% installments). Pre-purchase chat questions if the
  listing is doubtful. Put **price per unit** (₫/ml, ₫/100 g, ₫/stick) here for every row — it is what makes the
  rows 4+ case visible. Columns stay as above; this is a cell.

### Row order (rule 2026-09-16) — selection only, the 6 columns never change

0. **Best prices is sorted by the cheapest buy-now total of each row — min(App, Web) — smallest first** (rule
   2026-10-29). A row with unknown shipping goes last. The linter fails a Best-prices table out of this order.

1. **One shop, one row _within_ a list.** No seller appears twice in **Best prices**, and no seller appears twice in
   **Other suggestions** on the same axis. A shop **may** appear once in each list — that is expected, since the cheapest seller of the
   small size is often also the one with the refill or bundle. Name the shop on every row so repeats are visible.
   A shop's runner-up inside the same list goes as a `<br>` sub-line in that shop's row.
   **Pick that sub-line on the list's own axis**: in the per-unit rows of **Other suggestions** the runner-up is the shop's *next best ₫/unit*,
   not its next cheapest item. (2026-09-16: the cleanser row named the plain 473ml bottle at 102.3k/100ml as the refill's
   sub-line while the same shop's 473+30 bundle at 97.4k/100ml — +30ml for +6k, i.e. strictly better than that bottle —
   sat unread. Naming a dominated item as the alternative is the visible symptom of an unfinished PDP loop.)
2. **Best prices = the option the user asked for only** (colour/size/edition from "Phân loại"),
   **cheapest checkout total first** (min(App, Web), sorted by `renderReport`). Keep the rows directly
   comparable — same product and size where possible, so the reader sees which shop is actually cheapest.
3. **Other suggestions = a different axis** — other options/colours, higher-end or newer models with
   deeper discounts (vs brand list price), and per-unit deals: bigger size or refill, bundle/combo that beats buying
   the parts separately (show the subtraction), an item that crosses a voucher's min-spend the small one misses, or a
   genuinely interesting promo. Every row states its axis, shows the arithmetic, and gives price per unit.
   Exclude what cannot be bought: "QUÀ TẶNG KHÔNG BÁN" gift SKUs, decanted/minisize combos, combos with worse per-unit
   than the plain bottle — those go to §3 with the reason.

## 3. Rejected listings (2 columns)

| Listing | Why |
|---|---|
| "<title>", <price> | Bait variant / Used / wrong CL / dropship mirror… |

## 4. Recommendation (2–4 lines)

Tie to the user's actual hardware/need, name the top pick with its app price and date — state **buy now vs wait**
by comparing the two price columns / `advice` (e.g. "today −1.00M proven; 20 Sept adds ≤325k, unproven, limited quantity → buy now"), one alternative
for each important constraint (e.g. low-profile), and remind that limited-quantity vouchers go early.
