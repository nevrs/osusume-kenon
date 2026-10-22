// X の画面の部品の場所と、そこから数を読む関数。
// 投稿・本文・引用の場所は attention-vaccine の sites.js（30496cd、2026-09-28・10-09 に実機で確認）から写した。
// 数の読み方は、日本語のおすすめ 45 件で確認（2026-10-20）:
//   保存した分（test/fixtures/ja-home-2026-10-20.json）: 数は省略しない正確な値。文に返信が無い投稿は、返信ボタンも 0 件
//   ページ上で数えただけの分（保存していない）: どの投稿にも数の行がちょうど1つ。引用のある 6 件で、引用の枠の中に数の行は無い。
//   画面にある投稿の要素は 6 件前後（画面の外に出ると消える）
//   英語の画面は未確認

const X_DOM = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  quote: 'div[role="link"]', // 引用された投稿の外枠
  // 返信・リポスト・いいね・ブックマーク・表示の数を、まとめて読み上げ用の文に持つ行
  actionBar: '[role="group"][aria-label]',
};

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

// 投稿の数の行の文（読み上げ用）を返す。引用の枠の中の行は使わない。無ければ null
function countLabel(post) {
  for (const bar of post.querySelectorAll(X_DOM.actionBar)) {
    const q = bar.closest(X_DOM.quote);
    if (q && post.contains(q)) continue;
    const label = bar.getAttribute("aria-label");
    if (parseActionLabel(label)) return label;
  }
  return null;
}

if (typeof module !== "undefined") module.exports = { X_DOM, parseCount, parseActionLabel, countsOf };
