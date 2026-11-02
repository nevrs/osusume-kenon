// 判定済みの記録を数える（画面に触れない。設定画面とテストが使う）。
// 数えるのは今の問い（D15）の答え: ひとまとめの見下し（集団の言葉 g と見下し c の両方。D18）・見下し（c）・排除（x）。どれかに当てはまれば any。前の問い（怒り・敵意の点、版 group1 の答え。D16）の記録は legacy として件数だけ数える

// ブラウザでは x-counts.js・record-core.js が先に読まれていて、shzRowdy・shzWide・shzIsJudged・shzDay が使える。テスト（node）ではここで読み込む
if (typeof module !== "undefined") { const k = require("./x-counts.js"); globalThis.shzRowdy = k.shzRowdy; globalThis.shzWide = k.shzWide; const c = require("./record-core.js"); globalThis.shzIsJudged = c.shzIsJudged; globalThis.shzIsLegacy = c.shzIsLegacy; globalThis.shzDay = c.shzDay; globalThis.shzLumpHit = c.shzLumpHit; globalThis.shzAnyHit = c.shzAnyHit; }

const SHZ_MIN_N = 30; // これより少ない判定済み件数の割合は、参考にしない

const SHZ_FEEDS = ["for-you", "following"];

function shzEmptyTally() {
  return { seen: 0, judged: 0, lump: 0, contempt: 0, exclusion: 0, any: 0, legacy: 0, lv1: 0, lv2: 0, lv3: 0 };
}

// 期間 [fromTs, toTs] の記録を、feed ごとに数える。seen = 記録した件数、judged = そのうち判定済み
function shzTally(records, fromTs = 0, toTs = Infinity) {
  const out = Object.fromEntries(SHZ_FEEDS.map((f) => [f, shzEmptyTally()]));
  for (const r of Object.values(records)) {
    const t = out[r.feed];
    if (!t || !(r.ts >= fromTs && r.ts <= toTs)) continue;
    t.seen++;
    if (!shzIsJudged(r)) { if (shzIsLegacy(r)) t.legacy++; continue; }
    t.judged++;
    if (shzLumpHit(r)) t.lump++;
    if (r.c) t.contempt++;
    if (r.x) t.exclusion++;
    if (shzAnyHit(r)) t.any++;
    if (r.x) t.lv3++; else if (shzLumpHit(r)) t.lv2++; else if (r.c) t.lv1++; // 重い段だけに数える（lv1+lv2+lv3 = any）。設定画面の内訳の棒
  }
  return out;
}

// 日ごと（この端末の日付）の数え方。{ "2026-10-21": {for-you: tally, following: tally}, ... }
function shzTallyByDay(records) {
  const days = {};
  for (const r of Object.values(records)) {
    if (!SHZ_FEEDS.includes(r.feed) || typeof r.ts !== "number") continue;
    (days[shzDay(r.ts)] ??= []).push(r);
  }
  return Object.fromEntries(Object.entries(days).map(([d, rs]) => [d, shzTally(rs)]));
}

// 割合（0〜1）。判定済みが SHZ_MIN_N に満たなければ null（参考にしない）
function shzShare(count, judged) {
  return judged >= SHZ_MIN_N ? count / judged : null;
}

const SHZ_GOOD_N = 200; // 判定済みがこれ以上あれば、比べるのに「十分」とする（小さい割合の差を読むには数百件要る。D22）

