# X の規則で、拡張に関係するところ — 読んだ記録

いつ読むか: 拡張が X の画面で何かを「代わりにする」機能（半自動など）を考えるとき。X の画面から情報を集める測定をするとき。

読んだもの（2026-10-20、ログインした Chrome で表示した原文）:
- [Automation rules](https://help.x.com/en/rules-and-policies/x-automation)（「Updated April 2026」）
- [Terms of Service](https://x.com/en/tos)（「Effective: October 9, 2026」）

## 原文（拡張に関係する文）

自動化の規則の冒頭: 自動化とは「accounts or apps that take repeated actions without a person actively performing them」。

自動化の規則の「Don't!」:

> Use non-API-based forms of automation, such as scripting the X website. The use of these techniques may result in the permanent suspension of your account.

利用者向けの注意: 「You are ultimately responsible for the actions taken with your account, or by applications associated with your account.」

自動化の規則 II-D（投稿・アカウントへの自動の操作）: いいね・返信の非表示の自動化は禁止。フォロー・フォロー解除、リストへの追加は「bulk」「indiscriminate」なものを禁止。
（ミュート・ブロック・「興味がない」は、ここには名前が出ない）

利用規約（してはいけないこと の (iii)）:

> access or search or attempt to access or search the Services by any means (automated or otherwise) other than through our currently available, published interfaces … (NOTE: crawling or scraping the Services in any form, for any purpose without our prior written consent is expressly prohibited)

## 読み（解釈。X の文言ではない）

禁止の対象は「non-API-based forms of automation」で、「scripting the X website」はその例として挙がっている。
「automation」の定義は冒頭の「repeated actions without a person actively performing them」。どこまでが当たるかは、文言だけでは決まらない。

1. **半自動（本人が押したボタン 1 回で、拡張が X のボタンを押す）**
   - 1 回押すと複数件の形: 本人が押したのは 1 回で、残りは「人が実際に行っていない繰り返しの操作」。定義にそのまま当たる
   - 1 回押すと 1 件の形: 本人が毎回押すので、定義の「繰り返し」「人が行っていない」には当たらない、という読み方に十分な筋がある。一方で、X の側からは拡張が起こした押下と本人の押下を区別できない（推測）ので、「scripting the X website」と見なされるおそれは残る
   - **文言からは決まらない。** 罰は永久凍結もありうるのに、得られるのは 1〜2 回の押下の節約だけなので、危険と利益の釣り合いから作らないことにした（2026-10-20）。この案はユーザー本人の発案なので、判断を本人に伝えた
2. 一呼吸（D7）は、本人の押下を 1 回止めるだけで、X の操作を代わりにしない。定義の「repeated actions」に当たらないと読む（推測）。
   ただし「scripting the X website」を「ウェブサイトの動きを台本で変えること」と広く読むと、一呼吸（送信の押下を止める）・畳む（画面を書き換える）・数を読むことも含まれうる。
   1 の判断は「X の操作を拡張が代わりにするか」という狭い読みでも、広い読みでも同じ（作らない）が、2・3 は狭い読みのときだけ大丈夫と言える
3. **画面に出ている数や文を拡張が読むこと**は、本人に表示されたものを読むだけで、本人の見ていない所を集めてはいない。
   規約 (iii) の「through our currently available, published interfaces」（X が公開している画面を通じて）に、本人に表示された画面は含まれる、という読み方もできる。ただし「scraping」の範囲をどう読むかは X しだいで、白とは言い切れない
4. **2026-10-20 に、本人のアカウントで Claude（ブラウザの操作）が台本で X をスクロールして数を集めた**（おすすめ 45 件: test/fixtures/ja-home-2026-10-20.json、検索 10 語 279 件: research/form-signals.md）。
   規約の「crawling or scraping」に近い。本人のアカウントに危険が及びうるので、今後は本人のアカウントで台本による収集をしない（2026-10-27、DESIGN.md D21: 本人が DevTools から自分で動かす開発用の自動スクロールだけは例外にした。Claude が動かすことはしない）
5. **実機での確認も、Claude が X のボタンを押す形はとらない。** Claude が送信ボタンを押して一呼吸を確かめると、ウェブサイトを台本で動かすことになるうえ、止められなかったときは実際に投稿される。
   送信が止まるかどうかの確認は、本人が手で行う（SESSION.md の次の一手）
