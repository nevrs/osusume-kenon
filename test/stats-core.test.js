// node --test test/stats-core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { shzTally, shzTallyByDay, shzShare, shzVersions, shzSessionProgress, SHZ_MIN_N } = require("../stats-core.js");

const DAY = 86_400_000;
const noon = new Date(2026, 9, 21, 12).getTime(); // この端末の 10/21 正午
// 今の問いで判定済みの記録。g = 集団の言葉、c = 見下し、x = 排除（ひとまとめの見下しは g と c の両方。D18）
const j = (feed, ts, g = 0, c = 0, x = 0, jv = "ev1/c155") => ({ feed, ts, g, c, x, jv });

test("feed ごとに、記録・判定済み・ひとまとめの見下し・見下し・排除・どれか を数える。集団の言葉だけでは数えない。未判定と前の問いの記録は数えない（前の問いは件数だけ）", () => {
  const recs = {
    a: j("for-you", noon, 1, 0, 0), // 集団の言葉だけ（数えない）
    b: j("for-you", noon, 1, 1, 1), // 全部
    c: { feed: "for-you", ts: noon, text: "未判定" },
    d: { feed: "for-you", ts: noon, a: 90, h: 90, jv: "split1/c155" }, // 前の問い
    e: j("following", noon),
    f: j("other", noon, 1, 1, 1), // 知らない feed は数えない
  };
  const t = shzTally(recs);
  assert.deepEqual(t["for-you"], { seen: 4, judged: 2, lump: 1, contempt: 1, exclusion: 1, any: 1, legacy: 1, lv1: 0, lv2: 0, lv3: 1 });
  assert.deepEqual(t.following, { seen: 1, judged: 1, lump: 0, contempt: 0, exclusion: 0, any: 0, legacy: 0, lv1: 0, lv2: 0, lv3: 0 });
});

test("見下しや排除だけでも「どれか」に入る", () => {
  const t = shzTally({ a: j("for-you", noon, 0, 1, 0), b: j("for-you", noon, 0, 0, 1), c: j("for-you", noon) });
  assert.equal(t["for-you"].any, 2);
});

test("期間で絞る（両端を含む）", () => {
  const recs = { a: j("for-you", noon - DAY, 1), b: j("for-you", noon, 1), c: j("for-you", noon + DAY, 1) };
  assert.equal(shzTally(recs, noon - DAY, noon)["for-you"].seen, 2);
  assert.equal(shzTally(recs, noon + 1)["for-you"].seen, 1);
});

test("日ごとに、この端末の日付で分ける", () => {
  const recs = { a: j("for-you", noon, 1, 1), b: j("following", noon), c: j("for-you", noon - DAY), d: { feed: "for-you", ts: "壊れた" } };
  const d = shzTallyByDay(recs);
  assert.deepEqual(Object.keys(d).sort(), ["2026-10-20", "2026-10-21"]);
  assert.equal(d["2026-10-21"]["for-you"].any, 1);
  assert.equal(d["2026-10-21"].following.judged, 1);
});

test("割合は判定済みが少ないと出さない", () => {
  assert.equal(shzShare(3, SHZ_MIN_N - 1), null);
  assert.equal(shzShare(3, SHZ_MIN_N), 3 / SHZ_MIN_N);
  assert.equal(shzShare(0, 0), null);
});

test("判定の版が混ざっていれば分かる。未判定は数えない", () => {
  assert.deepEqual(shzVersions({ a: j("for-you", noon, 1, 1, 0, "ev1/c155"), b: j("for-you", noon, 1, 1, 0, "ev1/c156"), c: { feed: "for-you", ts: noon, text: "x" } }), ["ev1/c155", "ev1/c156"]);
  assert.deepEqual(shzVersions({ a: { feed: "for-you", ts: noon, g: 1, c: 0, x: 0 } }), ["不明"]);
  assert.deepEqual(shzVersions({ a: { feed: "for-you", ts: noon, h: 1, a: 1, jv: "split1/c155" } }), []); // 前の問いは数えないので版にも出さない
});

