export const meta = {
  name: 'shopee-3agent',
  description: 'Shopee price check: Opus orchestrator reads list pages, Haiku scanners read product and voucher pages in parallel, code renders the report tables, Sonnet writes the recommendation',
  whenToUse: 'Default runner for shopee-vn price checks and daily trackers (SKILL.md §1c). Pass args (see ARGS below).',
  phases: [
    { title: 'Lists', detail: 'Opus: GATE 0, product sweep, wallet, choose detail pages + alternatives', model: 'opus' },
    { title: 'Details', detail: 'Haiku scanners: product pages by direct link', model: 'haiku' },
    { title: 'Review', detail: 'Opus: check scans, decide retries, consolidate', model: 'opus' },
    { title: 'Vouchers', detail: 'Code ranks wallet vouchers per row; Haiku reads T&C / product-list pages top-down only until one applies on App and on Web', model: 'haiku' },
    { title: 'Report', detail: 'Code renders the tables; Sonnet writes only "Khuyến nghị" and lints', model: 'sonnet' },
    { title: 'Cleanup', detail: 'Haiku closes the browser tabs this run opened', model: 'haiku' },
  ],
}

// ARGS (all optional except product/terms/titleRe; defaults = an example DDR4 RAM-kit tracker):
// { skillDir, outDir, product, prefer, terms[], parts[], profile (SH.use(...) line), titleRe, forgetRe, excludeRe, minPrice,
//   orderTotals[], noDeliveryKey, altHint, maxAlt, language, eligKeyword (model words typed into a voucher's product list, §0b V12) }
const A = Object.assign({
  skillDir: '~/.claude/skills/shopee-vn', // pass the absolute path of this skill's folder
  outDir: './shopee-vn-run',
  product: 'Kit RAM DDR4 32GB (2x16GB) 3200MHz CL16 Kingston Fury Beast KF432C16BBK2/32',
  prefer: 'kit 2x16GB KF432C16BBK2/32 là biến thể người dùng yêu cầu; thanh lẻ 16GB và bản RGB là biến thể khác',
  terms: ['ram ddr4 32gb 3200 kingston fury beast', 'kit ram 2x16gb ddr4 3200 cl16'],
  parts: ['KF432C16BBK2/32', 'KF432C16BBK2'],
  profile: "SH.use(SH.PROFILES.ram_ddr4_2x16); 'ok'",
  titleRe: 'kf432c16bbk2',
  forgetRe: 'kf432c16bb',
  excludeRe: 'kf432c16bbak2|rgb',
  minPrice: 1000000,
  orderTotals: [2000000],
  noDeliveryKey: '__examplend',
  altHint: 'cùng dung lượng, bus và CL của hãng khác (vd CMK32GX4M2E3200C16, CT2K16G4DFRA32A) hoặc bản RGB cùng dòng đang giảm sâu hơn',
  maxAlt: 4,
  maxBest: 3, // rows in "Giá tốt nhất", one shop per row (rule 2026-10-29)
  trustedShop: { minStars: 4.8, minReviews: 5, minSold: 50 }, // cheapest Mall listing over these goes into "Gợi ý khác" when not in "Giá tốt nhất"
  language: 'Vietnamese',
  maxParallel: 3, // scanners started at once (rule 2026-10-29: 3, was 2). The Workflow runtime still caps concurrent agents at min(16, CPUs-2) of the host it runs on; extra agents queue.
  voucherLookahead: 99, // undecided vouchers read per lane per round (99 = all in one round; 1 = the old strict walk)
  eligKeyword: 'kingston fury beast ddr4',
  // (rule 2026-10-27) wallet read counts as PARTIAL when it loaded far fewer unique vouchers than on earlier days,
  // even if the API said done:true (27/10: 211 vs 364-467 on 14-26/10 -> "không có voucher" was printed, the app picker
  // then showed freeship 97% tối đa 1Trđ + VIP 16% tối đa 300Kđ on that listing).
  walletMinRatio: 0.7,       // partial when unique < ratio x baseline
  walletBaselineSeed: 380,   // used while the browser history has < 3 earlier days (reads 18-23/10: 364-401)
}, args || {})
const SK = A.skillDir
// Each agent reads only its own short rules file in rules/ (rule 2026-10-26), never SKILL.md (~120k chars):
//   orchestrator-lists.md · orchestrator-review.md · reporter.md · scan-product.md · scan-voucher.md
const RULES = n => `${SK}/rules/${n}.md`
// Workflow scripts cannot call Date.now() / new Date() (breaks resume): the caller passes args.nowMs = Date.now() (ms, UTC).
if (!A.nowMs) return { stopped: 'missing args.nowMs: pass the current time in ms (e.g. date -u +%s%3N) when starting the workflow' }

// Browser rules for every agent live in its rules/*.md file.
const BOOT = `BOOT after a real page load: window.SH ? SH.v : (localStorage.__shlib ? (0, eval)(localStorage.__shlib) : 'NEED_PASTE'). Profile after BOOT: ${A.profile}`

// ---------- schemas ----------
const PLAN = {
  type: 'object',
  properties: {
    status: { type: 'string' }, address: { type: 'string', description: 'ward, province only' },
    swept: { type: 'integer' }, known_no_delivery_skipped: { type: 'integer' }, bait_rejected: { type: 'integer' }, other_rejected: { type: 'integer' },
    product_keys: { type: 'array', items: { type: 'string' }, description: 'shopid/itemid of the requested product (all colours)' },
    alt_keys: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, why: { type: 'string', description: 'màu khác / đời cao hơn / mới hơn / ₫ per unit' } }, required: ['key', 'why'] } },
    wallet: { type: 'string' },
    wallet_unique: { type: 'integer', description: 'unique vouchers read today (after walletRead)' },
    wallet_api_done: { type: 'boolean', description: 'SH.walletPages() said done:true' },
    wallet_history: { type: 'array', items: { type: 'object', properties: { d: { type: 'string' }, n: { type: 'integer' } }, required: ['d', 'n'] }, description: 'localStorage.__walletHist as read BEFORE adding today (earlier days only)' },
    voucher_candidates: { type: 'array', items: { type: 'object', properties: { idx: { type: 'integer' }, code: { type: 'string' }, pct: { type: 'number' }, cap: { type: 'integer' }, min: { type: 'integer' }, value: { type: 'integer' }, scope: { type: 'string' }, starts: { type: 'string' }, ends: { type: 'string' }, tc_url: { type: 'string' }, mall_only: { type: 'boolean' }, product_limit: { type: 'boolean', description: 'wallet row productLimit (API product_limit): the voucher has its own product list, checked in the Eligibility step (§0b V12)' } }, required: ['code'] } },
    // (2026-10-22b) free-ship cards: their T&C is read like platform vouchers - shipping reached 1,5-3,1tr on a large appliance
    ship_voucher_candidates: { type: 'array', items: { type: 'object', properties: { idx: { type: 'integer' }, code: { type: 'string' }, label: { type: 'string', description: 'card text verbatim' }, pct: { type: 'number' }, cap: { type: 'integer' }, min: { type: 'integer' }, ends: { type: 'string' }, tc_url: { type: 'string' } }, required: ['code'] } },
    // (2026-10-22b) facts the search data has and the product page may not show: Mall flag, Voucher Xtra frame, campaign overlay, pending flash price, card price
    listing_meta: { type: 'array', items: { type: 'object', properties: {
      key: { type: 'string' }, shop: { type: 'string', description: 'shop name from search data' },
      is_mall: { type: 'string', enum: ['yes', 'no', 'unknown'] }, mall_evidence: { type: 'string' },
      vcx: { type: 'string', enum: ['yes', 'no', 'unknown'] }, overlay: { type: 'string', description: 'image_overlay name verbatim, e.g. 17VCX+ShopeeHome[26.9-12.10.2026]' },
      search_price: { type: 'integer', description: 'card price from the search data, đồng (lets the reviewer see what a "Giá Sau Voucher" page deducted)' },
      pending_price: { type: 'string', description: 'card text of an upcoming flash price verbatim, e.g. "3?.???.???₫ 24.10"; empty if none' } }, required: ['key', 'is_mall', 'vcx'] } },
    notes: { type: 'string' },
  },
  required: ['status', 'product_keys', 'voucher_candidates', 'ship_voucher_candidates', 'listing_meta'],
}
const PDP = { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: {
  key: { type: 'string' }, status: { type: 'string', description: 'ok | no-delivery | failed' }, error: { type: 'string' },
  title: { type: 'string' },
  // price (2026-10-22b): which price is on screen matters - "Giá Sau Voucher" means a voucher is already deducted
  price_shown: { type: 'integer', description: 'đồng, the big price on the page' }, price_label: { type: 'string', description: 'label printed next to it verbatim, e.g. "Giá Sau Voucher"; empty if none' },
  price_before_voucher: { type: 'integer', description: 'always 0: the code prices each option from variants' },
  was: { type: 'integer', description: 'seller strikethrough đồng, 0 if none' }, price_raw: { type: 'string', description: 'price_raw verbatim' },
  flash: { type: 'string', description: 'flash verbatim (running / upcoming flash sale, start/end); empty if none' },
  variants: { type: 'string', description: 'VARIANT_JS output verbatim: JSON array [{o, st, G, SP, VS, VSp, VSm, VSH, VSHp, VSHm, T, src, ok}] per option' },
  ship_line: { type: 'string' }, ship_popup: { type: 'string' }, ship_struck: { type: 'integer', description: 'đồng; 0 only for a confirmed 0₫; -2 = no delivery line on the page (unknown)' }, ship_promo: { type: 'integer', description: 'đồng, -1 if none' }, ship_self: { type: 'boolean' },
  shop: { type: 'string', description: 'shop name; if empty, say why in missing' }, shop_location: { type: 'string' }, is_mall: { type: 'string', enum: ['yes', 'no', 'unknown'] }, mall_evidence: { type: 'string' },
  shop_vouchers: { type: 'array', items: { type: 'object', properties: { label: { type: 'string', description: 'card text verbatim' }, pct: { type: 'number' }, value: { type: 'integer' }, cap: { type: 'integer' }, min: { type: 'integer' }, ends: { type: 'string' }, scope: { type: 'string', description: 'toàn shop / sản phẩm nhất định / ? - verbatim' } }, required: ['label'] } },
  shop_vouchers_raw: { type: 'string', description: 'SHOPV_JS output verbatim' },
  rating_sold: { type: 'string' }, spec: { type: 'string' },
  ld_price: { type: 'integer', description: 'PAGE_JS ld_price (price in the page\'s schema.org Product data), 0 if absent' }, condition: { type: 'string', description: 'PAGE_JS cond verbatim (schema.org itemCondition, e.g. NewCondition / UsedCondition), empty if absent' },
  missing: { type: 'string', description: 'every empty field and why: "không có trên trang" / "đọc lỗi" / "bị cắt"' } },
  required: ['key', 'status'] } } }, required: ['results'] }
