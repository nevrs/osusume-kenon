// 人をひとまとめに括る言葉の判定（DESIGN.md D15）を、Chrome の組み込み AI（Prompt API）で試す。ページの開発者ツールのコンソールで動かす（X では動かさない）。
// 使い方: window.__ITEMS = [{id, text}]、window.__RUNS = 回数、window.__VARIANTS = ["group1", "ev1"] を入れてから、このファイルの中身を貼る。
// window.__RUN0 で始める回を、window.__TIMEOUT で 1 件の打ち切り（既定 30 秒。AI が長い答えを書き続けて止まることがある）を変えられる。
// 結果は window.__R（{v, run, id, ...答え, ms}）に入り、終わると window.__done が true になる。集計は tools/group_stats.js
{
  const LANG = { expectedInputs: [{ type: "text", languages: ["ja", "en"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };
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
  // ev1・sep1: true/false の代わりに、根拠の言葉を本文から抜き出させる。抜き出した言葉が本文に無ければ当てはまらないとする
  // （group1 は実際の投稿で、架空の人物・作品・機械への言葉まで「はい」と答えた。根拠を求め、コードで確かめて、思い込みの「はい」をはじく）
  const EV_HEAD = "あなたは SNS の投稿を読み、次の言葉を投稿の本文からそのまま抜き出して答える。当てはまる言葉が無ければ空の文字列にする。迷ったら空にする。投稿の主張が正しいか、どの立場の意見かは問わない。他人の言葉を引用して批判している・皮肉っているだけなら空にする。";
  const EV = {
    group: "group（ひとまとめ）: 実在の人々の集団（国籍・民族・性別・世代・職業・地域・宗教・政治的立場など）を指す言葉のうち、その集団の人々がみな同じ性質を持つかのように語られているもの（例「〇〇人はみんな〜」の「〇〇人」）。特定の個人・会社・役所・作品・機械・物語やゲームの登場人物や種族は含めない。ひとまとめにすることを批判している文なら空。",
    insult: "insult（見下し）: 実在の人や集団に向けた、侮辱する・見下す・人間扱いしない言葉（例「バカ」「ゴミ」「虫」「無能」）。作品・会社・機械・AI・制度・物事に向けた言葉は含めない。",
    exclusion: "exclusion（排除）: 実在の人や集団を、追い出す・権利を奪う・黙らせる・社会から消す・暴力を加えることを求める言葉（例「出ていけ」「追い出せ」）。投票しないなど本人の選択や、法に沿った処罰の議論は含めない。",
  };
  const STR = { type: "string" };
  const evSchema = (ks) => ({ type: "object", properties: Object.fromEntries(ks.map((k) => [k, STR])), required: ks });
  const norm = (x) => String(x).normalize("NFKC").replace(/[\s「」『』"'“”]/g, "");
  const found = (w, text) => typeof w === "string" && norm(w).length > 0 && norm(text).includes(norm(w));
  const evPick = (o, text) => ({ lump: found(o.group, text), contempt: found(o.insult, text), exclusion: found(o.exclusion, text), mobilize: false, ev: [o.group, o.insult, o.exclusion] });
  // ev1: 3 つを 1 回で聞く
  VARIANTS.ev1 = { system: [EV_HEAD, EV.group, EV.insult, EV.exclusion].join("\n"), schema: evSchema(["group", "insult", "exclusion"]), pick: evPick };
  // sep1: 1 つずつ別に聞く（3 回。遅いが、問い同士が混ざらない）
  VARIANTS.sep1 = { parts: ["group", "insult", "exclusion"].map((k) => ({ system: [EV_HEAD, EV[k]].join("\n"), schema: evSchema([k]) })), pick: evPick };
  // ev2: ev1 で AI が問いの中の例（「〇〇人」「バカ」など）を書き写したので、例を抜く。ひとまとめは「集団の言葉」と「決めつけた性質」の両方を求める。
  // 言い換え（「△△系の住民」→「△△系の人々」）を拾うため、本文と 6 割以上が続けて重なれば本文にあるとみなす。長い答えで止まる（ev1・sep1 で 1 回 9 分）のを防ぐため短く答えさせる
  const EV2_HEAD = "あなたは SNS の投稿を読み、次の言葉を投稿の本文から短く（それぞれ 20 文字以内で）そのまま抜き出して答える。当てはまる言葉が無ければ空の文字列にする。迷ったら空にする。投稿の主張が正しいか、どの立場の意見かは問わない。他人の言葉を引用して批判している・皮肉っているだけなら、すべて空にする。";
  const EV2 = [
    "group と trait（ひとまとめ）: 実在の人々の集団（国籍・民族・性別・世代・職業・地域・宗教・政治的立場など）について、その集団の人々がみな同じ性質を持つと決めつけている場合に、group にその集団を指す言葉、trait に決めつけた性質を入れる。特定の個人・会社・役所・作品・機械・物語やゲームの登場人物や種族のことなら空。ひとまとめにすることを批判している文なら空。",
    "insult（見下し）: 実在の人や集団を、侮辱する・見下す・人間扱いしない言葉。作品・会社・機械・AI・制度・物事に向けた言葉なら空。",
    "exclusion（排除）: 実在の人や集団を、追い出す・権利を奪う・黙らせる・社会から消す・暴力を加えることを求める言葉。投票しないなど本人の選択や、法に沿った処罰の議論なら空。",
  ];
  const overlap = (w, text) => { // w のうち、本文と続けて重なるいちばん長い部分の割合
    const a = norm(w), b = norm(text);
    let best = 0;
    for (let i = 0; i < a.length; i++) for (let j = i + best + 1; j <= a.length; j++) { if (b.includes(a.slice(i, j))) best = j - i; else break; }
    return a.length ? best / a.length : 0;
  };
  const near = (w, text) => typeof w === "string" && norm(w).length >= 2 && overlap(w, text) >= 0.6;
  VARIANTS.ev2 = {
    system: [EV2_HEAD, ...EV2].join("\n"),
    schema: evSchema(["group", "trait", "insult", "exclusion"]),
    pick: (o, text) => ({ lump: near(o.group, text) && near(o.trait, text), contempt: near(o.insult, text), exclusion: near(o.exclusion, text), mobilize: false, ev: [o.group, o.trait, o.insult, o.exclusion] }),
  };
  // gc1: ひとまとめを「集団の言葉」だけで数えると、集団の言葉が出てくるだけの投稿まで当てはまった（0.12.0 の実際の見本）。
  // 本人の案で、集団をまとめて見下している部分を 1 つとして抜き出させる（ev1 は集団と見下しを別の欄に分けず、両方そろうことがまれだった）
  const GC = "lumpinsult（ひとまとめの見下し）: 実在の人々の集団（国籍・民族・性別・世代・職業・地域・宗教・政治的立場など）を、まとめて見下す・侮辱する・人間扱いしない部分。集団を指す言葉と、見下す言葉の両方を含む一続きの部分を、40 文字以内でそのまま抜き出す。特定の個人・会社・役所・作品・機械・物語やゲームの登場人物や種族に向けたものなら空。集団の名前が出てくるだけで見下していないなら空。";
  VARIANTS.gc1 = {
    system: [EV_HEAD, GC, EV.insult, EV.exclusion].join("\n"),
    schema: evSchema(["lumpinsult", "insult", "exclusion"]),
    pick: (o, text) => ({ lump: found(o.lumpinsult, text), contempt: found(o.insult, text), exclusion: found(o.exclusion, text), mobilize: false, ev: [o.lumpinsult, o.insult, o.exclusion] }),
  };
  // tg1: ev1 は「作品・機械・AI・登場人物は含めない」と書いても、AI・ゲーム・作中の人物・自分を下げる文に印を付けた（0.13.1 の実際の見本）。
  // 定義の中の除外は守られないので、向けた相手を選択肢から先に選ばせ、人（person・people）でなければコードで印を捨てる。ひとまとめは people のときだけ
  const TG = "target（向けた相手）: 投稿の中の悪口・決めつけ・追い出す言葉が向いている相手を 1 つ選ぶ。self=書き手自身、person=実在の個人、people=実在の人々の集団、thing=物・機械・AI・アプリ・サービス・会社の製品・作品・ゲーム・物語やゲームの登場人物や種族、none=向ける相手がいない（天気・出来事・自分の失敗談など）か、悪口・決めつけ・追い出す言葉が無い。";
  const TARGET = { type: "string", enum: ["self", "person", "people", "thing", "none"] };
  VARIANTS.tg1 = {
    system: [EV_HEAD, TG, EV.group, EV.insult, EV.exclusion].join("\n"),
    schema: { type: "object", properties: { target: TARGET, ...evSchema(["group", "insult", "exclusion"]).properties }, required: ["target", "group", "insult", "exclusion"] },
    pick: (o, text) => {
      const human = o.target === "person" || o.target === "people";
      return { lump: o.target === "people" && found(o.group, text), contempt: human && found(o.insult, text), exclusion: human && found(o.exclusion, text), mobilize: false, target: o.target, ev: [o.group, o.insult, o.exclusion] };
    },
  };
  window.__R = [];
  window.__done = false;
  (async () => {
    try {
      const names = window.__VARIANTS || Object.keys(VARIANTS);
      const parts = (v) => VARIANTS[v].parts || [VARIANTS[v]];
      const bases = {};
      for (const v of names) bases[v] = await Promise.all(parts(v).map((p) => LanguageModel.create({ ...LANG, initialPrompts: [{ role: "system", content: p.system }] })));
      for (let run = window.__RUN0 || 1; run <= (window.__RUNS || 1); run++) for (const it of window.__ITEMS) for (const v of names) {
        const t0 = performance.now();
        let p = {};
        try {
          const o = {};
          for (const [i, part] of parts(v).entries()) {
            const s = await bases[v][i].clone(); // 文ごとに前の文の影響を残さない
            try { Object.assign(o, JSON.parse(await s.prompt(`投稿:\n${it.text}`, { responseConstraint: part.schema, signal: AbortSignal.timeout(window.__TIMEOUT || 30_000) }))); } finally { s.destroy(); }
          }
          p = VARIANTS[v].pick(o, it.text);
        } catch (e) { p = { error: String(e).slice(0, 120) }; }
        window.__R.push({ v, run, id: it.id, ...p, ms: Math.round(performance.now() - t0) });
      }
    } catch (e) { window.__err = String(e); }
    window.__done = true;
  })();
}
