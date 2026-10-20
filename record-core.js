// 「おすすめ」で見せられた投稿の記録（DESIGN.md D9）の、画面に触れない部分。record.js が使う。
// 投稿の ID・本文を読む、広告かどうかを見る、どのタブかを見る、古い記録を消す対象を選ぶ、数える。

// 投稿の ID（投稿へのリンクの /status/<数字>）。無ければ null
function shzPostId(article) {
  for (const a of article.querySelectorAll('a[href*="/status/"]')) {
    if (!a.querySelector("time")) continue; // 日時のリンクだけが、この投稿自身の ID を指す（引用元などのリンクを除く）
    const m = /\/status\/(\d+)/.exec(a.getAttribute("href") || "");
    if (m) return m[1];
  }
  return null;
}

// この投稿自身の本文（引用元の本文は含めない）。無ければ ""
function shzPostText(article) {
  for (const el of article.querySelectorAll(X_DOM.text)) {
    const q = el.closest(X_DOM.quote);
    if (q && article.contains(q)) continue;
    return (el.innerText ?? el.textContent).replace(/\s+/g, " ").trim();
  }
  return "";
}

// 広告（「広告」「Ad」「Promoted」の札が付いた投稿）か。札の場所は未確認なので、本文と引用の外の短い文字だけを見る（推測）
const SHZ_AD_LABELS = new Set(["広告", "Ad", "Promoted", "プロモーション"]);
function shzIsAd(article) {
  for (const s of article.querySelectorAll("span")) {
    if (s.closest(X_DOM.text) || s.closest(X_DOM.quote) || s.closest('[data-testid="User-Name"]')) continue; // 表示名が「Ad」の人を広告と誤らない
    if (SHZ_AD_LABELS.has((s.textContent || "").trim())) return true;
  }
  return false;
}

// 今開いているタブ。/home の「おすすめ」「フォロー中」だけを記録の対象にする。それ以外は null
function shzFeedOf(doc, pathname) {
  if (pathname !== "/home") return null;
  const tab = doc.querySelector('[role="tab"][aria-selected="true"]');
  const t = (tab?.textContent || "").trim();
  if (/^(おすすめ|For you)$/i.test(t)) return "for-you";
  if (/^(フォロー中|Following)$/i.test(t)) return "following";
  return null;
}

// ID から短い印を作る（同じ投稿の二重記録を見分けるため）。秘密の値を混ぜていないので、候補の ID を持つ人なら照合できる。
// 元の投稿を隠す働きは期待しない（本文そのものから、X で検索すれば投稿はたどれる）
async function shzHashId(id) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`shizume:${id}`));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SHZ_KEEP_DAYS = 14; // 記録を持つ日数（record.js と設定画面で共通）

// 古い記録を消す対象。judged（判定済み）の本文は短く、未判定は長く持つ…は、判定の仕組みができてから決める。今は一律の日数
function shzPurgeKeys(records, nowMs, maxAgeDays) {
  const limit = nowMs - maxAgeDays * 86_400_000;
  return Object.entries(records).filter(([, r]) => !(r.ts >= limit)).map(([k]) => k);
}

// 件数。feed ごと・日ごと
function shzSummarize(records) {
  const out = { total: 0, byFeed: {}, byDay: {} };
  for (const r of Object.values(records)) {
    out.total++;
    out.byFeed[r.feed] = (out.byFeed[r.feed] || 0) + 1;
    const day = new Date(r.ts).toISOString().slice(0, 10);
    out.byDay[day] = (out.byDay[day] || 0) + 1;
  }
  return out;
}

if (typeof module !== "undefined") module.exports = { SHZ_KEEP_DAYS, shzPostId, shzPostText, shzIsAd, shzFeedOf, shzHashId, shzPurgeKeys, shzSummarize, SHZ_AD_LABELS };