// 割合の 90% の幅（Wilson）。[下, 上]。judged が 0 なら null
function shzInterval(count, judged, z = 1.645) {
  if (!judged) return null;
  const p = count / judged, z2 = z * z, den = 1 + z2 / judged;
  const mid = (p + z2 / (2 * judged)) / den, half = (z * Math.sqrt((p * (1 - p)) / judged + z2 / (4 * judged * judged))) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

// おすすめとフォロー中の「どれか」の割合を比べる（D22）。差が偶然のぶれで説明できるか（2 つの割合の z 検定、両側 90%）で、はっきりした差かを決める。
// 返す: { a, b, diff（ポイント）, ratio（a÷b。b が 0 なら null）, verdict: "need"（件数不足）| "higher" | "lower" | "unclear" }
function shzCompare(t, key = "any") {
  const A = t["for-you"], B = t.following;
  return shzCompareCounts(A[key], A.judged, B[key], B.judged);
}
// 件数 ca/na と cb/nb の割合を比べる（shzCompare の中身。D25 の目立つ投稿でも使う）。どちらかが SHZ_MIN_N 件に満たなければ need
function shzCompareCounts(ca, na, cb, nb) {
  const a = shzShare(ca, na), b = shzShare(cb, nb);
  if (a === null || b === null) return { a, b, diff: null, ratio: null, verdict: "need" };
  const p = (ca + cb) / (na + nb);
  const se = Math.sqrt(p * (1 - p) * (1 / na + 1 / nb));
  const z = se ? (a - b) / se : 0;
  const verdict = z > 1.645 ? "higher" : z < -1.645 ? "lower" : "unclear";
  return { a, b, diff: a - b, ratio: b > 0 ? a / b : null, verdict };
}

// ---- 話題の重なり（D23。フィルターバブルに気づくための目安） ----
const SHZ_TOPIC_MIN = 50; // 話題を判定した投稿が、それぞれこれ以上あるときだけ重なりを出す（少ないと、ぶれで重なりが小さく出る）
// 数えるときにまとめる話題。暮らし・趣味・その他は AI がよく取り違える（自作の例文で、外れのほとんどがこの 3 つの間。research/topic-record.md）ので、1 つにして数える。記録には AI の答えをそのまま残す
const SHZ_TOPIC_MERGE = { hobby: "life", other: "life" };

// 期間 [fromTs, toTs] の、話題（tp）を判定済みの記録を feed ごとに数える。{ "for-you": { n, by: { politics: 3, ... } }, following: {...} }
function shzTopicTally(records, fromTs = 0, toTs = Infinity) {
  const out = Object.fromEntries(SHZ_FEEDS.map((f) => [f, { n: 0, by: {} }]));
  for (const r of Object.values(records)) {
    const t = out[r.feed];
    if (!t || typeof r.tp !== "string" || !(r.ts >= fromTs && r.ts <= toTs)) continue;
    t.n++;
    const k = SHZ_TOPIC_MERGE[r.tp] || r.tp;
    t.by[k] = (t.by[k] || 0) + 1;
  }
  return out;
}

// おすすめとフォロー中の話題の重なり（0〜1）: 話題ごとの割合の小さいほうを足したもの。1 なら話題の配分が同じ、0 なら共通の話題が無い。
// 件数が少ないと、配分が同じでも重なりは小さく出る（各 50 件で、同じ配分でも 8 割ほど）。そこで、2 つを混ぜた配分から同じ件数を引き直して
// 「配分が同じなら、重なりはどこまで小さく出うるか」（下から 10% の値 lo と、中ほど base）を求め、重なりが lo 以上なら same（区別できない）とする。
// 件数が SHZ_TOPIC_MIN に満たなければ null。rows は話題ごとの割合（多い順）。mark は、その話題の割合の差が偶然で説明しにくい（両側 99%。話題が 10 あるので、90% だと 1 画面に 1 つほど偶然の印が付く）とき +1（おすすめで多い）か -1
function shzTopicOverlap(tt, sims = 400) {
  const A = tt["for-you"], B = tt.following;
  if (A.n < SHZ_TOPIC_MIN || B.n < SHZ_TOPIC_MIN) return null;
  const keys = [...new Set([...Object.keys(A.by), ...Object.keys(B.by)])];
  const ov = (ca, na, cb, nb) => keys.reduce((s, k) => s + Math.min((ca[k] || 0) / na, (cb[k] || 0) / nb), 0);
  const rows = keys.map((k) => {
    const ca = A.by[k] || 0, cb = B.by[k] || 0, a = ca / A.n, b = cb / B.n, p = (ca + cb) / (A.n + B.n);
    const se = Math.sqrt(p * (1 - p) * (1 / A.n + 1 / B.n)), z = se ? (a - b) / se : 0;
    return { tp: k, a, b, mark: z > 2.576 ? 1 : z < -2.576 ? -1 : 0 };
  }).sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  // 引き直しは毎回同じ乱数の列で行う（画面を開くたびに数字が揺れないように）
  let seed = 12345;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pool = keys.map((k) => ((A.by[k] || 0) + (B.by[k] || 0)) / (A.n + B.n));
  const draw = (n) => { const c = {}; for (let i = 0; i < n; i++) { let r = rand(), j = 0; while ((r -= pool[j]) > 0 && j < pool.length - 1) j++; c[keys[j]] = (c[keys[j]] || 0) + 1; } return c; };
  const null_ = [];
  for (let s = 0; s < sims; s++) null_.push(ov(draw(A.n), A.n, draw(B.n), B.n));
  null_.sort((x, y) => x - y);
  const overlap = ov(A.by, A.n, B.by, B.n), lo = null_[Math.floor(sims * 0.1)];
  return { overlap, rows, base: null_[Math.floor(sims / 2)], lo, same: overlap >= lo };
}

// ---- 目立つ投稿（D25。X が前に出す投稿の形を見るための目安） ----
// 期間 [fromTs, toTs] の、反応の数（ct）を読めた記録を feed ごとに数える。
//   n: 数を読めた件数、rowdy: 荒れ（返信がいいね以上）、wide: 大きく広まった（表示 10 万以上）、heat: どちらか、age: 投稿からの分の中ほど（見た時点）
//   judged / any: そのうち見下し・排除を判定済みの件数・当てはまった件数。heatJudged / heatAny: 目立つ投稿の中での同じ数
function shzHeatTally(records, fromTs = 0, toTs = Infinity) {
  const out = Object.fromEntries(SHZ_FEEDS.map((f) => [f, { n: 0, rowdy: 0, wide: 0, heat: 0, age: null, judged: 0, any: 0, heatJudged: 0, heatAny: 0 }]));
  const ages = Object.fromEntries(SHZ_FEEDS.map((f) => [f, []]));
  for (const r of Object.values(records)) {
    const t = out[r.feed];
    if (!t || !r.ct || !(r.ts >= fromTs && r.ts <= toTs)) continue;
    t.n++;
    const ro = shzRowdy(r.ct), wi = shzWide(r.ct), heat = ro || wi;
    if (ro) t.rowdy++;
    if (wi) t.wide++;
    if (heat) t.heat++;
    if (typeof r.age === "number") ages[r.feed].push(r.age);
    if (!shzIsJudged(r)) continue;
    t.judged++;
    if (shzAnyHit(r)) t.any++;
    if (heat) { t.heatJudged++; if (shzAnyHit(r)) t.heatAny++; }
  }
  for (const f of SHZ_FEEDS) { const a = ages[f].sort((x, y) => x - y); if (a.length) out[f].age = a[Math.floor(a.length / 2)]; }
  return out;
}

// 判定の版（記録に残した jv）の種類。2 種類以上あると、点の付き方が違う記録が混ざっている
function shzVersions(records) {
  return [...new Set(Object.values(records).filter(shzIsJudged).map((r) => r.jv || "不明"))].sort();
}

// 測定モード（アクティブ）の進み具合。session = {start, end?, targetEach}
function shzSessionProgress(records, session, nowMs = Date.now()) {
  const tally = shzTally(records, session.start, session.end ?? nowMs);
  const done = SHZ_FEEDS.every((f) => tally[f].seen >= session.targetEach);
  return { tally, done };
}

// 判定の見本（設定画面の「判定の見本」）。fromTs 以降の、本文が残っている判定済みから、無作為に n 件。おすすめとフォロー中を半分ずつ（足りなければ他方で埋める）。
// 当てはまったものを先に並べない（「ひとまとめの投稿の一覧」にしない。DESIGN.md D14）。hitOnly なら、どれかに当てはまったものだけから選ぶ
function shzSample(records, { n = 10, hitOnly = false, fromTs = 0, rand = Math.random } = {}) {
  const shuffle = (xs) => { for (let i = xs.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [xs[i], xs[k]] = [xs[k], xs[i]]; } return xs; };
  const pool = Object.values(records).filter((r) => r.text && r.ts >= fromTs && shzIsJudged(r) && (!hitOnly || shzAnyHit(r)));
  const by = Object.fromEntries(SHZ_FEEDS.map((f) => [f, shuffle(pool.filter((r) => r.feed === f))]));
  const half = Math.ceil(n / 2);
  const pick = [...by["for-you"].slice(0, half), ...by.following.slice(0, n - half)];
  const rest = shuffle([...by["for-you"].slice(half), ...by.following.slice(n - half)]);
  return shuffle([...pick, ...rest.slice(0, n - pick.length)]).map(({ text, feed, ts, g, c, x, jv }) => ({ text, feed, ts, g, c, x, jv }));
}

// 書き出し（本人がボタンを押したときだけ）。本文の残っている記録を、古い順に。投稿の印（ID から作った文字列）と時刻は入れず、日付だけ。
// 判定は今の版で判定済みのものだけ付ける（前の版の答えは数えないので、書き出しでも混ぜない）
function shzExportRows(records) {
  return Object.values(records)
    .filter((r) => r.text && typeof r.ts === "number")
    .sort((a, b) => a.ts - b.ts)
    .map((r) => ({ feed: r.feed, day: shzDay(r.ts), text: r.text, ...(r.auto ? { auto: 1 } : {}), ...(shzIsJudged(r) ? { g: r.g, c: r.c, x: r.x, jv: r.jv } : {}), ...(typeof r.tp === "string" ? { tp: r.tp, tv: r.tv } : {}), ...(r.ct ? { ct: r.ct } : {}), ...(typeof r.age === "number" ? { age: r.age } : {}) }));
}

if (typeof module !== "undefined") module.exports = { SHZ_MIN_N, SHZ_GOOD_N, SHZ_TOPIC_MIN, SHZ_FEEDS, shzInterval, shzCompare, shzCompareCounts, shzHeatTally, shzTopicTally, shzTopicOverlap, shzTally, shzTallyByDay, shzShare, shzVersions, shzSessionProgress, shzSample, shzExportRows };
