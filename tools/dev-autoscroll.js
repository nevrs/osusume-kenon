// 開発用の自動スクロール（DESIGN.md D21）。利用者には出さない。拡張には入れない（manifest が名指ししないので、tools/package.py の zip にも入らない）。
// 使い方: x.com/home を開き、記録をオンにしてから、DevTools の Console に貼る（または Sources → Snippets に置いて Ctrl+Enter）。
// 「おすすめ」「フォロー中」の切り替えは本人がする（タブを押すのは X のボタンなので、台本では押さない）。
// するのはスクロールだけ。投稿を開く・いいね・返信など、X のボタンは押さない。
// 止まるとき: 上限（件数・時間）に届いた／新しい投稿が出てこない／本人がキー・マウス・ホイールに触った／タブが隠れた／/home を離れた。途中で止めるなら __shzAuto.stop()。
// 設定を変えるなら、貼る前に window.__SHZ_AUTO_OPT = { maxPosts: 300 } のように置く。
// 動いている間は sessionStorage の "shizume:dev-auto" に時刻を書き、record.js がその間の記録に auto: 1 の印を付ける（手で見た記録と分けて数えるため）。
(() => {
  const KEY = "shizume:dev-auto";
  window.__shzAuto?.stop("restart");
  const opt = { maxPosts: 150, maxMin: 10, minWaitMs: 1500, maxWaitMs: 3500, stallSteps: 8, ...(window.__SHZ_AUTO_OPT || {}) };
  if (location.pathname !== "/home") { console.warn("[shz-auto] x.com/home で動かす"); return; }
  const seen = new Set(); // 画面に出た投稿のリンク（この台本の数えのためだけ。保存しない）
  const t0 = Date.now(), feed = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() || "?";
  let stall = 0, timer = 0, stopped = false;
  const countNew = () => {
    let n = 0;
    for (const a of document.querySelectorAll('article[data-testid="tweet"]')) {
      const href = a.querySelector('a[href*="/status/"]')?.getAttribute("href");
      if (href && !seen.has(href)) { seen.add(href); n++; }
    }
    return n;
  };
  const byHand = () => stop("本人の操作");
  const onHide = () => { if (document.hidden) stop("タブが隠れた"); };
  const EVENTS = ["keydown", "mousedown", "wheel", "touchstart"];
  function stop(why) {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    try { sessionStorage.removeItem(KEY); } catch {}
    for (const e of EVENTS) removeEventListener(e, byHand, true);
    document.removeEventListener("visibilitychange", onHide);
    removeEventListener("pagehide", byHand);
    console.log(`[shz-auto] 止めた（${why}）: ${feed()} ${seen.size} 件・${Math.round((Date.now() - t0) / 1000)} 秒`);
    if (window.__shzAuto?.stop === stop) delete window.__shzAuto;
  }
  function step() {
    if (stopped) return;
    if (location.pathname !== "/home") return stop("/home を離れた");
    stall = countNew() ? 0 : stall + 1;
    if (seen.size >= opt.maxPosts) return stop("件数の上限");
    if (Date.now() - t0 >= opt.maxMin * 60_000) return stop("時間の上限");
    if (stall >= opt.stallSteps) return stop("新しい投稿が出てこない");
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch {}
    scrollBy({ top: innerHeight * (0.5 + Math.random() * 0.3), behavior: "smooth" }); // 画面の半分強ずつ。記録は 0.5 秒・6 割見えた投稿だけなので、飛ばしすぎない
    timer = setTimeout(step, opt.minWaitMs + Math.random() * (opt.maxWaitMs - opt.minWaitMs));
  }
  for (const e of EVENTS) addEventListener(e, byHand, { capture: true, passive: true }); // 台本の scrollBy はこれらを起こさない
  document.addEventListener("visibilitychange", onHide);
  addEventListener("pagehide", byHand);
  window.__shzAuto = { stop: () => stop("stop()"), opt };
  console.log(`[shz-auto] 始めた: ${feed()}（上限 ${opt.maxPosts} 件・${opt.maxMin} 分）`);
  step();
})();
