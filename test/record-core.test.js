// node --test test/record-core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { shzPurgePlan, shzIsJudged, shzIsLegacy, shzSummarize, shzHashId } = require("../record-core.js");

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 21, 12);

test("期限の片付け: 判定済み（前の問いの点）は本文だけ消して点を残し、未判定は記録ごと消す（14 日ちょうどは残す）", () => {
  const J = (ts) => ({ text: "本文", feed: "for-you", ts, a: 80, h: 90, jv: "split1/c155" });
  const recs = {
    "rec:a": { text: "未判定", feed: "for-you", ts: now - 15 * DAY }, // 未判定で期限切れ → 消す
    "rec:b": J(now - 14 * DAY), // ちょうど 14 日 → そのまま
    "rec:c": J(now - 15 * DAY), // 判定済みで期限切れ → 本文だけ消す
    "rec:d": { feed: "for-you", ts: undefined }, // 時刻が壊れたものも消す
    "rec:e": { feed: "for-you", ts: now - 366 * DAY, a: 1, h: 1 }, // 点の期限（365 日）も過ぎた → 消す
    "rec:f": { feed: "following", ts: now - 100 * DAY, a: 5, h: 6, jv: "split1/c155" }, // 本文は無く、点だけ → そのまま
  };
  const { remove, strip } = shzPurgePlan(recs, now);
  assert.deepEqual(remove.sort(), ["rec:a", "rec:d", "rec:e"]);
  assert.deepEqual(strip, { "rec:c": { feed: "for-you", ts: now - 15 * DAY, a: 80, h: 90, jv: "split1/c155" } });
  assert.ok(!("text" in strip["rec:c"]));
});

test("本文の期限を 0 日にすると、判定済みの本文はすべて消え、未判定は記録ごと消える", () => {
  const recs = { "rec:a": { text: "x", feed: "for-you", ts: now - 1000, a: 1, h: 1 }, "rec:b": { text: "y", feed: "for-you", ts: now - 1000 } };
  const { remove, strip } = shzPurgePlan(recs, now, 0);
  assert.deepEqual(remove, ["rec:b"]);
  assert.deepEqual(Object.keys(strip), ["rec:a"]);
});

test("判定済みとは、今の問いの答え（g・c・x）が 3 つとも数であること。前の問いの点（a・h）だけのものは「前の判定」", () => {
  assert.equal(shzIsJudged({ g: 0, c: 0, x: 0 }), true);
  assert.equal(shzIsJudged({ g: 1, c: 0 }), false);
  assert.equal(shzIsJudged({ h: 0, a: 0 }), false);
  assert.equal(shzIsLegacy({ h: 0, a: 0 }), true);
  assert.equal(shzIsLegacy({ h: "50", a: 1 }), false);
  assert.equal(shzIsLegacy({ h: 1, a: 1, g: 0, c: 0, x: 0 }), false);
});

test("期限の片付け: 今の問いで判定済みのものも、本文だけ消して答え（g・c・x・m）と版を残す", () => {
  const recs = { "rec:n": { text: "本文", feed: "following", ts: now - 15 * DAY, g: 1, c: 0, x: 0, m: 0, jv: "group1/c155" } };
  const { remove, strip } = shzPurgePlan(recs, now);
  assert.deepEqual(remove, []);
  assert.deepEqual(strip, { "rec:n": { feed: "following", ts: now - 15 * DAY, g: 1, c: 0, x: 0, m: 0, jv: "group1/c155" } });
});

test("件数を feed ごと・日ごとに数える", () => {
  const recs = {
    a: { feed: "for-you", ts: now },
    b: { feed: "for-you", ts: now - DAY },
    c: { feed: "following", ts: now },
  };
  const s = shzSummarize(recs);
  assert.equal(s.total, 3);
  assert.deepEqual(s.byFeed, { "for-you": 2, following: 1 });
  assert.equal(s.byDay["2026-10-21"], 2);
  assert.equal(shzSummarize({}).total, 0);
});

test("ID の印は同じ ID なら同じ、違う ID なら違い、元の ID を含まない", async () => {
  const a = await shzHashId("2112399496361722057");
  assert.equal(a, await shzHashId("2112399496361722057"));
  assert.notEqual(a, await shzHashId("2112399496361722058"));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.ok(!a.includes("2112399496"));
});
