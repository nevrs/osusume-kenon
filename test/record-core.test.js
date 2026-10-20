// node --test test/record-core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { shzPurgeKeys, shzSummarize, shzHashId } = require("../record-core.js");

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 21, 12);

test("古い記録だけを消す対象にする（14 日ちょうどは残す）", () => {
  const recs = {
    "rec:a": { ts: now - 15 * DAY },
    "rec:b": { ts: now - 14 * DAY },
    "rec:c": { ts: now - 1 * DAY },
    "rec:d": { ts: undefined }, // 時刻が壊れたものも消す
  };
  assert.deepEqual(shzPurgeKeys(recs, now, 14).sort(), ["rec:a", "rec:d"]);
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
