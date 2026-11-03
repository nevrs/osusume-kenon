// 怒りで反応を集める作りを、反応の形（返信÷いいね。D25 の ct）で見る（DESIGN.md D26 の A）。書き出した実際の記録（0.15.0 以降、ct・age がある記録）を使う。結果も本文もリポに入れない（AGENTS.md）。
// node tools/ragebait_shape.js <書き出しの JSON> [group-probe.js の rbs の結果（id は rows の順の番号）] [本文を並べて書き出すファイル]
// 返信がいいねに比べてどれだけ多いか（返信÷いいね）を、feed ごと・投稿からの時間ごとに並べる。古い投稿ほど数が大きいので、時間の帯で分けて比べる。
// rbs の結果を渡すと、文の点（50 以上）と形（荒れ）の重なりを出す。3 つめを渡すと、荒れの投稿と、文も形も当てはまる投稿の本文を書き出す（人が読んで当たりを確かめる用。リポの外に置く）
const fs = require("fs");
const { shzHeavy, SHZ_HEAT } = require("../x-counts.js");
const shzRowdy = (ct) => shzHeavy(ct, 1); // 荒れ = 返信がいいね以上（たたむ線のいちばん高い段。D27）
const { shzInterval, shzCompareCounts } = require("../stats-core.js");
const [exp, res, dump] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(exp, "utf8")).rows.map((r, i) => ({ ...r, i }));
const rage = {};
if (res) for (const r of JSON.parse(fs.readFileSync(res, "utf8"))) if (r.v === "rbs" && !r.error) rage[+r.id] = r.rage;
const FEEDS = { "for-you": "おすすめ", following: "フォロー中" };
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : null; };

const withCt = rows.filter((r) => r.ct && r.ct.r != null && r.ct.l != null);
console.log(`記録 ${rows.length} 件のうち、返信といいねの数がある ${withCt.length} 件（おすすめ ${withCt.filter((r) => r.feed === "for-you").length}・フォロー中 ${withCt.filter((r) => r.feed === "following").length}）`);
const ratio = (r) => (r.ct.r + 1) / (r.ct.l + 1); // 返信÷いいね（0 で割らないよう両方に 1 を足す）
const AGES = [["1 時間未満", 0, 60], ["1〜6 時間", 60, 360], ["6〜24 時間", 360, 1440], ["1 日以上", 1440, Infinity], ["時間不明", null, null]];
const inAge = (r, [, lo, hi]) => (lo === null ? typeof r.age !== "number" : typeof r.age === "number" && r.age >= lo && r.age < hi);

console.log(`\n## 返信÷いいね（中央・上位 10%・上位 1%）と、荒れ（返信 ${SHZ_HEAT.replyMin} 件以上でいいね以上）の割合`);
for (const a of AGES) {
  const line = [];
  for (const f of Object.keys(FEEDS)) {
    const fr = withCt.filter((r) => r.feed === f && inAge(r, a));
    if (!fr.length) { line.push(`${FEEDS[f]} 0 件`); continue; }
    const rs = fr.map(ratio), k = fr.filter((r) => shzRowdy(r.ct)).length;
    line.push(`${FEEDS[f]} ${fr.length} 件: ${med(rs).toFixed(3)}・${q(rs, 0.9).toFixed(3)}・${q(rs, 0.99).toFixed(3)}／荒れ ${k}（${pct(k / fr.length)}）`);
  }
  console.log(`  ${a[0]}: ${line.join("  ")}`);
}
const tally = (pred) => Object.fromEntries(Object.keys(FEEDS).map((f) => { const fr = withCt.filter((r) => r.feed === f); return [f, [fr.filter(pred).length, fr.length]]; }));
const show = (name, pred) => {
  const t = tally(pred), v = shzCompareCounts(t["for-you"][0], t["for-you"][1], t.following[0], t.following[1]);
  const ci = (f) => { const [k, n] = t[f], c = shzInterval(k, n); return `${k}/${n} = ${pct(k / n)}（${c ? `${pct(c[0])}〜${pct(c[1])}` : "-"}）`; };
  console.log(`  ${name}: おすすめ ${ci("for-you")}・フォロー中 ${ci("following")} → ${v.verdict}${v.ratio ? `・倍率 ${v.ratio.toFixed(2)}` : ""}`);
};
// 返信が多めの形: 返信がいいねの 2% 以上で、返信 10 件以上（比べる用。拡張の温度は 3%: x-counts.js の SHZ_TEMP_LINE。DESIGN.md D27）
const heavy = (r) => r.ct.r >= 10 && r.ct.r >= 0.02 * r.ct.l;
console.log("\n## おすすめとフォロー中（すべての時間）");
show("荒れ", (r) => shzRowdy(r.ct));
show("返信が多め（いいねの 2% 以上・返信 10 件以上）", heavy);
show("返信が多め（いいねの 5% 以上・返信 10 件以上）", (r) => r.ct.r >= 10 && r.ct.r >= 0.05 * r.ct.l);
show("返信 50 件以上（投稿の大きさに引きずられる。比べる用）", (r) => r.ct.r >= 50);
// 投稿の大きさ（いいねの数）が feed で違うと、それだけで差が出るので、いいねの帯ごとに分けても差が残るかを見る
console.log("\n## いいねの帯ごとの「返信が多め」");
for (const [name, lo, hi] of [["いいね 100 未満", 0, 100], ["100〜1000", 100, 1000], ["1000〜1 万", 1000, 10000], ["1 万以上", 10000, Infinity]]) {
  const t = Object.fromEntries(Object.keys(FEEDS).map((f) => { const fr = withCt.filter((r) => r.feed === f && r.ct.l >= lo && r.ct.l < hi); return [f, `${fr.filter(heavy).length}/${fr.length}`]; }));
  console.log(`  ${name}: おすすめ ${t["for-you"]}・フォロー中 ${t.following}`);
}
const hostile = (r) => r.jv && (r.c || r.x);
show("見下し・排除の印", hostile);
show("荒れ かつ 見下し・排除の印", (r) => shzRowdy(r.ct) && hostile(r));
if (res) {
  show("文の点 50 以上", (r) => rage[r.i] >= 50);
  show("返信が多め かつ 文の点 50 以上", (r) => heavy(r) && rage[r.i] >= 50);
}
if (dump) {
  const line = (r) => `${r.i}\t${r.feed}\tr${r.ct.r} l${r.ct.l} v${r.ct.v ?? "-"} age${r.age ?? "-"}\trage${rage[r.i] ?? "-"}\t${hostile(r) ? "H" : ""}\t${String(r.text).replace(/\s+/g, " ")}`;
  const hv = withCt.filter(heavy).sort((a, b) => ratio(b) - ratio(a));
  fs.writeFileSync(dump, ["# 返信が多め", ...hv.map(line)].join("\n"));
  console.log(`\n本文を ${dump} に書いた（返信が多め ${hv.length} 件）`);
}
