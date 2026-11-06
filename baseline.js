// タイムライン温度（D27）の基準。日付つきで 1 つずつ持つ。開発者が後から足すときは、配列の末尾に足す（前の基準は消さない）。
// 2026-11-06 に、11/1〜2 の基準を取り直した値で差し替えた（本人の判断。前の基準を集めたアカウントは、検索が 1 度走ったおそれがあった）。
// 同じ日の 16 時台の 1 回を足した（0.17.3。本人の判断）。
// 数え方は stats-core.js の shzTempTally と同じ（おすすめ・反応の数を読めた投稿・各回の始めの 150 件・3 分空いたら別の回）。
// 値の出どころと限りは research/ragebait-record.md の「学ぶ前の X」の基準。hot は返信が多め（返信 10 件以上で、返信がいいねの 3% 以上）の件数
// groups は、いいねの帯（stats-core.js の SHZ_TEMP_BANDS）ごとの [かな無の件数, うち返信が多め, かな有の件数, うち返信が多め]（shzTempGroup で数えた）。
// 設定画面は、これをその人のおすすめの混ざり方で重みづけし直して比べる（shzTempBaseFor。D31）。groups の無い基準は、そのまま比べる
const SHZ_BASELINES = [
  { id: "2026-11-06-ja", from: "2026-11-06", to: "2026-11-06", lang: "ja", n: 713, hot: 238,
    groups: [[63, 7, 69, 3], [43, 31, 89, 44], [128, 78, 190, 51], [63, 19, 68, 5]] },
];
// いま比べる基準（いちばん新しいもの）
const shzBaseline = () => SHZ_BASELINES[SHZ_BASELINES.length - 1];

if (typeof module !== "undefined") module.exports = { SHZ_BASELINES, shzBaseline };
