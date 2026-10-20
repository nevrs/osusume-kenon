# shizume（鎮め）

X（x.com）だけで動く Chrome 拡張。X の「おすすめ」が炎上と対立に点数を付ける仕組みから、ユーザーを守る。

## 守ること

- **X へ操作を自動で送らない。** 興味がない・ミュート・ブロック・報告・返信などは、本人が押す（DESIGN.md D3）
- **X の仕組みについて書くときは、`research/x-algorithm.md` の記録とコミットを根拠にする。** 記録に無いことは「推測」と書く
- **流用してよいコード:** attention-vaccine（`C:\claudecode\attention-vaccine`、同じ作者、MIT）と Apache-2.0 の x-algorithm。
  bouncer（AGPL）・FeedMonitor（ライセンス無し）は読むだけで、コードを写さない
- 投稿の本文を外部へ送る機能は、送り先と送る条件を設定画面と README に書く
- 利用者に見える文言は日本語（平易に。専門用語は言い換える）

## 構成

- `research/` — X 側の仕組みを読んだ記録
- 拡張の本体は未作成（SESSION.md を見る）
