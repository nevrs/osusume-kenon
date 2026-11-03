// 「おすすめ」の目立つ投稿をたたむ（試験。DESIGN.md D25・D27）。設定でオンにしたときだけ動く（初期値はオフ）。
// 見分けるのは、投稿の下の数（返信・いいね・表示）だけ。AI を待たないので、投稿が出たその場でたたむ（D13 で外した、AI を待ってたたむ作りとは別）。
// 札には、たたんだ理由（どの形の投稿か）だけを出し、本文・投稿者名は出さない。「開く」は本人が押す。X へは何も送らず、X のボタンも押さない。
// 結果は記憶の中だけ。保存するのは「今日たたんだ件数・開いた件数」（heatFoldDay）だけで、本文・ID は保存しない。

const SHZ_HF_ATTR = "data-shizume-fold"; // folded（たたんだ）/ open（見せる）
const SHZ_HF_ID = "data-shizume-fold-id"; // 印を付けたときの投稿の ID（X が同じ要素に別の投稿を入れたら捨てる）
const SHZ_HF_BOX = "shizume-fold-box";
const SHZ_HF_STYLE = "shizume-fold-style";

let shzHfOn = false;
let shzHfRules = { rowdy: true, wide: false, line: SHZ_FOLD_LINES[0] }; // どの形をたたむか（設定画面で選ぶ）。rowdy は「返信が多め」、line はその線（3 段。D27）
let shzHfObserver = null;
const shzHfWhy = new Map(); // 投稿の ID → たたむ理由（"rowdy" / "wide" / ""）。最初に見た時点の数で決め、あとで数が増えても変えない（読んでいる最中にたたまない）
const shzHfOpened = new Set(); // 本人が「開く」を押した投稿の ID
const shzHfCounted = new Set(); // 今日の件数に数えた投稿の ID

function shzHfReason(ct) {
  if (shzHfRules.rowdy && shzHeavy(ct, shzHfRules.line)) return "rowdy";
  if (shzHfRules.wide && shzWide(ct)) return "wide";
  return "";
}

function shzHfStyle() {
  if (document.getElementById(SHZ_HF_STYLE)) return;
  const st = document.createElement("style");
  st.id = SHZ_HF_STYLE;
  st.textContent = `article[${SHZ_HF_ATTR}="folded"]>:not(.${SHZ_HF_BOX}){display:none!important}
.${SHZ_HF_BOX}{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;font-size:13px;line-height:1.5;color:#71767b;border-bottom:1px solid rgba(113,118,123,.3)}
.${SHZ_HF_BOX} button{flex:none;font-size:13px;color:inherit;background:none;border:1px solid currentColor;border-radius:999px;padding:2px 12px;cursor:pointer}`;
  document.head.appendChild(st);
}

// 札の理由の文。返信が多めは、いま選んでいる線を添える（「いいねの 3% 以上」など）
const shzHfLineText = (line) => (line >= 1 ? shzT("foldLineLikes") : shzT("foldLinePct", { p: Math.round(line * 100) }));
const shzHfWhyText = (why) => shzT(`foldWhy_${why}`, { line: shzHfLineText(shzHfRules.line) });

function shzHfClear(article) {
  article.removeAttribute(SHZ_HF_ATTR);
  article.removeAttribute(SHZ_HF_ID);
  article.querySelector(`.${SHZ_HF_BOX}`)?.remove();
}

function shzHfShow(article) {
  article.querySelector(`.${SHZ_HF_BOX}`)?.remove();
  article.setAttribute(SHZ_HF_ATTR, "open");
}

async function shzHfCount(field) {
  const today = shzDay(Date.now());
  const { heatFoldDay: v } = await chrome.storage.local.get({ heatFoldDay: null });
  const cur = v?.d === today ? v : { d: today, n: 0, o: 0 };
  await chrome.storage.local.set({ heatFoldDay: { ...cur, [field]: (cur[field] || 0) + 1 } }); // 複数のタブで同時に数えると、ずれうる（表示だけ）
}