test("測定モードの進み具合: 始める前の記録は数えず、両方の feed がそろったら done", () => {
  const session = { start: noon, targetEach: 2 };
  const recs = {
    old: j("for-you", noon - 1),
    a: j("for-you", noon), b: j("for-you", noon + 5),
    c: j("following", noon + 6),
  };
  let p = shzSessionProgress(recs, session, noon + 100);
  assert.equal(p.tally["for-you"].seen, 2);
  assert.equal(p.done, false);
  recs.d = j("following", noon + 7);
  assert.equal(shzSessionProgress(recs, session, noon + 100).done, true);
  recs.late = j("following", noon + 500);
  assert.equal(shzSessionProgress(recs, { ...session, end: noon + 100 }, noon + 1000).tally.following.seen, 2); // 終えたあとの記録は数えない
});

test("判定の見本: 本文のある判定済みだけから、おすすめ・フォロー中を半分ずつ選ぶ。本文・feed・時刻・答え・版だけを返す", () => {
  const { shzSample } = require("../stats-core.js");
  const recs = {};
  for (let i = 0; i < 20; i++) recs[`rec:f${i}`] = { text: `おすすめ${i}`, feed: "for-you", ts: noon, g: i % 2, c: 0, x: 0, m: 0, jv: "v" };
  for (let i = 0; i < 20; i++) recs[`rec:g${i}`] = { text: `フォロー${i}`, feed: "following", ts: noon, g: 0, c: i % 2, x: 0, m: 0, jv: "v" };
  recs["rec:u"] = { text: "未判定", feed: "for-you", ts: noon };
  recs["rec:t"] = { feed: "for-you", ts: noon, g: 1, c: 1, x: 1 }; // 本文を消した記録
  recs["rec:l"] = { text: "前の問い", feed: "for-you", ts: noon, a: 99, h: 99 }; // 前の問いの判定は出さない
  const s = shzSample(recs, { n: 10 });
  assert.equal(s.length, 10);
  assert.equal(s.filter((r) => r.feed === "for-you").length, 5);
  assert.ok(s.every((r) => r.text && r.text !== "未判定" && r.text !== "前の問い"));
  assert.deepEqual(Object.keys(s[0]).sort(), ["c", "feed", "g", "jv", "text", "ts", "x"]);
});

test("判定の見本: 片方が足りなければ他方で埋める。hitOnly は、どれかに当てはまったものだけ", () => {
  const { shzSample } = require("../stats-core.js");
  const recs = {
    "rec:1": { text: "a", feed: "for-you", ts: noon, g: 1, c: 1, x: 0 },
    "rec:5": { text: "e", feed: "for-you", ts: noon, g: 1, c: 0, x: 0 }, // 集団の言葉だけは数えない（D18）
    "rec:2": { text: "b", feed: "for-you", ts: noon, g: 0, c: 0, x: 1 },
    "rec:3": { text: "c", feed: "for-you", ts: noon, g: 0, c: 0, x: 0 },
    "rec:4": { text: "d", feed: "following", ts: noon, g: 0, c: 0, x: 0, m: 1 }, // 動員だけは数えない
  };
  assert.equal(shzSample(recs, { n: 10 }).length, 5);
  assert.deepEqual(shzSample(recs, { n: 10, hitOnly: true }).map((r) => r.text).sort(), ["a", "b"]);
  assert.deepEqual(shzSample({}, { n: 10 }), []);
});

test("判定の見本: fromTs より前の記録は選ばない（本文がまだ消されていなくても）", () => {
  const { shzSample } = require("../stats-core.js");
  const recs = { "rec:old": { text: "古い", feed: "for-you", ts: noon - 20 * DAY, g: 1, c: 0, x: 0 }, "rec:new": { text: "新しい", feed: "for-you", ts: noon, g: 1, c: 0, x: 0 } };
  assert.deepEqual(shzSample(recs, { fromTs: noon - 14 * DAY }).map((r) => r.text), ["新しい"]);
});

