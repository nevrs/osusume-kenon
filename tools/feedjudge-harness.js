// 記録の判定（feed-judge.js）の流れを模擬ページで確かめる。組み込み AI と chrome.storage は偽物。
// node tools/feedjudge-harness.js . <jsdom を入れた node_modules>
const fs = require("fs"), path = require("path");
const [repo, mods] = process.argv.slice(2);
const { JSDOM } = require(path.join(mods, "jsdom"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;

// 偽の AI: 「馬鹿」を含めば ひとまとめ・見下し、「!」を含めば 動員、それ以外は全部 false。availability を差し替えられる
function setup({ stored = {}, cap = 300, availability = "available", aiDelay = 0, recordEnabled = true, session = null, hidden = false, noAI = false, onSet = null } = {}) {
  const dom = new JSDOM("<body></body>", { url: "https://x.com/home", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const store = { ...stored };
  if (recordEnabled) store.recordEnabled = true;
  if (session) store.session = session;
  const listeners = [];
  const calls = { prompts: [], creates: 0, concurrent: 0, maxConcurrent: 0 };
  const clone = () => ({
    prompt: async (p) => {
      calls.prompts.push(p);
      calls.concurrent++; calls.maxConcurrent = Math.max(calls.maxConcurrent, calls.concurrent);
      if (aiDelay) await wait(aiDelay);
      calls.concurrent--;
      if (/壊れる/.test(p)) throw new Error("この 1 件だけ失敗");
      return JSON.stringify({ lump: /馬鹿/.test(p), contempt: /馬鹿/.test(p), exclusion: false, mobilize: /!/.test(p) });
    },
    destroy() {},
  });
  const ai = { state: availability, availability: async () => ai.state, create: async () => { calls.creates++; return { clone: async () => clone(), destroy() {} }; } };
  if (!noAI) w.LanguageModel = ai;
  Object.defineProperty(w.document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
  const copy = (v) => JSON.parse(JSON.stringify(v));
  w.chrome = { storage: {
    local: {
      get: (arg) => {
        let res;
        if (arg === null) res = copy(store);
        else if (typeof arg === "string") res = arg in store ? { [arg]: copy(store[arg]) } : {};
        else res = Object.fromEntries(Object.entries(arg).map(([k, d]) => [k, k in store ? copy(store[k]) : d]));
        return new Promise((r) => setTimeout(() => r(res), 2));
      },
      set: (o) => { onSet?.(o, store); for (const [k, v] of Object.entries(o)) store[k] = copy(v); return Promise.resolve(); },
      remove: (keys) => { for (const k of [].concat(keys)) delete store[k]; return Promise.resolve(); },
    },
    onChanged: { addListener: (f) => listeners.push(f) },
  } };
  Object.defineProperty(w, "navigator", { value: { userAgent: "Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36" }, configurable: true });
  // 間を縮める。feed-judge.js は設定を const に置いていて、あとの eval からは見えないので、読み込む前に文字を置き換える
  const swap = (src, from, to) => { if (!src.includes(from)) throw new Error(`置き換え先が見つからない: ${from}`); return src.replace(from, to); };
  let fj = fs.readFileSync(path.join(repo, "feed-judge.js"), "utf8");
  for (const [from, to] of [["gapMs: 2500", "gapMs: 20"], ["sessionGapMs: 300", "sessionGapMs: 5"], ["tickMs: 60_000", "tickMs: 100000"], ["startDelayMs: 8000", "startDelayMs: 10"], ["lockMs: 15_000", "lockMs: 400"], ["dailyCap: 300", `dailyCap: ${cap}`]]) fj = swap(fj, from, to);
  w.eval([fs.readFileSync(path.join(repo, "x-dom.js"), "utf8"), fs.readFileSync(path.join(repo, "record-core.js"), "utf8"), fs.readFileSync(path.join(repo, "log.js"), "utf8"), fj].join(";\n"));
  const fire = (c) => { for (const f of listeners) f(c, "local"); };
  return { w, store, calls, ai, fire, run: () => w.eval("shzFjRun()") };
}

const rec = (text, ts = Date.now(), feed = "for-you", extra = {}) => ({ text, feed, ts, ...extra });
const nJudged = (store) => Object.entries(store).filter(([k, r]) => k.startsWith("rec:") && typeof r.g === "number").length;
const results = [];
const check = (name, ok, detail) => results.push(`${ok ? "OK" : "NG"}  ${name}${!ok && detail ? `
    → ${detail}` : ""}`);

(async () => {
  // 基本: 判定して答えと版を書き足す。本文・feed・時刻は変えない
  let t = setup({ stored: { "rec:a": rec("馬鹿じゃないの"), "rec:b": rec("いい天気", Date.now(), "following"), "rec:c": rec("すごい!") } });
  await wait(400);
  const a = t.store["rec:a"], b = t.store["rec:b"], c = t.store["rec:c"];
  check("未判定の記録に、ひとまとめ・見下し・排除・動員の答え（0/1）と版を書く", a.g === 1 && a.c === 1 && a.x === 0 && a.m === 0 && b.g === 0 && b.c === 0 && c.m === 1 && c.g === 0 && a.jv === "group1/c155", JSON.stringify([a, c]));
  check("本文・おすすめ/フォロー中・時刻は変えない", a.text === "馬鹿じゃないの" && a.feed === "for-you" && b.feed === "following" && typeof a.ts === "number");
  check("AI の元は 1 回だけ作る", t.calls.creates === 1);
  check("同時に 2 件は判定しない", t.calls.maxConcurrent === 1);
  check("問いは「投稿:」と本文だけ（キー・投稿者名などを渡さない）", t.calls.prompts.every((p) => p.startsWith("投稿:\n")) && !t.calls.prompts.join("").includes("rec:"));
  await t.run();
  check("判定済みは、もう一度回しても判定し直さない", t.calls.prompts.length === 3);

  // 動作ログ（オンのときだけ。本文・キーを入れない）
  t = setup({ stored: { debugEnabled: true, "rec:a": rec("馬鹿じゃないの"), "rec:b": rec("壊れる投稿") } });
  await wait(2600);
  const lg = JSON.stringify(t.store.debugLog || []);
  check("動作ログをオンにすると、判定の出来事（点・失敗の理由）が残る", /"record-judged"/.test(lg) && /"prompt-error"/.test(lg) && /"c":1/.test(lg), lg.slice(0, 300));
  check("動作ログに、投稿の本文・記録のキーを入れない", !/馬鹿|壊れる投稿|rec:/.test(lg), lg.slice(0, 300));
  t = setup({ stored: { "rec:a": rec("馬鹿") } });
  await wait(2600);
  check("動作ログは、初期値（オフ）では残さない", !("debugLog" in t.store));

  // 記録がオフなら何もしない
  t = setup({ stored: { "rec:a": rec("馬鹿") }, recordEnabled: false });
  await wait(300);
  check("記録がオフなら判定しない", t.calls.prompts.length === 0 && !("g" in t.store["rec:a"]));
  t.store.recordEnabled = true;
  t.fire({ recordEnabled: { newValue: true } });
  await wait(300);
  check("オンにしたら（ページを開き直さなくても）判定を始める", t.store["rec:a"].c === 1);

  // 画面が見えていないとき
  t = setup({ stored: { "rec:a": rec("馬鹿") }, hidden: true });
  await wait(300);
  check("画面が見えていないあいだは判定しない（パッシブ）", t.calls.prompts.length === 0);

  // AI が使えない
  t = setup({ stored: { "rec:a": rec("馬鹿") }, availability: "downloadable" });
  await wait(300);
  check("モデルが未ダウンロードなら作らず、記録を変えない", t.calls.creates === 0 && !("g" in t.store["rec:a"]));
  t.ai.state = "available";
  await t.run();
  check("あとで使えるようになったら判定する", t.store["rec:a"].c === 1);
  t = setup({ stored: { "rec:a": rec("馬鹿") }, noAI: true });
  await wait(300);
  check("組み込み AI が無ければ、記録を変えない", !("g" in t.store["rec:a"]));

  // 1 日の上限
  const many = {};
  for (let i = 0; i < 6; i++) many[`rec:${i}`] = rec("普通の投稿", Date.now() - (10 - i) * 1000);
  t = setup({ stored: many, cap: 3 });
  await wait(600);
  check("パッシブは 1 日の上限（ここでは 3）で止まる", nJudged(t.store) === 3);
  check("古い記録から先に判定する（先に期限が来る）", ["rec:0", "rec:1", "rec:2"].every((k) => typeof t.store[k].g === "number"));

  // 測定モード: 上限なし・記録がオフでも・画面が見えなくても・測定の分を先に
  const m2 = {};
  for (let i = 0; i < 6; i++) m2[`rec:o${i}`] = rec("前の記録", Date.now() - DAY - i * 1000);
  m2["rec:s1"] = rec("馬鹿", Date.now() - 500, "for-you");
  m2["rec:s2"] = rec("ふつう", Date.now() - 400, "following");
  t = setup({ stored: m2, cap: 2, session: { start: Date.now() - 1000, targetEach: 50, prev: false }, recordEnabled: false, hidden: true });
  await wait(1500);
  check("測定モードは、記録がオフでも・画面が見えなくても・上限を超えて判定する", nJudged(t.store) === 8, `判定済み ${nJudged(t.store)} / 8、prompts ${t.calls.prompts.length}`);
  check("測定モードの分を先に判定する", t.calls.prompts.slice(0, 2).some((p) => p.includes("馬鹿")) && t.calls.prompts.slice(0, 2).some((p) => p.includes("ふつう")));

  // 測定を終えたら止まる
  t = setup({ stored: { "rec:a": rec("1"), "rec:b": rec("2"), "rec:c": rec("3"), "rec:d": rec("4") }, session: { start: 0, targetEach: 50, prev: false }, recordEnabled: false, aiDelay: 60 });
  await wait(120);
  t.store.session = { ...t.store.session, end: Date.now() };
  await wait(500);
  const n = t.calls.prompts.length;
  check("測定を終えて記録もオフなら、判定が止まる", n >= 1 && n < 4);

  // 判定中に消された
  t = setup({ stored: { "rec:a": rec("馬鹿"), "rec:b": rec("ふつう") }, aiDelay: 120 });
  await wait(80);
  delete t.store["rec:a"]; // 判定している間に「すべて消す」
  await wait(500);
  check("判定している間に消された記録を、書き戻さない", !("rec:a" in t.store) && typeof t.store["rec:b"].g === "number");

  // 別のタブが判定している
  t = setup({ stored: { "rec:a": rec("馬鹿"), judgeLock: { id: "別のタブ", ts: Date.now() } } });
  await wait(200);
  check("別のタブが判定中（ロックが新しい）なら割り込まない", t.calls.prompts.length === 0);
  await wait(500); // ロックの期限（400ms）が過ぎる
  await t.run();
  check("ロックが古くなったら引き継ぐ", t.store["rec:a"].c === 1);

  // 本文の無い記録は対象にならない
  t = setup({ stored: { "rec:a": { feed: "for-you", ts: Date.now(), h: 5, a: 6, jv: "split1/c155" }, "rec:b": { feed: "for-you", ts: Date.now() } } });
  await wait(300);
  check("本文の無い記録（前の判定の点だけ・抜け殻）は判定しない", t.calls.prompts.length === 0 && t.store["rec:a"].h === 5);

  // 前の問い（怒り・敵意の点）で判定した記録は、本文があれば新しい問いで判定し直し、前の点は消す
  t = setup({ stored: { "rec:a": { text: "馬鹿ばっかり", feed: "for-you", ts: Date.now(), a: 80, h: 90, jv: "split1/c155" } } });
  await wait(300);
  const ra = t.store["rec:a"];
  check("前の問いの判定は、本文があれば新しい問いで判定し直し、怒り・敵意の点は消す", ra.g === 1 && ra.c === 1 && !("a" in ra) && !("h" in ra) && ra.jv === "group1/c155" && ra.text === "馬鹿ばっかり", JSON.stringify(ra));

  // 答えが壊れて返ったとき
  t = setup({ stored: { "rec:a": rec("x") } });
  t.ai.create = async () => ({ clone: async () => ({ prompt: async () => JSON.stringify({ lump: "はい", contempt: false, exclusion: false, mobilize: false }), destroy() {} }), destroy() {} });
  await wait(300);
  check("答えが true/false で返らなければ書かない", !("g" in t.store["rec:a"]));

  // 1 件だけ失敗する記録があっても、後ろを続ける
  t = setup({ stored: { "rec:a": rec("壊れる投稿", Date.now() - 3000), "rec:b": rec("ふつう", Date.now() - 2000), "rec:c": rec("馬鹿", Date.now() - 1000) } });
  await wait(500);
  check("1 件だけ判定に失敗しても、後ろの記録は判定する", !("g" in t.store["rec:a"]) && t.store["rec:b"].c === 0 && t.store["rec:c"].c === 1);
  const before = t.calls.prompts.length;
  await t.run();
  check("失敗した記録を、見回りのたびに繰り返し試さない", t.calls.prompts.length === before);
  check("1 件の失敗では AI の元を作り直さない", t.calls.creates === 1);

  // 書く直前に「すべて消す」が割り込んでも、本文を戻さない
  let hit = false;
  t = setup({ stored: { "rec:a": rec("馬鹿") }, onSet: (o, store) => { if (!hit && "rec:a" in o) { hit = true; store.recordClearedAt = 123; delete store["rec:a"]; } } });
  await wait(400);
  check("書く直前に「すべて消す」が割り込んでも、記録を復活させない", hit && !("rec:a" in t.store));

  // 書く直前に「本文だけ消す」が割り込んだら、本文を戻さない
  hit = false;
  t = setup({ stored: { "rec:a": rec("馬鹿", Date.now() - 5000) }, onSet: (o, store) => { if (!hit && "rec:a" in o) { hit = true; store.textClearedAt = Date.now() + 1; } } });
  await wait(400);
  check("書く直前に「本文だけ消す」が割り込んだら、本文を消し直し、答えは残す", hit && t.store["rec:a"] && !("text" in t.store["rec:a"]) && t.store["rec:a"].c === 1);

  // 測定モードの判定は、パッシブの 1 日の枠に入れない
  t = setup({ stored: { "rec:a": rec("1"), "rec:b": rec("2") }, session: { start: Date.now() - 1000, targetEach: 50, prev: false }, recordEnabled: false });
  await wait(400);
  check("測定モードの判定は、1 日の件数（judgeDay）に数えない", nJudged(t.store) === 2 && !t.store.judgeDay);
  t = setup({ stored: { "rec:a": rec("1"), "rec:b": rec("2") } });
  await wait(400);
  check("（前提）パッシブの判定は 1 日の件数に数える", t.store.judgeDay?.n === 2);

  // AI の元の複製が壊れたら、元を作り直す（このタブの全件を飛ばし続けない）
  let cloneBroken = true;
  t = setup({ stored: { "rec:a": rec("馬鹿"), "rec:b": rec("ふつう") } });
  const origCreate = t.ai.create;
  t.ai.create = async () => {
    const base = await origCreate();
    const c = base.clone;
    base.clone = async () => { if (cloneBroken) throw new Error("元が壊れた"); return c(); };
    return base;
  };
  await wait(300);
  check("複製に失敗したら、その回は止め、記録は飛ばさない", !("g" in t.store["rec:a"]) && !("g" in t.store["rec:b"]));
  cloneBroken = false;
  await t.run();
  check("元を作り直して、あとの見回りで判定する", t.store["rec:a"].c === 1 && t.store["rec:b"].c === 0 && t.calls.creates >= 2);

  console.log(results.join("\n"));
  process.exit(results.some((x) => x.startsWith("NG")) ? 1 : 0);
})();
