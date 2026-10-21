// node --test test/stats-core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { shzTally, shzTallyByDay, shzShare, shzVersions, shzSessionProgress, SHZ_MIN_N } = require("../stats-core.js");

const DAY = 86_400_000;
const noon = new Date(2026, 9, 21, 12).getTime(); // この端末の 10/21 正午
const j = (feed, ts, h, a, jv = "split1/c155") => ({ feed, ts, h, a, jv });

test("feed ごとに、記録・判定済み・強い（70 以上）を数える。未判定は強いに入れない", () => {
  const recs = {
    a: j("for-you", noon, 70, 10), // 敵意が強い（ちょうど 70 を含む）
    b: j("for-you", noon, 69, 70), // 怒りだけ強い
    c: { feed: "for-you", ts: noon, text: "未判定" },
    d: j("following", noon, 0, 0),
    e: j("other", noon, 99, 99), // 知らない feed は数えない
  };
  const t = shzTally(recs);
  assert.deepEqual(t["for-you"], { seen: 3, judged: 2, hostile: 1, angry: 1 });
  assert.deepEqual(t.following, { seen: 1, judged: 1, hostile: 0, angry: 0 });
});

test("期間で絞る（両端を含む）", () => {
  const recs = { a: j("for-you", noon - DAY, 80, 80), b: j("for-you", noon, 80, 80), c: j("for-you", noon + DAY, 80, 80) };
  assert.equal(shzTally(recs, noon - DAY, noon)["for-you"].seen, 2);
  assert.equal(shzTally(recs, noon + 1)["for-you"].seen, 1);
});

test("日ごとに、この端末の日付で分ける", () => {
  const recs = { a: j("for-you", noon, 80, 0), b: j("following", noon, 0, 0), c: j("for-you", noon - DAY, 0, 0), d: { feed: "for-you", ts: "壊れた" } };
  const d = shzTallyByDay(recs);
  assert.deepEqual(Object.keys(d).sort(), ["2026-10-20", "2026-10-21"]);
  assert.equal(d["2026-10-21"]["for-you"].hostile, 1);
  assert.equal(d["2026-10-21"].following.judged, 1);
});

test("割合は判定済みが少ないと出さない", () => {
  assert.equal(shzShare(3, SHZ_MIN_N - 1), null);
  assert.equal(shzShare(3, SHZ_MIN_N), 3 / SHZ_MIN_N);
  assert.equal(shzShare(0, 0), null);
});

test("判定の版が混ざっていれば分かる。未判定は数えない", () => {
  assert.deepEqual(shzVersions({ a: j("for-you", noon, 1, 1, "split1/c155"), b: j("for-you", noon, 1, 1, "split1/c156"), c: { feed: "for-you", ts: noon, text: "x" } }), ["split1/c155", "split1/c156"]);
  assert.deepEqual(shzVersions({ a: { feed: "for-you", ts: noon, h: 1, a: 1 } }), ["不明"]);
});

test("測定モードの進み具合: 始める前の記録は数えず、両方の feed がそろったら done", () => {
  const session = { start: noon, targetEach: 2 };
  const recs = {
    old: j("for-you", noon - 1, 0, 0),
    a: j("for-you", noon, 0, 0), b: j("for-you", noon + 5, 0, 0),
    c: j("following", noon + 6, 0, 0),
  };
  let p = shzSessionProgress(recs, session, noon + 100);
  assert.equal(p.tally["for-you"].seen, 2);
  assert.equal(p.done, false);
  recs.d = j("following", noon + 7, 0, 0);
  assert.equal(shzSessionProgress(recs, session, noon + 100).done, true);
  recs.late = j("following", noon + 500, 0, 0);
  assert.equal(shzSessionProgress(recs, { ...session, end: noon + 100 }, noon + 1000).tally.following.seen, 2); // 終えたあとの記録は数えない
});
