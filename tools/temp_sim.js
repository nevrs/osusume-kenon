// タイムラインの「温度」の数え方を比べる（2026-10-26。DESIGN.md D20）。
// node tools/temp_sim.js <結果の JSON（group-probe.js の window.__R）>...
// 版 ev1 の答えを土台に、同じ回の tg1（向けた相手）と old（怒り a・敵意 h の点）の答えがあれば重ねる（組み合わせの数え方に使う）
// 例文（tools/eval/targets.json は id に "t" を付けて流したもの、tools/eval/groups.json）の期待値から、投稿ごとの正解の段を決める:
//   排除 3・ひとまとめの見下し（lump と contempt）2・見下しだけ 1・それ以外 0（人でないものへの悪口・自虐・愚痴は 0）
// 例文を混ぜて架空のタイムラインを作り（普通の投稿・外れやすい投稿・人に向けた敵意の割合を変える）、
// 数え方ごとに、測った温度と正解の温度の並びの一致（順位相関）と、外れやすい投稿の多さに引っぱられる度合いを出す。
// 各投稿の AI の答えは、流した回のうち 1 回を無作為に選ぶ（拡張は 1 回しか聞かない）。「聞き直し」は 2 回の答えを使う
const fs = require("fs"), path = require("path");
const load = (f, pre) => JSON.parse(fs.readFileSync(path.join(__dirname, "eval", f), "utf8")).posts.map((p) => ({ ...p, id: pre + p.id, set: f }));
const posts = [...load("targets.json", "t"), ...load("groups.json", "")].filter((p) => !p.amb);
const R = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8"))).filter((r) => !r.error);
const V = "ev1";
const extra = {}; // id → run → {t, h, a}
for (const r of R.filter((x) => x.v === "tg1" || x.v === "old")) Object.assign(((extra[r.id] ??= {})[r.run] ??= {}), r.v === "tg1" ? { t: r.target } : { h: r.hostility, a: r.anger });
const runs = {};
for (const r of R.filter((x) => x.v === V)) (runs[r.id] ??= []).push({ g: !!r.lump, c: !!r.contempt, x: !!r.exclusion, ...extra[r.id]?.[r.run] });
const HAS_T = R.some((r) => r.v === "tg1"), HAS_H = R.some((r) => r.v === "old");
const level = (o) => (o.exclusion || o.x ? 3 : (o.lump || o.g) && (o.contempt || o.c) ? 2 : o.contempt || o.c ? 1 : 0);
for (const p of posts) p.L = level(p);
const usable = posts.filter((p) => runs[p.id]?.length);

// 外れやすい投稿 = 正解は 0 だが、人でないものへの悪口・自虐・汚い言葉・下品な話（targets.json の self・thing・fiction・none・crude と groups.json の hard）
const FP_PRONE = new Set(["self", "thing", "fiction", "none", "crude", "hard"]);
const pools = {
  calm: usable.filter((p) => p.L === 0 && !FP_PRONE.has(p.group)),
  prone: usable.filter((p) => p.L === 0 && FP_PRONE.has(p.group)),
  hot: usable.filter((p) => p.L > 0),
};

// 数え方。o = 1 回分の答え {g, c, x}、two = 2 回分（聞き直しに使う）
const lv = (o) => (o.x ? 3 : o.g && o.c ? 2 : o.c ? 1 : 0);
const SCHEMES = {
  "どれか（今の割合）": (o) => (o.c || o.x ? 1 : 0),
  "段 1/2/3": (o) => lv(o),
  "重み 1/3/5": (o) => [0, 1, 3, 5][lv(o)],
  "重み 0.5/3/5": (o) => [0, 0.5, 3, 5][lv(o)],
  "重み 0/3/5（見下しだけは数えない）": (o) => [0, 0, 3, 5][lv(o)],
  "重み 0/1/1（ひとまとめの見下しか排除）": (o) => [0, 0, 1, 1][lv(o)],
};
// 組み合わせ: 「見下しだけ」の印を、ほかの要素がそろったときだけ数える（ひとまとめの見下し・排除はそのまま）
const lvIf = (o, keep) => { const l = lv(o); return l === 1 && !keep(o) ? 0 : l; };
if (HAS_H) {
  SCHEMES["敵意の点だけ（前の判定。点÷100）"] = (o) => (o.h ?? 0) / 100;
  SCHEMES["敵意≧70 の割合（前の判定）"] = (o) => ((o.h ?? 0) >= 70 ? 1 : 0);
  SCHEMES["重み 1/3/5・見下しは敵意≧70 のときだけ"] = (o) => [0, 1, 3, 5][lvIf(o, (q) => (q.h ?? 0) >= 70)];
  SCHEMES["重み 1/3/5・見下しは敵意≧50 のときだけ"] = (o) => [0, 1, 3, 5][lvIf(o, (q) => (q.h ?? 0) >= 50)];
  SCHEMES["重み 1/3/5・どの段も敵意≧50 のときだけ"] = (o) => ((o.h ?? 0) >= 50 ? [0, 1, 3, 5][lv(o)] : 0);
}
if (HAS_T) {
  SCHEMES["重み 1/3/5・見下しは相手が自分でないときだけ"] = (o) => [0, 1, 3, 5][lvIf(o, (q) => q.t !== "self")];
  SCHEMES["重み 1/3/5・見下しは相手が人のときだけ"] = (o) => [0, 1, 3, 5][lvIf(o, (q) => q.t === "person" || q.t === "people")];
}
if (HAS_H && HAS_T) SCHEMES["重み 1/3/5・見下しは敵意≧70 かつ相手が自分でないとき"] = (o) => [0, 1, 3, 5][lvIf(o, (q) => (q.h ?? 0) >= 70 && q.t !== "self")];
// 聞き直し: 当てはまったときだけもう 1 回聞き、2 回とも当てはまった段だけ数える（2 回の段の小さいほう）
const RECHECK = {
  "聞き直し・重み 1/3/5": (o1, o2) => [0, 1, 3, 5][Math.min(lv(o1), lv(o2))],
  "聞き直し・重み 0.5/3/5": (o1, o2) => [0, 0.5, 3, 5][Math.min(lv(o1), lv(o2))],
};
const TRUTHS = {
  "段の平均": (p) => p.L,
  "人に向けた敵意の割合": (p) => (p.L > 0 ? 1 : 0),
  "重い段を重く（1/3/5）": (p) => [0, 1, 3, 5][p.L],
};

