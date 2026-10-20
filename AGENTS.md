# shizume（鎮め）

X（x.com）だけで動く Chrome 拡張。X の「おすすめ」が炎上と対立に点数を付ける仕組みから、ユーザーを守る。

## 動かし方

- テスト: `node --test test/x-dom.test.js`（ディレクトリを渡すと Node 22 では失敗する）
- 拡張: chrome://extensions →「パッケージ化されていない拡張機能を読み込む」でこのフォルダ

## 守ること

- **X へ操作を自動で送らない。** 興味がない・ミュート・ブロック・報告・返信などは、本人が押す（DESIGN.md D3）
- **X の仕組みについて書くときは、`research/x-algorithm.md` の記録とコミットを根拠にする。** 記録に無いことは「推測」と書く
- **流用してよいコード:** attention-vaccine（nevrs/attention-vaccine、同じ作者、MIT。写したら同期しない: DESIGN.md D4）と Apache-2.0 の x-algorithm。
  bouncer（AGPL）・FeedMonitor（ライセンス無し）は読むだけで、コードを写さない
- 投稿の本文を外部へ送る機能は、送り先と送る条件を設定画面と README に書く
- 利用者に見える文言は日本語（平易に。専門用語は言い換える）
