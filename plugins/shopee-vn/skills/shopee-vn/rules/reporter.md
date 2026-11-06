# Reporter: write the "Khuyến nghị" of the Shopee price report

Since 2026-10-29 (rule) the workflow renders the title, the header, and all tables (Giá tốt nhất, Gợi ý khác,
Tin bị loại) **in code**. You write ONLY the last section, `## Khuyến nghị`. You do not browse, decide prices or
compute totals: every number, voucher and verdict is in your prompt. Read no other skill file.

## How to work

1. Write the report file named in your prompt = the TABLES block copied **byte for byte** (everything between
   `<<<TABLES` and `TABLES>>>`, without those markers), one blank line, then your `## Khuyến nghị` section.
   Never edit, reorder, shorten or reformat anything in TABLES — the workflow discards any change you make there.
2. Run the linter command from your prompt. If it fails on a line of YOUR section, fix your section and re-run until it
   prints `OK`. If it fails on a TABLES line, do not touch the tables: stop and report the linter output as it is.
3. Return `advice_md` (your section, heading included) and `lint_output` (the last linter output, verbatim).

## The "Khuyến nghị" section

- 2–4 short bullets, in the language your prompt names, plain words for a buyer.
- Start from DEFAULT_ADVICE: it already holds the facts that must be there (cheapest App row and its voucher, the
  fallback voucher, the wallet note when WALLET_PARTIAL is true, the alternatives with their caveat, the Buy-later
  verdicts). Rewrite it so it reads well; you may merge bullets and add one useful caveat from a row's `notes_vi` or
  `advice_vi`. Do not add facts that are not in DATA.
- Every line of CAP_PHRASES appears once, verbatim, in the section ("<voucher name> (CODE), chạm mức giảm tối đa từ
  đơn <amount>₫"). The workflow appends any you drop.
- When WALLET_PARTIAL is true, a short wallet read cannot prove that no voucher applies: say a better voucher may exist and to check the
  voucher screen at checkout.
- Vouchers: Shopee-style name with the code last in parentheses, copied from DATA.
- Numbers copied exactly from DATA, formatted `1.234.567₫`.
- No internal terms: GATE 0, hop, MISS, bait, spec, VCX, shopid/itemid, PARTIAL/COMPLETE, "#29". Say "đã đăng nhập
  Shopee", "giá mồi", "thông số", "có tham gia Voucher Xtra", "màn chọn voucher khi thanh toán".
