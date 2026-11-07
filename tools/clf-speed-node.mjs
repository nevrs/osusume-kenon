// 小さな分類器の速さの試し・Node 版（DESIGN.md D32 の ①、research/classifier-record.md）。onnxruntime-node（ネイティブ）で動くので、Chrome（WASM）とは仕組みが違う
// 置き方は tools/clf-speed.html と同じ。app/ に置いて: node clf-speed-node.mjs <model/ のパス> <tools/eval のパス>
import { env, AutoTokenizer, AutoModel } from "@huggingface/transformers";
import fs from "fs";
const [, , modelRoot, evalDir] = process.argv;
env.localModelPath = modelRoot; env.allowRemoteModels = false;
const ID = "keisuke-miyako/modernbert-ja-30m-onnx-int8";
const texts = ["targets", "groups", "neutral"].flatMap((f) => JSON.parse(fs.readFileSync(`${evalDir}/${f}.json`, "utf8")).posts.map((p) => p.text));
const tok = await AutoTokenizer.from_pretrained(ID);
const t0 = performance.now();
const model = await AutoModel.from_pretrained(ID, { dtype: "q8", device: "cpu" });
console.log("load ms", Math.round(performance.now() - t0), "texts", texts.length);
console.log("tokens of a sample:", tok.tokenize(texts[0]).join(" | "));
const lens = texts.map((t) => tok(t).input_ids.dims[1]).sort((a, b) => a - b);
console.log("token length (with 2 special tokens) min/median/max", lens[0], lens[lens.length >> 1], lens[lens.length - 1]);
const one = async (t) => model(tok(t, { truncation: true, max_length: 256 })); // 1 本の時間には、字の分け方の時間も入る
const o = await one(texts[0]);
for (const [k, v] of Object.entries(o)) console.log("output", k, v.dims.join("x"));
for (let i = 0; i < 3; i++) await one(texts[i]);
const ms = [];
for (let r = 0; r < 3; r++) for (const t of texts) { const s = performance.now(); await one(t); ms.push(performance.now() - s); }
ms.sort((a, b) => a - b);
const q = (p) => ms[Math.floor(p * (ms.length - 1))].toFixed(1);
console.log(`per post ms (n=${ms.length}): median ${q(0.5)} p90 ${q(0.9)} max ${q(1)} mean ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1)}`);
