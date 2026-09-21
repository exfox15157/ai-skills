# Shopee report format (user-approved 2026-09-15)

> **Lint before sending (mandatory):** `node <this skill's folder>/tools/lint-report.js <draft.md>` must print `OK` -
> it fails any "Giá mua ngay" cell that lacks `App:` first and `Web:` second. See SKILL.md §0.

Use this exact structure for any "find / compare / what should I buy" answer. **Shopee app first, web
second** inside every cell — the app usually has the bigger vouchers (most % and free-ship vouchers
are app-only). Mark every number as ✅ verified (seen at checkout) or ≈ estimate.

**Write the report in the language the user asked in** (rule 2026-09-16): a Vietnamese prompt gets a Vietnamese
report, an English prompt an English one. This covers the headings too — "Best prices" / "Better price per unit" become
"Giá tốt nhất" / "Giá tốt hơn trên mỗi đơn vị". Listing titles, shop names and voucher codes stay verbatim as Shopee
shows them; never translate those. If the prompt mixes languages, follow the language of the request itself, not of the
product name pasted into it.

## 1. Header (2–4 lines)

**Precondition — the report does not exist without a logged-in session** (SKILL.md GATE 0). If the account check returned
no `username`, there is no report to write: say the run is paused until the user logs in, and explain why in one line
(no address means no shipping fee, no wallet means no voucher layer — the ranking would be wrong, not just rough).
Never fill the header with card prices from a logged-out page.

**Precondition 2 - the voucher layer must have been READ** (SKILL.md §3 step 5, enforced by `SH.report()` since v3.6).
If `SH.report()` returns `voucherGate: REFUSED`, there is no table to write yet: the withheld rows are no-voucher
ceilings, not prices. Read the wallet (`SH.wallet` -> `SH.config`) or prove the listings (`SH.picker`/`SH.checkout`)
first. Do not reconstruct the withheld totals by hand from `SH.detail()` or `db.pdp` - hand-copying the numbers past a
gate is the same error the gate exists to prevent. If the wallet was read and holds nothing applicable, set
`SH.config({vouchersNone:true})` and say so in the header, so the reader can tell 'no voucher exists' from 'not checked'.

```markdown
# <Category> shortlist — Shopee app first (checked <date>)

Signed in as **<username>** · shipping to **<ward, province>** (account default address, both read this session).
Read via **Claude in Chrome** (the user's own Chrome/Edge) — or, if the pane was used: "in-app pane, because <the user
declined / could not install Claude in Chrome>" (SKILL.md §1).

**These numbers are for this account only.** Shipping is quoted to that address — a different address changes the fee and
can change **which shop is cheapest**, not just the total. Voucher savings come from this account's own wallet. Card prices
may already include a platform voucher tied to the session. Nobody else will see the same totals on these listings.

Only <item> web checkout is ✅ confirmed; every app price is an estimate until the app's voucher list applies it.
App coupons used in the estimates:
- **<Voucher name> <X>% off, max <cap>, orders from <min>.** Code <code>. **App only, only on <date> (<time window>)**, limited quantity.
- **<Free-shipping voucher>**, app only, valid until <date>.

**On web today:** <what the checkout picker showed, e.g. "125 of 128 blocked; only Coins cashback">. One Shopee voucher per order = **one item per order**.

**Coverage:** <N> listings swept · <M> product pages read · **<K> still unchecked**<br>
<one line naming what is in the unchecked tail if K > 0, e.g. "4 'Bộ sản phẩm' bundles — per-unit winners may be hiding there">
```

The **Coverage line is mandatory** (rule added 2026-09-16 after a run reported 24 of 284 listings and silently dropped the
bundle family the user then found themselves). While `K > 0`: no row may be called "cheapest" or "best per unit" — write
"cheapest of the <M> read". An unchecked listing is **not** a rejected one and never goes in the §3 table.

## 2. Main tables — two lists, both with exactly these 6 columns

Two separate tables under these exact headings, best pick first in each:

### Best prices
The straight price answer: cheapest checkout total, ~3 rows.

### Better price per unit
Bigger size, refill, bundle/combo or a promo that wins on price per unit — rows numbered on from the first list.
Omit this table only when the sweep genuinely has nothing that beats the first list per unit; say so in one line.

**Gate: do not write this table while any `bộ sản phẩm|combo|refill|túi|set|<n> + <n>` listing is still unread** — those are
exactly the rows a checkout-total ranking buries, since a bigger pack always costs more in total. Queue them first (SKILL.md
§3), then compute ₫/unit for every candidate and sort *this* table by that number, not by total.

