# Listing traps and the flags that catch them

Part of the shopee-vn skill — see ../SKILL.md.

## 4. Listing traps (each caught a real listing) — auto-flagged by `summarizePdp` unless noted

- **Express-only shops** (`express-only-shipping`): three drinks shops offer only "Hỏa Tốc"
  (208.6k for a carton); two others only Hỏa Tốc 144.6k. The same carton ships "Nhanh" for 37.7–91.1k elsewhere.
- **Shipping beats item price on heavy goods** (2026-09-15, a 24-can soft-drink carton, app checkouts, same delivery address): shop D
  235k + ship **208.6k** → 347k; Mall shop A 259k + ship **91.1k** → 240.5k. Free-ship discounts vary per shop and time:
  −49.6k / −59.6k at 13:35, but Mall shop B (another drink, 15:40) got the same 91.1k fee **fully free** → 185.6k.
  The `shipVouchers` cap is only a guess; a real checkout overrides it. → ranking by checkout total (§3); drinks, water, rice, detergent, furniture.

- **Card price = cheapest variant.** "Kingston Fury Beast 32GB" card 3.19M → the 32GB option was 11.99M, and 1×32 not 2×16. → `no-kit-model`, price comes from the kit model.
- **Bait variants from cross-border shops.** 3.56M "Asgard 2×16 CL16" / 3.58M "Hynix 16GBx2" had 2×16 at 18.6M / 13.1M.
  Signs: shop < 6 months, 800–2 700 items, dozens of models, `vận chuyển trực tiếp từ Trung Quốc`. → ≥2 of
  `new-shop / huge-catalog / many-models / price-spread / ships-from-abroad` = `LIKELY-BAIT`; `overseas` location is dropped at search stage (no hop spent).
- **Condition lies.** "chính hãng / bảo hành 2029" title, `condition: 4`. → `USED(condition=4)`; `used-words` in spec/desc (ignores `không phải hàng cũ`).
- **Title spec ≠ part number.** "3600 CL16" → `F4-3600C18D`. → `title≠part(...) CL16≠CL18` (decoder: Kingston, Corsair, G.Skill, TeamGroup, Crucial, Ballistix, ADATA).
- **Kit option sold out** (`aria-disabled` / stock 0). → `kit-sold-out`.
- **Dropship mirrors** at 2–4× market ("Phụ kiện 3C…", "TUKA-…"). → `was … vs market …` when several shops sell the same part; otherwise judge by price.
- **Shown price includes a shop voucher expiring today** (Lexar 6.31M = 6.79M − 7%). → `shown-price-includes-shop-voucher`; report both.
- **Fake "was" prices.** → `fake-was` once ≥2 days of price history exist for that model (kept 120 days in shopee.vn localStorage).
- **Stars are useless** (4.8–5.0). Read the 1-star bucket; `không <defect>` is praise.
- Large official retailers can have > 500 items: `huge-catalog` is skipped for `is_official_shop`, and alone it is only a warning.
- **Dead shop with a copied description** (2026-09-15): G.Skill Neo 5.45M, 0 sold, shop 1 rating, `last_active_time: 0`,
  title part `…32GTZN` but description part `…32GTZR`. → `desc-part≠title-part`, `few-shop-ratings`, `shop-inactive` (warn).
- **"8/16/32GB" variant listings** carry no options in search → `kit?` (soft, sent to PDP) instead of a hard reject.
  Price spread is compared **per GB**, and a part number found only in such a listing's description only warns.
- **"Newbox"** in title/description = repackaged, not sealed → `warn-word`. Condition "Used" in the spec table → `USED(spec)`.
- Titles with "(1x16)" or "các loại / đã qua sử dụng" are dropped at search stage.
- **Bundle listings ("Bộ sản phẩm … A + B") are a per-unit blind spot** (2026-09-16, a brand's Official Store): the sweep
  captured ~15 of them but `SH.report` left them in the unchecked tail, so they reached no table. Read PDPs for every
  `Bộ sản phẩm|combo|refill` title **before** writing the "Better price per unit" list. Live numbers: Foaming 473+30 =
  490k/503ml = 97.4k per 100ml vs plain 473ml bottle 484k/473ml = 102.3k — the bundle gives **+30ml for +6k**, so the plain
  bottle is never the right sub-line; the 473ml refill pouch (425k/473ml = 89.9k) still wins per unit. Two identical
  473+30 bundles exist at the same 490k (`51711094887` 656 sold, `40925900270` 4 006 sold) — quote the one with sales.
  A bundle PDP can come back with **no `product_shipping` block at all** (`45811121213` → `ship ?`); don't infer the fee
  from a sibling listing, say it is unread.