const TC = { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: {
  code: { type: 'string' }, kind: { type: 'string', enum: ['platform', 'freeship'] }, status: { type: 'string' }, validity: { type: 'string' }, offer: { type: 'string' }, scope: { type: 'string' }, devices: { type: 'string' }, extra: { type: 'string' },
  pct: { type: 'number' }, cap: { type: 'integer', description: 'đồng' }, min: { type: 'integer', description: 'đồng' }, starts: { type: 'string' }, ends: { type: 'string' }, web_ok: { type: 'boolean', description: 'devices list contains plain "Web"' },
  channels: { type: 'string', description: 'free-ship only: shipping channels / "Hàng Cồng Kềnh" wording verbatim' } },
  required: ['code', 'status'] } } }, required: ['results'] }
// Data package for the reporter (rule 2026-10-22, after the 3-round report of 22/10 10h30): STRUCTURED rows with
// numbers as numbers, every text field already in plain ${A.language} for the buyer, totals computed by a script
// (never mentally) and re-checked below in plain JS before the reporter sees them.
const ROW = { type: 'object', properties: {
  table: { type: 'string', enum: ['best', 'alt', 'rejected'] }, key: { type: 'string', description: 'shopid/itemid' },
  shop: { type: 'string' }, title: { type: 'string' }, variant: { type: 'string', description: 'the option priced' },
  axis: { type: 'string', description: 'alt rows only, Vietnamese: màu khác / đời mới hơn / cao cấp hơn / rẻ hơn theo đơn vị' },
  item: { type: 'integer', description: 'set by code from variants (G − SP); copy the option price' }, was: { type: 'integer', description: 'seller strikethrough, 0 if none' },
  ship: { type: 'integer', description: 'struck (checkout) fee, đồng; 0 only when confirmed 0₫; -2 when unknown' }, ship_promo: { type: 'integer', description: 'promo fee, -1 if none' },
  shop_v: { type: 'integer', description: 'set by code; leave 0' }, shop_v_name: { type: 'string' },
  price_basis: { type: 'string', enum: ['before-voucher', 'after-voucher', 'unclear'], description: 'set by code; leave "unclear"' },
  is_mall: { type: 'string', enum: ['yes', 'no', 'unknown'] }, vcx: { type: 'string', enum: ['yes', 'no', 'unknown'] },
  flash_vi: { type: 'string', description: 'running / upcoming flash price and campaign window for this listing, in the report language; empty if none' },
  ship_channel: { type: 'string', description: 'shipping channel word from the popup, e.g. Hàng Cồng Kềnh / Nhanh; empty if unknown' },
  rating_vi: { type: 'string', description: 'ONLY stars, review count and sold, e.g. "4.4 sao (25 đánh giá) · đã bán 134" or "Chưa có đánh giá · chưa có lượt bán" (rule 2026-10-29: no caveats here)' },
  advice_vi: { type: 'string', description: 'best/alt rows: at most ONE short sentence with the caveat that changes the buy decision (e.g. warranty 12 vs 24 months, ask the shop about condition/invoice, other model); printed in "Gợi ý mua". Empty if none.' },
  notes_vi: { type: 'string', description: 'rejected rows: the reason (printed). best/alt rows: background caveats for the recommendation writer only (NOT printed in the tables)' },
  // (rule 2026-10-29) no totals and no platform / free-ship voucher fields here: the voucher step and the code below fill them
  },
  required: ['table', 'key', 'shop', 'item', 'ship'] }
const REVIEW = { type: 'object', properties: {
  retry_products: { type: 'array', items: { type: 'string' } }, retry_vouchers: { type: 'array', items: { type: 'string' } },
  header_vi: { type: 'string', description: 'EXACTLY two items, in the report language, no internal terms (rule 2026-10-23): (1) "Đã đăng nhập Shopee · giao tới <phường, tỉnh> (địa chỉ mặc định của tài khoản)." (2) the coverage line "Phạm vi: N tin đã quét · M trang sản phẩm đã đọc chi tiết · K tin chưa kiểm tra" + one line of counts. Nothing else: no browser, wallet count, account-only disclaimer, voucher list or open gaps.' },
  rows: { type: 'array', items: ROW } },
  required: ['retry_products', 'retry_vouchers', 'header_vi', 'rows'] }

// The plain-language word list lives in rules/orchestrator-review.md and rules/reporter.md (rule 2026-10-22).

