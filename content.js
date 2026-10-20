// X のタイムラインに出た投稿を見つけて、返信・いいねなどの数を読む。
// 今は数を要素に書き込むだけで、画面には何も出さない（確かめ用。開発者ツールで data-shizume-* を見る）。

function scan(root) {
  for (const post of root.querySelectorAll(X_DOM.post)) {
    if (post.dataset.shizumeSeen) continue;
    const c = readCounts(post);
    if (!c) continue; // 行がまだ描かれていない。次の変化で読み直す
    post.dataset.shizumeSeen = "1";
    post.dataset.shizumeReplies = c.replies;
    post.dataset.shizumeLikes = c.likes;
    post.dataset.shizumeReposts = c.reposts;
  }
}

let pending = false;
new MutationObserver(() => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    scan(document);
  });
}).observe(document.body, { childList: true, subtree: true });
scan(document);
