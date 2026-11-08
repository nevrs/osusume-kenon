# 作り物の文（tools/clf/synth）で、高温・とげ・重い段を見分ける小さな分類器を学ばせる（DESIGN.md D32 の ④・D33。決まりは research/classifier-guide.md）。
# python tools/clf/train.py cv --mix names+join --lr 5e-5 --epochs 8 [--fold 0〜4]   学習用の文を 5 つに分けて回し、設定を選ぶ（確かめ用の文は見ない）
# python tools/clf/train.py final --mix names+join --lr 5e-5 --epochs 4   学習用の文すべてで学び、確かめ用の文で 1 度だけ測る
# 取り分けは check.js の splits を node で呼ぶ。重みと結果は private/clf/ に書く（.gitignore 済み。同梱は ⑥ で決める）。要るもの: requirements.txt
import argparse, json, pathlib, random, re, subprocess, sys, time, zlib
import numpy as np, torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer, logging

sys.stdout.reconfigure(encoding="utf-8")
logging.set_verbosity_error()
root = pathlib.Path(__file__).resolve().parent.parent.parent
BASE, REV = "sbintuitions/modernbert-ja-30m", "8cb03f54cb9e30e72459e5f1cedc6d89c7d8dcb5"
LABELS = ["intense", "thorn", "grave"]
BS, WARM, MAXLEN, FOLDS = 16, 50, 256, 5

# 伏せ字（〇〇・△△）を、あとに続く字で選んだ作り物の名前に替える。伏せ字をとげの手がかりと覚えさせないため。本物の投稿には名前が出る
# 実在の政党・宗教・国・議員の集まり・物語の国の名と重ならないように選んだ。人の名字と地名は、ありふれたものなので、同じ名の人や所はありうる
# @名は 16 字以上にした（X の @名は 15 字までなので、実在しえない）
NAMES = {
    "group": ["ルベリア", "ヴァスカリア", "ベルナシア", "トラヴィオ", "ザルミア", "ソラニア", "エルミード", "アルヴェン", "ドラヴィナ", "キリエラ", "モルダン", "セレスタ"],
    "faith": ["ルミナ", "星環", "天穹", "光輪", "オルド", "真響"],
    "party": ["青葉", "白樺", "若竹", "朝凪", "潮風", "碧空", "黎明", "暁光", "新緑", "若潮"],
    "place": ["青川", "北陵", "雪見原", "霧ノ宮", "汐見", "緑ヶ原", "柊野", "白嶺", "千鳥", "葵原"],
    "handle": ["haru_photo_08210", "minato_works_777", "sora_no_iro_2026", "kz_daily_notes_01", "yuu_camera_life_3", "tak_m_weekend_run", "noa_123_illust_jp", "riku_desu_gamer_9"],
    "person": ["森川", "高瀬", "白石", "三浦", "宮下", "坂口", "早瀬", "水野", "桐生", "永井", "相沢", "古賀", "真壁", "柏木", "篠原", "瀬戸", "ユウキ", "ミナト", "ハルカ", "ソウタ"],
}
AFTER = [("group", "人|系|族"), ("faith", "教(?![授室師員育頭官])"), ("party", "党"),
         ("place", "市|町|村|県|府|区|駅|線|橋|空港|鉄道|銀行|新聞|テレ|大学|高校|中学|小学|病院|球団|社|省|港")]  # @ のあとは handle、どれでもなければ person


def names(text, rng, used=None):  # used: 伏せ字と名の対応。対の文どうしで分け合うと、対の中でも同じ伏せ字は同じ名に、違う伏せ字は違う名になる
    used = {} if used is None else used

    def sub(m):
        kind = "handle" if text[:m.start()].endswith("@") else next((k for k, pat in AFTER if re.match(pat, text[m.end():])), "person")
        if (m.group(), kind) not in used:  # 同じ文の同じ伏せ字は同じ名に、〇〇 と △△ は別の名にする
            used[(m.group(), kind)] = rng.choice([n for n in NAMES[kind] if n not in used.values()] or NAMES[kind])
        return used[(m.group(), kind)]

    return re.sub("〇〇|△△", sub, text)


# 2〜3 本をつないで、長い投稿の形にする。印は、どれかが 1 なら 1（とげの 1 文が入った投稿は、とげの投稿）
# 長さは 160 字まで。140 字に近い文を十分に作るため、少し広めにした
END = "。！？!?…ｗw）)」"


