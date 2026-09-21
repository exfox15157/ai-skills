// Offline tests for the pure parts of js/sh.js.  Run: node --test "%USERPROFILE%/.claude/skills/shopee-vn/tests"
// Live-page behaviour (hooks, route changes, wallet tabs) can only be verified in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'sh.js'), 'utf8');
const ctx = vm.createContext({ console, setTimeout, URL, atob }); // atob: browser global, used to decode voucher evcode
ctx.window = ctx;
const ret = vm.runInContext(src, ctx);
const T = ctx.SH._t;
const P = ctx.SH.PROFILES.ram_ddr4_2x16;
const plain = (o) => JSON.parse(JSON.stringify(o));

test('library installs without a DOM and exposes helpers', () => {
  assert.match(ret, /SH 3.9/);
  assert.equal(typeof T.decodeParts, 'function');
});

test('money parses Vietnamese and short formats', () => {
  assert.equal(T.money('1.000.000'), 1000000); // old wallet.js returned 1
  assert.equal(T.money('₫2.500.000'), 2500000);
  assert.equal(T.money('1,5m'), 1500000);
  assert.equal(T.money('300k'), 300000);
  assert.equal(T.money('2 triệu'), 2000000);
  assert.equal(T.money(null), 0);
});

test('part numbers decode', () => {
  const d = (s) => plain(T.decodeParts(s)[0]);
  assert.deepEqual(d('Kingston Fury Beast KF432C16BBK2/32'), { part: 'KF432C16BBK2/32', brand: 'Kingston', gen: 4, speed: 3200, cl: 16, sticks: 2, totalGB: 32 });
  assert.equal(d('HX426C16FB3K2/16').speed, 2666);
  assert.deepEqual(d('Corsair CMK32GX4M2E3200C16'), { part: 'CMK32GX4M2E3200C16', brand: 'Corsair', series: 'K', gen: 4, sticks: 2, totalGB: 32, speed: 3200, cl: 16 });
  assert.deepEqual(d('G.Skill F4-3200C16D-32GVK'), { part: 'F4-3200C16D-32GVK', brand: 'G.Skill', gen: 4, speed: 3200, cl: 16, sticks: 2, totalGB: 32, series: 'VK' });
  const t = d('T-Force Vulcan Z TLZGD432G3200HC16CDC01');
  assert.deepEqual([t.gen, t.totalGB, t.speed, t.cl, t.sticks], [4, 32, 3200, 16, 2]);
  const c = d('Crucial CT2K16G4DFRA32A');
  assert.deepEqual([c.sticks, c.totalGB, c.speed], [2, 32, 3200]);
  assert.equal(d('CT16G4DFD832A').speed, 3200);
  const b = d('Ballistix BL2K16G32C16U4B');
  assert.deepEqual([b.sticks, b.totalGB, b.speed, b.cl, b.gen], [2, 32, 3200, 16, 4]);
  const a = d('XPG AX4U32008G16A-DB10');
  assert.deepEqual([a.speed, a.cl, a.sticks, a.totalGB], [3200, 16, 2, 16]);
  assert.equal(T.decodeParts('ram ddr4 32gb 3200').length, 0);
});

test('title vs part number mismatch (real trap: "3600 CL16" was F4-3600C18D)', () => {
  const ts = T.titleSpecs('Ram G.Skill Trident Z 32GB (2x16GB) DDR4 3600 CL16');
  const p = T.decodeParts('F4-3600C18D-32GTZN')[0];
  assert.deepEqual(plain(T.mismatch(ts, p)), ['CL16≠CL18']);
  const ok = T.titleSpecs('Kingston Fury Beast 32GB (2x16GB) DDR4 3200 CL16');
  assert.deepEqual(plain(T.mismatch(ok, T.decodeParts('KF432C16BBK2/32')[0])), []);
  const oneStick = T.titleSpecs('Kingston Fury 32GB 1x32GB DDR4 3200');
  assert.equal(T.mismatch(oneStick, T.decodeParts('KF432C16BBK2/32')[0]).length, 1);
});

const searchRaw = (o) => ({
  shopid: 1, itemid: 2, adsid: o.ad ? 9 : undefined,
  item_data: { item_card_display_price: { price: o.price * 1e5, strikethrough_price: (o.was || 0) * 1e5, discount: 10 }, item_card_display_sold_count: { historical_sold_count: 5 }, item_rating: { rating_star: 4.91234 }, shop_data: { shop_name: 'S' }, is_sold_out: !!o.soldout, tier_variations: o.tiers ? [{ options: o.tiers }] : [] },
  item_card_displayed_asset: { name: o.name, shop_location: o.loc || 'TP. Hồ Chí Minh' },
});