// ---------- 1. Orchestrator: list pages ----------
phase('Lists')
const plan = await agent(`You are the ORCHESTRATOR (Opus) of a Shopee price check for: ${A.product}. ${A.prefer}. This step: read the LIST pages only and decide which DETAIL pages the scanners must read. Rules: read ${RULES('orchestrator-lists')} fully (browser, BOOT, GATE 0, list and wallet rules). Do NOT read SKILL.md or report-template.md. Read js/sh.js only if BOOT returns NEED_PASTE.
${BOOT}
Steps:
1. Own tab -> https://shopee.vn/ -> BOOT -> GATE 0: username from '/api/v4/account/basic/get_account_info' and default address from '/api/v4/account/address/get_user_address_list' (is_delivery_address; city+', '+state only), both with headers {'x-api-source':'pc'}. No username -> return status "logged-out".
2. Product list (API sweep): profile; SH.forget(/${A.forgetRe}/i); SH.sweep(SH.queries({terms:${JSON.stringify(A.terms)}, parts:${JSON.stringify(A.parts)}, sorts:['relevancy','sales'], pages:1})); loop await SH.wait('sweep') until done. If a hop logs MISS, load that search page normally, wheel-scroll it (computer scroll 10 ticks x4) and read the cards with the P9 collector from your rules file.
3. Requested product: items = Object.values(SH.db().items); keep names matching /${A.titleRe}/i and NOT /${A.excludeRe}/i, no bad words, price >= ${A.minPrice} (cheaper = bait, P3), not overseas / sold out; skip keys in JSON.parse(localStorage.${A.noDeliveryKey}||'[]') (known no-delivery, P1). Return them as product_keys (all colours).
3b. listing_meta for every product_key and alt_key (no hop, from SH.db().items[k]): shop name, is_mall (official/Mall flag in the search data; "unknown" when it has none), vcx from items[k].vcx / overlay (Voucher Xtra frame), overlay verbatim, search_price (card price), and pending_price = any upcoming flash price text on the card (e.g. "3?.???.???₫ 24.10"; the P9 collector shows it).
4. Alternatives for the "Gợi ý khác" table: from the same sweep (and at most 2 extra search hops if needed) pick up to ${A.maxAlt} listings of ${A.altHint}. Same skip rules. Prefer real discounts against the brand list price, sold > 0, delivering shops. Return alt_keys with the reason.
5. Voucher list (V11): navigate your tab to https://shopee.vn/user/voucher-wallet, BOOT, profile, SH.wallet({order:${JSON.stringify(A.orderTotals)}}), await SH.wait('wallet'). Load the remaining pages with the REAL End key: browser_batch of [computer key "End" (with action_summary), computer wait 6] x4 then javascript SH.walletPages(); repeat until done:true; then SH.walletRead({order:[${A.orderTotals[0]}]}).
5b. Wallet size check (rule 2026-10-27): done:true does NOT prove the wallet is complete. Return wallet_unique (unique vouchers read), wallet_api_done, and wallet_history = JSON.parse(localStorage.__walletHist||'[]') read BEFORE you add today, keeping only entries of earlier days. Then store today: entry {d:'<YYYY-MM-DD Vietnam time>', n:wallet_unique}, replacing an entry of the same day only if the new n is larger; keep the last 30 entries. The workflow decides from these numbers whether the read is partial — do not decide it yourself, and never describe a short read as complete.
6. Voucher ladder input (V1, V13 — from the wallet API rows only, no T&C pages here): from SH.db().wallet.rows take platform vouchers (no shopId, not coins, not LIVE-/VIDEO- codes, not free-ship) that are not expired, whose scope label (api.scope / icon_text) is not another category (Thời Trang, Khỏe & Đẹp, Hàng Quốc Tế, Xe…), and that are valid now OR start within 7 days. For each give idx, code, pct, cap, min, value (flat amount, 0 for %), scope, starts/ends (Vietnam time "dd/mm hh:mm"), tc_url = rows[idx].api.url, product_limit = rows[idx].productLimit, mall_only = scope is "SHOPEE MALL". Keep the 15 with the largest saving at order ${A.orderTotals[0]} (saving = value or min(pct*order, cap)); the workflow ranks them per listing. ALSO free-ship cards: every free-ship / "Mã vận chuyển" card valid now or within 7 days (code, card label verbatim, pct if the card shows "Giảm N%", cap, min, ends, tc_url) into ship_voucher_candidates, max 6, best cap first. Read nothing else about vouchers: the T&C pages and the vouchers' product lists are read later, only as far down each ladder as needed.
Return the structured plan. Hop budget is shared (90/h).`, { label: 'orchestrator:lists', phase: 'Lists', model: 'opus', schema: PLAN })
if (!plan || plan.status !== 'ok') return { stopped: plan }
// (rule 2026-10-27) wallet completeness is decided in code, against earlier days' counts
const WAL_N = plan.wallet_unique || 0
const walHist = (plan.wallet_history || []).filter(e => e && e.n > 0).sort((a, b) => String(a.d).localeCompare(String(b.d))).slice(-7).map(e => e.n).sort((a, b) => a - b)
const WAL_BASE = walHist.length >= 3 ? walHist[Math.floor(walHist.length / 2)] : A.walletBaselineSeed
const WAL_PARTIAL = plan.wallet_api_done === false || !WAL_N || WAL_N < A.walletMinRatio * WAL_BASE
const WAL_NOTE = WAL_PARTIAL ? `voucher tốt nhất chưa xác định — ví hôm nay chỉ đọc được ${WAL_N} thẻ (các ngày trước khoảng ${WAL_BASE} thẻ)` : ''
log(`wallet: ${WAL_N} unique, baseline ${WAL_BASE} (${walHist.length >= 3 ? walHist.length + ' earlier days' : 'seed'}), api done ${plan.wallet_api_done} -> ${WAL_PARTIAL ? 'PARTIAL' : 'complete'}`)
log(`plan: ${plan.product_keys.length} product + ${(plan.alt_keys || []).length} alternative pages, ${plan.voucher_candidates.length} voucher T&C pages`)

// ---------- 2. Haiku detail scanners ----------
// The page-reading JS (PAGE_JS, SHOPV_JS, VARIANT_JS) lives in rules/scan-product.md, next to the scanner's rules.
const pdpScan = (keys, tag) => agent(`You are a DETAIL SCANNER (Shopee product pages, read-only). Read ${RULES('scan-product')} fully and follow it exactly; read no other skill file.
KEYS = ${JSON.stringify(keys)}
Return one result per key in the schema.`, { label: `scanner:pdp:${tag}`, phase: 'Details', model: 'haiku', schema: PDP })

// (2026-10-23) the old up-front T&C scanner is gone: T&C pages are read top-down in the Vouchers step (§0b V13).

phase('Details')
const allKeys = [...plan.product_keys, ...(plan.alt_keys || []).map(a => a.key)]
const PAR = Math.max(1, A.maxParallel || 3)
const chunks = []; const per = Math.max(2, Math.ceil(allKeys.length / PAR)); for (let i = 0; i < allKeys.length; i += per) chunks.push(allKeys.slice(i, i + per)) // up to A.maxParallel scanners at once (rule 2026-10-29: 3)
const scans = await parallel(chunks.map((c, i) => () => pdpScan(c, `p${i + 1}`)))
let pdpRes = scans.filter(Boolean).flatMap(r => r.results)

// ---------- 3. Orchestrator: review ----------
const reviewPrompt = (round) => `You are the ORCHESTRATOR (review step, round ${round} of at most 2). No browser. Read ${RULES('orchestrator-review')} fully and follow it; read no other skill file.
Product: ${A.product}. Requested option: ${A.prefer}. Report language: ${A.language}.
Check the scanners' results against the plan, decide retries (round 2 must return empty retry lists; retry_vouchers is always []), then return the consolidated data package in the schema.
PLAN: ${JSON.stringify(plan)}
PRODUCT RESULTS: ${JSON.stringify(pdpRes)}`

phase('Review')
let review = await agent(reviewPrompt(1), { label: 'orchestrator:review1', phase: 'Review', model: 'opus', schema: REVIEW })
if (review && review.retry_products.length) {
  log(`retry: ${review.retry_products.length} products`)
  const re = await pdpScan(review.retry_products, 'retry')
  for (const x of (re && re.results) || []) pdpRes = pdpRes.filter(y => y.key !== x.key).concat([x])
  review = await agent(reviewPrompt(2), { label: 'orchestrator:review2', phase: 'Review', model: 'opus', schema: REVIEW })
}
if (!review) return { stopped: 'review failed', plan, pdpRes }

