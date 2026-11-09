# 学んだ分類器を、本人の記録で今の判定（ev1）と並べる（DESIGN.md D32 の ⑤）。記録・正解・結果は dev の private にだけ置く（AGENTS.md）
# python tools/clf/real.py blind <書き出しの JSON> <置き場> [--nokana 150]   ev1 の判定が付いた投稿（同じ本文は 1 本）と、かなを含まない投稿を混ぜて、本文だけの表を作る
# python tools/clf/real.py run <置き場> --runs 3=<重みの置き場>,<…>,<…> [2=…]   重みごとの確からしさを書く
# python tools/clf/real.py score <置き場> --labels <正解のファイル> --main 3 [--diag]   比べる（--diag は点検のための数。入れるかの判断には使わない）
# 正解のファイル: 1 行に「id 高温 とげ 重い段 [型] [印]」。書いていない id は 0 0 0。型は ind・part・whole・excl・threat。印 a = 迷う文、n = 人の集団の名前が出る（とげでない文）
# 本文は表にだけ書き、画面には出さない（blind）。ev1 の答えは key.json に分けて置く。正解を付けるあいだは、key.json と分類器の答えを見ない
import argparse, json, pathlib, random, re, sys
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import train

L = train.LABELS
KANA = re.compile("[ぁ-ゖァ-ヺ]")


def blind(args):
    rows = json.loads(pathlib.Path(args.export).read_text(encoding="utf8"))["rows"]
    seen, judged, nokana = set(), [], []
    for r in rows:  # 同じ本文は、最初に出た行（そのおすすめかフォロー中か）だけを残す
        t = r["text"].replace("\t", " ")
        if t in seen:
            continue
        seen.add(t)
        if str(r.get("jv", "")).startswith("ev1/"):  # 今の判定（ev1。feed-judge.js）が付いた行
            judged.append((t, r))
        elif not KANA.search(t) and t.strip():
            nokana.append((t, r))
    rng = random.Random(args.seed)
    rng.shuffle(judged)
    nokana = rng.sample(nokana, min(args.nokana, len(nokana)))
    out = pathlib.Path(args.dir)
    out.mkdir(parents=True, exist_ok=True)
    key, lines = {}, []
    for prefix, items in (("r", judged), ("k", nokana)):
        for n, (t, r) in enumerate(items, 1):
            i = f"{prefix}{n:04d}"
            lines.append(f"{i}\t{t}")
            key[i] = {"feed": r["feed"], "day": r["day"], "nokana": not KANA.search(t),
                      "ev1": [int(bool(r[k])) for k in ("c", "g", "x")] if str(r.get("jv", "")).startswith("ev1/") else None}
    (out / "blind.tsv").write_text("\n".join(lines) + "\n", encoding="utf8")
    (out / "key.json").write_text(json.dumps(key, ensure_ascii=False), encoding="utf8")
    print(f"ev1 の判定が付いた投稿 {len(judged)} 本・かなを含まない投稿 {len(nokana)} 本。書いた先: {out}")


def texts(d):
    return [line.split("\t", 1) for line in (d / "blind.tsv").read_text(encoding="utf8").splitlines()]


def run(args):
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    d = pathlib.Path(args.dir)
    rows = [{"id": i, "text": t} for i, t in texts(d)]
    for spec in args.runs:
        name, dirs = spec.split("=", 1)
        seeds = []
        for m in dirs.split(","):
            tok, model = AutoTokenizer.from_pretrained(m), AutoModelForSequenceClassification.from_pretrained(m)
            p = train.predict(model, tok, rows)
            seeds.append({r["id"]: [float(x) for x in p[n]] for n, r in enumerate(rows)})
            print(f"{name}回目 {m}: {len(rows)} 本", flush=True)
        (d / f"probs-{name}.json").write_text(json.dumps({"models": dirs.split(","), "seeds": seeds}), encoding="utf8")