test('search items parse and hard-filter', () => {
  const o = T.parseSearchItem(searchRaw({ name: 'Ram Kingston Fury 32GB (2x16GB) 3200', price: 5300000, was: 6750000 }));
  assert.equal(o.k, '1/2'); assert.equal(o.price, 5300000); assert.equal(o.was, 6750000); assert.equal(o.rating, 4.91);
  assert.deepEqual(plain(T.searchFlags(o, P, 5000000)), []);
  const abroad = T.parseSearchItem(searchRaw({ name: 'RAM 2x16GB DDR4', price: 3560000, loc: 'Nước ngoài', ad: true }));
  assert.deepEqual(plain(T.searchFlags(abroad, P, 6000000)), ['overseas', 'ad', 'bait-price?']);
  const laptop = T.parseSearchItem(searchRaw({ name: 'Ram laptop DDR4 16GB', price: 900000, tiers: ['1x16'] }));
  assert.ok(T.searchFlags(laptop, P).includes('no-kit-option'));
  assert.ok(T.searchFlags(laptop, P).some((f) => f.startsWith('bad-word')));
});

const pdpJson = (o) => ({ data: {
  item: { title: o.title, condition: o.condition ?? 1, models: o.models.map(([name, price, was, stock], i) => ({ modelid: i, name, price: price * 1e5, price_before_discount: (was || price) * 1e5, stock })) },
  shop_detailed: { name: 'Shop', rating_star: 4.9, rating_good: 900, ctime: o.ctime ?? 1.5e9, item_count: o.items ?? 120, is_official_shop: !!o.official },
  product_price: { price: { single_value: (o.shown || 0) * 1e5 } },
} });
const NOW = Date.parse('2026-09-15T00:00:00Z');

test('PDP: clean official kit passes', () => {
  const s = T.summarizePdp('1/2', pdpJson({ title: 'Kingston FURY Beast 32GB (2x16GB) DDR4 3200 CL16 KF432C16BBK2/32', models: [['2x16GB', 5300000, 6750000, 12]], official: true }), {}, P, NOW);
  assert.equal(s.verdict, 'ok', s.flags.join());
  assert.equal(s.parts[0].part, 'KF432C16BBK2/32');
});

test('PDP: used stock rejected even with "chính hãng" title (condition 4)', () => {
  const s = T.summarizePdp('1/3', pdpJson({ title: 'Kingston 2x16GB DDR4 3200 chính hãng', condition: 4, models: [['2x16', 4500000, 0, 3]] }), {}, P, NOW);
  assert.equal(s.verdict, 'reject'); assert.ok(s.flags.includes('USED(condition=4)'));
});

test('PDP: used words in description, but "không phải hàng cũ" is not flagged', () => {
  const used = T.summarizePdp('1/4', pdpJson({ title: 'Ram 2x16GB DDR4 3200', models: [['2x16', 3000000, 0, 3]] }), { desc: 'Hàng tháo máy, test kỹ' }, P, NOW);
  assert.ok(used.flags.some((f) => f.startsWith('used-words')));
  const fine = T.summarizePdp('1/5', pdpJson({ title: 'Ram 2x16GB DDR4 3200', models: [['2x16', 3000000, 0, 3]] }), { desc: 'Cam kết không phải hàng cũ' }, P, NOW);
  assert.ok(!fine.flags.some((f) => f.startsWith('used-words')), fine.flags.join());
});

test('PDP: bait listing from new cross-border shop (real trap: 3.56M card, 2x16 at 18.6M)', () => {
  const models = [['1x4GB', 356000], ['1x8GB', 700000], ...Array.from({ length: 30 }, (_, i) => ['var' + i, 900000 + i * 1000]), ['2x16GB CL16', 18600000, 0, 50]];
  const s = T.summarizePdp('9/9', pdpJson({ title: 'Asgard 2x16GB DDR4 CL16', models, ctime: NOW / 1000 - 3 * 2.63e6, items: 2700 }), { desc: 'vận chuyển trực tiếp từ Trung Quốc' }, P, NOW);
  assert.equal(s.verdict, 'reject');
  assert.ok(s.flags.includes('LIKELY-BAIT'), s.flags.join());
});

test('PDP: new shop alone is a warning, not a rejection', () => {
  const s = T.summarizePdp('2/2', pdpJson({ title: 'Ram 2x16GB DDR4 3200', models: [['2x16', 3000000, 0, 3]], ctime: NOW / 1000 - 2 * 2.63e6 }), {}, P, NOW);
  assert.equal(s.verdict, 'warn', s.flags.join());
});

test('PDP: kit option missing / sold out; shown price includes shop voucher', () => {
  const missing = T.summarizePdp('3/3', pdpJson({ title: 'Kingston Fury Beast 32GB', models: [['1x16GB', 1600000], ['1x32GB', 3190000]] }), {}, P, NOW);
  assert.ok(missing.flags.includes('no-kit-model'));
  const soldout = T.summarizePdp('3/4', pdpJson({ title: 'Kit 32GB', models: [['2x16GB', 5000000, 0, 0], ['1x16GB', 2500000, 0, 5]] }), {}, P, NOW);
  assert.ok(soldout.flags.includes('kit-sold-out'));
  const lexar = T.summarizePdp('3/5', pdpJson({ title: 'Lexar 2x16GB DDR4 3200', models: [['2x16GB', 6790000, 0, 4]], shown: 6310000 }), {}, P, NOW);
  assert.ok(lexar.flags.includes('shown-price-includes-shop-voucher'));
});

