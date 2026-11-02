// 書き出した実際の記録（D17）に、怒りで反応を集める作りの点（rbs。DESIGN.md D26）をかけた結果を、おすすめとフォロー中で比べる。結果も本文もリポに入れない（AGENTS.md）。
// node tools/ragebait_real.js <書き出しの JSON> <group-probe.js の結果（id は書き出しの rows の順の番号）> [本文を並べて書き出すファイル]
// 3 つめを渡すと、点の高い記録と、低い記録から引いた記録の本文を並べて書く（人が読んで当たりを確かめる用。リポの外に置く）
const fs = require("fs");
const { shzInterval, shzCompareCounts } = require("../stats-core.js");
const [exp, res, dump] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(exp, "utf8")).rows;
const R = JSON.parse(fs.readFileSync(res, "utf8")).filter((r) => r.v === "rbs" && !r.error);
const posts = R.map((r) => ({ ...rows[+r.id], i: +r.id, rage: r.rage }));
const FEEDS = { "for-you": "おすすめ", following: "フォロー中" };
const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`点が付いた ${posts.length} 件（失敗 ${JSON.parse(fs.readFileSync(res, "utf8")).filter((r) => r.error).length}）`);
for (const th of [50, 70]) {
  const c = {};
  for (const f of Object.keys(FEEDS)) {
    const fp = posts.filter((p) => p.feed === f), k = fp.filter((p) => p.rage >= th).length, ci = shzInterval(k, fp.length);
    c[f] = [k, fp.length];
    console.log(`  ${th} 以上 ${FEEDS[f]}: ${k}/${fp.length} = ${pct(k / fp.length)}（90% の幅 ${pct(ci[0])}〜${pct(ci[1])}）`);
  }
  const v = shzCompareCounts(c["for-you"][0], c["for-you"][1], c.following[0], c.following[1]);
  console.log(`   → 差 ${(v.diff * 100).toFixed(1)} ポイント・倍率 ${v.ratio?.toFixed(2)}・${v.verdict}`);
}
// 見下し・排除（ev1 の c・x）との重なり
const hostile = (p) => p.jv && (p.c || p.x);
const hi = posts.filter((p) => p.rage >= 50);
console.log(`50 以上 ${hi.length} 件のうち、見下し・排除の印もある ${hi.filter(hostile).length} 件。見下し・排除の印がある ${posts.filter(hostile).length} 件のうち 50 以上 ${posts.filter(hostile).filter((p) => p.rage >= 50).length} 件`);
const hist = {};
for (const p of posts) { const b = Math.floor(p.rage / 10) * 10; hist[b] = (hist[b] || 0) + 1; }
console.log("点の分布:", Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b}台 ${n}`).join("  "));
if (dump) {
  const low = posts.filter((p) => p.rage < 50);
  const pick = low.filter((_, j) => j % Math.ceil(low.length / 60) === 0); // 低い記録から 60 件ほど等間隔に
  const line = (p) => `${p.i}\t${p.rage}\t${p.feed}\t${String(p.text).replace(/\s+/g, " ")}`;
  fs.writeFileSync(dump, ["# 50 以上", ...hi.sort((a, b) => b.rage - a.rage).map(line), "", "# 50 未満から等間隔", ...pick.map(line)].join("\n"));
  console.log(`本文を ${dump} に書いた（${hi.length} + ${pick.length} 件）`);
}
