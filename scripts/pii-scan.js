#!/usr/bin/env node
// Fails (exit 1) if tracked files look like they carry personal data: emails, phone numbers, card digits,
// signed voucher URLs, local user paths. Run in CI and before every push.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const SELF = path.resolve(__filename);

const RULES = [
  ['email', /[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com|example\.(com|org))[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['vn-phone', /(?<![\d.])(?:\+84|0)(?:3|5|7|8|9)\d{8}(?!\d)/],
  ['card-digits', /(?:card|thẻ|visa|master(?:card)?)\s*[*x•]{1,}\s*\d{4}/i],
  ['signed-url', /signature=[0-9a-f]{16,}/i],
  ['user-path', /[A-Z]:[\\/]Users[\\/]|\/Users\/[a-z]|\/home\/[a-z]/i],
  ['street', /\b(số nhà|hẻm|ngõ|ngách)\s+\d+/i],
];

const hits = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(f)) walk(p); continue; }
    if (p === SELF || st.size > 2e6 || /\.(png|jpe?g|gif|webp|ico|zip)$/i.test(f)) continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const [name, re] of RULES) {
        if (re.test(line)) hits.push(`${path.relative(ROOT, p)}:${i + 1} [${name}] ${line.trim().slice(0, 120)}`);
      }
    });
  }
})(ROOT);

if (hits.length) {
  console.error(`pii-scan: ${hits.length} possible personal-data hit(s):\n` + hits.join('\n'));
  process.exit(1);
}
console.log('pii-scan: OK');
