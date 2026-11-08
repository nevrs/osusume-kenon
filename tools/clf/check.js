// 分類器に覚えさせる作り物の文（tools/clf/synth/*.jsonl）を点検する（DESIGN.md D32 の ③・D33。決まりは research/classifier-guide.md）。
// node tools/clf/check.js [--against <ファイルかフォルダ> ...]
// 形の誤り・印の矛盾を止め、組（intense × thorn）・型・確かめ用の取り分けの数、伏せ字と「！」の偏り、長さを出す。
// ほかの文と似ていないかも見る（tools/eval・この手引きは常に見る。本人の記録の書き出しを --against に渡すのは dev だけ）
const fs = require("fs"), path = require("path");

const COLS = ["id", "intense", "thorn", "grave", "amb", "kind", "pair", "text"];
const KIND0 = ["plain", "news", "ad", "call", "question", "heavy", "light", "act", "quote", "antilump", "name", "stereo", "praise", "object", "self", "curse", "vulgar", "choice", "punish", "banter"];
const KIND1 = { ind: 0, part: 0, whole: 1, excl: 1, threat: 1 }; // とげの型と、そのときの grave
const HOT = ["joy", "sad", "fear", "anger", "surprise", "laugh", "plea"];
const N = 10; // 同じ並びとみなす字数
const SIM = 0.45; // ほかの文と似ているとみなす、字の 3 つ組の重なり（Jaccard）
const PAIR_SIM = 0.3, NEAR = 2, RARE = 10; // 同じ組にまとめる近さ（どこでも 3 つ組の重なり／同じファイルの 2 行以内で、全体で 10 本以下にしか出ない 2 字を共有）

const squeeze = (s) => s.replace(/[\s、。，．・「」『』（）()！!？?…ｗw〇△]/g, "");
const tri = (s) => { const x = squeeze(s), g = new Set(); for (let i = 0; i + 3 <= x.length; i++) g.add(x.slice(i, i + 3)); return g; };
const bi = (s) => { const x = squeeze(s), g = new Set(); for (let i = 0; i + 2 <= x.length; i++) if (!/^[぀-ゟ]+$/.test(x.slice(i, i + 2))) g.add(x.slice(i, i + 2)); return g; }; // ひらがなだけの 2 字は除く
const jac = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const g of a) if (b.has(g)) n++; return n / (a.size + b.size - n); };
const hash = (s) => { let x = 2166136261; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };

function load(dir = path.join(__dirname, "synth")) {
  const rows = [], errs = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    fs.readFileSync(path.join(dir, f), "utf8").replace(/\r/g, "").split("\n").forEach((ln, i) => {
      if (!ln) return;
      let r;
      try { r = JSON.parse(ln); } catch { return errs.push(`${f}:${i + 1}: JSON として読めない`); }
      if (!r || typeof r !== "object" || Array.isArray(r)) return errs.push(`${f}:${i + 1}: 1 本の文の形でない`);
      if (Object.keys(r).join() !== COLS.join()) return errs.push(`${f}:${i + 1}: 項目が ${COLS.join("・")} の順でない`);
      let ok = true;
      for (const c of ["intense", "thorn", "grave", "amb"]) if (r[c] !== 0 && r[c] !== 1) { errs.push(`${f}:${i + 1}: ${c} が 0/1 でない`); ok = false; }
      for (const c of ["id", "kind", "pair", "text"]) if (typeof r[c] !== "string") { errs.push(`${f}:${i + 1}: ${c} が文字でない`); ok = false; }
      if (!ok) return;
      r.file = f; r.line = i;
      rows.push(r);
    });
  }
  return { rows, errs };
}

