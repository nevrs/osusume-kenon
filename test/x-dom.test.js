// node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCount, parseActionLabel } = require("../x-dom.js");

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
    replies: 1203, reposts: 5, likes: 20, bookmarks: 0, views: 12345,
  });
});

test("parseActionLabel: 数の無い文は null", () => {
  assert.equal(parseActionLabel("返信する"), null);
  assert.equal(parseActionLabel(null), null);
});
