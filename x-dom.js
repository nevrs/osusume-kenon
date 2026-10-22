// X の画面の部品の場所。投稿・本文・引用の場所は attention-vaccine の sites.js（30496cd、2026-09-28・10-09 に実機で確認）から写した。
// 画面にある投稿の要素は 6 件前後（画面の外に出ると消える）。英語の画面は未確認。
// 数の行（返信・いいね等）を読む関数は、拡張では使わないので tools/x-counts.js に移した（2026-10-22）。

const X_DOM = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  quote: 'div[role="link"]', // 引用された投稿の外枠
};