| Product | Rating (caveats from comments) | Listing price | Buy now price | Buy later price | Short buying guide |
|---|---|---|---|---|---|

Cell rules (identical for both tables):
- **Product**: `**N. [Brand model key specs](https://shopee.vn/product/<shopid>/<itemid>)**<br>Shop: <name>`
- **Rating (caveats from comments)**: kit ★ and review count (say "**no reviews**" plainly) · shop ★, total
  ratings, joined year/month · 1–2 lines paraphrasing what comments actually say · `⚠️` caveats: few reviews,
  new shop (<6 months), spec contradictions (chip/part number), missing voltage/height/CL, used-stock hints,
  low stock, copied description.
- **Order of rows**: see "Row order" below. Never item price. A row without a shipping figure goes last and says "shipping unknown".
- **Listing price**: `**<price>₫**<br>(was <strikethrough>₫, −N%, **1 per buyer** if seen)<br>Shipping <fee>₫`.
  Use the exact model price from `get_pc`, not the card price. Always show `Shipping <fee>₫` from the row's `ship`; `?` when unread.
**The Buy now cell is four layers, and it must show which ones were read** (rule 2026-09-16). Build it from
`SH.report()`'s row, never by hand from `db.pdp` — hand-built cells are how a real shop voucher (`PHARMSP35`, −35.000₫)
got dropped. Order: **shop voucher → platform voucher on the amount after it → shipping → free-ship voucher.**
- If the row carries **`[NOT COUNTED: …]`**, that number is a **no-voucher ceiling, not a buy-now price.** Label it as such
  ("chưa trừ voucher nào"), list the missing layers, and do **not** rank it against a row that has them.
- Mark each cell's proof: **✅ recorded checkout · ✓ picker-backed (`SH.picker`) · ≈ estimate.** If App and Web show the
  same number, that is the tell that no voucher layer ran — say so rather than printing it twice.
- A row flagged `multi-variant: priced at the CHEAPEST of N options` is priced from the wrong variant until you re-price
  the one you actually mean. Never quote it as-is.

**Selected-products vouchers are excluded** (rule 2026-09-17): a card or T&C saying "chỉ áp dụng cho một số sản phẩm"
never appears in a price cell until a checkout picker applied it. Picker-proven vouchers (e.g. 16% cap 300k) ARE counted -
exact on the proven listing, ≈ on sibling listings with "proven on <shop>".

Voucher data for both price columns comes from `SH.rank` buckets (SKILL.md §5a), never the raw wallet order.
Each cell is a price **with the vouchers that produce it**, app line first, web line second:
- **Buy now price** — vouchers usable today (`useNow`, else the best `candidates`):
  `**App: <price>₫** ✅ picker` (or `≈<price>₫, unproven` with no picker read)<br>
  `<Shopee voucher, e.g. 19% max 1M> + <free ship> (+ <shop voucher>) = −<saving>₫`, and `⏳ expires <when>` if `EXPIRES<24h`<br>
  `**Web: <price>₫** ✅ checkout` (or `≈`) `<vouchers that apply on web, or "no voucher">`.
  If `notForItem` holds bigger cards, add one clause: "24%/22% in wallet don't apply to this item".
- **Name the voucher, not just the saving** (rule 2026-09-16). The App line of *Buy now price* must say **which**
  voucher produces the app-only extra, by **code**, with its real terms and the actual dong amount:
  `App re hon Web <delta>d nho ma **<CODE>** (<pct>% toi da <cap>, don tu <min>) - app-only`.
  A percentage whose cap binds is quoted as the cap, and the cell says so: a 16%-cap-300k card on a 10M order is a
  **flat 300k (3%)**, not '16% off'. State the order value at which the cap starts binding (cap / pct) when it is
  below the item price - that is what tells the reader the headline % is not what they get.
  Shipping is already covered by the `Shipping <fee>d` line in *Listing price* plus the ship-discount clause here; do not
  drop either. If a ship waiver was seen at checkout but matches **no** free-ship card in the wallet, say it is a Shopee
  shipping promo of unknown origin rather than crediting a voucher that was never proven to apply.
  Only one Shopee platform voucher applies per order, so when a second, bigger platform voucher becomes valid later,
  the two are **mutually exclusive** - the *Buy later* cell must name which code replaces which, and the delta.
