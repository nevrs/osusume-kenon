// 記録した投稿の判定（DESIGN.md D10・D15）。設定で記録をオンにしているとき（または測定モードの間）だけ動く。
// 本文を Chrome の組み込み AI（端末の中）に読ませ、ひとまとめ（g）・見下し（c）・排除（x）・動員（m）の答え（0/1）を記録に書き足す。外へは何も送らない。
// 問いは tools/group-probe.js の group1 と同じ（research/group-record.md で測ったもの）。変えるときは両方を直して測り直し、SHZ_FJ.version を上げる。
// 動員は数に使わない（排除と分けられなかった）が、あとで調べるために残す。
// 前の問い（怒り a・敵意 h の 0〜100。版 split1）で判定した記録は、本文が残っていれば、この問いで判定し直す（a・h は消す）。
// 普段（パッシブ）は、画面を開いているあいだ、間を空けて 1 件ずつ・1 日の上限つき。測定モード（アクティブ）の間は上限なしで、間を短くする。

const SHZ_FJ = {
  version: "group1", // 問いの版。答え方が変わったら上げる（記録に残す）
  gapMs: 2500, // 1 件ごとの間（パッシブ）
  sessionGapMs: 300, // 1 件ごとの間（測定モード）
  tickMs: 60_000, // 未判定が無いか見に行く間隔
  startDelayMs: 8000, // ページを開いてから最初に見に行くまで
  dailyCap: 300, // パッシブで 1 日に判定する件数の上限
  lockMs: 15_000, // 別のタブが判定している間、割り込まない時間
};
const SHZ_FJ_SYSTEM = [
  "あなたは SNS の投稿を読み、次の 4 つの問いに true か false で答える。投稿の主張が正しいか、どの立場の意見かは問わない。言葉の形だけを見る。迷ったら false。",
  "lump（ひとまとめ）: 国籍・民族・性別・世代・職業・地域・宗教・政治的立場などの集団に属する人々を、みな同じ性質を持つかのように語っている（例「〇〇人は〜」「最近の若者は〜」「〇〇の支持者は〜」）。特定の個人、特定の会社や役所、その具体的な行いについて述べるだけなら false。ひとまとめにすることを批判している文も false。",
  "contempt（見下し）: 人や集団を、侮辱する・見下す・人間扱いしない言葉がある（「バカ」「ゴミ」「虫」「こいつら」「無能」など）。物事・制度・行いへの批判だけなら false。",
  "exclusion（排除）: 人や集団を、追い出す・権利を奪う・黙らせる・社会から消す・暴力を加えることを求めている、または当然だとしている。特定の人の違法行為を法に沿って罰することを論じるだけなら false。投票しないなど、本人の選択を述べるだけなら false。",
  "mobilize（動員）: 読む人に、怒る・攻撃する・拡散する・抗議を集めることを、強い言葉で促している（「許すな」「今すぐ拡散」「黙っているのも同罪」「目を覚ませ」）。",
].join("\n");
const SHZ_FJ_BOOL = { type: "boolean" };
const SHZ_FJ_QS = ["lump", "contempt", "exclusion", "mobilize"];
const SHZ_FJ_SCHEMA = { type: "object", properties: Object.fromEntries(SHZ_FJ_QS.map((q) => [q, SHZ_FJ_BOOL])), required: SHZ_FJ_QS };
const SHZ_FJ_LANG = { expectedInputs: [{ type: "text", languages: ["ja", "en"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };

const shzFjTab = Math.random().toString(36).slice(2); // このタブの印（判定を同時に回さないため）
let shzFjBase = null; // 問いを読ませた元のやりとり（の約束）。文ごとに複製して使う
let shzFjRunning = false;
const shzFjSkip = new Set(); // 判定に失敗した記録。このタブでは繰り返し試さない（後ろの記録を止めないため）

async function shzFjMakeBase() {
  const av = await LanguageModel.availability(SHZ_FJ_LANG);
  shzLog("judge", "availability", av);
  if (av !== "available") return null; // ダウンロードを始めない
  const t0 = Date.now();
  const base = await LanguageModel.create({ ...SHZ_FJ_LANG, initialPrompts: [{ role: "system", content: SHZ_FJ_SYSTEM }] });
  shzLog("judge", "base-created", { ms: Date.now() - t0 });
  return base;
}

// 失敗の理由（エラーの種類と文。本文は入れない。診断に出す）
const shzFjErr = (e) => `${e?.name || "Error"}: ${e?.message || e}`.slice(0, 160);

// 1 件を判定して {g, c, x, m}（0/1）を返す。組み込み AI が使えなければ null、その 1 件だけが失敗したら {failed: true, err}
async function shzFeedJudge(text) {
  if (typeof LanguageModel === "undefined") { shzLog("judge", "no-LanguageModel"); return null; }
  const pending = (shzFjBase ??= shzFjMakeBase());
  let base = null;
  try {
    base = await pending;
  } catch (e) {
    shzLog("judge", "base-error", shzFjErr(e));
    if (shzFjBase === pending) shzFjBase = null; // 作れなかった。次に作り直す
    return null;
  }
  if (!base) {
    if (shzFjBase === pending) shzFjBase = null; // まだ使えない。次に確かめ直す
    return null;
  }
  let s = null;
  try {
    s = await base.clone();
  } catch (e) {
    shzLog("judge", "clone-error", shzFjErr(e));
    if (shzFjBase === pending) { shzFjBase = null; base.destroy(); } // 元が壊れている。次に作り直す
    return null;
  }
  try {
    const out = await s.prompt(`投稿:\n${text}`, { responseConstraint: SHZ_FJ_SCHEMA });
    let o;
    try { o = JSON.parse(out); } catch { shzLog("judge", "bad-json", { outLen: String(out).length }); return { failed: true, err: "bad-json" }; } // パースのエラー文には AI の出力が入るので、残さない
    if (!SHZ_FJ_QS.every((q) => typeof o?.[q] === "boolean")) return { failed: true, err: "not-a-boolean" };
    return { g: +o.lump, c: +o.contempt, x: +o.exclusion, m: +o.mobilize };
  } catch (e) {
    shzLog("judge", "prompt-error", { err: shzFjErr(e), len: text.length });
    return { failed: true, err: shzFjErr(e) }; // この 1 件だけの失敗（長すぎる本文など）。元は壊さない
  } finally {
    s?.destroy();
  }
}

const shzFjVersion = () => `${SHZ_FJ.version}/c${(/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1] || "?"}`;
const shzFjSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shzFjSessionOn = (st) => !!(st.session && !st.session.end);

const shzFjState = () => chrome.storage.local.get({ recordEnabled: false, session: null, judgeDay: null, judgeLock: null, recordClearedAt: 0, textClearedAt: 0 });

// 今、判定してよいか。記録がオン、または測定モードの間だけ。パッシブは画面が見えているときだけ
function shzFjShouldRun(st) {
  const session = shzFjSessionOn(st);
  if (st.recordEnabled !== true && !session) return false;
  return session || document.visibilityState === "visible";
}

async function shzFjRun() {
  if (shzFjRunning) return;
  shzFjRunning = true;
  try {
    if (!shzFjShouldRun(await shzFjState())) return;
    const all = await chrome.storage.local.get(null);
    const start = all.session && !all.session.end ? all.session.start : Infinity;
    const todo = Object.entries(all)
      .filter(([k, r]) => k.startsWith("rec:") && r.text && !shzIsJudged(r) && !shzFjSkip.has(k))
      .sort(([, x], [, y]) => (y.ts >= start) - (x.ts >= start) || x.ts - y.ts) // 測定モードの分を先に、あとは古い順（先に期限が来る）
      .map(([k]) => k);
    if (todo.length) shzLog("judge", "record-run", { todo: todo.length });
    for (const k of todo) {
      const st = await shzFjState();
      if (!shzFjShouldRun(st)) return;
      const fast = shzFjSessionOn(st), today = shzDay(Date.now());
      const used = st.judgeDay?.d === today ? st.judgeDay.n : 0;
      if (!fast && used >= SHZ_FJ.dailyCap) { shzLog("judge", "daily-cap", { used }); return; }
      const lock = st.judgeLock;
      if (lock && lock.id !== shzFjTab && Date.now() - lock.ts < SHZ_FJ.lockMs) { shzLog("judge", "locked-by-other-tab"); return; } // 別のタブが判定している
      await chrome.storage.local.set({ judgeLock: { id: shzFjTab, ts: Date.now() } });
      const cur = (await chrome.storage.local.get(k))[k];
      if (!cur || !cur.text || shzIsJudged(cur)) continue;
      const t0 = Date.now();
      const res = await shzFeedJudge(cur.text);
      shzLog("judge", "record-judged", res ? (res.failed ? { failed: res.err } : { ms: Date.now() - t0, g: res.g, c: res.c, x: res.x, m: res.m }) : "ai-unavailable");
      if (!res) return; // 組み込み AI が使えない。次の見回りで確かめ直す
      if (res.failed) { shzFjSkip.add(k); await shzFjSleep(fast ? SHZ_FJ.sessionGapMs : SHZ_FJ.gapMs); continue; } // この 1 件だけの失敗。後ろの記録は続ける（間は空ける）
      const latest = (await chrome.storage.local.get(k))[k];
      if (!latest) continue; // 判定している間に消された
      // 読んでから書くまでの間に、消す操作が割り込んでも本文を戻さない: 書いたあとで、消す操作の目印が変わっていないか見て、変わっていれば消し直す
      const { a, h, ...rest } = latest; // 前の問いの点は消す（同じ記録に 2 つの物差しを残さない）
      const ans = { g: res.g, c: res.c, x: res.x, m: res.m, jv: shzFjVersion() };
      await chrome.storage.local.set({ [k]: { ...rest, ...ans }, ...(fast ? {} : { judgeDay: { d: today, n: used + 1 } }) });
      const after = await chrome.storage.local.get({ recordClearedAt: 0, textClearedAt: 0 });
      if (after.recordClearedAt !== st.recordClearedAt) await chrome.storage.local.remove(k); // 「すべて消す」が割り込んだ
      else if (after.textClearedAt !== st.textClearedAt && latest.ts < after.textClearedAt) await chrome.storage.local.set({ [k]: { feed: latest.feed, ts: latest.ts, ...ans } }); // 「本文だけ消す」が割り込んだ
      await shzFjSleep(fast ? SHZ_FJ.sessionGapMs : SHZ_FJ.gapMs);
    }
  } finally {
    shzFjRunning = false;
  }
}

setTimeout(shzFjRun, SHZ_FJ.startDelayMs);
setInterval(shzFjRun, SHZ_FJ.tickMs);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") shzFjRun(); });
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && (c.session || c.recordEnabled?.newValue === true)) shzFjRun();
});
