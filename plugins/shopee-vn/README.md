# shopee-vn — Claude skill for shopping on Shopee Vietnam

A Claude Code / Agent Skill that shops on **Shopee Vietnam (shopee.vn)** from **your own logged-in browser**. It searches hundreds of listings, re-prices the exact variant you want, flags listings whose title lies, and works out which of **your** vouchers really apply. The result is the **true checkout price**, not the card price.

*Tiếng Việt: skill cho Claude giúp tìm, so sánh và tính **giá thanh toán thật** trên Shopee Việt Nam, kể cả phí ship và mã giảm giá bạn thực sự dùng được, ngay trong trình duyệt bạn đã đăng nhập. [Xem phần tiếng Việt ↓](#tiếng-việt)*

---

## Why

The price on a Shopee search card is often not the price you pay:

- **Card price = cheapest variant.** The card can show an accessory or a smaller size. It can even show a different brand added as a variant.
- **Shipping depends on your address.** The same carton shipped for 37.7k, 91.1k or 208.6k depending on the shop, which changed which shop was cheapest.
- **Vouchers depend on your account.** In one test the web checkout blocked 125 of 128 wallet vouchers for the item. Wallet cards are marketing; only the checkout picker shows what applies.
- **Titles lie.** Items marked "new" were used, the part number didn't match the title spec, the kit option was sold out, or cross-border shops offered bait variants.

This skill checks each of these, and every price it reports says which layers were verified (✅ checkout, ✓ picker, ≈ estimate).

## What it does

| | |
|---|---|
| 🔎 Sweep | Vietnamese terms **and** exact part numbers × sorts × pages. One query finds about 40 listings; a sweep finds hundreds |
| 🧾 Re-price | Reads every variant, stock, condition, shop age and shipping fee to your default address |
| 🚩 Flag traps | `USED`, `LIKELY-BAIT`, `title≠part`, `kit-sold-out`, `express-only-shipping`, `fake-was` (price history), … |
| 🎟️ Vouchers | Checks wallet → T&C → checkout picker; tags App-only / Web-OK / selected-items / Live-only; ranks buy-now vs wait |
| 📊 Report | Two tables, **Best prices** and **Better price per unit**, with App and Web price lines, checked by a linter |
| ⏰ Reminders | Offers a scheduled reminder when a voucher or sale starts later |

It **never** places an order, chooses a payment method, edits your address, or types passwords, OTPs or card data.

## Example prompts

```
tìm kit RAM DDR4 32GB 3200 rẻ nhất trên shopee, giao về địa chỉ của tôi
so sánh giá thùng nước ngọt 24 lon, tính cả ship và voucher
mã giảm giá nào trong ví của tôi áp dụng được cho sản phẩm này?
find the cheapest foaming facial cleanser per 100ml on Shopee
```

## Install

### As a Claude Code plugin (recommended)

```
/plugin marketplace add exfox15157/ai-skills
/plugin install shopee-vn@ai-skills
```

### As a plain skill

Copy `plugins/shopee-vn/skills/shopee-vn/` from this repo to `~/.claude/skills/shopee-vn/`.

### Other agents

The skill folder follows the [Agent Skills](https://agentskills.io/specification) format, so any agent that reads `SKILL.md` can load it. **Tested with: Claude Code.** The instructions use Claude tools by name (Claude in Chrome, ToolSearch, scheduled tasks). Another agent needs equivalent tools to run the page library in a logged-in tab.

### Requirements

- Claude Code (CLI or desktop app) with skills enabled.
- **[Claude in Chrome](https://chromewebstore.google.com/)** extension in Chrome or Edge, signed in with the same Claude account. The built-in browser pane also works, but Shopee often shows it a captcha on the first load. See `SKILL.md` §1.
- A Shopee VN account, **logged in by you** in that browser.
- Node.js 18+ (only for the report linter and the tests).

## How it works

Everything runs as JavaScript **inside the shopee.vn page** you are logged into (`js/sh.js`, stored in that origin's localStorage after the first paste). The library lets the page make its own signed API calls through in-app route changes and reads the results. It never forges request signatures, retries refused calls, or spoofs the device. A built-in throttle (default 45 page hops per rolling hour) stops the run and waits 30 minutes on any captcha or `90309999` response.

```
plugins/shopee-vn/skills/shopee-vn/
├─ SKILL.md              workflow the agent follows (core, ~300 lines)
├─ references/           loaded on demand: API notes, listing traps, vouchers, constraints, field notes
├─ report-template.md    report format
├─ js/sh.js              in-page library (SH.sweep / SH.pdp / SH.wallet / SH.report …)
├─ tools/lint-report.js  report linter
├─ data/                 specs.json + empty caches that fill with YOUR reads (don't commit them)
└─ tests/                node --test
```

## Privacy

- `data/pickers.json` and `data/vouchers.json` collect **your own** checkout and voucher reads while you use the skill. Don't commit them to a fork. CI runs `scripts/pii-scan.js` on every push.
- In chat, reports show only your ward and province, never your name, phone or street.

## Disclaimer

Not affiliated with, endorsed by, or connected to Shopee or Sea Limited. "Shopee" is a trademark of its owner. Automating a marketplace account may conflict with its terms of service and can put the account at risk, so use it at your own risk and keep volumes low. Prices and voucher results are estimates until a checkout confirms them.

## Development

```bash
cd plugins/shopee-vn/skills/shopee-vn
node --test tests/sh.test.js tests/sh.smoke.test.js tests/lint.test.js
node ../../../../scripts/pii-scan.js   # personal-data scan (repo root)
```

## License

[MIT](../../LICENSE)

---

## Tiếng Việt

**shopee-vn** là skill cho Claude (Claude Code / Agent Skills) giúp mua sắm trên **Shopee Việt Nam** bằng chính trình duyệt bạn đã đăng nhập:

- **Quét hàng trăm sản phẩm** bằng từ khóa tiếng Việt và mã linh kiện chính xác.
- **Tính lại giá đúng phân loại** bạn cần, vì giá trên thẻ tìm kiếm thường là phân loại rẻ nhất.
- **Phát hiện sản phẩm có tiêu đề sai sự thật**: hàng đã qua sử dụng, phân loại mồi, sai mã linh kiện, hết phân loại kit.
- **Kiểm tra mã giảm giá thật sự áp dụng được**: ví voucher → điều kiện (T&C) → màn chọn voucher lúc thanh toán; phân biệt voucher chỉ dùng trên App, dùng được trên Web, chỉ áp dụng cho một số sản phẩm, chỉ dùng qua Live/Video.
- **Báo cáo giá mua ngay** gồm dòng App và dòng Web, cùng bảng giá theo đơn vị.
- **Không bao giờ** tự đặt hàng, chọn phương thức thanh toán, sửa địa chỉ hay nhập mật khẩu/OTP.

Cài đặt: xem [Install](#install). Nên dùng tiện ích **Claude in Chrome** trên Chrome hoặc Edge đã đăng nhập Shopee.

*Dự án không liên kết với Shopee. Tự động hóa tài khoản có thể vi phạm điều khoản của Shopee; bạn tự chịu rủi ro khi sử dụng.*
