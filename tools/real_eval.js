// 書き出した実際の記録（D17）で、温度の数え方を比べる（2026-10-26。DESIGN.md D20）。結果も本文もリポに入れない（AGENTS.md）。
// node tools/real_eval.js <書き出しの JSON> <正解のファイル>
// 正解のファイル: 1 行に「番号 段 [印]」。番号は書き出しの rows の順（0 から）。段は 3 排除・2 ひとまとめの見下し・1 見下しだけ・0。
// 印 p = 外れやすい（自虐・物や作品や作中の人物への悪口・汚い言葉だけ・下品な話）、a = 判断が割れうる。書いていない番号は 段 0。
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).rows;
const lab = {};
for (const line of fs.readFileSync(process.argv[3], "utf8").split(/\r?\n/)) {
  const m = line.match(/^(\d+)\s+(\d)(?:\s+([pa]+))?/);
  if (m) lab[+m[1]] = { L: +m[2], p: (m[3] || "").includes("p"), a: (m[3] || "").includes("a") };
}
const posts = rows.map((r, i) => ({ ...r, i, ...(lab[i] || { L: 0, p: false, a: false }) })).filter((r) => r.jv);
const lv = (o) => (o.x ? 3 : o.g && o.c ? 2 : o.c ? 1 : 0);
const SCHEMES = {
  "どれか（今の割合）": (o) => (o.c || o.x ? 1 : 0),
  "段 1/2/3": (o) => lv(o),
  "重み 1/3/5": (o) => [0, 1, 3, 5][lv(o)],
  "重み 0.5/3/5": (o) => [0, 0.5, 3, 5][lv(o)],
  "重み 0/3/5": (o) => [0, 0, 3, 5][lv(o)],
  "重み 0/1/1": (o) => [0, 0, 1, 1][lv(o)],
};
const TRUTH = { "段の平均": (p) => p.L, "敵意の割合": (p) => (p.L > 0 ? 1 : 0), "重み 1/3/5": (p) => [0, 1, 3, 5][p.L] };
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const FEEDS = { "for-you": "おすすめ", following: "フォロー中" };

console.log(`判定済み ${posts.length} 件（おすすめ ${posts.filter((p) => p.feed === "for-you").length}・フォロー中 ${posts.filter((p) => p.feed === "following").length}）`);
for (const withAmb of [true, false]) {
  const ps = posts.filter((p) => withAmb || !p.a);
  console.log(`\n## ${withAmb ? "割れうるものも含める" : "割れうるものを除く"}（${ps.length} 件）`);
  // AI の段 × 正解の段
  const tab = {};
  for (const p of ps) { const k = `${p.L}→${lv(p)}`; tab[k] = (tab[k] || 0) + 1; }
  console.log("正解の段→AI の段:", Object.entries(tab).sort().map(([k, v]) => `${k}:${v}`).join("  "));
  const prone = ps.filter((p) => p.p);
  console.log(`外れやすい投稿 ${prone.length} 件のうち AI が何か付けた ${prone.filter((p) => lv(p) > 0).length} 件（見下しだけ ${prone.filter((p) => lv(p) === 1).length}・ひとまとめ ${prone.filter((p) => lv(p) === 2).length}・排除 ${prone.filter((p) => lv(p) === 3).length}）`);
  for (const f of Object.keys(FEEDS)) {
    const fp = ps.filter((p) => p.feed === f);
    console.log(` ${FEEDS[f]}: 外れやすい ${(mean(fp.map((p) => (p.p ? 1 : 0))) * 100).toFixed(1)}%  正解 段1+ ${(mean(fp.map((p) => (p.L > 0 ? 1 : 0))) * 100).toFixed(1)}%（段2+ ${(mean(fp.map((p) => (p.L >= 2 ? 1 : 0))) * 100).toFixed(1)}%）`);
  }
  // おすすめ ÷ フォロー中 の比（温度の差）。正解と、数え方ごとの測った値。ブートストラップで 90% の幅
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fy = ps.filter((p) => p.feed === "for-you"), fo = ps.filter((p) => p.feed === "following");
  const ratio = (f, a, b) => { const x = mean(a.map(f)), y = mean(b.map(f)); return y > 0 ? x / y : Infinity; };
  const boot = (f) => { const rs = []; for (let k = 0; k < 2000; k++) { const a = fy.map(() => fy[Math.floor(rand() * fy.length)]), b = fo.map(() => fo[Math.floor(rand() * fo.length)]); rs.push(ratio(f, a, b)); } rs.sort((u, v) => u - v); return [rs[100], rs[1900]]; };
  const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : "∞");
  console.log("\nおすすめ ÷ フォロー中（1 より大きいほど、おすすめが熱い。かっこは 90% の幅）");
  for (const [n, f] of Object.entries(TRUTH)) { const [lo, hi] = boot(f); console.log(` 正解・${n}: ${fmt(ratio(f, fy, fo))}（${fmt(lo)}〜${fmt(hi)}）`); }
  for (const [n, f] of Object.entries(SCHEMES)) { const [lo, hi] = boot(f); console.log(` AI・${n}: ${fmt(ratio(f, fy, fo))}（${fmt(lo)}〜${fmt(hi)}）`); }
  // 投稿ごとの当たり方: 数え方が何か数えた投稿のうち、正解が段 1 以上の割合（当たりの率）と、正解が段 1 以上の投稿のうち拾えた割合
  console.log("\n数え方 | 数えた件数 | そのうち正解が段1以上 | 段1以上の拾えた割合 | 段2以上の拾えた割合 | 測った温度と正解（段の平均）の、投稿ごとの相関");
  const corr = (a, b) => { const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
  for (const [n, f] of Object.entries(SCHEMES)) {
    const hit = ps.filter((p) => f(p) > 0);
    const pos = ps.filter((p) => p.L > 0), pos2 = ps.filter((p) => p.L >= 2);
    console.log(` ${n} | ${hit.length} | ${hit.filter((p) => p.L > 0).length}（${((hit.filter((p) => p.L > 0).length / Math.max(1, hit.length)) * 100).toFixed(0)}%） | ${pos.filter((p) => f(p) > 0).length}/${pos.length} | ${pos2.filter((p) => f(p) > 0).length}/${pos2.length} | ${corr(ps.map(f), ps.map((p) => p.L)).toFixed(3)}`);
  }
}