// ---------- 2b. Item price per option, from VARIANT_JS (2026-11-02, code only) ----------
// VARIANT_JS returns [{o, st, G, SP, VS, VSp, VSm, VSH, VSHp, VSHm, T, src, ok}] per option. G = giá gốc (= checkout "Tổng tiền
// hàng"), SP = giảm giá sản phẩm (flash included). src 'ctg' = read from the "Chi tiết giá" popup, which is rendered for the
// WEB session: VS is the web Shopee voucher (02/11 web checkout applied it: 19.841.000), the app keeps the wallet ladder.
const n0 = x => x || 0, fmt0 = v => Math.floor(v || 0).toLocaleString('de-DE') + '₫'
const preIssues = []
{
  const nm = x => String(x || '').toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim()
  for (const r of review.rows) {
    if (r.table === 'rejected') continue
    const sc = pdpRes.find(x => x && x.key === r.key); if (!sc) continue
    let opts = []; try { opts = JSON.parse(String(sc.variants || '').slice(String(sc.variants || '').indexOf('['))) } catch (e) { preIssues.push(`${r.key} variants not JSON`); continue }
    const want = nm(r.variant), on = o => nm(o.o)
    const o = opts.length === 1 ? opts[0] : opts.find(x => on(x) === want) || opts.find(x => want && (on(x).includes(want) || want.includes(on(x))))
    if (!o || !o.G) { preIssues.push(`${r.key} option "${r.variant}" not found in variants`); continue }
    if (!o.ok) preIssues.push(`${r.key} "${o.o}": ${o.src === 'gsv-no-popup' ? 'Chi tiết giá not read, shown price already has vouchers inside' : o.src === 'range' ? 'price still a range (option not applied)' : 'Chi tiết giá does not add up / differs from shown price'} -> rank last`)
    const item = o.G - o.SP
    if (r.item !== item) preIssues.push(`${r.key} item ${r.item} -> ${item} (G ${o.G} − SP ${o.SP})`)
    r.item = item; r.was = o.G > item ? o.G : 0; r.price_basis = o.ok ? 'before-voucher' : 'after-voucher'
    // shop voucher: the price-detail line when the page has one, else the best card read by SHOPV_JS (known min only)
    if (o.src === 'ctg') {
      r.shop_v = item >= n0(o.VSHm) ? n0(o.VSH) : 0; r.shop_v_name = r.shop_v ? `Voucher của Shop giảm ${o.VSHp}% đơn từ ${fmt0(o.VSHm)}` : ''
      r.page_vs = item - r.shop_v >= n0(o.VSm) ? n0(o.VS) : 0; r.page_vs_pct = o.VSp; r.page_vs_min = o.VSm
    } else {
      const save = v => v.value > 0 ? v.value : Math.min(Math.floor(item * n0(v.pct) / 100), v.cap > 0 ? v.cap : Infinity)
      const best = (sc.shop_vouchers || []).filter(v => v.min != null && item >= v.min && (v.value > 0 || v.pct > 0)).sort((a, b) => save(b) - save(a))[0]
      r.shop_v = best ? save(best) : 0; r.shop_v_name = best ? best.label : ''
    }
    // shipping straight from the scan; vouchers are filled by the voucher step only
    if (sc.ship_struck != null) { r.ship = sc.ship_struck; r.ship_promo = sc.ship_promo }
    r.app_v = r.web_v = r.later_v = r.ship_v = r.ship_v_web = 0
    if (sc.ld_price > 0 && !opts.some(x => x.T === sc.ld_price || x.G - x.SP === sc.ld_price)) preIssues.push(`${r.key} schema.org price ${sc.ld_price} matches no option`)
  }
}

// ---------- 3a. Voucher ladders (§0b V12-V13, rule 2026-10-23) ----------
// Ladders are built IN CODE from the wallet API rows (plan.voucher_candidates / ship_voucher_candidates), best saving first.
// Walking down a ladder, a voucher is read only when it is the next one that could still win: its T&C page (devices = App/Web,
// Voucher Xtra wording, free-ship channels / delivery area — cached in the browser by code until it expires) and, when it has
// product_limit, its product list (the "Dùng Ngay" page + model keyword). Stop as soon as one applies on App and one on Web.
const nn = x => x || 0
const NOW = A.nowMs
let NOW_YEAR = 1970; while (Date.UTC(NOW_YEAR + 1, 0, 1) <= NOW) NOW_YEAR++
const vnTime = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2}):(\d{2})/); if (!m) return null; const y = +(m[3] || NOW_YEAR); return Date.UTC(y, +m[2] - 1, +m[1], +m[4] - 7, +m[5]) }
const fmtTr = v => v >= 1e6 ? String(+(v / 1e6).toFixed(2)).replace('.', ',') + 'Trđ' : Math.round(v / 1000) + 'Kđ'
const fmtD = v => Math.floor(v).toLocaleString('de-DE') + '₫'
const vName = v => v.value ? `Giảm ${fmtTr(v.value)} (${v.code})` : `Giảm ${v.pct}% tối đa ${fmtTr(v.cap)} (${v.code}), chạm mức giảm tối đa từ đơn ${fmtD(v.cap * 100 / v.pct)}`
const sName = v => v.pct && v.pct < 100 ? `Miễn phí vận chuyển giảm ${v.pct}% tối đa ${fmtTr(v.cap)} (${v.code})` : `Miễn phí vận chuyển tối đa ${fmtTr(v.cap)} (${v.code})`
const XTRA_CODE = /GIAM\d|^SVIPDDV/i
const province = (String(plan.address || '').split(',').pop() || '').replace(/Tỉnh|Thành phố|TP\.?/gi, '').trim().toLowerCase()
const vrows = review.rows.filter(r => r.table !== 'rejected')
const pv = plan.voucher_candidates || [], sv = plan.ship_voucher_candidates || []
for (const r of vrows) {
  const base = nn(r.item) - nn(r.shop_v)
  const ok = v => base >= nn(v.min) && !(v.mall_only && r.is_mall !== 'yes') && !(XTRA_CODE.test(v.code) && r.vcx === 'no')
  const save = v => v.value ? Math.min(v.value, base) : Math.min(Math.floor(base * v.pct / 100), nn(v.cap) || Infinity)
  const started = v => { const t = vnTime(v.starts); return !t || t <= NOW }
  r._now = pv.filter(v => started(v) && ok(v)).map(v => ({ ...v, saving: save(v), name: vName(v) })).sort((a, b) => b.saving - a.saving)
  r._later = pv.filter(v => !started(v) && ok(v)).map(v => ({ ...v, saving: save(v), name: vName(v) })).sort((a, b) => b.saving - a.saving)
  const ship = nn(r.ship) > 0 && !r.ship_self ? nn(r.ship) : 0
  r._ship = ship ? sv.filter(v => base >= nn(v.min)).map(v => ({ ...v, saving: Math.min(v.pct && v.pct < 100 ? Math.floor(ship * v.pct / 100) : ship, nn(v.cap) || ship), name: sName(v) })).sort((a, b) => b.saving - a.saving) : []
}
// what has been read: tc[code] = {status:'ok'|'failed', web, xtra, channels:[], area:''}; inList[code|key] = 'in'|'out'|'unknown'
const tc = {}, inList = {}
// TC_JS: see rules/scan-voucher.md
const parseTc = x => { if (!x || !x.ok) return { status: 'failed' }; const dev = String(x.dev || '').replace(/^Thiết bị\s*/i, ''); return { status: 'ok', web: /(^|,\s*)Web\b/.test(dev.replace(/Meta Web/g, '')), xtra: !!x.xtra, channels: x.ch || [], area: x.area || '' } }
const listVerdict = (v, r) => !v.product_limit ? 'in' : (inList[`${v.code}|${r.key}`] || null)
// lane test: 'yes' | 'no' | 'need' (something still has to be read). A page that failed to load leaves the voucher usable as ≈.
const fits = (v, r, lane) => {
  const t = tc[v.code]; if (!t) return 'need'
  if (t.status === 'ok') {
    if (t.xtra && r.vcx !== 'yes') return 'no'
    if (lane === 'web' && t.web === false) return 'no'
    if (lane === 'ship' || lane === 'shipweb') {
      if (lane === 'shipweb' && t.web === false) return 'no'
      if (t.channels.length && r.ship_channel && !t.channels.some(c => c.toLowerCase().includes(r.ship_channel.toLowerCase()) || r.ship_channel.toLowerCase().includes(c.toLowerCase()))) return 'no'
      if (t.area && province && !t.area.toLowerCase().includes(province)) return 'no'
      return 'yes'
    }
  }
  const l = listVerdict(v, r); if (l === null) return 'need'; return l === 'out' ? 'no' : 'yes'
}
const LANES = { app: '_now', web: '_now', later: '_later', ship: '_ship', shipweb: '_ship' }
const walk = (r, lane) => { for (const v of r[LANES[lane]] || []) { const f = fits(v, r, lane); if (f === 'yes') return { pick: v }; if (f === 'need') return { need: v } } return { pick: null } }
// the next K undecided vouchers of a lane, in ladder order (K = A.voucherLookahead, default 99 = all in one round since 2026-10-26; 1 = the strict walk of 2026-10-23
// per round, ~half the rounds when the top vouchers do not apply)
const needs = (r, lane) => { const out = []; for (const v of r[LANES[lane]] || []) { const f = fits(v, r, lane); if (f === 'yes') break; if (f === 'need') { out.push(v); if (out.length >= (A.voucherLookahead || 99)) break } } return out }
const VCHECK = { type: 'object', properties: { tc: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, json: { type: 'string', description: 'the T&C JS output verbatim (JSON string)' }, from_cache: { type: 'boolean' } }, required: ['code', 'json'] } }, lists: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, status: { type: 'string', enum: ['ok', 'failed'] }, pages: { type: 'integer' }, found: { type: 'array', items: { type: 'string' } } }, required: ['code', 'status', 'found'] } } }, required: ['tc', 'lists'] }
// ELIG_JS: see rules/scan-voucher.md
const qs = tcu => { const u = String(tcu || '').replace(/&amp;/g, '&'); return (u.split('?')[1] || '').split('&') }
const tcUrl = tcu => 'https://shopee.vn/voucher/details?' + qs(tcu).filter(x => /^(evcode|promotionId|signature)=/.test(x)).join('&')
const listUrl = tcu => 'https://shopee.vn/search?' + qs(tcu).filter(x => /^(evcode|promotionId|signature)=/.test(x)).join('&') + '&keyword=' + encodeURIComponent(A.eligKeyword)
const checkScan = (tcJobs, listJobs, tag) => agent(`You are a DETAIL SCANNER (Shopee voucher pages, read-only). Read ${RULES('scan-voucher')} fully and follow it exactly; read no other skill file.
TC_JOBS = ${JSON.stringify(tcJobs)}
LIST_JOBS = ${JSON.stringify(listJobs)}
Return every job in the schema (tc: one entry per TC_JOBS code; lists: one entry per LIST_JOBS code).`, { label: `scanner:vouchers:${tag}`, phase: 'Vouchers', model: 'haiku', schema: VCHECK })

