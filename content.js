// X のタイムラインに出た投稿を見つけて、返信・いいねなどの数を読む。
// 今は数を要素に書き込むだけで、画面には何も出さない（確かめ用。開発者ツールで data-shizume-* を見る）。
// 数は変わる（いいねが増える、本人が押す）。X が要素を別の投稿に使い回すかは未確認なので、
// 数の行の文が前回と違えば毎回読み直す。

function scan(root) {
  for (const post of root.querySelectorAll(X_DOM.post)) {
    const label = countLabel(post);
    if (label == null || label === post.dataset.shizumeLabel) continue;
    post.dataset.shizumeLabel = label;
    const c = countsOf(label);
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
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
scan(document);
