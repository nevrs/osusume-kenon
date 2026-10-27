// group-probe.js の ev1 と tg1（向けた相手を選ばせる）を、例文の期待値と突き合わせる（2026-10-26）。
// node tools/target_stats.js <結果の JSON（window.__R）>
// 例文は tools/eval/targets.json（id に "t" を付けて流したもの）と tools/eval/groups.json。2 回とも当てはまると答えたものを当てはまるとする（結果 4・5 と同じ）。
// 「ひとまとめの見下し」は拡張と同じく lump と contempt の両方（DESIGN.md D18）
const fs = require("fs"), path = require("path");
const load = (f, pre) => JSON.parse(fs.readFileSync(path.join(__dirname, "eval", f), "utf8")).posts.map((p) => ({ ...p, id: pre + p.id, set: f }));
const posts = [...load("targets.json", "t"), ...load("groups.json", "")].filter((p) => !p.amb);
const R = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
console.log(`結果 ${R.length} 件、失敗 ${R.filter((r) => r.error).length} 件`);
const Q = { gc: (o) => o.lump && o.contempt, contempt: (o) => o.contempt, exclusion: (o) => o.exclusion };
const NAME = { gc: "ひとまとめの見下し", contempt: "見下し", exclusion: "排除" };
for (const v of [...new Set(R.map((r) => r.v))]) {
  const ans = {};
  for (const r of R.filter((x) => x.v === v && !x.error)) (ans[r.id] ??= []).push(r);
  console.log(`\n## ${v}`);
  for (const set of ["targets.json", "groups.json"]) {
    const ps = posts.filter((p) => p.set === set && ans[p.id]);
    const cells = Object.entries(Q).map(([q, f]) => {
      let tp = 0, pos = 0, fp = 0, neg = 0;
      const over = [];
      for (const p of ps) {
        const want = f(p), got = ans[p.id].every((r) => f(r));
        if (want) { pos++; if (got) tp++; } else { neg++; if (got) { fp++; over.push(p.id); } }
      }
      return `${NAME[q]} 当てた ${tp}/${pos} 言いすぎ ${fp}/${neg}${over.length ? `（${over.join(",")}）` : ""}`;
    });
    console.log(` ${set}: ${cells.join(" / ")}`);
  }
  // 人でない相手・自分・相手なしの例文で、どれか 1 つでも印が付いた数
  const nonHuman = posts.filter((p) => p.set === "targets.json" && ["self", "thing", "none"].includes(p.target) && ans[p.id]);
  const hit = nonHuman.filter((p) => ans[p.id].every((r) => r.contempt || r.lump || r.exclusion));
  console.log(` 人に向けていない例文で印: ${hit.length}/${nonHuman.length}（${hit.map((p) => p.id).join(",") || "-"}）`);
  const tgt = posts.filter((p) => p.target && ans[p.id] && ans[p.id][0].target !== undefined);
  if (tgt.length) {
    const ok = tgt.filter((p) => ans[p.id].every((r) => r.target === p.target)).length;
    console.log(` 向けた相手が 2 回とも期待どおり: ${ok}/${tgt.length}`);
  }
  const xs = R.filter((r) => r.v === v && !r.error).map((r) => r.ms);
  console.log(` 1 回の平均秒数: ${(xs.reduce((s, x) => s + x, 0) / xs.length / 1000).toFixed(2)}`);
}
