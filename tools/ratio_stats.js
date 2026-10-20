// 形の手がかり（DESIGN.md D6-1）の分布を出す。node tools/ratio_stats.js [fixture]
const path = process.argv[2] || `${__dirname}/../test/fixtures/search-ratios-2026-10-20.json`;
const { rows } = require(path);
const q = (a, f) => a[Math.min(a.length - 1, Math.floor(f * a.length))];
const fmt = (x) => x.toFixed(3);
console.log("検索語 | 件数 | 返信>いいね | 返信÷いいね≧0.3 | 返信÷いいね 中央値 / 90% | リポスト÷いいね 中央値（いいね20以上）");
const byCat = {};
for (const [key, posts] of Object.entries(rows).sort()) {
  const rl = posts.map(([r, , l]) => r / Math.max(l, 1)).sort((a, b) => a - b);
  const rp = posts.filter(([, , l]) => l >= 20).map(([, p, l]) => p / l).sort((a, b) => a - b);
  const over = posts.filter(([r, , l]) => r > l).length;
  const hi = rl.filter((x) => x >= 0.3).length;
  console.log(`${key} | ${posts.length} | ${over} | ${hi} | ${fmt(q(rl, 0.5))} / ${fmt(q(rl, 0.9))} | ${fmt(q(rp, 0.5))}`);
  const cat = key.split(":")[0];
  byCat[cat] ??= { n: 0, over: 0, hi: 0 };
  byCat[cat].n += posts.length;
  byCat[cat].over += over;
  byCat[cat].hi += hi;
}
console.log("\n分類 | 件数 | 返信>いいね | 返信÷いいね≧0.3");
for (const [cat, s] of Object.entries(byCat)) console.log(`${cat} | ${s.n} | ${s.over} | ${s.hi}`);
