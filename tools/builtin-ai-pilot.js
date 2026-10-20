// Chrome の組み込み AI（Prompt API）で例文を判定する。ページの開発者ツールのコンソールで動かす。
// 使い方: window.__P = { questions: {名前: 問いの文}, items: [{id, text, q, expect}] } を入れてから、このファイルの中身を貼る。
// 結果は window.__R に入り、終わると window.__done が true になる。research/builtin-ai.md の測定はこの手順（2026-10-20）
window.__R = []; window.__done = false; window.__err = null;
(async () => {
  try {
    const lang = { expectedInputs: [{ type: "text", languages: ["ja"] }], expectedOutputs: [{ type: "text", languages: ["ja"] }] };
    const schema = { type: "object", properties: { score: { type: "integer", minimum: 0, maximum: 100 } }, required: ["score"] };
    const bases = {};
    for (const [k, q] of Object.entries(__P.questions)) {
      const t0 = performance.now();
      bases[k] = await LanguageModel.create({
        ...lang,
        initialPrompts: [{ role: "system", content: `あなたは SNS の投稿を判定する。投稿が次の説明に当てはまる度合いを 0〜100 の整数で答える。100 は明らかに当てはまる、0 はまったく当てはまらない。\n説明: ${q}` }],
      });
      window.__R.push({ create: k, ms: Math.round(performance.now() - t0) });
    }
    for (const it of __P.items) {
      const s = await bases[it.q].clone(); // 文ごとに前の文の影響を残さない
      const t0 = performance.now();
      const out = await s.prompt(`投稿:\n${it.text}`, { responseConstraint: schema });
      const ms = Math.round(performance.now() - t0);
      let score = null;
      try { score = JSON.parse(out).score; } catch {}
      window.__R.push({ id: it.id, q: it.q, expect: it.expect, score, ms });
      s.destroy();
    }
  } catch (e) { window.__err = String(e); }
  window.__done = true;
})();
