// 本人の下書きを Chrome の組み込み AI（Prompt API）で判定する（DESIGN.md D7）。
// 問いは tools/draft-probe.js の split と同じ（research/builtin-ai.md の 3 回目で測ったもの）。変えるときは両方を直して測り直す。
// 本文は端末の外に出ない。組み込み AI が無い・使えないときは null を返し、呼ぶ側は何もしない。

const SHZ_JUDGE = {
  threshold: 70, // 「攻撃」がこの値以上なら一呼吸
  parts: {
    attack: "返信の相手（またはその人が属する集団）を、侮辱する・嘲笑する・人格を攻撃する・黙れと言う・晒す。内容への反論や、問題の指摘は含まない",
    anger: "書き手の怒りの強さ",
    argument: "根拠や具体的な内容を挙げて、反論・指摘・訂正をしている",
    question: "相手に質問している",
  },
};
SHZ_JUDGE.system = "あなたは SNS の返信の下書きを読み、次の各項目に当てはまる度合いを 0〜100 の整数で答える。100 は明らかに当てはまる、0 はまったく当てはまらない。\n" +
  Object.entries(SHZ_JUDGE.parts).map(([k, v]) => `${k}: ${v}`).join("\n");
SHZ_JUDGE.schema = {
  type: "object",
  properties: Object.fromEntries(Object.keys(SHZ_JUDGE.parts).map((k) => [k, { type: "integer", minimum: 0, maximum: 100 }])),
  required: Object.keys(SHZ_JUDGE.parts),
};

const SHZ_LANG = { expectedInputs: [{ type: "text", languages: ["ja"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };
let shzBase = null; // 問いを読ませた元のやりとり（の約束）。文ごとに複製して使う。同時に 2 つ作らないよう、すぐに入れる

async function shzMakeBase() {
  if ((await LanguageModel.availability(SHZ_LANG)) !== "available") return null; // ダウンロードを始めない
  return LanguageModel.create({ ...SHZ_LANG, initialPrompts: [{ role: "system", content: SHZ_JUDGE.system }] });
}

// 下書きを判定して {attack, anger, argument, question} を返す。使えなければ null
async function shzJudge(text) {
  if (typeof LanguageModel === "undefined") return null;
  const pending = (shzBase ??= shzMakeBase());
  let base = null, s = null;
  try {
    base = await pending;
    if (!base) {
      if (shzBase === pending) shzBase = null; // まだ使えない。次の判定で確かめ直す
      return null;
    }
    s = await base.clone(); // 前の下書きの影響を残さない
    return JSON.parse(await s.prompt(`返信の下書き:\n${text}`, { responseConstraint: SHZ_JUDGE.schema }));
  } catch {
    if (shzBase === pending) { // 壊れた元は片付けて、次の判定で作り直す
      shzBase = null;
      base?.destroy();
    }
    return null;
  } finally {
    s?.destroy();
  }
}

// 送信を 1 回止めるか。state は入力欄ごとの記録 {text, result, passed}
//   text   … 判定した下書き
//   result … 判定の結果（null は使えなかった）
//   passed … 一呼吸を出した下書き（同じ下書きで 2 回目の送信は止めない）
function shzShouldPause(state, current, threshold = SHZ_JUDGE.threshold) {
  if (!state || !current) return false;
  if (state.text !== current) return false; // 判定が今の下書きに追いついていない → 止めない
  if (!state.result || !(state.result.attack >= threshold)) return false;
  return state.passed !== current;
}

if (typeof module !== "undefined") module.exports = { SHZ_JUDGE, shzShouldPause };