def join(rows, rng, n):
    out = []
    while len(out) < n:
        parts = rng.sample(rows, rng.choice([2, 2, 3]))
        if len({p["group"] for p in parts}) < len(parts):  # 対の文どうしはつながない
            continue
        text = parts[0]["text"]
        for p in parts[1:]:
            t = text.rstrip("…")  # 途中で切れた印は、末尾にだけ残す
            text = t + (" " if t[-1] in END else rng.choice(["。", " "])) + p["text"]
        if len(text) <= 160:
            out.append({"id": "+".join(p["id"] for p in parts), "text": text, "amb": max(p["amb"] for p in parts), **{k: max(p[k] for p in parts) for k in LABELS}})
    return out


def load():  # check.js で形と印を点検してから読む。誤りがあれば学ばない
    js = ("const {load,check,splits}=require('./tools/clf/check.js');const {rows,errs}=load();check(rows,errs);"
          "if(errs.length){console.error(errs.join('\\n'));process.exit(1)}"
          "const sp=splits(rows);process.stdout.write(JSON.stringify(rows.map(r=>({...r,...sp.get(r.id)}))))")
    p = subprocess.run(["node", "-e", js], cwd=root, capture_output=True)
    if p.returncode:
        sys.exit("check.js が止めた:\n" + p.stderr.decode("utf8"))
    return json.loads(p.stdout.decode("utf8"))


def fixed(rows):  # 確かめるときの名前は、文ごとに決まった名にする。対の文どうしは伏せ字と名の対応を分け合う（〇〇 と △△ だけ違う対が、同じ名を引いて同じ文にならないように）
    shared = {}
    return [{**r, "text": names(r["text"], random.Random(zlib.crc32(r["id"].encode())), shared.setdefault(r["pair"] or r["id"], {}))} for r in rows]


def predict(model, tok, rows):
    model.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(rows), 64):
            x = tok([r["text"] for r in rows[i:i + 64]], padding=True, truncation=True, max_length=MAXLEN, return_tensors="pt")
            out.append(torch.sigmoid(model(**x).logits).numpy())
    return np.concatenate(out)


def ap(y, p):  # 並べたときの当たり（average precision）。線を引かずに比べる
    y = y[np.argsort(-p)]
    return float((np.cumsum(y) / np.arange(1, len(y) + 1) * y).sum() / max(1, y.sum()))


def scores(rows, p, th=(0.5, 0.5, 0.5)):
    out = {}
    for j, k in enumerate(LABELS):
        y, hit = np.array([r[k] for r in rows]), p[:, j] >= th[j]
        tp = int((hit & (y == 1)).sum())
        out[k] = {"ap": round(ap(y, p[:, j]), 3), "prec": round(tp / max(1, int(hit.sum())), 3), "rec": round(tp / max(1, int(y.sum())), 3), "pos": int(y.sum()), "n": len(rows)}
    return out


