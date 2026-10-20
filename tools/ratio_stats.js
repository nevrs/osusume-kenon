// 形の手がかり（DESIGN.md D6-1）の分布を出す。node tools/ratio_stats.js [fixture]
const { resolve } = require("node:path");
const path = resolve(process.argv[2] || `${__dirname}/../test/fixtures/search-ratios-2026-10-20.json`);
const { rows } = require(path);

// 分位点（線形補間。0.5 なら偶数件で真ん中 2 つの平均）
const q = (a, f) => {
  const i = f * (a.length - 1), lo = Math.floor(i);
  return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo);
};
const fmt = (x) => x.toFixed(3);
const ratio = ([r, , l]) => r / Math.max(l, 1);
const all = Object.entries(rows).sort();

console.log("検索語 | 件数 | 返信>いいね | 返信÷いいね≧0.3 | 返信÷いいね 中央値 / 90% | リポスト÷いいね 中央値（いいね20以上）");
for (const [key, posts] of all) {
  const rl = posts.map(ratio).sort((a, b) => a - b);
  const rp = posts.filter(([, , l]) => l >= 20).map(([, p, l]) => p / l).sort((a, b) => a - b);
  console.log(`${key} | ${posts.length} | ${posts.filter(([r, , l]) => r > l).length} | ${rl.filter((x) => x >= 0.3).length} | ${fmt(q(rl, 0.5))} / ${fmt(q(rl, 0.9))} | ${fmt(q(rp, 0.5))}`);
}

console.log("\n分類 | 件数 | 返信>いいね | 返信÷いいね≧0.3 | ≧0.1 | ≧0.03");
for (const cat of [...new Set(all.map(([k]) => k.split(":")[0]))]) {
  const posts = all.filter(([k]) => k.startsWith(cat + ":")).flatMap(([, p]) => p);
  const rl = posts.map(ratio);
  const n = (t) => rl.filter((x) => x >= t).length;
  console.log(`${cat} | ${posts.length} | ${posts.filter(([r, , l]) => r > l).length} | ${n(0.3)} | ${n(0.1)} | ${n(0.03)}`);
}

// 同じ [返信, リポスト, いいね] が別の語に出たもの（同じ投稿の可能性。同じ語の中は投稿 ID で重複を除いて集めた）
const seen = new Map();
for (const [k, p] of all) for (const t of p) seen.set(t.join(","), new Set([...(seen.get(t.join(",")) || []), k]));
const dup = [...seen].filter(([, ks]) => ks.size > 1);
console.log(`\n別の語に同じ数で出たもの: ${dup.length} 件`, dup.map(([t, ks]) => `[${t}]（${[...ks].join("・")}）`).join(" "));
