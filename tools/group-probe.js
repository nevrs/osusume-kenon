// 人をひとまとめに括る言葉の判定（DESIGN.md D15）を、Chrome の組み込み AI（Prompt API）で試す。ページの開発者ツールのコンソールで動かす（X では動かさない）。
// 使い方: window.__ITEMS = [{id, text}]、window.__RUNS = 回数、window.__VARIANTS = ["old", "group1"] を入れてから、このファイルの中身を貼る。
// 結果は window.__R（{v, run, id, ...答え, ms}）に入り、終わると window.__done が true になる。集計は tools/group_stats.js
{
  const LANG = { expectedInputs: [{ type: "text", languages: ["ja"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };
  const SCORE = { type: "integer", minimum: 0, maximum: 100 };
  const BOOL = { type: "boolean" };
  // 前の判定（0.10 までの feed-judge.js の split1）。比べるために同じ文
  const ANGER = "書き手の怒り・憤り・苛立ちの強さ（言葉づかいや語気から読み取れる感情の強さ。内容の正しさは問わない）";
  const HOSTILITY = "特定の人や集団に向けた敵意・侮辱・見下し（物事や制度への批判だけで、人への侮辱がないものは含まない）";
  // 新しい問い（D15）。立場や主張の正しさは問わず、言葉の形だけを見る
  const GROUP1 = [
    "あなたは SNS の投稿を読み、次の 4 つの問いに true か false で答える。投稿の主張が正しいか、どの立場の意見かは問わない。言葉の形だけを見る。迷ったら false。",
    "lump（ひとまとめ）: 国籍・民族・性別・世代・職業・地域・宗教・政治的立場などの集団に属する人々を、みな同じ性質を持つかのように語っている（例「〇〇人は〜」「最近の若者は〜」「〇〇の支持者は〜」）。特定の個人、特定の会社や役所、その具体的な行いについて述べるだけなら false。ひとまとめにすることを批判している文も false。",
    "contempt（見下し）: 人や集団を、侮辱する・見下す・人間扱いしない言葉がある（「バカ」「ゴミ」「虫」「こいつら」「無能」など）。物事・制度・行いへの批判だけなら false。",
    "exclusion（排除）: 人や集団を、追い出す・権利を奪う・黙らせる・社会から消す・暴力を加えることを求めている、または当然だとしている。特定の人の違法行為を法に沿って罰することを論じるだけなら false。投票しないなど、本人の選択を述べるだけなら false。",
    "mobilize（動員）: 読む人に、怒る・攻撃する・拡散する・抗議を集めることを、強い言葉で促している（「許すな」「今すぐ拡散」「黙っているのも同罪」「目を覚ませ」）。",
  ].join("\n");
  // group2: group1 の動員を絞る（group1 では、強い非難や排除の文、はしゃいだ誘いまで動員と答えた）
  const GROUP2 = GROUP1.replace(/mobilize（動員）: .*$/, "mobilize（動員）: 読む人に向けて、特定の人・集団・組織への怒りや攻撃、抗議の集中、拡散を、命令や呼びかけの形で求めている（「許すな」「今すぐ拡散して」「抗議を集中させよう」「黙っているのも同罪」「目を覚ませ」）。強い言葉で非難しているだけで、読む人に何かを求めていなければ false。楽しい集まりや買い物への誘い、署名のお願いのように怒りをあおらないものも false。");
  const VARIANTS = {
    old: {
      system: `あなたは SNS の投稿を読み、次の各項目に当てはまる度合いを 0〜100 の整数で答える。100 は非常に強い、0 はまったく無い。\nanger: ${ANGER}\nhostility: ${HOSTILITY}`,
      schema: { type: "object", properties: { anger: SCORE, hostility: SCORE }, required: ["anger", "hostility"] },
      pick: (o) => ({ anger: o.anger, hostility: o.hostility }),
    },
    group1: {
      system: GROUP1,
      schema: { type: "object", properties: { lump: BOOL, contempt: BOOL, exclusion: BOOL, mobilize: BOOL }, required: ["lump", "contempt", "exclusion", "mobilize"] },
      pick: (o) => ({ lump: o.lump, contempt: o.contempt, exclusion: o.exclusion, mobilize: o.mobilize }),
    },
  };
  VARIANTS.group2 = { ...VARIANTS.group1, system: GROUP2 };
  window.__R = [];
  window.__done = false;
  (async () => {
    try {
      const names = window.__VARIANTS || Object.keys(VARIANTS);
      const bases = {};
      for (const v of names) bases[v] = await LanguageModel.create({ ...LANG, initialPrompts: [{ role: "system", content: VARIANTS[v].system }] });
      for (let run = 1; run <= (window.__RUNS || 1); run++) for (const it of window.__ITEMS) for (const v of names) {
        const s = await bases[v].clone(); // 文ごとに前の文の影響を残さない
        const t0 = performance.now();
        let p = {};
        try { p = VARIANTS[v].pick(JSON.parse(await s.prompt(`投稿:\n${it.text}`, { responseConstraint: VARIANTS[v].schema }))); }
        catch (e) { p = { error: String(e).slice(0, 120) }; }
        window.__R.push({ v, run, id: it.id, ...p, ms: Math.round(performance.now() - t0) });
        s.destroy();
      }
    } catch (e) { window.__err = String(e); }
    window.__done = true;
  })();
}