phase('Vouchers')
// (rule 2026-10-26, 3 since 2026-10-29) The voucher pages are read by up to A.maxParallel scanners in parallel, not by one
// fresh agent per ladder step (26/10: 8 sequential agents, 17 min). Round 1 reads every undecided voucher of every lane
// (voucherLookahead, default 99 = all); code then walks the ladders on those facts. A 2nd round runs only if a lane still needs a page.
const halves = (tj, lj) => { const jobs = [...tj.map(j => ['t', j]), ...lj.map(j => ['l', j])]; const out = Array.from({ length: PAR }, () => [[], []]); jobs.forEach(([k, j], i) => out[i % PAR][k === 't' ? 0 : 1].push(j)); return out.filter(([t, l]) => t.length || l.length) }
for (let round = 1; round <= 2; round++) {
  const tcJobs = {}, listJobs = {}
  for (const r of vrows) for (const lane of Object.keys(LANES)) {
    for (const v of needs(r, lane)) {
    if (!tc[v.code]) tcJobs[v.code] = { code: v.code, url: tcUrl(v.tc_url), exp_ms: Math.max(36e5, (vnTime(v.ends) || NOW + 864e5) - NOW) }
    if (v.product_limit && !inList[`${v.code}|${r.key}`] && lane !== 'ship' && lane !== 'shipweb') { const j = listJobs[v.code] = listJobs[v.code] || { code: v.code, url: listUrl(v.tc_url), keys: [] }; if (!j.keys.includes(r.key)) j.keys.push(r.key) }
  } }
  const tj = Object.values(tcJobs), lj = Object.values(listJobs)
  if (!tj.length && !lj.length) break
  log(`vouchers round ${round}: T&C ${tj.map(j => j.code).join(',') || '-'} | lists ${lj.map(j => j.code + '×' + j.keys.length).join(',') || '-'}`)
  const parts = await parallel(halves(tj, lj).map(([t, l], i) => () => checkScan(t, l, `r${round}${'abcdefgh'[i]}`)))
  const res = { tc: parts.filter(Boolean).flatMap(x => x.tc || []), lists: parts.filter(Boolean).flatMap(x => x.lists || []) }
  for (const j of tj) { const x = ((res && res.tc) || []).find(y => y.code === j.code); let o = null; try { o = x && JSON.parse(x.json) } catch (e) {} tc[j.code] = parseTc(o) }
  for (const j of lj) { const x = ((res && res.lists) || []).find(y => y.code === j.code); for (const k of j.keys) inList[`${j.code}|${k}`] = !x || x.status !== 'ok' ? 'unknown' : (x.found || []).includes(k) ? 'in' : 'out' }
}
// rounds ran out: whatever a lane still needs stays usable as ≈ "chưa kiểm tra" (never silently dropped)
for (const r of vrows) for (const lane of Object.keys(LANES)) for (const v of needs(r, lane)) { if (!tc[v.code]) tc[v.code] = { status: 'failed' }; if (v.product_limit && !inList[`${v.code}|${r.key}`]) inList[`${v.code}|${r.key}`] = 'unknown' }
const why = (v, r) => { const t = tc[v.code] || {}; const parts = []; if (t.status !== 'ok') parts.push('chưa đọc được trang điều kiện'); if (v.product_limit) { const l = inList[`${v.code}|${r.key}`]; parts.push(l === 'in' ? 'đã kiểm tra: sản phẩm này có trong danh sách áp dụng của voucher' : 'chưa kiểm tra được danh sách sản phẩm của voucher') } else parts.push('không giới hạn sản phẩm'); return parts.join('; ') }
const notes = []
for (const r of vrows) {
  const a = walk(r, 'app').pick, w = walk(r, 'web').pick, l = walk(r, 'later').pick, s1 = walk(r, 'ship').pick, s2 = walk(r, 'shipweb').pick
  r.app_v = a ? a.saving : 0; r.app_v_name = a ? a.name : ''; r.web_v = w ? w.saving : 0; r.web_v_name = w ? w.name : ''
  r.wallet_partial_vi = WAL_NOTE
  r.ship_v = s1 ? s1.saving : 0; r.ship_v_name = s1 ? s1.name : ''; r.ship_v_web = s2 ? s2.saving : 0; r.ship_v_web_name = s2 ? s2.name : ''
  r.later_v = l && l.saving > r.app_v ? l.saving : 0; r.later_v_name = r.later_v ? l.name : ''; r.later_window = r.later_v ? `[${l.starts || '?'} - ${l.ends || '?'} - Số lượng: ?]` : ''; r.later_replaces = r.later_v ? (a ? a.name : (WAL_PARTIAL ? 'voucher hôm nay chưa xác định' : 'không có voucher')) : ''
  const out = [...r._now, ...r._later].filter((v, i, x) => x.indexOf(v) === i && ((tc[v.code] || {}).status === 'ok' && fits(v, r, 'app') === 'no')).map(v => v.name)
  const rest = r._now.filter(v => v !== a && fits(v, r, 'app') !== 'no')[0]
  r.fallback_vi = rest ? `Dự phòng: ${rest.name}${(tc[rest.code] || inList[`${rest.code}|${r.key}`]) ? ' (' + why(rest, r) + ')' : ' (chưa kiểm tra, xếp sau voucher đã chọn)'}` : (WAL_PARTIAL ? `Voucher dự phòng chưa xác định (${WAL_NOTE}).` : 'Không còn voucher Shopee dự phòng nào đã biết áp dụng cho sản phẩm này.')
  r.fallback_saving = rest ? rest.saving : 0
  r.voucher_check_vi = [a ? `${a.name}: ${why(a, r)}${tc[a.code] && tc[a.code].web === false ? '; chỉ dùng trên App' : ''}.` : (WAL_PARTIAL ? `Chưa tìm được voucher áp dụng trong số thẻ đã đọc; ${WAL_NOTE}.` : 'Không có voucher Shopee nào áp dụng cho sản phẩm này.'), WAL_PARTIAL && a ? `Có thể còn voucher tốt hơn: ${WAL_NOTE}.` : '', w && w !== a ? `Trên Web: ${w.name}.` : '', out.length ? `Không áp dụng cho sản phẩm này: ${out.join('; ')}.` : ''].filter(Boolean).join(' ')
  notes.push(`${r.key}: app ${a ? a.code : '-'} web ${w ? w.code : '-'} later ${r.later_v ? l.code : '-'} ship ${s1 ? s1.code : '-'}/${s2 ? s2.code : '-'}`)
  delete r._now; delete r._later; delete r._ship
}
log(`voucher picks: ${notes.join('; ')}; T&C read ${Object.keys(tc).length}, lists read ${new Set(Object.keys(inList).map(k => k.split('|')[0])).size}`)

