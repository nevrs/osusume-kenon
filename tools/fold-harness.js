// 目立つ投稿をたたむ機能（fold.js。DESIGN.md D25）の流れを模擬ページで確かめる。chrome.storage は偽物。
// node tools/fold-harness.js . <jsdom を入れた node_modules>
const fs = require("fs"), path = require("path");
const [repo, mods] = process.argv.slice(2);
const { JSDOM } = require(path.join(mods, "jsdom"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const article = (id, label, extra = "") => `<article data-testid="tweet">
  <div data-testid="User-Name"><a href="/someone">名前</a></div>
  <a href="/someone/status/${id}"><time datetime="2026-10-21T00:00:00Z">1分</time></a>
  ${extra}
  <div data-testid="tweetText"><span>本文 ${id}</span></div>
  ${label === null ? "" : `<div role="group" aria-label="${label}"></div>`}
</article>`;

const ROWDY = "80 件の返信、3 件のリポスト、40 件のいいね、5000 件の表示"; // 返信がいいねより多い
const WIDE = "5 件の返信、900 件のリポスト、8000 件のいいね、300000 件の表示"; // 表示 30 万
const CALM = "2 件の返信、10 件のいいね、800 件の表示";
const page = (tab, body) => `<body>
  <div role="tablist"><div role="tab" aria-selected="${tab === "おすすめ"}">おすすめ</div><div role="tab" aria-selected="${tab === "フォロー中"}">フォロー中</div></div>
  <div id="tl">${body}</div>
</body>`;
const POSTS = [article("1", ROWDY), article("2", WIDE), article("3", CALM), article("4", ROWDY, "<span>広告</span>"), article("5", null)].join("");

function setup({ tab = "おすすめ", body = POSTS, enabled = false, rules = null } = {}) {
  const dom = new JSDOM(page(tab, body), { url: "https://x.com/home", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.document.documentElement.lang = "ja";
  const store = { heatFoldEnabled: enabled, lang: "ja", ...(rules ? { heatFoldRules: rules } : {}) };
  const listeners = [];
  const copy = (v) => JSON.parse(JSON.stringify(v));
  w.chrome = { storage: {
    local: {
      get: (arg, cb) => {
        const res = typeof arg === "string" ? (arg in store ? { [arg]: copy(store[arg]) } : {}) : Object.fromEntries(Object.entries(arg).map(([k, d]) => [k, k in store ? copy(store[k]) : d]));
        if (cb) { setTimeout(() => cb(res), 2); return undefined; }
        return new Promise((r) => setTimeout(() => r(res), 2));
      },
      set: (o) => { Object.assign(store, copy(o)); return Promise.resolve(); },
      remove: (keys) => { for (const k of [].concat(keys)) delete store[k]; return Promise.resolve(); },
    },
    onChanged: { addListener: (f) => listeners.push(f) },
  } };
  w.eval(["x-dom.js", "x-counts.js", "record-core.js", "i18n.js", "log.js", "fold.js"].map((f) => fs.readFileSync(path.join(repo, f), "utf8")).join(";\n"));
  const d = w.document;
  const art = (id) => [...d.querySelectorAll("article")].find((a) => a.querySelector(`a[href$="/status/${id}"]`));
  const st = (id) => art(id)?.getAttribute("data-shizume-fold");
  const fire = (c) => { for (const [k, v] of Object.entries(c)) store[k] = v; for (const f of listeners) f(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { newValue: v }])), "local"); };
  const add = (html) => { d.getElementById("tl").insertAdjacentHTML("beforeend", html); };
  return { w, d, store, art, st, fire, add };
}

const results = [];
const check = (name, ok) => results.push(`${ok ? "OK" : "NG"}  ${name}`);

(async () => {
  let t = setup();
  await wait(50);
  check("初期値（オフ）では何もしない", !t.d.querySelector("[data-shizume-fold]") && !t.d.getElementById("shizume-fold-style"));

  t = setup({ enabled: true });
  await wait(50);
  check("荒れている投稿（返信がいいね以上）をたたむ", t.st("1") === "folded" && !!t.art("1").querySelector(".shizume-fold-box"));
  check("大きく広まった投稿は、初期値ではたたまない", t.st("2") === "open");
  check("ふつうの投稿はたたまない", t.st("3") === "open");
  check("広告は触らない", t.st("4") == null);
  check("数の行が無い投稿は触らない（あとでもう一度見る）", t.st("5") == null);
  const box = t.art("1").querySelector(".shizume-fold-box");
  check("札には理由だけを出し、本文・投稿者名を出さない", /言い合い/.test(box.textContent) && !/本文|名前|someone/.test(box.textContent));
  check("今日たたんだ件数を数える", t.store.heatFoldDay?.n === 1 && t.store.heatFoldDay?.o === 0);
  // X が数の行をあとから入れた
  t.art("5").insertAdjacentHTML("beforeend", `<div role="group" aria-label="${ROWDY}"></div>`);
  await wait(20);
  check("数の行があとから出たら、そのときに見てたたむ", t.st("5") === "folded");

  // 札のクリックは X に届かせない・開く
  let bubbled = 0;
  t.art("1").addEventListener("click", () => bubbled++);
  box.click();
  check("札のクリックは、X の「投稿を開く」まで届かせない", bubbled === 0);
  box.querySelector("button").click();
  await wait(30);
  check("「開く」で中身を見せ、札を消す", t.st("1") === "open" && !t.art("1").querySelector(".shizume-fold-box"));
  check("開いた件数を数える", t.store.heatFoldDay?.o === 1);
  // X が要素を作り直す（同じ投稿の新しい要素）
  t.art("1").remove();
  t.add(article("1", ROWDY));
  await wait(20);
  check("開いた投稿は、X が要素を作り直しても開いたまま", t.st("1") === "open");
  t.add(article("9", ROWDY));
  await wait(30);
  check("同じ投稿を二度数えない・新しい投稿は数える", t.store.heatFoldDay?.n === 3);

  // X が同じ要素に別の投稿を入れた
  const a3 = t.art("3");
  a3.querySelector('a[href*="/status/"]').setAttribute("href", "/someone/status/7");
  a3.querySelector('[role="group"]').setAttribute("aria-label", ROWDY);
  a3.append(t.d.createElement("i")); // 中身の差し替え（子の追加）で走査が起きる
  await wait(20);
  check("同じ要素に別の投稿が入ったら、見直してたたむ", a3.getAttribute("data-shizume-fold") === "folded" && a3.getAttribute("data-shizume-fold-id") === "7");

  // 数があとで増えても、読んでいる最中にはたたまない
  const a2 = t.art("2");
  a2.querySelector('[role="group"]').setAttribute("aria-label", "500 件の返信、10 件のいいね、300000 件の表示");
  a2.append(t.d.createElement("i"));
  await wait(20);
  check("一度見せた投稿は、あとで数が増えてもたたまない", t.st("2") === "open");

  // たたむ形を変える
  t.fire({ heatFoldRules: { rowdy: false, wide: true } });
  await wait(20);
  check("形を変えたら当て直す（大きく広まった投稿をたたみ、荒れている投稿は戻す）", t.st("2") === "folded" && t.st("5") === "open");
  check("札の理由は、広まった形の文", /広まった/.test(t.art("2").querySelector(".shizume-fold-box").textContent));

  // 言語
  t.fire({ lang: "en" });
  await wait(20);
  check("言語を変えたら、札の文も替える", /widely spread/.test(t.art("2").querySelector(".shizume-fold-box").textContent) && t.art("2").querySelector("button").textContent === "Show");

  // オフ
  t.fire({ heatFoldEnabled: false });
  await wait(20);
  check("オフにしたら、印・札・スタイルをすべて消す", !t.d.querySelector("[data-shizume-fold]") && !t.d.querySelector(".shizume-fold-box") && !t.d.getElementById("shizume-fold-style"));
  t.fire({ heatFoldEnabled: true });
  await wait(20);
  check("オンに戻したら、またたたむ", t.st("2") === "folded");

  // フォロー中では触らない
  t = setup({ tab: "フォロー中", enabled: true });
  await wait(50);
  check("フォロー中では触らない", !t.d.querySelector("[data-shizume-fold]"));

  // 記録（record.js）は、たたんだ投稿の本文も読める（D13 の失敗: visibility:hidden で隠すと innerText が空になった）。
  // たたむのは display:none なので、Chrome の innerText は描かれていない要素として textContent を返す（仕様）。jsdom には innerText が無いので、ここでは読む道筋だけを見る
  t = setup({ enabled: true });
  await wait(50);
  check("たたんだ投稿からも本文を読める（印は本文の要素ではなく、外の article に付く）", t.w.shzPostText(t.art("1")) === "本文 1" && t.st("1") === "folded");

  console.log(results.join("\n"));
  const ng = results.filter((r) => r.startsWith("NG")).length;
  console.log(ng ? `NG ${ng}` : `すべて OK（${results.length}）`);
  process.exit(ng ? 1 : 0);
})();
