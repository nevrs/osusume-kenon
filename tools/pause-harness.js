// 一呼吸（pause.js）の流れを模擬 DOM で確かめる。組み込み AI は「馬鹿・黙れ」を含む文だけ攻撃と答える偽物に置き換える。
// node tools/pause-harness.js . <jsdom を入れた node_modules>（jsdom はこのリポの依存にしない。どこかに npm install jsdom して、その場所を渡す）
const fs = require("fs"), path = require("path");
const [repo, mods] = process.argv.slice(2);
const { JSDOM } = require(path.join(mods, "jsdom"));

const html = `<body>
  <div id="home"><div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div><button data-testid="tweetButtonInline">ポストする</button></div>
  <div role="dialog"><article>返信先</article>
    <div><div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div></div>
    <div><div data-testid="tweetTextarea_1" role="textbox" contenteditable="true"></div></div>
    <div><button data-testid="tweetButton">すべてポスト</button></div></div>
</body>`;

function setup(availability = "available") {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const counts = { create: 0, prompt: 0 };
  w.LanguageModel = {
    availability: async () => availability,
    create: async () => {
      counts.create++;
      return {
        clone: async () => ({
          prompt: async (p) => {
            counts.prompt++;
            return JSON.stringify({ attack: /馬鹿|黙れ/.test(p) ? 90 : 10, anger: 0, argument: 0, question: 0 });
          },
          destroy() {},
        }),
        destroy() {},
      };
    },
  };
  // Chrome の content script と同じく、ファイルどうしで上の階層の名前を共有させる
  w.eval(["x-dom.js", "judge.js", "pause.js"].map((f) => fs.readFileSync(path.join(repo, f), "utf8")).join(";\n"));
  const d = w.document;
  const [home, th0, th1] = d.querySelectorAll('[role="textbox"]');
  const homeBtn = d.querySelector('[data-testid="tweetButtonInline"]'), dlgBtn = d.querySelector('[data-testid="tweetButton"]');
  const sent = [];
  homeBtn.addEventListener("click", () => sent.push("home")); // X 自身の送信処理の代わり
  dlgBtn.addEventListener("click", () => sent.push("dialog"));
  const type = (box, t) => { box.textContent = t; box.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const click = (b) => { const e = new w.MouseEvent("click", { bubbles: true, cancelable: true }); b.dispatchEvent(e); return e.defaultPrevented; };
  const ctrlEnter = (box) => { const e = new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }); box.dispatchEvent(e); return e.defaultPrevented; };
  const shown = () => !!d.getElementById("shizume-pause");
  return { w, d, home, th0, th1, homeBtn, dlgBtn, sent, type, click, ctrlEnter, shown, counts };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok) => results.push(`${ok ? "OK" : "NG"}  ${name}`);

(async () => {
  let t = setup();
  t.type(t.th0, "お前は馬鹿だ。黙れ");
  check("判定前に押すと止めない（X が送る）", t.click(t.dlgBtn) === false && t.sent.at(-1) === "dialog" && !t.shown());
  await wait(1400);
  check("判定後、攻撃なら 1 回止めて表示を出す", t.click(t.dlgBtn) === true && t.sent.length === 1 && t.shown());
  check("同じ下書きで 2 回目は止めず、表示も消す", t.click(t.dlgBtn) === false && t.sent.length === 2 && !t.shown());
  t.type(t.th0, "お前は馬鹿だ。黙れ!!");
  await wait(1400);
  check("書き換えて再び攻撃なら、また止める", t.click(t.dlgBtn) === true && t.shown());
  t.type(t.th0, "出典を教えてください");
  check("書き換えると表示は消える", !t.shown());
  await wait(1400);
  check("落ち着いた下書きは止めない", t.click(t.dlgBtn) === false && !t.shown());

  t.type(t.th1, "黙れ"); // スレッドの 2 つ目の欄
  await wait(1400);
  check("スレッドの 2 つ目の欄が攻撃なら止める", t.click(t.dlgBtn) === true && t.shown());
  const box = t.d.getElementById("shizume-pause");
  box?.querySelector("[data-act=edit]")?.click();
  check("「書き直す」で表示が消える（表示があったうえで）", !!box && !t.shown());
  t.type(t.th1, "");

  t.type(t.home, "馬鹿じゃないの");
  await wait(1400);
  check("窓のボタンは窓の入力欄を見る（ホームの欄の攻撃に引きずられない）", t.click(t.dlgBtn) === false);
  check("ホームのボタンはホームの欄を見る", t.click(t.homeBtn) === true && t.shown());
  t.type(t.home, "馬鹿じゃないの？");
  await wait(1400);
  check("Ctrl+Enter でも止めて表示を出す", t.ctrlEnter(t.home) === true && t.shown());
  check("Ctrl+Enter の 2 回目は止めない", t.ctrlEnter(t.home) === false);

  t.type(t.home, "馬鹿か");
  await wait(1400);
  t.click(t.homeBtn);
  t.d.getElementById("home").remove(); // 送信して欄が消えた
  await wait(1200);
  check("入力欄が消えたら表示も消える", !t.shown());

  t = setup();
  t.type(t.home, "黙れ");
  await wait(1400);
  const append = t.d.body.append;
  t.d.body.append = () => { throw new Error("作れない"); };
  check("表示を作れなければ止めない（理由の見えないまま止めない）", t.click(t.homeBtn) === false && t.sent.at(-1) === "home");
  t.d.body.append = append;

  t = setup("downloadable");
  t.type(t.home, "黙れ");
  await wait(1400);
  check("モデルが未ダウンロードなら作らず、止めない", t.counts.create === 0 && t.click(t.homeBtn) === false);

  t = setup();
  delete t.w.LanguageModel;
  t.type(t.home, "黙れ");
  await wait(1400);
  check("組み込み AI が無ければ止めない", t.click(t.homeBtn) === false);

  console.log(results.join("\n"));
  process.exit(results.some((r) => r.startsWith("NG")) ? 1 : 0);
})();
