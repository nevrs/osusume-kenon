// 返信の下書きを Chrome の組み込み AI で判定する（DESIGN.md D7 の測定）。ページの開発者ツールのコンソールで動かす。
// 使い方: window.__ITEMS = [{id, text, kind}] と window.__RUNS を入れてから、このファイルの中身を貼る。
// 結果は window.__R（{v, run, id, raw, ms}）に入り、終わると window.__done が true になる。記録は research/builtin-ai.md。
{
  const LANG = { expectedInputs: [{ type: "text", languages: ["ja"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };
  const SCORE = { type: "integer", minimum: 0, maximum: 100 };
  const ATTACK = "返信の相手（またはその人が属する集団）を、侮辱する・嘲笑する・人格を攻撃する・黙れと言う・晒す。内容への反論や、問題の指摘は含まない";
  const PARTS = {
    attack: ATTACK,
    anger: "書き手の怒りの強さ",
    argument: "根拠や具体的な内容を挙げて、反論・指摘・訂正をしている",
    question: "相手に質問している",
  };
  const VARIANTS = {
    // single: 攻撃だけを1問で
    single: {
      system: `あなたは SNS の返信の下書きを読み、次の説明に当てはまる度合いを 0〜100 の整数で答える。100 は明らかに当てはまる、0 はまったく当てはまらない。\n説明: ${ATTACK}`,
      schema: { type: "object", properties: { attack: SCORE }, required: ["attack"] },
    },
    // split: 部品に分けて聞く。一呼吸は attack で決め、anger などは記録だけ
    split: {
      system: "あなたは SNS の返信の下書きを読み、次の各項目に当てはまる度合いを 0〜100 の整数で答える。100 は明らかに当てはまる、0 はまったく当てはまらない。\n" +
        Object.entries(PARTS).map(([k, v]) => `${k}: ${v}`).join("\n"),
      schema: { type: "object", properties: Object.fromEntries(Object.keys(PARTS).map((k) => [k, SCORE])), required: Object.keys(PARTS) },
    },
  };
  window.__R = []; window.__done = false; window.__err = null;
  (async () => {
    try {
      const bases = {};
      for (const [v, def] of Object.entries(VARIANTS)) {
        bases[v] = await LanguageModel.create({ ...LANG, initialPrompts: [{ role: "system", content: def.system }] });
      }
      for (let run = 0; run < (window.__RUNS || 1); run++) {
        for (const it of window.__ITEMS) {
          for (const [v, def] of Object.entries(VARIANTS)) {
            const s = await bases[v].clone(); // 文ごとに前の文の影響を残さない
            const t0 = performance.now();
            let raw;
            try { raw = JSON.parse(await s.prompt(`返信の下書き:\n${it.text}`, { responseConstraint: def.schema })); }
            catch (e) { raw = { error: String(e) }; }
            window.__R.push({ v, run, id: it.id, raw, ms: Math.round(performance.now() - t0) });
            s.destroy();
          }
        }
      }
    } catch (e) { window.__err = String(e); }
    window.__done = true;
  })();
}
