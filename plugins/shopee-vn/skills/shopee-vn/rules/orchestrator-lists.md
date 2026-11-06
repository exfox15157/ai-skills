# Orchestrator — list step: rules

Read this instead of SKILL.md. The step prompt gives the procedure (numbered steps) and the product; this file holds the
rules those steps rely on. Section tags (P1, V11 …) match SKILL.md §0a/§0b.

## Browser and library

- Browser = Claude in Chrome. Load the tools with ONE ToolSearch call:
  `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__tabs_close_mcp`.
  None exist → return status `no-chrome`.
- Own tab only (`tabs_create_mcp`); never touch or close other tabs; close yours at the end.
- READ-ONLY: never Buy Now, cart, checkout, "Lưu" / "Dùng ngay"; never type into the page; never write to any artifact or tracker; never send notifications; never passwords / OTP / QR.
  A captcha or `/verify/` page, or error `90309999` → stop and report it; never try to solve it.
- `javascript_tool`: top-level `await` works; an async IIFE returns `{}`. Output is cut at ~1 000 chars → keep outputs
  narrow (one field, short joins). Strings that look like query strings come back BLOCKED → `.replace(/[?&=]/g,' ')`.
- **BOOT** after every real page load: `window.SH ? SH.v : (localStorage.__shlib ? (0, eval)(localStorage.__shlib) : 'NEED_PASTE')`.
  `NEED_PASTE`, or a version older than line 1 of `js/sh.js` → Read `js/sh.js`, drop comment-only lines, paste it once with
  `javascript_tool` (it stores itself in localStorage). Re-run the step's `SH.use(...)` profile after EVERY BOOT.
- Never `navigate` while an `SH.*` job runs (it wipes the library and its capture hook). `await SH.wait('<job>')` blocks
  ≤ 40 s and returns progress or the result (a JSON string → `JSON.parse` it).
- The hop budget is shared by all tabs over a rolling 60 min; `SH.status()` shows it.

## GATE 0 — logged in, or no run

`/api/v4/account/basic/get_account_info` → `data.username`; `/api/v4/account/address/get_user_address_list` → the
address with `is_delivery_address: true`; report only `city + ', ' + state` (ward, province) — never name, phone or
street. Both fetches with headers `{'x-api-source':'pc'}`. No username → status `logged-out`, stop.

## Product list (search pages)

- **P1** A listing known not to deliver (key in `localStorage.<noDeliveryKey>`) is skipped: no page read.
- **P3** Bait is rejected without a page read: price ≤ ~65 % of the market band or below `minPrice`, 0 sold,
  "IB ĐẶT HÀNG" / "ib shop" / "nhắn shop đặt hàng", junk shop names, a whole shop priced uniformly low, overseas shop.
- **P4** Title suffixes matter: `…X0X` = other colours, `Y1` = another model, `-ZEX` = Japan 100 V.
- **P9** A search page renders ~12 of its 60 cards; the rest load only on a REAL mouse-wheel scroll
  (`computer scroll` 10 ticks × 4 over the grid, in one `browser_batch`). Page_Down / End / `scrollTo` do not load cards.
  Install this collector first, scroll, then read `__acc` with JS (screenshots miss cards and misread prices):
  ```js
  window.__cards=()=>[...document.querySelectorAll('a[href*="-i."],a[href*="/product/"]')].filter(a=>/\d+\.\d+/.test(a.href)&&/₫|\d\.\d{3}/.test(a.innerText));
  window.__acc=new Map(); window.__grab=()=>{for(const a of __cards()){const m=a.href.match(/i\.(\d+)\.(\d+)|product\/(\d+)\/(\d+)/); if(!m) continue;
    const t=a.innerText.split('\n').map(s=>s.trim()).filter(Boolean); __acc.set((m[1]||m[3])+'/'+(m[2]||m[4]),{title:t.reduce((x,y)=>y.length>x.length?y:x,''),
    price:t.find(s=>/^₫?[\d.]{6,}/.test(s)), sold:t.find(s=>/đã bán/i.test(s))||''});}};
  new MutationObserver(()=>__grab()).observe(document.body,{childList:true,subtree:true}); __grab(); __acc.size
  ```
  The card text also carries a pending flash price ("3?.???.???₫ 24.10") — keep it as `pending_price`.
- Mall = `official` / `is_official_shop` in the search data. Voucher Xtra = a campaign frame containing `VCX` in
  `items[k].overlay` (`items[k].vcx`), e.g. `17VCX+ShopeeHome[26.10-13.11.2026]`.
- Alternatives ("Gợi ý khác"): other colour of the same model, a higher-end or newer model of the same brand and size,
  with a real discount against the brand list price (the seller's strikethrough is often inflated), sold > 0, delivering shops.

## Voucher wallet

- **V11** `SH.wallet({order})` reads page 1 of the wallet API. Load the rest with the REAL End key: one `browser_batch`
  of [`computer key "End"` (with action_summary), `computer wait 6`] × 4, then `SH.walletPages()`; repeat until
  `done:true`, then `SH.walletRead({order})`. Keep the wallet tab in front. If End stalls, one wheel scroll, then End again.
  If page 1 is missing (the page loaded before the capture hook), click the wallet page's "Shopee" tab and then
  "Tất Cả" again, and read again. Rows come from the API with JS.
- **Wallet size (rule 2026-10-27):** `done:true` does not prove the read is complete — on 27/10 it stopped at 211
  vouchers while earlier days read 364–467, and the report said "không có voucher" for a listing where the app then
  applied freeship 97% tối đa 1Trđ + VIP 16% tối đa 300Kđ. Return `wallet_unique`, `wallet_api_done` and
  `wallet_history` (= `localStorage.__walletHist`, earlier days only), then store today's count there. The workflow
  compares today with the median of the last 7 days (below 70 % = partial). Never call a short read complete.
- Ladder input (**V1**, **V13**): from `SH.db().wallet.rows` keep platform vouchers (no shopId, not coins, not `LIVE-` /
  `VIDEO-`, not free-ship) that are not expired, valid now or starting within 7 days, and whose scope label
  (`api.scope` / `icon_text`) is not another category (Thời Trang, Khỏe & Đẹp, Hàng Quốc Tế, Xe …). The boilerplate
  "chỉ áp dụng … cho một số sản phẩm" excludes nothing. Saving = flat value, or `min(pct × order, cap)`.
- Free-ship cards ("Mã vận chuyển", `FSV-…`) go to `ship_voucher_candidates`.
- Do NOT open T&C pages or voucher product lists in this step: the workflow reads them later, only as needed.