test("書き出し: 本文のある記録を古い順に。印・時刻は入れず日付だけ。判定は今の版のものだけ付ける", () => {
  const { shzExportRows } = require("../stats-core.js");
  const recs = {
    "rec:b": { text: "後", feed: "following", ts: noon + 1000, id: "abc", g: 0, c: 0, x: 1, jv: "ev1/c155" },
    "rec:a": { text: "前", feed: "for-you", ts: noon, id: "def" }, // 未判定
    "rec:l": { text: "前の版", feed: "for-you", ts: noon + 2000, g: 1, c: 1, x: 1, jv: "group1/c155" }, // 数えない版の答えは付けない
    "rec:t": { feed: "for-you", ts: noon, g: 1, c: 0, x: 0, jv: "ev1/c155" }, // 本文を消した記録
  };
  const rows = shzExportRows(recs);
  assert.deepEqual(rows.map((r) => r.text), ["前", "後", "前の版"]);
  assert.deepEqual(rows[0], { feed: "for-you", day: rows[0].day, text: "前" });
  assert.deepEqual(rows[1], { feed: "following", day: rows[1].day, text: "後", g: 0, c: 0, x: 1, jv: "ev1/c155" });
  assert.deepEqual(Object.keys(rows[2]).sort(), ["day", "feed", "text"]);
  assert.ok(rows.every((r) => !("id" in r) && !("ts" in r)));
  assert.deepEqual(shzExportRows({}), []);
});

test("書き出し: 開発用の自動スクロールで集めた記録には auto: 1 を付ける（D21）", () => {
  const { shzExportRows } = require("../stats-core.js");
  const rows = shzExportRows({ "rec:a": { text: "手", feed: "for-you", ts: noon }, "rec:b": { text: "自動", feed: "for-you", ts: noon + 1, auto: 1 } });
  assert.deepEqual(rows.map((r) => r.auto), [undefined, 1]);
});

test("内訳: 重い段だけに数え、lv1+lv2+lv3 が any に等しい（D22）", () => {
  const { shzTally } = require("../stats-core.js");
  const J = (g, c, x) => ({ feed: "for-you", ts: noon, g, c, x, jv: "ev1/c155" });
  const t = shzTally({ a: J(1, 1, 1), b: J(1, 1, 0), c: J(0, 1, 0), d: J(0, 0, 1), e: J(1, 0, 0) })["for-you"];
  assert.deepEqual([t.lv1, t.lv2, t.lv3, t.any], [1, 1, 2, 4]);
});

test("90% の幅と、おすすめ・フォロー中の比べ方（D22）", () => {
  const { shzInterval, shzCompare } = require("../stats-core.js");
  const [lo, hi] = shzInterval(10, 100);
  assert.ok(lo > 0.05 && lo < 0.1 && hi > 0.1 && hi < 0.17, `${lo} ${hi}`);
  assert.equal(shzInterval(0, 0), null);
  const T = (ay, an, by, bn) => ({ "for-you": { any: ay, judged: an }, following: { any: by, judged: bn } });
  assert.equal(shzCompare(T(5, 20, 1, 40)).verdict, "need");
  const big = shzCompare(T(40, 200, 10, 200));
  assert.equal(big.verdict, "higher");
  assert.equal(big.ratio, 4);
  assert.equal(shzCompare(T(6, 100, 5, 100)).verdict, "unclear");
  assert.equal(shzCompare(T(2, 200, 20, 200)).verdict, "lower");
  assert.equal(shzCompare(T(5, 100, 0, 100)).ratio, null);
});

