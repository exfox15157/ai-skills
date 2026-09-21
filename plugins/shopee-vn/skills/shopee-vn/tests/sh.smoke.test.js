// Smoke test of the browser half of js/sh.js against a FAKE Shopee page (no network).
// Proves the plumbing (hook → in-app route → background job → report, block detection, hop budget);
// it cannot prove Shopee's real page behaves the same. Run: node --test tests/sh.smoke.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'sh.js'), 'utf8');

function fakePage({ block = false, cfg = {} } = {}) {
  const store = new Map([['__sh_db', JSON.stringify({ cfg: { dwell: [10, 20], ...cfg } })]]);
  const ctx = vm.createContext({ console, setTimeout, URL, URLSearchParams, Promise });
  ctx.window = ctx;
  ctx.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  ctx.location = { pathname: '/', search: '', origin: 'https://shopee.vn' };
  ctx.document = { title: 'Shopee', body: { innerText: '', scrollHeight: 1000 }, querySelectorAll: () => [] };
  ctx.getComputedStyle = () => ({ overflowY: 'visible' });
  ctx.scrollTo = ctx.scrollBy = () => {};
  ctx.XMLHttpRequest = class { open() {} send() {} addEventListener() {} };
  ctx.PopStateEvent = class { constructor(t) { this.type = t; } };
  ctx.history = { pushState: (s, t, p) => { const u = new URL(p, 'https://shopee.vn'); ctx.location.pathname = u.pathname; ctx.location.search = u.search; } };
  const payload = (u) => {
    if (block) return { error: 90309999 };
    if (/search_items/.test(u)) return { items: [
      { shopid: 1, itemid: 2, item_data: { item_card_display_price: { price: 5300000e5 }, shop_data: { shop_name: 'Good Shop' }, tier_variations: [{ options: ['2x16GB'] }] }, item_card_displayed_asset: { name: 'Kingston Fury Beast 32GB (2x16GB) DDR4 3200 CL16', shop_location: 'Hà Nội' } },
      { shopid: 7, itemid: 8, item_data: { item_card_display_price: { price: 900000e5 } }, item_card_displayed_asset: { name: 'Ram laptop DDR4 8GB', shop_location: 'Nước ngoài' } },
    ] };
    if (/get_pc/.test(u)) return { data: { item: { title: 'Kingston FURY Beast 32GB (2x16GB) DDR4 3200 CL16', condition: 1, models: [{ modelid: 5, name: '2x16GB', price: 5300000e5, price_before_discount: 6750000e5, stock: 9 }] }, shop_detailed: { name: 'Good Shop', rating_star: 4.95, rating_good: 5000, ctime: 1.5e9, item_count: 300, is_official_shop: true } } };
    return {};
  };
  ctx.fetch = async (u) => ({ clone: () => ({ json: async () => payload(u) }) });
  ctx.dispatchEvent = () => { // the "SPA" reacts to route changes by firing its own API call
    const { pathname, search } = ctx.location;
    if (pathname === '/search') ctx.fetch('/api/v4/search/search_items?by=relevancy&keyword=' + encodeURIComponent(new URLSearchParams(search).get('keyword')));
    if (pathname.startsWith('/product/')) {
      ctx.document.body.innerText = 'Shipping To Quận Mẫu\nShipping Fee ₫30.000\nProduct Specifications\nBrand Kingston\nProduct Description\nPart KF432C16BBK2/32, hàng mới 100%';
      ctx.fetch('/api/v4/pdp/get_pc?item_id=' + pathname.split('/')[3] + '&shop_id=' + pathname.split('/')[2]);
    }
  };
  const ret = vm.runInContext(src, ctx);
  return { ctx, SH: ctx.SH, ret, store };
}

