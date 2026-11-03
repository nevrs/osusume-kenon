// 設定画面（options.html・options.js）の動きを模擬ページで確かめる。chrome.storage は偽物。
// node tools/options-harness.js . <jsdom を入れた node_modules>
const fs = require("fs"), path = require("path");
const [repo, mods] = process.argv.slice(2);
const { JSDOM } = require(path.join(mods, "jsdom"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
const now = Date.now();

function setup(stored = {}) {
  const html = fs.readFileSync(path.join(repo, "options.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const store = JSON.parse(JSON.stringify({ lang: "ja", ...stored }));
  const listeners = [];
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const notify = (keys) => { const c = Object.fromEntries(keys.map((k) => [k, { newValue: store[k] }])); for (const f of listeners) f(c, "local"); };
  w.chrome = { storage: {
    local: {
      get: (arg, cb) => {
        const res = arg === null ? copy(store) : Object.fromEntries(Object.entries(arg).map(([k, d]) => [k, k in store ? copy(store[k]) : d]));
        if (cb) { setTimeout(() => cb(res), 2); return undefined; }
        return Promise.resolve(res);
      },
      set: (o, cb) => { for (const [k, v] of Object.entries(o)) store[k] = copy(v); notify(Object.keys(o)); cb?.(); return Promise.resolve(); },
      remove: (keys) => { const ks = [].concat(keys); for (const k of ks) delete store[k]; return Promise.resolve(); },
    },
    onChanged: { addListener: (f) => listeners.push(f) },
  } };
  const opened = []; // X で共有で開いた URL（D27）
  w.open = (url) => { opened.push(url); return null; };
  w.eval(["i18n.js", "x-counts.js", "record-core.js", "stats-core.js", "baseline.js", "options.js"].map((f) => fs.readFileSync(path.join(repo, f), "utf8")).join(";\n"));
  const d = w.document;
  const text = (id) => d.getElementById(id).textContent;
  return { w, d, store, text, opened, click: (id) => d.getElementById(id).click() };
}

// 今の問い（D15）で判定済みの記録。hit なら「ひとまとめの見下し」に当てはまる（集団の言葉と見下しの両方。D18）。そうでなければ集団の言葉だけ（数えない）
const J = (feed, ts, hit, extra = {}) => ({ feed, ts, g: 1, c: hit ? 1 : 0, x: 0, jv: "ev1/c155", ...extra });
// n 件の判定済み（当てはまるのは hits 件）
function many(prefix, feed, n, hits, ts = now - 1000) {
  const o = {};
  for (let i = 0; i < n; i++) o[`rec:${prefix}${i}`] = J(feed, ts - i, i < hits, { text: "本文" });
  return o;
}
const shzDayOf = (ts) => { const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const results = [];
const check = (name, ok, detail) => results.push(`${ok ? "OK" : "NG"}  ${name}${!ok && detail ? `
    → ${detail}` : ""}`);

(async () => {
  // 記録なし
  let t = setup();
  await wait(400);
  check("記録が無いときは、見出しが「まだ測れていません」で、温度計を出さない", t.text("heroHeadline") === "まだ測れていません" && !t.d.querySelector("#gauges .gauge"));
  check("記録が無いときは「なし」と、始め方を出す", t.text("recCount") === "なし" && t.text("trendNote").includes("まだ記録がありません") && t.d.getElementById("trendTable").hidden);

  // 傾向: おすすめ 40 件中 20、フォロー中 40 件中 4
  t = setup({ ...many("a", "for-you", 40, 20), ...many("b", "following", 40, 4) });
  await wait(400);
  const note = t.text("trendNote");
  check("おすすめ 50%・フォロー中 10% と、差 40 ポイントを出す", note.includes("おすすめ 50%") && note.includes("フォロー中 10%") && note.includes("40 ポイント高い"));
  check("件数の表示（80 件・判定済み 80 件）", t.text("recCount").includes("80 件") && t.text("recCount").includes("判定済み 80"));
  check("「アルゴリズムが押し上げた量ではない」と画面に書いてある", t.d.body.textContent.includes("アルゴリズムが押し上げた量ではありません"));
  check("見出し: はっきり差があれば「おすすめのほうが、フォロー中より熱い」と倍率を出す（D22）", t.text("heroHeadline").includes("熱い") && t.text("heroSub").includes("約 5.0 倍"), `${t.text("heroHeadline")} / ${t.text("heroSub")}`);
  check("温度計が 2 本あり、段ごとの塗りとぶれの幅が付く", t.d.querySelectorAll("#gauges .gauge").length === 2 && t.d.querySelectorAll("#gauges .seg").length >= 2 && t.d.querySelectorAll("#gauges .band").length === 2);
  check("比べる材料の棒（40 / 200）", t.text("readyBars").includes("40 / 200"));

  // はっきりしない差: 倍率を出さない
  t = setup({ ...many("a", "for-you", 40, 6), ...many("b", "following", 40, 4) });
  await wait(400);
  check("はっきりしない差なら、見出しにそう書き、倍率は出さない", t.text("heroHeadline").includes("はっきりした差はまだ見えません") && !t.text("heroSub").includes("倍") && t.text("heroSub").includes("5 ポイント多い"), `${t.text("heroHeadline")} / ${t.text("heroSub")}`);

  // 件数が足りない
  t = setup({ ...many("a", "for-you", 40, 20), ...many("b", "following", 10, 5) });
  await wait(400);
  check("件数が足りなければ、見出しは「まだ比べられません」", t.text("heroHeadline") === "まだ比べられません");
  check("片方が 30 件に満たなければ、差を出さずに理由を出す", t.text("trendNote").includes("30 件以上要ります") && !t.text("trendNote").includes("ポイント"));
  check("満たない割合は「—」で、件数を添える", [...t.d.querySelectorAll("#trendTable td.muted")].some((td) => td.textContent.includes("—") && td.textContent.includes("10件")));

  // 期間外（15 日前）は傾向に入れない
  t = setup({ ...many("a", "for-you", 40, 20, now - 20 * DAY), ...many("b", "following", 40, 4, now - 20 * DAY) });
  await wait(400);
  check("直近 14 日の外の記録は、傾向の表に入れない（日ごとの表には残る）", t.text("trendNote").includes("直近 14 日の記録がありません") && t.d.getElementById("trendTable").hidden && t.d.querySelectorAll("#dayTable tr").length >= 2, `${t.text("trendNote")} / 日の行 ${t.d.querySelectorAll("#dayTable tr").length}`);

  // 話題の重なり（D23）: おすすめ 政治 30・ゲーム 30、フォロー中 政治 15・ゲーム 45 → 重なり 75%
  const tops = {};
  for (let i = 0; i < 60; i++) tops[`rec:ta${i}`] = J("for-you", now - 1000 - i, false, { tp: i < 30 ? "politics" : "games", tv: "tp2" });
  for (let i = 0; i < 60; i++) tops[`rec:tb${i}`] = J("following", now - 1000 - i, false, { tp: i < 15 ? "politics" : "games", tv: "tp2" });
  t = setup(tops);
  await wait(400);
  check("話題の重なりを出し、はっきり差のある話題（99% の検定）に印を付ける", t.text("topicHeadline").includes("75%") && t.d.querySelectorAll("#topicRows .topic").length === 2 && t.text("topicRows").includes("おすすめで多い") && t.text("topicRows").includes("政治"), `${t.text("topicHeadline")} / ${t.text("topicRows")}`);
  t = setup({ ...many("a", "for-you", 40, 20) });
  await wait(400);
  check("話題の件数が足りなければ、重なりを出さず理由を出す", t.text("topicHeadline") === "まだ出せません" && t.text("topicSub").includes("50 件以上"));

  // 目立たされる投稿（D25）: おすすめ 40 件中 荒れ 12（うち見下し 10）、フォロー中 40 件中 荒れ 2
  const R = { r: 50, p: 0, l: 10, b: 0, v: 3000 }, C = { r: 1, p: 0, l: 10, b: 0, v: 300 };
  const heat = {};
  for (let i = 0; i < 40; i++) heat[`rec:ha${i}`] = J("for-you", now - 1000 - i, i < 10, { ct: i < 12 ? R : C, age: 300 });
  for (let i = 0; i < 40; i++) heat[`rec:hb${i}`] = J("following", now - 1000 - i, false, { ct: i < 2 ? R : C, age: 30 });
  t = setup(heat);
  await wait(400);
  check("目立つ投稿: はっきり多ければ見出しにそう書き、割合と行ごとの印を出す", t.text("heatHeadline").includes("目立つ投稿が多く") && t.text("heatSub").includes("おすすめ 30%") && t.text("heatSub").includes("フォロー中 5.0%") && t.d.querySelectorAll("#heatRows .topic").length === 3 && t.text("heatRows").includes("おすすめで多い"), `${t.text("heatHeadline")} / ${t.text("heatSub")} / ${t.text("heatRows")}`);
  check("目立つ投稿の中の見下し・排除は、件数が足りなければ理由を出す", t.text("heatHostile").includes("14 件・66 件"), t.text("heatHostile"));
  check("投稿からの時間の中ほどを出す", t.text("heatAge").includes("5 時間") && t.text("heatAge").includes("30 分"), t.text("heatAge"));
  check("基準の説明に数を入れる", t.text("heatRowsNote").includes("10 件以上") && t.text("heatRowsNote").includes("100,000"), t.text("heatRowsNote"));
  t = setup({ ...many("a", "for-you", 40, 20) });
  await wait(400);
  check("数の記録が無ければ、目立つ投稿は「まだ比べられません」", t.text("heatHeadline") === "まだ比べられません" && t.text("heatSub").includes("0.15.0"));
  // たたむ設定
  t = setup({ heatFoldDay: { d: shzDayOf(now), n: 4, o: 1 } });
  await wait(400);
  check("たたむ: 初期値はオフ、返信が多めはオン（線は 3%）、広まったはオフ", !t.d.getElementById("heatFoldEnabled").checked && t.d.getElementById("foldRowdy").checked && t.d.getElementById("foldLine").value === "0.03" && !t.d.getElementById("foldWide").checked);
  check("今日たたんだ件数と開いた件数を出す", t.text("foldToday").includes("4 件") && t.text("foldToday").includes("1 件"), t.text("foldToday"));
  t.click("heatFoldEnabled");
  t.click("foldWide");
  await wait(50);
  check("たたむのオン・形の選び方を保存する", t.store.heatFoldEnabled === true && t.store.heatFoldRules?.wide === true && t.store.heatFoldRules?.rowdy === true && t.store.heatFoldRules?.line === 0.03);
  const fl = t.d.getElementById("foldLine");
  fl.value = "0.1";
  fl.dispatchEvent(new t.w.Event("change"));
  await wait(50);
  check("たたむ線を 10% に替えると保存する（D27）", t.store.heatFoldRules?.line === 0.1 && t.store.heatFoldRules?.rowdy === true);
  t = setup({ heatFoldRules: { rowdy: true, wide: false, line: 1 } });
  await wait(300);
  check("保存したたたむ線（いいね以上）を選んだ状態で開く", t.d.getElementById("foldLine").value === "1");

  // 判定の版の混在
  t = setup({ ...many("a", "for-you", 40, 20), "rec:x": J("for-you", now, true, { jv: "group2/c156" }) });
  await wait(400);
  check("判定の版が混ざっていれば知らせる", t.text("trendNote").includes("判定の版が混ざっています"));

  // 本文だけ消す
  t = setup({ ...many("a", "for-you", 3, 1), "rec:u": { text: "未判定", feed: "for-you", ts: now - 1000 } });
  await wait(300);
  t.click("recStrip");
  await wait(300);
  const left = Object.entries(t.store).filter(([k]) => k.startsWith("rec:"));
  check("「本文だけ消す」: 判定済みは本文が消えて答えが残り、未判定は消える", left.length === 3 && left.every(([, r]) => !("text" in r) && typeof r.g === "number") && !("rec:u" in t.store));
  check("「本文だけ消す」では、開いている X のタブの「記録済みの覚え」を捨てさせない（recordClearedAt を書かない）", !("recordClearedAt" in t.store));

  // すべて消す
  t.click("recDelete");
  await wait(300);
  check("「すべて消す」: 記録が無くなり、先に recordClearedAt を書く", !Object.keys(t.store).some((k) => k.startsWith("rec:")) && typeof t.store.recordClearedAt === "number");

  // 測定モード
  t = setup({ recordEnabled: false });
  await wait(300);
  t.click("sessStart");
  await wait(300);
  check("測定を始めると、記録がオンになり、元の設定（オフ）を覚える", t.store.recordEnabled === true && t.store.session.prev === false && t.store.session.targetEach === 50 && typeof t.store.session.start === "number");
  check("測定中は「終了」ボタンが出て、「始める」は隠れる", !t.d.getElementById("sessEnd").hidden && t.d.getElementById("sessStart").hidden);
  check("記録のチェックが、設定の変更に合わせてオンになる", t.d.getElementById("recordEnabled").checked === true);
  const start = t.store.session.start;
  Object.assign(t.store, many("s", "for-you", 50, 10, start + 200), many("f", "following", 50, 2, start + 200));
  t.w.chrome.storage.local.set({ judgeDay: { d: "x", n: 1 } }); // 変更の通知を起こす
  await wait(500);
  check("測定中の進み具合と「そろいました」を出す", t.text("sessProgress").includes("おすすめ 50/50") && t.text("sessProgress").includes("フォロー中 50/50") && t.text("sessProgress").includes("そろいました"), t.text("sessProgress"));
  t.click("sessEnd");
  await wait(400);
  check("終えると、記録が元の設定（オフ）に戻る", t.store.recordEnabled === false && typeof t.store.session.end === "number");
  check("結果: 敵意が強い割合 おすすめ 20%・フォロー中 4%、差 16 ポイント", t.text("sessDiff").includes("おすすめ 20%") && t.text("sessDiff").includes("フォロー中 4%") && t.text("sessDiff").includes("16 ポイント高い"), t.text("sessDiff"));
  check("結果の表が出て、「始める」が戻る", !t.d.getElementById("sessTable").hidden && !t.d.getElementById("sessStart").hidden && t.d.getElementById("sessEnd").hidden, `表 ${t.d.getElementById("sessTable").hidden} 始める ${t.d.getElementById("sessStart").hidden} 終了 ${t.d.getElementById("sessEnd").hidden}`);

  // 元がオンなら、終えてもオンのまま
  t = setup({ recordEnabled: true });
  await wait(300);
  t.click("sessStart");
  await wait(200);
  t.click("sessEnd");
  await wait(300);
  check("測定を始める前から記録がオンなら、終えてもオンのまま", t.store.recordEnabled === true && t.store.session.prev === true);

  // 測定の途中で判定が済んでいない記録
  t = setup({ session: { start: now - 10_000, end: now - 1000, targetEach: 50, prev: false }, "rec:z": { text: "未判定", feed: "for-you", ts: now - 5000 } });
  await wait(300);
  check("終えたあとに未判定の記録があれば、その件数と理由を出す", t.text("sessProgress").includes("判定されていない記録が 1 件"));

  // 測定中に本人が記録のチェックを切り替えた
  t = setup({ recordEnabled: true });
  await wait(300);
  t.click("sessStart");
  await wait(200);
  const cb = t.d.getElementById("recordEnabled");
  cb.checked = false;
  cb.dispatchEvent(new t.w.Event("change"));
  await wait(300);
  check("測定中に記録をオフにしたら、測定もそこで終わり、オフのまま（終了時に勝手にオンへ戻さない）", t.store.recordEnabled === false && typeof t.store.session.end === "number");
  t = setup({ recordEnabled: false });
  await wait(300);
  t.click("sessStart");
  await wait(200);
  const cb2 = t.d.getElementById("recordEnabled");
  cb2.checked = true;
  cb2.dispatchEvent(new t.w.Event("change"));
  await wait(200);
  t.click("sessEnd");
  await wait(300);
  check("測定中に記録をオンにしたら、終えてもオンのまま（元のオフに戻さない）", t.store.recordEnabled === true);

  // 「本文だけ消す」は、先に目印を書く
  t = setup({ ...many("a", "for-you", 2, 1) });
  await wait(300);
  t.click("recStrip");
  await wait(300);
  check("「本文だけ消す」は textClearedAt を書く", typeof t.store.textClearedAt === "number");

  // 版の混在は、表と同じ期間（直近 14 日）で見る
  t = setup({ ...many("a", "for-you", 40, 20), ...many("o", "for-you", 1, 0, now - 30 * DAY) });
  Object.values(t.store).forEach((r) => { if (r && r.ts < now - 20 * DAY) r.jv = "split0/c150"; });
  await wait(400);
  check("14 日より前の記録だけ版が違っても、「混ざっています」を出さない", !t.text("trendNote").includes("判定の版が混ざっています"));

  // 測定の結果にも、押し上げた量ではないと添える
  t = setup({ ...many("a", "for-you", 40, 20), ...many("b", "following", 40, 4) });
  await wait(400);
  check("差の文に「押し上げた量ではありません」を添える", t.text("trendNote").includes("押し上げた量ではありません"));
  check("表に「どれか」「ひとまとめの見下し」「見下し」「排除」の列がある", ["どれか", "ひとまとめの見下し", "見下し", "排除"].every((h) => [...t.d.querySelectorAll("#trendTable th")].some((th) => th.textContent === h)));

  // 前の問い（怒り・敵意の点）の記録は数えず、件数を知らせる
  t = setup({ ...many("a", "for-you", 40, 20), ...many("b", "following", 40, 4), "rec:l": { feed: "for-you", ts: now - 1000, a: 90, h: 90, jv: "split1/c155" }, "rec:m": J("for-you", now - 1000, true, { m: 0, jv: "group1/c155" }) });
  await wait(400);
  check("前の判定の記録は割合に入れず、「数えていません」と件数を出す", t.text("trendNote").includes("おすすめ 50%") && t.text("trendNote").includes("前の判定（怒り・敵意の点や、0.11 の「はい／いいえ」の判定）の記録 2 件は数えていません"), t.text("trendNote"));

  // 判定の見本: 閉じている間は出さない。開くと 10 件（本文と判定）。当てはまったものだけにも切り替えられる
  t = setup({ ...many("a", "for-you", 20, 5), ...many("b", "following", 20, 0), "rec:x": { text: "消えた本文の記録", feed: "for-you", ts: now - 1000 } });
  await wait(300);
  check("判定の見本は、開くまで並べない", t.d.querySelectorAll("#sampleList .sample").length === 0);
  t.d.getElementById("sampleBox").open = true;
  t.click("sampleMore");
  await wait(100);
  const items = [...t.d.querySelectorAll("#sampleList .sample")];
  check("開くと、判定済みから 10 件を、本文と判定（当てはまった項目か「当てはまらない」）つきで出す（未判定は出さない）", items.length === 10 && items.every((i) => i.textContent.includes("本文") && /ひとまとめの見下し|当てはまらない/.test(i.textContent)) && !t.d.getElementById("sampleList").textContent.includes("消えた本文"), String(items.length));
  check("見本は、おすすめとフォロー中を半分ずつ", items.filter((i) => i.textContent.startsWith("おすすめ")).length === 5);
  t.click("sampleHit");
  await wait(100);
  const hitItems = [...t.d.querySelectorAll("#sampleList .sample")];
  check("「当てはまったものだけ」で、当てはまったものだけを出す（ボタンの文も切り替わる）", hitItems.length === 5 && hitItems.every((i) => i.querySelector(".meta b")?.textContent === "ひとまとめの見下し") && t.text("sampleHit").includes("無作為に戻す"), String(hitItems.length));
  let clip = null;
  Object.defineProperty(t.w, "navigator", { value: { clipboard: { writeText: async (s) => { clip = s; } }, userAgent: "" }, configurable: true });
  t.click("sampleCopy");
  await wait(50);
  const blocks = (clip || "").split("\n\n");
  check("見本のコピー: 出ている見本を、見出し（版）と「画面 · 日付 · 判定」＋本文の形でそのまま写す", blocks.length === 6 && blocks[0].includes("ev1/c155") && blocks.slice(1).every((b) => /^おすすめ · .+ · ひとまとめの見下し\n本文/.test(b)), JSON.stringify(clip).slice(0, 200));
  check("見本のコピーのあと、貼る先に気をつけるよう知らせる", /貼る先に気をつけて/.test(t.d.body.textContent));
  t = setup({});
  await wait(100);
  t.d.getElementById("sampleBox").open = true;
  t.click("sampleMore");
  await wait(100);
  check("見本が無いときは、コピーを押せない", t.d.getElementById("sampleCopy").disabled === true);

  // 本文の書き出し: 押したときだけ、本文のある記録をファイルにする。印・時刻は入れない
  t = setup({ "rec:a": J("for-you", now - 2000, true, { text: "書き出す本文", id: "x1" }), "rec:b": J("following", now - 1000, false), "rec:c": { feed: "for-you", ts: now - 500, text: "未判定の本文" } });
  let saved = null;
  t.w.URL.createObjectURL = (blob) => { saved = blob; return "blob:x"; };
  t.w.URL.revokeObjectURL = () => {};
  let name = null;
  t.w.HTMLAnchorElement.prototype.click = function () { name = this.download; };
  await wait(400);
  check("書き出しは、押すまでファイルを作らない", saved === null);
  t.click("recExport");
  await wait(100);
  const out = saved ? JSON.parse(await new Promise((r) => { const f = new t.w.FileReader(); f.onload = () => r(f.result); f.readAsText(saved); })) : null;
  check("書き出し: 本文のある 2 件を古い順に、ファイル名に日付", out?.rows.map((r) => r.text).join("|") === "書き出す本文|未判定の本文" && /^osusume-kenon-\d{4}-\d{2}-\d{2}\.json$/.test(name ?? ""), JSON.stringify({ name, rows: out?.rows }));
  check("書き出し: 判定済みには答えを付け、印・時刻は入れない", out?.rows[0].g === 1 && !("g" in out.rows[1]) && out.rows.every((r) => !("id" in r) && !("ts" in r)));
  check("書き出しのあと、渡す先に気をつけるよう知らせる", t.text("saved").includes("2 件") && t.text("saved").includes("気をつけて"));
  t = setup();
  await wait(400);
  t.click("recExport");
  await wait(100);
  check("書き出せる本文が無いときは、そう知らせる", t.text("saved").includes("書き出せる本文がありません"));

  // タイムライン温度（D27）: おすすめ・学ぶ前の X・フォロー中の 3 本。各回の始めの 150 件
  t = setup();
  await wait(300);
  check("温度: 記録が無いときは「まだ比べられません」で、共有のボタンは押せない", t.text("tempHeadline") === "まだ比べられません" && t.d.getElementById("shareX").disabled && t.d.getElementById("shareImg").disabled);
  check("温度: 記録が無いときは「何件に 1 件」を出さず、先週との比べは件数の足りなさを書く", t.d.getElementById("tempPlain").hidden && t.text("tempWeek").includes("それぞれ 30 件以上") && t.text("tempWeek").includes("0 件・0 件"), t.text("tempWeek"));
  check("温度: 基準の日付と件数を、注に書く", t.text("tempFoot").includes("2026-11-01〜2026-11-02") && t.text("tempFoot").includes("460 件") && t.text("tempFoot").includes("押し上げた量ではありません"), t.text("tempFoot"));
  const HOT = { r: 30, p: 0, l: 100, b: 0, v: 3000 }, COLD = { r: 2, p: 0, l: 100, b: 0, v: 3000 };
  const temp = (prefix, feed, n, hot, extra = {}, t0 = now - 600_000) => { const o = {}; for (let i = 0; i < n; i++) o[`rec:${prefix}${i}`] = { feed, ts: t0 + i * 1000, ct: i < hot ? HOT : COLD, ...extra }; return o; };
  t = setup({ ...temp("fa", "for-you", 60, 30), ...temp("fb", "following", 40, 4) });
  await wait(400);
  check("温度: おすすめ 50% が基準（28%）よりはっきり高ければ「熱い」", t.text("tempHeadline").includes("学ぶ前の X より熱い") && t.text("tempSub").includes("おすすめ 50%") && t.text("tempSub").includes("学ぶ前の X 28%") && t.text("tempSub").includes("フォロー中 10%"), `${t.text("tempHeadline")} / ${t.text("tempSub")}`);
  check("温度: おすすめ 50% を「およそ 2 件に 1 件」と言い換える", !t.d.getElementById("tempPlain").hidden && t.text("tempPlain").includes("およそ 2 件に 1 件"), t.text("tempPlain"));
  check("温度: その前の 7 日の記録が無ければ、先週との比べは件数の足りなさを書く", t.text("tempWeek").includes("60 件・0 件"), t.text("tempWeek"));
  check("温度: 温度計は 3 本（おすすめ・学ぶ前の X・フォロー中）で、どれにも幅が付く", t.d.querySelectorAll("#tempGauges .gauge").length === 3 && t.d.querySelectorAll("#tempGauges .band").length === 3 && t.text("tempGauges").includes("学ぶ前の X"));
  check("温度: アカウントが 1 つ（不明だけ）なら、選び欄とアカウントどうしの行は出さない", t.d.getElementById("acctBar").hidden && t.d.getElementById("tempAccts").hidden && t.d.getElementById("recAcctDelete").hidden);
  t.click("shareX");
  await wait(50);
  const url = t.opened[0] || "";
  check("X で共有: X の投稿画面を開くだけで、文に温度・基準・ハッシュタグ・目安が入る", url.startsWith("https://x.com/intent/post?text=") && decodeURIComponent(url).includes("50%") && decodeURIComponent(url).includes("28%") && decodeURIComponent(url).includes("#タイムライン温度") && decodeURIComponent(url).includes("目安") && t.text("saved").includes("投稿するかは、あなたが決めて"), decodeURIComponent(url));
  // 先週との比べ: この 7 日（50%）とその前の 7 日（10%）。7 日より前は 10 日前に置く
  t = setup({ ...temp("wa", "for-you", 60, 30), ...temp("wb", "for-you", 60, 6, {}, now - 10 * 86_400_000) });
  await wait(400);
  check("先週との比べ: その前の 7 日より熱ければ「熱くなりました」と、前 → 今の割合", t.text("tempWeek").includes("熱くなりました") && t.text("tempWeek").includes("10% → 50%") && t.d.getElementById("tempWeek").classList.contains("higher"), t.text("tempWeek"));
  t = setup({ ...temp("wa", "for-you", 60, 6), ...temp("wb", "for-you", 60, 30, {}, now - 10 * 86_400_000) });
  await wait(400);
  check("先週との比べ: 穏やかになれば「穏やかになりました」", t.text("tempWeek").includes("穏やかになりました") && t.text("tempWeek").includes("50% → 10%"), t.text("tempWeek"));
  t = setup({ ...temp("wa", "for-you", 60, 15), ...temp("wb", "for-you", 60, 16, {}, now - 10 * 86_400_000) });
  await wait(400);
  check("先週との比べ: 差がぶれの内なら「はっきりした差はありません」・25% は「およそ 4 件に 1 件」", t.text("tempWeek").includes("はっきりした差はありません") && t.text("tempPlain").includes("およそ 4 件に 1 件"), `${t.text("tempWeek")} / ${t.text("tempPlain")}`);
  t = setup(temp("wz", "for-you", 40, 0));
  await wait(400);
  check("温度: 返信が多めが 0 件なら「見当たりませんでした」", t.text("tempPlain").includes("見当たりませんでした"), t.text("tempPlain"));
  t = setup(temp("wm", "for-you", 40, 32));
  await wait(400);
  check("温度: 8 割なら「大半」", t.text("tempPlain").includes("大半"), t.text("tempPlain"));
  // 1 回で 200 件見ても、始めの 150 件だけ数える（熱いのは 151 件目以降だけ → 0%）
  const deep = {};
  for (let i = 0; i < 200; i++) deep[`rec:d${i}`] = { feed: "for-you", ts: now - 600_000 + i * 1000, ct: i >= 150 ? HOT : COLD };
  t = setup(deep);
  await wait(400);
  check("温度: 各回の始めの 150 件だけを数える", t.text("tempSub").includes("おすすめ 0%") && t.text("tempGauges").includes("150 件"), t.text("tempSub"));

  // 前の版から上げた直後（@名の分かるアカウント 1 つと、アカウント不明の前の記録）: 分けずに一緒に数える
  t = setup({ ...temp("old", "for-you", 40, 20), ...temp("new", "for-you", 20, 0, { acct: "acct_a" }, now - 100_000), acctLast: "acct_a" });
  await wait(400);
  check("アカウント: @名の分かるアカウントが 1 つなら、選び欄を出さず、前の記録（不明）も一緒に数える", t.d.getElementById("acctBar").hidden && t.d.getElementById("tempAccts").hidden && t.text("tempGauges").includes("60 件"), t.text("tempGauges"));
  check("温度の説明の数は、x-counts.js・stats-core.js の値から入れる", t.text("tempDef").includes("10 件以上") && t.text("tempDef").includes("3% 以上") && t.text("tempDef").includes("150 件") && t.text("tempDef").includes("3 分"), t.text("tempDef"));
  t.click("recDelete");
  await wait(300);
  check("「すべて消す」で、最後に見たアカウントの @名も消す", !("acctLast" in t.store));

  // アカウント（D27）: 2 つ以上あれば選び欄を出し、最後に X で見たアカウントを初めに選ぶ。下の欄もそのアカウントで数える
  const two = { ...temp("aa", "for-you", 60, 30, { acct: "acct_a", au: "writer1", text: "本文A" }), ...temp("bb", "for-you", 60, 3, { acct: "acct_b", text: "本文B" }), ...temp("nn", "following", 5, 0), acctLast: "acct_b" };
  t = setup(two);
  await wait(400);
  const sel = t.d.getElementById("acctSel");
  check("アカウント: 2 つ以上あれば選び欄を出し、最後に見たアカウントを選ぶ", !t.d.getElementById("acctBar").hidden && sel.options.length === 3 && sel.value === "acct_b" && t.text("acctSel").includes("アカウント不明"), `${sel.value} / ${t.text("acctSel")}`);
  check("アカウント: 選んだアカウントのおすすめで温度を出す（5% → 穏やか）", t.text("tempHeadline").includes("穏やか") && t.text("tempSub").includes("おすすめ 5.0%"), `${t.text("tempHeadline")} / ${t.text("tempSub")}`);
  check("アカウントどうしの行（おすすめの温度）を出す", !t.d.getElementById("tempAccts").hidden && t.text("tempAcctRows").includes("@acct_a") && t.text("tempAcctRows").includes("@acct_b") && t.text("tempAcctRows").includes("50%"), t.text("tempAcctRows"));
  check("記録の件数は、すべてのアカウントを合わせて出す", t.text("recCount").includes("125 件"));
  sel.value = "acct_a";
  sel.dispatchEvent(new t.w.Event("change"));
  await wait(300);
  check("アカウントを切り替えると、温度もそのアカウントで数え直す", t.text("tempHeadline").includes("熱い") && t.text("recAcctDelete").includes("@acct_a"));
  t.d.getElementById("sampleBox").open = true;
  t.w.shzSample = (recs) => Object.values(recs).filter((r) => r.text).slice(0, 2).map((r) => ({ ...r, g: 0, c: 0, x: 0, jv: "ev1/c155" })); // 見本は判定済みが要るので、ここでは選び方を差し替えて表示だけを見る
  t.click("sampleMore");
  await wait(100);
  check("見本: 選んだアカウントの記録だけを出し、投稿者の @名を添える", t.text("sampleList").includes("本文A") && !t.text("sampleList").includes("本文B") && t.text("sampleList").includes("@writer1"), t.text("sampleList").slice(0, 200));
  let clip2 = null;
  Object.defineProperty(t.w, "navigator", { value: { clipboard: { writeText: async (s) => { clip2 = s; } }, userAgent: "" }, configurable: true });
  t.click("sampleCopy");
  await wait(50);
  check("見本のコピーには、投稿者の @名を入れない", clip2 && clip2.includes("本文A") && !clip2.includes("writer1"), clip2);
  t.click("recAcctDelete");
  await wait(300);
  const kept = Object.values(t.store).filter((r) => r && r.feed);
  check("「このアカウントの記録を消す」は、そのアカウントの記録だけを消し、開いている X のタブに伝える", !kept.some((r) => r.acct === "acct_a") && kept.some((r) => r.acct === "acct_b") && kept.some((r) => !r.acct) && t.store.acctClearedAt?.acct === "acct_a" && t.text("saved").includes("@acct_a の記録を消しました"));

  // 画面の組み立てに innerHTML を使っていない（本文のような外の文字が入る場所は無いが、決まりとして確かめる）
  const src = fs.readFileSync(path.join(repo, "options.js"), "utf8");
  check("options.js は innerHTML を使わない", !/innerHTML|insertAdjacentHTML|document\.write/.test(src));

  console.log(results.join("\n"));
  process.exit(results.some((x) => x.startsWith("NG")) ? 1 : 0);
})();
