// 組み込み AI の問いの立て方 A・B・C の比較を集計する。
// node tools/variants_stats.js [attention-vaccine のフォルダ]（既定は ../attention-vaccine。例文のラベルをそこから読む）
const fs = require("node:fs");
const { resolve } = require("node:path");
const V = resolve(process.argv[2] || `${__dirname}/../../attention-vaccine`, "tools/eval");
const data = require("../research/data/builtin-ai-variants-2026-10-20.json");
const extra = require("./eval/flame-extra.json");
const cases = JSON.parse(fs.readFileSync(`${V}/cases.json`, "utf8"));
const crit = JSON.parse(fs.readFileSync(`${V}/critique.json`, "utf8"));

const meta = {};
for (const c of cases.filter((c) => c.expect.flame)) meta[c.id] = { set: c.expect.flame === "hit" ? "挑発（vaccine）" : "挑発でない（vaccine）" };
for (const c of crit.legit.filter((c) => c.id.startsWith("L"))) meta[c.id] = { set: "告発・批判", tone: c.tags.tone, src: c.tags.src };
for (const c of extra.hit) meta[c.id] = { set: "挑発（追加）" };
for (const c of extra.pair) meta[c.id] = { set: "左右の組（追加）" };

const col = Object.fromEntries(data.columns.map((c, i) => [c, i]));
const rows = data.rows.map((r) => ({ id: r[0], ...meta[r[0]], get: (c) => r[col[c]] }));
const groups = {
  "挑発（vaccine＋追加）": (r) => r.set.startsWith("挑発（"),
  "挑発でない（vaccine）": (r) => r.set === "挑発でない（vaccine）",
  "告発・批判 怒りの口調": (r) => r.set === "告発・批判" && r.tone === "angry",
  "告発・批判 落ち着いた口調": (r) => r.set === "告発・批判" && r.tone === "calm",
  "告発・批判 本人の体験": (r) => r.set === "告発・批判" && r.src === "self",
  "左右の組（追加）": (r) => r.set === "左右の組（追加）",
};
// 「部品の規則」: max(集団をけなす, 反応を誘う) ≥ 70 かつ 具体的な批判 < 50 かつ 本人の訴え < 50
const rule = (v) => (r) => Math.max(r.get(`${v}_group`), r.get(`${v}_bait`)) >= 70 && r.get(`${v}_specific`) < 50 && r.get(`${v}_self`) < 50;
const judges = { A: (r) => r.get("A_flame") >= 70, B: (r) => r.get("B_flame") >= 70, C: (r) => r.get("C_flame") >= 70, "B＋規則": rule("B"), "C＋規則": rule("C") };

console.log(`グループ | 本数 | ${Object.keys(judges).join(" | ")}（印が付いた本数、基準 70）`);
for (const [g, f] of Object.entries(groups)) {
  const rs = rows.filter(f);
  console.log(`${g} | ${rs.length} | ${Object.values(judges).map((j) => rs.filter(j).length).join(" | ")}`);
}
