// 怒りで反応を集める作り（rb1・rbs。DESIGN.md D26）の当たり方を、自作の例文（tools/eval/ragebait*.json）で集計する。
// node tools/ragebait_stats.js <group-probe.js の結果（window.__R を保存した JSON）> [例文のファイル（既定 tools/eval/ragebait.json）]
// rb1 は手口ごとの当たり方と、手口の組み合わせ方（RULES）ごとの当たり方。rbs は点の線引きごと。外れた例文は答えを並べて出す
const fs = require("fs"), path = require("path");
const [file, evalFile = path.join(__dirname, "eval", "ragebait.json")] = process.argv.slice(2);
const R = JSON.parse(fs.readFileSync(file, "utf8"));
const posts = JSON.parse(fs.readFileSync(evalFile, "utf8")).posts;
const runs = [...new Set(R.map((r) => r.run))].sort();
const get = (v, run, id) => R.find((r) => r.v === v && r.run === run && r.id === id);
const TECH = { s: "story", b: "blame", p: "bait", e: "extreme" };
const pct = (a, b) => `${a}/${b}`;

// 手口の組み合わせ方。o は rb1 の答え（story・blame・bait・extreme の真偽）
const RULES = {
  "どれか 1 つ": (o) => o.story || o.blame || o.bait || o.extreme,
  "2 つ以上": (o) => [o.story, o.blame, o.bait, o.extreme].filter(Boolean).length >= 2,
  "矛先か誘い": (o) => o.blame || o.bait,
  "（体験談か決めつけ）かつ（矛先か誘い）": (o) => (o.story || o.extreme) && (o.blame || o.bait),
  "矛先・誘い・決めつけのどれか": (o) => o.blame || o.bait || o.extreme,
};
const score = (pred) => { // pred(post, run) → 真偽。回ごとの当たり・見逃し・誤り
  const out = [];
  for (const run of runs) {
    let tp = 0, fn = 0, fp = 0, tn = 0;
    for (const p of posts) {
      const y = pred(p, run);
      if (y === null) continue;
      if (p.expect === 1) y ? tp++ : fn++; else y ? fp++ : tn++;
    }
    out.push(`回${run}: 拾えた ${pct(tp, tp + fn)}・誤って付けた ${pct(fp, fp + tn)}`);
  }
  return out.join("  ");
};

if (R.some((r) => r.v === "rb1")) {
  console.log("## rb1（手口を抜き出す）");
  for (const [k, name] of Object.entries(TECH)) { // 人が付けた手口と、AI の答え
    for (const run of runs) {
      let a = 0, n = 0, extra = 0, neg = 0;
      for (const p of posts) {
        const r = get("rb1", run, p.id);
        if (!r || r.error) continue;
        if (p.tech.includes(k)) { n++; if (r[name]) a++; } else { neg++; if (r[name]) extra++; }
      }
      console.log(`  ${name} 回${run}: 人が付けた ${n} 件のうち AI も ${a}・人が付けていない ${neg} 件のうち AI が付けた ${extra}`);
    }
  }
  for (const [name, f] of Object.entries(RULES)) console.log(`  [${name}] ${score((p, run) => { const r = get("rb1", run, p.id); return !r || r.error ? null : !!f(r); })}`);
  const errs = R.filter((r) => r.v === "rb1" && r.error).length;
  const ms = R.filter((r) => r.v === "rb1" && !r.error).map((r) => r.ms).sort((a, b) => a - b);
  console.log(`  失敗 ${errs}・1 件の時間 中央 ${ms[Math.floor(ms.length / 2)]} ms・最大 ${ms[ms.length - 1]} ms`);
  const rule = RULES[process.env.RULE || "（体験談か決めつけ）かつ（矛先か誘い）"];
  console.log(`  外れた例文（${process.env.RULE || "（体験談か決めつけ）かつ（矛先か誘い）"}）:`);
  for (const p of posts) {
    const rs = runs.map((run) => get("rb1", run, p.id));
    if (rs.every((r) => r && !r.error && !!rule(r) === (p.expect === 1))) continue;
    const show = (r) => (!r ? "-" : r.error ? "失敗" : Object.entries(TECH).filter(([, n]) => r[n]).map(([k]) => k).join("") || "なし");
    console.log(`    ${p.id} 正解 ${p.expect}（人 ${p.tech || "なし"}）→ ${rs.map(show).join(", ")}  ${JSON.stringify(rs[0]?.ev)}  ${p.text}`);
  }
}

for (const v of ["rbs", "rbs2"]) {
  if (!R.some((r) => r.v === v)) continue;
  console.log(`## ${v}（1 つの点${v === "rbs2" ? "と、いちばん目立つ手口" : ""}）`);
  for (const th of [30, 40, 50, 60, 70, 80]) console.log(`  ${th} 以上: ${score((p, run) => { const r = get(v, run, p.id); return !r || r.error ? null : r.rage >= th; })}`);
  if (v === "rbs2") { // 手口: 怒らせる作りの例文で、人が付けた手口のどれかを選んだか。そうでない例文で none を選んだか
    for (const run of runs) {
      let a = 0, n = 0, none = 0, m = 0;
      for (const p of posts) {
        const r = get(v, run, p.id);
        if (!r || r.error) continue;
        if (p.expect === 1) { n++; if (Object.entries(TECH).some(([k, name]) => p.tech.includes(k) && r.kind === name)) a++; } else { m++; if (r.kind === "none") none++; }
      }
      console.log(`  手口 回${run}: 怒らせる作り ${n} 件のうち人の手口と合う ${a}・そうでない ${m} 件のうち none ${none}`);
    }
  }
  const errs = R.filter((r) => r.v === v && r.error).length;
  const ms = R.filter((r) => r.v === v && !r.error).map((r) => r.ms).sort((a, b) => a - b);
  console.log(`  失敗 ${errs}・1 件の時間 中央 ${ms[Math.floor(ms.length / 2)]} ms・最大 ${ms[ms.length - 1]} ms`);
  console.log("  点（回ごと）:");
  for (const p of posts) console.log(`    ${p.id} 正解 ${p.expect}（人 ${p.tech || "なし"}）→ ${runs.map((run) => { const r = get(v, run, p.id); return r ? (r.error ? "失敗" : `${r.rage}${r.kind ? ` ${r.kind}` : ""}`) : "-"; }).join(", ")}`);
}