test('wallet cards: formats, savings, free-ship, live-only', () => {
  const pct = T.parseWalletCard('ShopeeVIP\n25% off Capped at 3m₫\nMin. Spend 1m₫\nExpiring: 20.09.2026\nT&C', [5300000, 800000]);
  assert.equal(pct.pct, 25); assert.equal(pct.cap, 3000000); assert.equal(pct.min, 1000000);
  assert.deepEqual(plain(pct.save), [1325000, 0]);
  const split = T.parseWalletCard('24% off\nCapped at ₫2.000.000\nMin. Spend ₫1.000.000\nT&C', [5300000]);
  assert.deepEqual([split.cap, split.min, split.save[0]], [2000000, 1000000, 1272000]);
  const flat = T.parseWalletCard('Shop voucher\n150k₫ off\nMin. Spend 3m₫\nValid Till: 30.09\nT&C', [5300000]);
  assert.deepEqual([flat.pct, flat.cap, flat.save[0]], [null, 150000, 150000]);
  const ship = T.parseWalletCard('Free Shipping\n₫50k off\nMin. Spend ₫0\nT&C', [5300000]);
  assert.ok(ship.freeShip);
  const live = T.parseWalletCard('Live Only\n20% off Capped at 500k₫\nMin. Spend 2m₫\nT&C', [5300000]);
  assert.ok(live.liveVideoOnly);
  const coins = T.parseWalletCard('10% Coins Cashback Capped at 100k₫\nMin. Spend 0₫\nT&C', [5300000]);
  assert.ok(coins.coins); assert.equal(coins.save[0], 100000);
  assert.equal(T.parseWalletCard('no voucher here'), null);
});

test('T&C: device list decides app-only vs web', () => {
  const page = (dev) => `Voucher\n25% off Capped at 3m₫\nMin. Spend 1m₫\nValid Period\n20.09.2026 00:00 - 20.09.2026 23:59\nApplicable Product\nmột số người bán và sản phẩm nhất định\nPayment\nAll payment methods\nLogistic\nAll\nDevice\n${dev}\nMore Details\nGiảm tối đa 1.000.000Đ từ 2.000.000Đ`;
  const app = T.parseTc(page('iOS, Android, Meta Web'));
  assert.equal(app.appOnly, true); assert.equal(app.webOK, false); assert.equal(app.selectedOnly, true);
  assert.match(app.valid, /20\.09\.2026/); assert.match(app.details, /1\.000\.000Đ/);
  assert.equal(T.parseTc(page('iOS, Android, Web')).webOK, true);
  assert.equal(T.parseTc('nothing').webOK, null);
});

test('price history flags a "was" price the item never sold at', () => {
  const store = {}, day = 8.64e7;
  T.recordPrice(store, '1/2', { id: 0, price: 5300000, was: 6750000 }, NOW - 10 * day);
  T.recordPrice(store, '1/2', { id: 0, price: 5400000, was: 6750000 }, NOW - 5 * day);
  T.recordPrice(store, '1/2', { id: 0, price: 5300000, was: 6750000 }, NOW);
  assert.equal(store['1/2#0'].h.length, 3);
  assert.match(T.wasCheck(store, '1/2', { id: 0, price: 5300000, was: 6750000 }, NOW), /never above 5\.40M in 3 days/);
  const one = {}; T.recordPrice(one, '1/2', { id: 0, price: 5300000, was: 9000000 }, NOW);
  assert.equal(T.wasCheck(one, '1/2', { id: 0, price: 5300000, was: 9000000 }, NOW), null);
});

/* ---------- regressions from the first live run (2026-09-15) ---------- */

test('live search shape: no tier_variations, badges in seller_flag, ads in icon_in_image', () => {
  const raw = { shopid: 1, itemid: 2, adsid: null, item_data: { item_card_display_price: { price: 2050000e5 }, shop_data: { shop_name: 'SHIPCOM', shop_icon: null }, tier_variations: null },
    item_card_displayed_asset: { name: 'Ram GSkill TRIDENT Z RGB 8GB 16GB 32GB DDR4', shop_location: 'Thành phố Hồ Chí Minh', seller_flag: { name: 'OFFICIAL_SHOP' }, icon_in_image: { ads_text: 'Ad' } } };
  const o = T.parseSearchItem(raw);
  assert.equal(o.ad, true); assert.equal(o.official, true); assert.equal(o.tiers, '');
  assert.deepEqual(plain(T.searchFlags(o, P)), ['kit?', 'ad']); // was a hard no-kit-option (513 of 550 dropped live)
  const single = T.parseSearchItem(searchRaw({ name: 'RAM Adata XPG D50 16GB (1x16) DDR4 3200Mhz', price: 3590000 }));
  assert.ok(T.searchFlags(single, P).includes('no-kit-option'));
  const used = T.parseSearchItem(searchRaw({ name: 'Ram DDR4 32G (16x2) các loại đã qua sử dụng', price: 4300000 }));
  assert.ok(T.searchFlags(used, P).some((f) => f.startsWith('bad-word')));
});