def labels(path, ids):
    lab = {i: {"intense": 0, "thorn": 0, "grave": 0, "kind": "", "amb": False, "n": False} for i in ids}
    seen = set()
    for line in pathlib.Path(path).read_text(encoding="utf8").splitlines():
        m = re.match(r"^([rk]\d{4})\s+([01])\s+([01])\s+([01])((?:\s+\S+)*)\s*$", line)
        if not m:
            if line.strip() and not line.startswith("#"):
                sys.exit(f"正解の行の形が違う: {line}")
            continue
        i, rest = m.group(1), m.group(5).split()
        if i not in lab:
            sys.exit(f"表に無い id: {i}")
        if set(rest) - {"ind", "part", "whole", "excl", "threat", "a", "n"}:
            sys.exit(f"知らない印: {line}")
        r = {"intense": int(m.group(2)), "thorn": int(m.group(3)), "grave": int(m.group(4)),
             "kind": next((w for w in rest if w in ("ind", "part", "whole", "excl", "threat")), ""), "amb": "a" in rest, "n": "n" in rest}
        if r["grave"] > r["thorn"] or bool(r["kind"]) != bool(r["thorn"]) or (r["n"] and r["thorn"]) or (r["amb"] and r["thorn"]) \
                or (r["kind"] and (r["kind"] in ("whole", "excl", "threat")) != bool(r["grave"])):
            sys.exit(f"印が合わない（重い段ならとげ・とげなら型・型と重い段・n と迷う文はとげでない文だけ。迷ったら 0）: {line}")
        if i in seen:
            sys.exit(f"同じ id が 2 行ある: {i}")
        seen.add(i)
        lab[i] = r
    return lab


def f1(y, hit):
    tp = (hit & y).sum()
    return 2 * tp / max(1, hit.sum() + y.sum())


def rate(y, hit):  # 拾えた割合・出したうちの当たり
    tp = (hit & y).sum()
    return tp / max(1, y.sum()), tp / max(1, hit.sum())


