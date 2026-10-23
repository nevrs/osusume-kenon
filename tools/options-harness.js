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
  w.eval(["i18n.js", "record-core.js", "stats-core.js", "options.js"].map((f) => fs.readFileSync(path.join(repo, f), "utf8")).join(";\n"));
  const d = w.document;
  const text = (id) => d.getElementById(id).textContent;
  return { w, d, store, text, click: (id) => d.getElementById(id).click() };
}

// 今の問い（D15）で判定済みの記録。hit なら「ひとまとめ」に当てはまる
const J = (feed, ts, hit, extra = {}) => ({ feed, ts, g: hit ? 1 : 0, c: 0, x: 0, jv: "ev1/c155", ...extra });
// n 件の判定済み（当てはまるのは hits 件）
function many(prefix, feed, n, hits, ts = now - 1000) {
  const o = {};
  for (let i = 0; i < n; i++) o[`rec:${prefix}${i}`] = J(feed, ts - i, i < hits, { text: "本文" });
  return o;
}
const results = [];
const check = (name, ok, detail) => results.push(`${ok ? "OK" : "NG"}  ${name}${!ok && detail ? `
    → ${detail}` : ""}`);

(async () => {
  // 記録なし
  let t = setup();
  await wait(400);
  check("記録が無いときは「なし」と、始め方を出す", t.text("recCount") === "なし" && t.text("trendNote").includes("まだ記録がありません") && t.d.getElementById("trendTable").hidden);

  // 傾向: おすすめ 40 件中 20、フォロー中 40 件中 4
  t = setup({ ...many("a", "for-you", 40, 20), ...many("b", "following", 40, 4) });
  await wait(400);
  const note = t.text("trendNote");
  check("おすすめ 50%・フォロー中 10% と、差 40 ポイントを出す", note.includes("おすすめ 50%") && note.includes("フォロー中 10%") && note.includes("40 ポイント高い"));
  check("件数の表示（80 件・判定済み 80 件）", t.text("recCount").includes("80 件") && t.text("recCount").includes("判定済み 80"));
  check("「アルゴリズムが押し上げた量ではない」と画面に書いてある", t.d.body.textContent.includes("アルゴリズムが押し上げた量ではありません"));

  // 件数が足りない
  t = setup({ ...many("a", "for-you", 40, 20), ...many("b", "following", 10, 5) });
  await wait(400);
  check("片方が 30 件に満たなければ、差を出さずに理由を出す", t.text("trendNote").includes("30 件以上要ります") && !t.text("trendNote").includes("ポイント"));
  check("満たない割合は「—」で、件数を添える", [...t.d.querySelectorAll("#trendTable td.muted")].some((td) => td.textContent.includes("—") && td.textContent.includes("10件")));

  // 期間外（15 日前）は傾向に入れない
  t = setup({ ...many("a", "for-you", 40, 20, now - 20 * DAY), ...many("b", "following", 40, 4, now - 20 * DAY) });
  await wait(400);
  check("直近 14 日の外の記録は、傾向の表に入れない（日ごとの表には残る）", t.text("trendNote").includes("直近 14 日の記録がありません") && t.d.getElementById("trendTable").hidden && t.d.querySelectorAll("#dayTable tr").length >= 2, `${t.text("trendNote")} / 日の行 ${t.d.querySelectorAll("#dayTable tr").length}`);

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
  check("表に「どれか」「ひとまとめ」「見下し」「排除」の列がある", ["どれか", "ひとまとめ", "見下し", "排除"].every((h) => [...t.d.querySelectorAll("#trendTable th")].some((th) => th.textContent === h)));

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
  check("開くと、判定済みから 10 件を、本文と判定（当てはまった項目か「当てはまらない」）つきで出す（未判定は出さない）", items.length === 10 && items.every((i) => i.textContent.includes("本文") && /ひとまとめ|当てはまらない/.test(i.textContent)) && !t.d.getElementById("sampleList").textContent.includes("消えた本文"), String(items.length));
  check("見本は、おすすめとフォロー中を半分ずつ", items.filter((i) => i.textContent.startsWith("おすすめ")).length === 5);
  t.click("sampleHit");
  await wait(100);
  const hitItems = [...t.d.querySelectorAll("#sampleList .sample")];
  check("「当てはまったものだけ」で、当てはまったものだけを出す（ボタンの文も切り替わる）", hitItems.length === 5 && hitItems.every((i) => i.querySelector(".meta b")?.textContent === "ひとまとめ") && t.text("sampleHit").includes("無作為に戻す"), String(hitItems.length));
  let clip = null;
  Object.defineProperty(t.w, "navigator", { value: { clipboard: { writeText: async (s) => { clip = s; } }, userAgent: "" }, configurable: true });
  t.click("sampleCopy");
  await wait(50);
  const blocks = (clip || "").split("\n\n");
  check("見本のコピー: 出ている見本を、見出し（版）と「画面 · 日付 · 判定」＋本文の形でそのまま写す", blocks.length === 6 && blocks[0].includes("ev1/c155") && blocks.slice(1).every((b) => /^おすすめ · .+ · ひとまとめ\n本文/.test(b)), JSON.stringify(clip).slice(0, 200));
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

  // 画面の組み立てに innerHTML を使っていない（本文のような外の文字が入る場所は無いが、決まりとして確かめる）
  const src = fs.readFileSync(path.join(repo, "options.js"), "utf8");
  check("options.js は innerHTML を使わない", !/innerHTML|insertAdjacentHTML|document\.write/.test(src));

  console.log(results.join("\n"));
  process.exit(results.some((x) => x.startsWith("NG")) ? 1 : 0);
})();