test("話題の重なり: 割合の小さいほうの和。件数が足りなければ null（D23）", () => {
  const { shzTopicTally, shzTopicOverlap } = require("../stats-core.js");
  const recs = {};
  for (let i = 0; i < 60; i++) recs[`a${i}`] = { feed: "for-you", ts: noon, tp: i < 30 ? "politics" : "games" };
  for (let i = 0; i < 60; i++) recs[`b${i}`] = { feed: "following", ts: noon, tp: i < 15 ? "politics" : "games" };
  recs.n = { feed: "following", ts: noon }; // 話題の無い記録は数えない
  const tt = shzTopicTally(recs);
  assert.equal(tt["for-you"].n, 60);
  assert.equal(tt.following.n, 60);
  const ov = shzTopicOverlap(tt);
  assert.equal(Math.round(ov.overlap * 100), 75); // politics min(.5,.25) + games min(.5,.75)
  assert.equal(ov.rows[0].tp, "games");
  assert.equal(ov.same, false); // 各 60 件で 75% は、同じ配分のときのぶれ（lo）より小さい
  assert.ok(ov.base > 0.85 && ov.lo > 0.75 && ov.lo < ov.base, `${ov.base} ${ov.lo}`);
  assert.deepEqual(ov.rows.map((r) => r.mark), [-1, 1]); // ゲームはおすすめで少なく、政治は多い
  // 同じ配分なら same
  const eq = {};
  for (let i = 0; i < 60; i++) { eq[`a${i}`] = { feed: "for-you", ts: noon, tp: i % 3 ? "games" : "politics" }; eq[`b${i}`] = { feed: "following", ts: noon, tp: i % 3 ? "games" : "politics" }; }
  const o2 = shzTopicOverlap(shzTopicTally(eq));
  assert.equal(o2.same, true);
  assert.deepEqual(o2.rows.map((r) => r.mark), [0, 0]);
  delete recs.b0;
  for (let i = 1; i < 60; i += 2) delete recs[`b${i}`];
  assert.equal(shzTopicOverlap(shzTopicTally(recs)), null);
});

test("話題の重なり: 暮らし・趣味・その他は 1 つにまとめて数える（D23）", () => {
  const { shzTopicTally } = require("../stats-core.js");
  const tt = shzTopicTally({ a: { feed: "for-you", ts: noon, tp: "hobby" }, b: { feed: "for-you", ts: noon, tp: "other" }, c: { feed: "for-you", ts: noon, tp: "life" }, d: { feed: "for-you", ts: noon, tp: "games" } });
  assert.deepEqual(tt["for-you"].by, { life: 3, games: 1 });
});

test("目立つ投稿: 数を読めた記録だけを feed ごとに数え、見下し・排除との重なりと、投稿からの分の中ほどを出す（D25）", () => {
  const { shzHeatTally, shzCompareCounts } = require("../stats-core.js");
  const rowdy = { r: 50, p: 1, l: 10, b: 0, v: 5000 }, wide = { r: 1, p: 1, l: 900, b: 0, v: 200_000 }, calm = { r: 1, p: 0, l: 5, b: 0, v: 300 };
  const recs = {
    a: { ...j("for-you", noon, 1, 1, 0), ct: rowdy, age: 600 },
    b: { ...j("for-you", noon), ct: wide, age: 30 },
    c: { feed: "for-you", ts: noon, text: "未判定", ct: calm, age: 120 },
    d: { ...j("for-you", noon) }, // 数の無い記録（0.15.0 より前）は数えない
    e: { ...j("following", noon, 0, 1, 0), ct: calm, age: 10 },
    f: { ...j("following", noon - 20 * DAY), ct: rowdy }, // 期間の外
  };
  const t = shzHeatTally(recs, noon - DAY);
  assert.deepEqual(t["for-you"], { n: 3, rowdy: 1, wide: 1, heat: 2, age: 120, judged: 2, any: 1, heatJudged: 2, heatAny: 1 });
  assert.deepEqual(t.following, { n: 1, rowdy: 0, wide: 0, heat: 0, age: 10, judged: 1, any: 1, heatJudged: 0, heatAny: 0 });
  assert.equal(shzCompareCounts(1, 3, 0, 1).verdict, "need"); // 少ない
  assert.equal(shzCompareCounts(30, 100, 10, 100).verdict, "higher");
});

test("書き出し: 反応の数と投稿からの分も付ける（D25）", () => {
  const { shzExportRows } = require("../stats-core.js");
  const rows = shzExportRows({ a: { feed: "for-you", ts: noon, text: "本文", ct: { r: 1, p: 0, l: 2, b: 0, v: 30 }, age: 5 } });
  assert.deepEqual(rows[0].ct, { r: 1, p: 0, l: 2, b: 0, v: 30 });
  assert.equal(rows[0].age, 5);
});
