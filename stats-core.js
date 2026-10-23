// 判定済みの記録を数える（画面に触れない。設定画面とテストが使う）。
// 「強い」は点が SHZ_STRONG 以上。点そのものを残してあるので、基準を変えても数え直せる。

// ブラウザでは record-core.js が先に読まれていて、shzIsJudged・shzDay が使える。テスト（node）ではここで読み込む
if (typeof module !== "undefined") { const c = require("./record-core.js"); globalThis.shzIsJudged = c.shzIsJudged; globalThis.shzDay = c.shzDay; }

const SHZ_STRONG = 70; // research/anger-record.md で測った基準
const SHZ_MIN_N = 30; // これより少ない判定済み件数の割合は、参考にしない

const SHZ_FEEDS = ["for-you", "following"];

function shzEmptyTally() {
  return { seen: 0, judged: 0, hostile: 0, angry: 0 };
}

// 期間 [fromTs, toTs] の記録を、feed ごとに数える。seen = 記録した件数、judged = そのうち判定済み
function shzTally(records, fromTs = 0, toTs = Infinity) {
  const out = Object.fromEntries(SHZ_FEEDS.map((f) => [f, shzEmptyTally()]));
  for (const r of Object.values(records)) {
    const t = out[r.feed];
    if (!t || !(r.ts >= fromTs && r.ts <= toTs)) continue;
    t.seen++;
    if (!shzIsJudged(r)) continue;
    t.judged++;
    if (r.h >= SHZ_STRONG) t.hostile++;
    if (r.a >= SHZ_STRONG) t.angry++;
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
// 点の高い順には並べない（「敵意の強い投稿の一覧」にしない。DESIGN.md D14）。strongOnly なら、怒りか敵意が SHZ_STRONG 以上のものだけから選ぶ
function shzSample(records, { n = 10, strongOnly = false, fromTs = 0, rand = Math.random } = {}) {
  const shuffle = (xs) => { for (let i = xs.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [xs[i], xs[k]] = [xs[k], xs[i]]; } return xs; };
  const pool = Object.values(records).filter((r) => r.text && r.ts >= fromTs && shzIsJudged(r) && (!strongOnly || r.a >= SHZ_STRONG || r.h >= SHZ_STRONG));
  const by = Object.fromEntries(SHZ_FEEDS.map((f) => [f, shuffle(pool.filter((r) => r.feed === f))]));
  const half = Math.ceil(n / 2);
  const pick = [...by["for-you"].slice(0, half), ...by.following.slice(0, n - half)];
  const rest = shuffle([...by["for-you"].slice(half), ...by.following.slice(n - half)]);
  return shuffle([...pick, ...rest.slice(0, n - pick.length)]).map(({ text, feed, ts, a, h }) => ({ text, feed, ts, a, h }));
}

if (typeof module !== "undefined") module.exports = { SHZ_STRONG, SHZ_MIN_N, SHZ_FEEDS, shzTally, shzTallyByDay, shzShare, shzVersions, shzSessionProgress, shzSample };