test('install, self-store for BOOT, hook, sweep → pdp → report', async () => {
  const { SH, ret, store } = fakePage();
  assert.match(ret, /SH 3.9 ready/);
  assert.match(store.get('__shlib'), /^\(function SHLIB/);
  assert.match(SH.sweep(SH.queries({ terms: ['ram ddr4 2x16gb'] })), /started sweep/);
  const w = JSON.parse(await SH.wait('sweep', 15000));
  assert.equal(w.status, 'done', JSON.stringify(w));
  assert.equal(w.result.added, 2);
  let r = JSON.parse(SH.report());
  assert.equal(r.passed, 1);
  assert.equal(r.rejectedBy['no-kit-option'], 1);
  assert.match(r.nextPdp, /1 unchecked/);
  SH.pdp(SH.last.nextPdp);
  const p = JSON.parse(await SH.wait('pdp', 15000));
  assert.equal(p.status, 'done', JSON.stringify(p));
  r = JSON.parse(SH.report());
  // voucher gate: with no voucher layer read, an estimate-only row is a no-voucher CEILING -> withheld
  assert.equal(r.pdp.length, 0, 'estimate-only row must be withheld until vouchers are read');
  assert.ok(r.voucherGate.includes('REFUSED - 1 priced row(s) withheld'), r.voucherGate);
  assert.ok(r.voucherGate.includes('SH.wallet('), r.voucherGate);
  assert.match(r.vouchers, /NONE SET/);
  // recording that the wallet WAS read and holds nothing opens the gate; the row itself is unchanged
  SH.config({ vouchersNone: true });
  r = JSON.parse(SH.report());
  assert.ok(r.voucherGate.includes('OPEN via vouchersNone'), r.voucherGate);
  assert.match(r.pdp[0], /^✓ 1\/2 App: ≈5\.33M = 6\.75M −SP 1\.45M \+ship 30k \[NOT COUNTED: shopee-vouchers\+ship-vouchers\] \|\| Web: ≈5\.33M .*\| item 5\.30M \(was 6\.75M\).*MALL.*KF432C16BBK2\/32 3200 CL16 2x16/);
  // real wallet vouchers also open it, with no note
  SH.config({ vouchersNone: false, shopee: [{ pct: 20, cap: 50000, min: 0 }] });
  assert.equal(JSON.parse(SH.report()).voucherGate, undefined);
  SH.config({ shopee: [], vouchersNone: true });
  assert.equal(JSON.parse(SH.report({ keys: ['9/9'] })).pdp.length, 0);
  // a recorded checkout overrides the estimate; lines must add up
  assert.match(SH.checkout('1/2', { items: 5300000, ship: 30000, shipDisc: 30000, voucher: 1000000, total: 4300000 }), /recorded/);
  assert.match(SH.checkout('1/2', { items: 5300000, ship: 30000, total: 1 }), /REFUSED/);
  assert.match(JSON.parse(SH.report()).pdp[0], /^✓ 1\/2 App: ✅4\.30M checkout.*\|\| Web: ≈/);
  // a checkout recorded at an older sale price is still shown, but flagged
  SH.checkout('1/2', { items: 6750000, productDisc: 1350000, ship: 30000, shipDisc: 30000, voucher: 1000000, total: 4400000 });
  assert.match(JSON.parse(SH.report()).pdp[0], /price-changed-since-checkout 5\.40M→5\.30M/);
  // second sweep of the same query is served from cache: no hop
  SH.sweep(SH.queries({ terms: ['ram ddr4 2x16gb'] }), { name: 's2' });
  const c = JSON.parse(await SH.wait('s2', 5000));
  assert.equal(c.result.hops, 0);
  assert.match(SH.status(), /"items":2,"pdp":1/);
});

test('error 90309999 stops the job and sets a persisted cooldown', async () => {
  const { SH, store } = fakePage({ block: true });
  SH.sweep([['ram']]);
  const w = JSON.parse(await SH.wait('sweep', 30000));
  assert.equal(w.status, 'failed');
  assert.match(w.error, /90309999 — paused 30 min/);
  assert.ok(JSON.parse(store.get('__sh_db')).blockedUntil > Date.now());
  SH.sweep([['ram 2']], { name: 'again' });
  const again = JSON.parse(await SH.wait('again', 5000));
  assert.match(again.error, /BLOCKED — cooldown/);
});

test('hop budget refuses extra hops', async () => {
  const { SH } = fakePage({ cfg: { perHour: 1 } });
  SH.sweep([['a'], ['b']], { force: true });
  const w = JSON.parse(await SH.wait('sweep', 15000));
  assert.equal(w.status, 'failed');
  assert.match(w.error, /HOP BUDGET reached \(1\/h of 1/);
});