def score(args):
    d = pathlib.Path(args.dir)
    key = json.loads((d / "key.json").read_text(encoding="utf8"))
    tx = dict(texts(d))
    lab = labels(args.labels, key)
    runs = {}
    for f in sorted(d.glob("probs-*.json")):
        seeds = json.loads(f.read_text(encoding="utf8"))["seeds"]
        runs[f.stem.removeprefix("probs-")] = seeds
    main = runs[args.main]
    avg = {i: np.mean([s[i] for s in main], axis=0) for i in key}
    ev1 = {i: (lambda c, g, x: [None, int(bool(c or x)), int(bool(x or (g and c)))])(*key[i]["ev1"]) for i in key if key[i]["ev1"]}
    J = [i for i in key if key[i]["ev1"] and not lab[i]["amb"]]
    rng = np.random.default_rng(0)
    boot = rng.integers(0, len(J), size=(2000, len(J)))
    print(f"ev1 の判定が付いた投稿 {sum(1 for i in key if key[i]['ev1'])} 本（迷う文 {sum(1 for i in key if key[i]['ev1'] and lab[i]['amb'])} 本を除いて {len(J)} 本で数える）")
    print("正解の本数: " + "  ".join(f"{k} {sum(lab[i][k] for i in J)}" for k in L) + "  型: " + json.dumps({t: sum(1 for i in J if lab[i]["kind"] == t) for t in ("ind", "part", "whole", "excl", "threat")}))

    # とげ・重い段: 分類器（本命）と ev1
    for j, k in ((1, "thorn"), (2, "grave")):
        y = np.array([lab[i][k] for i in J], bool)
        hc = np.array([avg[i][j] >= 0.5 for i in J])
        he = np.array([bool(ev1[i][j]) for i in J])
        diff = np.array([f1(y[b], hc[b]) - f1(y[b], he[b]) for b in boot])
        fc = np.array([f1(y[b], hc[b]) for b in boot]); fe = np.array([f1(y[b], he[b]) for b in boot])
        q = lambda a: f"{np.percentile(a, 5):.2f}〜{np.percentile(a, 95):.2f}"
        print(f"\n== {k}（正解 {y.sum()} 本）")
        for name, h, fb in (("分類器", hc, fc), ("ev1", he, fe)):
            r, p = rate(y, h)
            print(f" {name}: 出した {h.sum()} 本・拾えた割合 {r:.2f}・出したうちの当たり {p:.2f}・F1 {f1(y, h):.2f}（{q(fb)}）")
        print(f" F1 の差（分類器 − ev1）: {f1(y, hc) - f1(y, he):+.2f}（{q(diff)}）")
        print(f" 分類器の並べたときの当たり {train.ap(y.astype(int), np.array([avg[i][j] for i in J])):.2f}")
        both = [(a, b) for a, b in zip(hc & y, he & y)]
        print(f" 正解のうち 分類器だけ拾えた {sum(1 for a, b in both if a and not b)}・ev1 だけ拾えた {sum(1 for a, b in both if b and not a)}")

    # 集団の名前だけの文（n）での誤り
    N = [i for i in J if lab[i]["n"]]
    print(f"\n人の集団の名前が出る、とげでない文 {len(N)} 本で、出した本数: " + "  ".join(
        f"{k} 分類器 {sum(avg[i][j] >= 0.5 for i in N)}・ev1 {sum(ev1[i][j] for i in N)}" for j, k in ((1, "thorn"), (2, "grave"))))

    # おすすめ ÷ フォロー中
    fy = np.array([key[i]["feed"] == "for-you" for i in J])
    print(f"\nおすすめ ÷ フォロー中（おすすめ {fy.sum()} 本・フォロー中 {(~fy).sum()} 本。1 より大きいほどおすすめに多い。かっこは 90% の幅）")
    for j, k in ((1, "thorn"), (2, "grave")):
        for name, v in (("正解", [lab[i][k] for i in J]), ("ev1", [ev1[i][j] for i in J]), ("分類器", [int(avg[i][j] >= 0.5) for i in J])):
            v = np.array(v, float)
            ratio = lambda b: v[b][fy[b]].mean() / v[b][~fy[b]].mean() if v[b][~fy[b]].mean() else (np.inf if v[b][fy[b]].mean() else np.nan)  # フォロー中だけ 0 なら ∞、両方 0 なら出せない
            rs = np.array([ratio(b) for b in boot])
            rs = rs[~np.isnan(rs)]
            fmt = lambda x: "—" if np.isnan(x) else f"{x:.2f}" if np.isfinite(x) else "∞"
            pc = lambda t: np.percentile(rs, t, method="nearest") if len(rs) else np.nan  # ∞ をまたいで混ぜない
            print(f" {k} {name}: {v[fy].mean() * 100:.1f}% ÷ {v[~fy].mean() * 100:.1f}% = {fmt(ratio(np.arange(len(J))))}（{fmt(pc(5))}〜{fmt(pc(95))}）")

    # 重みごと（参考）
    print("\n重みごと（ev1 の判定が付いた投稿・迷う文を除く。拾えた割合/出したうちの当たり/並べたときの当たり）")
    for name, seeds in runs.items():
        for label, ps in [(f"種{n}", [s]) for n, s in enumerate(seeds)] + [("平均", seeds)]:
            cols = []
            for j, k in enumerate(L):
                y = np.array([lab[i][k] for i in J], bool)
                p = np.array([np.mean([s[i][j] for s in ps]) for i in J])
                r, pr = rate(y, p >= 0.5)
                cols.append(f"{k} {r:.2f}/{pr:.2f}/{train.ap(y.astype(int), p):.2f}")
            print(f" {name}回目 {label}: " + "  ".join(cols))

    # 迷う文・かなを含まない投稿
    A = [i for i in key if key[i]["ev1"] and lab[i]["amb"]]
    print(f"\n迷う文 {len(A)} 本で、出した本数: " + "  ".join(f"{k} 分類器 {sum(avg[i][j] >= 0.5 for i in A)}・ev1 {sum(ev1[i][j] for i in A)}" for j, k in ((1, "thorn"), (2, "grave"))))
    K = [i for i in key if key[i]["nokana"] and not key[i]["ev1"] and not lab[i]["amb"]]
    print(f"かなを含まない投稿 {len(K)} 本（迷う文を除く）: " + "  ".join(
        f"{k} 正解 {sum(lab[i][k] for i in K)}・出した {sum(avg[i][j] >= 0.5 for i in K)}・当たり {sum(lab[i][k] and avg[i][j] >= 0.5 for i in K)}" for j, k in enumerate(L)))

    # 点検のための数（線を記録で合わせない。D32）
    if args.diag:
        neg = [i for i in J if not lab[i]["thorn"]]
        print(f"\n点検: とげでない文 {len(neg)} 本のうち、本命のとげの確からしさが 0.9 以上 {sum(avg[i][1] >= 0.9 for i in neg)} 本")
        for name, seeds in runs.items():
            cols = []
            for j, k in enumerate(L):
                y = np.array([lab[i][k] for i in J], bool)
                p = np.array([np.mean([s[i][j] for s in seeds]) for i in J])
                cols.append(f"{k} {max(f1(y, p >= t) for t in np.unique(p)):.2f}")
            print(f" {name}回目の平均で、線をどこに引いても届く F1 の最大: " + "  ".join(cols))
        hit = lambda i: avg[i][1] >= 0.5
        for label, cond in [(f"長さ {lo}〜{hi - 1} 字", lambda i, lo=lo, hi=hi: lo <= len(tx[i]) < hi) for lo, hi in ((0, 20), (20, 50), (50, 100), (100, 140), (140, 10**4))] + [
                ("URL あり", lambda i: "https://" in tx[i]), ("URL なし", lambda i: "https://" not in tx[i]),
                ("おすすめ", lambda i: key[i]["feed"] == "for-you"), ("フォロー中", lambda i: key[i]["feed"] == "following")]:
            s = [i for i in neg if cond(i)]
            print(f" とげでない文・{label}: {len(s)} 本中 {sum(hit(i) for i in s)} 本をとげと出した")
        f = np.array([hit(i) for i in J])
        for j, k in ((1, "thorn"), (2, "grave")):
            y = np.array([lab[i][k] for i in J], bool)
            he = np.array([bool(ev1[i][j]) for i in J])
            for name, h in (("ev1", he), ("とげの線 0.5 を通った投稿だけを ev1 にかけたら", he & f)):
                r, p = rate(y, h)
                print(f" {k} {name}: 出した {h.sum()} 本・当たり {(h & y).sum()}・拾えた割合 {r:.2f}・出したうちの当たり {p:.2f}")
        print(f" とげの線 0.5 を通る投稿の割合 {f.mean():.3f}")

    # 本命が外した文（本文は dev の画面にだけ出す）
    if args.show:
        print("\n本命が外した文（正解 / 分類器の確からしさ / ev1）")
        for i in sorted(i for i in key if not lab[i]["amb"] and any((avg[i][j] >= 0.5) != bool(lab[i][k]) for j, k in enumerate(L))):
            print(f" {i} {lab[i]['kind'] or '-'}{' n' if lab[i]['n'] else ''} {[lab[i][k] for k in L]} {[round(float(x), 2) for x in avg[i]]} {ev1.get(i, [None, '-', '-'])[1:]} {tx[i][:80]}")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("mode", choices=["blind", "run", "score"])
    a.add_argument("paths", nargs="+", help="blind は 書き出しの JSON と置き場、run と score は置き場")
    a.add_argument("--nokana", type=int, default=150)
    a.add_argument("--seed", type=int, default=0)
    a.add_argument("--runs", nargs="+")
    a.add_argument("--labels")
    a.add_argument("--main", default="3")
    a.add_argument("--show", action="store_true", help="score で、本命が外した文を出す")
    a.add_argument("--diag", action="store_true", help="score で、点検のための数を出す（入れるかの判断には使わない）")
    args = a.parse_args()
    if len(args.paths) != (2 if args.mode == "blind" else 1):
        a.error("blind には 書き出しの JSON と置き場、run と score には置き場だけを渡す")
    if args.mode == "run" and not args.runs:
        a.error("run には --runs が要る")
    if args.mode == "score" and not args.labels:
        a.error("score には --labels が要る")
    *export, args.dir = args.paths
    args.export = export[0] if export else None
    {"blind": blind, "run": run, "score": score}[args.mode](args)
