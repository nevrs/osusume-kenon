// 記録した投稿の判定（DESIGN.md D10）。設定で記録をオンにしているとき（または測定モードの間）だけ動く。
// 本文を Chrome の組み込み AI（端末の中）に読ませ、怒り（a）と敵意（h）の点を記録に書き足す。外へは何も送らない。
// 問いは tools/anger-probe.js の split と同じ（research/anger-record.md で測ったもの）。変えるときは両方を直して測り直し、SHZ_FJ.version を上げる。
// 普段（パッシブ）は、画面を開いているあいだ、間を空けて 1 件ずつ・1 日の上限つき。測定モード（アクティブ）の間は上限なしで、間を短くする。

const SHZ_FJ = {
  version: "split1", // 問いの版。点の付き方が変わったら上げる（記録に残す）
  gapMs: 2500, // 1 件ごとの間（パッシブ）
  sessionGapMs: 300, // 1 件ごとの間（測定モード）
  tickMs: 60_000, // 未判定が無いか見に行く間隔
  startDelayMs: 8000, // ページを開いてから最初に見に行くまで
  dailyCap: 300, // パッシブで 1 日に判定する件数の上限
  lockMs: 15_000, // 別のタブが判定している間、割り込まない時間
};
const SHZ_FJ_SCORE = { type: "integer", minimum: 0, maximum: 100 };
const SHZ_FJ_ANGER = "書き手の怒り・憤り・苛立ちの強さ（言葉づかいや語気から読み取れる感情の強さ。内容の正しさは問わない）";
const SHZ_FJ_HOSTILITY = "特定の人や集団に向けた敵意・侮辱・見下し（物事や制度への批判だけで、人への侮辱がないものは含まない）";
const SHZ_FJ_SYSTEM = "あなたは SNS の投稿を読み、次の各項目に当てはまる度合いを 0〜100 の整数で答える。100 は非常に強い、0 はまったく無い。\n" +
  `anger: ${SHZ_FJ_ANGER}\nhostility: ${SHZ_FJ_HOSTILITY}`;
const SHZ_FJ_SCHEMA = { type: "object", properties: { anger: SHZ_FJ_SCORE, hostility: SHZ_FJ_SCORE }, required: ["anger", "hostility"] };
const SHZ_FJ_LANG = { expectedInputs: [{ type: "text", languages: ["ja", "en"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };

const shzFjTab = Math.random().toString(36).slice(2); // このタブの印（判定を同時に回さないため）
let shzFjBase = null; // 問いを読ませた元のやりとり（の約束）。文ごとに複製して使う
let shzFjRunning = false;
const shzFjSkip = new Set(); // 判定に失敗した記録。このタブでは繰り返し試さない（後ろの記録を止めないため）

async function shzFjMakeBase() {
  if ((await LanguageModel.availability(SHZ_FJ_LANG)) !== "available") return null; // ダウンロードを始めない
  return LanguageModel.create({ ...SHZ_FJ_LANG, initialPrompts: [{ role: "system", content: SHZ_FJ_SYSTEM }] });
}

// 1 件を判定して {a, h} を返す。組み込み AI が使えなければ null、その 1 件だけが失敗したら {failed: true}
async function shzFeedJudge(text) {
  if (typeof LanguageModel === "undefined") return null;
  const pending = (shzFjBase ??= shzFjMakeBase());
  let base = null;
  try {
    base = await pending;
  } catch {
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
  } catch {
    if (shzFjBase === pending) { shzFjBase = null; base.destroy(); } // 元が壊れている。次に作り直す
    return null;
  }
  try {
    const o = JSON.parse(await s.prompt(`投稿:\n${text}`, { responseConstraint: SHZ_FJ_SCHEMA }));
    if (!Number.isFinite(o.anger) || !Number.isFinite(o.hostility)) return { failed: true };
    return { a: Math.round(o.anger), h: Math.round(o.hostility) };
  } catch {
    return { failed: true }; // この 1 件だけの失敗（長すぎる本文など）。元は壊さない
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
    for (const k of todo) {
      const st = await shzFjState();
      if (!shzFjShouldRun(st)) return;
      const fast = shzFjSessionOn(st), today = shzDay(Date.now());
      const used = st.judgeDay?.d === today ? st.judgeDay.n : 0;
      if (!fast && used >= SHZ_FJ.dailyCap) return;
      const lock = st.judgeLock;
      if (lock && lock.id !== shzFjTab && Date.now() - lock.ts < SHZ_FJ.lockMs) return; // 別のタブが判定している
      await chrome.storage.local.set({ judgeLock: { id: shzFjTab, ts: Date.now() } });
      const cur = (await chrome.storage.local.get(k))[k];
      if (!cur || !cur.text || shzIsJudged(cur)) continue;
      const res = await shzFeedJudge(cur.text);
      if (!res) return; // 組み込み AI が使えない。次の見回りで確かめ直す
      if (res.failed) { shzFjSkip.add(k); await shzFjSleep(fast ? SHZ_FJ.sessionGapMs : SHZ_FJ.gapMs); continue; } // この 1 件だけの失敗。後ろの記録は続ける（間は空ける）
      const latest = (await chrome.storage.local.get(k))[k];
      if (!latest) continue; // 判定している間に消された
      // 読んでから書くまでの間に、消す操作が割り込んでも本文を戻さない: 書いたあとで、消す操作の目印が変わっていないか見て、変わっていれば消し直す
      await chrome.storage.local.set({ [k]: { ...latest, a: res.a, h: res.h, jv: shzFjVersion() }, ...(fast ? {} : { judgeDay: { d: today, n: used + 1 } }) });
      const after = await chrome.storage.local.get({ recordClearedAt: 0, textClearedAt: 0 });
      if (after.recordClearedAt !== st.recordClearedAt) await chrome.storage.local.remove(k); // 「すべて消す」が割り込んだ
      else if (after.textClearedAt !== st.textClearedAt && latest.ts < after.textClearedAt) await chrome.storage.local.set({ [k]: { feed: latest.feed, ts: latest.ts, a: res.a, h: res.h, jv: shzFjVersion() } }); // 「本文だけ消す」が割り込んだ
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
