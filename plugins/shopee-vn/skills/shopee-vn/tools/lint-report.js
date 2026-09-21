#!/usr/bin/env node
// shopee-vn report linter, shipped with the skill so it works on any machine. Checks, per table column:
// 1. "Giá mua ngay" / "Buy now price": an App line first and a Web line second (rule 2026-09-17).
// 2. "Giá mua sau" / "Buy later price": a price-history verdict, "Lịch sử: …" (rule 2026-09-21) -
//    a bare "—" no longer says whether waiting was weighed against the variant's logged low.
// Usage: node tools/lint-report.js <draft-report.md>   -> prints OK (exit 0) or the bad rows (exit 1)
const fs = require('fs');

const COLS = [
  {
    head: /gi[áa] mua ngay|buy now price/i,
    check: (cell) => {
      const a = cell.search(/\bApp\b/i), w = cell.search(/\bWeb\b/i);
      return a < 0 ? 'no App line' : w < 0 ? 'no Web line' : a > w ? 'Web before App' : null;
    },
  },
  {
    head: /gi[áa] mua sau|buy later price/i,
    check: (cell) => (/l[ịi]ch s[ửu]|price history/i.test(cell) ? null : 'no price-history verdict in Buy-later cell (write "Lịch sử: …")'),
  },
];
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isSep = (l) => /^\s*\|/.test(l) && cells(l).every((c) => /^:?-{2,}:?$/.test(c));

function lint(md) {
  const bad = [];
  const lines = String(md || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !isSep(lines[i + 1] || '')) continue; // a header is the row right above |---|
    const head = cells(lines[i]);
    const cols = COLS.map((c) => ({ ...c, idx: head.findIndex((h) => c.head.test(h)) })).filter((c) => c.idx >= 0);
    for (let j = i + 2; cols.length && j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const row = cells(lines[j]);
      for (const c of cols) {
        const why = c.check((row[c.idx] || '').replace(/\*\*|__|`/g, ''));
        if (why) bad.push(`line ${j + 1} "${(row[0] || '').replace(/\*\*/g, '').slice(0, 50)}": ${why}`);
      }
    }
  }
  return bad;
}

if (require.main === module) {
  const bad = lint(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(bad.length ? 'FAIL - "Giá mua ngay" needs App first, Web second; "Giá mua sau" needs a "Lịch sử: …" verdict (use <br>, never | inside a cell):\n' + bad.join('\n') : 'OK');
  process.exit(bad.length ? 1 : 0);
}

module.exports = { lint };
