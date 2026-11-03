// 記録した投稿の判定（DESIGN.md D10・D15）。設定で記録をオンにしているとき（または測定モードの間）だけ動く。
// 本文を Chrome の組み込み AI（端末の中）に読ませ、ひとまとめ（g）・見下し（c）・排除（x）の答え（0/1）を記録に書き足す。外へは何も送らない。
// はい／いいえではなく、根拠の言葉を本文から抜き出させ、その言葉が本文に本当にあるときだけ当てはまるとする（DESIGN.md D16）。
// 問いは tools/group-probe.js の ev1 と同じ（research/group-record.md で測ったもの）。変えるときは両方を直して測り直し、SHZ_FJ.version を上げる。
// 前の問い（怒り a・敵意 h。版 group1 の g・c・x・m）で判定した記録は、本文が残っていれば、この問いで判定し直す（前の答えは消す）。
// 普段（パッシブ）は、画面を開いているあいだ、間を空けて 1 件ずつ・1 日の上限つき。測定モード（アクティブ）の間は上限なしで、間を短くする。
// 話題（tp）も、別の問いで 1 つ選ばせて書き足す（D23。おすすめとフォロー中の話題の重なりを見るため）。見下し・排除の問いとは混ぜない（そちらの答え方を変えないため）。

const SHZ_FJ = {
  version: "ev1", // 問いの版。答え方が変わったら上げる（記録に残す）
  timeoutMs: 30_000, // 1 件の判定の打ち切り（AI が長い答えを書き続けて 9 分止まったことがある）
  gapMs: 2500, // 1 件ごとの間（パッシブ）
  sessionGapMs: 300, // 1 件ごとの間（測定モード）
  tickMs: 60_000, // 未判定が無いか見に行く間隔
  startDelayMs: 8000, // ページを開いてから最初に見に行くまで
  dailyCap: 300, // パッシブで 1 日に判定する件数の上限
  lockMs: 15_000, // 別のタブが判定している間、割り込まない時間
};
const SHZ_FJ_SYSTEM = [
  "あなたは SNS の投稿を読み、次の言葉を投稿の本文からそのまま抜き出して答える。当てはまる言葉が無ければ空の文字列にする。迷ったら空にする。投稿の主張が正しいか、どの立場の意見かは問わない。他人の言葉を引用して批判している・皮肉っているだけなら空にする。",
  "group（ひとまとめ）: 実在の人々の集団（国籍・民族・性別・世代・職業・地域・宗教・政治的立場など）を指す言葉のうち、その集団の人々がみな同じ性質を持つかのように語られているもの（例「〇〇人はみんな〜」の「〇〇人」）。特定の個人・会社・役所・作品・機械・物語やゲームの登場人物や種族は含めない。ひとまとめにすることを批判している文なら空。",
  "insult（見下し）: 実在の人や集団に向けた、侮辱する・見下す・人間扱いしない言葉（例「バカ」「ゴミ」「虫」「無能」）。作品・会社・機械・AI・制度・物事に向けた言葉は含めない。",
  "exclusion（排除）: 実在の人や集団を、追い出す・権利を奪う・黙らせる・社会から消す・暴力を加えることを求める言葉（例「出ていけ」「追い出せ」）。投票しないなど本人の選択や、法に沿った処罰の議論は含めない。",
].join("\n");
const SHZ_FJ_QS = ["group", "insult", "exclusion"];
const SHZ_FJ_SCHEMA = { type: "object", properties: Object.fromEntries(SHZ_FJ_QS.map((q) => [q, { type: "string" }])), required: SHZ_FJ_QS };
// 抜き出した言葉が本文にあるか（空白・かぎかっこ・引用符と、全角半角の違いは見ない）。AI は問いの中の例を書き写すことがあり、それをはじく
const shzFjNorm = (s) => String(s).normalize("NFKC").replace(/[\s「」『』"'“”]/g, "");
const shzFjFound = (w, text) => typeof w === "string" && shzFjNorm(w).length > 0 && shzFjNorm(text).includes(shzFjNorm(w));
// 話題の問い（D23）。tools/group-probe.js の tp2 と同じ文。一覧と問いを変えたら両方を直して測り直し、SHZ_FJ_TOPIC.version を上げる（記録に tv として残し、版の違う記録は判定し直す）
const SHZ_FJ_TOPIC = {
  version: "tp2", // tp1 から、話題の説明を具体的にした（research/topic-record.md）
  keys: ["politics", "society", "world", "economy", "tech", "games", "anime", "celeb", "sports", "hobby", "life", "other"],
  system: [
    "あなたは SNS の投稿を読み、その投稿の主な話題を次の一覧から 1 つだけ選ぶ。いくつか当てはまるときは、いちばん中心のものを選ぶ。life は、ほかのどれにも当てはまらない身の回りの話のときだけ選ぶ。",
    "politics: 国内の政治・選挙・政党・政策・国会・議会・行政・議員",
    "society: 国内の社会のできごと・事件・事故・火事・災害・交通の乱れ・裁判・差別や人権の問題",
    "world: 外国のできごと・外国の政治や選挙・国際関係・関税・戦争・外国の天気や災害",
    "economy: 経済・物価・値上げ・円安・お金・投資・仕事・転職・給料・会社",
    "tech: 科学・技術・宇宙・研究・IT・AI・スマホ・ネットのサービス",
    "games: ゲーム（スマホのゲーム・ガチャ・対戦・RPG を含む）",
    "anime: アニメ・漫画・小説・映画・ドラマ（作品の感想を含む）",
    "celeb: 芸能人・俳優・歌手・バンド・アイドル・新曲・ライブ・配信者",
    "sports: スポーツ（観戦も、自分で走る・運動するのも含む）",
    "hobby: 趣味・手芸・創作・旅行・温泉・お出かけ・ファッション・買い物",
    "life: 暮らし・日常・食べ物・家族・ペット・健康・気持ち",
    "other: 意味のある話題が無い（あいさつ・記号・テスト）",
  ].join("\n"),
};
SHZ_FJ_TOPIC.schema = { type: "object", properties: { topic: { type: "string", enum: SHZ_FJ_TOPIC.keys } }, required: ["topic"] };
const SHZ_FJ_LANG = { expectedInputs: [{ type: "text", languages: ["ja", "en"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };

const shzFjTab = Math.random().toString(36).slice(2); // このタブの印（判定を同時に回さないため）
// 問いを読ませた元のやりとり（の約束）。文ごとに複製して使う。問いごとに 1 つ
const shzFjBases = { judge: { system: SHZ_FJ_SYSTEM, p: null }, topic: { system: SHZ_FJ_TOPIC.system, p: null } };
let shzFjRunning = false;
const shzFjSkip = new Set(); // 判定に失敗した記録。このタブでは繰り返し試さない（後ろの記録を止めないため）
const shzFjTopicSkip = new Set(); // 話題の判定に失敗した記録（同じ）

async function shzFjMakeBase(system) {
  const av = await LanguageModel.availability(SHZ_FJ_LANG);
  shzLog("judge", "availability", av);
  if (av !== "available") return null; // ダウンロードを始めない
  const t0 = Date.now();
  const base = await LanguageModel.create({ ...SHZ_FJ_LANG, initialPrompts: [{ role: "system", content: system }] });
  shzLog("judge", "base-created", { ms: Date.now() - t0 });
  return base;
}

// 失敗の理由（エラーの種類と文。本文は入れない。診断に出す）
const shzFjErr = (e) => `${e?.name || "Error"}: ${e?.message || e}`.slice(0, 160);

// 1 件を問い（shzFjBases の 1 つ）に読ませ、JSON の答えを返す。組み込み AI が使えなければ null、その 1 件だけが失敗したら {failed: true, err}
async function shzFjAsk(ref, text, schema) {
  if (typeof LanguageModel === "undefined") { shzLog("judge", "no-LanguageModel"); return null; }
  const pending = (ref.p ??= shzFjMakeBase(ref.system));
  let base = null;
  try {
    base = await pending;
  } catch (e) {
    shzLog("judge", "base-error", shzFjErr(e));
    if (ref.p === pending) ref.p = null; // 作れなかった。次に作り直す
    return null;
  }
  if (!base) {
    if (ref.p === pending) ref.p = null; // まだ使えない。次に確かめ直す
    return null;
  }
  let s = null;
  try {
    s = await base.clone();
  } catch (e) {
    shzLog("judge", "clone-error", shzFjErr(e));
    if (ref.p === pending) { ref.p = null; base.destroy(); } // 元が壊れている。次に作り直す
    return null;
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SHZ_FJ.timeoutMs);
  try {
    const out = await s.prompt(`投稿:\n${text}`, { responseConstraint: schema, signal: ac.signal });
    try { return { o: JSON.parse(out) }; } catch { shzLog("judge", "bad-json", { outLen: String(out).length }); return { failed: true, err: "bad-json" }; } // パースのエラー文には AI の出力が入るので、残さない
  } catch (e) {
    shzLog("judge", "prompt-error", { err: shzFjErr(e), len: text.length });
    return { failed: true, err: shzFjErr(e) }; // この 1 件だけの失敗（長すぎる本文・打ち切りなど）。元は壊さない
  } finally {
    clearTimeout(timer);
    s?.destroy();
  }
}

// 1 件を判定して {g, c, x}（0/1）を返す。返し方は shzFjAsk と同じ
async function shzFeedJudge(text) {
  const r = await shzFjAsk(shzFjBases.judge, text, SHZ_FJ_SCHEMA);
  if (!r || r.failed) return r;
  const o = r.o;
  if (!SHZ_FJ_QS.every((q) => typeof o?.[q] === "string")) return { failed: true, err: "not-a-string" };
  return { g: +shzFjFound(o.group, text), c: +shzFjFound(o.insult, text), x: +shzFjFound(o.exclusion, text) }; // 抜き出した言葉は本文の一部なので、記録にもログにも残さない
}

// 1 件の話題を {tp} で返す（一覧のキー）。返し方は shzFjAsk と同じ
async function shzFeedTopic(text) {
  const r = await shzFjAsk(shzFjBases.topic, text, SHZ_FJ_TOPIC.schema);
  if (!r || r.failed) return r;
  return SHZ_FJ_TOPIC.keys.includes(r.o?.topic) ? { tp: r.o.topic } : { failed: true, err: "not-a-topic" };
}
const shzFjNeedTopic = (r) => r.tv !== SHZ_FJ_TOPIC.version;

const shzFjVersion = () => `${SHZ_FJ.version}/c${(/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1] || "?"}`;
const shzFjSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shzFjSessionOn = (st) => !!(st.session && !st.session.end);

const shzFjState = () => chrome.storage.local.get({ recordEnabled: false, session: null, judgeDay: null, judgeLock: null, recordClearedAt: 0, textClearedAt: 0, acctClearedAt: null });

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
      .filter(([k, r]) => k.startsWith("rec:") && r.text && ((!shzIsJudged(r) && !shzFjSkip.has(k)) || (shzFjNeedTopic(r) && !shzFjTopicSkip.has(k))))
      .sort(([, x], [, y]) => (y.ts >= start) - (x.ts >= start) || shzIsJudged(x) - shzIsJudged(y) || x.ts - y.ts) // 測定モードの分を先に、次に見下し・排除が未判定のもの（話題だけの判定し直しで、1 日の上限を先に使い切らない）、あとは古い順（先に期限が来る）
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
      if (!cur || !cur.text) continue;
      const needJudge = !shzIsJudged(cur) && !shzFjSkip.has(k), needTopic = shzFjNeedTopic(cur) && !shzFjTopicSkip.has(k);
      if (!needJudge && !needTopic) continue;
      const ans = {};
      if (needJudge) {
        const t0 = Date.now();
        const res = await shzFeedJudge(cur.text);
        shzLog("judge", "record-judged", res ? (res.failed ? { failed: res.err } : { ms: Date.now() - t0, g: res.g, c: res.c, x: res.x }) : "ai-unavailable");
        if (!res) return; // 組み込み AI が使えない。次の見回りで確かめ直す
        if (res.failed) shzFjSkip.add(k); // この 1 件だけの失敗。後ろの記録は続ける（間は空ける）
        else Object.assign(ans, { g: res.g, c: res.c, x: res.x, jv: shzFjVersion() });
      }
      if (needTopic && !(needJudge && !ans.jv)) { // 見下し・排除の判定に失敗した記録は、話題も今回は見ない
        const t0 = Date.now();
        const res = await shzFeedTopic(cur.text);
        shzLog("judge", "topic-judged", res ? (res.failed ? { failed: res.err } : { ms: Date.now() - t0, tp: res.tp }) : "ai-unavailable");
        if (!res) return;
        if (res.failed) shzFjTopicSkip.add(k);
        else Object.assign(ans, { tp: res.tp, tv: SHZ_FJ_TOPIC.version });
      }
      if (!Object.keys(ans).length) { await shzFjSleep(fast ? SHZ_FJ.sessionGapMs : SHZ_FJ.gapMs); continue; }
      const latest = (await chrome.storage.local.get(k))[k];
      if (!latest) continue; // 判定している間に消された
      // 読んでから書くまでの間に、消す操作が割り込んでも本文を戻さない: 書いたあとで、消す操作の目印が変わっていないか見て、変わっていれば消し直す
      const { a, h, m, ...rest } = latest; // 前の問いの答えは消す（同じ記録に 2 つの物差しを残さない。g・c・x・jv は下で上書き）
      await chrome.storage.local.set({ [k]: { ...rest, ...ans }, ...(fast ? {} : { judgeDay: { d: today, n: used + 1 } }) });
      const after = await chrome.storage.local.get({ recordClearedAt: 0, textClearedAt: 0, acctClearedAt: null });
      const acctHit = !!after.acctClearedAt && after.acctClearedAt.at !== st.acctClearedAt?.at && (after.acctClearedAt.acct ?? null) === (latest.acct ?? null);
      if (after.recordClearedAt !== st.recordClearedAt || acctHit) await chrome.storage.local.remove(k); // 「すべて消す」「このアカウントの記録を消す」が割り込んだ
      else if (after.textClearedAt !== st.textClearedAt && latest.ts < after.textClearedAt) { const { text, au, ...kept } = { ...rest, ...ans }; await chrome.storage.local.set({ [k]: kept }); } // 「本文だけ消す」が割り込んだ
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
