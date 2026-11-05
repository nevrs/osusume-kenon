// X の画面の部品の場所。投稿・本文・引用の場所は attention-vaccine の sites.js（30496cd、2026-09-28・10-09 に実機で確認）から写した。
// 画面にある投稿の要素は 6 件前後（画面の外に出ると消える）。英語の画面は未確認。
// 数の行（返信・いいね等）は、2026-10-20 に日本語の画面で確認（どの投稿にもちょうど 1 つ、引用の枠の中には無い）。読む関数は x-counts.js（D25）

const X_DOM = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  quote: 'div[role="link"]', // 引用された投稿の外枠
  actionBar: '[role="group"][aria-label]', // 返信・リポスト・いいね・ブックマーク・表示の数を、まとめて読み上げ用の文に持つ行
  author: '[data-testid="User-Name"]', // 投稿者の表示名と @名の欄（中のリンクが /<@名>）
  account: 'a[data-testid="AppTabBar_Profile_Link"]', // 左の列の「プロフィール」。リンク先が /<ログイン中の @名>（D27）
  // 左下の「アカウントメニュー」。中のアイコンの data-testid が UserAvatar-Container-<@名>、文字に「@名」。
  // 2026-11-06 に日本語の画面で確認（作ったばかりのアカウントでは、左の列に「プロフィール」が無かった）
  accountSwitcher: '[data-testid="SideNav_AccountSwitcher_Button"]',
};
