# Shopee data access — what works, payload shapes

Part of the shopee-vn skill — see ../SKILL.md.

## 2. Getting data — what works and what doesn't

| approach | result |
|---|---|
| **Hook + in-app route change (`history.pushState` + `popstate`)** — what `SH.go` does | ✅ best: the page fires its own signed `search_items` / `get_pc` / `get_ratings`; 45 hops clean with v3 (2026-09-15) |
| Read rendered DOM (cart, wallet, T&C, checkout picker) | ✅ reliable, slower |
| Direct `fetch('/api/v4/search/search_items?…')` / `pdp/get_pc` | ⚠️ once per page load, then `90309999`; `item/get` always refused |
| Forging `af-ac-enc-dat` / `x-sap-sec`, retry loops on refused calls, spoofing the device/UA | ❌ never — burns the account's risk score |

`get_pc` exposes what the page hides: `item.condition` (**1 new, 4 used**), all `models[]` with `price` /
`price_before_discount`, `shop_detailed` (`ctime`, `item_count`, rating counts, `is_official_shop`, `last_active_time`),
`product_price` (may already subtract a shop voucher).

Payload shapes seen live (2026-09-15) — v3.1 reads these:
- `search_items[i]`: `item_data.tier_variations` is **null** (variant options are not in search results);
  `item_data.shop_data` = `{shop_name, shop_icon}` only; badges in `item_card_displayed_asset.seller_flag.name`
  (`PREFERRED`, `PREFERRED_PLUS`, …); ads have `adsid:null` but `item_card_displayed_asset.icon_in_image.ads_text:"Ad"`.
- `get_pc` `models[]`: `model_id` (not `modelid`); `stock`/`normal_stock` are null, only `has_stock`; the per-listing
  stock count is in the page's Product Specifications ("Stock N"), which also shows `Condition Used` when set.
- `get_pc` `product_shipping` (fees for the logged-in account's address, v3.3 reads these): channels in `ungrouped_channel_infos`
  and `grouped_channel_infos_by_service_type[].channel_infos`, each `{name, price, price_before_discount, warning}`.
  **`price_before_discount` = the fee checkout charges** (91,100 and 208,600 matched two app checkouts to the đồng);
  `price` is after a Shopee shipping promo that checkout did *not* apply in full; `shipping_fee_info.price` is a promo range
  (0–25k for a 91.1k listing) — ignore. `warning:{type:'unsupported_address'}` channels (price 0, before null) are unserviceable;
  skipping them fixed a false "ship 0k". Checkout picks the cheapest serviceable channel. `channel_promotion_infos` hold
  rules (`discount_off`, `min_spend`, `cap`) that did not reproduce the checkout's ship discount — not used.
  `data.shop_vouchers` exists (`[]` on every soft-drink listing; item fields unverified).
- Checkout line **"Ưu đãi sản phẩm"** = model `price_before_discount` − `price` (live: 300,000 − 259,000 = −41,000; "Tổng tiền hàng"
  shows 300,000). It is the shop's sale on the listing: `models[].promotion_id` + `price_stocks[].promotion_type` (301 on Mall shop A
  / Mall shop B, 324 on shop C; meaning unknown), `product_price.discount` = 14 (%). **No end time** in get_pc and
  `lowest_past_price` null → quote it as "sale price, end unknown"; `fake-was` needs ≥2 days of history. v3.3 estimates print
  `= <was> −SP <discount> …`; `price-changed-since-checkout a→b` when a recorded checkout's item price no longer matches.
  `item.stock_display` ("49") = listing stock.
