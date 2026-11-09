# 学んだ重みどうしを、同じ確かめ用の文で比べる（DESIGN.md D32 の ④。結果は research/classifier-record.md）。
# 先に train.py eval で、重みごとに eval-all.json（文ごとの確からしさ）を書いておく。
# python tools/clf/compare.py --runs 1=<重みの置き場>,<…>,<…> 2=… --before private/clf/split-r1.json --new i-gaps.jsonl [--ids e148,b085]
# --before は前の回の取り分け（[id, {split, group}] の並び）。前からの文は、前の回も今も確かめ用だった文だけを数える（前の回が学んだ文を除くため）
# --new のファイルの確かめ用の文は、別に数える。線は 0.5。種ごとの値の幅（いちばん低い〜高い）と、種の確からしさを平均した値を出す
import argparse, json, pathlib, sys
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import train

L = train.LABELS


def rate(y, hit):  # 拾えた割合・出したうちの当たり（丸めない）
    tp = (hit & (y == 1)).sum()
    return tp / max(1, y.sum()), tp / max(1, hit.sum())


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--runs", nargs="+", required=True, help="回の名前=重みの置き場をコンマで（種ごと）")
    a.add_argument("--before", required=True)
    a.add_argument("--new", nargs="+", default=[])
    a.add_argument("--ids", default="")
    args = a.parse_args()
    data = {r["id"]: r for r in train.load()}
    before = dict(json.loads(pathlib.Path(args.before).read_text(encoding="utf8")))
    runs = {}
    for spec in args.runs:
        name, dirs = spec.split("=", 1)
        runs[name] = [json.loads((pathlib.Path(d) / "eval-all.json").read_text(encoding="utf8"))["probs"] for d in dirs.split(",")]
    ids = set.intersection(*(set(p) for ps in runs.values() for p in ps))  # どの重みでも測った文
    subs = {"前からの文": sorted(i for i in ids if data[i]["file"] not in args.new and before.get(i, {}).get("split") == "test")}
    if args.new:
        subs["足した文"] = sorted(i for i in ids if data[i]["file"] in args.new)
    ok = lambda p, i: all((p[i][j] >= 0.5) == bool(data[i][k]) for j, k in enumerate(L))
    for sname, sub in subs.items():
        y = {k: np.array([data[i][k] for i in sub]) for k in L}
        print(f"\n== {sname} {len(sub)} 本（迷う文 {sum(data[i]['amb'] for i in sub)} 本）")
        for name, ps in runs.items():
            cols = []
            for j, k in enumerate(L):
                v = [(train.ap(y[k], np.array([p[i][j] for i in sub])), *rate(y[k], np.array([p[i][j] >= 0.5 for i in sub]))) for p in ps]
                avg = train.ap(y[k], np.mean([[p[i][j] for i in sub] for p in ps], axis=0))
                cols.append(f"{k}: 並べた当たり {min(x[0] for x in v):.2f}〜{max(x[0] for x in v):.2f}（平均 {avg:.2f}）"
                            f" 拾えた {min(x[1] for x in v):.2f}〜{max(x[1] for x in v):.2f} 当たり {min(x[2] for x in v):.2f}〜{max(x[2] for x in v):.2f}")
            print(f"{name}回目 | " + " | ".join(cols))
        for label, cond, j, want in (("脅し（迷う文を除く）: 重い段を拾えた数", lambda r: r["kind"] == "threat" and not r["amb"], 2, True),
                                     ("集団をまるごと見下す文: 重い段を拾えた数", lambda r: r["kind"] == "whole", 2, True),
                                     ("一人・一部への見下し（迷う文を除く）: 重い段を 0 と見た数", lambda r: r["kind"] in ("ind", "part") and not r["amb"], 2, False)):
            n = sum(1 for i in sub if cond(data[i]))
            print(f"{label}（{n} 本）: " + "  ".join(f"{name}回目 {[sum(1 for i in sub if cond(data[i]) and (p[i][j] >= 0.5) == want) for p in ps]}" for name, ps in runs.items()))
    every = sorted(i for s in subs.values() for i in s)
    print("\n種すべてで外した文の数: " + "  ".join(f"{name}回目 {sum(1 for i in every if not any(ok(p, i) for p in ps))}" for name, ps in runs.items()))
    last, ps = list(runs.items())[-1]
    print(f"{last}回目で、種すべてで外した文:")
    for i in every:
        if not any(ok(p, i) for p in ps):
            r = data[i]
            print(f"  {i} {r['kind']}{' 迷う' if r['amb'] else ''} 正解 {[r[k] for k in L]} 確からしさ {[[round(x, 2) for x in p[i]] for p in ps]} {r['text'][:50]}")
    for i in filter(None, args.ids.split(",")):
        print(f"{i}: 正しかった種の数 " + "  ".join(f"{name}回目 {sum(ok(p, i) for p in ps)}" for name, ps in runs.items() if i in ps[0]))


if __name__ == "__main__":
    main()
