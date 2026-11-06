#!/usr/bin/env node
// shopee-vn report linter, shipped with the skill so it works on any machine. Checks, per table column:
// 1. "Giá mua ngay" / "Buy now price": an App line first and a Web line second (rule 2026-09-17), and NOTHING else:
//    each line is the calculation + the best voucher for that side (rule 2026-10-26).
// 2. "Giá mua sau" / "Buy later price": a wait verdict ("Đáng chờ …" / "Không đáng chờ …"), and NO price-history
//    line (rule 2026-09-23: the log is one day deep on most listings and no third-party tracker proved reliable,
//    so "Lịch sử: chưa đủ" was noise in every row; the 2026-09-21 history rule is withdrawn).
// 2b. "Giá mua sau": every voucher followed by [<start> - <end> - Số lượng: <n>] (rule 2026-10-09).
// 3. Both price cells: a voucher code only inside parentheses after a Shopee-style description, e.g.
//    "Giảm 16% tối đa 300Kđ (EXAMPLEVIP8)" (rule 2026-10-02: bare codes are unreadable for the user).
// 4-7. Whole-document checks (2026-10-22): bare codes anywhere (V3), cap binding point (V8), "thay cho" in Buy-later (V10),
//    internal terms - see docChecks().
// Usage: node tools/lint-report.js <draft-report.md>   -> prints OK (exit 0) or the bad rows (exit 1)
// Every check returns ALL its problems (an array), so one run lists everything to fix instead of one error per round.
const fs = require('fs');

// A code = an uppercase token with at least one digit (EXAMPLEVIP8, VIDEO-1000000000000001); App/Web/VIP have no digit.
const bareCodes = (cell) => {
  const m = cell.replace(/\([^)]*\)/g, ' ').match(/(?<![\w-])[A-Z][A-Z0-9-]{4,}(?![\w-])/g) || [];
  return [...new Set(m.filter((t) => /\d/.test(t) && /[A-Z].*[A-Z]/.test(t)))]
    .map((c) => `voucher code ${c} outside ( ) - write it Shopee-style, e.g. "Giảm 16% tối đa 300Kđ (${c})"`);
};

// Buy-later cell: every voucher mentioned must carry its window + quantity right after it (rule 2026-10-09):
// "Giảm 20% tối đa 4,5Trđ (CODE) [0h00 10/10 - 23:59 10/10 - Số lượng: 150]". Unknown parts are written "?" -
// the bracket itself is mandatory, so a missing window is visible instead of silently dropped.
// Capitalised, Shopee-card style only ("Giảm 20% …", "Miễn phí vận chuyển …"), so prose like "giảm tối đa 2tr" in a verdict is not counted.
const VOUCHER_RE = /(Giảm\s+(?:tối đa\s+)?\d+(?:[.,]\d+)?\s*(?:%|K|Kđ|Trđ|tr|đ|₫)|Miễn phí vận chuyển|Free ?[Ss]hip)/g;
const WINDOW_RE = /\[[^\]]*?\s-\s[^\]]*?\s-\s*(?:Số lượng|SL|Qty|Quantity)\s*:[^\]]*\]/gi;
const windowChecks = (cell) => cell.split(/<br\s*\/?>/i)
  .filter((seg) => (seg.match(VOUCHER_RE) || []).length > (seg.match(WINDOW_RE) || []).length)
  .map((seg) => `voucher without [bắt đầu - kết thúc - Số lượng: N] in Buy-later cell: "${seg.trim().slice(0, 60)}" - add e.g. [0h00 10/10 - 23:59 10/10 - Số lượng: 150] (use ? for unknown parts)`);

