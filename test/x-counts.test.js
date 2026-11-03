// node --test test/x-counts.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCount, parseActionLabel, countsOf, shzHeavy, shzWide, SHZ_HEAT, SHZ_TEMP_LINE, SHZ_FOLD_LINES } = require("../x-counts.js");
// 実機で確かめた形（返信が 0 件のとき、文から返信が抜ける）を写した、作り物の例。実機の数は公開していない
const fixture = { rows: [
  { label: "12 件の返信、340 件のリポスト、5100 件のいいね、210 件のブックマーク、98000 件の表示", replyButton: 12 },
  { label: "3 件の返信、20 件のリポスト、150 件のいいね、4 件のブックマーク、2500 件の表示", replyButton: 3 },
  { label: "30 件のリポスト、200 件のいいね、25 件のブックマーク、9000 件の表示", replyButton: 0 },
] };

test("parseCount", () => {
  assert.equal(parseCount("1,234"), 1234);
  assert.equal(parseCount("1.2万"), 12000);
  assert.equal(parseCount("3.4K"), 3400);
  assert.equal(parseCount("5M"), 5000000);
  assert.equal(parseCount("2億"), 200000000);
  assert.equal(parseCount("abc"), null);
});

test("parseActionLabel: 日本語", () => {
  assert.deepEqual(parseActionLabel("3 件の返信、5 件のリポスト、20 件のいいね、1 件のブックマーク、1234 件の表示"), {
    replies: 3, reposts: 5, likes: 20, bookmarks: 1, views: 1234,
  });
});

test("parseActionLabel: 英語、桁区切りのカンマ", () => {
  assert.deepEqual(parseActionLabel("1,203 replies, 5 reposts, 20 likes, 12,345 views"), {
    replies: 1203, reposts: 5, likes: 20, bookmarks: null, views: 12345,
  });
});

test("parseActionLabel: bookmarks の b を単位と読まない、単位付きの数", () => {
  assert.deepEqual(parseActionLabel("17 replies, 45 reposts, 312 likes, 12 bookmarks, 45612 views"), {
    replies: 17, reposts: 45, likes: 312, bookmarks: 12, views: 45612,
  });
  assert.equal(parseActionLabel("1 bookmark").bookmarks, 1);
  assert.equal(parseActionLabel("3.4K likes, 1.2M views").likes, 3400);
  assert.equal(parseActionLabel("2.1万 件のいいね").likes, 21000);
});

test("parseActionLabel: 数の無い文は null", () => {
  assert.equal(parseActionLabel("返信する"), null);
  assert.equal(parseActionLabel(null), null);
});

test("日本語の数の行の例: すべて読め、返信数が返信ボタンの数と一致する（返信が文に無ければ 0）", () => {
  for (const { label, replyButton } of fixture.rows) {
    const c = countsOf(label, "ja");
    assert.ok(c, label);
    assert.equal(c.replies, replyButton, label);
    assert.ok(c.views > 0, label);
  }
});

test("countsOf: 日本語以外では文に無い種類を 0 にしない", () => {
  assert.equal(countsOf("20 likes", "en").replies, null);
  assert.equal(countsOf("20 件のいいね", "ja").replies, 0);
});

test("目立つ投稿の見分け方（D25・D27）: 返信が多め = 返信 10 件以上で、返信がいいねの line 倍以上。大きく広まった = 表示が基準以上", () => {
  const R = SHZ_HEAT.replyMin, V = SHZ_HEAT.reach;
  assert.equal(R, 10);
  assert.equal(SHZ_TEMP_LINE, 0.03);
  assert.deepEqual(SHZ_FOLD_LINES, [0.03, 0.1, 1]);
  assert.equal(shzHeavy({ r: 30, l: 1000 }), true); // 3% ちょうど
  assert.equal(shzHeavy({ r: 30, l: 1001 }), false);
  assert.equal(shzHeavy({ r: 30, l: 300 }, 0.1), true);
  assert.equal(shzHeavy({ r: 30, l: 301 }, 0.1), false);
  assert.equal(shzHeavy({ r: R, l: R }, 1), true);
  assert.equal(shzHeavy({ r: R, l: R + 1 }, 1), false); // いいねのほうが多い
  assert.equal(shzHeavy({ r: R - 1, l: 0 }), false); // 返信が少ない（ふつうの会話）
  assert.equal(shzHeavy({ r: R, l: null }), true); // 英語の画面: いいね 0 件は文に出ない → 0 とみなす
  assert.equal(shzHeavy({ r: null, l: 5 }), false); // 返信 0 件は文に出ない → 0
  assert.equal(shzHeavy(null), false);
  assert.equal(shzWide({ v: V }), true);
  assert.equal(shzWide({ v: V - 1 }), false);
  assert.equal(shzWide({ v: null }), false);
});
