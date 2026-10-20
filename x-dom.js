// X の画面の部品の場所と、そこから数を読む関数。
// 投稿・本文・引用の場所は attention-vaccine の sites.js（30496cd、2026-09-28・10-09 に実機で確認）から写した。
// 数の読み方は未確認（SESSION.md の次の一手で、実機の X で確かめる）。

const X_DOM = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  quote: 'div[role="link"]', // 引用された投稿の外枠
  // 返信・リポスト・いいね・ブックマーク・表示の数を、まとめて読み上げ用の文に持つ行（推測。未確認）
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
// 文に出てこない種類は null（0 件なのか読めなかったのかを分けるため。X が 0 件の種類を読み上げないかは未確認）。
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

if (typeof module !== "undefined") module.exports = { X_DOM, parseCount, parseActionLabel };