const COLS = [
  {
    head: /đánh giá|rating/i,
    // (rule 2026-10-29) rating column = stars / reviews / sold / Mall only; listing caveats go to "Gợi ý mua" or are dropped
    check: (cell) => [
      /⚠/.test(cell) && 'caveat (⚠️) in the rating column - keep only stars / reviews / sold / Mall; move a decision-changing caveat to "Gợi ý mua"',
      cell.length > 160 && `rating cell is ${cell.length} chars - keep only stars / reviews / sold / Mall (caveats go to "Gợi ý mua")`,
    ].filter(Boolean),
  },
  {
    head: /gi[áa] mua ngay|buy now price/i,
    // (rule 2026-10-26) exactly two lines: "App: <total>₫ = <item> + ship <fee> − <saving> [<best voucher>]"
    // and "Web: …" - no fallback, no list of non-applicable vouchers, no flash note, no promo-ship total, no cap phrase.
    check: (cell) => {
      const segs = cell.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
      if (!segs.length) return ['empty Buy-now cell - write the App line, then the Web line'];
      const isApp = (s) => /^App\b/i.test(s), isWeb = (s) => /^Web\b/i.test(s), bad = [];
      if (isWeb(segs[0]) && isApp(segs[1] || '')) bad.push('Web before App - put the App line first, the Web line second');
      else {
        if (!isApp(segs[0])) bad.push(segs.some(isApp) ? 'App line is not first' : 'no App line - the first line must be "App: …"');
        if (!isWeb(segs[1] || '')) bad.push(segs.some(isWeb) ? 'Web line is not second' : 'no Web line - the second line must be "Web: …"');
      }
      if (segs.length > 2) bad.push(`Buy-now cell has ${segs.length} lines - keep only the App and Web calculations (fallback / promo-ship total go to "Gợi ý mua", flash notes to "Giá mua sau", drop the "không áp dụng" list)`);
      for (const s of segs) if (!/=/.test(s)) bad.push(`Buy-now line without its calculation: "${s.slice(0, 50)}" - write "<total>₫ = <item> + ship <fee> − <saving> [<voucher>]"`);
      if (/chạm mức giảm tối đa/i.test(cell)) bad.push('cap phrase "chạm mức giảm tối đa …" in Buy-now cell - put it once in "Khuyến nghị"');
      return bad.concat(bareCodes(cell));
    },
  },
  {
    head: /gi[áa] mua sau|buy later price/i,
    check: (cell) => [
      /l[ịi]ch s[ửu]\s*(gi[áa]\s*)?:|price history\s*:/i.test(cell) && 'price-history line in Buy-later cell (removed 2026-09-23 - drop "Lịch sử: …")',
      !/đáng chờ|dang cho|worth waiting/i.test(cell) && 'no wait verdict in Buy-later cell (end with "Đáng chờ …" or "Không đáng chờ: <lý do>")',
      ...bareCodes(cell.replace(WINDOW_RE, ' ')),
      ...windowChecks(cell),
    ].filter(Boolean),
  },
];
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isSep = (l) => /^\s*\|/.test(l) && cells(l).every((c) => /^:?-{2,}:?$/.test(c));