def fit(rows, args, evals={}):
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    tok = AutoTokenizer.from_pretrained(BASE, revision=REV)
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE, revision=REV, num_labels=3, problem_type="multi_label_classification",
        id2label=dict(enumerate(LABELS)), label2id={k: j for j, k in enumerate(LABELS)})
    # 土台から引き継ぐ出口の手前の値が大きく（1 つの値が 50 ほど）、乱数で始めると学ぶ前から確からしさが 0 か 1 に張り付くので、最後の段を 0 から始める
    torch.nn.init.zeros_(model.classifier.weight)
    torch.nn.init.zeros_(model.classifier.bias)
    # 字片の表（重みの 7 割）は動かさない。学ぶ文が少なく、学習に出ない字片（本物の投稿の名前など）と、出た字片の位置がずれないように。メモリも減る（このPC で 1.5GB → 0.9GB）
    model.model.embeddings.tok_embeddings.weight.requires_grad_(False)
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.lr, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / WARM))  # 温めたあとは一定。途中の回で測った値が、その回数だけ学んだ値になる
    hist = []
    for ep in range(1, args.epochs + 1):
        model.train()
        batch = [{**r, "text": names(r["text"], rng)} if "names" in args.mix else r for r in rows]
        if "join" in args.mix:
            batch += join(batch, rng, len(rows) // 2)
        rng.shuffle(batch)
        t0, loss_sum = time.time(), 0.0
        for i in range(0, len(batch), BS):
            b = batch[i:i + BS]
            x = tok([r["text"] for r in b], padding=True, truncation=True, max_length=MAXLEN, return_tensors="pt")
            y = torch.tensor([[float(r[k]) for k in LABELS] for r in b])
            loss = torch.nn.functional.binary_cross_entropy_with_logits(model(**x).logits, y)
            loss.backward()
            opt.step(), sched.step(), opt.zero_grad()
            loss_sum += loss.item() * len(b)
        h = {"epoch": ep, "loss": round(loss_sum / len(batch), 4), "sec": round(time.time() - t0)}
        for name, ev in evals.items():
            h[name] = predict(model, tok, ev)
        hist.append(h)
        print(f"  回 {ep}: loss {h['loss']} ({h['sec']} 秒)", flush=True)
    return model, tok, hist


def cv(data, args):
    tr = [r for r in data if r["split"] == "train"]
    fold = {r["id"]: zlib.crc32(r["group"].encode()) % FOLDS for r in tr}  # 組ごとに分ける（対の文を同じ側に）
    out = root / "private" / "clf"
    out.mkdir(parents=True, exist_ok=True)
    data_id = zlib.crc32(json.dumps([[r["id"], r["text"], r["group"]] + [r[k] for k in LABELS] for r in tr], ensure_ascii=False).encode()) % 10**6  # 文や組が変わると名前が変わり、古い途中結果を読まない
    stem = f"cv-{args.mix}-{args.lr}-{args.epochs}-s{args.seed}-d{data_id}"
    oof = {}  # 回ごとの、外して測った確からしさ
    for f in [args.fold] if args.fold is not None else range(FOLDS):
        fit_rows, val = [r for r in tr if fold[r["id"]] != f], [r for r in tr if fold[r["id"]] == f]
        val_f = fixed(val)
        long = join(val_f, random.Random(f), len(val) // 2)
        cache = out / f"{stem}-f{f}.json"  # 分けごとに書いておき、途中で止まっても続きから回せるようにする（メモリが足りず止められることがある）
        if cache.exists():
            hist = json.loads(cache.read_text(encoding="utf8"))
        else:
            print(f"分け {f + 1}/{FOLDS}: 学ぶ {len(fit_rows)} 本・測る {len(val)} 本", flush=True)
            hist = [{k: v.tolist() if isinstance(v, np.ndarray) else v for k, v in h.items()} for h in fit(fit_rows, args, {"plain": val_f, "long": long})[2]]
            cache.write_text(json.dumps(hist), encoding="utf8")
        for h in hist:
            assert len(h["plain"]) == len(val_f) and len(h["long"]) == len(long), f"{cache} が今の文と合わない"
            o = oof.setdefault(h["epoch"], {"plain": [], "long": []})
            o["plain"] += zip(val_f, np.array(h["plain"]))
            o["long"] += zip(long, np.array(h["long"]))
    if args.fold is not None:
        return
    res = {"mix": args.mix, "lr": args.lr, "seed": args.seed, "epochs": {}}
    for ep, o in oof.items():
        e = {}
        for name in ("plain", "long"):
            e[name] = scores([r for r, _ in o[name]], np.array([p for _, p in o[name]]))
        e["mean_ap"] = round(float(np.mean([e["plain"][k]["ap"] for k in LABELS])), 3)
        e["mean_ap_long"] = round(float(np.mean([e["long"][k]["ap"] for k in LABELS])), 3)
        # 線は、外して測った確からしさで、F1 がいちばん高くなる所に引く（作り物の文だけで決める。D32）
        e["threshold"] = [best_th(np.array([r[k] for r, _ in o["plain"]]), np.array([p[j] for _, p in o["plain"]])) for j, k in enumerate(LABELS)]
        res["epochs"][ep] = e
        print(f"回 {ep}: AP 平均 {e['mean_ap']}（長い文 {e['mean_ap_long']}）  " + "  ".join(f"{k} {e['plain'][k]['ap']}/{e['long'][k]['ap']}" for k in LABELS) + f"  線 {e['threshold']}")
    (out / f"{stem}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf8")


def best_th(y, p):
    best = (0, 0.5)
    for t in np.arange(0.05, 0.96, 0.05):
        hit = p >= t
        tp = (hit & (y == 1)).sum()
        f1 = 2 * tp / max(1, hit.sum() + y.sum())
        if f1 > best[0]:
            best = (f1, round(float(t), 2))
    return best[1]


def final(data, args):
    tr, te = [r for r in data if r["split"] == "train"], [r for r in data if r["split"] == "test"]
    te_f = fixed(te)
    sets = {"plain": te_f, "masked": te, "long": join(te_f, random.Random(0), len(te) // 2)}
    model, tok, hist = fit(tr, args)
    th = args.threshold or [0.5, 0.5, 0.5]
    res = {"mix": args.mix, "lr": args.lr, "epochs": args.epochs, "seed": args.seed, "threshold": th, "base": f"{BASE}@{REV}", "train": len(tr), "test": len(te)}
    probs = {}
    for name, rows in sets.items():
        p = predict(model, tok, rows)
        probs[name] = p
        res[name] = scores(rows, p, th)
        for amb in (0, 1):  # 迷う文は分けて数える
            idx = [i for i, r in enumerate(rows) if bool(r["amb"]) == bool(amb)]
            if name != "long" and idx:
                res[f"{name}_amb{amb}"] = scores([rows[i] for i in idx], p[idx], th)
    # 対の文（同じ pair の文）: 印が違う組は、1 の側を高く見たか。印が同じ組（左右の入れ替え・伏せ字だけ違う文など）は、確からしさの差を組ごとに残す
    p, pairs = probs["plain"], {}
    for i, r in enumerate(te_f):
        if r["pair"]:
            pairs.setdefault(r["pair"], []).append(i)
    flips, gaps = {k: [0, 0] for k in LABELS}, []
    for ids in pairs.values():
        for a in ids:
            for b in ids:
                if a < b:
                    same = all(te_f[a][k] == te_f[b][k] for k in LABELS)
                    for j, k in enumerate(LABELS):
                        if te_f[a][k] != te_f[b][k]:
                            hi, lo = (a, b) if te_f[a][k] else (b, a)
                            flips[k][0] += int(p[hi, j] > p[lo, j]); flips[k][1] += 1
                    if same:
                        gaps.append({"ids": [te_f[a]["id"], te_f[b]["id"]], "gap": round(float(np.abs(p[a] - p[b]).max()), 3), "same_text": te_f[a]["text"] == te_f[b]["text"]})
    res["pairs"] = {"flip": flips, "same": gaps}
    # 外した文（作り物の文なので、id と文をそのまま残してよい）
    res["misses"] = [{"id": r["id"], "kind": r["kind"], "amb": r["amb"], "text": r["text"], **{k: [r[k], round(float(p[i, j]), 2)] for j, k in enumerate(LABELS)}}
                     for i, r in enumerate(te_f) if any((p[i, j] >= th[j]) != bool(r[k]) for j, k in enumerate(LABELS))]
    out = pathlib.Path(args.out) if args.out else root / "private" / "clf" / f"final-{args.mix}-{args.lr}-{args.epochs}-s{args.seed}"
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out)
    tok.save_pretrained(out)
    (out / "result.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf8")
    for name in sets:
        print(name, json.dumps(res[name], ensure_ascii=False))
    print("対:", json.dumps(res["pairs"]["flip"]), "印が同じ組の差:", " ".join(f"{g['ids'][0]}/{g['ids'][1]} {g['gap']}" for g in res["pairs"]["same"]))
    print(f"外した文 {len(res['misses'])} 本。書いた先: {out}")


if __name__ == "__main__":
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("mode", choices=["cv", "final"])
    ap_.add_argument("--mix", default="names+join", choices=["none", "names", "names+join"])
    ap_.add_argument("--lr", type=float, default=5e-5)
    ap_.add_argument("--epochs", type=int, default=4)
    ap_.add_argument("--seed", type=int, default=0)
    ap_.add_argument("--fold", type=int, choices=range(FOLDS), help="cv で、この分けだけを回して書いておく（あとで --fold なしで続きと合わせる）")
    ap_.add_argument("--threshold", type=float, nargs=3, help="intense thorn grave の線（cv が出したもの）")
    ap_.add_argument("--out")
    a = ap_.parse_args()
    (cv if a.mode == "cv" else final)(load(), a)
