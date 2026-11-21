"""Renders each shots/transcript.json session as a Kali-style terminal PNG.

Same look as the TP6-TP8 captures (fsoler user, Kali prompt and title bar);
the prompt shows the lab host the commands ran on (atacante, servidor,
honeypot). Text is the literal recorded output, only wrapped to the width.
Run from tp/tp5:  .venv/bin/python shots/render.py
"""

import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"

FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 28)
BAR = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
CJK = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 28)
BG, FG = (24, 24, 31), (222, 222, 222)
BLUE, WHITE, BARBG = (84, 140, 255), (255, 255, 255), (46, 46, 56)
COLS, PAD, BAR_H, LH = 92, 28, 56, 40
CW = FONT.getlength("M")


def prompt(d: ImageDraw.ImageDraw, y: int, host: str) -> None:
    x = PAD
    for txt, col, font in [("┌──(", BLUE, FONT), ("fsoler", BLUE, FONT), ("㉿", BLUE, CJK), (host, BLUE, FONT),
                           (")-[", BLUE, FONT), ("~", WHITE, FONT), ("]", BLUE, FONT)]:
        d.text((x, y), txt, font=font, fill=col)
        x += font.getlength(txt) if font is FONT else CW * 2
    d.text((PAD, y + LH), "└─", font=FONT, fill=BLUE)
    d.text((PAD + CW * 2, y + LH), "$", font=FONT, fill=BLUE)


def rows_for(session: dict) -> list[tuple[str, str]]:
    """("prompt", ""), then ("cmd"|"cont", text) for the command, ("out", text) for output."""
    rows = []
    for step in session["steps"]:
        rows.append(("prompt", ""))
        wrapped = textwrap.wrap(step["command"], COLS - 4, subsequent_indent="  ", drop_whitespace=False) or [""]
        rows += [("cmd" if i == 0 else "cont", w) for i, w in enumerate(wrapped)]
        for line in step["output"].split("\n") if step["output"] else []:
            line = line.replace("\t", "    ")
            rows += [("out", w) for w in textwrap.wrap(line, COLS, subsequent_indent="    ", drop_whitespace=False) or [""]]
    return rows


def render(session: dict) -> None:
    rows = rows_for(session)
    # the prompt takes two lines and its command sits on the second one
    lines = sum(1 for kind, _ in rows if kind != "cmd") + sum(1 for kind, _ in rows if kind == "prompt")
    width = int(CW * COLS + PAD * 2)
    img = Image.new("RGB", (width, BAR_H + PAD * 2 + LH * lines), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, width, BAR_H], fill=BARBG)
    d.text((width // 2, BAR_H // 2), f"fsoler@{session['host']}: ~", font=BAR, fill=(200, 200, 200), anchor="mm")
    d.text((width - PAD - 150, BAR_H // 2), "–     □     ✕", font=BAR, fill=(200, 200, 200), anchor="lm")
    y = BAR_H + PAD
    for kind, text in rows:
        if kind == "prompt":
            prompt(d, y, session["host"])
            y += LH  # the command is drawn on the └─$ line below
        elif kind in ("cmd", "cont"):
            d.text((PAD + CW * 4, y), text, font=FONT, fill=WHITE)
            y += LH
        else:
            d.text((PAD, y), text, font=FONT, fill=FG)
            y += LH
    img.save(OUT / f"{session['name']}.png")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    sessions = json.loads((ROOT / "shots" / "transcript.json").read_text())
    for s in sessions:
        render(s)
    print(f"rendered {len(sessions)} shots -> assets/")
