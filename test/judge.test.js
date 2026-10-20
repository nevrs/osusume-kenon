// node --test test/judge.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { shzShouldPause } = require("../judge.js");

const attack = { attack: 90 };
const calm = { attack: 10 };

test("今の下書きが「攻撃」と判定済みなら止める", () => {
  assert.equal(shzShouldPause({ text: "頭悪すぎ", result: attack, passed: null }, "頭悪すぎ"), true);
});
test("同じ下書きで 2 回目は止めない（本人が送ると決めた）", () => {
  assert.equal(shzShouldPause({ text: "頭悪すぎ", result: attack, passed: "頭悪すぎ" }, "頭悪すぎ"), false);
});
test("書き換えて再び「攻撃」なら、また止める", () => {
  assert.equal(shzShouldPause({ text: "頭悪すぎて草", result: attack, passed: "頭悪すぎ" }, "頭悪すぎて草"), true);
});
test("判定が今の下書きに追いついていなければ止めない", () => {
  assert.equal(shzShouldPause({ text: "頭悪", result: attack, passed: null }, "頭悪すぎ"), false);
});
test("基準未満・判定できなかった・記録なし・空の下書きは止めない", () => {
  assert.equal(shzShouldPause({ text: "質問です", result: calm, passed: null }, "質問です"), false);
  assert.equal(shzShouldPause({ text: "x", result: null, passed: null }, "x"), false);
  assert.equal(shzShouldPause(undefined, "x"), false);
  assert.equal(shzShouldPause({ text: "", result: attack, passed: null }, ""), false);
});
test("基準ちょうどは止める", () => {
  assert.equal(shzShouldPause({ text: "a", result: { attack: 70 }, passed: null }, "a"), true);
});
