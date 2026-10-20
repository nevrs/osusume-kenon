# X の「おすすめ」の並べ方 — 読んだ記録

いつ読むか: X 側の仕組みを根拠に機能を決めるとき。数値を引用するとき。

- 読んだもの: [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm)（Apache-2.0）
- コミット: `74d49a4ffb398949a5f9312f828d7112d7d31f00`（2026-10-20）
- 確かめた範囲はこのリポの中だけ。X のサーバーで別のコードや設定が動いている可能性は残る

## 点数の式

Phoenix（Grok 由来の予測モデル）が「この人がこの投稿に各行動をとる確率」を出し、重みを掛けて足す。

```
基本の点数 = Σ 重み × その人がその行動をとる確率（予測）
```

この後に次の調整が入る（`xai-value-model/scoring.rs`、X の README の Scoring and Ranking）:
負の点数のずらし（`offset_score`）、フォローしていない人の投稿の割引、同じ作者が続くときの減点、
表示の少ない作者の押し上げ。最後に `vm-ranker/` が、似た投稿が並ばないよう並べ直す。

### 重みは2か所にあり、初期値が少し違う

`home-mixer/scorers/vm_ranker.rs` は手元で点数を計算した後、別のサービス `vm-ranker/` に計算させて上書きする
（手元の点数は、呼び出しが失敗したときの予備）。どちらも同じ設定の名前（例 `rust_home_mixer_favorite_weight`）で値を読むので、
本番では同じ値になるはず。ただしコード中の初期値が違う。

| 行動 | `home-mixer/params/param.rs` | `vm-ranker/params.rs` | メモ |
|---|---:|---:|---|
| いいね | 0.66 | 0.5 | |
| 返信 | 5.0 | 5.0 | 相互フォローの相手の**元の投稿**（返信・リポストでないもの）への返信は、重みに 15.0 を足す → 20.0（`xai-value-model/weights.rs` `reply_weight_for`、`inputs.rs`） |
| 引用 | 5.0 | 5.0 | |
| リポスト | 1.0 | | |
| 共有 | 2.0 | | DM で共有 5.0、リンクをコピー 20.0 |
| 作者をフォロー | 4.0 | | |
| 投稿のクリック | 0.3 | | クリック後の滞在時間 0.4、リンクを開く 0.2、引用元のクリック 0.05 |
| 画像を広げる / 動画を開く | 0.05 / 0.02 | 0.05 / 0.07 | |
| 滞在（見ていた） | 0.05 | | 連続値の滞在時間 0.006（vm-ranker は 0.004） |
| 興味がない | −52.272 | −47.52 | |
| 作者をミュート | −58.8 | | |
| 作者をブロック | −31.2 | | |
| 報告 | −234.0 | | |
| 見ずに通り過ぎた | −0.02 | | |

空欄は確認していない。X は README で「param.rs の初期値は cron で本番の主な値に合わせている」と書いている。
一方、X が README とコメントで挙げる「報告はいいねの 468 倍」は 234 ÷ 0.5 で、vm-ranker 側の 0.5 に合う（0.66 なら約 355 倍）。
**どちらが本番の値かは、コードからは決められない。**

## ここから読めること（解釈。X の文言ではない）

1. **返信と引用の重みは、いいねの 7.6〜10 倍**（0.66 なら 7.6 倍、0.5 なら 10 倍）。重みは「その行動の確率」に掛かる。
   怒りの返信も、賛同の返信も、点数の上では同じ「返信」。言い争いに加わりそうな投稿ほど上に来る作り。
   感情の良し悪しを見る項は無い（`toxic` `polariz` `outrage` `civil` はリポ全体に出てこない。`controversial` は、画像の警告画面の理由 `DisturbingOrControversial`（`visibility-filtering-client/graphql_results.rs`）とテストにだけ出る）。
2. **否定の反応の重みは大きいが、掛かる相手は「その人の確率」。** 興味がない・ミュート・ブロックは、
   「この人が同じような投稿に興味がないを押す確率」に掛かる。本人が押した履歴が、その確率を上げる。
   X 自身もコメントで「報告 1 回でいいね 468 回分が消える、という読み方は誤り」と書いている（重みの比を回数の比として読まない）。
3. **数えられるのは、ホームのタイムラインに出た投稿への行動だけ**（param.rs のコメント「Home Timeline」）。直接開いた投稿への行動は並べ方に入らない。「フォロー中」のタブ（`reverse_chron_posts_pipeline.rs`）を含むかは未確認。
4. **読み飛ばし・滞在がどれだけ並べ方を変えるかは、重みだけでは分からない。** 重みの比は効果の大きさではない（2 と同じ理由）。
   行動の履歴は予測の入力に入るので、何らかの形では効くはず（推測）。
5. **相互フォローの相手の元の投稿には、返信の重みに大きな上乗せ**（2026-07 に導入、`docs/BIDIRECTIONAL_BOOST_CHANGE.md`）。
   身内の会話を増やす狙い。対立とは別の向きだが、身内の中の言い合いを強める可能性もある（推測）。
