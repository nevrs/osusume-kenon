// 投稿の数の行（返信・リポスト・いいね等）を読む関数と、「目立つ投稿」の見分け方（DESIGN.md D25）。記録（record.js）・たたむ（fold.js）・設定画面が使う。test/x-counts.test.js で試験。
// 数の読み方は、2026-10-20 に日本語の画面で確認（実機の数は公開していない。test/x-counts.test.js に作り物の例）:
//   数は省略しない正確な値。文に返信が無い投稿は、返信ボタンも 0 件
//   どの投稿にも数の行がちょうど1つ。引用の枠の中には無い
//   英語の画面は未確認

// 「1,234」「1.2万」「3.4K」「5M」などを数にする。読めなければ null
function parseCount(s) {
  const m = String(s).trim().match(/^(\d[\d,]*(?:\.\d+)?)\s*([万億KMB])?$/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  const unit = { 万: 1e4, 億: 1e8, K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] ?? 1;
  return Math.round(n * unit);
}

const COUNT_KINDS = [
  ["replies", /^(返信|repl)/i],
  ["reposts", /^(リポスト|repost|retweet)/i],
  ["likes", /^(いいね|like)/i],
  ["bookmarks", /^(ブックマーク|bookmark)/i],
  ["views", /^(表示|view)/i],
];

// 行の読み上げ用の文（例「3 件の返信、5 件のリポスト、20 件のいいね」「3 replies, 5 reposts, 20 likes」）から数を取る。
// 文に出てこない種類は null（読めなかったのか 0 件なのかを、ここでは決めない。0 とみなすのは countsOf）。
// 数→語の順を前提にしている（「Replies: 3」のような語→数の順は取り違える。未確認）
function parseActionLabel(label) {
  const counts = { replies: null, reposts: null, likes: null, bookmarks: null, views: null };
  // 単位の直後に英字が続くときは単位ではない（「12 bookmarks」の b を 10億 と読まない）
  const re = /(\d[\d,]*(?:\.\d+)?(?:\s*[万億KMB](?![a-z]))?)\s*(?:件の)?\s*([^\d\s、,]+)/gi;
  let found = false;
  for (const [, num, word] of String(label).matchAll(re)) {
    const kind = COUNT_KINDS.find(([, k]) => k.test(word));
    const n = parseCount(num);
    if (kind && n != null) {
      counts[kind[0]] = n;
      found = true;
    }
  }
  return found ? counts : null;
}

// 数の行の文から数を取る。日本語の画面では、文に無い種類を 0 とする（返信は 0 件を省くと確認済み。
// いいね・リポスト・ブックマークは同じ作りと推測）。ほかの言語では null のまま（読めなかったのかもしれない）
function countsOf(label, lang) {
  const c = parseActionLabel(label);
  if (!c) return null;
  if (/^ja\b/.test(lang || "")) for (const k of Object.keys(c)) c[k] ??= 0;
  return c;
}

// 投稿の数 {r 返信, p リポスト, l いいね, b ブックマーク, v 表示}。数の行が無い・読めなければ null。日本語の画面でなければ、文に無い種類は null のまま
function shzPostCounts(article, lang) {
  const bar = article.querySelector('[role="group"][aria-label]'); // x-dom.js の X_DOM.actionBar（node の試験でも使うので、ここに書く）
  const c = bar && countsOf(bar.getAttribute("aria-label"), lang);
  return c ? { r: c.replies, p: c.reposts, l: c.likes, b: c.bookmarks, v: c.views } : null;
}

// 投稿されてからの分。引用の枠の外の、最初の日時（time[datetime]）から。読めなければ null
function shzPostAgeMin(article, nowMs = Date.now()) {
  for (const t of article.querySelectorAll("time[datetime]")) {
    if (t.closest('div[role="link"]')) continue; // 引用元の日時
    const ms = Date.parse(t.getAttribute("datetime"));
    return Number.isFinite(ms) ? Math.max(0, Math.round((nowMs - ms) / 60_000)) : null;
  }
  return null;
}

// 「目立つ投稿」の見分け方（D25・D27）
//   返信が多め（heavy）: 返信が SHZ_HEAT.replyMin 件以上あり、返信がいいねの line 倍以上（line は 0.03・0.1・1 の 3 段。D26 で引き直した荒れの線）。
//     タイムライン温度（D27）は SHZ_TEMP_LINE（3%）で数える。数の行に出ない種類は 0 とみなす（英語の画面では、0 件の返信・いいねが文に出ない）
//   大きく広まった（wide）: 表示が SHZ_HEAT.reach 以上
const SHZ_HEAT = { replyMin: 10, reach: 100_000 };
const SHZ_TEMP_LINE = 0.03;
const SHZ_FOLD_LINES = [0.03, 0.1, 1]; // たたむ線の 3 段（設定画面で選ぶ。初めは 3%）
const shzHeavy = (ct, line = SHZ_TEMP_LINE) => !!ct && (ct.r ?? 0) >= SHZ_HEAT.replyMin && (ct.r ?? 0) >= line * (ct.l ?? 0);
const shzWide = (ct) => !!ct && ct.v != null && ct.v >= SHZ_HEAT.reach;

if (typeof module !== "undefined") module.exports = { parseCount, parseActionLabel, countsOf, shzPostCounts, shzPostAgeMin, SHZ_HEAT, SHZ_TEMP_LINE, SHZ_FOLD_LINES, shzHeavy, shzWide };
