// 「おすすめ」で見せられた投稿の記録（DESIGN.md D9）。設定でオンにしたときだけ動く（初期値はオフ）。
// 画面に 1 秒以上出ていた投稿の本文を、端末の中（chrome.storage.local）に残す。X へは何も送らず、X の画面を動かさない（スクロールもしない）。
// 残すもの: 印（元の ID から作った短い文字列。重複を見分けるためのもの）・本文・おすすめ/フォロー中の別・時刻。
// 投稿者名の欄・リンクの欄は残さない（ただし本文に入っている @アカウント名や URL はそのまま残る）。古い記録は自動で消す。

const SHZ_DWELL_MS = 1000; // この間、画面に出ていたら「見た」とする
const SHZ_RATIO = 0.6; // 投稿のこれ以上が画面に入っているとき（背の高い投稿は、画面より高いと一度も満たさず、記録されない）
const SHZ_KEEP_DAYS = 14; // 記録を持つ日数
const SHZ_FLUSH_MS = 4000; // まとめて保存するまでの待ち

let shzRecOn = false;
let shzGen = 0; // オン・オフ・全削除のたびに増やす。待っている間に状況が変わった処理を捨てるため
const shzSeen = new Set(); // 保存済み・保存待ちの印（同じ投稿を二重に残さない）。オフにしたら空にする
const shzTimers = new WeakMap(); // 投稿 → 「見た」とするタイマー
let shzWatched = new WeakSet(); // 見張りを付けた投稿の要素（X のページから見える印は付けない）
const shzQueue = {}; // 保存待ち {rec:<印>: {...}}
let shzFlushTimer = 0;
let shzObserver = null;
let shzMutation = null;

async function shzCapture(article) {
  if (!shzRecOn || !article.isConnected) return;
  const gen = shzGen;
  const feed = shzFeedOf(document, location.pathname);
  if (!feed || shzIsAd(article)) return;
  const id = shzPostId(article);
  const text = shzPostText(article);
  if (!id || !text) return; // 画像だけの投稿は本文が無いので残さない
  const key = await shzHashId(id);
  if (gen !== shzGen) return; // 待っている間にオフ・全削除された
  if (shzSeen.has(key)) return;
  shzSeen.add(key);
  shzQueue[`rec:${key}`] = { text, feed, ts: Date.now() };
  if (!shzFlushTimer) shzFlushTimer = setTimeout(shzFlush, SHZ_FLUSH_MS); // 新しく記録するたびに待ち直さない（スクロール中に保存されなくなるため）
}

function shzFlush() {
  shzFlushTimer = 0;
  const batch = { ...shzQueue };
  for (const k of Object.keys(shzQueue)) delete shzQueue[k];
  if (Object.keys(batch).length) chrome.storage.local.set(batch);
}

function shzDropPending() {
  clearTimeout(shzFlushTimer);
  shzFlushTimer = 0;
  for (const k of Object.keys(shzQueue)) delete shzQueue[k];
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
      if (e.isIntersecting && e.intersectionRatio >= SHZ_RATIO) shzTimers.set(e.target, setTimeout(() => shzCapture(e.target), SHZ_DWELL_MS));
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

// 古い記録を消す（オン・オフに関わらず、X のページを開いたとき・設定画面を開いたときに行う）
async function shzPurgeOld() {
  const all = await chrome.storage.local.get(null);
  const recs = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("rec:")));
  const old = shzPurgeKeys(recs, Date.now(), SHZ_KEEP_DAYS);
  if (old.length) await chrome.storage.local.remove(old);
  return Object.keys(recs).filter((k) => !old.includes(k));
}

// オンにしたとき: 古い記録を消し、保存済みの印を覚えて、見張りを始める。待っている間にオフ・全削除されたら始めない
async function shzTurnOn() {
  shzStopRecording(); // 前の状態を片付けて、世代を進める
  const gen = shzGen;
  const kept = await shzPurgeOld();
  if (gen !== shzGen) return;
  for (const k of kept) shzSeen.add(k.slice(4));
  shzRecOn = true;
  shzStartRecording();
}

chrome.storage.local.get({ recordEnabled: false }, (v) => {
  if (v.recordEnabled === true) shzTurnOn();
  else shzPurgeOld(); // オフのままでも、期限の過ぎた記録は消す
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c.recordClearedAt) { // 設定画面で「すべて消す」が押された。このタブの保存待ちと「記録済み」の覚えも捨てる
    shzGen++;
    shzDropPending();
  }
  if (c.recordEnabled) {
    if (c.recordEnabled.newValue === true) shzTurnOn();
    else shzStopRecording();
  }
});
// ページを離れるとき、保存待ちがあれば保存する（オフなら保存待ちは無い）
addEventListener("pagehide", () => { if (shzRecOn) shzFlush(); });
