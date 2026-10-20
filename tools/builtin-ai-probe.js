// Chrome の組み込み AI（Prompt API）で、問いの立て方を何通りか比べる。ページの開発者ツールのコンソールで動かす。
// 使い方: window.__ITEMS = [{id, text, expect, ...}] と window.__RUNS（回数）を入れてから、このファイルの中身を貼る。
// 結果は window.__R（{v, run, id, flame, raw, ms}）に入り、終わると window.__done が true になる。
// 測定の記録は research/builtin-ai.md。

const LANG = { expectedInputs: [{ type: "text", languages: ["ja"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };
const SCORE = { type: "integer", minimum: 0, maximum: 100 };
const PARTS = {
  group: "書き手が、国籍・性別・世代・職業・住む地域・政治的な立場などの「集団」を、ひとまとめにけなしたり、性質を決めつけたりしている（特定の組織・個人・政策への批判は含まない）",
  bait: "「反論どうぞ」「異論は認める」「図星」「発狂する人いそう」のように、読む人の反論や怒りの反応を誘う・挑む言葉がある",
  specific: "特定の組織・人物・政策の、具体的な行為や判断を批判している",
  self: "書き手本人の体験・内部告発・被害の訴えとして書かれている",
};

const VARIANTS = {
  // A: attention-vaccine の flame の問いをそのまま1問で
  A: {
    system: "あなたは SNS の投稿を判定する。投稿が次の説明に当てはまる度合いを 0〜100 の整数で答える。100 は明らかに当てはまる、0 はまったく当てはまらない。\n説明: 反論や怒りの反応を集めること自体が目的の、わざと挑発的な発言（特定の属性や集団を雑にけなす、極端な一般化、「異論は認める」「反論どうぞ」など反応を誘う）。強い口調の意見や政治家への辛辣な批判・愚痴は、それだけでは含まない",
    schema: { type: "object", properties: { score: SCORE }, required: ["score"] },
    flame: (o) => o.score,
  },
  // B: 部品に分けて聞き、挑発 = max(集団をけなす, 反応を誘う)。具体的な批判・本人の訴えは記録だけ
  B: {
    system: "あなたは SNS の投稿を読み、次の各項目に当てはまる度合いを 0〜100 の整数で答える。100 は明らかに当てはまる、0 はまったく当てはまらない。口調の強さそのものは点に入れない。\n" +
      Object.entries(PARTS).map(([k, v]) => `${k}: ${v}`).join("\n"),
    schema: { type: "object", properties: Object.fromEntries(Object.keys(PARTS).map((k) => [k, SCORE])), required: Object.keys(PARTS) },
    flame: (o) => Math.max(o.group, o.bait),
  },
  // C: B の前に、短い理由を書かせる
  C: {
    system: "あなたは SNS の投稿を読み、まず reason に、誰（何）に向けて何を言っている文かを 40 字以内で書く。そのうえで次の各項目に当てはまる度合いを 0〜100 の整数で答える。100 は明らかに当てはまる、0 はまったく当てはまらない。口調の強さそのものは点に入れない。\n" +
      Object.entries(PARTS).map(([k, v]) => `${k}: ${v}`).join("\n"),
    schema: {
      type: "object",
      properties: { reason: { type: "string", maxLength: 80 }, ...Object.fromEntries(Object.keys(PARTS).map((k) => [k, SCORE])) },
      required: ["reason", ...Object.keys(PARTS)],
    },
    flame: (o) => Math.max(o.group, o.bait),
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
          let raw = null, flame = null;
          try {
            raw = JSON.parse(await s.prompt(`投稿:\n${it.text}`, { responseConstraint: def.schema }));
            flame = def.flame(raw);
          } catch (e) { raw = { error: String(e) }; }
          window.__R.push({ v, run, id: it.id, flame, raw, ms: Math.round(performance.now() - t0) });
          s.destroy();
        }
      }
    }
  } catch (e) { window.__err = String(e); }
  window.__done = true;
})();
