# おすすめ検温（旧 shizume・鎮め）

X（x.com）だけで動く Chrome 拡張。X の「おすすめ」が炎上と対立に点数を付ける仕組みから、ユーザーを守る。

## 動かし方

- テスト: `node --test test/x-counts.test.js test/record-core.test.js test/stats-core.test.js`（ディレクトリを渡すと Node 22 では失敗する）
- 記録・判定・設定画面の流れ（模擬 DOM）: `node tools/record-harness.js . <jsdom を入れた node_modules>`、`node tools/fold-harness.js . <同>`、`node tools/feedjudge-harness.js . <同>`、`node tools/options-harness.js . <同>`
- 拡張: chrome://extensions →「パッケージ化されていない拡張機能を読み込む」でこのフォルダ

## 守ること

- **X へ操作を自動で送らない。** 興味がない・ミュート・ブロック・報告・返信などは、本人が押す（DESIGN.md D3）。本人のボタン 1 回で拡張が X のボタンを押す形も作らない（X の規則の「scripting the X website」に当たるおそれ。当たるかは解釈。research/x-rules.md）
- **本人のアカウントで、台本で X をスクロールしたり集めたり、X のボタンを押したりしない**（規約の crawling / scraping、自動化の規則。research/x-rules.md の 4・5）。実機の確認で X のボタンを押すのは本人
- **X の仕組みについて書くときは、`research/x-algorithm.md` の記録とコミットを根拠にする。** 記録に無いことは「推測」と書く
- **流用してよいコード:** attention-vaccine（nevrs/attention-vaccine、同じ作者、MIT。写したら同期しない: DESIGN.md D4）と Apache-2.0 の x-algorithm。
  bouncer（AGPL）・FeedMonitor（ライセンス無し）は読むだけで、コードを写さない
- 投稿の本文を外部へ送る機能は、送り先と送る条件を設定画面と README に書く
- 記録（record.js）は、投稿者名の欄・リンク・元の ID を残さない（本文に入っているものは残る）。オフが初期値（DESIGN.md D9）。判定（feed-judge.js）は端末の中の組み込み AI だけで行い、本文を外へ出さない。点だけの記録に本文を戻さない（D10）
- 測定モードで、X のスクロール・タブ切り替え・ボタン押下を拡張がしない。進み具合を見せて、本人に眺めてもらう（D10）
- 結果を人に見せる文には、「目安」であること、「おすすめとフォロー中の差」であって「押し上げた量」ではないことを必ず添える（D10）
- 利用者に見える文言は日本語（平易に。専門用語は言い換える）
- 内部の名前（保存の印の塩 `shizume:`・DOM の id・data-shizume-*・shz 接頭辞）は、既存の記録と合わなくなるので変えない（2026-10-22 改名）
- たたむ機能（fold.js）: 初期値はオフ。札の「開く」は本人が押す（拡張が X のボタンを押さない）。判定が使えない・遅いときは、たたまずに見せる。札に本文・投稿者名を出さない。本文を保存しない（D12）
- **利用者ごとの履歴・記録の中身を、リポに入れない。** 実機で集めた投稿の数・本文・投稿者・記録の書き出しは、コミットしない（公開リポ。履歴にも残さない）。試験の例は作り物か自作の文にする。`.gitignore` で、書き出しのファイル名の型を除いてある
