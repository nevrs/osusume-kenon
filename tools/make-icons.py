# 拡張のアイコン(体温計)を作る。python tools/make-icons.py で icons/ に 16/32/48/128 を書き出す
from PIL import Image, ImageDraw
S = 1024  # 大きく描いて縮める
def draw():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=(29, 42, 53, 255))
    white, red = (240, 244, 247, 255), (233, 84, 62, 255)
    cx = S // 2
    # 管(外枠): 白
    d.rounded_rectangle([cx - 110, 130, cx + 110, 700], radius=110, fill=white)
    d.ellipse([cx - 230, 540, cx + 230, 1000 - 60], fill=white)
    # 水銀: 赤(球 + 柱)
    d.ellipse([cx - 160, 610, cx + 160, 930], fill=red)
    d.rounded_rectangle([cx - 52, 330, cx + 52, 700], radius=52, fill=red)
    # 目盛り
    for y in (210, 270, 330):
        d.rectangle([cx + 150, y - 10, cx + 250, y + 10], fill=white)
    return im
big = draw()
for n in (16, 32, 48, 128):
    big.resize((n, n), Image.LANCZOS).save(f"icons/icon{n}.png")
