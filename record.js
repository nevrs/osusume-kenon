// 「おすすめ」で見せられた投稿の記録（DESIGN.md D9）。設定でオンにしたときだけ動く（初期値はオフ）。
// 画面に 0.5 秒以上出ていた投稿の本文を、端末の中（chrome.storage.local）に残す。X へは何も送らず、X の画面を動かさない（スクロールもしない）。
// 残すもの: 印（元の ID から作った短い文字列。重複を見分けるためのもの）・本文・おすすめ/フォロー中の別・時刻。
// 投稿者名の欄・リンクの欄は残さない（ただし本文に入っている @アカウント名や URL はそのまま残る）。古い記録は自動で消す。

const SHZ_DWELL_MS = 500; // この間、画面に出ていたら「見た」とする
const SHZ_RATIO = 0.6; // 投稿のこれ以上が画面に入っているとき（背の高い投稿は、画面より高いと一度も満たさず、記録されない）
const SHZ_FLUSH_MS = 4000; // まとめて保存するまでの待ち

let shzRecOn = false;
let shzGen = 0; // オン・オフのたびに増やす。待っている間にオフ・オンされた処理を捨てるため
let shzEpoch = 0; // 全削除のたびに増やす。待っている間に全削除された「見た」を捨てるため（オンにする処理は止めない）
let shzTextEpoch = 0; // 「本文だけ消す」のたびに増やす。保存の読み出しを待っている間に来たら、その保存を捨てるため
const shzSeen = new Set(); // 保存済み・保存待ちの印（同じ投稿を二重に残さない）。オフにしたら空にする
const shzTimers = new WeakMap(); // 投稿 → 「見た」とするタイマー
let shzWatched = new WeakSet(); // 見張りを付けた投稿の要素（X のページから見える印は付けない）
const shzQueue = {}; // 保存待ち {rec:<印>: {...}}
const shzClearQueue = () => { for (const k of Object.keys(shzQueue)) delete shzQueue[k]; };
let shzFlushTimer = 0;
let shzObserver = null;
let shzMutation = null;

// 開発用の自動スクロール（tools/dev-autoscroll.js。D21）が動いている間は、記録に auto: 1 の印を付ける。台本が書く時刻が 15 秒より古ければ動いていないとみなす。普段は何もしない
function shzDevAuto() {
  try { const t = Number(sessionStorage.getItem("shizume:dev-auto")); return t > 0 && Date.now() - t < 15_000; } catch { return false; }
}

async function shzCapture(article) {
  if (!shzRecOn || !article.isConnected) return;
  const gen = shzGen, epoch = shzEpoch;
  const feed = shzFeedOf(document, location.pathname);
  if (!feed || shzIsAd(article)) return;
  const id = shzPostId(article);
  const text = shzPostText(article);
  if (!id || !text) return; // 画像だけの投稿は本文が無いので残さない
  const key = await shzHashId(id);
  if (gen !== shzGen || epoch !== shzEpoch) return; // 待っている間にオフ・全削除された
  if (shzSeen.has(key)) return;
  shzSeen.add(key);
  shzQueue[`rec:${key}`] = { text, feed, ts: Date.now(), ...(shzDevAuto() ? { auto: 1 } : {}) };
  if (!shzFlushTimer) shzFlushTimer = setTimeout(shzFlush, SHZ_FLUSH_MS); // 新しく記録するたびに待ち直さない（スクロール中に保存されなくなるため）
}

