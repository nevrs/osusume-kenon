// 話題の判定（tp1・tp2。DESIGN.md D23）の当たり方を、自作の例文（tools/eval/topics.json・topics-hold.json）で集計する。
// node tools/topic_stats.js <group-probe.js の結果（window.__R を保存した JSON）> [版（既定 tp2）] [例文のファイル（既定 tools/eval/topics.json）]
// 暮らし・趣味・その他は、拡張と同じく 1 つにまとめても数える（SHZ_TOPIC_MERGE。research/topic-record.md）
// 当たり: 答えが expect（amb なら alt も可）と同じ。回ごとと、2 回とも当たった例文の数。外れた例文は、答えを並べて出す
const fs = require("fs"), path = require("path");
const [file, v = "tp2", evalFile = path.join(__dirname, "eval", "topics.json")] = process.argv.slice(2);
const R = JSON.parse(fs.readFileSync(file, "utf8")).filter((r) => r.v === v);
const posts = JSON.parse(fs.readFileSync(evalFile, "utf8")).posts;
const MERGE = { hobby: "life", other: "life" };
const merged = process.env.MERGE === "1"; // MERGE=1 で、まとめて数える
const m = (t) => (merged ? MERGE[t] || t : t);
const ok = (p, t) => m(t) === m(p.expect) || (p.amb && m(t) === m(p.alt));
const runs = [...new Set(R.map((r) => r.run))].sort();
for (const run of runs) {
  const rs = R.filter((r) => r.run === run);
  const hit = posts.filter((p) => ok(p, rs.find((r) => r.id === p.id)?.topic)).length;
  const errs = rs.filter((r) => r.error).length;
  console.log(`回 ${run}: ${hit}/${posts.length} 当たり（失敗 ${errs}）`);
}
const all = posts.filter((p) => runs.every((run) => ok(p, R.find((r) => r.run === run && r.id === p.id)?.topic)));
console.log(`すべての回で当たり: ${all.length}/${posts.length}`);
const ms = R.filter((r) => !r.error).map((r) => r.ms).sort((a, b) => a - b);
if (ms.length) console.log(`1 件の時間: 中央 ${ms[Math.floor(ms.length / 2)]} ms・最大 ${ms[ms.length - 1]} ms`);
for (const p of posts) {
  const ans = runs.map((run) => R.find((r) => r.run === run && r.id === p.id)).map((r) => (r ? r.topic || "失敗" : "-"));
  if (ans.some((t) => !ok(p, t))) console.log(`  ${p.id} 正解 ${p.expect}${p.amb ? `/${p.alt}` : ""} → ${ans.join(", ")}  ${p.text}`);
}
