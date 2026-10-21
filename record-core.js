// 「おすすめ」で見せられた投稿の記録（DESIGN.md D9）の、画面に触れない部分。record.js が使う。
// 投稿の ID・本文を読む、広告かどうかを見る、どのタブかを見る、期限の来た記録を片付ける、数える。

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

const SHZ_KEEP_DAYS = 14; // 本文を持つ日数（record.js と設定画面で共通）
const SHZ_KEEP_COUNT_DAYS = 365; // 判定済みの記録を、本文を消したあとも点数だけ持つ日数

// 判定が済んでいる記録か（点が 2 つとも数）
function shzIsJudged(r) {
  return typeof r.h === "number" && typeof r.a === "number";
}

// 日付（この端末の時刻での YYYY-MM-DD）
function shzDay(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 期限が来た記録の片付け方。{remove: [キー], strip: {キー: 本文を除いた新しい記録}}
//   本文の期限（textDays）が過ぎた … 判定済みなら本文を消して点数だけ残す（strip）。未判定なら記録ごと消す（remove）
//   点数の期限（countDays）が過ぎた、または時刻が壊れている … 記録ごと消す
function shzPurgePlan(records, nowMs, textDays = SHZ_KEEP_DAYS, countDays = SHZ_KEEP_COUNT_DAYS) {
  const textLimit = nowMs - textDays * 86_400_000, countLimit = nowMs - countDays * 86_400_000;
  const remove = [], strip = {};
  for (const [k, r] of Object.entries(records)) {
    if (!(r.ts >= countLimit)) remove.push(k);
    else if (!(r.ts >= textLimit)) {
      if (!shzIsJudged(r)) remove.push(k);
      else if ("text" in r) strip[k] = { feed: r.feed, ts: r.ts, a: r.a, h: r.h, jv: r.jv };
    }
  }
  return { remove, strip };
}

// 保存されている記録に片付けを当てる。残った記録のキーを返す（chrome.storage を使うので、拡張の中でだけ呼ぶ）
async function shzApplyPurge(textDays = SHZ_KEEP_DAYS) {
  const all = await chrome.storage.local.get(null);
  const recs = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("rec:")));
  const { remove, strip } = shzPurgePlan(recs, Date.now(), textDays);
  if (Object.keys(strip).length) await chrome.storage.local.set(strip);
  if (remove.length) await chrome.storage.local.remove(remove);
  return Object.keys(recs).filter((k) => !remove.includes(k));
}

// 件数。feed ごと・日ごと
function shzSummarize(records) {
  const out = { total: 0, byFeed: {}, byDay: {} };
  for (const r of Object.values(records)) {
    out.total++;
    out.byFeed[r.feed] = (out.byFeed[r.feed] || 0) + 1;
    const day = shzDay(r.ts);
    out.byDay[day] = (out.byDay[day] || 0) + 1;
  }
  return out;
}

if (typeof module !== "undefined") module.exports = { SHZ_KEEP_DAYS, SHZ_KEEP_COUNT_DAYS, shzIsJudged, shzDay, shzPurgePlan, shzPostId, shzPostText, shzIsAd, shzFeedOf, shzHashId, shzSummarize, SHZ_AD_LABELS };
