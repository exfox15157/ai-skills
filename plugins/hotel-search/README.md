# hotel-search — Claude skill for the real price of a hotel room in Vietnam

A Claude Code / Agent Skill that compares hotels across **Booking.com (mobile site), Agoda and iVIVU** from **your own logged-in browser**. It takes every candidate all the way to the checkout summary, subtracts coupons and the cashback **your** credit cards would earn, and only then ranks the hotels. The result is the **price you actually pay**, not the price on the search page.

*Tiếng Việt: skill cho Claude giúp tìm và so sánh khách sạn trên Booking, Agoda và iVIVU, tính **giá thực trả** (giá ở trang thanh toán, trừ coupon, rồi trừ hoàn tiền thẻ tín dụng) ngay trong trình duyệt bạn đã đăng nhập. [Xem phần tiếng Việt ↓](#tiếng-việt)*

---

## Why

The price in a hotel search list is rarely the price you pay:

- **List prices leave things out.** One iVIVU listing showed 1.89M VND/night; the checkout came to 4.24M for 2 nights. Agoda's room table is per night and before tax.
- **Booking's mobile site can be cheaper.** "Mobile-only price" deals were 5–17% below the desktop site for the same room. Other hotels cost the same on both, so checking mobile loses nothing.
- **Member prices need a login.** Booking Genius, Agoda member deals and auto-applied codes, and iVIVU vouchers only appear when you're signed in.
- **The cheapest site depends on your card.** Who charges the card decides the cashback: the hotel itself (pay at property, MCC 7011), Agoda abroad (possible foreign-transaction fee, cashback category not guaranteed) or iVIVU in VND through a domestic gateway. A 20% hotel-cashback card can turn the "expensive" site into the cheapest one, until its monthly cap is hit.

This skill checks each of these for every hotel × site × card before it ranks anything.

## What it does

| | |
|---|---|
| 🧭 First run | Asks for your room priorities and your cards once, and saves them for later runs |
| 🔐 Login check | Stops first if Booking, Agoda or iVIVU isn't logged in, and explains what each login unlocks |
| 🏨 Two modes | **Area search** ("4-star hotels in Nha Trang, 20–22/12") or **named hotels** (compare room types and packages of hotels you already picked) |
| 🧾 Real price | Opens each room up to the checkout summary and reads room price, taxes and fees, auto-applied discounts and the total |
| 💳 Card cashback | Applies each of your cards' cashback rate, monthly cap and foreign-fee rules, and keeps the cheapest site + card combination |
| 🛁 Your priorities | Notes the amenities you care about (bathtub, free meals, kids' club, airport transfer…) per room, marking "unknown" rather than guessing |
| 📊 Report | **Best value**, **Cheapest** and **Quality** tables (area mode), or Cheapest + Best-value packages (named-hotel mode), each price shown as a full calculation |
| 📅 Flexible dates | Re-prices the top picks one day earlier and one day later, same number of nights |

Every price in the report shows its working, so you can check it:

```
2.460.000 + 329.580 taxes/fees − 234.420 (Agoda Visa code) = 2.555.160 (Agoda checkout) − 7.665 (card B 0.3%) = 2.547.495
```

It **never** pays, never clicks the final booking step, never types card numbers or passwords, and never submits your personal details. It stops at the price summary and closes every tab it opened.

## Example prompts

```
tìm khách sạn 4 sao ở Đà Lạt 20–22/12, 2 người lớn, ưu tiên phòng có bồn tắm
so sánh các loại phòng của Vinpearl Resort Nha Trang cuối tuần này, gói nào đáng tiền nhất?
find the cheapest 5-star hotel near My Khe beach, Da Nang for 3 nights from 10 Jan
```

## Install

### As a Claude Code plugin (recommended)

```
/plugin marketplace add exfox15157/ai-skills
/plugin install hotel-search@ai-skills
```

### As a plain skill

Copy `plugins/hotel-search/skills/hotel-search/` from this repo to `~/.claude/skills/hotel-search/`. On claude.ai, upload the same folder as a custom skill.

### Other agents

The folder follows the [Agent Skills](https://agentskills.io/specification) format. **Tested with: Claude + Claude in Chrome.** The steps rely on a browser tool that can read pages, click and run small JavaScript snippets in a logged-in tab.

### Requirements

- **[Claude in Chrome](https://chromewebstore.google.com/)** extension, signed in with the same Claude account.
- Accounts on **Booking.com, Agoda and iVIVU**, each **logged in by you** in that browser.
- Nothing to prepare: on the **first run** the skill asks for your **room priorities** and your **cards** (cashback rate by category, cap per cycle, statement date, foreign-fee policy) and saves them for next time.

## How it works

1. **Login check** on all three sites; stop if any is logged out.
2. **Inputs**: area or hotel names, dates, adults, children's ages, plus any bank promotions currently running (with expiry dates checked). Your priorities and cards come from two profile files, `hotel-preferences.md` and `hotel-cards.md`; on the first run the skill asks you and writes them.
3. **Candidates** (area mode): 8–12 hotels matching your criteria across a range of prices, de-duplicated across sites. List prices are only used to drop hotels far over budget.
4. **Real price** for each hotel × site: pick the room, go to the checkout summary, read every price component, then apply each card.
5. **Rank** only on the real price.
6. **Flexible dates** (±1 day) for the top picks.
7. **Report** with links (Booking links use `www.booking.com` for desktop reading), the source site, and the calculation.

```
plugins/hotel-search/skills/hotel-search/
├─ SKILL.md     the whole workflow, including per-site page tips
└─ data/        created on first run: hotel-preferences.md, hotel-cards.md (git-ignored)
```

## Privacy

- Your priorities and cards are saved only where your agent keeps them: the skill's `data/` folder (ignored by git in this repo), a project file, or Claude's memory. Card numbers are never stored; a nickname or last 4 digits is enough. Don't commit `data/` to a fork.
- Report links contain only dates and guest counts, with no session, label or token parameters.

## Disclaimer

Not affiliated with, endorsed by, or connected to Booking.com, Agoda or iVIVU; names are trademarks of their owners. Automating your accounts may conflict with a site's terms of service, so use it at your own risk and keep volumes low. Card cashback depends on how the merchant is categorised (MCC) and on your issuer's terms; the report marks anything unconfirmed. Prices are only final on the site's own checkout.

## License

[MIT](../../LICENSE)

---

## Tiếng Việt

**hotel-search** là skill cho Claude giúp tìm và so sánh khách sạn trên **Booking (bản di động), Agoda và iVIVU** bằng chính trình duyệt bạn đã đăng nhập:

- **Không tin giá ở trang danh sách**: mỗi khách sạn được đưa tới trang tóm tắt giá để đọc giá cuối gồm thuế, phí và giảm giá tự áp dụng.
- **Trừ hoàn tiền thẻ tín dụng** theo tỉ lệ, trần mỗi kỳ và phí giao dịch nước ngoài của từng thẻ, rồi chọn trang + thẻ cho giá thực trả thấp nhất.
- **Hai chế độ**: tìm theo khu vực (bảng Đáng tiền nhất, Rẻ nhất, Chất lượng) hoặc so các loại phòng/gói của khách sạn bạn đã chọn.
- **Lần đầu dùng** skill hỏi ưu tiên và bộ thẻ của bạn rồi lưu lại để dùng cho các lần sau.
- **Ưu tiên của bạn** (bồn tắm, bữa ăn, kids' club, đưa đón…) được ghi cho từng phòng và dùng khi xếp hạng.
- **Ngày linh hoạt**: kiểm tra giá khi đi sớm hoặc muộn 1 ngày.
- **Không bao giờ** thanh toán, bấm bước đặt phòng cuối, nhập số thẻ hay mật khẩu.

Cài đặt: xem [Install](#install). Cần tiện ích **Claude in Chrome** và đã đăng nhập Booking, Agoda, iVIVU.

*Dự án không liên kết với Booking.com, Agoda hay iVIVU. Bạn tự chịu rủi ro khi tự động hóa tài khoản của mình.*
