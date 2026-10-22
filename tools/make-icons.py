# 拡張のアイコン(斜めの電子体温計)を作る。python tools/make-icons.py で icons/ に 16/32/48/128 を書き出す
from PIL import Image, ImageDraw
S = 1024  # 大きく描いて縮める
def draw():
    bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=(29, 42, 53, 255))
    # 体温計を横向きに描いて、斜めに回す
    L = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)
    white, red, dark, metal = (240, 244, 247, 255), (233, 84, 62, 255), (29, 42, 53, 255), (170, 182, 192, 255)
    cy = S // 2
    d.rounded_rectangle([80, cy - 105, 760, cy + 105], radius=70, fill=white)          # 本体
    d.polygon([(740, cy - 62), (960, cy - 18), (960, cy + 18), (740, cy + 62)], fill=metal)  # 先(細い金属)
    d.rounded_rectangle([170, cy - 62, 520, cy + 62], radius=24, fill=dark)             # 表示窓
    d.rounded_rectangle([190, cy - 42, 340, cy + 42], radius=14, fill=red)              # 表示(赤)
    d.ellipse([590, cy - 40, 670, cy + 40], fill=red)                                   # ボタン
    L = L.rotate(45, resample=Image.BICUBIC, center=(S // 2, S // 2))
    bg.alpha_composite(L)
    return bg
big = draw()
for n in (16, 32, 48, 128):
    big.resize((n, n), Image.LANCZOS).save(f"icons/icon{n}.png")
