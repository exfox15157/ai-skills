const test = require('node:test');
const assert = require('node:assert');
const { lint } = require('../tools/lint-report.js');

const head = '| Sản phẩm | Đánh giá | Giá niêm yết | Giá mua ngay | Giá mua sau | Hướng dẫn |\n|---|---|---|---|---|---|\n';
const later = '— Lịch sử: chưa đủ (1 ngày theo dõi)<br>**— Không đáng chờ**';

test('buy-now cell with App then Web passes', () => {
  assert.deepEqual(lint(head + `| **1. Shop A** | x | 457k | **App: ✅371.500₫**<br>**Web: ≈441.300₫** | ${later} | x |`), []);
});

test('the 2026-09-17 failures are caught: web-style single number, Web first, missing Web', () => {
  const bad = lint(head +
    `| **1. Shop A** | x | 457k | **≈386.500₫**<br>SHOPV10K01 −10k | ${later} | x |\n` +
    `| **2. Châu Âu** | x | 465k | **Web: ≈416k**<br>**App: ≈409k** | ${later} | x |\n` +
    `| **3. NK** | x | 465k | **App: ≈409k** | ${later} | x |`);
  assert.equal(bad.length, 3);
  assert.match(bad[0], /no App line/); assert.match(bad[1], /Web before App/); assert.match(bad[2], /no Web line/);
});

test('tables without a buy-now column are ignored', () => {
  assert.deepEqual(lint('| Listing | Why |\n|---|---|\n| a | b |'), []);
});

test('2026-09-21 rule: a bare "—" in Giá mua sau fails — waiting was never weighed against the logged low', () => {
  const bad = lint(head + '| **1. Shop B** | x | 430k | **App: ≈342k**<br>**Web: ✅458.900₫** | **—** không đáng chờ | x |');
  assert.equal(bad.length, 1);
  assert.match(bad[0], /no price-history verdict/);
});

test('each history verdict shape passes: too short, at the low, above the low', () => {
  const rows = [
    'Lịch sử: chưa đủ (1 ngày theo dõi) — chưa kết luận được<br>**— Không đáng chờ**: mã 35% đang hết nhanh',
    'Lịch sử: đang ở đáy (thấp nhất 429.999₫ ngày 2026-09-21, 30 ngày theo dõi)<br>**— Không đáng chờ**',
    'Lịch sử: từng rẻ hơn 50.000₫ (−11,6%) ngày 2026-09-10<br>**Đáng chờ tới 10.10, mục tiêu ≈379.999₫**',
  ];
  for (const r of rows) assert.deepEqual(lint(head + `| **1. Shop B** | x | 430k | **App: ≈342k**<br>**Web: ≈462k** | ${r} | x |`), [], r);
});

test('English reports: "Buy later price" needs a price-history verdict too', () => {
  const en = '| Product | Rating | Listing price | Buy now price | Buy later price | Guide |\n|---|---|---|---|---|---|\n';
  assert.deepEqual(lint(en + '| **1. X** | x | 100k | **App: ≈90k**<br>**Web: ≈95k** | Price history: 1 day only — no call<br>**— Not worth waiting** | x |'), []);
  assert.match(lint(en + '| **1. X** | x | 100k | **App: ≈90k**<br>**Web: ≈95k** | — | x |')[0], /no price-history verdict/);
});

test('a data row that merely mentions "giá mua ngay" is not mistaken for a header', () => {
  const md = head + `| **1. A** | x | 1k | **App: 1k**<br>**Web: 1k** | ${later} | so với giá mua ngay thì rẻ hơn |\n` +
    `| **2. B** | x | 2k | **App: 2k**<br>**Web: 2k** | ${later} | x |`;
  assert.deepEqual(lint(md), []);
});
