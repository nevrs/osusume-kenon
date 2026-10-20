// 「怒りや敵意の強さ」を Chrome の組み込み AI（Prompt API）で測る（DESIGN.md D5 の b・D8）。ページの開発者ツールのコンソールで動かす。
// 使い方: window.__ITEMS = [{id, text, ...}] と window.__RUNS を入れてから、このファイルの中身を貼る。
// 結果は window.__R（{v, run, id, anger, hostility, raw, ms}）に入り、終わると window.__done が true になる。記録は research/anger-record.md。
{
  const LANG = { expectedInputs: [{ type: "text", languages: ["ja"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };
  const SCORE = { type: "integer", minimum: 0, maximum: 100 };
  const ANGER = "書き手の怒り・憤り・苛立ちの強さ（言葉づかいや語気から読み取れる感情の強さ。内容の正しさは問わない）";
  const HOSTILITY = "特定の人や集団に向けた敵意・侮辱・見下し（物事や制度への批判だけで、人への侮辱がないものは含まない）";
  const VARIANTS = {
    // single: 怒りの強さだけを 1 問で
    single: {
      system: `あなたは SNS の投稿を読み、次の説明に当てはまる度合いを 0〜100 の整数で答える。100 は非常に強い、0 はまったく無い。\n説明: ${ANGER}`,
      schema: { type: "object", properties: { anger: SCORE }, required: ["anger"] },
      pick: (o) => ({ anger: o.anger, hostility: null }),
    },
    // split: 怒りと敵意を分けて聞く
    split: {
      system: "あなたは SNS の投稿を読み、次の各項目に当てはまる度合いを 0〜100 の整数で答える。100 は非常に強い、0 はまったく無い。\n" +
        `anger: ${ANGER}\nhostility: ${HOSTILITY}`,
      schema: { type: "object", properties: { anger: SCORE, hostility: SCORE }, required: ["anger", "hostility"] },
      pick: (o) => ({ anger: o.anger, hostility: o.hostility }),
    },
  };
  window.__R = []; window.__done = false; window.__err = null;
  (async () => {
    try {
      const bases = {};
      for (const [v, def] of Object.entries(VARIANTS)) bases[v] = await LanguageModel.create({ ...LANG, initialPrompts: [{ role: "system", content: def.system }] });
      for (let run = 0; run < (window.__RUNS || 1); run++) for (const it of window.__ITEMS) for (const [v, def] of Object.entries(VARIANTS)) {
        const s = await bases[v].clone(); // 文ごとに前の文の影響を残さない
        const t0 = performance.now();
        let raw, p = { anger: null, hostility: null };
        try { raw = JSON.parse(await s.prompt(`投稿:\n${it.text}`, { responseConstraint: def.schema })); p = def.pick(raw); }
        catch (e) { raw = { error: String(e) }; }
        window.__R.push({ v, run, id: it.id, ...p, ms: Math.round(performance.now() - t0) });
        s.destroy();
      }
    } catch (e) { window.__err = String(e); }
    window.__done = true;
  })();
}
