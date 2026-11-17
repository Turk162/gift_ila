"""Prepara gli asset: legge assets_src/*.png e scrive assets/*.webp (+ anteprima.jpg).
Uso (dalla radice del progetto):  python3 -I tools/prepara_asset.py
Solo Pillow."""
from pathlib import Path
from PIL import Image
import numpy as np

RADICE = Path(__file__).resolve().parent.parent
SRC, DST = RADICE / "assets_src", RADICE / "assets"
DST.mkdir(exist_ok=True)
QUALITA = 82

# Misure sulla cassa ORIGINALE 1024x1024 (rilevate sui pixel: cornice d'oro e pedana)
NICCHIA = (337, 713, 690, 872)   # x0, y0, x1, y1 della cornice d'oro esterna
PEDANA = (512, 538)              # centro della faccia superiore della pedana (dove poggia la punta)


def apri(nome):
    p = SRC / (nome + ".png")
    return Image.open(p) if p.exists() else None


def riduci(im, lato):
    k = lato / max(im.size)
    return im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS) if k < 1 else im


def salva(im, nome):
    p = DST / (nome + ".webp")
    im.save(p, "WEBP", quality=QUALITA, method=6)
    print(f"{nome}.webp  {im.width}x{im.height}  {p.stat().st_size / 1024:.0f} KB")


def ritaglia(im):
    """Ritaglia i margini trasparenti; restituisce (immagine, bbox)."""
    bb = im.getchannel("A").getbbox()
    return im.crop(bb), bb


def pct(x, y, bb, dim):
    return f"{(x - bb[0]) / dim[0] * 100:.1f}%, {(y - bb[1]) / dim[1] * 100:.1f}%"


# sfondo e biglietto: nessun ritaglio
for nome, lato in (("sfondo", 1600), ("biglietto", 1200)):
    im = apri(nome)
    if im: salva(riduci(im.convert("RGB"), lato), nome)

# cassa
im = apri("cassa")
if im:
    im = im.convert("RGBA"); c, bb = ritaglia(im); salva(riduci(c, 1200), "cassa")
    d = (bb[2] - bb[0], bb[3] - bb[1])
    print("  cassa: nicchia (cornice) da", pct(NICCHIA[0], NICCHIA[1], bb, d), "a", pct(NICCHIA[2], NICCHIA[3], bb, d))
    print("  cassa: punta ballerina sulla pedana a", pct(*PEDANA, bb, d))

# ballerina
# fronte e retro (piroetta): stesso canvas e stessa scala, punta del piede allineata e al centro orizzontale
def punta(im, righe=10):
    """x del centro dei pixel opachi nelle ultime righe della figura; ritorna (x, y_basso, y_alto)."""
    a = np.array(im.getchannel("A")) > 128
    ys = np.where(a.any(1))[0]
    xs = np.where(a[ys.max() - righe + 1: ys.max() + 1].any(0))[0]
    return (xs.min() + xs.max() + 1) / 2, ys.max() + 1, ys.min()

fr, re = apri("ballerina"), apri("retro_ballerina")
if fr and re:
    fr, re = fr.convert("RGBA"), re.convert("RGBA")
    xf, bf, tf = punta(fr); xr, br, tr = punta(re)
    hf, hr = bf - tf, br - tr
    print(f"  ballerina: punta x={xf:.1f} y={bf}, altezza punta-testa {hf}px")
    print(f"  retro_ballerina: punta x={xr:.1f} y={br}, altezza punta-testa {hr}px (differenza {abs(hr / hf - 1) * 100:.1f}%)")
    if abs(hr / hf - 1) > 0.03:                      # scala diversa: il retro si riscala attorno alla punta
        k = hf / hr
        re = re.resize((round(re.width * k), round(re.height * k)), Image.LANCZOS)
        xr, br, tr = punta(re); print(f"  retro riscalato di x{k:.3f}")
    M = 400                                           # margine di lavoro per le traslazioni
    W, H = max(fr.width, re.width) + 2 * M, max(fr.height, re.height) + 2 * M
    def su_tela(im, x, b):                            # punta -> (W/2, M + bf)
        t = Image.new("RGBA", (W, H), (0, 0, 0, 0)); t.paste(im, (round(W / 2 - x), round(M + bf - b))); return t
    tf_, tr_ = su_tela(fr, xf, bf), su_tela(re, xr, br)
    bb = [tf_.getchannel("A").getbbox(), tr_.getchannel("A").getbbox()]
    x0, y0 = min(b[0] for b in bb), min(b[1] for b in bb)
    x1, y1 = max(b[2] for b in bb), max(b[3] for b in bb)
    mezza = max(W / 2 - x0, x1 - W / 2)               # riquadro simmetrico attorno alla punta
    box = (round(W / 2 - mezza), y0, round(W / 2 + mezza), y1)
    for nome, t in (("ballerina", tf_), ("retro_ballerina", tr_)):
        salva(riduci(t.crop(box), 1200), nome)
    print(f"  riquadro comune {box[2] - box[0]}x{box[3] - box[1]}; punta al centro (x 50%), y bordo basso")
elif fr:
    salva(riduci(ritaglia(fr.convert("RGBA"))[0], 1200), "ballerina")

# cassetto (facoltativo)
im = apri("cassetto")
if im: salva(riduci(ritaglia(im.convert("RGBA"))[0], 1200), "cassetto")
else: print("cassetto.png assente: saltato")

# manovella: solo ricentratura del disco sul centro del canvas (resta quadrata)
im = apri("manovella")
if im:
    im = im.convert("RGBA"); a = np.array(im.getchannel("A")) > 128
    larg = [(r, np.where(a[r])[0]) for r in range(a.shape[0]) if a[r].any()]
    r, xs = max(larg, key=lambda t: len(t[1]))
    raggio = (xs.max() - xs.min() + 1) / 2
    cx, cy = (xs.min() + xs.max() + 1) / 2, np.where(a.any(1))[0].max() + 1 - raggio
    dx, dy = round(im.width / 2 - cx), round(im.height / 2 - cy)
    print(f"  manovella: disco centro ({cx:.0f},{cy:.0f}) raggio {raggio:.0f} -> traslazione ({dx},{dy})")
    t = Image.new("RGBA", im.size, (0, 0, 0, 0)); t.paste(im, (dx, dy))
    salva(riduci(t, 640), "manovella")
    print(f"  manovella: diametro disco = {raggio * 2 / im.width * 100:.1f}% del lato")

# anteprima og:image (non collegata nell'HTML)
im = apri("riferimento")
if im:
    im = im.convert("RGB"); h = round(im.width * 630 / 1200); y0 = (im.height - h) // 2
    ant = im.crop((0, y0, im.width, y0 + h)).resize((1200, 630), Image.LANCZOS)
    ant.save(DST / "anteprima.jpg", quality=85, optimize=True)
    print(f"anteprima.jpg 1200x630  {(DST / 'anteprima.jpg').stat().st_size / 1024:.0f} KB")
