---
name: hotel-search
description: Find and compare hotels on m.booking.com, Agoda and iVIVU using the user's own logged-in accounts, and work out the real price paid — checkout total minus coupons, minus credit-card cashback. Use when the user asks to find or compare hotels, "tìm khách sạn", "so giá phòng", or the final price on Booking/Agoda/iVIVU.
compatibility: Designed for Claude Code or claude.ai with the Claude in Chrome extension; needs m.booking.com, Agoda and iVIVU tabs the user is logged into.
license: MIT
---

# Hotel search – the real final price on m.booking.com, Agoda, iVIVU

Goal: find hotels for the request (an area or specific hotels, dates, guests), get the **real price paid** (the checkout total, minus coupons, then minus card cashback) on all 3 sites, **and only then rank** and report.

There are 2 report modes:
- **Area mode** (the user gives only an area/criteria): **3 hotel comparison tables (Best value, Cheapest, Quality)** + **1 flexible-dates table**.
- **Named-hotel mode** (the user names one or more specific hotels): same tables, but **drop the Quality table**, and the tables **compare room types/packages** instead of hotels: **Cheapest** + **Best value** + **1 flexible-dates table** (one set of tables per hotel if several are named).

## Mandatory rules

1. **Work only in the user's logged-in Chrome (Claude in Chrome).** Do not install or run scraping scripts/CLIs, do not use "stealth" browsers to dodge bot protection, do not export cookies or login sessions, and do not use community skills/MCPs to scrape travel sites. This is safer, and the price seen is the price the user will pay.
2. **Booking: look up prices on `m.booking.com`**, not `www.booking.com`. The mobile site shows extra "Mobile-only price" deals (seen 5–17% cheaper than desktop); other hotels cost the same, so nothing is lost. **Links in the report, however, use `www.booking.com`** (see Step 6).
3. **Never trust list-page prices and never rank by them.** Every comparison and every cheapest/best-value call is based only on the real price from Step 3. List pages are often far off (e.g. iVIVU showed 1.89M/night but the final price was 4.24M for 2 nights).
4. **Never pay.** Do not click through to the last step ("Next: final step", "Complete booking"), do not enter card numbers, do not submit personal-details forms. Stop at the price summary page. If the price summary can't be reached (blocked), use the tax-inclusive total on the room details page and **say clearly in the report** that the price was not confirmed at checkout.
5. Never put personal data in URLs. When reading a URL with JavaScript, return only the path/ID (full URLs carry session data and will be blocked).

## Step 0 – Login check (stop if not logged in)

Open the 3 sites in the user's Chrome and check:
- **m.booking.com**: account name and Genius level at the top → logged in.
- **Agoda**: page shows "Sign in" / "Create account" buttons → **not** logged in.
- **iVIVU**: user's name at the top (no Sign in button) → logged in.

If **any site is not logged in: STOP, do not continue.** Tell the user which site is logged out, ask them to sign in themselves (Claude must never type passwords), and explain why it matters:
- **Booking – Genius:** an extra 10–25% off and perks such as free breakfast or room upgrades; some prices only show when signed in ("Sign in to see member prices").
- **Agoda:** member/secret prices, discount codes auto-applied at checkout (seen ~234k off one booking), reward points.
- **iVIVU:** member prices, vouchers in the account, points.
- In general: the final price reported matches what the user really pays, so nothing needs re-checking.

Continue only after the user confirms all 3 are logged in.

## Step 1 – Inputs

### First run: build the user's profile files