function check(rows, errs) {
  const ids = new Set(), texts = new Map();
  for (const r of rows) {
    if (ids.has(r.id)) errs.push(`${r.id}: id が重なる`);
    ids.add(r.id);
    if (texts.has(r.text)) errs.push(`${r.id}: ${texts.get(r.text)} と同じ文`);
    texts.set(r.text, r.id);
    if (!r.text.trim() || r.text !== r.text.trim() || /[\n\t]/.test(r.text)) errs.push(`${r.id}: 文が空・前後に空白・改行かタブがある`); // 記録では改行が空白になる
    if (r.grave && !r.thorn) errs.push(`${r.id}: grave 1 なのに thorn 0`);
    const hot = /^hot-(.*)$/.exec(r.kind);
    if (hot) {
      if (!HOT.includes(hot[1])) errs.push(`${r.id}: 知らない型 ${r.kind}`);
      if (!r.intense || r.thorn) errs.push(`${r.id}: hot- の型は intense 1・thorn 0`);
    } else if (Object.hasOwn(KIND1, r.kind)) {
      // amb の文は、迷ったら 0 の決まりで、型より軽く付けてよい。どの印に迷ったかは書かないので、迷った印を 0 にし忘れても、ここでは止められない
      if (!r.amb && (r.thorn !== 1 || r.grave !== KIND1[r.kind])) errs.push(`${r.id}: 型 ${r.kind} と印 ${r.thorn}/${r.grave} が合わない`);
      if (r.amb && r.grave > KIND1[r.kind]) errs.push(`${r.id}: amb なのに型 ${r.kind} より重い`);
    } else if (KIND0.includes(r.kind)) {
      if (r.thorn) errs.push(`${r.id}: 型 ${r.kind} なのに thorn 1`);
      if ((r.kind === "light" || r.kind === "heavy") && r.intense) errs.push(`${r.id}: 型 ${r.kind} なのに intense 1`);
    } else errs.push(`${r.id}: 知らない型 ${r.kind}`);
  }
}

// 確かめ用の取り分け。同じ pair の文と、似た文を 1 つの組にまとめ、組ごとに 5 つに 1 つを確かめ用にする。
// 対の片方を学び、もう片方で確かめると、結果が甘く出るため。言い換えの対は続けて書いたので、近くの行で話題の言葉（めずらしい 2 字）を共有するものもまとめる。④ の学習もこれを使う
function splits(rows) {
  const g = rows.map((r) => tri(r.text)), b = rows.map((r) => bi(r.text)), df = {}, par = rows.map((_, i) => i);
  for (const s of b) for (const x of s) df[x] = (df[x] || 0) + 1;
  const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
  const join = (i, j) => { par[find(i)] = find(j); };
  const byPair = {};
  rows.forEach((r, i) => { if (r.pair) byPair[r.pair] === undefined ? (byPair[r.pair] = i) : join(i, byPair[r.pair]); });
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const near = rows[i].file === rows[j].file && Math.abs(rows[i].line - rows[j].line) <= NEAR;
    if (jac(g[i], g[j]) >= PAIR_SIM || (near && [...b[i]].some((x) => df[x] <= RARE && b[j].has(x)))) join(i, j);
  }
  const key = {};
  rows.forEach((r, i) => { const k = find(i); if (!key[k] || r.id < key[k]) key[k] = r.id; });
  return new Map(rows.map((r, i) => [r.id, { split: hash(key[find(i)]) % 5 === 0 ? "test" : "train", group: key[find(i)] }]));
}

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(0) + "%" : "-");

function report(rows, sp) {
  const cell = (r) => `intense ${r.intense} × thorn ${r.thorn}`;
  const count = (xs, key) => xs.reduce((m, r) => ((m[key(r)] = (m[key(r)] || 0) + 1), m), {});
  const tr = rows.filter((r) => sp.get(r.id).split === "train"), te = rows.filter((r) => sp.get(r.id).split === "test");
  const sizes = Object.values(count(rows, (r) => sp.get(r.id).group));
  console.log(`全 ${rows.length} 本（amb ${rows.filter((r) => r.amb).length}）。組 ${sizes.length} 個、2 本以上の組 ${sizes.filter((n) => n > 1).length} 個（最大 ${Math.max(...sizes)} 本）`);
  console.log("\n組            学習  確かめ");
  for (const c of [...new Set(rows.map(cell))].sort()) console.log(`${c}  ${count(tr, cell)[c] || 0}  ${count(te, cell)[c] || 0}`);
  console.log(`grave 1      ${tr.filter((r) => r.grave).length}  ${te.filter((r) => r.grave).length}`);
  console.log("\n型ごと:", Object.entries(count(rows, (r) => r.kind)).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join("・"));
  // 偏りの点検: 伏せ字・「！」の連続が、ある印の側にだけ多いと、分類器がそれを手がかりと覚える
  const has = (re) => (xs) => pct(xs.filter((r) => re.test(r.text)).length, xs.length);
  const mask = has(/〇〇|△△/), bang = has(/[！!]{2,}/), at = has(/@/);
  const t1 = rows.filter((r) => r.thorn), t0 = rows.filter((r) => !r.thorn), i1 = rows.filter((r) => r.intense), i0 = rows.filter((r) => !r.intense);
  console.log(`\n伏せ字（〇〇・△△）: thorn 1 で ${mask(t1)}・thorn 0 で ${mask(t0)}`);
  console.log(`「！」の連続: intense 1 で ${bang(i1)}・intense 0 で ${bang(i0)}／thorn 1 で ${bang(t1)}・thorn 0 で ${bang(t0)}`);
  console.log(`@: thorn 1 で ${at(t1)}・thorn 0 で ${at(t0)}`);
  const L = rows.map((r) => [...r.text].length).sort((a, b) => a - b), q = (p) => L[Math.floor(p * (L.length - 1))];
  console.log(`長さ（字）: 10% ${q(0.1)}・中ほど ${q(0.5)}・90% ${q(0.9)}・最長 ${L[L.length - 1]}`);
}