// ---------- 3b. Totals, computed in code (no agent; rule 2026-10-29: the review no longer writes a calc script) ----------
const issues = [...preIssues]
const bestOf = () => review.rows.filter(r => r.table === 'best').reduce((m, r) => (m == null || r.app_total < m ? r.app_total : m), null)
for (const r of review.rows) {
  const n = x => x || 0
  if (n(r.ship) < 0) { issues.push(`${r.key} ship unknown (${r.ship}) -> totals exclude shipping; must be ranked last`); r.ship_unknown = true; r.ship = 0 }
  const shipNet = Math.max(0, n(r.ship) - n(r.ship_v))
  if (n(r.ship_v) > n(r.ship)) issues.push(`${r.key} ship_v ${r.ship_v} > ship ${r.ship} -> capped`)
  const shipNetWeb = Math.max(0, n(r.ship) - n(r.ship_v_web))
  // two lanes (2026-11-02): web = Chi tiết giá voucher when the page has one, else the wallet's web pick; app = wallet pick.
  // A shown price that still has vouchers inside (ok false) gets no Shopee voucher at all.
  if (r.price_basis === 'after-voucher') { r.app_v = 0; r.web_v = 0; r.later_v = 0 }
  else if (n(r.page_vs) > 0) { if (n(r.web_v) !== r.page_vs) r.web_v_name = `Voucher Shopee giảm ${r.page_vs_pct}% đơn từ ${fmtD(r.page_vs_min)} (theo Chi tiết giá)`; r.web_v = r.page_vs }
  const app = n(r.item) - n(r.shop_v) + shipNet - n(r.app_v), web = n(r.item) - n(r.shop_v) + shipNetWeb - n(r.web_v)
  if (r.price_basis === 'after-voucher' && n(r.shop_v) > 0) issues.push(`${r.key} shop_v ${r.shop_v} on an after-voucher price: check for a double deduction`)
  r.app_total = app; r.web_total = web
  if (r.later_v) r.later_total = n(r.item) - n(r.shop_v) + shipNet - n(r.later_v)
  if (r.later_v) { const extra = r.app_total - r.later_total, pc = extra / r.app_total * 100; r.later_extra = extra; r.verdict_vi = pc >= 5 ? `Đáng chờ: rẻ hơn ${fmtD(extra)} (${pc.toFixed(2).replace('.', ',')}%)` : `Không đáng chờ: chỉ rẻ hơn ${fmtD(extra)} (${pc.toFixed(2).replace('.', ',')}%), thấp hơn ngưỡng 5%` } else if (r.table !== 'rejected') r.verdict_vi = WAL_PARTIAL ? `Chưa xác định có đáng chờ không: ${WAL_NOTE}, nên chưa biết có voucher sắp mở tốt hơn hay không.` : 'Không có voucher sắp mở nào tốt hơn hôm nay cho sản phẩm này.'
  if (r.fallback_saving) r.fallback_total = n(r.item) - n(r.shop_v) + shipNet - n(r.fallback_saving)
  if (r.ship_promo >= 0) r.app_total_promo_ship = n(r.item) - n(r.shop_v) + Math.max(0, r.ship_promo - n(r.ship_v)) - n(r.app_v)
}
// (rule 2026-10-29) "Giá tốt nhất" rows are ordered by their cheapest total, min(App, Web), smallest first;
// a row with unknown shipping goes last. Other tables keep their order. Stable sort, done in code before the reporter.
{
  const key = r => (r.ship_unknown ? 1e15 : 0) + Math.min(r.app_total || 0, r.web_total || r.app_total || 0)
  const bestRows = review.rows.filter(r => r.table === 'best').map((r, i) => [r, i]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(x => x[0])
  let k = 0; review.rows = review.rows.map(r => r.table === 'best' ? bestRows[k++] : r)
}
const best = bestOf()
for (const r of review.rows) if (best != null && r.table !== 'rejected') {
  const d = r.app_total - best
  r.diff_vs_best = d
}
const JARGON = /GATE\s*0|\bhops?\b|\bMISS\b|\bbait\b|\bspec\b|\bVCX\b|vcx:|shopid|itemid|(^|[\s(,])#\d{1,3}\b|PARTIAL|COMPLETE/i
const texts = [['header_vi', review.header_vi],
  ...review.rows.flatMap(r => ['notes_vi', 'rating_vi', 'fallback_vi', 'verdict_vi', 'axis', 'flash_vi', 'voucher_check_vi'].map(f => [`${r.key}.${f}`, r[f] || '']))]
const jargon = texts.filter(([, t]) => JARGON.test(t || '')).map(([f, t]) => `${f}: "${(t.match(JARGON) || [''])[0]}"`)
if (issues.length) log(`data checks: ${issues.join('; ')}`)
if (jargon.length) log(`internal terms in data package: ${jargon.join('; ')}`)
const DATA = JSON.stringify({ header_vi: review.header_vi, wallet_partial: WAL_PARTIAL, wallet_partial_vi: WAL_NOTE, rows: review.rows }, null, 1)
// (rule 2026-10-27) with a partial wallet the report must never claim that no voucher applies
const NO_VOUCHER_RE = /không có voucher[^.|\]<]{0,40}(dùng được|áp dụng|dự phòng)|không còn voucher[^.|\]<]{0,40}(dự phòng|áp dụng)|không có voucher sắp mở/gi
const partialHits = t => WAL_PARTIAL ? ((String(t || '').match(NO_VOUCHER_RE)) || []) : []