The skill relies on 2 reference files about the user:
- **`hotel-preferences.md`** – amenities and conditions the user prioritises (e.g. bathtub in the room, free meals, spa, theme-park tickets/priority, airport transfer, kids' club, crib for a baby, minimum star rating, hotels only vs apartments, free cancellation).
- **`hotel-cards.md`** – the user's payment cards: for each card, the cashback rate by category (hotels/travel vs general spend), cashback cap per statement cycle, statement closing date, and whether it charges a foreign-transaction fee. **Never store card numbers** – a nickname or the last 4 digits is enough.

Look for them in a persistent place the agent can reach: the skill's `data/` folder (Claude Code), a project file, or memory (claude.ai). **If this is the user's first time and they don't exist**, ask the user for their priorities and their cards, then write both files there for future runs, and tell the user where they are saved. On later runs read them again every time (they may have changed) and update them when the user mentions a change.

### Every run

Take from the request and the 2 files above:
- **Mode:** the user names specific hotels → named-hotel mode; only an area/criteria → area mode.
- Area or hotel names, check-in/check-out dates, number of adults, number of children and **each child's age** (enter age 1 for a baby under 2).
- **Search criteria and priorities:** from the request and `hotel-preferences.md` (star rating, property type, cancellation, crib, and the priority amenities used for ranking).
- **Cards:** from `hotel-cards.md`. Ask or check how much cashback cap is left in the relevant statement cycle.
- Check once for bank/card promotions running on each site (e.g. `agoda.com/visavn`, the card issuers' promotion pages, Visa/Mastercard offers). Read the **validity dates** – many pages stay up after expiry.

## Step 2 – Collect candidates (no ranking yet)

**Named-hotel mode: skip this step** – the candidates are the hotels the user named; just find each hotel's details page on all 3 sites (note which site doesn't sell it or is sold out).

Area mode: this step only builds the list of hotels worth checking – **no judgement on cheap or good value yet**. Take 8–12 hotels that meet the search criteria and have rooms for the whole party, spread from low to high price and with high review scores, de-duplicated across the 3 sites. List prices are only used to drop places clearly far over the user's stated budget.

- **m.booking.com** – search URL:
  `https://m.booking.com/searchresults.vi.html?ss=<area>&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&group_adults=<adults>&group_children=<children>&age=<each child's age, repeat the age parameter>&no_rooms=1&nflt=<filters>`
  Filters from the criteria, e.g. `class%3D4%3Bclass%3D5` (4–5 stars), `ht_id%3D204` (hotels only), joined with `%3B`. Scroll to the end of the page, then read the `[data-testid="property-card"]` cards; note "Mobile-only price" labels, "Genius" and review scores.
- **Agoda** – search URL with `city=<id>&hotelArea=<id>&checkIn=&checkOut=&los=&adults=&children=&childages=`, plus `hotelStarRating=4,5` if the criteria set a star rating. Results lazy-load: scroll with `window.scrollTo` in steps of the page height, then read `li[data-hotelid]`.
- **iVIVU** – `https://www.ivivu.com/khach-san-<city>?location=<id>`, plus `&stars=50,40` for 4–5 stars if needed. Dates and guests must be set in the search bar (defaults can be wrong, e.g. 4 adults, a 9-year-old child), then click Search and re-check the area filter.

## Step 3 – Real price per hotel × site × card

For **every candidate hotel on every site that sells it**: open the details page → pick a room → click Book/Reserve → read the final price on the summary page → **right then** subtract coupons and work out cashback for each eligible card, because how each site/hotel takes payment decides which card earns cashback. Record the option (site + card) that gives the hotel's lowest real price.

**Named-hotel mode:** do the above for **every room type and every package** (breakfast only, breakfast + dinner, ticket/combo packages, free cancellation…) – each room type that fits the whole party, on all 3 sites – so you can then take the lowest real price per room type and compare the packages' value.

For every room, also note **the amenities on the user's priority list** (e.g. bathtub or shower only) from the room's amenities on the page (Booking: room facilities list; Agoda: "Bathtub", "Private bathtub/shower"; iVIVU: the room's "Xem chi tiết"). If the page doesn't say, write "unknown" – don't guess.

Record every component needed for the calculation in Step 6:
- **Base room price** (before taxes/fees, after any Genius/member discount already built into the room price),
- **Taxes/fees** (if they can be separated),
- **Coupon/discount** (if any; the programme name or required card, e.g. "Agoda Visa code YRO", "iVIVU voucher"),
- **Final price** = the amount on the checkout page,
- **Card cashback** (if any; which card, rate, cap remaining).

**Real price = base room price + taxes/fees − coupon = final price (checkout) − card cashback.**

### m.booking.com
1. Open `https://m.booking.com/hotel/vn/<slug>.vi.html?checkin=&checkout=&group_adults=&group_children=&age=&no_rooms=1` (take the slug from the result card's link with the regex `hotel\/vn\/([a-z0-9-]+)`).
2. Read the room options (total price, free cancellation, breakfast, mobile label, room facilities). Pick a sensible option (usually free cancellation), tap "Reserve", then the "Book now" bar.
3. On `secure.booking.com/book.html` read the **"Price summary"** block: total, Genius/offer discounts, taxes/fees, payment schedule, cancellation deadline, deposit.
4. **Card:** if it is "pay at the property" or "the property charges before arrival", the hotel itself charges the card (MCC 7011) → a card with hotel/travel-category cashback is most certain to earn it, if the hotel accepts that card (if unknown, e.g. for AMEX, note "ask the hotel whether it accepts this card").

### Agoda
1. Get the `propertyId`: type the hotel name in the top search box (click → Ctrl+A → type), pick the suggestion, click SEARCH; the ID is in the `selectedproperty` parameter (return only the number).
2. Open the details page: `https://www.agoda.com/vi-vn/accom/property?propertyId=<id>&countryId=38&finalPriceView=1&adults=&children=&rooms=1&checkIn=YYYY-MM-DD&childAges=&travellerType=2&currencyCode=VND&los=<nights>`.
3. Scroll to load the room table; filter the room-name rows (`m²Tối đa`), "Ưu đãi N" (deal N), cancellation/breakfast terms, room facilities. Watch for the "Vượt quá sức chứa phòng" (exceeds room capacity) line. Prices on the details page are **per night, before tax**.
4. Use `find` to get the "Đặt ngay <room name> Ưu đãi N" (Book now) button, click it, wait ~8 seconds. On the `/book/` page read: room price, taxes and fees, auto-applied discounts, **total price**, payment date, cancellation deadline. Do not click "Next".
5. **Card:** Agoda prepaid bookings are usually charged by Agoda (abroad) → a possible ~0.8% foreign-transaction fee, and a travel-cashback card may not count it in the hotel/travel category. Compare with Agoda's Visa/Mastercard offers if still valid (usually calculated on the room price before tax, and only shown after entering a card number → note "unconfirmed"). These offers don't stack with another card's cashback → pick the lowest real price and state the assumption.

### iVIVU
1. On the list page, filter with the "Tìm tên khách sạn" (hotel name) box (or add `?keysearch=<name>`).
2. The "Xem phòng" (view rooms) button opens a new tab via `window.open` (may be blocked): set `window.open = u => {cap = u}`, click to capture the path, then open `https://www.ivivu.com/<path>` yourself.
3. The details page shows a total "Đã bao gồm thuế & phí" (taxes & fees included) for each option, with cancellation deadline and breakfast; below the price, "Giá đã bao gồm: Sales tax … / Service charge …" lets you split out taxes/fees. Wait ~8 seconds for prices to load. Check account vouchers if the page shows them.
4. **Card:** iVIVU is a domestic agent charging in VND (usually through a domestic gateway such as VNPAY) → no foreign fee; iVIVU's MCC is unverified → note "unconfirmed" if relying on hotel/travel-category cashback.

If a site has no suitable room or the room table won't load → say so in the notes; never guess a price.

## Step 4 – Rank on the real price

### Area mode
Only classify once every candidate has a real price. A hotel can appear in several tables. 3–5 hotels per table.

1. **Cheapest** – sorted by real price, ascending.
2. **Best value** – the most value for the real price, **judged first against the user's priority list** (Step 1, e.g. a room with a bathtub), then general value: breakfast, room size, kitchen, free cancellation, child-friendly features (crib, pool, kids' club), location, transfers.
   - Hotels/rooms that meet the user's priorities get **a clear bonus**: when the real-price gap is small, rank the room with the priority amenity first. If a hotel has rooms with and without the priority amenity, use the room with it for this table and note the difference from the cheapest room.
   - Another example: if the room with breakfast costs less extra than buying breakfast separately, count it as good value.
   - Give the reason in the Notes column, stating which user priorities are met (e.g. "bathtub ✓").
3. **Quality** – high review scores (prefer ≥ 9.0 with many reviews), 5 stars, reputable brands; also give a bonus for amenities on the user's priority list. Sort by quality, with real price as the secondary factor.

### Named-hotel mode
Use the same tables as area mode but **drop the Quality table**, and each row is **a room type/package** of that hotel (not a hotel):

1. **Cheapest** – **only the cheapest option of each room type** (the lowest real price across the 3 sites, usually the basic package such as breakfast only / non-refundable). Don't put combos or bundled packages in this table unless one is itself the cheapest option for its room type. Sort by real price, ascending.
2. **Best value** – only **combo packages with a good price or good extras**: packages with sightseeing/cable-car/theme-park tickets, breakfast + dinner, spa, transfers, free cancellation for a small surcharge, rooms meeting the user's priorities (e.g. bathtub, a double bed for a family with a baby)…
   - For each package, compare with **buying the equivalent separately** (cheapest room price + the services bought separately) and state the difference in Notes (e.g. "164k cheaper than buying cable-car tickets separately").
   - Only include a package if it really beats buying separately, or the extras are worth the difference (give the reason). If the hotel has mandatory costs outside the room price (e.g. a mandatory cable-car ticket), add a **Total incl. mandatory costs** column to both tables for a fair comparison.
   - State which user priorities are met (e.g. "bathtub ✓").

## Step 5 – Flexible dates (±1 day)

Applies to **both modes**.
- Area mode: the top hotels of each table (at most 3–4 hotels, no duplicates).
- Named-hotel mode: the top option of the Cheapest table and of the Best value table (plus the room type meeting the user's priorities if different).

Get the real price for **check-in 1 day earlier** and **1 day later**, **keeping the same number of nights**. Only check the site + card that gave the lowest price in Step 3, still following the Step 3 process exactly. If the user's dates are fixed, skip this step and write one line: "Fixed dates – flexible dates not checked".

## Step 6 – Report

Don't use 3 columns for the 3 sites. Each row shows only the **lowest real price** found.

### First column of EVERY table – hyperlink + source

The first column (hotel name or room type/package) of **every table** (including the flexible-dates table) **is always a hyperlink** to the details page on the site with the lowest price, and **always shows the source in brackets right after the link**, e.g.:
- `[Family Bunk + cable-car tickets](https://www.ivivu.com/...) (iVIVU)`
- `[Superior King](https://www.booking.com/hotel/vn/....vi.html?...) (Booking)`
- `[Family Deluxe](https://www.agoda.com/vi-vn/accom/property?...) (Agoda)`

Links contain only dates and guest counts (no session, label, sid or token).

### Real price column – the calculation is mandatory

Full format:

`base room price + taxes/fees − coupon (programme or card) = final price (checkout on which site) − cashback (which card, %) = **real price**`

**Only include terms that actually exist.** Never write `+ 0`, `− 0` or "no cashback" in the calculation – it is confusing:
- Taxes/fees can't be separated (the site only shows a tax-inclusive price) → start from the final price.
- No coupon → drop the coupon term.
- No cashback → the final price is the real price (bold the final price).
- If the final price equals base price + taxes/fees with no coupon, drop the intermediate `=` and write `base price + taxes/fees = final price (checkout …)` directly.

Examples:
- All terms: `2.460.000 + 329.580 taxes/fees − 234.420 (Agoda Visa code YRO, Visa card required) = 2.555.160 (Agoda checkout) − 7.665 (card B 0,3%) = **2.547.495**`
- No coupon: `4.500.000 + 603.000 taxes/fees = 5.103.000 (Booking checkout) − 1.000.000 (card A 20% hotels, cap of 1M/cycle reached) = **4.103.000**`
- Tax-inclusive, no coupon: `2.808.000 (Booking checkout) − 561.600 (card A 20% hotels) = **2.246.400**`
- No cashback: `3.500.000 + 469.000 taxes/fees − 300.000 (iVIVU voucher) = **3.669.000** (iVIVU checkout)`

More rules:
- Put the site name in brackets at the final price (Booking/Agoda/iVIVU).
- If cashback hits the cap, say so, e.g. `− 1.000.000 (card A 20% hotels, cap of 1M/cycle reached)`.
- A foreign-transaction fee (if any) goes in as an added term after the final price, e.g. `+ 25.552 (foreign fee ~1%)`.
- Uncertain assumptions (MCC, whether the hotel accepts that card, cap remaining, price not confirmed at checkout) go in the Notes column.
- Write the report in the user's language; amounts in VND with `.` thousands separators as above.

### Area mode – 3 tables (Best value, Cheapest, Quality)

| Hotel | Room & terms | Real price (N nights) | Notes |
|---|---|---|---|
| [Hotel name](details page on the cheapest site) (Booking) | Room type, m², **user priority amenities (e.g. bathtub ✓ / shower only / unknown)**, breakfast, cancellation deadline, prepay/pay at property, review score | 2.460.000 + 329.580 taxes/fees = 2.789.580 (Booking checkout) − 557.916 (card A 20% hotels) = **2.231.664** | Real price on other sites: Agoda 2.547.495, iVIVU 2.527.200; why it's in this table (which priorities are met); unconfirmed card assumptions |

### Named-hotel mode – 2 tables (Cheapest, Best value) by room type/package

**Cheapest table** – one row per room type, only that room type's cheapest option:

| Room type | Terms | Real price (N nights) | Notes |
|---|---|---|---|
| [Room type name](link) (iVIVU) | m², beds, max guests, **user priority amenities (e.g. bathtub ✓ / shower only)**, breakfast, cancellation deadline, prepay/pay at property | 4.926.000 − 94.000 (iVIVU points) = 4.832.000 (iVIVU checkout) − 966.400 (card A 20% hotels) = **3.865.600** | Real price on other sites: Booking …, Agoda … (or "not sold"/"sold out"/"over capacity"); free-cancellation version (+…); card risks |

**Best value table** – combos/packages with a good price or good extras:

| Package (room type + services) | Terms & included extras | Real price (N nights) | Notes |
|---|---|---|---|
| [Room type + package name](link) (iVIVU) | What the package includes (tickets, dinner, spa, transfers…), user priority amenities, cancellation deadline | 6.896.000 − 94.000 (iVIVU points) = 6.802.000 (iVIVU checkout) − 1.000.000 (card A 20% hotels, cap reached) = **5.802.000** | Versus buying separately: …k cheaper / …k more but includes …; which user priorities are met |

If there are mandatory costs outside the room price, add a **Total incl. mandatory costs** column to both tables.

### Flexible-dates table (both modes)

| Hotel / room type | −1 day (dd/mm–dd/mm) | Requested dates (dd/mm–dd/mm) | +1 day (dd/mm–dd/mm) | Notes |
|---|---|---|---|---|
| [Hotel name – room type](link) (Booking) | 2.050.000 | **2.231.664** | 2.400.000 | Same site + card as Step 3; 181k cheaper if arriving 1 day earlier |

The flexible-dates table shows only the real price (no full calculation), but note the site + card used in the Notes column.

### General rules
- **Booking links in the report use `https://www.booking.com/...`, not `m.booking.com`**, so the user can review them easily on a computer: replace `m.booking.com` with `www.booking.com`, keeping the path and the date/guest parameters. Example: `https://www.booking.com/hotel/vn/<slug>.vi.html?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&group_adults=<n>&group_children=<n>&age=<age>&no_rooms=1`. If the lowest price is a "Mobile-only price", note that it only shows on a phone/the app.
- Short notes: the other sites' prices, mobile price labels, risks (MCC, card cap remaining, unconfirmed offers).
- After the tables: 1–2 sentences with the pick (say which user priorities it meets), and a reminder of the free-cancellation deadline and of anything to request from the hotel (e.g. a crib, if the user's preferences include one).

## Clean-up

Close every tab you opened before replying. Leave no page sitting at a booking step.
