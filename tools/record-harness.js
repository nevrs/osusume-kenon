// 記録（record.js・record-core.js）の流れを模擬ページで確かめる。見えているかの判定（IntersectionObserver）と chrome.storage は偽物。
// node tools/record-harness.js . <jsdom を入れた node_modules>
const fs = require("fs"), path = require("path"), nodeCrypto = require("node:crypto");
const [repo, mods] = process.argv.slice(2);
const { JSDOM } = require(path.join(mods, "jsdom"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
const hashOf = (id) => nodeCrypto.createHash("sha256").update(`shizume:${id}`).digest().subarray(0, 8).toString("hex");

const article = (id, text, extra = "") => `<article data-testid="tweet">
  <div data-testid="User-Name"><a href="/someone">名前</a></div>
  <a href="/someone/status/${id}"><time datetime="2026-10-21T00:00:00Z">1分</time></a>
  ${extra}
  ${text === null ? "" : `<div data-testid="tweetText"><span>${text}</span></div>`}
  <div role="group" aria-label="1 件の返信、2 件のいいね"></div>
</article>`;

const page = (tab) => `<body>
  <div role="tablist"><div role="tab" aria-selected="${tab === "おすすめ"}">おすすめ</div><div role="tab" aria-selected="${tab === "フォロー中"}">フォロー中</div></div>
  <div id="tl">
    ${article("111", "怒っている投稿です")}
    ${article("222", "自分の本文", `<div role="link"><a href="/other/status/999"><time>2日</time></a><div data-testid="tweetText"><span>引用元の本文</span></div></div>`)}
    ${article("333", "広告の本文", `<span>広告</span>`)}
    ${article("444", null)}
    ${article("555", "すぐ画面から出る投稿")}
    ${article("666", "保存済みの投稿")}
    ${article("777", "表示名が Ad の人の投稿").replace('<a href="/someone">名前</a>', '<span>Ad</span>')}
  </div>
</body>`;

function setup({ url = "https://x.com/home", tab = "おすすめ", stored = {}, enabled = false } = {}) {
  const dom = new JSDOM(page(tab), { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const store = { ...stored };
  const writes = {}; // キーごとの書き込み回数
  if (enabled) store.recordEnabled = true;
  const listeners = [];
  const ios = [];
  const delay = { ms: 20 }; // 読み出しにかかる時間（割り込みの試験で伸ばす）
  w.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.observed = new Set(); ios.push(this); } observe(el) { this.observed.add(el); } disconnect() { this.observed.clear(); this.dead = true; } };
  Object.defineProperty(w, "crypto", { value: nodeCrypto.webcrypto, configurable: true }); // jsdom 既定の crypto には subtle が無い
  w.TextEncoder = TextEncoder;
  w.chrome = { storage: {
    local: {
      get: (arg, cb) => {
        const res = arg === null ? { ...store } : Array.isArray(arg) ? Object.fromEntries(arg.filter((k) => k in store).map((k) => [k, store[k]])) : Object.fromEntries(Object.entries(arg).map(([k, d]) => [k, k in store ? store[k] : d]));
        if (cb) { setTimeout(() => cb(res), delay.ms); return undefined; }
        return Promise.resolve(res);
      },
      set: (o, cb) => { for (const k of Object.keys(o)) writes[k] = (writes[k] || 0) + 1; Object.assign(store, o); cb?.(); return Promise.resolve(); },
      remove: (keys) => { for (const k of [].concat(keys)) delete store[k]; return Promise.resolve(); },
    },
    onChanged: { addListener: (f) => listeners.push(f) },
  } };
  w.eval(["x-dom.js", "record-core.js", "log.js", "record.js"].map((f) => fs.readFileSync(path.join(repo, f), "utf8")).join(";\n"));
  const d = w.document;
  const art = (id) => [...d.querySelectorAll("article")].find((a) => a.querySelector(`a[href$="/status/${id}"]`));
  const see = (id, ratio = 0.8) => { for (const io of ios) if (io.observed.has(art(id))) io.cb([{ target: art(id), isIntersecting: ratio > 0, intersectionRatio: ratio }]); };
  const setEnabled = (v) => { store.recordEnabled = v; for (const f of listeners) f({ recordEnabled: { newValue: v } }, "local"); };
  // 設定画面と同じ順: 先に recordClearedAt を書いて開いているタブに伝え、そのあとで記録を消す
  const clearAll = () => { store.recordClearedAt = Date.now(); for (const f of listeners) f({ recordClearedAt: { newValue: store.recordClearedAt } }, "local"); for (const k of Object.keys(store)) if (k.startsWith("rec:")) delete store[k]; };
  const recs = () => Object.fromEntries(Object.entries(store).filter(([k]) => k.startsWith("rec:")));
  const fire = (c) => { for (const f of listeners) f(c, "local"); };
  return { w, d, store, ios, art, see, setEnabled, clearAll, recs, writes, fire, delay };
}

const results = [];
const check = (name, ok) => results.push(`${ok ? "OK" : "NG"}  ${name}`);

(async () => {
  // オフ（初期値）
  let t = setup();
  await wait(100);
  check("初期値（オフ）では見張りを始めない", t.ios.length === 0);
  t.see("111");
  await wait(1300);
  check("初期値（オフ）では何も残さない", Object.keys(t.recs()).length === 0);

  // オン
  t = setup({ stored: { [`rec:${hashOf("666")}`]: { text: "保存済みの投稿", feed: "for-you", ts: Date.now() - DAY }, "rec:old": { text: "古い", feed: "for-you", ts: Date.now() - 20 * DAY } }, enabled: true });
  await wait(150);
  check("オンなら見張りを始める", t.ios.length === 1 && t.ios[0].observed.size === 7);
  check("オンにしたとき、14 日より古い記録を消す", !("rec:old" in t.store) && `rec:${hashOf("666")}` in t.store);
  for (const id of ["111", "222", "333", "444", "666"]) t.see(id);
  t.see("111"); // 同じ投稿をもう一度
  t.see("555"); await wait(250); t.see("555", 0); // 0.5 秒たつ前に画面から出る
  const ts666 = t.store[`rec:${hashOf("666")}`].ts;
  await wait(5600);
  t.see("111"); t.see("666"); t.see("777"); // 保存したあとで、同じ投稿をもう一度見る（777 は初めて）
  await wait(5300);
  const r = t.recs();
  const get = (id) => r[`rec:${hashOf(id)}`];
  check("見えていた投稿の本文・おすすめ・時刻を残す", get("111")?.text === "怒っている投稿です" && get("111")?.feed === "for-you" && typeof get("111")?.ts === "number");
  check("残す項目は本文・feed・時刻だけ（投稿者名・リンク・元の ID を残さない）", JSON.stringify(Object.keys(get("111")).sort()) === '["feed","text","ts"]' && !JSON.stringify(r).includes("someone") && !JSON.stringify(r).includes("status") && !Object.keys(r).some((k) => k.includes("111")));
  check("引用の投稿は、自分の本文だけを残す（引用元の本文は残さない）", get("222")?.text === "自分の本文" && !JSON.stringify(r).includes("引用元の本文"));
  check("広告は残さない", !get("333"));
  check("本文の無い投稿（画像だけ）は残さない", !get("444"));
  check("0.5 秒たつ前に画面から出た投稿は残さない", !get("555"));
  check("保存したあとで同じ投稿をもう一度見ても、書き直さない", t.writes[`rec:${hashOf("111")}`] === 1);
  check("前に保存済みの投稿は、見ても時刻を書き換えない", get("666")?.ts === ts666 && !t.writes[`rec:${hashOf("666")}`]);
  check("表示名が「Ad」の人の投稿は、広告とみなさず残す", get("777")?.text === "表示名が Ad の人の投稿");
  check("X のページから見える印（data-shizume-*）を付けない", ![...t.d.querySelectorAll("*")].some((el) => [...el.attributes].some((a) => a.name.startsWith("data-shizume"))));

  // フォロー中・別のページ
  t = setup({ tab: "フォロー中", enabled: true });
  await wait(150);
  t.see("111");
  await wait(5300);
  check("「フォロー中」では feed を following にして残す", t.recs()[`rec:${hashOf("111")}`]?.feed === "following");
  t = setup({ url: "https://x.com/search?q=a", enabled: true });
  await wait(150);
  t.see("111");
  await wait(5300);
  check("/home 以外（検索など）では残さない", Object.keys(t.recs()).length === 0);

  // 途中でオフ・オン
  t = setup({ enabled: true });
  await wait(150);
  t.see("111");
  await wait(1300); // 見たと判定されたが、まだ保存していない（4 秒のまとめ保存の前）
  t.setEnabled(false);
  await wait(4500);
  check("途中でオフにしたら、保存待ちの記録も捨てる", Object.keys(t.recs()).length === 0 && t.ios[0].dead === true);
  t.setEnabled(true);
  await wait(150);
  check("オンにし直すと、ページを開き直さなくても見張りを再開する", t.ios.length === 2 && t.ios[1].observed.size >= 1);
  t.see("222"); // 新しい見張りで別の投稿を見る
  await wait(5300);
  const again = Object.values(t.recs()).map((x) => x.text);
  check("オンにし直したあと、オフ前の保存待ちが書き込まれない", again.length === 1 && again[0] === "自分の本文");

  t = setup({ stored: { "rec:old": { text: "古い", feed: "for-you", ts: Date.now() - 20 * DAY } } });
  await wait(150);
  check("オフのままでも、X のページを開いたとき期限の過ぎた記録を消す", !("rec:old" in t.store));

  t = setup({ enabled: true });
  await wait(150);
  t.see("111");
  await wait(1300); // 見たと判定されたが、まだ保存していない
  t.clearAll(); // 設定画面の「すべて消す」
  await wait(4500);
  check("「すべて消す」のあと、開いているタブの保存待ちが書き戻されない", Object.keys(t.recs()).length === 0);
  t.see("111");
  await wait(5300);
  check("「すべて消す」のあと、同じ投稿をまた見たら記録できる（記録済みの覚えも捨てた）", Object.keys(t.recs()).length === 1);

  t = setup({ enabled: false });
  await wait(100);
  t.setEnabled(true);
  t.setEnabled(false); // 準備の途中でオフ
  await wait(200);
  t.see("111");
  await wait(5300);
  check("オンの準備中にオフにしたら、記録を始めない", t.ios.every((io) => io.dead || io.observed.size === 0) && Object.keys(t.recs()).length === 0);

  t = setup({ enabled: true });
  await wait(150);
  t.see("111");
  await wait(1300);
  t.setEnabled(false);
  t.setEnabled(true);
  await wait(150);
  t.see("111");
  await wait(5300);
  check("オフで捨てた投稿も、オンに戻したあとに見れば記録できる", t.recs()[`rec:${hashOf("111")}`]?.text === "怒っている投稿です");

  t = setup({ enabled: false });
  await wait(100);
  t.setEnabled(true);
  t.clearAll(); // オンにする準備の途中で「すべて消す」
  await wait(200);
  t.see("111");
  await wait(5300);
  check("オンの準備中に「すべて消す」が届いても、記録は続く", t.recs()[`rec:${hashOf("111")}`]?.text === "怒っている投稿です");

  // 別のタブが先に残した、判定済みの記録を上書きしない
  t = setup({ enabled: true });
  await wait(150);
  const judged = { feed: "following", ts: Date.now() - 1000, a: 81, h: 92, jv: "split1/c155" };
  t.store[`rec:${hashOf("111")}`] = judged; // このタブがオンにしたあとで、別のタブが残して判定まで済ませた
  t.see("111");
  await wait(5300);
  check("別のタブが先に残した判定済みの記録を、本文だけの記録で上書きしない", JSON.stringify(t.store[`rec:${hashOf("111")}`]) === JSON.stringify(judged) && !t.writes[`rec:${hashOf("111")}`]);

  // 「本文だけ消す」: まだ保存していない分は残さない
  t = setup({ enabled: true });
  await wait(150);
  t.see("111");
  await wait(1300); // 見たと判定されたが、まだ保存していない
  t.store.textClearedAt = Date.now();
  t.fire({ textClearedAt: { newValue: t.store.textClearedAt } });
  await wait(4500);
  check("「本文だけ消す」のあと、開いているタブの保存待ちが本文つきで書かれない", Object.keys(t.recs()).length === 0);
  t.see("222");
  await wait(5300);
  check("「本文だけ消す」のあとも、別の投稿は記録を続ける", t.recs()[`rec:${hashOf("222")}`]?.text === "自分の本文");

  // ページを離れるとき、読み出しを待たずにすぐ書く
  t = setup({ enabled: true });
  await wait(150);
  t.see("111");
  await wait(1300); // 見たと判定されたが、まだ保存していない
  t.delay.ms = 100000; // 読み出しのコールバックは、ページが消えるまで返ってこない
  t.w.dispatchEvent(new t.w.Event("pagehide"));
  await wait(50);
  check("ページを離れるときは、読み出しの返事を待たずに保存待ちを書く", t.recs()[`rec:${hashOf("111")}`]?.text === "怒っている投稿です");

  // 保存の読み出しを待っている間に「すべて消す」「本文だけ消す」が来ても、本文を戻さない
  t = setup({ enabled: true });
  await wait(150);
  t.see("111");
  await wait(1300);
  t.delay.ms = 300;
  t.w.eval("shzFlush()"); // 保存の読み出しを始める
  t.clearAll(); // 読み出しの返事を待っている間に「すべて消す」
  await wait(600);
  check("保存の読み出しを待つ間に「すべて消す」が来たら、その保存を捨てる", Object.keys(t.recs()).length === 0);
  t = setup({ enabled: true });
  await wait(150);
  t.see("111");
  await wait(1300);
  t.delay.ms = 300;
  t.w.eval("shzFlush()");
  t.store.textClearedAt = Date.now();
  t.fire({ textClearedAt: { newValue: t.store.textClearedAt } });
  await wait(600);
  check("保存の読み出しを待つ間に「本文だけ消す」が来たら、その保存を捨てる", Object.keys(t.recs()).length === 0);

  console.log(results.join("\n"));
  process.exit(results.some((x) => x.startsWith("NG")) ? 1 : 0);
})();
