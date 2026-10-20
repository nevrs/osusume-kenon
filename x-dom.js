// X の画面の部品の場所と、そこから数を読む関数。
// 投稿・本文・引用の場所は attention-vaccine の sites.js（30496cd、2026-09-28・10-09 に実機で確認）から写した。
// 数の読み方は未確認（SESSION.md の次の一手 2 で実機の X で確かめる）。

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
// 文に出てこない種類は 0 とみなす（X は 0 件の種類を読み上げない、と推測。未確認）
function parseActionLabel(label) {
  const counts = { replies: 0, reposts: 0, likes: 0, bookmarks: 0, views: 0 };
  const re = /(\d[\d,]*(?:\.\d+)?\s*[万億KMB]?)\s*(?:件の)?\s*([^\d\s、,]+)/gi;
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

// 投稿の要素から数を読む。引用の枠の中の行は使わない
function readCounts(post) {
  for (const bar of post.querySelectorAll(X_DOM.actionBar)) {
    const q = bar.closest(X_DOM.quote);
    if (q && post.contains(q)) continue;
    const c = parseActionLabel(bar.getAttribute("aria-label"));
    if (c) return c;
  }
  return null;
}

if (typeof module !== "undefined") module.exports = { X_DOM, parseCount, parseActionLabel };
