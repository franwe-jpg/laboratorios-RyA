"""Renders each transcript run (literal output of work/lab.sh) as a Kali-style terminal PNG.
Run: node dump_runs.js | python3 render_shots.py   (from tp/tp8)"""
import json, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

M = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT = ImageFont.truetype(M, 28); BAR = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
CJK = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 28)
BG, FG = (24, 24, 31), (222, 222, 222)
BLUE, WHITE, BARBG = (84, 140, 255), (255, 255, 255), (46, 46, 56)
COLS, PAD, BAR_H, LH = 92, 28, 56, 40
CW = FONT.getlength("M")

def prompt(d, y):
    x = PAD
    for txt, col, font in [("┌──(", BLUE, FONT), ("fsoler", BLUE, FONT), ("㉿", BLUE, CJK), ("kali", BLUE, FONT),
                           (")-[", BLUE, FONT), ("~/tp8", WHITE, FONT), ("]", BLUE, FONT)]:
        d.text((x, y), txt, font=font, fill=col); x += font.getlength(txt) if font is FONT else CW * 2
    d.text((PAD, y + LH), "└─", font=FONT, fill=BLUE); d.text((PAD + CW * 2, y + LH), "$", font=FONT, fill=BLUE)

def rows_for(run):
    rows, cont = [], False   # ("prompt"|"cmd"|"out", text)
    for l in run["command"].split("\n"):
        if not cont: rows.append(("prompt", ""))
        for j, w in enumerate(textwrap.wrap(l, COLS - 4, subsequent_indent="  ", drop_whitespace=False) or [""]):
            rows.append(("cmd" if not (cont or j) else "cont", w))
        cont = l.rstrip().endswith("\\")
    for l in run["output"].rstrip().split("\n"):
        for w in textwrap.wrap(l, COLS, subsequent_indent="    ", drop_whitespace=False) or [""]:
            rows.append(("out", w))
    return rows

for run in json.load(sys.stdin):
    rows = rows_for(run)
    n = sum(2 if k == "prompt" else (0 if k == "cmd" else 1) for k, _ in rows)
    # prompt = 2 lines, its command text sits on the 2nd line
    W = int(CW * COLS + PAD * 2); H = BAR_H + PAD * 2 + LH * n
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, BAR_H], fill=BARBG)
    d.text((W // 2, BAR_H // 2), "fsoler@kali: ~/tp8", font=BAR, fill=(200, 200, 200), anchor="mm")
    d.text((W - PAD - 150, BAR_H // 2), "–     □     ✕", font=BAR, fill=(200, 200, 200), anchor="lm")
    y = BAR_H + PAD
    for kind, text in rows:
        if kind == "prompt": prompt(d, y); y += LH   # command text goes on the └─$ line
        elif kind == "cmd": d.text((PAD + CW * 4, y), text, font=FONT, fill=WHITE); y += LH
        elif kind == "cont": d.text((PAD + CW * 4, y), text, font=FONT, fill=WHITE); y += LH
        else: d.text((PAD, y), text, font=FONT, fill=FG); y += LH
    img.save(f"assets/{run['name']}.png")
print("ok")
