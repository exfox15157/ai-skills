// SH v3.9 — shopee-vn page library. Paste once per version (BOOT restores it after reloads); calls are one-liners `SH.*`.
// It also saves itself to this origin's localStorage so after a reload the BOOT one-liner in SKILL.md
// restores it without pasting. Read-only (no cart/checkout writes). Never forges request signatures:
// it only reads JSON the page's own signed XHR/fetch calls already received.
(function install(lib) {
  try { localStorage.setItem('__shlib', '(' + lib + ')()'); } catch (e) { /* storage blocked: paste again after reloads */ }
  return lib();
})(function SHLIB() {
  const VER = '3.9';
  const W = typeof window !== 'undefined' ? window : globalThis;
  if (W.SH && W.SH.v === VER) return 'SH ' + VER + ' already installed';

  /* ---------- pure helpers (unit-tested in tests/sh.test.js) ---------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const V = (x) => (x ? Math.round(x / 1e5) : null); // Shopee API money is VND × 100000
  const clip = (s, n) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim().slice(0, n);
  const M = (v) => (v == null ? '?' : (v / 1e6).toFixed(2) + 'M');
  const K = (v) => (v == null ? '?' : Math.abs(v) >= 1e6 ? M(v) : +(v / 1e3).toFixed(1) + 'k'); // 240500 → 240.5k
  const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
  const out = (o, max = 6000) => { const s = typeof o === 'string' ? o : JSON.stringify(o); return s.length > max ? s.slice(0, max) + ` …[+${s.length - max} chars cut — narrow the call]` : s; };

  /** "1.000.000" / "1,5m" / "300k" / "2 triệu" → VND */
  function money(s) {
    if (s == null) return 0;
    const m = String(s).toLowerCase().match(/(\d[\d.,]*)(?:[ \t]*(triệu|tr|nghìn|m|k)(?![a-z]))?/);
    if (!m) return 0;
    let n = m[1];
    n = /^\d{1,3}([.,]\d{3})+$/.test(n) ? n.replace(/[.,]/g, '') : n.replace(',', '.');
    const v = parseFloat(n), u = m[2];
    return Math.round(/^(m|tr|triệu)$/.test(u) ? v * 1e6 : /^(k|nghìn)$/.test(u) ? v * 1e3 : v);
  }

  // RAM part numbers → specs, so "title ≠ part number" is caught without a web lookup.
  const spd2 = (d) => ({ 21: 2133, 26: 2666, 29: 2933, 34: 3466 }[+d] || +d * 100);
  const MOD = { S: 1, D: 2, Q: 4 };
  const PARTS = [
    // Kingston FURY / HyperX  KF432C16BBK2/32 → DDR4-3200 CL16, 2 sticks, 32GB total
    [/\b(?:KF|HX)(\d)(\d{2})C(\d{2})[A-Z0-9]*?(?:K(\d))?\/(\d+)/, (m) => ({ brand: 'Kingston', gen: +m[1], speed: spd2(m[2]), cl: +m[3], sticks: +(m[4] || 1), totalGB: +m[5] })],
    // Corsair  CMK32GX4M2E3200C16 → 32GB total, DDR4, 2 sticks, 3200 CL16 (CMK = Vengeance LPX, low profile)
    [/\bCM([A-Z]{1,2})(\d+)GX(\d)M(\d)[A-Z]?(\d{4})C(\d{2})(?!\d)/, (m) => ({ brand: 'Corsair', series: m[1], gen: +m[3], sticks: +m[4], totalGB: +m[2], speed: +m[5], cl: +m[6] })],
    // G.Skill  F4-3200C16D-32GVK → DDR4-3200 CL16, D = 2 sticks, 32GB total
    [/\bF(\d)-(\d{4})C(\d{2})([SDQ])-(\d+)G([A-Z]{1,4})/, (m) => ({ brand: 'G.Skill', gen: +m[1], speed: +m[2], cl: +m[3], sticks: MOD[m[4]], totalGB: +m[5], series: m[6] })],
    // TeamGroup  TLZGD432G3200HC16CDC01 → DDR4, 32GB total, 3200 CL16, DC = 2 sticks
    [/\bT[A-Z]{3,5}(\d)(\d{1,3})G(\d{4})HC(\d{2})[A-Z]?(DC|QC)?/, (m) => ({ brand: 'TeamGroup', gen: +m[1], totalGB: +m[2], speed: +m[3], cl: +m[4], sticks: m[5] === 'DC' ? 2 : m[5] === 'QC' ? 4 : 1 })],
    // Crucial  CT2K16G4DFRA32A → 2×16GB DDR4-3200 (CL not in the part number)
    [/\bCT(?:(\d)K)?(\d+)G(\d)[A-Z]{3,5}\d?(\d{2})A?\b/, (m) => ({ brand: 'Crucial', sticks: +(m[1] || 1), totalGB: +(m[1] || 1) * +m[2], gen: +m[3], speed: spd2(m[4]) })],
    // Crucial Ballistix  BL2K16G32C16U4B → 2×16GB DDR4-3200 CL16
    [/\bBL(?:(\d)K)?(\d+)G(\d{2})C(\d{2})[A-Z](\d)[A-Z]\b/, (m) => ({ brand: 'Crucial Ballistix', sticks: +(m[1] || 1), totalGB: +(m[1] || 1) * +m[2], speed: spd2(m[3]), cl: +m[4], gen: +m[5] })],
    // ADATA XPG  AX4U32008G16A-DB10 → DDR4-3200, 8GB per stick, CL16, D = 2 sticks
    [/\bAX(\d)U(\d{4})(\d+)G(\d{2})[A-Z]?-([SDQ])/, (m) => ({ brand: 'ADATA', gen: +m[1], speed: +m[2], cl: +m[4], sticks: MOD[m[5]], totalGB: MOD[m[5]] * +m[3] })],
  ];
  function decodeParts(text) {
    const T = String(text || '').toUpperCase(), seen = new Map();
    for (const [re, f] of PARTS) for (const m of T.matchAll(new RegExp(re.source, 'g'))) if (!seen.has(m[0])) seen.set(m[0], { part: m[0], ...f(m) });
    return [...seen.values()];
  }
  function titleSpecs(t) {
    t = String(t || '');
    const kit = t.match(/\b(\d)\s*[x×*]\s*(\d{1,2})\s*g?b?\b/i), kit2 = t.match(/\b(\d{1,2})\s*gb?\s*[x×*]\s*(\d)\b/i);
    return {
      gen: +((t.match(/ddr\s?([345])/i) || [])[1]) || null,
      speed: +((t.match(/\b(2133|2400|2666|2933|3000|3200|3466|3600|4000|4800|5200|5600|6000|6400|7200)\s*(?:mhz)?\b/i) || [])[1]) || null,
      cl: +((t.match(/\bCL?\s?(\d{2})\b/i) || [])[1]) || null,
      sticks: kit ? +kit[1] : kit2 ? +kit2[2] : null,
      perGB: kit ? +kit[2] : kit2 ? +kit2[1] : null,
    };
  }
  /** "16Gb (2x8Gb) 3600MHz" → 16, "32GB 3200MHz" → 32, "2x16" → 32, "Đen" → null */
  function modelGB(name) {
    const n = String(name || ''), k = n.match(/\b(\d)\s*[x×*]\s*(\d{1,3})\s*g?b?\b/i) || n.match(/\b(\d{1,3})\s*gb?\s*[x×*]\s*(\d)\b/i);
    if (k) return +k[1] * +k[2];
    const g = n.match(/\b(\d{1,3})\s*gb\b/i);
    return g ? +g[1] : null;
  }
  function mismatch(ts, p) {
    const f = [];
    if (ts.gen && p.gen && ts.gen !== p.gen) f.push(`DDR${ts.gen}≠DDR${p.gen}`);
    if (ts.speed && p.speed && ts.speed !== p.speed) f.push(`${ts.speed}≠${p.speed}`);
    if (ts.cl && p.cl && ts.cl !== p.cl) f.push(`CL${ts.cl}≠CL${p.cl}`);
    if (ts.sticks && p.sticks && ts.perGB && (ts.sticks !== p.sticks || ts.sticks * ts.perGB !== p.totalGB)) f.push(`${ts.sticks}x${ts.perGB}≠${p.sticks}x${p.totalGB / p.sticks}`);
    return f;
  }

  const PROFILES = {
    ram_ddr4_2x16: {
      kit: /2\s*[x×*]\s*16|16\s*(gb)?\s*[x×*]\s*2|16gbx2|kit\s*32|2 thanh 16/i,
      // search results carry no tier_variations (2026-09-15): "8/16/32GB" listings may still hold a 2×16 model → soft `kit?`, check on PDP
      maybeKit: /\b32\s?gb?\b/i,
      bad: /laptop|so-?dimm|lướt|cũ|used|tháo|ddr5|ddr3|2nd|like new|9\d%|bóc máy|ecc|server|open box|tray|nhiều hãng|các hãng|ngẫu nhiên|các loại|đã qua sử dụng|\(\s*1\s*x\s*16/i,
      warn: /new\s?box/i, // "Newbox" = repackaged / not sealed: warn, don't reject
      minShopMonths: 6, maxShopItems: 500, maxModels: 20, spread: 3, baitRatio: 0.6,
    },
  };
  const USED_DESC = /(?<!không\s(?:phải\s)?)(hàng lướt|hàng cũ|đã qua sử dụng|tháo máy|bóc máy|\b2nd\b|new tray|open box|like new)/i;
  const ABROAD = /trung quốc|nước ngoài|quốc tế|china|overseas/i;

  function parseSearchItem(it) {
    const d = it.item_data || {}, a = it.item_card_displayed_asset || {}, p = d.item_card_display_price || {}, s = d.shop_data || {};
    const loc = a.shop_location || d.shop_location || '';
    return {
      k: (it.shopid || d.shopid) + '/' + (it.itemid || d.itemid), name: a.name || d.name || '',
      price: V(p.price), was: V(p.strikethrough_price || p.original_price), disc: p.discount || null,
      sold: d.item_card_display_sold_count?.historical_sold_count ?? null,
      rating: d.item_rating?.rating_star != null ? +(+d.item_rating.rating_star).toFixed(2) : null,
      shop: s.shop_name || null, loc, overseas: ABROAD.test(loc),
      // 2026-09-15: shop_data has only shop_name/shop_icon; badges live in seller_flag.name (PREFERRED, PREFERRED_PLUS, OFFICIAL_SHOP…),
      // and ads show adsid:null but icon_in_image.ads_text "Ad"
      official: !!(s.is_official_shop || d.is_official_shop || /OFFICIAL|MALL/i.test(a.seller_flag?.name || '')), preferred: !!(s.shopee_verified || d.shopee_verified || /PREFERRED/i.test(a.seller_flag?.name || '')),
      ad: !!(it.adsid || d.adsid || it.campaignid || a.icon_in_image?.ads_text), soldout: !!d.is_sold_out, catid: d.catid ?? null,
      tiers: (d.tier_variations || []).map((t) => (t.options || []).join('|')).join(' ; ').slice(0, 300), ts: Date.now(),
    };
  }
  const HARD = /^(no-kit-option|bad-word|sold-out|overseas)/;
  /** Real card text from the wallet (2026-09-15): the smallest div holding BOTH "Min. Spend" and "T&C" is the card. */
  const isWalletCardText = (t) => /Min\. Spend|Đơn tối thiểu/i.test(t) && /T&C|Điều kiện/i.test(t);
  function searchFlags(o, P, med) {
    const text = o.name + ' ' + o.tiers, f = [], bad = text.match(P.bad);
    if (!P.kit.test(text)) f.push(!o.tiers && P.maybeKit && P.maybeKit.test(o.name) ? 'kit?' : 'no-kit-option');
    if (bad) f.push('bad-word:' + bad[0]);
    if (o.soldout) f.push('sold-out');
    if (o.overseas) f.push('overseas');
    if (o.ad) f.push('ad');
    if (med && o.price && o.price < med * P.baitRatio) f.push('bait-price?');
    return f;
  }

  function summarizePdp(k, j, dom, P, now = Date.now()) {
    const d = j?.data || {}, it = d.item || {}, s = d.shop_detailed || {}, pp = d.product_price?.price || {};
    const title = it.title || it.name || '', spec = clip(dom?.spec, 700), desc = clip(dom?.desc, 1500);
    // 2026-09-15 get_pc models: model_id (not modelid); stock/normal_stock are null — only has_stock is set
    const models = (it.models || []).map((m) => ({ id: m.modelid ?? m.model_id, name: clip(m.name, 40), price: V(m.price), was: V(m.price_before_discount), stock: m.stock ?? m.normal_stock ?? (m.has_stock === false ? 0 : null), promo: m.promotion_id ? [...new Set((m.price_stocks || []).map((x) => x.promotion_type).filter((x) => x != null))].join('+') || '?' : null }));
    const specStock = +((String(dom?.spec || '').match(/(?:Stock|Kho hàng)\s*\n?\s*(\d+)/i) || [])[1]);
    if (models.length === 1 && models[0].stock == null && Number.isFinite(specStock)) models[0].stock = specStock;
    if (models.length === 1 && models[0].stock == null && Number.isFinite(+it.stock_display)) models[0].stock = +it.stock_display; // live: "49"
    const kit = models.filter((m) => P.kit.test(m.name) || (models.length === 1 && P.kit.test(title)));
    const prices = models.map((m) => m.price).filter(Boolean);
    const tParts = decodeParts(title);
    const parts = [...new Map([title, spec, desc].flatMap(decodeParts).map((p) => [p.part, p])).values()]; // title's part first
    const ts = titleSpecs(title);
    const ageMo = s.ctime ? (now / 1000 - s.ctime) / 2.63e6 : null;
    const shown = V(pp.single_value || pp.range_min);
    const f = [], rej = [];
    if (j?.error) rej.push('api-error ' + j.error);
    if (it.condition === 4) rej.push('USED(condition=4)');
    else if (/Condition\s*\n?\s*Used|Tình trạng\s*\n?\s*Đã sử dụng/i.test(dom?.spec || '')) rej.push('USED(spec)');
    if (!kit.length) rej.push('no-kit-model');
    else if (kit.every((m) => m.stock === 0)) rej.push('kit-sold-out');
    const tb = title.match(P.bad); if (tb) rej.push('bad-word:' + tb[0]);
    const ud = (spec + ' ' + desc).match(USED_DESC); if (ud) rej.push('used-words:' + ud[0]);
    const wv = P.warn && (title + ' ' + spec + ' ' + desc).match(P.warn); if (wv) f.push('warn-word:' + wv[0]);
    // part number from the title is a hard contract; one found only in a multi-variant listing's description is often for another variant
    if (parts.length) for (const x of mismatch(ts, parts[0])) (tParts.length || models.length <= 1 ? rej : f).push(`title≠part(${parts[0].part}) ${x}`);
    // copied description: title names one exact part, description another from the same maker (real: GTZN title, GTZR description)
    if (tParts.length && models.length <= 1) { const o = parts.find((p) => p.brand === tParts[0].brand && p.part !== tParts[0].part && !tParts.some((t) => t.part === p.part)); if (o) f.push(`desc-part≠title-part ${o.part}`); }
    const shopRatings = (s.rating_good || 0) + (s.rating_normal || 0) + (s.rating_bad || 0);
    if (s.rating_good != null && shopRatings < 10) f.push(`few-shop-ratings ${shopRatings}`);
    if (s.last_active_time === 0 || (s.last_active_time && now / 1000 - s.last_active_time > 30 * 86400)) f.push('shop-inactive');
    if (ageMo != null && ageMo < P.minShopMonths) f.push(`new-shop ${ageMo.toFixed(1)}mo`);
    if (s.item_count > P.maxShopItems && !s.is_official_shop) f.push(`huge-catalog ${s.item_count}`);
    if (models.length > P.maxModels) f.push(`many-models ${models.length}`);
    // compare price per GB so an 8GB vs 2×16GB variant listing isn't read as a bait spread
    const per = models.map((m) => (m.price && modelGB(m.name) ? m.price / modelGB(m.name) : null));
    const sp = per.every((x) => x) && per.length > 1 ? per : prices;
    if (sp.length > 1 && Math.max(...sp) / Math.min(...sp) > P.spread) f.push(`price-spread x${(Math.max(...sp) / Math.min(...sp)).toFixed(1)}${sp === per ? '/GB' : ''}`);
    if (ABROAD.test(desc)) f.push('ships-from-abroad');
    if (models.length === 1 && shown && models[0].price && shown < models[0].price) f.push('shown-price-includes-shop-voucher');
    if (!parts.length) f.push('no-part-number');
    const sh = shipFromPc(j); if (sh?.expressOnly) f.push(`express-only-shipping ${K(sh.min)}`);
    const bait = f.filter((x) => /new-shop|huge-catalog|many-models|price-spread|abroad/.test(x)).length >= 2;
    return {
      k, ts: now, title: clip(title, 90), cond: it.condition ?? null, shown, modelsN: models.length,
      kit: kit.slice(0, 40), shop: { name: s.name, star: s.rating_star != null ? +(+s.rating_star).toFixed(2) : null, ratings: (s.rating_good || 0) + (s.rating_normal || 0) + (s.rating_bad || 0), joined: s.ctime ? new Date(s.ctime * 1000).toISOString().slice(0, 7) : null, items: s.item_count ?? null, official: !!s.is_official_shop, loc: s.shop_location || null },
      parts: parts.slice(0, 2), spec: clip(spec, 250), desc: clip(desc, 400), shopVouchers: clip(dom?.shopVouchers, 300),
      ship: shipFromPc(j) || (dom?.shipJ && shipFromPc(dom.shipJ)) || parseShipText(dom?.ship), shopV: (() => { const v = [...shopVouchersFromCaptures([{ j: { data: { list: d.shop_vouchers || [] } } }]), ...(dom?.shopV || [])]; return (v.length ? v : parseShopVoucherText(dom?.shopVouchers)).slice(0, 6); })(), // get_pc data.shop_vouchers (empty on both live listings; item fields unverified)
      flags: [...rej, ...f, ...(bait ? ['LIKELY-BAIT'] : [])], verdict: rej.length ? 'reject' : bait ? 'reject' : f.length ? 'warn' : 'ok',
    };
  }

  function parseWalletCard(b, order = [], now = Date.now()) {
    if (!/Min\. Spend|Đơn tối thiểu/i.test(b)) return null;
    // units: web "1m₫ / 300k₫", app "1trđ / 2,2trđ / 500kđ"; never let "\nMin. Spend" read as "m"
    const AMT = '[₫đ]?\\s*([\\d.,]+(?:[ \\t]?(?:triệu|tr|m|k)(?![a-z]))?)[ \\t]*[₫đ]?';
    const pct = b.match(new RegExp('(\\d+)%\\s*(?:off|Coins Cashback|Cashback|Hoàn Xu)?[\\s\\S]{0,40}?(?:Capped at|max|tối đa)\\s*' + AMT, 'i')) || b.match(new RegExp('Giảm\\s*(\\d+)%[\\s\\S]{0,40}?tối đa\\s*' + AMT, 'i'));
    const flat = pct ? null : b.match(new RegExp(AMT + '\\s*off', 'i')) || b.match(new RegExp('Giảm\\s*' + AMT, 'i'));
    const cap = pct ? money(pct[2]) : flat ? money(flat[1]) : 0;
    const ship = /free ?ship|miễn phí vận chuyển|freeship/i.test(b);
    if (!cap && !ship) return null; // app free-ship cards show no amount ("Miễn phí vận chuyển / Đơn tối thiểu 500kđ")
    const p = pct ? +pct[1] : null, min = money((b.match(new RegExp('(?:Min\\. Spend|Đơn tối thiểu)\\s*' + AMT, 'i')) || [])[1]);
    const L = b.split('\n').map((x) => x.trim()).filter(Boolean);
    const type = L.filter((x) => !/^\d+$|Min\. Spend|Đơn tối thiểu|off|Giảm|Expiring|Valid|Use|used|^Limited$|T&C|Điều kiện|hết hạn|HSD/i.test(x)).join(' / ').slice(0, 60);
    const when = (b.match(/(Expiring: [^\n]+|Valid Till: [^\n]+|Use from: [^\n]+|Use in: [^\n]+|HSD: [^\n]+|hết hạn trong: [^\n]+|Có hiệu lực[^\n]+)/i) || [])[1] || null;
    const d = (re) => { const m = b.match(re); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) - 7 * 3.6e6 : null; }; // dd.mm.yyyy, VN day start
    const hrs = b.match(/(?:Expiring: |Còn )(\d+)\s*(hours?|giờ|days?|ngày)/i);
    const till = d(/(?:Valid Till|HSD):?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
    const endsAt = hrs ? now + +hrs[1] * (/day|ngày/i.test(hrs[2]) ? 8.64e7 : 3.6e6) : till != null ? till + 8.64e7 : null; // "Valid Till" day inclusive
    return {
      pct: p, cap, min, type, when, coins: /cashback|hoàn xu/i.test(b),
      freeShip: ship, liveVideoOnly: /Live Only|Video Only|Chỉ có (tại|trên) (Live|Video)|Livestream/i.test(b),
      specificProducts: /Specific Product|sản phẩm nhất định/i.test(b),
      startsAt: d(/(?:Use from|Có hiệu lực từ):?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/i),
      endsAt,
      save: order.map((o) => (o >= min ? Math.round(p ? Math.min((o * p) / 100, cap) : cap) : 0)),
      sig: [p, cap, min, when, type].join('|'),
    };
  }

  /**
   * Voucher ranking — lessons from the 2026-09-15 app picker (Asgard 5.30M):
   * the wallet ranked 25/24/23/22% first, but the app auto-picked 19% cap 1M. The wallet is what you HOLD, the picker is
   * what APPLIES. So: (1) picker-proven vouchers first; (2) wallet cards that would beat the picker's best on the same
   * day were skipped by Shopee's own "best choice" → not for this item; (3) future-dated vouchers are a separate
   * "wait" option, priced as extra saving over today's proven best; (4) live/video-only and shop-tab cards last.
   * proven: { at: ms, best: {pct,cap,min}, applied: [{pct,cap,min}], blocked: [{pct,cap,min,why}] } from a picker read.
   * tc: { [row.i]: parseTc result } for T&C already read.
   */
  function rankVouchers(rows, { now = Date.now(), proven = null, tc = {} } = {}) {
    const same = (r, v) => v && (r.pct ?? null) === (v.pct ?? null) && r.cap === v.cap && (v.min == null || r.min === v.min); // min unread (cut off) = any
    const sameDay = proven && new Date(proven.at + 7 * 3.6e6).toISOString().slice(0, 10) === new Date(now + 7 * 3.6e6).toISOString().slice(0, 10);
    const bestProven = proven && (proven.applied || []).concat(proven.best ? [proven.best] : []);
    const provenRows = rows.filter((r) => bestProven && bestProven.some((v) => same(r, v)));
    const bestNow = Math.max(0, ...provenRows.filter((r) => !r.freeShip && !(r.startsAt > now)).map((r) => r.save[0] || 0));
    const out = { useNow: [], candidates: [], notForItem: [], later: [], liveOnly: [], freeShip: [] };
    for (const r of rows) {
      if (r.endsAt && r.endsAt < now) continue;
      const t = tc[r.i] || {}, tags = [];
      const isProven = provenRows.includes(r), blocked = proven && (proven.blocked || []).find((v) => same(r, v));
      if (t.appOnly) tags.push('APP'); else if (t.webOK) tags.push('WEB');
      if (t.selectedOnly || r.specificProducts) tags.push('SELECTED');
      if (r.endsAt && r.endsAt - now < 24 * 3.6e6) tags.push('EXPIRES<24h');
      const row = { ...r, tags, evidence: isProven ? 'picker' : blocked ? 'blocked: ' + (blocked.why || '') : t.headline ? 'T&C' : 'wallet' };
      if (r.freeShip) out.freeShip.push(row);
      else if (r.liveVideoOnly) out.liveOnly.push(row);
      // Rule 2026-09-17: a "một số sản phẩm" voucher never enters an estimate until a picker proves it for this item
      // (EXAMPLE22 22% / EXAMPLE23 23% were quoted, the app picker applied neither).
      else if (tags.includes('SELECTED') && !isProven) out.notForItem.push({ ...row, evidence: 'selected-items-unproven' });
      else if (r.startsAt > now) out.later.push({ ...row, extraVsNow: Math.max(0, (r.save[0] || 0) - bestNow) });
      else if (blocked || r.tab === 'Shop' && !isProven) out.notForItem.push(row);
      else if (isProven) out.useNow.push(row);
      // Shopee's picker auto-selects the best applicable voucher: anything bigger it didn't pick that day doesn't apply
      else if (sameDay && bestNow && (r.save[0] || 0) > bestNow) out.notForItem.push({ ...row, evidence: 'beaten-by-picker' });
      else out.candidates.push(row);
    }
    const by = (a, b) => (b.save[0] || 0) - (a.save[0] || 0) || (a.endsAt || 9e15) - (b.endsAt || 9e15);
    for (const k of Object.keys(out)) out[k].sort(k === 'later' ? (a, b) => b.extraVsNow - a.extraVsNow || a.startsAt - b.startsAt : by);
    const bestLater = out.later[0];
    out.advice = !proven ? 'UNPROVEN: wallet ranking only — ask for the app picker screenshot (scrolled, greyed rows too) before quoting savings'
      : `best now ${Math.round(bestNow / 1e3)}k (picker)` + (bestLater ? `; waiting to ${new Date(bestLater.startsAt + 7 * 3.6e6).toISOString().slice(0, 10)} adds ≤${Math.round(bestLater.extraVsNow / 1e3)}k, eligibility unproven` : '');
    return out;
  }

  /** Month names seen in a T&C "Valid Period" ("16 Sept 2026 00:00 - 24 Sept 2026 23:59"). */
  const TCMON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  /**
   * Last date in a T&C "valid" string (details as fallback) → ms epoch, VN end-of-minute.
   * Lets the cache expire with the voucher instead of on a flat TTL: a voucher's T&C never changes
   * once issued, so the only reason to re-read it is that it died. null when unreadable (→ 30-day TTL).
   */
  function tcEnd(valid, details = '') {
    const txt = String(valid || '') + ' || ' + String(details || '');
    const at = (y, mo, d, h, mi) => Date.UTC(y, mo, d, h, mi) - 7 * 3.6e6;
    const hits = [];
    for (const m of txt.matchAll(/(\d{1,2})\s+([A-Za-z]{3,4})\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/g)) {
      const mo = TCMON[m[2].toLowerCase()];
      if (mo != null) hits.push(at(+m[3], mo, +m[1], m[4] == null ? 23 : +m[4], m[5] == null ? 59 : +m[5]));
    }
    for (const m of txt.matchAll(/(?:(\d{1,2}):(\d{2})\s+)?(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/g)) {
      const h = m[6] != null ? +m[6] : m[1] != null ? +m[1] : 23, mi = m[7] != null ? +m[7] : m[2] != null ? +m[2] : 59;
      hits.push(at(+m[5], +m[4] - 1, +m[3], h, mi));
    }
    return hits.length ? Math.max(...hits) : null;
  }
  /**
   * The voucher code is base64 in the T&C link's evcode param — "RVhBTVBMRTIy" → "EXAMPLE22",
   * "TElWRS0xMDAwMDAwMDAwMDAwMDAz" → "LIVE-1000000000000003" (2026-09-16). So every wallet card's code
   * is known from SH.wallet alone, with no hop: SH.tc() is only needed for device/validity/product limits.
   */
  function codeFromUrl(u) {
    const m = String(u || '').match(/[?&]evcode=([^&#]+)/);
    if (!m) return null;
    try {
      const s = atob(decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/'));
      return /^[A-Za-z0-9][\w.-]{2,39}$/.test(s) ? s : null;
    } catch (e) { return null; }
  }
  /** Voucher code from the T&C body ("Mã EXAMPLE22 giảm 22%"). Only when labelled — never guessed from prose. */
  function tcCode(t) {
    const m = String(t || '').match(/(?:Mã(?:\s+(?:giảm\s+giá|voucher))?|Voucher Code|Code)[:\s]+([A-Z][A-Z0-9]{4,23})\b/);
    return m ? m[1] : null;
  }
  /** Drop cached T&C once the voucher itself expired (+1 day grace); 30 days when the end date was unreadable. */
  function tcEvict(store, now = Date.now()) {
    let n = 0;
    for (const [k, v] of Object.entries(store)) {
      const dead = v.endsAt ? now > v.endsAt + 8.64e7 : now - (v.ts || 0) > 30 * 8.64e7;
      if (dead) { delete store[k]; n++; }
    }
    return n;
  }
  function parseTc(t) {
    const g = (re) => ((t.match(re) || [])[1] || '').replace(/\n•\n/g, ', ').trim();
    const device = g(/(?:Device|Thiết bị)\n([^\n]+)/);
    const devs = device.split(/,|•/).map((x) => x.trim()).filter(Boolean);
    const webOK = devs.length ? devs.some((x) => /^(web|pc|pc web|website|desktop)$/i.test(x)) : null;
    const products = g(/(?:Applicable Product|Sản phẩm)\n([\s\S]*?)\n(?:Payment|Thanh toán)/).slice(0, 300);
    const valid = g(/(?:Valid Period|Thời gian sử dụng|Hạn sử dụng)\n([^\n]+)/);
    const details = g(/(?:More Details|Xem chi tiết)\n([\s\S]{0,600})/).replace(/\n/g, ' ');
    return {
      headline: g(/\n([^\n]*(?:off|Giảm|Cashback)[^\n]*\n(?:Min\. Spend|Đơn tối thiểu)[^\n]*)/i).replace(/\n/g, ' '),
      valid, device, webOK, appOnly: webOK == null ? null : !webOK,
      code: tcCode(details) || tcCode(t), endsAt: tcEnd(valid, details),
      selectedOnly: /một số người bán|sản phẩm nhất định|selected (sellers|products)|specific products/i.test(products),
      payment: g(/(?:Payment|Thanh toán)\n([\s\S]*?)\n(?:Logistic|Đơn vị vận chuyển)/).slice(0, 150),
      details,
      products,
    };
  }

  /** Price history per listing model. Flags a "was" price that the item never actually sold at. */
  function recordPrice(store, k, m, now = Date.now()) {
    if (!m.price) return;
    const key = k + '#' + m.id, day = new Date(now).toISOString().slice(0, 10);
    const e = (store[key] = store[key] || { h: [], seen: day });
    const last = e.h[e.h.length - 1];
    if (!last || last[1] !== m.price || last[2] !== m.was) e.h.push([day, m.price, m.was]);
    e.seen = day;
    if (e.h.length > 40) e.h.splice(0, e.h.length - 40);
  }
  function wasCheck(store, k, m, now = Date.now()) {
    const e = store[k + '#' + m.id];
    if (!e || !m.was) return null;
    const cutoff = new Date(now - 60 * 8.64e7).toISOString().slice(0, 10);
    const hist = e.h.filter((x) => x[0] >= cutoff), days = new Set(hist.map((x) => x[0])).size;
    if (days < 2) return null; // one day of data proves nothing
    const maxPaid = Math.max(...hist.map((x) => x[1]));
    return m.was > maxPaid * 1.15 ? `was ${M(m.was)} but never above ${M(maxPaid)} in ${days} days` : null;
  }

  /* ---------- checkout price = item − shop voucher − Shopee voucher + shipping − ship voucher ----------
   * Lesson 2026-09-15 (a 24-can soft-drink carton, app checkouts): ranking by item price put a 235k listing first,
   * but its shipping was 208.6k → 347k at checkout, while the 259k Mall listing shipped for 91.1k → 240.5k.
   * Heavy/bulky goods: shipping can be most of the price and differs between shops in the same city. */
  const SHIP_RE = /(?:Shipping Fee|Shipping To|Phí vận chuyển|Phí ship|Vận chuyển tới|Vận Chuyển Tới)/i;
  /** PDP shipping block text → {min, max, free} (VND) or null. "Miễn phí vận chuyển" only counts when no fee is shown. */
  function parseShipText(t) {
    t = String(t || '');
    const i = t.search(SHIP_RE); if (i < 0) return null;
    const win = t.slice(i, i + 220), amt = [...win.matchAll(/₫\s?([\d.]+)|([\d.]+)\s?₫/g)].map((m) => money(m[1] || m[2])).filter((v) => v >= 0);
    if (amt.length) return { min: Math.min(...amt.slice(0, 2)), max: Math.max(...amt.slice(0, 2)), free: false, src: 'dom' };
    return /miễn phí|free shipping/i.test(win) ? { min: 0, max: 0, free: true, src: 'dom' } : null;
  }
  /**
   * get_pc product_shipping (seen live 2026-09-15, logged in, fees are for the account's delivery address):
   * each channel in ungrouped_channel_infos / grouped_channel_infos_by_service_type[].channel_infos has
   * price_before_discount = the fee checkout charges (Mall "Nhanh" 91,100 and shop D "Hỏa Tốc" 208,600 matched the
   * app checkouts exactly) and price = after Shopee's shipping promo (0 / 5,000 — NOT what checkout applied).
   * shipping_fee_info.price is a promo range (0–25,000 for the 91,100 listing) → never used.
   * Checkout picks the cheapest channel, so fee = min price_before_discount. Express-only shops are the trap.
   */
  function shipFromPc(j) {
    const ps = j?.data?.product_shipping; if (!ps) return null;
    const P = (p) => (p && p.single_value >= 0 ? Math.round(p.single_value / 1e5) : null);
    const chans = [...(ps.ungrouped_channel_infos || []), ...(ps.grouped_channel_infos_by_service_type || []).flatMap((g) => g.channel_infos || [])]
      .map((c) => ({ name: c.name || String(c.channel_id), fee: c.warning ? null : P(c.price_before_discount) })).filter((c) => c.fee != null); // warning = unserviceable for this address (live: shop E "Trong Ngày" price 0, before null)
    if (!chans.length) return null;
    const best = chans.reduce((a, b) => (b.fee < a.fee ? b : a));
    return { min: best.fee, max: best.fee, free: best.fee === 0, channel: best.name, channels: [...new Map(chans.map((c) => [c.name, c.name + ' ' + K(c.fee)])).values()].slice(0, 5), expressOnly: chans.every((c) => /hỏa tốc|express|instant|trong ngày/i.test(c.name)), src: 'pc:channels' };
  }
  /** Shop voucher from the page's voucher API (fields unverified live) → {pct, cap, value, min, coins, end}. */
  function parseShopVoucherJson(v) {
    if (!v || typeof v !== 'object' || !('min_spend' in v || 'discount_value' in v || 'discount_percentage' in v)) return null;
    // NOTE: never read `percentage_used` here — it is the % of the voucher's STOCK already claimed, not a discount rate.
    // 2026-09-16: Pharmacity PHARMSP35 (flat 35k) carried percentage_used:48 and was estimated as 48% = -261.5k.
    const pct = +v.discount_percentage || null, value = V(+v.discount_value) || 0, cap = V(+(v.discount_cap ?? v.max_value)) || null;
    const coins = v.reward_type === 1 || /coin|xu/i.test(v.reward_type_name || '');
    if (!pct && !value) return null;
    return { pct, cap, value, min: V(+v.min_spend) || 0, coins, end: v.end_time ? v.end_time * 1000 : null, code: v.voucher_code || null, src: 'api' };
  }
  function shopVouchersFromCaptures(caps) {
    const res = [], walk = (o, d) => {
      if (!o || typeof o !== 'object' || d > 5) return;
      if (Array.isArray(o)) { for (const x of o) { const p = parseShopVoucherJson(x); if (p) res.push(p); else walk(x, d + 1); } return; }
      for (const x of Object.values(o)) walk(x, d + 1);
    };
    for (const c of caps) walk(c.j?.data, 0);
    return [...new Map(res.map((r) => [[r.pct, r.cap, r.value, r.min, r.coins].join('|'), r])).values()];
  }
  /** Shop-voucher chip text "Giảm ₫10k · Đơn tối thiểu ₫200k" / "10% OFF" → same shape (min 0 when not shown: flagged minUnknown). */
  function parseShopVoucherText(t) {
    const res = [];
    for (const chunk of String(t || '').split(/\n(?=Giảm|\d+%|₫\s?[\d.]+k?\s*(?:OFF|Giảm))/i)) {
      const minM = chunk.match(/(?:Min\. Spend|Đơn tối thiểu|Đơn Tối Thiểu)\s*₫?\s*([\d.,]+\s?[kKmM]?)/);
      const pct = chunk.match(/(\d{1,2})%\s*(?:OFF|Giảm)?/i) || chunk.match(/Giảm\s*(\d{1,2})%/i);
      const cap = chunk.match(/(?:tối đa|Capped at|max)\s*₫?\s*([\d.,]+\s?[kKmM]?)/i);
      const flat = !pct && (chunk.match(/Giảm\s*₫\s?([\d.,]+\s?[kKmM]?)/i) || chunk.match(/₫\s?([\d.,]+\s?[kKmM]?)\s*OFF/i));
      if (!pct && !flat) continue;
      res.push({ pct: pct ? +pct[1] : null, cap: cap ? money(cap[1]) : null, value: flat ? money(flat[1]) : 0, min: minM ? money(minM[1]) : 0, minUnknown: !minM, coins: /coin|xu/i.test(chunk), src: 'dom' });
    }
    return res;
  }
  /** Saving of one discount voucher on an amount (coins cashback is not a price cut). */
  function voucherSave(v, amount) {
    if (!v || v.coins || !amount || (v.min && amount < v.min)) return 0;
    const cand = []; // a voucher may carry both; take the SMALLER saving rather than trusting an uncapped pct
    if (v.pct) cand.push(Math.min((amount * v.pct) / 100, v.cap || Infinity));
    if (v.value) cand.push(Math.min(v.value, amount));
    return cand.length ? Math.round(Math.min(...cand, amount)) : 0;
  }
  /**
   * Estimated checkout total for qty 1. Shopee applies the shop voucher first; the Shopee voucher's min spend and %
   * work on the amount after it; a free-ship voucher covers shipping up to its cap. Unknown shipping → total null
   * (never rank a listing without shipping above one with it).
   * shopee: [{pct,cap,min} | {value,min}] the account's platform vouchers; shipVouchers: [{cap,min}].
   */
  /** was = model price_before_discount: checkout shows it as "Tổng tiền hàng" and was − price as "Ưu đãi sản phẩm" (live: 300,000 − 41,000 = 259,000). */
  function checkoutEstimate({ price, was = null, ship = null, shopVouchers = [], shopee = [], shipVouchers = [], proven = null }) {
    if (!price) return null;
    const items = was > price ? was : price;
    const best = (vs, amt, f = voucherSave) => vs.reduce((b, v) => { const s = f(v, amt); return s > b.save ? { v, save: s } : b; }, { v: null, save: 0 });
    // Layer 1 shop voucher (from the listing's own voucher API), then layer 2 platform voucher on the amount after it.
    const sv = best(shopVouchers, price), after = price - sv.save;
    // A checkout-picker read for THIS listing beats any wallet guess, for both the platform and the free-ship voucher.
    const pv = proven && proven.best ? { v: proven.best, save: voucherSave(proven.best, after) } : best(shopee, after);
    const fee = ship ? ship.max : null;
    const shipSrc = proven && proven.shipVoucher ? [proven.shipVoucher] : shipVouchers;
    const shv = fee == null ? { save: 0 } : best(shipSrc, after, (v, amt) => (v.min && amt < v.min ? 0 : Math.min(fee, v.cap ?? fee)));
    const src = {
      shop: sv.v ? 'listing' : shopVouchers.length ? 'none-applicable' : 'unread',
      shopee: proven && proven.best ? 'picker' : shopee.length ? 'wallet-estimate' : 'unread',
      ship: fee == null ? 'unread' : 'get_pc',
      shipVoucher: proven && proven.shipVoucher ? 'picker' : shipVouchers.length ? 'wallet-estimate' : 'unread',
    };
    const missing = [
      ...(fee == null ? ['shipping'] : []), ...(src.shopee === 'unread' ? ['shopee-vouchers'] : []),
      ...(src.shipVoucher === 'unread' ? ['ship-vouchers'] : []), // NOTE: no 'shop-vouchers' entry — shop vouchers are read at PDP time, so an empty list means the listing HAS none, not that it went unread. Flagging it would mark every clean row incomplete.
      ...(sv.v?.minUnknown ? ['shop-voucher-min'] : []), ...(ship && ship.min !== ship.max ? ['ship-channel-range'] : []),
    ];
    return {
      price, items, productDisc: items - price, shopV: sv.save, shopVCode: (sv.v && sv.v.code) || null, shopeeV: pv.save,
      ship: fee, shipRange: ship && ship.min !== ship.max ? [ship.min, ship.max] : null, shipV: shv.save,
      total: fee == null ? null : after - pv.save + fee - shv.save, missing, src,
      proof: proven ? 'picker' : missing.length ? 'partial' : 'estimate',
    };
  }
  const fmtCheckout = (e) => (!e ? '?' : `${e.total == null ? '?ship' : K(e.total)} = ${K(e.items ?? e.price)}${e.productDisc ? ' −SP ' + K(e.productDisc) : ''}${e.shopV ? ' −shop ' + K(e.shopV) : ''}${e.shopeeV ? ' −Shopee ' + K(e.shopeeV) : ''} +ship ${e.ship == null ? '?' : K(e.ship) + (e.shipRange ? '(' + e.shipRange.map(K).join('–') + ')' : '')}${e.shipV ? ' −shipV ' + K(e.shipV) : ''}${e.missing && e.missing.length ? ' [NOT COUNTED: ' + e.missing.join('+') + ']' : ''}`);

  const SH = { v: VER, PROFILES, _t: { money, decodeParts, titleSpecs, modelGB, mismatch, parseSearchItem, searchFlags, summarizePdp, isWalletCardText, parseWalletCard, rankVouchers, parseTc, tcEnd, tcCode, codeFromUrl, tcEvict, recordPrice, wasCheck, median, out, parseShipText, shipFromPc, parseShopVoucherJson, shopVouchersFromCaptures, parseShopVoucherText, voucherSave, checkoutEstimate, fmtCheckout } };
  W.SH = SH;
  if (typeof document === 'undefined') return 'SH ' + VER + ' (pure helpers only)';

  /* ---------- persistent state (this origin's localStorage; no secrets stored) ---------- */
  const DBK = '__sh_db';
  let db = {};
  try { db = JSON.parse(localStorage.getItem(DBK)) || {}; } catch (e) { db = {}; }
  for (const x of ['items', 'pdp', 'prices', 'searched', 'tc', 'cfg', 'checkouts', 'pickers']) db[x] = db[x] || {};
  db.hops = db.hops || [];
  const cfg = Object.assign({ perHour: 45, perDay: 200, dwell: [5000, 7000], cooldownMin: 30, searchTTLh: 12, pdpTTLh: 24, urlParams: '', shopee: [], shipVouchers: [], vouchersNone: false }, db.cfg);
  function save() {
    const now = Date.now(), old = (o, ms, f = (v) => v.ts) => { for (const [k, v] of Object.entries(o)) if (now - f(v) > ms) delete o[k]; };
    old(db.items, 7 * 8.64e7); old(db.pdp, 3 * 8.64e7); old(db.searched, 8.64e7, (v) => v); tcEvict(db.tc, now); old(db.checkouts, 7 * 8.64e7, (v) => Date.parse(v.at)); old(db.pickers, 7 * 8.64e7, (v) => Date.parse(v.at));
    old(db.prices, 120 * 8.64e7, (v) => Date.parse(v.seen));
    db.hops = db.hops.filter((t) => now - t < 8.64e7);
    try { localStorage.setItem(DBK, JSON.stringify(db)); } catch (e) { db.items = {}; try { localStorage.setItem(DBK, JSON.stringify(db)); } catch (e2) {} }
  }
  let profile = PROFILES.ram_ddr4_2x16;

  /* ---------- capture of the page's own API responses ---------- */
  W.__cap = W.__cap || []; W.__capSeq = W.__capSeq || 0; W.__capKeep = W.__capKeep || {};
  W.__capPush = (u, j) => { W.__cap.push({ id: ++W.__capSeq, u: String(u), t: Date.now(), j }); if (W.__cap.length > 60) W.__cap.splice(0, W.__cap.length - 60); };
  W.__capRE = /search\/search_items|pdp\/get_pc|item\/get_ratings|voucher|cart\/get|checkout\/get|shipping|logistic/;
  if (!W.__shHooked) {
    W.__shHooked = 1;
    const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = String(u); return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      if (W.__capRE.test(this.__u || '')) this.addEventListener('load', () => {
        try { const j = this.responseType === 'json' ? this.response : !this.responseType || this.responseType === 'text' ? JSON.parse(this.responseText) : null; if (j) W.__capPush(this.__u, j); } catch (e) {}
      });
      return os.apply(this, arguments);
    };
    const of = W.fetch;
    W.fetch = function (i) {
      const p = of.apply(this, arguments);
      try { const u = typeof i === 'string' ? i : (i && i.url) || String(i); if (W.__capRE.test(u)) p.then((r) => r.clone().json()).then((j) => W.__capPush(u, j)).catch(() => {}); } catch (e) {}
      return p;
    };
  }
  const since = (id) => W.__cap.filter((c) => c.id > id);

  /* ---------- pacing, budget, block detection ---------- */
  function hopCheck() {
    const now = Date.now();
    if (db.blockedUntil > now) throw new Error('BLOCKED — cooldown until ' + new Date(db.blockedUntil).toLocaleTimeString() + '. Stop and tell the user.');
    const h = db.hops.filter((t) => now - t < 3.6e6).length, d = db.hops.length;
    if (h >= cfg.perHour || d >= cfg.perDay) throw new Error(`HOP BUDGET reached (${h}/h of ${cfg.perHour}, ${d}/day of ${cfg.perDay}). Pause; don't raise it without the user.`);
    db.hops.push(now);
  }
  function checkBlock(id) {
    const refused = since(id).some((c) => c.j && (c.j.error === 90309999 || c.j.error_code === 90309999));
    const captcha = /\/verify\/|captcha/i.test(location.pathname) || /captcha|verify you are human|xác minh/i.test(document.title);
    if (refused || captcha) {
      db.blockedUntil = Date.now() + cfg.cooldownMin * 6e4; save();
      throw new Error((captcha ? 'CAPTCHA/verify page' : 'error 90309999') + ` — paused ${cfg.cooldownMin} min. Do not retry; tell the user.`);
    }
  }
  const pushRoute = (p) => { history.pushState({}, '', p); W.dispatchEvent(new PopStateEvent('popstate', { state: {} })); };
  /** In-app route change (no reload). want: capture URL regex; match: extra test; ready: DOM predicate. */
  async function go(path, { want, match, ready, timeout = 9000 } = {}) {
    hopCheck();
    const t0 = Date.now(), id0 = W.__capSeq;
    const found = () => (want ? since(id0).find((c) => want.test(c.u) && (!match || match(c))) : ready ? ready() || null : true);
    const waitFor = async (t) => { let h; while (!(h = found()) && Date.now() - t < timeout) await sleep(300); return h; };
    pushRoute(path);
    let hit = await waitFor(t0);
    if (!hit && (want || ready)) { // some hops don't refire: bounce via home once
      checkBlock(id0); pushRoute('/'); await sleep(rnd(1200, 1800)); pushRoute(path); hit = await waitFor(Date.now());
    }
    checkBlock(id0);
    const rest = rnd(cfg.dwell[0], cfg.dwell[1]) - (Date.now() - t0);
    if (rest > 0) await sleep(rest);
    save();
    return { id0, hit: hit === true ? null : hit };
  }

  /* ---------- background jobs (javascript_tool dies at 45 s) ---------- */
  const jobs = {};
  function job(name, fn) {
    if (jobs[name]?.status === 'running') return `job ${name} is already running — await SH.wait('${name}')`;
    const J = (jobs[name] = { status: 'running', log: [], t0: Date.now(), result: null, error: null, stop: false });
    const log = (s) => { J.log.push(s); if (J.log.length > 40) J.log.shift(); };
    Promise.resolve().then(() => fn(log, J)).then((r) => { J.result = r; J.status = 'done'; }, (e) => { J.error = String(e && e.message || e); J.status = 'failed'; }).finally(save);
    return `started ${name} — next call: await SH.wait('${name}')`;
  }
  async function wait(name, ms = 40000) {
    const J = jobs[name]; if (!J) return 'no job ' + name;
    const t = Date.now(); while (J.status === 'running' && Date.now() - t < ms) await sleep(400);
    return out({ job: name, status: J.status, secs: Math.round((Date.now() - J.t0) / 1000), log: J.log.slice(-5), error: J.error || undefined, result: J.status === 'done' ? J.result : undefined });
  }

  /* ---------- search sweep ---------- */
  const SORTS = { relevancy: 'sortBy=relevancy', sales: 'sortBy=sales', latest: 'sortBy=ctime', price_asc: 'sortBy=price&order=asc', price_desc: 'sortBy=price&order=desc' };
  /** SH.queries({terms:['ram ddr4 32gb 2x16gb'], parts:['KF432C16BBK2/32'], sorts:['relevancy','sales'], pages:2}) */
  function queries({ terms = [], parts = [], sorts = ['relevancy'], pages = 1, extra = '' } = {}) {
    const q = [];
    for (const t of terms) for (const s of sorts) for (let p = 0; p < pages; p++) q.push([t, s, p, extra]);
    for (const t of parts) q.push([t, 'relevancy', 0, extra]); // part numbers: one page is enough
    return q;
  }
  function sweep(list, { force = false, name = 'sweep' } = {}) {
    return job(name, async (log, J) => {
      let added = 0, hops = 0;
      for (const q of list) {
        if (J.stop) break;
        const [kw, sort = 'relevancy', page = 0, extra = ''] = Array.isArray(q) ? q : [q];
        const path = `/search?keyword=${encodeURIComponent(kw)}&${SORTS[sort] || SORTS.relevancy}&page=${page}` + (cfg.urlParams ? '&' + cfg.urlParams : '') + (extra ? '&' + extra : '');
        if (!force && Date.now() - (db.searched[path] || 0) < cfg.searchTTLh * 3.6e6) { log(`cached ${kw}/${page}`); continue; }
        const kwOK = (c) => decodeURIComponent(c.u.replace(/\+/g, ' ')).toLowerCase().includes('keyword=' + kw.toLowerCase());
        const r = await go(path, { want: /search\/search_items/, match: kwOK }); hops++;
        window.scrollTo(0, document.body.scrollHeight); await sleep(1200);
        let n = 0;
        for (const c of since(r.id0).filter((c) => /search_items/.test(c.u) && kwOK(c))) {
          for (const it of c.j.items || []) { const o = parseSearchItem(it); if (!o.name) continue; if (!db.items[o.k]) { n++; added++; } db.items[o.k] = o; }
          W.__capKeep.search = { u: c.u, j: { items: (c.j.items || []).slice(0, 3) } }; // small sample so SH.keys still works
          c.j = null; // free memory: summaries are kept, raw payload dropped
        }
        if (r.hit) db.searched[path] = Date.now();
        log(`${r.hit ? 'S' : 'MISS'} ${kw.slice(0, 28)} ${sort}/${page}: +${n} (${Object.keys(db.items).length} stored)`);
      }
      return { hops, added, stored: Object.keys(db.items).length, next: 'SH.report()' };
    });
  }

  /* ---------- product pages ---------- */
  function pdp(keys, { force = false, name = 'pdp' } = {}) {
    return job(name, async (log, J) => {
      for (const k of keys) {
        if (J.stop) break;
        if (!force && db.pdp[k] && Date.now() - db.pdp[k].ts < cfg.pdpTTLh * 3.6e6) { log('cached ' + k); continue; }
        const iid = k.split('/')[1];
        const r = await go('/product/' + k, { want: /pdp\/get_pc/, match: (c) => c.u.includes(iid) });
        if (!r.hit) { log('MISS ' + k); continue; }
        window.scrollBy(0, 700); await sleep(1500); // shipping block + shop-voucher call arrive after get_pc
        const txt = document.body.innerText;
        const shopid = k.split('/')[0], vcaps = since(r.id0).filter((c) => /voucher/i.test(c.u) && c.u.includes(shopid) && c.j);
        const shipCap = since(r.id0).find((c) => /shipping|logistic/i.test(c.u) && c.j);
        if (vcaps[0]) W.__capKeep.voucher = { u: vcaps[0].u, j: vcaps[0].j };
        if (shipCap) W.__capKeep.ship = { u: shipCap.u, j: shipCap.j };
        const dom = {
          ship: (txt.match(new RegExp(SHIP_RE.source + '[\\s\\S]{0,220}', 'i')) || [])[0] || '',
          shopV: shopVouchersFromCaptures(vcaps), shipJ: shipCap?.j || null,
          spec: (txt.match(/(?:Product Specifications|CHI TIẾT SẢN PHẨM)\n([\s\S]*?)(?:Product Description|MÔ TẢ SẢN PHẨM)/i) || [])[1] || '',
          desc: ((txt.match(/(?:Product Description|MÔ TẢ SẢN PHẨM)\n([\s\S]{0,1500})/i) || [])[1] || '').split(/\n(?:Product Ratings|ĐÁNH GIÁ SẢN PHẨM)\n/i)[0], // reviews followed and leaked in
          shopVouchers: (txt.match(/(?:Shop Vouchers|Mã Giảm Giá Của Shop)\n([\s\S]{0,300}?)\n(?:CUSTOMER SERVICE|CHĂM SÓC KHÁCH HÀNG)/i) || [])[1] || '',
        };
        const S = summarizePdp(k, r.hit.j, dom, profile); W.__capKeep.pdp = { u: r.hit.u, j: r.hit.j }; r.hit.j = null;
        for (const m of S.kit) { recordPrice(db.prices, k, m); const w = wasCheck(db.prices, k, m); if (w) S.flags.push('fake-was: ' + w); }
        db.pdp[k] = S;
        log(`${S.verdict.toUpperCase()} ${k} ship ${S.ship ? K(S.ship.max) : '?'} shopV ${S.shopV.length} ${S.flags.slice(0, 2).join(', ')}`);
      }
      return { next: 'SH.report()' };
    });
  }

  /* ---------- report: compact, token-cheap ---------- */
  // keys: only these PDP rows (rows from other categories overflow the 7k output)
  function report({ top = 15, fresh = cfg.searchTTLh, keys = null } = {}) {
    const items = Object.values(db.items).filter((o) => Date.now() - o.ts < fresh * 3.6e6);
    let scored = items.map((o) => ({ o, f: searchFlags(o, profile) }));
    const med = median(scored.filter((x) => !x.f.some((y) => HARD.test(y) || y === 'kit?')).map((x) => x.o.price));
    scored = items.map((o) => ({ o, f: searchFlags(o, profile, med) }));
    const soft = (x) => x.f.includes('bait-price?') + x.f.includes('kit?'); // explicit kits first; "kit?" card prices are the cheapest variant
    const pass = scored.filter((x) => !x.f.some((y) => HARD.test(y))).sort((a, b) => (soft(a) - soft(b)) || a.o.price - b.o.price);
    const rejected = {};
    for (const x of scored) { const h = x.f.find((y) => HARD.test(y)); if (h) { const r = h.split(':')[0]; rejected[r] = (rejected[r] || 0) + 1; } }
    const P = Object.values(db.pdp).filter((s) => Date.now() - s.ts < cfg.pdpTTLh * 3.6e6 && (!keys || keys.includes(s.k)));
    const byPart = {};
    for (const s of P) if (s.verdict !== 'reject' && s.parts[0] && s.kit[0]) (byPart[s.parts[0].part] = byPart[s.parts[0].part] || []).push(Math.min(...s.kit.map((m) => m.price)));
    const pdpRows = P.map((s) => {
      const kp = s.kit.length ? Math.min(...s.kit.map((m) => m.price)) : null, km = s.kit.find((m) => m.price === kp) || {};
      const mkt = s.parts[0] && median(byPart[s.parts[0].part] || []);
      const flags = [...s.flags];
      if (km.was && mkt && km.was > mkt * 1.3) flags.push(`was ${M(km.was)} vs market ${M(mkt)}`);
      if (s.kit.length > 1) flags.push(`multi-variant: priced at the CHEAPEST of ${s.kit.length} options (${M(kp)}–${M(Math.max(...s.kit.map((m) => m.price)))}) — re-price the variant you actually mean`);
      const pick = db.pickers[s.k];
      const est = checkoutEstimate({ price: kp, was: km.was, ship: s.ship, shopVouchers: s.shopV || [], shopee: cfg.shopee, shipVouchers: cfg.shipVouchers, proven: pick });
      const pr = db.checkouts[s.k], total = pr ? pr.total : est && est.total;
      if (pr && kp && pr.items - (pr.productDisc || 0) !== kp) flags.push(`price-changed-since-checkout ${K(pr.items - (pr.productDisc || 0))}→${K(kp)}`);
      if (km.promo) flags.push(`sale −${K((km.was || kp) - kp)} promo${km.promo} (end time not in get_pc)`);
      if (pick) flags.push(`picker ${String(pick.at).slice(5, 16)} ${pick.source}${pick.blocked.length ? ' (' + pick.blocked.length + ' blocked)' : ''}`);
      // App line first, Web line second (rule 2026-09-17): the Web estimate drops vouchers tagged device:'app'.
      const webOnly = (vs) => vs.filter((v) => v.device !== 'app');
      const estWeb = checkoutEstimate({ price: kp, was: km.was, ship: s.ship, shopVouchers: s.shopV || [], shopee: webOnly(cfg.shopee), shipVouchers: webOnly(cfg.shipVouchers), proven: pick && pick.source === 'web' ? pick : null });
      const payWeb = 'Web: ≈' + fmtCheckout(estWeb);
      const pay = 'App: ' + (pr ? `✅${K(pr.total)} checkout ${String(pr.at).slice(5, 16)} (${K(pr.items - (pr.productDisc || 0))} +ship ${K(pr.ship)} −shipV ${K(pr.shipDisc || 0)} −V ${K((pr.voucher || 0) + (pr.shopV || 0))})` : (est && est.proof === 'picker' ? '✓' : '≈') + fmtCheckout(est)) + ' || ' + payWeb;
      const proof = pr ? 'checkout' : (est && est.proof === 'picker' ? 'picker' : 'estimate');
      return { k: s.k, v: s.verdict, price: kp, total, proof, line: `${pay} | item ${M(kp)}${km.was && km.was !== kp ? ' (was ' + M(km.was) + ')' : ''} st:${km.stock ?? '?'} | ${s.title.slice(0, 60)} | ${s.shop.name} ★${s.shop.star} ${s.shop.ratings}r ${s.shop.joined} ${s.shop.items}it${s.shop.official ? ' MALL' : ''} | ${s.parts.map((p) => `${p.part} ${p.speed} CL${p.cl ?? '?'} ${p.sticks}x${p.totalGB / p.sticks}`).join(' ') || '-'}${flags.length ? ' | ⚠ ' + flags.join('; ') : ''}` };
    }).sort((a, b) => (a.v === 'reject') - (b.v === 'reject') || (a.total == null) - (b.total == null) || (a.total || 0) - (b.total || 0) || (a.price || 9e12) - (b.price || 9e12));
    const nextPdp = pass.map((x) => x.o.k).filter((k) => !db.pdp[k]).slice(0, top);
    SH.last = { nextPdp };
    /* Voucher gate (rule 2026-09-16): a priced row whose voucher layers were never read is a
       no-voucher CEILING, not a price. Estimate-only rows are WITHHELD until the wallet is actually
       read (SH.wallet + SH.config) or a per-listing picker/checkout proves the layers. The only way
       past it without voucher data is SH.config({vouchersNone:true}), which is an affirmative record
       that the wallet WAS read and holds nothing applicable - not a way to skip the read. */
    const gateOpen = !!(cfg.shopee.length || cfg.shipVouchers.length || cfg.vouchersNone);
    const shownRows = gateOpen ? pdpRows : pdpRows.filter((r) => r.proof !== 'estimate');
    const withheld = pdpRows.length - shownRows.length;
    return out({
      rankedBy: 'checkout total = item − shop voucher − Shopee voucher + shipping − ship voucher; proof ✅ recorded checkout > ✓ picker-backed > ≈ estimate; ?ship = no shipping read (ranked last). [NOT COUNTED: ...] lists voucher layers never read — those rows are a NO-VOUCHER CEILING, not a buy-now price.',
      vouchers: cfg.shopee.length || cfg.shipVouchers.length ? { shopee: cfg.shopee, ship: cfg.shipVouchers } : 'NONE SET — SH.config({shopee:[{pct,cap,min}], shipVouchers:[{cap,min}]}) from the app picker/checkout',
      listings: items.length, median: M(med), passed: pass.length, rejectedBy: rejected,
      candidates_itemPriceOnly: pass.slice(0, top).map((x) => `${M(x.o.price)} | ${x.o.name.slice(0, 60)} | sold ${x.o.sold} ★${x.o.rating} | ${x.o.shop}${x.o.official ? ' MALL' : ''} | ${x.o.k}${x.f.length ? ' | ' + x.f.join(',') : ''}`),
      voucherGate: cfg.vouchersNone && !cfg.shopee.length && !cfg.shipVouchers.length ? 'OPEN via vouchersNone: recorded that the wallet WAS read and holds nothing applicable to these listings. Any [NOT COUNTED: ...] marker below therefore means "no such voucher exists for this account", not "unread".' : gateOpen ? undefined : `REFUSED - ${withheld} priced row(s) withheld: voucher layers were never read, so every total here would be a no-voucher CEILING, not a price. Do ONE of: (1) SH.wallet({order:[<total>]}) then SH.config({shopee:[{pct,cap,min}], shipVouchers:[{cap,min}]}); (2) SH.picker('shopid/itemid', {...}) from a real checkout picker; (3) SH.config({vouchersNone:true}) ONLY to record that the wallet was read and holds nothing applicable. Do not write a report from withheld rows.`,
      pdp: shownRows.map((r) => `${r.v === 'ok' ? '✓' : r.v === 'warn' ? '~' : '✗'} ${r.k} ${r.line}`),
      nextPdp: nextPdp.length ? `SH.pdp(SH.last.nextPdp)  // ${nextPdp.length} unchecked` : 'none',
    }, 7000);
  }

  /* ---------- non-search pages ---------- */
  async function open(path, readyRe, timeout = 9000) {
    if (location.pathname + location.search === path && readyRe.test(document.body.innerText)) return true;
    const r = await go(path, { ready: () => readyRe.test(document.body.innerText), timeout });
    return readyRe.test(document.body.innerText) || (r.hit != null);
  }
  const visible = (e) => !!(e.offsetParent || e.getClientRects().length);
  function scrollables() { return [...document.querySelectorAll('div,section,ul')].filter((s) => s.scrollHeight > s.clientHeight + 50 && visible(s) && /(auto|scroll)/.test(getComputedStyle(s).overflowY)); }

  async function cart() {
    if (!(await open('/cart', /Increase|Tăng|items in cart|Giỏ hàng/))) return 'NEEDS_NAVIGATE https://shopee.vn/cart then BOOT';
    await sleep(2500);
    for (let i = 0; i < 6; i++) { window.scrollBy(0, 1500); await sleep(500); }
    const rowOf = (btn) => { let n = btn; for (let i = 0; i < 14 && n.parentElement; i++) { const p = n.parentElement; if (p.querySelectorAll('button[aria-label="Increase"]').length > 1) return n; n = p; } return n; };
    const rows = [...document.querySelectorAll('button[aria-label="Increase"]')].map(rowOf).map((r, i) => {
      const t = r.innerText.split('\n').map((x) => x.trim()).filter(Boolean), q = r.querySelector('input:not([type=checkbox])'), vi = t.indexOf('Variations:');
      return { i, name: (t.find((x) => x.length > 25 && !/₫/.test(x)) || '').slice(0, 70), variant: vi > -1 ? t[vi + 1] : null, unit: t.filter((x) => /^[\d.]+₫$/.test(x))[0] || null, qty: q && q.value, promos: t.filter((x) => /voucher available|Streaming Price|Add \d+ more|% off/i.test(x)).slice(0, 3) };
    });
    return out({ rows: rows.length, badge: (document.body.innerText.match(/items in cart (\d+)/) || [])[1], rows_: rows });
  }

  /** Voucher wallet: every tab, scrolled until the card count stops growing. */
  const fmtV = (r) => `#${r.i} ${r.code || "code?"} ${r.pct ? r.pct + '% cap ' : ''}${Math.round(r.cap / 1e3)}k min ${Math.round(r.min / 1e3)}k → save ${r.save.map((s) => Math.round(s / 1e3) + 'k').join('/')}${r.extraVsNow != null ? ` (+${Math.round(r.extraVsNow / 1e3)}k vs now)` : ''} | ${r.when || ''} | ${r.tab || ''} ${r.type}${r.coins ? ' [coins]' : ''}${r.tags.length ? ' [' + r.tags.join(' ') + ']' : ''} | ${r.evidence}`;
  /** Re-rank the last wallet read for another order total or after a picker read — no hop, no scrolling. */
  const rank = (o) => out(rankObj(o));
  function rankObj({ order, proven = null } = {}) {
    const raw = W.__shWalletRows || []; if (!raw.length) return 'no wallet read in this page — run SH.wallet first';
    // LIVE-/VIDEO- prefixed codes are stream-only even when neither the card nor the T&C prose says so
    // (2026-09-16: VIDEO-1000000000000001 read as a plain "Limited 22% off" app voucher until the code was decoded).
    const rows = raw.map((x) => {
      const code = codeFromUrl((W.__shWallet || [])[x.i]);
      const r = Object.assign(parseWalletCard(x.text, order || x.order) || {}, { i: x.i, tab: x.tab, code });
      if (/^(LIVE|VIDEO)-/i.test(code || '')) r.liveVideoOnly = true;
      return r;
    }).filter((r) => r.sig);
    const tcBy = Object.fromEntries(rows.map((r) => [r.i, db.tc[(W.__shWallet || [])[r.i]]]).filter(([, t]) => t));
    const R = rankVouchers(rows, { proven, tc: tcBy });
    return ({
      advice: R.advice, useNow: R.useNow.slice(0, 5).map(fmtV), candidates: R.candidates.slice(0, 8).map(fmtV), later: R.later.slice(0, 4).map(fmtV),
      notForItem: R.notForItem.length + ' (e.g. ' + R.notForItem.slice(0, 3).map((r) => `${r.pct}%/${Math.round(r.cap / 1e3)}k ${r.evidence}`).join(', ') + ')',
      freeShip: R.freeShip.slice(0, 2).map(fmtV), liveOnly: R.liveOnly.filter((r) => r.save[0] >= 1e5).slice(0, 3).map(fmtV),
      next: proven ? 'quote useNow as ✅ (picker); later = wait option' : 'SH.tc([#top candidates]) then ask for the app picker screenshot → SH.rank({order, proven})',
    });
  }
  function wallet({ order = [], proven = null, name = 'wallet' } = {}) {
    return job(name, async (log, J) => {
      if (!(await open('/user/voucher-wallet', /Min\. Spend|Đơn tối thiểu/i, 12000))) throw new Error('NEEDS_NAVIGATE https://shopee.vn/user/voucher-wallet then BOOT');
      await sleep(2000);
      // v3.0 excluded any div with a "Min. Spend" child — every real card has one, so it found 0 cards live
      const cardEls = () => [...document.querySelectorAll('div')].filter((d) => { const t = d.innerText || ''; return t.length < 420 && isWalletCardText(t) && ![...d.children].some((c) => isWalletCardText(c.innerText || '')); });
      const tabs = [];
      for (const e of document.querySelectorAll('[role=tab], div, span, a, button')) {
        const t = (e.innerText || '').trim();
        if (/^[^\n()]{2,24}\s?\(\d+\)$/.test(t) && ![...e.children].some((c) => (c.innerText || '').trim() === t) && !tabs.some((x) => x.label === t) && visible(e)) tabs.push({ label: t, el: e });
      }
      const seen = new Map(); W.__shWallet = []; W.__shWalletRows = [];
      const list = tabs.filter((t) => !/^(All|Tất cả)\b/i.test(t.label));
      log('tabs: ' + (tabs.map((t) => t.label).join(', ') || 'none found'));
      for (const tab of list.length ? list : [null]) {
        if (J.stop) break;
        if (/\(0\)$/.test(tab?.label || '')) continue;
        if (tab) { tab.el.click(); await sleep(1500); for (let i = 0; i < 12 && !cardEls().length; i++) await sleep(600); } // cards arrive late
        let last = -1, stable = 0; const sc = scrollables();
        for (let i = 0; i < 120 && stable < 4; i++) {
          window.scrollBy(0, 4000); for (const s of sc) s.scrollTop += 4000;
          const more = [...document.querySelectorAll('button, div[role=button]')].find((b) => /^(see more|load more|xem thêm)$/i.test((b.innerText || '').trim()) && visible(b)); if (more) more.click();
          await sleep(700);
          const n = cardEls().length; stable = n === last ? stable + 1 : 0; last = n;
        }
        for (const c of cardEls()) {
          const r = parseWalletCard(c.innerText, order); if (!r || seen.has(r.sig)) continue;
          r.tab = tab ? tab.label.replace(/\s?\(\d+\)$/, '') : null; r.i = W.__shWallet.push(([...c.querySelectorAll('a')].find((a) => /T&C|Điều kiện/i.test(a.innerText)) || {}).href || null) - 1;
          seen.set(r.sig, r); W.__shWalletRows.push({ i: r.i, tab: r.tab, text: c.innerText, order });
        }
        const total = +((tab?.label || '').match(/\((\d+)\)$/) || [])[1];
        log(`${tab ? tab.label : 'page'}: ${last} cards → ${seen.size} unique${total && last < total * 0.8 ? ` (PARTIAL: ${last}/${total} loaded)` : ''}`);
        window.scrollTo(0, 0); await sleep(600);
      }
      return { tabs: tabs.map((t) => t.label), unique: seen.size, ranking: rankObj({ order, proven }) };
    });
  }

  /** T&C of wallet vouchers by index (from SH.wallet) or URL — batched in one background job, cached until the voucher itself expires (SH.vouchers / SH.tcExport). */
  function tc(refs, { name = 'tc' } = {}) {
    return job(name, async (log, J) => {
      const res = [];
      for (const ref of refs) {
        if (J.stop) break;
        const url = typeof ref === 'number' ? (W.__shWallet || [])[ref] : ref;
        if (!url) { res.push(`#${ref}: no T&C link`); continue; }
        const hit = !!db.tc[url];
        if (!db.tc[url]) {
          const u = new URL(url, location.origin);
          const ok = await open(u.pathname + u.search, /Valid Period|Thời gian sử dụng|Hạn sử dụng/i, 15000); // 10 s missed 2 of 4 live
          if (!ok) { res.push(`#${ref}: T&C page did not render in-app → navigate to it, BOOT, then SH.tcHere()`); continue; }
          await sleep(1200);
          db.tc[url] = { ts: Date.now(), ...parseTc(document.body.innerText), code: codeFromUrl(url) || tcCode(document.body.innerText) };
        }
        const t = db.tc[url];
        res.push(`#${ref} ${hit ? "cached" : "read"} ${t.code || "code?"} ${t.webOK ? 'WEB-OK' : t.appOnly ? 'APP-ONLY' : 'device?'}${t.selectedOnly ? ' SELECTED-ITEMS' : ''} | ${t.headline} | valid ${t.valid} | pay ${t.payment || '-'} | ${t.details.slice(0, 200)}`);
        log(res[res.length - 1].slice(0, 60));
      }
      return res;
    });
  }
  const tcHere = () => out(parseTc(document.body.innerText));
  /**
   * Cross-session T&C cache. db.tc lives in shopee.vn localStorage, so it dies with the browser profile
   * (the 2026-09-16 run started on a fresh pane profile and re-read everything). Dump it into
   * data/vouchers.json with SH.tcExport(), seed a fresh profile with SH.tcImport(<that file>).
   */
  const tcExport = () => out({ _format: "T&C url -> parseTc result + ts. Paste back as SH.tcImport({tc:{...}}). Entries drop themselves once endsAt passes.", at: new Date().toISOString(), tc: db.tc }, 60000);
  function tcImport(obj, { now = Date.now() } = {}) {
    const src = (obj && obj.tc) || obj || {};
    let add = 0, skip = 0, dead = 0;
    for (const [url, v] of Object.entries(src)) {
      if (!v || typeof v !== 'object' || !v.valid) { skip++; continue; }
      if (v.endsAt ? now > v.endsAt + 8.64e7 : now - (v.ts || 0) > 30 * 8.64e7) { dead++; continue; }
      if (db.tc[url] && (db.tc[url].ts || 0) >= (v.ts || 0)) { skip++; continue; }
      db.tc[url] = v; add++;
    }
    save();
    return `imported ${add}, skipped ${skip}, dropped ${dead} expired — ${Object.keys(db.tc).length} T&C cached`;
  }
  /** What T&C is already cached — check this before spending a hop on SH.tc(). */
  const vouchers = () => out(Object.values(db.tc).map((t) =>
    `${t.code || 'code?'} ${t.webOK ? 'WEB-OK' : t.appOnly ? 'APP-ONLY' : 'device?'}${t.selectedOnly ? ' SELECTED-ITEMS' : ''} | ${t.headline} | valid ${t.valid}`), 5000);

  /** On /checkout AFTER the user-approved click on the platform "Select Voucher". Read-only. */
  async function checkoutVouchers() {
    const title = /Discount & Cashback|Free Shipping|Giảm giá|Miễn phí vận chuyển/;
    for (const s of scrollables().filter((s) => title.test(s.innerText || ''))) for (let i = 0; i < 30; i++) { s.scrollTop += 2000; await sleep(150); }
    const isCard = (t) => /T&C|Điều kiện/.test(t) && /(off|Cashback|Giảm|Hoàn)/.test(t);
    const cards = [...document.querySelectorAll('div')].filter((d) => { const t = d.innerText || ''; return isCard(t) && t.length < 380 && ![...d.children].some((c) => isCard(c.innerText || '')); });
    const wraps = new Set(), rows = [];
    for (const c of cards) {
      let w = c; for (let i = 0; i < 3; i++) { const p = w.parentElement; if (p && p.innerText.length < 520 && [...p.querySelectorAll('div')].filter((d) => cards.includes(d)).length === 1) w = p; }
      if (wraps.has(w)) continue; wraps.add(w);
      const t = w.innerText;
      rows.push({
        voucher: t.split('\n').find((x) => /off|Cashback|Giảm|Hoàn/.test(x)),
        min: (t.match(/(?:Min\. Spend|Đơn tối thiểu)[^\n]+/i) || [])[0] || null,
        when: (t.match(/(Expiring: [^\n]+|Valid Till: [^\n]+|HSD: [^\n]+)/) || [])[1] || null,
        blocked: (t.match(/Current device does not meet voucher T&C|Only applicable to specific products|[^\n]*(not met|chưa đạt|không đủ điều kiện|không áp dụng)[^\n]*/i) || [null])[0],
      });
    }
    const why = {}; rows.filter((r) => r.blocked).forEach((r) => { why[r.blocked] = (why[r.blocked] || 0) + 1; });
    const t = document.body.innerText;
    return out({
      cards: rows.length, blocked: why, usable: rows.filter((r) => !r.blocked),
      footer: (t.match(/\d+ Voucher[s]? (Auto-)?Selected[^\n]*/i) || [])[0] || null,
      orderTotal: (t.match(/(?:Total Payment|Tổng thanh toán):?\s*\n?\s*(₫?[\d.]+₫?)/i) || [])[1] || null,
    });
  }

  /* ---------- small utilities ---------- */
  function keys(re = /get_pc/, depth = 3) {
    const c = [...W.__cap].reverse().find((x) => re.test(x.u) && x.j) || Object.values(W.__capKeep).find((x) => re.test(x.u) && x.j);
    if (!c) return 'no capture matching ' + re;
    const walk = (o, d) => (d && o && typeof o === 'object' ? Object.fromEntries(Object.entries(Array.isArray(o) ? { 0: o[0] } : o).slice(0, 40).map(([k, v]) => [k, walk(v, d - 1)])) : typeof o);
    return out({ u: c.u.slice(0, 120), keys: walk(c.j, depth) }, 3000);
  }
  function status() {
    const now = Date.now();
    return out({ v: VER, url: location.pathname, hops: `${db.hops.filter((t) => now - t < 3.6e6).length}/h ${db.hops.length}/day (limits ${cfg.perHour}/${cfg.perDay})`, blockedUntil: db.blockedUntil > now ? new Date(db.blockedUntil).toLocaleTimeString() : null, jobs: Object.fromEntries(Object.entries(jobs).map(([k, j]) => [k, j.status])), stored: { items: Object.keys(db.items).length, pdp: Object.keys(db.pdp).length, prices: Object.keys(db.prices).length, tc: Object.keys(db.tc).length }, urlParams: cfg.urlParams || null });
  }
  function config(o) { Object.assign(cfg, o); Object.assign(db.cfg, o); save(); return status(); }
  function use(p) { profile = typeof p === 'string' ? PROFILES[p] : { ...PROFILES.ram_ddr4_2x16, ...p }; return 'profile set'; }
  /** Record a real checkout (app screenshot / web) for a listing: SH.checkout('shopid/itemid', {items, productDisc, shopV, voucher, ship, shipDisc, total, at, source}). */
  function checkout(k, o) {
    const calc = o.items - (o.productDisc || 0) - (o.shopV || 0) - (o.voucher || 0) + o.ship - (o.shipDisc || 0);
    if (calc !== o.total) return `REFUSED: lines add up to ${calc}, not total ${o.total} — re-read the screenshot`;
    db.checkouts[k] = { ...o, at: o.at || new Date(Date.now() + 7 * 3.6e6).toISOString().slice(0, 16) + '+07:00' }; save();
    return 'recorded ' + k + ' ' + K(o.total);
  }
  /**
   * Record a checkout Select-Voucher read for ONE listing — the only proof of what really applies (SKILL.md §5.3).
   * SH.picker('shopid/itemid', { best:{pct,cap,min}|{value,min}, shipVoucher:{cap,min}, applied:[], blocked:[{...,why}], at, source:'app'|'web' })
   * `best` = the ticked "Lựa chọn tốt nhất" card; it overrides every wallet-based guess for this listing.
   */
  function picker(k, o = {}) {
    if (!db.pdp[k]) return `REFUSED: no PDP for ${k} — SH.pdp(['${k}']) first, a picker read must attach to a priced listing`;
    if (!o.best && !o.shipVoucher && !(o.blocked || []).length) return 'REFUSED: nothing to record — pass at least best, shipVoucher or blocked';
    db.pickers[k] = {
      at: o.at || new Date(Date.now() + 7 * 3.6e6).toISOString().slice(0, 16) + '+07:00',
      best: o.best || null, shipVoucher: o.shipVoucher || null, applied: o.applied || [], blocked: o.blocked || [], source: o.source || 'app',
    };
    save();
    return 'picker recorded ' + k + ' — SH.report() now prices it from the picker, not the wallet';
  }
  /**
   * Drop every cached row for one product line so the next sweep/PDP re-reads it from Shopee.
   * SH.forget(/bosch/i) - matches search-item names AND stored PDP titles.
   * Also clears matching db.searched query stamps: otherwise a re-sweep inside searchTTLh just
   * logs "cached <kw>/<page>" and re-reads nothing. Pass {queries:/re/} to target those separately.
   */
  function forget(re, { queries = null } = {}) {
    if (!(re instanceof RegExp)) return 'REFUSED: pass a RegExp, e.g. SH.forget(/bosch/i)';
    const hit = new Set();
    for (const [k, o] of Object.entries(db.items)) if (re.test(o.name || '')) { hit.add(k); delete db.items[k]; }
    for (const [k, v] of Object.entries(db.pdp)) if (hit.has(k) || re.test(v.title || '')) { hit.add(k); delete db.pdp[k]; }
    let np = 0;
    for (const key of Object.keys(db.prices)) if (hit.has(key.split('#')[0])) { delete db.prices[key]; np++; }
    let nq = 0;
    const qre = queries instanceof RegExp ? queries : re;
    for (const path of Object.keys(db.searched)) {
      let dec = path; try { dec = decodeURIComponent(path); } catch (e) { /* keep raw */ }
      if (qre.test(dec)) { delete db.searched[path]; nq++; }
    }
    for (const k of hit) { delete db.checkouts[k]; delete db.pickers[k]; }
    save();
    return `forgot ${hit.size} listings, ${np} price rows, ${nq} cached queries - next sweep re-reads them. ${Object.keys(db.items).length} items / ${Object.keys(db.pdp).length} PDPs still cached.`;
  }
  const detail = (k) => out(db.pdp[k] || 'not checked: SH.pdp([\'' + k + '\'])', 4000);
  const history_ = (k) => out(Object.entries(db.prices).filter(([key]) => key.startsWith(k + '#')).map(([key, e]) => [key, e.h]));
  const exportDb = () => out({ prices: db.prices, pdp: Object.values(db.pdp).map((s) => [s.k, s.verdict, s.title, s.kit, s.shop.name]) }, 60000);

  Object.assign(SH, { go, job, wait, stop: (n) => { if (jobs[n]) jobs[n].stop = true; return 'stopping ' + n; }, queries, sweep, pdp, report, forget, checkout, picker, cart, wallet, rank, tc, tcHere, tcExport, tcImport, vouchers, checkoutVouchers, keys, status, config, use, detail, history: history_, export: exportDb, cfg, db: () => db });
  return 'SH ' + VER + ' ready ' + status();
});