function shzHfHide(article, id, why) {
  article.setAttribute(SHZ_HF_ATTR, "folded");
  if (article.querySelector(`.${SHZ_HF_BOX}`)) return;
  const box = document.createElement("div");
  box.className = SHZ_HF_BOX;
  box.dataset.why = why;
  const label = document.createElement("span");
  label.className = `${SHZ_HF_BOX}-label`;
  label.textContent = shzHfWhyText(why);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = shzT("foldOpen");
  box.addEventListener("click", (e) => e.stopPropagation()); // X の「投稿を開く」（詳細ページへ移る）まで届かせない
  btn.addEventListener("click", () => {
    shzHfOpened.add(id);
    shzLog("fold", "opened", { why });
    shzHfCount("o");
    shzHfShow(article);
  });
  box.append(label, btn);
  article.appendChild(box);
}

// 投稿が出たとき。おすすめで、広告でなく、数の行が読めるものだけを見る
function shzHfWatch(article) {
  if (shzFeedOf(document, location.pathname) !== "for-you" || shzIsAd(article)) return;
  const id = shzPostId(article);
  if (!id) return;
  if (article.hasAttribute(SHZ_HF_ATTR)) {
    const same = article.getAttribute(SHZ_HF_ID) === id;
    if (same && (article.getAttribute(SHZ_HF_ATTR) === "open" || article.querySelector(`.${SHZ_HF_BOX}`))) return;
    if (!same) shzHfClear(article); // X が同じ要素に別の投稿を入れた。前の印は捨てて、もう一度見る
    // 同じ投稿で札だけが消えた（X が描き直した）ときは、下で札を付け直す。中身が隠れたまま「開く」が無い状態にしない
  }
  let why = shzHfWhy.get(id);
  if (why === undefined) {
    const ct = shzPostCounts(article, document.documentElement.lang);
    if (!ct) return; // 数の行がまだ無い。あとの走査でもう一度見る
    why = shzHfReason(ct);
    shzHfWhy.set(id, why);
  }
  article.setAttribute(SHZ_HF_ID, id);
  if (!why || shzHfOpened.has(id)) { shzHfShow(article); return; }
  shzHfHide(article, id, why);
  if (!shzHfCounted.has(id)) {
    shzHfCounted.add(id);
    shzLog("fold", "folded", { why });
    shzHfCount("n");
  }
}

function shzHfScan() {
  for (const a of document.querySelectorAll(X_DOM.post)) shzHfWatch(a);
}

function shzHfStart() {
  if (shzHfObserver) return;
  shzHfOn = true;
  shzLog("fold", "start", shzHfRules);
  shzHfStyle();
  shzHfObserver = new MutationObserver(shzHfScan); // 描かれる前にたたむため、次の描画を待たずにその場で見る（見るのは数の行の文だけで軽い）
  shzHfObserver.observe(document.body, { childList: true, subtree: true });
  shzHfScan();
}

function shzHfStop() {
  if (!shzHfOn) return;
  shzLog("fold", "stop");
  shzHfOn = false;
  shzHfObserver?.disconnect();
  shzHfObserver = null;
  for (const a of document.querySelectorAll(`[${SHZ_HF_ATTR}]`)) shzHfClear(a); // オフにしたら、すべて元に戻す
  document.getElementById(SHZ_HF_STYLE)?.remove();
}

const shzHfReadRules = (v) => ({ rowdy: v?.rowdy !== false, wide: v?.wide === true, line: SHZ_FOLD_LINES.includes(v?.line) ? v.line : SHZ_FOLD_LINES[0] });

shzLoadLang(() => { // 言語が変わったら、出ている札の文も替える
  for (const b of document.querySelectorAll(`.${SHZ_HF_BOX}`)) {
    b.querySelector(`.${SHZ_HF_BOX}-label`).textContent = shzHfWhyText(b.dataset.why);
    b.querySelector("button").textContent = shzT("foldOpen");
  }
});
chrome.storage.local.get({ heatFoldEnabled: false, heatFoldRules: null }, (v) => {
  shzHfRules = shzHfReadRules(v.heatFoldRules);
  if (v.heatFoldEnabled === true) shzHfStart();
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c.heatFoldRules) { // たたむ形が変わった。見分けた理由は数え直す（開いた投稿は開いたまま）
    shzHfRules = shzHfReadRules(c.heatFoldRules.newValue);
    shzHfWhy.clear();
    if (shzHfOn) { shzHfStop(); shzHfStart(); }
  }
  if (!c.heatFoldEnabled) return;
  if (c.heatFoldEnabled.newValue === true) shzHfStart();
  else shzHfStop();
});
