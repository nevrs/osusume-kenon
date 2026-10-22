// 敵意の強い投稿をたたむ機能（fold.js）の流れを模擬ページで確かめる。組み込み AI と chrome.storage は偽物。
// node tools/fold-harness.js . <jsdom を入れた node_modules>
const fs = require("fs"), path = require("path");
const [repo, mods] = process.argv.slice(2);
const { JSDOM } = require(path.join(mods, "jsdom"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const article = (id, text, extra = "") => `<article data-testid="tweet">
  <div data-testid="User-Name"><a href="/someone">名前</a></div>
  <a href="/someone/status/${id}"><time datetime="2026-10-21T00:00:00Z">1分</time></a>
  ${extra}
  ${text === null ? "" : `<div data-testid="tweetText"><span>${text}</span></div>`}
  <div role="group" aria-label="1 件の返信、2 件のいいね"></div>
</article>`;

const page = (tab, body) => `<body>
  <div role="tablist"><div role="tab" aria-selected="${tab === "おすすめ"}">おすすめ</div><div role="tab" aria-selected="${tab === "フォロー中"}">フォロー中</div></div>
  <div id="tl">${body}</div>
</body>`;

const POSTS = [article("1", "馬鹿じゃないの"), article("2", "いい天気ですね"), article("3", "広告の馬鹿", `<span>広告</span>`), article("4", null), article("5", "壊れる投稿")].join("");

// 偽の AI: 「馬鹿」を含めば 敵意 90、それ以外は 0。「壊れる」は 1 件だけ失敗
function setup({ tab = "おすすめ", body = POSTS, foldEnabled = false, aiDelay = 0, noAI = false, lang = "ja", waitMs = 6000, aiOffMs = 60000 } = {}) {
  const dom = new JSDOM(page(tab, body), { url: "https://x.com/home", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const store = { foldEnabled, lang };
  const writes = [];
  const listeners = [];
  const calls = { prompts: [] };
  const clone = () => ({
    prompt: async (p) => {
      calls.prompts.push(p);
      if (aiDelay) await wait(aiDelay);
      if (/壊れる/.test(p)) throw new Error("この 1 件だけ失敗");
      return JSON.stringify({ anger: /馬鹿/.test(p) ? 80 : 0, hostility: /馬鹿/.test(p) ? 90 : 0 });
    },
    destroy() {},
  });
  if (!noAI) w.LanguageModel = { availability: async () => "available", create: async () => ({ clone: async () => clone(), destroy() {} }) };
  Object.defineProperty(w.document, "visibilityState", { value: "visible", configurable: true });
  const copy = (v) => JSON.parse(JSON.stringify(v));
  w.chrome = { storage: {
    local: {
      get: (arg, cb) => {
        const res = typeof arg === "string" ? (arg in store ? { [arg]: copy(store[arg]) } : {}) : Object.fromEntries(Object.entries(arg).map(([k, d]) => [k, k in store ? copy(store[k]) : d]));
        if (cb) { setTimeout(() => cb(res), 2); return undefined; }
        return new Promise((r) => setTimeout(() => r(res), 2));
      },
      set: (o) => { writes.push(Object.keys(o).join(",")); Object.assign(store, copy(o)); return Promise.resolve(); },
      remove: (keys) => { for (const k of [].concat(keys)) delete store[k]; return Promise.resolve(); },
    },
    onChanged: { addListener: (f) => listeners.push(f) },
  } };
  Object.defineProperty(w, "navigator", { value: { userAgent: "Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36" }, configurable: true });
  const swap = (src, from, to) => { if (!src.includes(from)) throw new Error(`置き換え先が見つからない: ${from}`); return src.replace(from, to); };
  let fold = fs.readFileSync(path.join(repo, "fold.js"), "utf8");
  fold = swap(fold, "waitMs: 6000", `waitMs: ${waitMs}`);
  fold = swap(fold, "aiOffMs: 60_000", `aiOffMs: ${aiOffMs}`);
  const fj = swap(fs.readFileSync(path.join(repo, "feed-judge.js"), "utf8"), "startDelayMs: 8000", "startDelayMs: 100000000");
  w.eval([fs.readFileSync(path.join(repo, "x-dom.js"), "utf8"), fs.readFileSync(path.join(repo, "record-core.js"), "utf8"), fs.readFileSync(path.join(repo, "i18n.js"), "utf8"), fj, fold].join(";\n"));
  const d = w.document;
  const art = (id) => [...d.querySelectorAll("article")].find((a) => a.querySelector(`a[href$="/status/${id}"]`));
  const st = (id) => art(id)?.getAttribute("data-shizume-fold");
  const setFold = (v) => { store.foldEnabled = v; for (const f of listeners) f({ foldEnabled: { newValue: v } }, "local"); };
  const add = (html) => { d.getElementById("tl").insertAdjacentHTML("beforeend", html); };
  return { w, d, store, writes, calls, art, st, setFold, add };
}

const results = [];
const check = (name, ok, detail) => results.push(`${ok ? "OK" : "NG"}  ${name}${!ok && detail ? `
    → ${detail}` : ""}`);

(async () => {
  // オフが初期値
  let t = setup();
  await wait(300);
  check("初期値（オフ）では何も隠さず、AI も呼ばない", [...t.d.querySelectorAll("article")].every((a) => !a.hasAttribute("data-shizume-fold")) && !t.d.getElementById("shizume-fold-style") && t.calls.prompts.length === 0);

  // オン
  t = setup({ foldEnabled: true, aiDelay: 60 });
  await wait(30);
  check("判定が終わるまでは、「判定待ち」にして中身を見せない", t.st("1") === "pending" && t.st("2") === "pending");
  await wait(900);
  check("敵意が強い投稿は、たたむ（札を出し、本文は隠れる）", t.st("1") === "folded" && !!t.art("1").querySelector(".shizume-fold-box"));
  check("普通の投稿は、見せる（札を出さない）", t.st("2") === "open" && !t.art("2").querySelector(".shizume-fold-box"));
  const box = t.art("1").querySelector(".shizume-fold-box");
  check("札には本文も投稿者名も入れない", !box.textContent.includes("馬鹿") && !box.textContent.includes("名前"));
  check("広告・本文の無い投稿には、何もしない", t.st("3") === null && t.st("4") === null);
  check("1 件だけ判定に失敗した投稿は、たたまずに見せる", t.st("5") === "open");
  check("問いは「投稿:」と本文だけ", t.calls.prompts.every((p) => p.startsWith("投稿:\n")) && t.calls.prompts.length === 3, JSON.stringify(t.calls.prompts));
  check("保存するのは今日の件数（foldDay）だけで、本文は保存しない", t.writes.every((k) => k === "foldDay") && JSON.stringify(t.store).includes("馬鹿") === false && t.store.foldDay?.n === 1, JSON.stringify([t.writes, t.store.foldDay]));

  // 開く（X の側の「投稿を開く」まで、クリックが届かない）
  let reached = 0;
  t.art("1").addEventListener("click", () => { reached++; });
  t.art("1").querySelector(".shizume-fold-box button").click();
  t.art("1").addEventListener("click", () => {}); 
  check("「開く」のクリックは、X の投稿を開く処理（外側の article）まで届かない", reached === 0, String(reached));
  check("「開く」を押すと、見せる", t.st("1") === "open" && !t.art("1").querySelector(".shizume-fold-box"));
  // X が要素を作り直す
  const html = t.art("1").outerHTML;
  t.art("1").remove();
  t.add(html.replace(/ data-shizume-fold="[^"]*"/, ""));
  await wait(200);
  check("X が要素を作り直しても、開いた投稿は閉じ直さない", t.st("1") === "open");
  const n = t.calls.prompts.length;
  t.art("2").remove();
  t.add(article("2", "いい天気ですね"));
  await wait(200);
  check("判定済みの投稿は、作り直されても判定し直さない", t.calls.prompts.length === n && t.st("2") === "open");
  t.add(article("6", "馬鹿ばっかり"));
  await wait(300);
  check("あとから出た投稿も、たたむ", t.st("6") === "folded");
  check("件数は、たたんだ投稿ごとに 1 回だけ数える", t.store.foldDay.n === 2, String(t.store.foldDay?.n));

  // オフに戻す
  t.setFold(false);
  check("オフにすると、すべて元に戻る（印・札・スタイルが消える）", [...t.d.querySelectorAll("article")].every((a) => !a.hasAttribute("data-shizume-fold")) && !t.d.querySelector(".shizume-fold-box") && !t.d.getElementById("shizume-fold-style"));
  t.add(article("7", "馬鹿"));
  await wait(200);
  check("オフのあいだに出た投稿には、何もしない", t.st("7") === null);
  t.setFold(true);
  await wait(300);
  check("オンに戻すと（ページを開き直さなくても）また動く", t.st("7") === "folded");

  // フォロー中
  t = setup({ foldEnabled: true, tab: "フォロー中" });
  await wait(300);
  check("「フォロー中」の投稿には、何もしない", [...t.d.querySelectorAll("article")].every((a) => !a.hasAttribute("data-shizume-fold")) && t.calls.prompts.length === 0);

  // 判定が間に合わない
  t = setup({ foldEnabled: true, aiDelay: 400, waitMs: 100, body: article("1", "馬鹿") + article("2", "ふつう") });
  await wait(250);
  check("判定が間に合わなければ、見せる（空白のままにしない）", t.st("1") === "open" && t.st("2") === "open");
  await wait(900);
  check("間に合わずに見せたあと、遅れて出た判定で閉じ直さない", t.st("1") === "open");

  // 間に合わなかった投稿の判定も覚える（作り直されたとき、また空白にしない）
  t.art("1").remove();
  t.add(article("1", "馬鹿"));
  await wait(50);
  check("間に合わずに見せた投稿は、遅れて届いた判定を覚え、作り直されたら（空白を経ずに）すぐ判定どおりにする", t.st("1") === "folded", String(t.st("1")));

  // 同じ要素に別の投稿が入る
  t = setup({ foldEnabled: true, body: article("1", "馬鹿じゃないの") });
  await wait(400);
  const a1 = t.art("1");
  check("（前提）最初の投稿はたたまれている", t.st("1") === "folded");
  a1.querySelector("time").parentElement.setAttribute("href", "/someone/status/9");
  a1.querySelector('[data-testid="tweetText"] span').textContent = "いい天気";
  t.add(article("2", "ふつう")); // 変化を起こして走査させる
  await wait(400);
  check("X が同じ要素に別の投稿を入れたら、前の印を捨てて判定し直す（別の投稿を隠したままにしない）", a1.getAttribute("data-shizume-fold") === "open" && !a1.querySelector(".shizume-fold-box"), String(a1.getAttribute("data-shizume-fold")));

  // 英語
  t = setup({ foldEnabled: true, lang: "en", body: article("1", "馬鹿じゃないの") });
  await wait(400);
  const eb = t.art("1").querySelector(".shizume-fold-box");
  check("言語が英語なら、札も英語で出す", !!eb && eb.textContent.includes("1 hostile post folded") && eb.querySelector("button").textContent === "Open", eb && eb.textContent);
  // AI が使えない
  t = setup({ foldEnabled: true, noAI: true });
  await wait(300);
  check("組み込み AI が無ければ、たたまず全部見せる（空白で止まらない）", [...t.d.querySelectorAll("article")].filter((a) => a.hasAttribute("data-shizume-fold")).every((a) => a.getAttribute("data-shizume-fold") === "open") && t.st("1") === "open");
  t.add(article("8", "馬鹿"));
  await wait(200);
  check("AI が使えないと分かったあと、しばらくは先に隠さない", t.st("8") === null);

  // 設定画面の項目
  const html2 = fs.readFileSync(path.join(repo, "options.html"), "utf8"), i18n = fs.readFileSync(path.join(repo, "i18n.js"), "utf8");
  check("設定画面にチェックがあり、初期値はオフと書いてある（日本語・英語とも）", /id="foldEnabled"/.test(html2) && /foldLabel: "\*\*敵意の強い投稿をたたむ（試験）\*\*（初期値はオフ）"/.test(i18n) && /foldLabel: "\*\*Fold hostile posts \(experimental\)\*\* \(off by default\)"/.test(i18n));
  const src = fs.readFileSync(path.join(repo, "fold.js"), "utf8");
  check("fold.js は innerHTML を使わず、X のボタンを押さない（.click() を呼ばない）", !/innerHTML|insertAdjacentHTML/.test(src) && !/\.click\(\)/.test(src));

  console.log(results.join("\n"));
  process.exit(results.some((x) => x.startsWith("NG")) ? 1 : 0);
})();
