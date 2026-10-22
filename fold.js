// 「おすすめ」の、敵意の強い投稿をたたむ（試験。DESIGN.md D12）。設定でオンにしたときだけ動く（初期値はオフ）。
// 先にたたむ: 投稿が出たら、判定が終わるまで中身を見せない（同じ大きさの空白）。判定が普通なら開き、敵意が強ければ、本文も投稿者名も出さない札にする。
// 判定は feed-judge.js の shzFeedJudge（端末の中の組み込み AI）。結果は記憶の中だけに置き、保存しない。X へは何も送らず、X のボタンも押さない。
// 札の「開く」は、本人が押す。組み込み AI が使えない・判定が間に合わないときは、たたまずに見せる（見せる側に倒す）。

const SHZ_FOLD = {
  strong: 70, // 敵意がこの点以上でたたむ（設定画面の「強い」と同じ）
  waitMs: 6000, // 判定を待つ上限。過ぎたら見せる
  aiOffMs: 60_000, // 組み込み AI が使えなかったら、この間は先にたたまない
};
const SHZ_FOLD_ATTR = "data-shizume-fold"; // pending（判定待ち）/ folded（たたんだ）/ open（見せる）
const SHZ_FOLD_ID = "data-shizume-fold-id"; // 印を付けたときの投稿の ID
const SHZ_FOLD_BOX = "shizume-fold-box";

let shzFoldOn = false;
let shzFoldObserver = null;
let shzFoldAiOffUntil = 0;
let shzFoldRunning = false;
const shzFoldResult = new Map(); // 投稿の ID → "fold" / "show"（判定済み。X が要素を作り直しても、同じ結果を使う）
const shzFoldOpened = new Set(); // 本人が「開く」を押した投稿の ID
const shzFoldQueue = new Set(); // 判定待ちの投稿の要素
const shzFoldCounted = new Set(); // 今日の件数に数えた投稿の ID

function shzFoldStyle() {
  if (document.getElementById("shizume-fold-style")) return;
  const st = document.createElement("style");
  st.id = "shizume-fold-style";
  st.textContent = `article[${SHZ_FOLD_ATTR}="pending"]{visibility:hidden!important}
article[${SHZ_FOLD_ATTR}="folded"]>:not(.${SHZ_FOLD_BOX}){display:none!important}
.${SHZ_FOLD_BOX}{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 16px;font-size:13px;color:#71767b;border-bottom:1px solid rgba(113,118,123,.3)}
.${SHZ_FOLD_BOX} button{font-size:13px;color:inherit;background:none;border:1px solid currentColor;border-radius:999px;padding:2px 12px;cursor:pointer}`;
  document.head.appendChild(st);
}

function shzFoldClear(article) {
  article.removeAttribute(SHZ_FOLD_ATTR);
  article.removeAttribute(SHZ_FOLD_ID);
  article.querySelector(`.${SHZ_FOLD_BOX}`)?.remove();
}

function shzFoldShow(article) {
  article.querySelector(`.${SHZ_FOLD_BOX}`)?.remove();
  article.setAttribute(SHZ_FOLD_ATTR, "open");
}

function shzFoldHide(article, id) {
  article.setAttribute(SHZ_FOLD_ATTR, "folded");
  if (article.querySelector(`.${SHZ_FOLD_BOX}`)) return;
  const box = document.createElement("div");
  box.className = SHZ_FOLD_BOX;
  const label = document.createElement("span");
  label.textContent = "敵意の強い投稿を 1 件たたみました";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "開く";
  box.addEventListener("click", (e) => e.stopPropagation()); // X の「投稿を開く」（詳細ページへ移る）まで届かせない
  btn.addEventListener("click", () => {
    if (id) shzFoldOpened.add(id);
    shzFoldShow(article);
  });
  box.append(label, btn);
  article.appendChild(box);
}

function shzFoldApply(article, id, verdict) {
  if (verdict === "fold" && !(id && shzFoldOpened.has(id))) {
    shzFoldHide(article, id);
    if (id && !shzFoldCounted.has(id)) {
      shzFoldCounted.add(id);
      shzFoldCount();
    }
  } else shzFoldShow(article);
}

async function shzFoldCount() {
  const today = shzDay(Date.now());
  const { foldDay } = await chrome.storage.local.get({ foldDay: null });
  await chrome.storage.local.set({ foldDay: { d: today, n: (foldDay?.d === today ? foldDay.n : 0) + 1 } });
}

