# Chrome ウェブストアに出す zip を作る。python tools/package.py → dist/osusume-kenon-<版>.zip
# 入れるのは、拡張が使うファイルだけ（manifest が名指しするもの + 設定画面が読むもの）。研究・試験・道具は入れない
import json, re, sys, zipfile, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
m = json.loads((root / "manifest.json").read_text(encoding="utf8"))
files = {"manifest.json"}
for cs in m.get("content_scripts", []):
    files.update(cs.get("js", []))
    files.update(cs.get("css", []))
files.update(m.get("icons", {}).values())
if m.get("options_page"):
    files.add(m["options_page"])
    html = (root / m["options_page"]).read_text(encoding="utf8")
    files.update(re.findall(r'<script[^>]+src="([^"]+)"', html))
missing = sorted(f for f in files if not (root / f).is_file())
if missing:
    sys.exit(f"manifest や設定画面が名指ししているファイルが無い: {missing}")
out = root / "dist"
out.mkdir(exist_ok=True)
zp = out / f"osusume-kenon-{m['version']}.zip"
with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(files):
        z.write(root / f, f)
print(zp, f"({zp.stat().st_size} bytes)")
for f in sorted(files):
    print(" ", f)
