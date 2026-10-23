// 判定済みの記録を数える（画面に触れない。設定画面とテストが使う）。
// 数えるのは今の問い（D15）の答え: ひとまとめ（g）・見下し（c）・排除（x）。どれかに当てはまれば any。前の問い（怒り・敵意の点、版 group1 の答え。D16）の記録は legacy として件数だけ数える

// ブラウザでは record-core.js が先に読まれていて、shzIsJudged・shzDay が使える。テスト（node）ではここで読み込む
if (typeof module !== "undefined") { const c = require("./record-core.js"); globalThis.shzIsJudged = c.shzIsJudged; globalThis.shzIsLegacy = c.shzIsLegacy; globalThis.shzDay = c.shzDay; }

const SHZ_MIN_N = 30; // これより少ない判定済み件数の割合は、参考にしない

const SHZ_FEEDS = ["for-you", "following"];

function shzEmptyTally() {
  return { seen: 0, judged: 0, lump: 0, contempt: 0, exclusion: 0, any: 0, legacy: 0 };
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
    if (r.g) t.lump++;
    if (r.c) t.contempt++;
    if (r.x) t.exclusion++;
    if (r.g || r.c || r.x) t.any++;
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
  const pool = Object.values(records).filter((r) => r.text && r.ts >= fromTs && shzIsJudged(r) && (!hitOnly || r.g || r.c || r.x));
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
    .map((r) => ({ feed: r.feed, day: shzDay(r.ts), text: r.text, ...(shzIsJudged(r) ? { g: r.g, c: r.c, x: r.x, jv: r.jv } : {}) }));
}

if (typeof module !== "undefined") module.exports = { SHZ_MIN_N, SHZ_FEEDS, shzTally, shzTallyByDay, shzShare, shzVersions, shzSessionProgress, shzSample, shzExportRows };
