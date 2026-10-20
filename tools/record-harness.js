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
  </div>
</body>`;

function setup({ url = "https://x.com/home", tab = "おすすめ", stored = {}, enabled = false } = {}) {
  const dom = new JSDOM(page(tab), { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const store = { ...stored };
  if (enabled) store.recordEnabled = true;
  const listeners = [];
  const ios = [];
  w.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.observed = new Set(); ios.push(this); } observe(el) { this.observed.add(el); } disconnect() { this.observed.clear(); this.dead = true; } };
  Object.defineProperty(w, "crypto", { value: nodeCrypto.webcrypto, configurable: true }); // jsdom 既定の crypto には subtle が無い
  w.TextEncoder = TextEncoder;
  w.chrome = { storage: {
    local: {
      get: (arg, cb) => {
        const res = arg === null ? { ...store } : Object.fromEntries(Object.entries(arg).map(([k, d]) => [k, k in store ? store[k] : d]));
        if (cb) { setTimeout(() => cb(res), 20); return undefined; }
        return Promise.resolve(res);
      },
      set: (o, cb) => { Object.assign(store, o); cb?.(); return Promise.resolve(); },
      remove: (keys) => { for (const k of [].concat(keys)) delete store[k]; return Promise.resolve(); },
    },
    onChanged: { addListener: (f) => listeners.push(f) },
  } };
  w.eval(["x-dom.js", "record-core.js", "record.js"].map((f) => fs.readFileSync(path.join(repo, f), "utf8")).join(";\n"));
  const d = w.document;
  const art = (id) => [...d.querySelectorAll("article")].find((a) => a.querySelector(`a[href$="/status/${id}"]`));
  const see = (id, ratio = 0.8) => { for (const io of ios) if (io.observed.has(art(id))) io.cb([{ target: art(id), isIntersecting: ratio > 0, intersectionRatio: ratio }]); };
  const setEnabled = (v) => { store.recordEnabled = v; for (const f of listeners) f({ recordEnabled: { newValue: v } }, "local"); };
  const recs = () => Object.fromEntries(Object.entries(store).filter(([k]) => k.startsWith("rec:")));
  return { w, d, store, ios, art, see, setEnabled, recs };
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
  check("オンなら見張りを始める", t.ios.length === 1 && t.ios[0].observed.size === 6);
  check("オンにしたとき、14 日より古い記録を消す", !("rec:old" in t.store) && `rec:${hashOf("666")}` in t.store);
  for (const id of ["111", "222", "333", "444", "666"]) t.see(id);
  t.see("111"); // 同じ投稿をもう一度
  t.see("555"); await wait(500); t.see("555", 0); // 1 秒たつ前に画面から出る
  await wait(5600);
  const r = t.recs();
  const get = (id) => r[`rec:${hashOf(id)}`];
  check("見えていた投稿の本文・おすすめ・時刻を残す", get("111")?.text === "怒っている投稿です" && get("111")?.feed === "for-you" && typeof get("111")?.ts === "number");
  check("残す項目は本文・feed・時刻だけ（投稿者名・リンク・元の ID を残さない）", JSON.stringify(Object.keys(get("111")).sort()) === '["feed","text","ts"]' && !JSON.stringify(r).includes("someone") && !JSON.stringify(r).includes("status") && !Object.keys(r).some((k) => k.includes("111")));
  check("引用の投稿は、自分の本文だけを残す（引用元の本文は残さない）", get("222")?.text === "自分の本文" && !JSON.stringify(r).includes("引用元の本文"));
  check("広告は残さない", !get("333"));
  check("本文の無い投稿（画像だけ）は残さない", !get("444"));
  check("1 秒たつ前に画面から出た投稿は残さない", !get("555"));
  check("同じ投稿は二重に残さない（保存済みも）", Object.keys(r).filter((k) => get("111") && r[k] === get("111")).length === 1 && Object.keys(r).length === 3);

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

  console.log(results.join("\n"));
  process.exit(results.some((x) => x.startsWith("NG")) ? 1 : 0);
})();