test('live get_pc shape: model_id, has_stock, stock from spec; Condition Used in spec', () => {
  const j = { data: { item: { title: 'Kit Ram Netac Shadow S 32GB (2x16) 3200Mhz DDR4', condition: 1, models: [{ model_id: 390721654907, name: '', price: 5480001e5, price_before_discount: 0, stock: null, normal_stock: null, has_stock: true }] }, shop_detailed: { name: 'CT', rating_good: 600, ctime: 1.7e9, last_active_time: NOW / 1000 - 3600 } } };
  const s = T.summarizePdp('1/9', j, { spec: 'Stock\n1\nCondition\nUsed\nBrand\nNetac' }, P, NOW);
  assert.equal(s.kit[0].id, 390721654907); assert.equal(s.kit[0].stock, 1);
  assert.ok(s.flags.includes('USED(spec)')); assert.equal(s.verdict, 'reject');
  const out = { data: { item: { title: 'x 2x16GB', models: [{ model_id: 1, name: '2x16GB', price: 1e11, has_stock: false }, { model_id: 2, name: '1x16GB', price: 1e11, has_stock: true }] } } };
  assert.ok(T.summarizePdp('1/8', out, {}, P, NOW).flags.includes('kit-sold-out'));
});

test('copied description / inactive shop with 1 rating is not a clean ✓ (real: GTZN title, GTZR description)', () => {
  const j = { data: { item: { title: 'RAM G.Skill Trident Z Neo 32GB (2x 16GB) DDR4 3200MHz CL16 (F4-3200C16D-32GTZN)', condition: 1, models: [{ model_id: 1, name: '', price: 5454545e5 }] },
    shop_detailed: { name: 'NguyenHoang Store', rating_good: 1, rating_normal: 0, rating_bad: 0, ctime: 1.62e9, item_count: 50, last_active_time: 0 } } };
  const s = T.summarizePdp('4/9', j, { desc: 'Dòng Trident Z RGB Series Mã Part F4-3200C16D-32GTZR Dung lượng 32GB (2 x 16GB)' }, P, NOW);
  assert.equal(s.verdict, 'warn', s.flags.join());
  for (const f of ['desc-part≠title-part F4-3200C16D-32GTZR', 'few-shop-ratings 1', 'shop-inactive']) assert.ok(s.flags.includes(f), f + ' in ' + s.flags.join());
});

test('multi-capacity listing: price spread per GB, description part for another variant only warns', () => {
  const models = [['16Gb (2x8Gb) 3600MHz', 8999000], ['8GB 3200MHz', 4999000], ['16GB 3200MHz', 7999000], ['32GB (2x16GB) 3600MHz', 15990000]];
  assert.deepEqual([T.modelGB('16Gb (2x8Gb) 3600MHz'), T.modelGB('32GB 3200MHz'), T.modelGB('2x16'), T.modelGB('Đen')], [16, 32, 32, null]);
  const s = T.summarizePdp('5/9', pdpJson({ title: 'Ram Kingston Fury Beast RGB 8/16/32Gb DDR4 3200/3600MHz', models, items: 619 }), { desc: 'Mã Sản Phẩm: KF426C16BBAK2/16' }, P, NOW);
  assert.ok(!s.flags.some((f) => f.startsWith('price-spread')), s.flags.join()); // was x3.2 → LIKELY-BAIT on a normal listing
  assert.ok(!s.flags.includes('LIKELY-BAIT'));
  assert.ok(s.flags.some((f) => f.startsWith('title≠part')), s.flags.join()); // still shown…
  assert.equal(s.verdict, 'warn', s.flags.join()); // …but a description part in a multi-variant listing no longer rejects
  const nb = T.summarizePdp('6/9', pdpJson({ title: 'Asgard D4 32gb (16x2) 3200', models: [['', 5300000, 6750000]] }), { desc: 'Tình trạng: Newbox fullvat' }, P, NOW);
  assert.ok(nb.flags.includes('warn-word:Newbox'), nb.flags.join());
});

test('wallet card finder: the card div holds both Min. Spend and T&C, with a child holding only one', () => {
  assert.equal(T.isWalletCardText('16% off Capped at 999k₫\nMin. Spend 250k₫\nExpiring: 12 hours left\nT&C'), true);
  assert.equal(T.isWalletCardText('16% off Capped at 999k₫\nMin. Spend 250k₫'), false);
  const c = T.parseWalletCard('Limited23% off Capped at 1,5m₫\nMin. Spend 500k₫\nValid Till: 30.09.2026\nT&C', [5300000]);
  assert.deepEqual([c.pct, c.cap, c.min, c.save[0]], [23, 1500000, 500000, 1219000]);
});