// ---- Whole-document checks (rule 2026-10-22, after a report needed 3 rounds for these) ----
// 4. V3 everywhere: a code that the report itself names Shopee-style "(CODE)" somewhere must never appear bare elsewhere
//    (header, rejected table, recommendation). Model numbers are untouched: only codes seen inside ( ) are checked.
// 5. V8: each % voucher whose code appears must carry "chạm mức giảm tối đa từ đơn …" next to one of its mentions.
// 6. V10: a Buy-later cell naming a voucher that is not in the same row's Buy-now cell says which one it replaces ("thay cho").
// 7. Plain language: internal terms (GATE 0, hop, MISS, bait, spec, VCX, shopid/itemid, wallet index #29, PARTIAL/COMPLETE).
const CODE_IN_PARENS = /\(([A-Z0-9][A-Z0-9-]{4,})\)/g;
const isCode = (t) => /\d/.test(t) && /[A-Z].*[A-Z]/.test(t);
const JARGON_G = /GATE\s*0|\bhops?\b|\bMISS\b|\bbait\b|\bspec\b|\bVCX\b|vcx:|shopid|itemid|(^|[\s(,])#\d{1,3}\b|\bPARTIAL\b|\bCOMPLETE\b/gi;
function docChecks(md, lines) {
  const bad = [];
  const strip = (l) => l.replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ');
  const codes = new Set([...String(md).matchAll(CODE_IN_PARENS)].map((m) => m[1]).filter(isCode));
  const pctCodes = new Set([...String(md).matchAll(/Giảm\s+\d+(?:[.,]\d+)?%\s*tối đa[^()]{0,40}\(([A-Z0-9][A-Z0-9-]{4,})\)/g)].map((m) => m[1]));
  lines.forEach((raw, i) => {
    if (/^\s*```/.test(raw)) return;
    const l = strip(raw).replace(/\*\*|__|`/g, '');
    const noParen = l.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
    for (const c of codes) if (new RegExp(`(?<![\\w-])${c}(?![\\w-])`).test(noParen)) bad.push(`line ${i + 1}: voucher code ${c} written bare - name it Shopee-style with the code in ( ) (V3)`);
    if (!/^\s*#{1,6}\s/.test(l)) for (const t of new Set([...l.matchAll(JARGON_G)].map((m) => m[0].trim())))
      bad.push(`line ${i + 1}: internal term "${t}" - write it in plain words for the buyer`);
  });
  // V8 (rule 2026-10-26): the cap phrase is needed ONCE per % voucher, in the "Khuyến nghị" section only.
  const recStart = lines.findIndex((l) => /^\s*#{1,6}\s*(Khuyến nghị|Recommendation)/i.test(l));
  let recEnd = lines.length;
  if (recStart >= 0) for (let k = recStart + 1; k < lines.length; k++) if (/^\s*#{1,6}\s/.test(lines[k])) { recEnd = k; break; }
  const rec = recStart >= 0 ? lines.slice(recStart, recEnd).join('\n') : '';
  for (const c of pctCodes) {
    const ok = [...rec.matchAll(new RegExp(`\\(${c}\\)`, 'g'))].some((m) => {
      const after = rec.slice(m.index + m[0].length, m.index + m[0].length + 240).split(/\n|Giảm\s+\d|\*\*Giảm/)[0];
      return /chạm mức giảm tối đa|cap binds/i.test(after);
    });
    if (!ok) bad.push(`voucher ${c}: name it once in "Khuyến nghị" followed by "chạm mức giảm tối đa từ đơn <cap/pct>" (V8)`);
  }
  return bad;
}

const MAX_BEST = 3; // rows in "Giá tốt nhất" (report-template.md §2)
// (rule 2026-10-29) a "Gợi ý khác" product cell leads with its short reason: "**4. Mẫu cao cấp hơn**<br>[title](link)<br>Shop: …"
const ALT_LEAD = /^\*\*\d+\.\s+[^\[*<][^*]*\*\*\s*<br\s*\/?>\s*\[/;

function lint(md) {
  const bad = [];
  const lines = String(md || '').split(/\r?\n/);
  // (rule 2026-10-29) "Giá tốt nhất" / "Best prices" rows sorted by min(App, Web) total, cheapest first
  {
    let inBest = false, nowIdx = -1, prev = null, prevName = '', bestRows = 0;
    const bestShops = new Set();
    const num = (t) => (t ? Number(t.replace(/[.,\s]/g, '')) : NaN);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*#{1,6}\s/.test(l)) { inBest = /gi[áa] t[ốo]t nh[ấa]t|best price/i.test(l); nowIdx = -1; prev = null; continue; }
      if (!inBest || !/^\s*\|/.test(l)) continue;
      if (isSep(lines[i + 1] || '')) { nowIdx = cells(l).findIndex((h) => /gi[áa] mua ngay|buy now price/i.test(h)); continue; }
      if (isSep(l) || nowIdx < 0) continue;
      const row = cells(l), cell = (row[nowIdx] || '').replace(/\*\*|__|`/g, '');
      // (rule 2026-10-29) at most 3 rows, one shop per row - the A07s report went out with 58 rows
      bestRows++;
      if (bestRows === MAX_BEST + 1) bad.push(`line ${i + 1}: "Giá tốt nhất" has more than ${MAX_BEST} rows - keep only the ${MAX_BEST} cheapest, one shop per row`);
      const shop = ((row[0] || '').match(/Shop:\s*([^<|]+)/i) || [])[1];
      if (shop) { const s = shop.trim().toLowerCase(); if (bestShops.has(s)) bad.push(`line ${i + 1}: "Giá tốt nhất" lists shop "${shop.trim()}" twice - one shop per row`); bestShops.add(s); }
      const vals = [...cell.matchAll(/\b(?:App|Web)\s*:\s*([\d.,]+)\s*₫/gi)].map((m) => num(m[1])).filter((v) => !isNaN(v));
      if (!vals.length) continue;
      const v = Math.min(...vals), name = (row[0] || '').replace(/\*\*/g, '').slice(0, 50);
      if (prev != null && v < prev) bad.push(`line ${i + 1} "${name}": "Giá tốt nhất" not sorted - ${v.toLocaleString('vi-VN')}₫ comes after "${prevName}" at ${prev.toLocaleString('vi-VN')}₫; order rows by min(App, Web), cheapest first`);
      prev = v; prevName = name;
    }
  }
  {
    let inAlt = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*#{1,6}\s/.test(l)) { inAlt = /g[ợo]i [ýy] kh[áa]c|other suggestions/i.test(l); continue; }
      if (!inAlt || !/^\s*\|/.test(l) || isSep(l) || isSep(lines[i + 1] || '')) continue;
      const first = cells(l)[0] || '';
      if (!ALT_LEAD.test(first)) bad.push(`line ${i + 1} "${first.replace(/\*\*/g, '').slice(0, 50)}": "Gợi ý khác" product cell must start with the short reason, e.g. "**4. Mẫu cao cấp hơn**<br>[title](link)<br>Shop: …"`);
      if (/^\*\*\d+\.\s+Rẻ hơn\s*\*\*/i.test(first)) bad.push(`line ${i + 1}: "Gợi ý khác" label "Rẻ hơn" alone is misleading - write "Mẫu khác, rẻ hơn"`);
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !isSep(lines[i + 1] || '')) continue; // a header is the row right above |---|
    const head = cells(lines[i]);
    const cols = COLS.map((c) => ({ ...c, idx: head.findIndex((h) => c.head.test(h)) })).filter((c) => c.idx >= 0);
    for (let j = i + 2; cols.length && j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const row = cells(lines[j]);
      for (const c of cols)
        for (const why of c.check((row[c.idx] || '').replace(/\*\*|__|`/g, '')))
          bad.push(`line ${j + 1} "${(row[0] || '').replace(/\*\*/g, '').slice(0, 50)}": ${why}`);
      const now = cols.find((c) => c.head.source.startsWith('gi[áa] mua ngay')), later = cols.find((c) => c.head.source.startsWith('gi[áa] mua sau'));
      if (now && later) {
        const nowCodes = new Set([...(row[now.idx] || '').matchAll(CODE_IN_PARENS)].map((m) => m[1]));
        const laterCodes = [...(row[later.idx] || '').matchAll(CODE_IN_PARENS)].map((m) => m[1]).filter((c) => isCode(c) && !nowCodes.has(c));
        if (laterCodes.length && nowCodes.size && !/thay cho|replaces/i.test(row[later.idx]))
          bad.push(`line ${j + 1} "${(row[0] || '').replace(/\*\*/g, '').slice(0, 50)}": Buy-later voucher ${[...new Set(laterCodes)].join(', ')} - say which voucher it replaces ("thay cho <voucher hôm nay> (CODE)") (V10)`);
      }
    }
  }
  return bad.concat(docChecks(md, lines));
}

if (require.main === module) {
  const bad = lint(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(bad.length ? 'FAIL - "Giá mua ngay" needs App first, Web second; "Giá mua sau" needs a wait verdict, a [bắt đầu - kết thúc - Số lượng: N] after every voucher, no "Lịch sử: …" line (use <br>, never | inside a cell); no bare codes, cap binding point for % vouchers, "thay cho" for later vouchers, no internal terms:\n' + bad.join('\n') : 'OK');
  process.exit(bad.length ? 1 : 0);
}

module.exports = { lint };