// 比べる先の文を集める（JSON なら text を、この手引きなら表のすべての欄と「」の中を、それ以外は 1 行ずつ）
function textsOf(p) {
  if (fs.statSync(p).isDirectory()) return fs.readdirSync(p).flatMap((f) => textsOf(path.join(p, f)));
  const s = fs.readFileSync(p, "utf8");
  if (p.endsWith(".json")) {
    const out = [];
    (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) k === "text" && typeof v === "string" ? out.push(v) : walk(v); })(JSON.parse(s));
    return out;
  }
  if (p.endsWith(".md")) {
    const cells = s.split("\n").filter((l) => /^\| [^-|:]/.test(l)).flatMap((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
    return [...cells, ...[...s.matchAll(/「([^」]{4,})」/g)].map((m) => m[1])];
  }
  return s.split("\n");
}

// 似ている文: 10 字以上の同じ並び、比べる先の文が丸ごと入っている（6 字以上）、字の 3 つ組の重なりが SIM 以上
function overlap(rows, sources) {
  for (const src of sources) {
    const texts = textsOf(src).filter((t) => squeeze(t).length >= 6);
    const grams = new Map(), idx = new Map(), sets = texts.map(tri);
    texts.forEach((t, k) => {
      const s = squeeze(t);
      for (let i = 0; i + N <= s.length; i++) if (!grams.has(s.slice(i, i + N))) grams.set(s.slice(i, i + N), k);
      for (const g of sets[k]) (idx.get(g) || idx.set(g, []).get(g)).push(k);
    });
    const hits = [];
    for (const r of rows) {
      const s = squeeze(r.text), mine = tri(r.text), why = [];
      for (let i = 0; i + N <= s.length; i++) if (grams.has(s.slice(i, i + N))) { why.push(`同じ並び「${s.slice(i, i + N)}」`); break; }
      const shared = new Map();
      for (const g of mine) for (const k of idx.get(g) || []) shared.set(k, (shared.get(k) || 0) + 1);
      let best = 0;
      for (const [k, n] of shared) best = Math.max(best, n / (mine.size + sets[k].size - n));
      if (best >= SIM) why.push(`似ている ${best.toFixed(2)}`);
      const inside = texts.find((t) => s.includes(squeeze(t)));
      if (inside) why.push(`比べる先の ${squeeze(inside).length} 字の文が丸ごと入っている`); // 比べる先（本人の記録のこともある）の文は出さない
      if (why.length) hits.push(`${r.id}: ${why.join("・")}`);
    }
    console.log(`\n${path.relative(process.cwd(), src) || src}: 似ている ${hits.length} 本`);
    for (const h of hits) console.log("  " + h);
  }
}

if (require.main === module) {
  const { rows, errs } = load();
  check(rows, errs);
  if (errs.length) { console.log(`誤り ${errs.length} 件`); errs.forEach((e) => console.log("  " + e)); process.exitCode = 1; }
  const sp = splits(rows);
  report(rows, sp);
  const root = path.join(__dirname, "..", "..");
  const extra = process.argv.slice(2).filter((a, i, a2) => a2[i - 1] === "--against");
  overlap(rows, [path.join(root, "tools", "eval"), path.join(root, "research", "classifier-guide.md"), ...extra]);
}

module.exports = { load, splits };