test('app picker card text (Vietnamese units: trđ, kđ, "Còn 12 giờ")', () => {
  const c = T.parseWalletCard('SHOPEE\ngiảm 19% Giảm tối đa 1trđ\nĐơn tối thiểu 2trđ\nhết hạn trong: Còn 12 giờ Điều kiện', [5300000], NOW);
  assert.deepEqual([c.pct, c.cap, c.min, c.save[0]], [19, 1000000, 2000000, 1000000]); // v3.1 read "1trđ" as 1₫
  assert.equal(c.endsAt, NOW + 12 * 3.6e6);
  const c2 = T.parseWalletCard('giảm 18% Giảm tối đa 2,2trđ\nĐơn tối thiểu 2trđ\nĐiều kiện', [5300000], NOW);
  assert.deepEqual([c2.cap, c2.save[0]], [2200000, 954000]);
  const ship = T.parseWalletCard('FREE SHIP\nMiễn phí vận chuyển\nĐơn tối thiểu 500kđ\nHSD: 20.09.2026 Điều kiện\nGiảm 50kđ', [5300000], NOW);
  assert.ok(ship.freeShip); assert.equal(ship.min, 500000);
  const later = T.parseWalletCard('25% off Capped at 3m₫\nMin. Spend 1m₫\nUse from: 20.09.2026\nT&C', [5300000], NOW);
  assert.equal(new Date(later.startsAt).toISOString(), '2026-09-19T17:00:00.000Z'); // 20 Sept 00:00 in Vietnam
});

test('voucher ranking: the real 2026-09-15 case (wallet said 24%, the app picked 19% cap 1M)', () => {
  const at = Date.parse('2026-09-15T04:15:00Z'); // 11:15 VN, when the screenshot was taken
  const cards = [
    [0, 'Shopee', '24% off Capped at 2m₫\nMin. Spend 1m₫\nExpiring: 12 hours left\nT&C'],
    [1, 'Shopee', '22% off Capped at 2m₫\nMin. Spend 1m₫\nExpiring: 12 hours left\nT&C'],
    [2, 'Shopee', '19% off Capped at 1m₫\nMin. Spend 2m₫\nExpiring: 12 hours left\nT&C'],
    [3, 'Shopee', '18% off Capped at 2,2m₫\nMin. Spend 2m₫\nExpiring: 12 hours left\nT&C'],
    [4, 'Shopee', '25% off Capped at 3m₫\nMin. Spend 1m₫\nUse from: 20.09.2026\nT&C'],
    [5, 'Shopee', 'Shopee Live - Điện tử\n30% off Capped at 2m₫\nMin. Spend 3m₫\nLive Only\nExpiring: 12 hours left\nT&C'],
    [6, 'Shop', 'Apple Flagship Store\n300k₫ off\nMin. Spend 0₫\nSpecific Product(s)\nExpiring: 1 day left\nT&C'],
    [7, 'Shopee', 'Free Shipping\nMiễn phí vận chuyển\nMin. Spend 500k₫\nValid Till: 20.09.2026\nT&C'],
    [8, 'Shopee', '10% off Capped at 500k₫\nMin. Spend 1m₫\nValid Till: 10.09.2026\nT&C'], // expired
  ].map(([i, tab, text]) => Object.assign(T.parseWalletCard(text, [5300000], at), { i, tab }));

  const blind = T.rankVouchers(cards, { now: at });
  assert.deepEqual(plain(blind.candidates.map((r) => r.pct)), [24, 22, 19, 18]); // what v3.1 showed first
  assert.match(blind.advice, /^UNPROVEN/);
  assert.ok(!blind.candidates.concat(blind.later).some((r) => r.i === 8)); // expired dropped

  const proven = { at, best: { pct: 19, cap: 1000000, min: 2000000 }, applied: [{ pct: 18, cap: 2200000, min: 2000000 }] };
  const R = T.rankVouchers(cards, { now: at, proven, tc: { 4: { appOnly: true, headline: '25% off' } } });
  assert.deepEqual(plain(R.useNow.map((r) => [r.pct, r.save[0], r.evidence])), [[19, 1000000, 'picker'], [18, 954000, 'picker']]);
  assert.deepEqual(plain(R.notForItem.map((r) => r.i).sort()), [0, 1, 6]); // 24% / 22% beaten by the picker, other shop's voucher
  assert.equal(R.later[0].pct, 25); assert.equal(R.later[0].extraVsNow, 325000);
  assert.deepEqual(plain(R.later[0].tags), ['APP']);
  // rule 2026-09-17: a 'selected products' voucher stays out of every estimate until a picker proves it for this item
  const sel = T.rankVouchers(cards, { now: at, proven, tc: { 4: { appOnly: true, selectedOnly: true, headline: '25% off' }, 3: { selectedOnly: true, headline: '18% off' } } });
  assert.equal(sel.later.length, 0);
  assert.equal(sel.notForItem.find((r) => r.i === 4).evidence, 'selected-items-unproven');
  assert.equal(sel.useNow.find((r) => r.i === 3).evidence, 'picker'); // proven wins over the SELECTED tag
  assert.equal(sel.notForItem.find((r) => r.i === 6).evidence, 'selected-items-unproven'); // 'Specific Product(s)' card
  assert.equal(R.liveOnly[0].pct, 30); assert.equal(R.freeShip.length, 1);
  assert.ok(R.useNow[0].tags.includes('EXPIRES<24h'));
  assert.match(R.advice, /best now 1000k \(picker\); waiting to 2026-09-20 adds ≤325k/);

  // a picker read from another day proves nothing about today's bigger cards
  const stale = T.rankVouchers(cards, { now: at, proven: { ...proven, at: at - 8.64e7 } });
  assert.ok(stale.candidates.some((r) => r.pct === 24), 'yesterday\'s picker must not hide today\'s 24%');
  assert.ok(!stale.notForItem.some((r) => r.evidence === 'beaten-by-picker'));
});

