// node --test test/x-dom.test.js
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