let seed = 20261026;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const N_POSTS = 200, N_TL = 3000;
const rank = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const corr = (a, b) => { const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };
const spearman = (a, b) => corr(rank(a), rank(b));
// 正解の温度で説明できない部分（残り）と、外れやすい投稿の割合の相関。0 に近いほど、話題の偏りに引っぱられない
const residCorr = (meas, truth, prone) => { const n = meas.length, mt = truth.reduce((s, x) => s + x, 0) / n, mm = meas.reduce((s, x) => s + x, 0) / n; let st = 0, stm = 0; for (let i = 0; i < n; i++) { st += (truth[i] - mt) ** 2; stm += (truth[i] - mt) * (meas[i] - mm); } const b = stm / st; return corr(meas.map((m, i) => m - mm - b * (truth[i] - mt)), prone); };

// 測った温度 = a + b×正解 + c×外れやすい割合 と当てはめて、外れやすい投稿が 0% → 50% に増えたときの上がり幅を、正解の「段の平均」に直す（c×0.5÷b）
const bias = (meas, truth, prone) => { const n = meas.length, m = (xs) => xs.reduce((s, x) => s + x, 0) / n; const mt = m(truth), mp = m(prone), mm = m(meas); let stt = 0, spp = 0, stp = 0, stm = 0, spm = 0; for (let i = 0; i < n; i++) { const t = truth[i] - mt, q = prone[i] - mp, y = meas[i] - mm; stt += t * t; spp += q * q; stp += t * q; stm += t * y; spm += q * y; } const d = stt * spp - stp * stp, bt = (stm * spp - spm * stp) / d, bp = (spm * stt - stm * stp) / d; return (bp * 0.5) / bt; };
const tls = [];
for (let t = 0; t < N_TL; t++) {
  const hotShare = rand() * 0.15, proneShare = rand() * 0.5; // 敵意 0〜15%、外れやすい投稿 0〜50%、残りは普通の投稿
  const items = [];
  for (let i = 0; i < N_POSTS; i++) { const u = rand(); const p = pick(u < hotShare ? pools.hot : u < hotShare + proneShare ? pools.prone : pools.calm); const rs = runs[p.id]; const k = Math.floor(rand() * rs.length); items.push({ p, o1: rs[k], o2: rs[(k + 1) % rs.length] }); }
  tls.push({ items, proneShare });
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const prone = tls.map((t) => t.proneShare);
const truthVals = Object.fromEntries(Object.entries(TRUTHS).map(([k, f]) => [k, tls.map((t) => mean(t.items.map((it) => f(it.p))))]));

console.log(`版 ${V}。例文 ${usable.length} 本（普通 ${pools.calm.length}・外れやすい ${pools.prone.length}・敵意 ${pools.hot.length}）。タイムライン ${N_TL} 本 × ${N_POSTS} 件`);
// 投稿 1 件ごとの当たり方（1 回の答え。全回の平均）
const perPost = (f) => { const by = { calm: [], prone: [], hot: [] }; for (const [k, ps] of Object.entries(pools)) for (const p of ps) by[k].push(mean(runs[p.id].map((o) => (f(o) > 0 ? 1 : 0)))); return Object.fromEntries(Object.entries(by).map(([k, xs]) => [k, mean(xs)])); };
console.log("\n数え方 | 何か数えた割合: 普通 / 外れやすい / 敵意 | 正解との順位相関: " + Object.keys(TRUTHS).join(" / ") + " | 外れやすい投稿への引っぱられ（残りとの相関。上がり幅 = 外れやすい投稿が 0→50% で、正解の段の平均にして何段ぶん上がって見えるか）");
console.log(`正解の段の平均の幅（このタイムラインの集まりで）: ${Math.min(...truthVals["段の平均"]).toFixed(3)}〜${Math.max(...truthVals["段の平均"]).toFixed(3)}`);
const rows = [];
for (const [name, f] of Object.entries(SCHEMES)) rows.push([name, tls.map((t) => mean(t.items.map((it) => f(it.o1)))), perPost(f)]);
for (const [name, f] of Object.entries(RECHECK)) rows.push([name, tls.map((t) => mean(t.items.map((it) => f(it.o1, it.o2)))), (() => { const by = {}; for (const [k, ps] of Object.entries(pools)) by[k] = mean(ps.map((p) => { const rs = runs[p.id]; return rs.length > 1 && f(rs[0], rs[1]) > 0 ? 1 : 0; })); return by; })()]);
for (const [name, meas, pp] of rows) {
  const sp = Object.values(truthVals).map((tv) => spearman(meas, tv).toFixed(3)).join(" / ");
  const rc = residCorr(meas, truthVals["段の平均"], prone).toFixed(2);
  const bs = bias(meas, truthVals["段の平均"], prone).toFixed(3);
  console.log(`${name} | ${pp.calm.toFixed(2)} / ${pp.prone.toFixed(2)} / ${pp.hot.toFixed(2)} | ${sp} | ${rc}（上がり幅 ${bs}）`);
}
