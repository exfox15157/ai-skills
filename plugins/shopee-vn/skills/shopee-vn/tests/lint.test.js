const test = require('node:test');
const assert = require('node:assert');
const { lint } = require('../tools/lint-report.js');

const head = '| Sản phẩm | Đánh giá | Giá niêm yết | Giá mua ngay | Giá mua sau | Hướng dẫn |\n|---|---|---|---|---|---|\n';
const later = '**— Không đáng chờ**: mã shop hết hạn hôm nay';
// a Buy-now cell that satisfies the 2026-10-26 rule: App then Web, each with its calculation
const now = (a = '1k', w = '1k') => `**App: ${a} = ${a} + ship 0 − 0**<br>**Web: ${w} = ${w} + ship 0 − 0**`;

test('buy-now cell with App then Web, each with its calculation, passes', () => {
  assert.deepEqual(lint(head + `| **1. Shop A** | x | 457k | **App: ✅371.500₫ = 400.000 + ship 0 − 24.378**<br>**Web: ≈441.300₫ = 457.000 + ship 0 − 9.830** | ${later} | x |`), []);
});

test('the 2026-09-17 failures are caught: web-style single number, Web first, missing Web', () => {
  const bad = lint(head +
    `| **1. Shop A** | x | 457k | **≈386.500₫**<br>SHOPV10K01 −10k | ${later} | x |\n` +
    `| **2. Châu Âu** | x | 465k | **Web: ≈416k = 465k − 49k**<br>**App: ≈409k = 465k − 56k** | ${later} | x |\n` +
    `| **3. NK** | x | 465k | **App: ≈409k = 465k − 56k** | ${later} | x |`);
  const row = (n) => bad.filter((b) => b.startsWith(`line ${n + 2} `)).join('\n');
  assert.match(row(1), /no App line/); assert.match(row(1), /no Web line/);
  assert.match(row(2), /Web before App/);
  assert.match(row(3), /no Web line/); assert.doesNotMatch(row(3), /App line/);
});

test('every problem in a cell is reported in one run, not only the first', () => {
  const bad = lint(head + '| **1. A** | ⚠️ hàng cũ | 1,25tr | **Web: 1.200.000₫** EXAMPLEVIP8 | Lịch sử: chưa đủ | x |');
  for (const re of [/caveat/, /no App line/, /Web line is not second/, /without its calculation/, /EXAMPLEVIP8 outside/, /price-history line/, /no wait verdict/])
    assert.ok(bad.some((b) => re.test(b)), `missing ${re} in:\n${bad.join('\n')}`);
});

test('every bad line, bare code and internal term is listed, each once', () => {
  const bad = lint(head + '| **1. A** | x | 1k | **App: 1k** AAA11BB CCC22DD<br>**Web: 1k** AAA11BB | ' + later + ' | x |\nGATE 0 bait shopid');
  assert.equal(bad.filter((b) => /without its calculation/.test(b)).length, 2);
  assert.equal(bad.filter((b) => /AAA11BB outside/.test(b)).length, 1);
  assert.ok(bad.some((b) => /CCC22DD outside/.test(b)));
  for (const t of ['GATE 0', 'bait', 'shopid']) assert.ok(bad.some((b) => b.includes(`internal term "${t}"`)), t);
});

test('tables without a buy-now column are ignored', () => {
  assert.deepEqual(lint('| Listing | Why |\n|---|---|\n| a | b |'), []);
});

test('Buy-later cell without a wait verdict fails (a bare "—" says nothing)', () => {
  const bad = lint(head + `| **1. Shop B** | x | 430k | ${now('≈342k', '458.900₫')} | **—** | x |`);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /no wait verdict/);
});

test('2026-09-23 rule: a price-history line in Giá mua sau fails', () => {
  for (const r of ['Lịch sử: chưa đủ (1 ngày theo dõi)<br>**— Không đáng chờ**', 'Lịch sử giá: đang ở đáy<br>**— Không đáng chờ**'])
    assert.match(lint(head + `| **1. X** | x | 1k | ${now()} | ${r} | x |`).join('\n'), /price-history line/, r);
});