6. **X は投稿ごとに「広告の隣に置いて危ないか」を判定している。このリポの中では、その判定を広告の置き場所にだけ使っている。**
   - `home-mixer/models/brand_safety.rs` の `compute_verdict` が、ラベルから Safe／LowRisk／MediumRisk／HighRisk を決める。
     ラベルには、Grok による「広告に不適」（`GROK_NSFA`）、コミュニティノートが付いた投稿（`NSFA_COMMUNITY_NOTE`）、`DO_NOT_AMPLIFY` などがある
   - 判定を付ける処理（`AdsBrandSafetyVfHydrator`）は、点数付けと上位の選び出しの**後**に動く（`home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs`）。
     判定を読むのは `home-mixer/ads/` と `home-mixer/filters/ad_adjacent_served_filter.rs`、ほかに記録用（`side_effects/ads_injection_logging_side_effect.rs`）と「フォロー中」の出力への受け渡し（`sources/reverse_chron_posts_source.rs`）で、点数付け（scorers・vm-ranker・xai-value-model）と表示の規則（visibility-filtering）には出てこない
   - 広告の並べ方の既定は `multi_risk`（param.rs の `AdsBlenderType`）。広告ごとに、上下に置ける投稿の危なさを選び、残りを点数順に並べる。
     リスクを許す広告なら MediumRisk の投稿の隣にも置く（`multi_risk_blender.rs` の `is_bsr_high_ad`）。どちらにしても、危ない投稿を下げる処理ではない
   - 判定は応答として外にも返している（`home-mixer/scored_posts_server.rs`）。受け取った側（リポの外）がどう使うかは分からない
   - 読み: **広告主は守られるが、読む人を守る使い方はこのリポの中には無い。** 何を「広告に不適」とするかの Grok への指示文は公開されていない
   - 別に、表示の規則の側で `DO_NOT_AMPLIFY` は効く。ただし推薦の枠（`TIMELINE_HOME_RECOMMENDATIONS`・`IMMERSIVE_EXPANDED_RECOMMENDATIONS`、`visibility-filtering/rules/levels.rs`）の中だけ: 投稿に付けば作者以外の全員に、アカウントに付けばフォローしていない人に、推薦として出さない（`tweet_rules.rs`・`author_rules.rs`）。通常のホーム（`TIMELINE_HOME`）の規則には入っていない。付ける基準は未読
7. **投稿の埋め込み（似た投稿を探すための数値）の一つは「話題・感情・関心の集まり」で探すよう指示されている**
   （`grox/flows/mm_emb/embedder.py` の V5）。並行する V8.2 などの指示文は「話題・意図・主な固有名・反応されやすさ」で、感情を含まない。どれが使われているかは未確認

8. **点数を予測するときに読む本人の行動の履歴は、直近の最大 1024 件**（`home-mixer/params/param.rs` の `MaxSeqLengthScoring` 1024、取り出し側の `MaxSeqLengthRetrieval` も 1024。
   `home-mixer/query_hydrators/scoring_sequence_query_hydrator.rs` が履歴を取ってくる）。区切りは日数ではなく件数と読める（推測。どの行動が 1 件に数えられるかは集計の種類 `DenseWithFavVqvCleaned` しだいで、中身は未読）。
   読み: 怒りの返信や炎上した投稿への反応をやめても、それが予測から消えるのは、その後の行動で 1024 件分押し出されたとき（推測）。たくさん使う人ほど早く入れ替わる。
   話題を 28 日分集める仕組み（`HistoryTopicsWindowDays` 28）もあるが、既定では使われていない（`HistoryTopicsEnabled` false）
9. **似た投稿が並ばないよう、点数上位 150 件を選び直す**（`vm-ranker/dpp.rs`、`vm-ranker/params.rs` の `DppEnabled` true・`DppTheta` 0.65・`DppMaxSelectedRank` 150）。
   似ているかどうかは投稿の埋め込み（`vm-ranker/embedding_store.rs` の mm 埋め込み）で測る。どの版の埋め込みかはこのリポでは確かめられなかった。
   7 の V5（「話題・感情・関心の集まり」で似た投稿を探す）が使われているなら、同じ感情の投稿が続くのを避ける向きに働く（推測）。選び直しは点数を少し捨てる代わりに似た投稿を離すもので、対立する投稿を下げる仕組みではない

## まだ読んでいないところ

- `vm-ranker/` の選び直しで使う埋め込みの版（7 の V5 か V8 か）
- 履歴の集計の種類（`DenseWithFavVqvCleaned`）に、どの行動が入るか（返信・引用・滞在など）
- 返信欄の並び（会話の中の順番）はこのリポの範囲外の可能性
- 共有の人気投稿の一覧（`home-mixer/sources/popular_posts_source.rs`）は、作り済みの一覧を読むだけ。一覧の作り方はこのファイルには無い
