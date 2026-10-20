// 返信の下書きの判定（DESIGN.md D7）を集計する。node tools/drafts_stats.js
const data = require("../research/data/drafts-2026-10-20.json");
const ex = require("./eval/drafts.json");
const kindOf = {};
for (const [k, arr] of Object.entries(ex)) if (Array.isArray(arr)) for (const x of arr) kindOf[x.id] = k;
const col = Object.fromEntries(data.columns.map((c, i) => [c, i]));
console.log("種類 | 本数 | single ≧70 | split ≧70 | split ≧50");
for (const k of ["attack", "rebut", "question", "agree", "joke", "angry_legit"]) {
  const rs = data.rows.filter((r) => kindOf[r[0]] === k);
  const n = (c, t) => rs.filter((r) => r[col[c]] >= t).length;
  console.log(`${k} | ${rs.length} | ${n("single_attack", 70)} | ${n("split_attack", 70)} | ${n("split_attack", 50)}`);
}