- **Buy later price** — answers one question: **is it worth waiting?** It weighs two inputs and the cell must show
  both (rule 2026-09-21; `tools/lint-report.js` fails any Buy-later cell with no price-history verdict):
  1. **Price history of the exact variant** — from `db.prices` with the SKILL.md §3d one-liner (no hops). Compare
     today's **model price** — not the card price, not the checkout total, since vouchers and shipping change daily —
     with the lowest price this variant has been logged at:
     - **fewer than 7 distinct days logged** → `Lịch sử: chưa đủ (<N> ngày theo dõi) — chưa kết luận được`.
       Never call a one-day log "giá thấp nhất lịch sử".
     - **today ≤ lowest + 2 %** → `Lịch sử: đang ở đáy (thấp nhất <low>₫ ngày <date>, <N> ngày theo dõi) — không đáng chờ vì giá`.
     - **today > lowest + 2 %** → `Lịch sử: từng rẻ hơn <gap>₫ (−<pct>%) ngày <date>, <N> ngày theo dõi` — a real
       precedent. Name the next sale date that could repeat it (SKILL.md §5b calendar: 10.10, 11.11, 12.12, the 25th,
       mid-month payday) and quote `<low>` as the **target price**, never as a promise.
     - Also say when `fake-was` fired, and when the listing's own title claims "giá thấp lịch sử" — that is seller
       marketing, not evidence (2026-09-21 it sat on the price of a spatula variant).
  2. **Voucher calendar** — a `later` voucher that beats today (`extraVsNow` > 0 on that channel):
     `**App <date>: ≈<price>₫**`<br>`<later voucher, e.g. ShopeeVIP 25% max 3M, 20 Sept only> + <free ship> = −<saving>₫ (+<extraVsNow>₫ vs now)`<br>
     `eligibility unproven · limited quantity` as they apply. Add a **Web <date>** line only if a web-valid later voucher beats web-now.
  **Verdict — always the last line of the cell:**
  - `**Đáng chờ tới <date>, mục tiêu ≈<price>₫**` only when the expected saving (history gap and/or `extraVsNow`)
    is **≥ 5 % of today's buy-now price** and none of these outweighs it: stock ≤ 10; today's best voucher expiring
    first (`EXPIRES<24h`); a limited-quantity voucher already "đang hết nhanh" / "đã dùng 9x%".
  - Otherwise `**— Không đáng chờ**` plus the single deciding reason. **A bare `—` is no longer valid.**
  - When history is too short *and* no later voucher beats today, say so: the verdict then rests on the voucher and
    stock risks alone, and the reader should know history could not be used.
  Note if the listing's sale price or shop voucher may end before that date.
  Keep the voucher names and totals of both columns in sync with the header's voucher list.
- **Short buying guide**: `**App:**` step-by-step: date → claim shop voucher → cart, tick only this item, qty →
  pick Shopee voucher + free ship → expected total → Place Order (by the user). Then `**Web:**` when it's
  worth it (e.g. only tonight with a shop voucher, or for 0% installments). Pre-purchase chat questions if the
  listing is doubtful. Put **price per unit** (₫/ml, ₫/100 g, ₫/stick) here for every row — it is what makes the
  rows 4+ case visible. Columns stay as above; this is a cell, not a new column.

### Row order (rule 2026-09-16) — selection only, the 6 columns never change

1. **One shop, one row _within_ a list.** No seller appears twice in **Best prices**, and no seller appears twice in
   **Better price per unit**. A shop **may** appear once in each list — that is expected, since the cheapest seller of the
   small size is often also the one with the refill or bundle. Name the shop on every row so repeats are visible.
   A shop's runner-up inside the same list goes as a `<br>` sub-line in that shop's row, never as another row.
   **Pick that sub-line on the list's own axis**: in **Better price per unit** the runner-up is the shop's *next best ₫/unit*,
   not its next cheapest item. (2026-09-16: the cleanser row named the plain 473ml bottle at 102.3k/100ml as the refill's
   sub-line while the same shop's 473+30 bundle at 97.4k/100ml — +30ml for +6k, i.e. strictly better than that bottle —
   sat unread. Naming a dominated item as the alternative is the visible symptom of an unfinished PDP loop.)
2. **Best prices = cheapest checkout total** (`SH.report()` `pdp` order: item − vouchers + shipping). Keep the rows directly
   comparable — same product and size where possible, so the reader sees which shop is actually cheapest.
3. **Better price per unit = a different axis, not more price rows**: bigger size or refill, bundle/combo that beats buying
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

## 5. Reminder offer (last line, when a date matters)

`Want a reminder on <date> <time> to buy <top pick> in the Shopee app?` — see SKILL.md §5b.
