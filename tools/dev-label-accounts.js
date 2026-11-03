// 開発用: アカウントの欄（acct。0.16.0 から。DESIGN.md D27）が無い前の記録に、時刻の範囲でアカウントの @名を付ける。利用者には出さない（zip に入らない）。
// 記録は消さない。acct がすでに付いている記録と、どの範囲にも入らない記録は変えない。キー（印）も変えない。
// 使い方: 拡張の設定画面（chrome-extension://<拡張の ID>/options.html）を開き、DevTools の Console に貼ってから
//   await __shzLabel([{ acct: "<@名>", to: <この時刻より前（ミリ秒）> }, { acct: "<@名>", from: <ミリ秒>, to: <ミリ秒> }], { dry: true })
// で数だけを見て、よければ dry: false で書く。@名は「@」を付けずに書く。範囲は from 以上・to 未満（片方を省くと、その側は限り無し）
(() => {
  window.__shzLabel = async (ranges, { dry = true } = {}) => {
    for (const r of ranges) if (!/^[A-Za-z0-9_]{1,15}$/.test(r.acct || "")) throw new Error(`@名として読めない: ${r.acct}`);
    const all = await chrome.storage.local.get(null);
    const set = {}, n = Object.fromEntries(ranges.map((r) => [r.acct, 0]));
    let skipped = 0;
    for (const [k, v] of Object.entries(all)) {
      if (!k.startsWith("rec:") || typeof v.acct === "string") continue;
      const r = ranges.find((x) => v.ts >= (x.from ?? -Infinity) && v.ts < (x.to ?? Infinity));
      if (!r) { skipped++; continue; }
      set[k] = { ...v, acct: r.acct };
      n[r.acct]++;
    }
    if (!dry && Object.keys(set).length) await chrome.storage.local.set(set);
    console.log(`[shz-label] ${dry ? "試しに数えただけ（書いていない）" : "書いた"}:`, n, `どの範囲にも入らない記録 ${skipped} 件`);
    return { n, skipped };
  };
})();
