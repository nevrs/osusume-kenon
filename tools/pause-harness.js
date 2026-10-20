// 一呼吸（pause.js）の流れを模擬 DOM で確かめる。組み込み AI は「馬鹿・黙れ」を含む文だけ攻撃と答える偽物に置き換える。
// node tools/pause-harness.js . <jsdom を入れた node_modules>（jsdom はこのリポの依存にしない。どこかに npm install jsdom して、その場所を渡す）
const fs = require("fs"), path = require("path");
const [repo, mods] = process.argv.slice(2);
const { JSDOM } = require(path.join(mods, "jsdom"));
const html = `<body>
  <div id="home"><div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div><button data-testid="tweetButtonInline">ポストする</button></div>
  <div role="dialog"><article>返信先</article><div><div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div></div><div><button data-testid="tweetButton">返信</button></div></div>
</body>`;
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
let calls = 0;
w.LanguageModel = {
  availability: async () => "available",
  create: async () => ({ clone: async () => ({ prompt: async (p) => { calls++; return JSON.stringify({ attack: /馬鹿|黙れ/.test(p) ? 90 : 10, anger: 0, argument: 0, question: 0 }); }, destroy() {} }) }),
};
w.eval(["x-dom.js", "judge.js", "pause.js"].map((f) => fs.readFileSync(path.join(repo, f), "utf8")).join(";\n")); // Chrome の content script と同じく、ファイルどうしで上の階層の名前を共有させる
const d = w.document;
const [homeBox, dlgBox] = d.querySelectorAll('[role="textbox"]');
const homeBtn = d.querySelector('[data-testid="tweetButtonInline"]'), dlgBtn = d.querySelector('[data-testid="tweetButton"]');
let sent = [];
homeBtn.addEventListener("click", () => sent.push("home"));
dlgBtn.addEventListener("click", () => sent.push("dialog"));
const type = (box, t) => { box.textContent = t; box.dispatchEvent(new w.Event("input", { bubbles: true })); };
const click = (b) => { const e = new w.MouseEvent("click", { bubbles: true, cancelable: true }); b.dispatchEvent(e); return e.defaultPrevented; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok) => results.push(`${ok ? "OK " : "NG "} ${name}`);
(async () => {
  type(dlgBox, "お前は馬鹿だ。黙れ");
  check("判定前に押すと止めない", click(dlgBtn) === false && sent.at(-1) === "dialog");
  await wait(1400);
  check("判定後、攻撃なら 1 回止める", click(dlgBtn) === true && sent.length === 1 && !!d.getElementById("shizume-pause"));
  check("同じ下書きで 2 回目は止めない（X が送る）", click(dlgBtn) === false && sent.at(-1) === "dialog" && sent.length === 2);
  type(dlgBox, "お前は馬鹿だ。黙れ!!");
  check("書き換えると一呼吸の表示は消える", !d.getElementById("shizume-pause"));
  await wait(1400);
  check("書き換えて再び攻撃なら、また止める", click(dlgBtn) === true);
  type(homeBox, "出典はどこですか");
  await wait(1400);
  check("落ち着いた下書きは止めない", click(homeBtn) === false && sent.at(-1) === "home");
  type(homeBox, "馬鹿じゃないの");
  type(dlgBox, "出典を教えてください");
  await wait(1400);
  check("窓のボタンは窓の入力欄を見る（ホームの欄の攻撃に引きずられない）", click(dlgBtn) === false);
  check("ホームのボタンはホームの欄を見る", click(homeBtn) === true);
  d.getElementById("shizume-pause")?.remove();
  type(homeBox, "馬鹿じゃないの？");
  await wait(1400);
  const k = new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true });
  homeBox.dispatchEvent(k);
  check("Ctrl+Enter でも止める", k.defaultPrevented === true);
  const k2 = new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true });
  homeBox.dispatchEvent(k2);
  check("Ctrl+Enter の 2 回目は止めない", k2.defaultPrevented === false);
  d.getElementById("shizume-pause")?.querySelector("[data-act=edit]").click();
  check("「書き直す」で表示が消える", !d.getElementById("shizume-pause"));
  delete w.LanguageModel;
  w.eval("shzBase = null");
  type(homeBox, "馬鹿じゃないのか");
  await wait(1400);
  check("組み込み AI が無ければ止めない", click(homeBtn) === false);
  console.log(results.join("\n"), `\n判定の回数: ${calls}`);
  process.exit(results.some((r) => r.startsWith("NG")) ? 1 : 0);
})();
