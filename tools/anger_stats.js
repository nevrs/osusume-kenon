// 「怒りや敵意の強さ」の測定（research/anger-record.md）を集計する。
// node tools/anger_stats.js [attention-vaccine のフォルダ]（例文のラベルをそこから読む）
const fs = require("node:fs");
const { resolve } = require("node:path");
const V = resolve(process.argv[2] || `${__dirname}/../../attention-vaccine`, "tools/eval");
const data = require("../research/data/anger-2026-10-21.json");
const ex = require("./eval/flame-extra.json");
const dr = require("./eval/drafts.json");
const cases = JSON.parse(fs.readFileSync(`${V}/cases.json`, "utf8"));
const crit = JSON.parse(fs.readFileSync(`${V}/critique.json`, "utf8"));

// 例文のグループ（記録で数えたいもの / 数えたくないもの）
//   hostile       … 人や集団への敵意・侮辱がある（数えたい）
//   angry-legit   … 怒りの口調はあるが、正当な批判・訴え（怒りとしては数えてよい。敵意としては数えない）
//   calm-critique … 落ち着いた批判・反論（数えない）
//   other         … 質問・同意・冗談・普通の投稿（数えない）
const g = {};
const neutralIds = new Set(["demo-post-1", "demo-post-3"]);
for (const c of cases.filter((c) => c.expect.flame)) g[c.id] = c.expect.flame === "hit" ? "hostile" : neutralIds.has(c.id) ? "other" : "calm-critique";
for (const c of crit.legit.filter((c) => c.id.startsWith("L"))) g[c.id] = c.tags.tone === "angry" ? "angry-legit" : "calm-critique";
for (const c of ex.hit) g[c.id] = "hostile";
for (const c of ex.pair) g[c.id] = "calm-critique";
const dmap = { attack: "hostile", rebut: "calm-critique", question: "other", agree: "other", joke: "other", angry_legit: "angry-legit" };
for (const [k, arr] of Object.entries(dr)) if (Array.isArray(arr)) for (const x of arr) g[x.id] = dmap[k];
for (let i = 1; i <= 15; i++) g[`N${String(i).padStart(2, "0")}`] = "other";

const col = Object.fromEntries(data.columns.map((c, i) => [c, i]));
const rows = data.rows.map((r) => ({ id: r[0], g: g[r[0]], get: (c) => r[col[c]] }));
const missing = rows.filter((r) => !r.g).map((r) => r.id);
if (missing.length) console.log("グループ不明:", missing.join(" "));

// 数える基準の候補
const judges = {
  "single 怒り≧70": (r) => r.get("single_anger") >= 70,
  "split 怒り≧70": (r) => r.get("split_anger") >= 70,
  "split 敵意≧70": (r) => r.get("split_hostility") >= 70,
  "split 怒り≧70 または 敵意≧70": (r) => r.get("split_anger") >= 70 || r.get("split_hostility") >= 70,
  "split 怒り≧50 または 敵意≧50": (r) => r.get("split_anger") >= 50 || r.get("split_hostility") >= 50,
};
const groups = ["hostile", "angry-legit", "calm-critique", "other"];
console.log(`グループ | 本数 | ${Object.keys(judges).join(" | ")}（数えた本数）`);
for (const grp of groups) {
  const rs = rows.filter((r) => r.g === grp);
  console.log(`${grp} | ${rs.length} | ${Object.values(judges).map((j) => rs.filter(j).length).join(" | ")}`);
}

// 左右を入れ替えた組（書き手が左 = L、右 = R。対象を入れ替えただけの文）: 左・野党を批判する側（R）が高い組の数
const lr = [["sym-flame-gov-L", "sym-flame-gov-R"], ["sym-flame-policy-L", "sym-flame-policy-R"], ["sym-flame-rl-L", "sym-flame-rl-R"],
  ["sym-flame-harsh-L", "sym-flame-harsh-R"], ["P1L", "P1R"], ["P2L", "P2R"], ["P3L", "P3R"], ["P4L", "P4R"], ["P5L", "P5R"], ["H01", "H02"], ["A06", "A07"]];
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
console.log(`\n左右の組 ${lr.length} 組 | 指標 | R が高い | R が低い | 同点 | 差の平均（R−L）`);
for (const c of ["single_anger", "split_anger", "split_hostility"]) {
  const d = lr.map(([l, r]) => byId[r].get(c) - byId[l].get(c));
  console.log(`${c} | ${d.filter((x) => x > 0).length} | ${d.filter((x) => x < 0).length} | ${d.filter((x) => x === 0).length} | ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1)}`);
}
const ms = data.ms || {};
console.log(`\n速さ（1 件の平均、ms）: ${JSON.stringify(ms)}`);
