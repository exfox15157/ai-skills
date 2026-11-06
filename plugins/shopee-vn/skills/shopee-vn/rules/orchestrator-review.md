# Orchestrator — review step: rules

Read this instead of SKILL.md and report-template.md. No browser in this step. The step prompt gives the plan, the
scanners' results, the output schema and the procedure. Prices, shop vouchers, shipping and all totals are set by the
workflow code from the scans: leave the amount fields as the scan gives them. Tags match SKILL.md §0a/§0b.

## Retries

Retry a product page (at most once per page) when: the page failed, `variants` is not a JSON array, the requested option
has `ok` false, a delivering listing has no ship fee, or a ship fee ≥ half the item price (P6). Round 2 never retries.

## Which listing and option

- **P2** Pick the option the user asked for from `variants` and put its `o` in `variant` exactly. Drop gift ("Quà tặng")
  and HẾT/KHÓA options. Other options of the same listing go to "Gợi ý khác" only when they are a real deal.
- **P4** Title model ≠ spec model, or a wrong suffix (`…X`, `Y1`, `-ZEX`) → do not rank it as the requested product.
- `condition` other than "NewCondition" → reject the listing as used stock, whatever the title says.
- **P7** "Chính hãng" / Mall ≠ cheapest; rank inside one model and size.
- No-delivery listings (P1) are excluded and only counted. Unknown shipping (`ship_struck` -2) → "phí ship chưa đọc được"
  in `notes_vi`.
- `is_mall` and `vcx`: from the product page when it says so, else from the plan's `listing_meta`; `ship_channel` = the
  channel word from the popup (e.g. "Hàng Cồng Kềnh"); running / upcoming flash and the campaign window → `flash_vi`.

## Text fields per row (rule 2026-10-29 — the tables are rendered in code from these fields)

- `rating_vi`: ONLY stars, review count and sold — "4.4 sao (25 đánh giá) · đã bán 134", "Chưa có đánh giá · chưa có
  lượt bán". No Mall flag (code adds it from `is_mall`), no warranty, shipping, stock or "Giá Sau Voucher" notes, no ⚠️.
- `advice_vi` (best / alt rows): at most ONE short sentence with the caveat that changes the buy decision — e.g.
  "Bảo hành 12 tháng (shop H 24 tháng).", "Hỏi shop về tình trạng hàng, hóa đơn và bảo hành hãng trước khi mua.",
  "Model khác (R-AB640Y1), không phải bản yêu cầu." Empty when nothing changes the decision. Printed in "Gợi ý mua".
- `notes_vi`: rejected rows → the reason, printed in "Tin bị loại". Best / alt rows → background caveats for the
  recommendation writer only; NOT printed in the tables.

## Output

- Structured rows. `table` = best (requested variant), alt (Gợi ý khác), rejected. No totals, no script.
- "Gợi ý khác" rows: the axis (màu khác / đời cao hơn / mới hơn / ₫ per unit) and why it is worth a look.
- Every text field (`header_vi`, `*_vi`, `*_name`) is written in the report language for the buyer, in plain words: GATE 0 → "đã đăng nhập Shopee"; hop → "lượt quét"; MISS → "lượt lỗi"; bait → "giá mồi";
  spec → "thông số"; VCX / vcx:true → "có tham gia Voucher Xtra"; PARTIAL / COMPLETE → "ví chỉ đọc N/M" / "ví đã đọc đủ";
  shopid/itemid → "link"; wallet indices (#29) → describe the card; picker → "màn chọn voucher khi thanh toán".
  Vouchers are named like Shopee's card with the code last in parentheses ("Giảm 1Trđ đơn tối thiểu 20Trđ (CODE)").
- The header has two items only: the login + delivery address line, and the
  coverage line (swept / pages read / unchecked / no-delivery / bait counts).