test('out() caps token-heavy results', () => {
  assert.match(T.out({ a: 'x'.repeat(9000) }, 100), /chars cut/);
});

test('checkout estimate reproduces the real soft-drink app checkouts (2026-09-15)', () => {
  const shopee = [{ pct: 20, cap: 50000, min: 0 }];
  // Mall shop A: 300k −41k product discount = 259k, ship 91.1k, free-ship −59.6k, platform voucher −50k → 240.5k
  const mall = T.checkoutEstimate({ price: 259000, was: 300000, ship: { min: 91100, max: 91100 }, shopee, shipVouchers: [{ cap: 59600 }] });
  assert.equal(mall.total, 240500);
  assert.deepEqual([mall.items, mall.productDisc], [300000, 41000]); // checkout lines "Tổng tiền hàng" / "Ưu đãi sản phẩm"
  assert.match(T.fmtCheckout(mall), /^240\.5k = 300k −SP 41k −Shopee 50k \+ship 91\.1k −shipV 59\.6k$/);
  assert.equal(mall.shopeeV, 50000);
  // shop D: 235k, ship 208.6k, free-ship −49.6k, voucher −47k (20% of 235k) → 347k
  const cheap = T.checkoutEstimate({ price: 235000, ship: { min: 208600, max: 208600 }, shopee, shipVouchers: [{ cap: 49600 }] });
  assert.equal(cheap.total, 347000);
  assert.ok(mall.total < cheap.total, 'the pricier item is cheaper at checkout');
  // unknown shipping → no total, so it can never outrank a listing with shipping
  const noShip = T.checkoutEstimate({ price: 100000, shopee });
  assert.equal(noShip.total, null);
  assert.deepEqual(plain(noShip.missing), ['shipping', 'ship-vouchers']); // ship vouchers come from cfg: empty = never read
  // shop voucher applies first; Shopee % and min spend work on the amount after it; ship voucher never exceeds the fee
  const e = T.checkoutEstimate({ price: 300000, ship: { min: 20000, max: 30000 }, shopVouchers: [{ value: 60000, min: 250000 }, { pct: 10, cap: 20000, min: 0 }],
    shopee: [{ pct: 20, cap: 100000, min: 250000 }, { value: 15000, min: 0 }], shipVouchers: [{ cap: 50000, min: 0 }] });
  assert.deepEqual([e.shopV, e.shopeeV, e.ship, e.shipV, e.total], [60000, 15000, 30000, 30000, 225000]);
  assert.equal(T.voucherSave({ pct: 10, cap: 5000, coins: true }, 100000), 0);
});