// 投稿が出たとき。おすすめで、広告でなく、本文があるものだけを、先にたたむ（判定待ち）。それ以外は何もしない
function shzFoldWatch(article) {
  if (!shzFoldOn) return;
  if (shzFeedOf(document, location.pathname) !== "for-you" || shzIsAd(article)) return;
  const id = shzPostId(article), text = shzPostText(article);
  if (!id || !text) return; // 本文がまだ無い・画像だけ。あとの走査でもう一度見る
  if (article.hasAttribute(SHZ_FOLD_ATTR)) {
    if (article.getAttribute(SHZ_FOLD_ID) === id) return;
    shzFoldClear(article); // X が同じ要素に別の投稿を入れた。前の印は捨てて、もう一度見る
  }
  article.setAttribute(SHZ_FOLD_ID, id);
  const known = shzFoldResult.get(id);
  if (known) return shzFoldApply(article, id, known);
  if (Date.now() < shzFoldAiOffUntil) return; // AI が使えないあいだは、たたまない
  article.setAttribute(SHZ_FOLD_ATTR, "pending");
  shzFoldQueue.add(article);
  setTimeout(() => { // 間に合わなければ見せる
    if (article.getAttribute(SHZ_FOLD_ATTR) === "pending") { shzFoldQueue.delete(article); shzFoldShow(article); }
  }, SHZ_FOLD.waitMs);
  shzFoldPump();
}

const shzFoldDistance = (a) => { const r = a.getBoundingClientRect(); return r.top >= 0 ? r.top : -r.top * 2; }; // 画面の下の方（これから見る方）を先に

async function shzFoldPump() {
  if (shzFoldRunning) return;
  shzFoldRunning = true;
  try {
    while (shzFoldOn && shzFoldQueue.size) {
      const next = [...shzFoldQueue].sort((a, b) => shzFoldDistance(a) - shzFoldDistance(b))[0];
      shzFoldQueue.delete(next);
      if (!next.isConnected || next.getAttribute(SHZ_FOLD_ATTR) !== "pending") continue;
      const id = shzPostId(next), text = shzPostText(next);
      const res = id && text ? await shzFeedJudge(text) : { failed: true };
      if (id && res && !res.failed) shzFoldResult.set(id, res.h >= SHZ_FOLD.strong ? "fold" : "show"); // 間に合わずに見せたあとでも覚える（X が要素を作り直したとき、また空白にしない）
      if (id && res?.failed) shzFoldResult.set(id, "show"); // 失敗した投稿も、繰り返し試さない
      if (!shzFoldOn || !next.isConnected || next.getAttribute(SHZ_FOLD_ATTR) !== "pending") continue; // 待っているあいだに、オフ・間に合わず表示・要素の消去
      if (res === null) { // 組み込み AI が使えない。待っている分も見せる
        shzFoldAiOffUntil = Date.now() + SHZ_FOLD.aiOffMs;
        shzFoldShow(next);
        for (const a of shzFoldQueue) shzFoldShow(a);
        shzFoldQueue.clear();
        continue;
      }
      if (res.failed) { shzFoldShow(next); continue; }
      shzFoldApply(next, id, shzFoldResult.get(id));
    }
  } finally {
    shzFoldRunning = false;
  }
}

function shzFoldScan() {
  for (const a of document.querySelectorAll(X_DOM.post)) shzFoldWatch(a);
}

function shzFoldStart() {
  if (shzFoldObserver) return;
  shzFoldOn = true;
  shzFoldStyle();
  let pending = false;
  shzFoldObserver = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; shzFoldScan(); });
  });
  shzFoldObserver.observe(document.body, { childList: true, subtree: true });
  shzFoldScan();
}

function shzFoldStop() {
  shzFoldOn = false;
  shzFoldObserver?.disconnect();
  shzFoldObserver = null;
  shzFoldQueue.clear();
  for (const a of document.querySelectorAll(`[${SHZ_FOLD_ATTR}]`)) shzFoldClear(a); // オフにしたら、すべて元に戻す
  document.getElementById("shizume-fold-style")?.remove();
}

chrome.storage.local.get({ foldEnabled: false }, (v) => { if (v.foldEnabled === true) shzFoldStart(); });
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local" || !c.foldEnabled) return;
  if (c.foldEnabled.newValue === true) shzFoldStart();
  else shzFoldStop();
});
