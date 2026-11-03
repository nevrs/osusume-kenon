// タイムライン温度（D27）の基準。日付つきで 1 つずつ持つ。開発者が後から足すときは、配列の末尾に足す（前の基準は消さない）。
// 数え方は stats-core.js の shzTempTally と同じ（おすすめ・反応の数を読めた投稿・各回の始めの 150 件・3 分空いたら別の回）。
// 値の出どころと限りは research/ragebait-record.md の「学ぶ前の X」の基準。hot は返信が多め（返信 10 件以上で、返信がいいねの 3% 以上）の件数
const SHZ_BASELINES = [
  { id: "2026-11-01-ja", from: "2026-11-01", to: "2026-11-02", lang: "ja", n: 460, hot: 131 },
];
// いま比べる基準（いちばん新しいもの）
const shzBaseline = () => SHZ_BASELINES[SHZ_BASELINES.length - 1];

if (typeof module !== "undefined") module.exports = { SHZ_BASELINES, shzBaseline };