test('shipping and shop-voucher parsers', () => {
  assert.deepEqual(plain(T.parseShipText('Vận Chuyển\nVận Chuyển Tới Phường Mẫu\nPhí Vận Chuyển ₫91.100')), { min: 91100, max: 91100, free: false, src: 'dom' });
  assert.deepEqual(plain(T.parseShipText('Shipping Fee ₫15.000 - ₫30.000')), { min: 15000, max: 30000, free: false, src: 'dom' });
  assert.equal(T.parseShipText('Product Description only'), null);
  // real get_pc shapes (2026-09-15): fee = cheapest channel's price_before_discount; the promo range is ignored
  const pv = (v) => ({ single_value: v * 1e5, range_min: -1, range_max: -1 });
  const mallPc = { data: { product_shipping: { shipping_fee_info: { price: { single_value: -1, range_min: 0, range_max: 25000e5 } },
    ungrouped_channel_infos: [{ name: 'Hỏa Tốc', price: pv(25000), price_before_discount: pv(104600) }, { name: 'Nhanh', price: pv(0), price_before_discount: pv(91100) }, { name: 'Hàng Cồng Kềnh', price: pv(5000), price_before_discount: pv(91100) }],
    grouped_channel_infos_by_service_type: [{ channel_infos: [{ name: 'Tủ Nhận Hàng', price: pv(0), price_before_discount: pv(91100) }] }] } } };
  const m = plain(T.shipFromPc(mallPc));
  assert.deepEqual([m.min, m.channel, m.expressOnly], [91100, 'Nhanh', false]);
  const ex = plain(T.shipFromPc({ data: { product_shipping: { ungrouped_channel_infos: [{ name: 'Hỏa Tốc', price: pv(130000), price_before_discount: pv(208600) }], grouped_channel_infos_by_service_type: [] } } }));
  assert.deepEqual([ex.min, ex.expressOnly], [208600, true]);
  // unserviceable channel (warning, promo price 0, no before price) must not read as free shipping (live: shop E 144.6k)
  const vm_ = plain(T.shipFromPc({ data: { product_shipping: { ungrouped_channel_infos: [{ name: 'Hỏa Tốc', price: pv(66000), price_before_discount: pv(144600) }, { name: 'Trong Ngày', price: pv(0), price_before_discount: null, warning: { type: 'unsupported_address' } }] } } }));
  assert.deepEqual([vm_.min, vm_.expressOnly], [144600, true]);
  assert.equal(T.shipFromPc({ data: { product_shipping: { shipping_fee_info: { price: { single_value: -1, range_min: 0, range_max: 25000e5 } } } } }), null);
  const S = T.summarizePdp('125900451/1903711998', { data: { item: { title: 'Nước ngọt 320ml x 24 lon', models: [{ model_id: 1, name: 'Thùng', price: 235000e5 }] }, shop_detailed: {}, shop_vouchers: [], product_shipping: ex && { ungrouped_channel_infos: [{ name: 'Hỏa Tốc', price_before_discount: pv(208600) }] } } }, {}, { ...P, kit: /24/ });
  assert.equal(S.ship.min, 208600);
  assert.ok(S.flags.includes('express-only-shipping 208.6k'), S.flags.join());
  const api = T.shopVouchersFromCaptures([{ j: { data: { voucher_list: [{ discount_value: 10000e5, min_spend: 200000e5, reward_type: 0 }, { discount_percentage: 5, discount_cap: 20000e5, min_spend: 0, reward_type: 1 }] } } }]);
  assert.equal(api.length, 2);
  assert.deepEqual([api[0].value, api[0].min, api[1].pct, api[1].coins], [10000, 200000, 5, true]);
  const dom = plain(T.parseShopVoucherText('Giảm ₫10k\nĐơn tối thiểu ₫200k\n5% OFF'));
  assert.deepEqual(dom.map((v) => [v.value, v.pct, v.min, v.minUnknown]), [[10000, null, 200000, false], [0, 5, 0, true]]);
});

test('T&C cache: voucher code, end date and expiry-based eviction', () => {
  // Real T&C pages read 2026-09-16 (EXAMPLE22 = web-usable, #38 = app-only with no code in the body).
  const page = (dev, details) => `Voucher\n22% off Capped at 100k₫\nMin. Spend 259k₫\nValid Period\n16 Sept 2026 00:00 - 24 Sept 2026 23:59\nApplicable Product\nmột số người bán và sản phẩm nhất định\nPayment\nAll payment methods\nLogistic\nAll\nDevice\n${dev}\nMore Details\n${details}`;
  const web = T.parseTc(page('iOS, Android, Web', 'Chỉ áp dụng trên App + Web cho một số sản phẩm tham gia chương trình nhất định. Mã EXAMPLE22 giảm 22% tối đa 100000Đ cho đơn từ 259000Đ. HSD: 23:59 24/9/2026.'));
  assert.equal(web.code, 'EXAMPLE22');
  assert.equal(web.webOK, true);
  assert.equal(web.endsAt, Date.UTC(2026, 8, 24, 23, 59) - 7 * 3.6e6); // last date wins, VN clock

  // "Mã giảm 22%..." is not a code — never guess one out of prose.
  const app = T.parseTc(page('iOS, Android, Meta Web', 'Mã giảm 22% tối đa 150000Đ cho đơn hàng tối thiểu 100000Đ. Áp dụng trên ứng dụng Shopee.'));
  assert.equal(app.code, null);
  assert.equal(app.appOnly, true);

  // dd/mm/yyyy only, and unreadable periods stay null (→ 30-day fallback TTL)
  assert.equal(T.tcEnd('20.09.2026 00:00 - 20.09.2026 23:59'), Date.UTC(2026, 8, 20, 23, 59) - 7 * 3.6e6);
  assert.equal(T.tcEnd('', 'HSD: 24/9/2026'), Date.UTC(2026, 8, 24, 23, 59) - 7 * 3.6e6);
  assert.equal(T.tcEnd('Không giới hạn'), null);
  assert.equal(T.tcCode('nothing labelled here'), null);

  // the code is base64 in the T&C link's evcode param — free, no hop (real links, 2026-09-16)
  const u = (ev) => `https://shopee.vn/voucher/details?evcode=${ev}&from_source=voucher-wallet&promotionId=1000000000000004&signature=bfcc94`;
  assert.equal(T.codeFromUrl(u('RVhBTVBMRTIy')), 'EXAMPLE22');
  assert.equal(T.codeFromUrl(u('TElWRS0xMDAwMDAwMDAwMDAwMDAz')), 'LIVE-1000000000000003');
  assert.equal(T.codeFromUrl(u('VklERU8tMTAwMDAwMDAwMDAwMDAwMQ%3D%3D')), 'VIDEO-1000000000000001');
  assert.equal(T.codeFromUrl('https://shopee.vn/voucher/details?promotionId=1'), null);
  assert.equal(T.codeFromUrl(null), null);
  // the code prefix is the only tell that a card is stream-only — its text and T&C said neither
  assert.match(T.codeFromUrl(u('VklERU8tMTAwMDAwMDAwMDAwMDAwMQ%3D%3D')), /^(LIVE|VIDEO)-/);
  assert.doesNotMatch(T.codeFromUrl(u('RVhBTVBMRTIy')), /^(LIVE|VIDEO)-/);

  // eviction follows the voucher, not a flat TTL: a 20-day-old entry valid till next week is still good
  const day = 8.64e7, store = {
    live: { ts: NOW - 20 * day, endsAt: NOW + 7 * day },
    dead: { ts: NOW - 1 * day, endsAt: NOW - 2 * day },
    grace: { ts: NOW - 1 * day, endsAt: NOW - 0.5 * day }, // +1 day grace: still cached
    undated_fresh: { ts: NOW - 5 * day },
    undated_stale: { ts: NOW - 40 * day },
  };
  assert.equal(T.tcEvict(store, NOW), 2);
  assert.deepEqual(Object.keys(store).sort(), ['grace', 'live', 'undated_fresh']);
});

