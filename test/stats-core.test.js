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
  assert.deepEqual(t["for-you"], { seen: 4, judged: 2, lump: 1, contempt: 1, exclusion: 1, any: 1, legacy: 1 });
  assert.deepEqual(t.following, { seen: 1, judged: 1, lump: 0, contempt: 0, exclusion: 0, any: 0, legacy: 0 });
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