// ---------- 4a. Report tables rendered in CODE (rule 2026-10-29: the 6 columns never go through an LLM) ----------
// Every cell is built from DATA with fixed templates, so the hard rules (App/Web lines, voucher names with (CODE),
// rating column = rating only, Buy-later window + verdict, "thay cho", sort order) hold by construction.
// The reporter only writes the "Khuyến nghị" prose (rules/reporter.md); the tables are checked to come back unchanged.
const renderReport = (D, o) => {
  const f = v => Math.round(v || 0).toLocaleString('de-DE')
  const fd = v => f(v) + '₫'
  const esc = s => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\r?\n+/g, ' ').trim()
  const noCap = s => String(s || '').replace(/,\s*chạm mức giảm tối đa từ đơn [\d.]+₫/g, '')
  const capOf = s => (String(s || '').match(/chạm mức giảm tối đa từ đơn [\d.]+₫/) || [''])[0]
  const vNote = o.walletPartial ? `voucher tốt nhất chưa xác định — ví chỉ đọc ${o.walletN} thẻ` : ''
  const selfShip = r => /tự vận chuyển/i.test(r.ship_channel || '')
  const sentence = s => { s = esc(s); return s && !/[.!?…]$/.test(s) ? s + '.' : s }
  const lines = []
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1)
  // "Giá tốt nhất" = the maxBest (3) cheapest by min(App, Web), one shop per row (report-template §2; rule 2026-10-29:
  // the A07s report went out with 58 rows); the rest is only counted in the coverage line
  const sk = r => (r.ship_unknown ? 1e15 : 0) + Math.min(r.app_total || 0, r.web_total || r.app_total || 0)
  const bestAll = D.rows.filter(r => r.table === 'best').map((r, i) => [r, i]).sort((x, y) => sk(x[0]) - sk(y[0]) || x[1] - y[1]).map(x => x[0])
  const seenShop = new Set()
  const best = bestAll.filter(r => { const s = String(r.shop || r.key).trim().toLowerCase(); if (seenShop.has(s)) return false; seenShop.add(s); return true }).slice(0, o.maxBest || 3)
  const hidden = bestAll.length - best.length
  lines.push(`# ${cap1(o.product)} — Shopee app trước (kiểm tra ${o.date})`, '')
  const hv = String(D.header_vi || '').split(/\n+/).map(x => x.trim()).filter(Boolean)
  if (hv[0]) lines.push(hv[0].replace(/giao tới ([^(]+?) \(/, 'giao tới **$1** ('), '')
  if (hv[1]) { const [a, ...b] = hv[1].replace(/^\*{0,2}Phạm vi:?\*{0,2}\s*/i, '').split(/\s+—\s+/); lines.push(`**Phạm vi:** ${a}${hidden > 0 ? ` · ${hidden} tin khác của sản phẩm này đắt hơn, không liệt kê` : ''}${b.length ? '<br>\n' + b.join(' — ') : ''}`, '') }
  for (const extra of hv.slice(2)) lines.push(extra, '')
  const altLabel = r => {
    const a = String(r.axis || '').trim()
    if (/màu|phân loại/i.test(a)) return `Màu khác: ${esc(String(r.variant || '').split('·').pop().trim() || a)}`
    if (/đơn vị|per unit/i.test(a)) return 'Rẻ hơn trên mỗi đơn vị'
    if (/uy tín/i.test(a)) return 'Shop uy tín'
    if (/mới hơn|newer/i.test(a)) return 'Mẫu mới hơn'
    if (/cao cấp|cao hơn|higher/i.test(a)) return 'Mẫu cao cấp hơn'
    if (/rẻ hơn|giảm sâu|cheaper|deeper/i.test(a)) return 'Mẫu khác, rẻ hơn'
    return cap1(esc(a || 'Gợi ý khác'))
  }
  const HEAD = '| Sản phẩm | Đánh giá (lưu ý) | Giá niêm yết | Giá mua ngay | Giá mua sau | Gợi ý mua |\n|---|---|---|---|---|---|'
  const side = (r, lane) => {
    const ship = Math.max(0, r.ship || 0)
    const sv = Math.min(lane === 'app' ? (r.ship_v || 0) : (r.ship_v_web || 0), ship)
    const pv = lane === 'app' ? (r.app_v || 0) : (r.web_v || 0)
    const names = [pv > 0 && noCap(lane === 'app' ? r.app_v_name : r.web_v_name), sv > 0 && noCap(lane === 'app' ? r.ship_v_name : (r.ship_v_web_name || r.ship_v_name))].filter(Boolean)
    const total = lane === 'app' ? r.app_total : r.web_total
    let calc = `${f(r.item)}${r.shop_v > 0 ? ` − ${f(r.shop_v)} (mã shop)` : ''} + ship ${f(ship)}`
    calc += pv + sv > 0 ? ` − ${pv && sv ? `${f(pv)} − ${f(sv)}` : f(pv + sv)} [${names.join('; ')}]` : ` (${vNote || `không có voucher dùng được trên ${lane === 'app' ? 'App' : 'Web'}`})`
    return `**${lane === 'app' ? 'App' : 'Web'}: ${fd(total)}** = ${calc}`
  }
  const row = (r, n, isBest, bestRow) => {
    // "Gợi ý khác": the short reason leads the cell (rule 2026-10-29), e.g. "**4. Mẫu cao cấp hơn**<br>[title]<br>Shop: …"
    const product = r.table === 'alt'
      ? `**${n}. ${altLabel(r)}**<br>[${esc(r.title)}](https://shopee.vn/product/${r.key})<br>Shop: ${esc(r.shop)}`
      : `**${n}. [${esc(r.title)}](https://shopee.vn/product/${r.key})**<br>Shop: ${esc(r.shop)}`
    const mall = r.is_mall === 'yes' ? 'Shopee Mall.' : r.is_mall === 'no' ? 'Shop thường (không phải Mall).' : ''
    const rating = [sentence(r.rating_vi || 'Chưa đọc được đánh giá'), mall].filter(Boolean).join(' ')
    let shipTxt
    if (r.ship_unknown) shipTxt = 'Phí vận chuyển chưa đọc được'
    else if (selfShip(r) || (!r.ship && !r.ship_channel)) shipTxt = `Phí vận chuyển ${fd(r.ship || 0)}${selfShip(r) ? ' (người bán tự vận chuyển)' : ''}`
    else shipTxt = `Phí vận chuyển ${fd(r.ship)}${r.ship_channel ? ` (${esc(r.ship_channel)})` : ''}${r.ship_promo >= 0 && r.ship_promo < r.ship ? `, có thể chỉ còn ${fd(r.ship_promo)} nếu Shopee áp giá khuyến mãi lúc thanh toán` : ''}`
    const listing = `**${fd(r.item)}**${r.was > 0 ? `<br>~~${fd(r.was)}~~` : ''}${r.price_basis === 'after-voucher' ? '<br>(giá đã trừ sẵn voucher)' : ''}<br>${shipTxt}`
    const buyNow = `${side(r, 'app')}<br>${side(r, 'web')}`
    const later = []
    if (r.flash_vi) later.push(sentence(r.flash_vi))
    if (r.later_v > 0) later.push(`${noCap(r.later_v_name)} ${r.later_window || '[? - ? - Số lượng: ?]'}, thay cho ${(String(r.later_replaces || '').match(/\(([A-Z0-9-]{5,})\)/) || [])[1] ? `mã đang dùng hôm nay (${String(r.later_replaces).match(/\(([A-Z0-9-]{5,})\)/)[1]})` : 'voucher hôm nay'}: tổng ${fd(r.later_total)}, rẻ hơn ${fd(r.later_extra || (r.app_total - r.later_total))} so với hôm nay.`)
    else if (!o.walletPartial) later.push('Không có voucher sắp mở nào tốt hơn hôm nay.')
    later.push(`**${esc(r.verdict_vi || 'Không đáng chờ: chưa thấy ưu đãi sắp mở nào tốt hơn')}**`)
    const appNames = [r.app_v > 0 && noCap(r.app_v_name), r.ship_v > 0 && noCap(r.ship_v_name)].filter(Boolean)
    const guide = [`**App:** chọn phân loại ${esc(r.variant || 'đúng model')}, ${appNames.length ? `chọn ${appNames.join(' và ')} ở màn chọn voucher khi thanh toán` : 'kiểm tra voucher ở màn chọn voucher khi thanh toán'}, tổng dự kiến ${fd(r.app_total)}.`]
    if (r.advice_vi) guide.push(sentence(r.advice_vi))
    if (r.fallback_saving > 0 && r.fallback_total) {
      const fb = String(r.fallback_vi || ''), checked = /đã kiểm tra/.test(fb)
      guide.push(`Dự phòng nếu mã không nhận: ${noCap(fb.replace(/^Dự phòng:\s*/i, '').replace(/\s*\((đã|chưa)[^)]*\)\s*\.?$/, ''))}${checked ? ' (đã kiểm tra sản phẩm có trong danh sách áp dụng)' : ''}, tổng ${fd(r.fallback_total)}.`)
    } else if (o.walletPartial) guide.push(`Voucher dự phòng: chưa xác định (ví chỉ đọc ${o.walletN} thẻ).`)
    else if (r.fallback_vi) guide.push(sentence(noCap(r.fallback_vi)))
    if (r.app_total_promo_ship != null && r.app_total_promo_ship !== r.app_total) guide.push(`Nếu áp phí ship khuyến mãi: ${fd(r.app_total_promo_ship)}.`)
    if (r.web_total < r.app_total) guide.push(`**Web:** rẻ hơn App, tổng ${fd(r.web_total)}.`)
    const d = r.diff_vs_best
    if (isBest) guide.push(d === 0 || d == null ? 'Đây là tin rẻ nhất trên App.' : `Chênh lệch so với tin rẻ nhất: ${d > 0 ? '+' : '−'}${fd(Math.abs(d))}.`)
    else guide.push(`${d < 0 ? 'Rẻ hơn' : 'Đắt hơn'} tin rẻ nhất ${fd(Math.abs(d || 0))}.`)
    return `| ${product} | ${rating} | ${listing} | ${buyNow} | ${later.join(' ')} | ${guide.join(' ')} |`
  }
  // (rule 2026-10-29) the cheapest listing of a trusted shop goes into "Gợi ý khác" when "Giá tốt nhất" does not
  // already hold it. Trusted = Shopee Mall + listing rating/reviews/sold over o.trusted (rows only carry listing-level ratings).
  const T = o.trusted || { minStars: 4.8, minReviews: 5, minSold: 50 }
  const stars = r => parseFloat(((String(r.rating_vi || '').match(/([\d.,]+)\s*sao/i) || [])[1] || '0').replace(',', '.'))
  const reviews = r => parseInt(((String(r.rating_vi || '').match(/\(([\d.]+)\s*đánh giá/i) || [])[1] || '0').replace(/\./g, ''), 10)
  const sold = r => { const m = String(r.rating_vi || '').match(/đã bán\s*([\d.,]+)\s*(k)?/i); return !m ? 0 : m[2] ? parseFloat(m[1].replace(',', '.')) * 1000 : parseInt(m[1].replace(/[.,]/g, ''), 10) }
  const trusted = r => r.is_mall === 'yes' && stars(r) >= T.minStars && reviews(r) >= T.minReviews && sold(r) >= T.minSold
  const trustRow = bestAll.find(trusted)
  const alt = D.rows.filter(r => r.table === 'alt'), rej = D.rows.filter(r => r.table === 'rejected')
  if (trustRow && !best.includes(trustRow)) alt.unshift({ ...trustRow, table: 'alt', axis: 'Shop uy tín' })
  let n = 0
  lines.push('## Giá tốt nhất', HEAD, ...best.map(r => row(r, ++n, true)), '')
  lines.push('## Gợi ý khác')
  if (alt.length) lines.push(HEAD, ...alt.map(r => row(r, ++n, false)), '')
  else lines.push('Không có gợi ý nào khác đáng xem hôm nay.', '')
  lines.push('## Tin bị loại', '| Tin | Lý do |', '|---|---|')
  if (rej.length) lines.push(...rej.map(r => `| "${esc(r.title)}" (${esc(r.shop)}), ${fd(r.item)} | ${esc(r.notes_vi || 'không rõ lý do')} |`))
  else lines.push('| (không có) | — |')
  lines.push('')
  const tables = lines.join('\n')
  // facts for "Khuyến nghị": every % voucher named in the tables needs its cap phrase once there (V8)
  const named = new Map()
  for (const r of [...best, ...alt]) for (const s of [r.app_v > 0 && r.app_v_name, r.web_v > 0 && r.web_v_name, r.later_v > 0 && r.later_v_name, r.fallback_saving > 0 && String(r.fallback_vi || '').replace(/^Dự phòng:\s*/i, '').replace(/\s*\((đã|chưa)[^)]*\)\s*\.?$/, '')]) {
    if (s && capOf(s)) named.set(noCap(s), capOf(s))
  }
  const top = best.slice().sort((a, b) => a.app_total - b.app_total)[0]
  const fallbackLine = top && top.fallback_saving > 0 ? ` Nếu mã không nhận, dự phòng ${String(top.fallback_vi || '').replace(/^Dự phòng:\s*/i, '').replace(/\s*\((đã|chưa)[^)]*\)\s*\.?$/, '')} thì tổng ${fd(top.fallback_total)}.` : ''
  const adv = []
  if (top) adv.push(`- Rẻ nhất trên App: ${esc(top.shop)}, ${fd(top.app_total)}${top.app_v > 0 ? ` với ${top.app_v_name}` : ''}.${fallbackLine}`)
  if (o.walletPartial) adv.push(`- Có thể còn voucher tốt hơn: ${esc(D.wallet_partial_vi || vNote)}. Hãy kiểm tra màn chọn voucher khi thanh toán trước khi trả tiền.`)
  for (const r of alt.slice(0, 2)) adv.push(`- ${cap1(esc(r.axis || 'Gợi ý khác'))}: ${esc(r.shop)} ${fd(r.app_total)}${r.advice_vi ? ` — ${esc(r.advice_vi).replace(/\.$/, '')}` : ''}.`)
  for (const r of [...best, ...alt].filter(r => r.later_v > 0)) adv.push(`- Mua sau: ${esc(r.shop)} có ${r.later_v_name}; ${esc(r.verdict_vi)}.`)
  const used = adv.join('\n')
  for (const [nm, cp] of named) if (!used.includes(cp) || !used.includes(nm)) adv.push(`- ${nm}, ${cp}.`)
  return { tables, defaultAdvice: '## Khuyến nghị\n' + adv.join('\n') + '\n', capPhrases: [...named].map(([nm, cp]) => `${nm}, ${cp}`) }
}

// ---------- 4b. Reporter (Sonnet): writes only "Khuyến nghị", lints the whole file ----------
phase('Report')
const vnDate = (() => { const t = NOW + 7 * 36e5; let y = 1970; while (Date.UTC(y + 1, 0, 1) <= t) y++; let m = 0; while (m < 11 && Date.UTC(y, m + 1, 1) <= t) m++; const d = Math.floor((t - Date.UTC(y, m, 1)) / 864e5) + 1; return `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}` })()
const LINT = f => `node ${SK}/tools/lint-report.js ${f}`
const R = renderReport(JSON.parse(DATA), { product: A.product, date: vnDate, walletPartial: WAL_PARTIAL, walletN: WAL_N, maxBest: A.maxBest, trusted: A.trustedShop })
const file = `${A.outDir}/report.md`
const REPORTER = { type: 'object', properties: { advice_md: { type: 'string', description: 'the final "## Khuyến nghị" section only, heading included' }, lint_output: { type: 'string', description: 'last linter output verbatim' } }, required: ['advice_md', 'lint_output'] }
const rep = await agent(`You are the REPORTER (Sonnet). Read ${RULES('reporter')} fully and follow it; read no other skill file.
Language: ${A.language}. Report file: ${file} (run mkdir -p ${A.outDir} first). Linter: ${LINT(file)}
TABLES (fixed, rendered by code — copy byte for byte, never edit):
<<<TABLES
${R.tables}
TABLES>>>
DEFAULT_ADVICE (facts to keep; rewrite it as clear prose):
${R.defaultAdvice}
CAP_PHRASES (each must appear once, verbatim, in your section):
${R.capPhrases.map(x => '- ' + x).join('\n') || '- (none)'}
WALLET_PARTIAL: ${WAL_PARTIAL ? 'true — ' + WAL_NOTE : 'false'}
DATA (JSON, background for the recommendation; numbers must be copied, never recomputed):
${DATA}`, { label: 'reporter', phase: 'Report', model: 'sonnet', schema: REPORTER })
let advice = rep && /^##\s*Khuyến nghị/m.test(rep.advice_md || '') ? String(rep.advice_md).slice(String(rep.advice_md).search(/^##\s*Khuyến nghị/m)).trim() + '\n' : R.defaultAdvice
// the tables are code's: whatever the reporter did, the returned report is TABLES + its advice section only
const missingCaps = R.capPhrases.filter(c => !advice.includes(c.split(', chạm')[1] ? 'chạm' + c.split(', chạm')[1] : c))
if (missingCaps.length) { log(`reporter dropped cap phrases, appended in code: ${missingCaps.length}`); advice = advice.trimEnd() + '\n' + missingCaps.map(c => `- ${c}.`).join('\n') + '\n' }
let draft = R.tables + '\n' + advice
const lintOk = !!(rep && /^OK\b/m.test(rep.lint_output || '')) && !missingCaps.length
if (!lintOk) log(`lint not confirmed for the returned report (${missingCaps.length ? 'cap phrases appended in code after the reporter linted' : (rep && rep.lint_output || 'no reporter result').slice(0, 300)}) - the caller must run ${LINT(file)} on it`)
// last resort: the loop ended with the wording still there -> replace it in code so the claim never ships
if (partialHits(draft).length) { draft = String(draft).replace(/\(không có voucher dùng được trên (App|Web)\)/g, `(voucher tốt nhất chưa xác định — ví chỉ đọc ${WAL_N} thẻ)`).replace(NO_VOUCHER_RE, `voucher tốt nhất chưa xác định (ví chỉ đọc ${WAL_N} thẻ)`); log('partial-wallet wording replaced in code') }
// ---------- 5. Close the run's browser tabs (rule 2026-11-03) ----------
// renderReport is plain JS with no browser access, so a small agent closes the tabs. Claude in Chrome puts every tab an
// agent opens into its own tab group; tabs_context_mcp lists only that group, so the user's own tabs are never touched.
// Runs after the report so a scanner that stopped early cannot leave tabs behind.
phase('Cleanup')
const TABS = { type: 'object', properties: { closed: { type: 'integer' }, left: { type: 'integer' }, note: { type: 'string' } }, required: ['closed', 'left'] }
const tabs = await agent(`Close the browser tabs this Shopee run opened. Load mcp__claude-in-chrome__tabs_context_mcp and mcp__claude-in-chrome__tabs_close_mcp with ONE ToolSearch call ("select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_close_mcp"). Call tabs_context_mcp WITHOUT createIfEmpty, then tabs_close_mcp on every tab it lists (the run's own tab group only), then tabs_context_mcp again. Return closed = tabs closed, left = tabs still listed. No Chrome tools → closed 0, left 0, note "no-chrome".`, { label: 'cleanup:tabs', phase: 'Cleanup', model: 'haiku', schema: TABS })
log(`tabs closed: ${tabs ? tabs.closed : '?'}${tabs && tabs.left ? `, still open: ${tabs.left}` : ''}`)
return { tabsClosed: tabs ? tabs.closed : null, walletPartial: WAL_PARTIAL, walletUnique: WAL_N, walletBaseline: WAL_BASE, plan, pdp: pdpRes, tc, data: JSON.parse(DATA), dataChecks: issues, jargon, report: draft, reportFile: file, lintOk, lint: rep ? rep.lint_output : null }
