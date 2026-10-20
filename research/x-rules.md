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

1. **拡張が X の画面のボタンを本人の代わりに押すのは「scripting the X website」に当たる。** 1 回押すと 1 件の形でも、ウェブサイトを台本で動かしていることに変わりはない。
   1 回押すと複数件の形は、冒頭の定義（人が実際に行っていない繰り返しの操作）にもそのまま当たる。罰は「permanent suspension」もありうる
2. **したがって半自動（拡張が「興味がない」などを押す）は作らない。** 押すのは本人の手で、拡張は「どこを押せばよいか」を示すところまでにする（DESIGN.md D3 を補強）
3. 一呼吸（D7）は、本人の押下を 1 回止めるだけで、X の操作を代わりにしない。この規則の「自動化」には当たらないと読む（推測。X が拡張による送信の妨げをどう扱うかは書かれていない）
4. **画面に出ている数や文を拡張が読むこと**は、本人に表示されたものを読むだけで、本人の見ていない所を集めてはいない。多くの拡張がしていることだが、規約の「scraping」の範囲をどう読むかは X しだいで、白とは言い切れない
5. **2026-10-20 の測定（research/form-signals.md）で、本人のアカウントで X の検索結果を台本でスクロールして 279 件の数を集めたのは、規約の「crawling or scraping」に近い。**
   本人のアカウントに危険が及びうるので、今後、本人のアカウントで台本による収集はしない。必要なら本人に手で見てもらうか、X の公開データ（研究用の提供など）を探す