test('voucher layers: percentage_used is not a discount rate, and all four layers are accounted for (2026-09-16)', () => {
  // REGRESSION: Pharmacity PHARMSP35 is a FLAT 35k voucher whose payload carried percentage_used:48
  // (= 48% of the voucher stock claimed). Reading it as 48% off made a 544.9k item look 261.5k cheaper.
  // API money is VND x 100000, so a flat 35k voucher with a 350k minimum arrives as these raw values
  const v = T.parseShopVoucherJson({ min_spend: 35000000000, discount_value: 3500000000, percentage_used: 48, voucher_code: 'PHARMSP35' });
  assert.deepEqual([v.value, v.min], [35000, 350000]);
  assert.equal(v.pct, null, 'percentage_used must never become a discount rate');
  assert.equal(T.voucherSave(v, 544850), 35000);

  // a payload carrying BOTH readings takes the smaller saving rather than trusting an uncapped pct
  assert.equal(T.voucherSave({ pct: 48, cap: null, value: 35000 }, 544850), 35000);

  // all four layers stack: shop -> platform (on the amount after shop) -> shipping -> free ship
  const full = T.checkoutEstimate({
    price: 500000, ship: { min: 30000, max: 30000 },
    shopVouchers: [{ value: 35000, min: 350000, code: 'PHARMSP35' }],
    shopee: [{ pct: 10, cap: 100000, min: 0 }], shipVouchers: [{ cap: 30000, min: 0 }],
  });
  assert.deepEqual([full.shopV, full.shopeeV, full.ship, full.shipV, full.total], [35000, 46500, 30000, 30000, 418500]);
  assert.equal(full.shopVCode, 'PHARMSP35');
  assert.deepEqual(plain(full.missing), [], 'every layer read => nothing missing');
  assert.equal(full.proof, 'estimate');

  // with no wallet read the estimate is a NO-VOUCHER CEILING and must say so
  const bare = T.checkoutEstimate({ price: 350000, ship: { min: 28700, max: 28700 } });
  assert.equal(bare.total, 378700);
  assert.deepEqual(plain(bare.missing), ['shopee-vouchers', 'ship-vouchers']);
  assert.equal(bare.proof, 'partial');
  assert.match(T.fmtCheckout(bare), /NOT COUNTED: shopee-vouchers\+ship-vouchers/);

  // a picker read for THIS listing overrides the wallet guess for both platform and free-ship voucher
  const proven = T.checkoutEstimate({
    price: 500000, ship: { min: 30000, max: 30000 },
    shopee: [{ pct: 24, cap: 2000000, min: 0 }], shipVouchers: [{ cap: 30000, min: 0 }],
    proven: { best: { pct: 19, cap: 1000000, min: 0 }, shipVoucher: { cap: 15000, min: 0 } },
  });
  assert.equal(proven.shopeeV, 95000, 'picker 19% wins over the wallet 24% card');
  assert.equal(proven.shipV, 15000);
  assert.equal(proven.proof, 'picker');
  assert.deepEqual([proven.src.shopee, proven.src.shipVoucher], ['picker', 'picker']);
});