test('verdict shapes pass, and a seller claim "giá thấp lịch sử" is not mistaken for a history line', () => {
  const rows = [
    '**Đáng chờ tới 10.10, mục tiêu ≈379.999₫**: 000GIAM350K2 25% −247k',
    '**— Không đáng chờ**: tiêu đề ghi "giá thấp lịch sử" nhưng đó là quảng cáo của shop',
  ];
  for (const r of rows) assert.deepEqual(lint(head + `| **1. Shop B** | x | 430k | ${now('≈342k', '≈462k')} | ${r} | x |`), [], r);
});

test('English reports: "Buy later price" needs a verdict and no history line', () => {
  const en = '| Product | Rating | Listing price | Buy now price | Buy later price | Guide |\n|---|---|---|---|---|---|\n';
  assert.deepEqual(lint(en + `| **1. X** | x | 100k | ${now('≈90k', '≈95k')} | **— Not worth waiting**: shop voucher ends today | x |`), []);
  assert.match(lint(en + `| **1. X** | x | 100k | ${now('≈90k', '≈95k')} | Price history: 1 day<br>**— Not worth waiting** | x |`).join('\n'), /price-history line/);
});

test('a data row that merely mentions "giá mua ngay" is not mistaken for a header', () => {
  const md = head + `| **1. A** | x | 1k | ${now()} | ${later} | so với giá mua ngay thì rẻ hơn |\n` +
    `| **2. B** | x | 2k | ${now('2k', '2k')} | ${later} | x |`;
  assert.deepEqual(lint(md), []);
});

test('voucher codes must sit in ( ) after a Shopee-style description (rule 2026-10-02)', () => {
  const bare = lint(head + `| **1. A** | x | 330k | **App: ≈313.700₫ = 330k − 66k** EXAMPLEVIP8<br>**Web: ≈313.700₫ = 330k − 16.300** | ${later} | x |`);
  assert.equal(bare.length, 1); assert.match(bare[0], /EXAMPLEVIP8 outside/);
  const ok = head + `| **1. A** | x | 330k | **App: ✅277.200₫ = 330.000 − 52.800** Giảm 16% tối đa 300Kđ (EXAMPLEVIP8)<br>**Web: ≈330.000₫ = 330.000 − 0** | ${later} | x |\n\n` +
    '## Khuyến nghị\nGiảm 16% tối đa 300Kđ (EXAMPLEVIP8) chạm mức giảm tối đa từ đơn 1.875.000₫';
  assert.deepEqual(lint(ok), []);
});

test('"Giá tốt nhất" keeps at most 3 rows, one shop per row (rule 2026-10-29)', () => {
  const r = (n, shop, v) => `| **${n}. A07s**<br>Shop: ${shop} | x | 3tr | **App: ${v} = ${v} + ship 0 − 0**<br>**Web: ${v} = ${v} + ship 0 − 0** | ${later} | x |\n`;
  const md = (rows) => '## Giá tốt nhất\n' + head + rows.join('');
  assert.deepEqual(lint(md([r(1, 'A', '1.000₫'), r(2, 'B', '2.000₫'), r(3, 'C', '3.000₫')])), []);
  const four = lint(md([r(1, 'A', '1.000₫'), r(2, 'B', '2.000₫'), r(3, 'C', '3.000₫'), r(4, 'D', '4.000₫')]));
  assert.ok(four.some((b) => /more than 3 rows/.test(b)), four.join('\n'));
  const dup = lint(md([r(1, 'A', '1.000₫'), r(2, 'a', '2.000₫')]));
  assert.ok(dup.some((b) => /twice/.test(b)), dup.join('\n'));
});

test('"Gợi ý khác" product cell leads with the short reason (rule 2026-10-29)', () => {
  const row = (p) => `| ${p} | x | 3tr | ${now('1.000₫', '1.000₫')} | ${later} | x |\n`;
  assert.deepEqual(lint('## Gợi ý khác\n' + head + row('**4. Mẫu cao cấp hơn**<br>[A07 5G](https://shopee.vn/product/1/2)<br>Shop: X')), []);
  const bad = lint('## Gợi ý khác\n' + head + row('**4. [A07 5G](https://shopee.vn/product/1/2)**<br>Shop: X<br>Trục: cao cấp hơn'));
  assert.ok(bad.some((b) => /short reason/.test(b)), bad.join('\n'));
});
