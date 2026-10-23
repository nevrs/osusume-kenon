// group-probe.js の結果を、tools/eval/groups.json の期待値と突き合わせる（DESIGN.md D15）。
// node tools/group_stats.js <結果の JSON（window.__R）> [新しい問いの版。既定 group1] [例文の JSON。既定 tools/eval/groups.json]
// 新しい問い（group1）: 問いごとに、当てた数・見落とし・言いすぎ（過検出）を出す。2 回の答えが割れた数も出す。
// 今の問い（old）: 怒り≧70・敵意≧70 を「強い」としたとき、グループごとに何本が強いと数えられたかを出す（比べるため）
const fs = require("fs"), path = require("path");
const posts = JSON.parse(fs.readFileSync(process.argv[4] || path.join(__dirname, "eval", "groups.json"), "utf8")).posts;
const R = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const byId = Object.fromEntries(posts.map((p) => [p.id, p]));
const NEW = process.argv[3] || "group1";
const Q = ["lump", "contempt", "exclusion", ...(NEW.startsWith("group") ? ["mobilize"] : [])]; // ev1・sep1 は動員を聞かない
const groups = [...new Set(posts.map((p) => p.group))];

const errors = R.filter((r) => r.error);
console.log(`結果 ${R.length} 件、失敗 ${errors.length} 件`);

// group1: 2 回のうち 1 回でも true なら true（多数決は 2 回だと決まらないので、「どちらか」と「両方」を並べる）
const g = R.filter((r) => r.v === NEW && !r.error);
const ans = {};
for (const r of g) for (const q of Q) ((ans[r.id] ??= {})[q] ??= []).push(r[q]);
console.log(`\n## ${NEW}（新しい問い）: 両方 true を true とする / どちらか true を true とする`);
for (const q of Q) {
  for (const mode of ["both", "any"]) {
    let tp = 0, fn = 0, fp = 0, tn = 0, split = 0;
    const misses = [], over = [];
    for (const p of posts) {
      if (p.amb || !ans[p.id]) continue;
      const a = ans[p.id][q];
      if (new Set(a).size > 1) split++;
      const got = mode === "both" ? a.every(Boolean) : a.some(Boolean);
      if (p[q] && got) tp++; else if (p[q]) { fn++; misses.push(p.id); } else if (got) { fp++; over.push(p.id); } else tn++;
    }
    console.log(`${q.padEnd(9)} ${mode.padEnd(4)} 当てた ${tp}/${tp + fn}  言いすぎ ${fp}/${fp + tn}  割れた ${split}  見落とし ${misses.join(",") || "-"}  言いすぎ ${over.join(",") || "-"}`);
  }
}
console.log("\n判断が割れうる例（amb）の答え:");
for (const p of posts.filter((x) => x.amb)) console.log(` ${p.id} ${JSON.stringify(ans[p.id])}`);

// old: グループごとに「強い」と数えた本数（2 回の平均点で）
const o = R.filter((r) => r.v === "old" && !r.error);
const avg = {};
for (const r of o) { const x = (avg[r.id] ??= { a: 0, h: 0, n: 0 }); x.a += r.anger; x.h += r.hostility; x.n++; }
console.log("\n## old（今の問い）: グループごとに、怒り≧70・敵意≧70 と数えた本数（2 回の平均）");
for (const gr of groups) {
  const ids = posts.filter((p) => p.group === gr && !p.amb && avg[p.id]).map((p) => p.id); // 判断が割れうる例は、新しい問いと同じく外す
  const a = ids.filter((id) => avg[id].a / avg[id].n >= 70).length, h = ids.filter((id) => avg[id].h / avg[id].n >= 70).length;
  console.log(` ${gr.padEnd(10)} ${String(ids.length).padStart(2)} 本  怒り≧70: ${a}  敵意≧70: ${h}`);
}
const ms = (v) => { const xs = R.filter((r) => r.v === v && !r.error).map((r) => r.ms); return xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length / 1000).toFixed(2) : "-"; };
console.log(`\n1 回の平均秒数: old ${ms("old")}  ${NEW} ${ms(NEW)}`);