function shzFlush(leaving = false) {
  shzFlushTimer = 0;
  const batch = { ...shzQueue };
  shzClearQueue();
  const keys = Object.keys(batch);
  if (!keys.length) return;
  shzLog("record", "flush", { n: keys.length, leaving });
  if (leaving) { // ページを離れるときは、読み出しを待たずにすぐ書く（待つと、コールバックの前にページが消えて記録が失われる）
    chrome.storage.local.set(batch);
    return;
  }
  // 別のタブが先に残した記録（判定済みの点がついていることがある）を、本文だけの記録で上書きしない
  const epoch = shzEpoch, textEpoch = shzTextEpoch;
  chrome.storage.local.get(keys, (have) => {
    if (epoch !== shzEpoch || textEpoch !== shzTextEpoch) return; // 読んでいる間に「すべて消す」「本文だけ消す」が来た
    const fresh = Object.fromEntries(Object.entries(batch).filter(([k]) => !(k in have)));
    if (Object.keys(fresh).length) chrome.storage.local.set(fresh);
  });
}

function shzDropPending() {
  clearTimeout(shzFlushTimer);
  shzFlushTimer = 0;
  shzClearQueue();
  shzSeen.clear();
}

function shzWatchArticle(article) {
  if (shzWatched.has(article)) return;
  shzWatched.add(article);
  shzObserver.observe(article);
}

function shzScanArticles(root) {
  for (const a of root.querySelectorAll(X_DOM.post)) shzWatchArticle(a);
}

function shzStartRecording() {
  if (shzObserver) return;
  shzObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      clearTimeout(shzTimers.get(e.target));
      if (e.isIntersecting && e.intersectionRatio >= SHZ_RATIO) {
        const g = shzGen;
        shzTimers.set(e.target, setTimeout(() => { if (g === shzGen) shzCapture(e.target); }, SHZ_DWELL_MS)); // オフ・オンをまたいだタイマーは使わない
      }
    }
  }, { threshold: [0, SHZ_RATIO] });
  let pending = false;
  shzMutation = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; shzScanArticles(document); });
  });
  shzMutation.observe(document.body, { childList: true, subtree: true });
  shzScanArticles(document);
}

function shzStopRecording() {
  shzGen++;
  shzRecOn = false;
  shzObserver?.disconnect();
  shzMutation?.disconnect();
  shzObserver = shzMutation = null;
  shzWatched = new WeakSet();
  shzDropPending(); // オフにしたら、保存待ちも捨てる
}

// 期限の来た記録を片付ける（オン・オフに関わらず、X のページを開いたとき・設定画面を開いたときに行う）。残った記録のキーを返す
const shzPurgeOld = () => shzApplyPurge(SHZ_KEEP_DAYS);

// オンにしたとき: 古い記録を消し、保存済みの印を覚えて、見張りを始める。待っている間にオフ・全削除されたら始めない
async function shzTurnOn() {
  shzStopRecording(); // 前の状態を片付けて、世代を進める
  const gen = shzGen, epoch = shzEpoch;
  const kept = await shzPurgeOld();
  if (gen !== shzGen) return;
  if (epoch === shzEpoch) for (const k of kept) shzSeen.add(k.slice(4)); // 待っている間に全削除されていたら、消した記録の印は覚えない
  shzRecOn = true;
  shzLog("record", "on");
  shzStartRecording();
}

chrome.storage.local.get({ recordEnabled: false }, (v) => {
  if (v.recordEnabled === true) shzTurnOn();
  else shzPurgeOld(); // オフのままでも、期限の過ぎた記録は消す
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c.recordClearedAt) { // 設定画面で「すべて消す」が押された。このタブの保存待ちと「記録済み」の覚えも捨てる（記録は続ける）
    shzEpoch++;
    shzDropPending();
  }
  if (c.textClearedAt) { // 設定画面で「本文だけ消す」が押された。まだ保存していない分は残さない（その投稿は、印は覚えたまま二重には記録しない）
    shzTextEpoch++;
    clearTimeout(shzFlushTimer);
    shzFlushTimer = 0;
    shzClearQueue();
  }
  if (c.recordEnabled) {
    if (c.recordEnabled.newValue === true) shzTurnOn();
    else shzStopRecording();
  }
});
// ページを離れるとき、保存待ちがあれば保存する（オフなら保存待ちは無い）
addEventListener("pagehide", () => { if (shzRecOn) shzFlush(true); });
