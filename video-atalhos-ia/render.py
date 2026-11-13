#!/usr/bin/env python3
"""Motion vertical 9:16 (1080x1920) — "Atalhos de IA" (Notebook -> Perplexity -> Napkin).

Cada quadro e uma funcao pura do tempo t, desenhada com skia, e o video e
sincronizado com assets/narracao.mp3 (timings vindos da transcricao por frase).

Uso:
  python3 render.py --frames 0.5,4.2,...  -> PNGs de checagem em out/check/
  python3 render.py                       -> out/atalhos-de-ia-9x16.mp4 (+ versao sem audio)
"""
import argparse, math, os, subprocess, sys
from multiprocessing import Pool
import numpy as np
import skia

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, "assets")
OUT = os.path.join(HERE, "out")
AUDIO = os.path.join(A, "narracao.mp3")

W, H, FPS = 1080, 1920, 30
DUR = float(subprocess.check_output(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", AUDIO]).decode())
NFRAMES = int(round(DUR * FPS))

# ---------------------------------------------------------------- paleta
def C(hexs, a=1.0):
    hexs = hexs.lstrip("#")
    r, g, b = int(hexs[0:2], 16), int(hexs[2:4], 16), int(hexs[4:6], 16)
    return skia.Color(r, g, b, int(max(0, min(1, a)) * 255))

BG, SURF, BORDER = "#121417", "#1C1F24", "#2A2F37"
LIME, BLUE, WHITE, MUTED, ORANGE = "#C8F54A", "#4DA3FF", "#F4F6F8", "#8B929C", "#FF9F45"
IMG_BG = "#101215"

FONTDIR = "/usr/share/fonts/opentype/inter/"
TF = {w: skia.Typeface.MakeFromFile(FONTDIR + f"Inter-{w}.otf")
      for w in ["Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"]}

def font(w, size):
    f = skia.Font(TF[w], size)
    f.setSubpixel(True)
    f.setEdging(skia.Font.Edging.kAntiAlias)
    return f

IMGS = {}
def img(name):
    if name not in IMGS:
        files = {
            "agenda": "01-agenda-sexta-lotada.png", "upload": "02-notebooklm-upload-e-prompt.png",
            "resumo": "03-notebooklm-resumo.png", "studio": "04-notebooklm-studio-audio.png",
            "perplex": "05-perplexity-busca-e-fontes.png", "napkin": "06-napkin-fluxograma.png",
            "kit": "07-kit-notion-fluxos-prontos.png", "cta": "08-cta-link-bio.png"}
        im = skia.Image.MakeFromEncoded(skia.Data.MakeFromFileName(os.path.join(A, files[name])))
        IMGS[name] = im.withDefaultMipmaps()
    return IMGS[name]

SAMP = skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kLinear)

# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def lerp(a, b, t): return a + (b - a) * t
def prog(t, t0, t1): return clamp((t - t0) / (t1 - t0)) if t1 > t0 else float(t >= t0)
def e_out(x): return 1 - (1 - x) ** 3
def e_io(x): return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2
def e_sine(x): return -(math.cos(math.pi * x) - 1) / 2
def e_back(x, s=1.9): x -= 1; return 1 + (s + 1) * x ** 3 + s * x ** 2

def fade(t, t0, t1, fin=0.18, fout=0.14):
    return min(prog(t, t0, t0 + fin), 1 - prog(t, t1 - fout, t1))

# ---------------------------------------------------------------- layout
VX, VY, VW, VH = 36, 300, 1008, 1060          # janela da imagem
CAP_X, CAP_Y, CAP_W = 64, 1468, 860             # legenda (terco inferior, fora do trilho direito do TikTok)

# ================================================================ ROTEIRO
# Tempos (s) a partir da transcricao da narracao (inicio/fim de cada frase).
# Camera: lista de (t, cx, cy, w) em px da imagem 1440x900; w = largura visivel.
SHOTS = [
    # ---------- CENA 1 · GANCHO ------------------------------------------
    dict(t0=0.00, t1=2.05, img="agenda", cam=[(0.0, 880, 470, 760), (2.05, 895, 470, 640)],
         fx=[("hl", 0.20, 2.05, (812, 272, 983, 368), dict(color=ORANGE, spot=False)),
             ("hl", 0.85, 2.05, (812, 376, 983, 420), dict(color=ORANGE, spot=False)),
             ("hl", 1.45, 2.05, (812, 480, 983, 628), dict(color=ORANGE, spot=False))]),
    dict(t0=2.05, t1=5.65, img="agenda", cam=[(2.05, 897, 470, 420), (5.65, 897, 470, 360)],
         fx=[("hl", 2.15, 5.65, (808, 182, 987, 736), dict(spot=True, label="sexta inteira, comida", side="top"))]),
    # ---------- CENA 2 · GEMINI NOTEBOOK ---------------------------------
    dict(t0=6.92, t1=8.57, img="upload", cam=[(6.92, 380, 330, 760), (8.57, 340, 300, 660)],
         fx=[("hl", 7.05, 8.57, (16, 92, 265, 142), dict(spot=True))]),
    dict(t0=8.57, t1=11.73, img="upload", cam=[(8.57, 175, 150, 420), (11.73, 160, 145, 360)],
         fx=[("hl", 9.70, 11.73, (18, 120, 160, 144), dict(spot=True, label="antes: NotebookLM", side="bottom"))]),
    dict(t0=11.73, t1=13.92, img="upload", cam=[(11.73, 420, 120, 620), (13.92, 400, 110, 540)],
         fx=[("cursor", [(11.73, 640, 300), (12.35, 330, 33), (13.92, 335, 36)], [12.45]),
             ("hl", 12.45, 13.92, (188, 18, 492, 46), dict(spot=True))]),
    dict(t0=13.92, t1=15.44, img="upload", cam=[(13.92, 330, 300, 640), (15.44, 300, 300, 580)],
         fx=[("hl", 14.05, 15.44, (16, 262, 265, 323), dict(spot=False)),
             ("hl", 14.35, 15.44, (680, 238, 1032, 280), dict(spot=False, label="Relatorio_Vendas_Q3.pdf", side="top", nolabelwrap=True))]),
    dict(t0=15.44, t1=18.14, img="upload", cam=[(15.44, 856, 285, 640), (18.14, 856, 290, 560)],
         fx=[("hl", 15.55, 18.14, (655, 284, 1056, 312), dict(color=ORANGE, spot=True, label="NUNCA documento confidencial", side="bottom", labelcolor=ORANGE))]),
    dict(t0=18.14, t1=21.00, img="upload", cam=[(18.14, 700, 470, 760), (21.00, 760, 480, 700)],
         fx=[("type", 19.05, 20.75, (340, 432, 1046, 474), "#23272e"),
             ("cursor", [(18.14, 900, 640), (20.55, 1290, 553), (21.0, 1292, 556)], [20.70]),
             ("hl", 20.70, 21.0, (1220, 532, 1369, 573), dict(spot=False))]),
    dict(t0=21.00, t1=22.92, img="resumo", cam=[(21.00, 620, 400, 720), (22.92, 600, 400, 640)],
         fx=[("hl", 21.05, 22.92, (342, 262, 836, 432), dict(color=BLUE, spot=True, label="5 decisões", side="top", labelcolor=BLUE)),
             ("hl", 21.95, 22.92, (342, 444, 888, 528), dict(color=ORANGE, spot=False, label="riscos", side="bottom", labelcolor=ORANGE))]),
    dict(t0=22.92, t1=25.63, img="resumo", cam=[(22.92, 470, 300, 720), (25.63, 430, 290, 640)],
         fx=[("hl", 23.25, 25.63, (16, 186, 265, 247), dict(spot=True, label="só com esta fonte", side="bottom"))]),
    dict(t0=25.63, t1=28.37, img="studio", cam=[(25.63, 1000, 400, 760), (28.37, 1080, 380, 640)],
         fx=[("hl", 25.70, 28.37, (40, 92, 140, 130), dict(spot=False)),
             ("hl", 26.85, 28.37, (932, 282, 1361, 362), dict(spot=True, label="Audio Overview", side="bottom"))]),
    dict(t0=28.37, t1=32.15, img="studio", cam=[(28.37, 440, 460, 760), (32.15, 430, 460, 660)],
         fx=[("cursor", [(28.37, 560, 700), (28.95, 122, 566), (32.15, 124, 568)], [29.05]),
             ("playhead", 29.05, 32.15, 336, 470, 396, 506),
             ("hl", 29.20, 32.15, (86, 392, 796, 512), dict(spot=False)),
             ("hl", 30.55, 32.15, (84, 316, 376, 344), dict(spot=False))]),
    # ---------- CENA 3 · PERPLEXITY --------------------------------------
    dict(t0=32.95, t1=35.58, img="perplex", cam=[(32.95, 330, 120, 640), (35.58, 300, 110, 560)],
         fx=[("hl", 34.0, 35.58, (188, 18, 300, 46), dict(spot=True, label="perplexity.ai", side="bottom"))]),
    dict(t0=35.58, t1=39.18, img="perplex", cam=[(35.58, 520, 380, 820), (39.18, 470, 360, 700)],
         fx=[("hl", 35.75, 39.18, (40, 262, 742, 380), dict(spot=True, color=BLUE))]),
    dict(t0=39.18, t1=43.16, img="perplex", cam=[(39.18, 520, 230, 760), (43.16, 480, 210, 660)],
         fx=[("type", 39.25, 42.65, (68, 160, 690, 196), "#23272e"),
             ("hl", 39.25, 43.16, (48, 143, 1393, 212), dict(spot=True, color=BLUE, label="com fonte?", side="bottom", labelcolor=BLUE))]),
    dict(t0=43.16, t1=46.15, img="perplex", cam=[(43.16, 440, 520, 800), (46.15, 470, 500, 700)],
         fx=[("hl", 43.25, 46.15, (40, 396, 829, 632), dict(spot=True, label="link na resposta", side="top")),
             ("cursor", [(43.16, 300, 760), (45.10, 760, 462), (46.15, 762, 464)], [45.30])]),
    dict(t0=46.15, t1=49.27, img="perplex", cam=[(46.15, 1060, 420, 700), (49.27, 1100, 410, 600)],
         fx=[("hl", 46.25, 49.27, (860, 320, 1393, 502), dict(spot=True, label="dado conferido", side="bottom")),
             ("check", 46.45, (1150, 362))]),
    dict(t0=49.27, t1=52.60, img="perplex", cam=[(49.27, 380, 330, 760), (52.60, 360, 320, 660)],
         fx=[("hl", 49.40, 52.60, (196, 238, 292, 258), dict(spot=False)),
             ("badge", 49.55, 52.60, "plano grátis já resolve.", (VX + VW - 40, VY + VH - 70), "right")]),
    # ---------- CENA 4 · NAPKIN + KIT ------------------------------------
    dict(t0=53.70, t1=56.71, img="napkin", cam=[(53.70, 300, 130, 640), (56.71, 280, 120, 560)],
         fx=[("hl", 54.95, 56.71, (188, 18, 275, 46), dict(spot=True, label="napkin.ai", side="bottom"))]),
    dict(t0=56.71, t1=59.35, img="napkin", cam=[(56.71, 270, 470, 640), (59.35, 265, 455, 580)],
         fx=[("paste", 56.85, 58.4, [(72, 242, 457, 294), (72, 304, 457, 356), (72, 366, 457, 418), (72, 428, 457, 480),
                                      (72, 490, 457, 542), (72, 552, 457, 604), (72, 614, 457, 666)], "#1c1f25"),
             ("cursor", [(56.71, 520, 720), (57.3, 300, 690), (59.35, 310, 700)], [57.4])]),
    dict(t0=59.35, t1=62.54, img="napkin", cam=[(59.35, 850, 440, 740), (62.54, 850, 440, 680)],
         fx=[("flow", 59.45)]),
    dict(t0=62.54, t1=66.10, img="napkin", cam=[(62.54, 300, 125, 620), (66.10, 262, 125, 540)],
         fx=[("hl", 62.70, 66.10, (44, 126, 504, 148), dict(spot=True)),
             ("badge", 64.39, 66.10, "500 créditos / semana.", (VX + 56, VY + VH - 70), "left")]),
    dict(t0=66.10, t1=68.55, img="kit", cam=[(66.10, 560, 300, 820), (68.55, 560, 300, 720)],
         fx=[("cursor", [(66.10, 400, 700), (66.75, 752, 182), (68.55, 755, 185)], [66.85]),
             ("hl", 66.85, 68.55, (685, 158, 819, 202), dict(spot=False)),
             ("hl", 67.20, 68.55, (48, 232, 468, 410), dict(spot=True, label="reunião em 3 passos", side="bottom"))]),
    dict(t0=68.55, t1=70.98, img="kit", cam=[(68.55, 700, 330, 640), (70.98, 700, 330, 560)],
         fx=[("hl", 68.65, 70.98, (500, 250, 905, 405), dict(spot=True, label="copiar e colar", side="bottom", copyicon=True))]),
]

CHAPTERS = [  # (t0, t1, numero, nome, sub)
    (5.80, 6.92, "01", "Gemini Notebook", "ferramenta 1 de 3"),
    (32.12, 32.95, "02", "Perplexity", "ferramenta 2 de 3"),
    (52.70, 53.70, "03", "Napkin AI", "ferramenta 3 de 3"),
]
WIPES = [5.80, 32.12, 52.70]          # instante da troca (meio da passagem verde-limao)

CTA_T0 = 70.98

# Legendas: (t_in, t_out, [(palavra, t_aparece, cor|None)], estilo)
def words(t0, spec):
    """spec: lista de (texto, atraso, cor)"""
    return [(w, t0 + d, c) for (w, d, c) in spec]

CAPTIONS = [
    (0.10, 2.05, [("Relatório.", 0.18, LIME), ("Pesquisa.", 0.85, LIME), ("\n", 0, None), ("Slide.", 1.45, LIME)], "cap"),
    (2.05, 3.80, [("comendo", 2.07, None), ("a", 2.15, None), ("sua", 2.2, None), ("\n", 0, None), ("tarde?", 2.45, LIME)], "cap"),
    (3.97, 5.70, [("modo", 3.99, None), ("difícil.", 4.35, LIME)], "big"),
    (6.98, 8.57, [("Gemini", 7.0, None), ("Notebook", 7.25, LIME)], "big"),
    (8.62, 11.70, [("o", 8.65, None), ("antigo", 8.75, None), ("NotebookLM", 9.7, LIME)], "cap"),
    (11.78, 13.90, [("notebook.google", 12.3, LIME)], "cap"),
    (13.95, 15.42, [("sobe", 13.96, None), ("um", 14.1, None), ("PDF", 14.3, LIME), ("seu", 14.65, None)], "cap"),
    (15.47, 18.10, [("nada", 15.5, ORANGE), ("confidencial", 16.2, ORANGE), ("\n", 0, None), ("da", 17.0, None), ("empresa", 17.1, None)], "cap"),
    (18.17, 19.00, [("e", 18.18, None), ("pergunta:", 18.25, None)], "cap"),
    (19.05, 22.88, [("resumo", 19.5, None), ("·", 20.9, MUTED), ("5", 21.0, BLUE), ("decisões", 21.05, BLUE),
                    ("·", 21.8, MUTED), ("riscos", 21.95, ORANGE)], "cap"),
    (22.95, 25.60, [("só", 23.0, None), ("com", 23.1, None), ("base", 23.25, None), ("\n", 0, None),
                    ("no", 24.4, None), ("seu", 24.5, LIME), ("PDF", 24.6, LIME)], "cap"),
    (25.66, 28.33, [("Studio", 25.95, None), ("→", 26.6, MUTED), ("Audio", 26.85, LIME), ("Overview", 27.1, LIME)], "cap"),
    (28.40, 30.55, [("um", 28.45, None), ("podcast", 28.6, LIME), ("\n", 0, None), ("do", 29.3, None), ("seu", 29.4, None), ("relatório", 29.55, None)], "cap"),
    (30.62, 32.05, [("pra", 30.63, None), ("ouvir", 30.75, None), ("no", 31.0, None), ("caminho", 31.1, LIME)], "cap"),
    (32.98, 35.55, [("Perplexity,", 33.0, None), ("\n", 0, None), ("com", 33.35, None), ("fonte.", 33.5, BLUE)], "big"),
    (35.62, 39.15, [("nada", 36.1, None), ("de", 36.25, None), ("número", 36.8, None), ("\n", 0, None), ("inventado", 37.2, ORANGE)], "cap"),
    (39.21, 43.13, [("tendências", 39.9, None), ("2026,", 40.9, None), ("\n", 0, None), ("com", 42.0, BLUE), ("fonte?", 42.2, BLUE)], "cap"),
    (43.19, 46.12, [("a", 43.2, None), ("resposta", 43.3, None), ("\n", 0, None), ("já", 43.9, None), ("vem", 44.0, None), ("com", 44.1, None), ("link", 44.3, LIME)], "cap"),
    (46.18, 49.24, [("abre", 46.2, None), ("·", 46.25, MUTED), ("confere", 46.3, LIME), ("\n", 0, None),
                    ("só", 47.1, None), ("então", 47.25, None), ("cola", 47.55, None)], "cap"),
    (49.30, 52.55, [("busca", 50.1, None), ("básica", 50.4, None), ("\n", 0, None), ("pro", 51.1, None), ("dia", 51.3, None), ("a", 51.45, None), ("dia", 51.55, LIME)], "cap"),
    (53.73, 54.92, [("Napkin", 53.75, None), ("AI", 54.0, LIME)], "big"),
    (54.97, 56.68, [("napkin.ai", 55.1, LIME)], "cap"),
    (56.74, 59.32, [("cola", 56.95, None), ("os", 57.1, None), ("tópicos", 57.2, LIME), ("\n", 0, None), ("do", 57.7, None), ("resumo", 57.8, None)], "cap"),
    (59.38, 62.50, [("vira", 59.4, None), ("fluxograma", 59.6, LIME), ("\n", 0, None), ("pra", 61.3, None), ("reunião", 61.45, None)], "cap"),
    (62.57, 66.07, [("grátis", 62.6, None), ("de", 63.0, None), ("verdade", 63.15, LIME)], "cap"),
    (66.13, 68.52, [("passo", 66.9, None), ("a", 67.05, None), ("passo", 67.15, None), ("\n", 0, None), ("organizado", 67.5, LIME)], "cap"),
    (68.58, 70.95, [("prompt", 68.6, None), ("pronto", 69.3, None), ("\n", 0, None), ("pra", 69.9, None), ("copiar", 70.0, LIME)], "cap"),
]

HEADERS = [  # (t0, t1, numero|None, nome)
    (0.0, 5.80, None, "Atalhos de IA"),
    (6.92, 32.12, "01", "Gemini Notebook"),
    (32.95, 52.70, "02", "Perplexity"),
    (53.70, 66.10, "03", "Napkin AI"),
    (66.10, CTA_T0, "✓", "Passo a passo"),
]

# ================================================================ DESENHO
def paint(color, a=None, stroke=None, aa=True):
    p = skia.Paint(AntiAlias=aa)
    col = C(color, 1 if a is None else a) if isinstance(color, str) else color
    p.setColor(col)
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style)
        p.setStrokeWidth(stroke)
        p.setStrokeCap(skia.Paint.kRound_Cap)
        p.setStrokeJoin(skia.Paint.kRound_Join)
    return p

def draw_bg(cv, t):
    cv.clear(C(BG))
    # brilhos lentos (micro-movimento continuo)
    for (cx, cy, r, col, a, sp, ph) in [(250, 520, 760, LIME, 0.055, 0.11, 0.0),
                                        (860, 1500, 820, BLUE, 0.07, 0.09, 2.0),
                                        (700, 220, 520, BLUE, 0.04, 0.13, 4.0)]:
        x = cx + 90 * math.sin(t * sp + ph)
        y = cy + 70 * math.cos(t * sp * 1.3 + ph)
        sh = skia.GradientShader.MakeRadial((x, y), r, [C(col, a), C(col, 0)])
        p = skia.Paint(Shader=sh)
        cv.drawRect(skia.Rect(0, 0, W, H), p)
    # grade de pontos deslizando devagar
    off = (t * 6) % 48
    p = paint("#FFFFFF", 0.045)
    pts = []
    for yy in range(-48, H + 48, 48):
        for xx in range(0, W + 48, 48):
            pts.append(skia.Point(xx - off * 0.5, yy + off))
    p.setStrokeWidth(2.4); p.setStrokeCap(skia.Paint.kRound_Cap)
    cv.drawPoints(skia.Canvas.kPoints_PointMode, pts, p)

class Cam:
    def __init__(self, cx, cy, w):
        self.s = VW / w; self.cx, self.cy = cx, cy
    def pt(self, x, y):
        return (VX + VW / 2 + (x - self.cx) * self.s, VY + VH / 2 + (y - self.cy) * self.s)
    def rect(self, r, pad=0):
        x0, y0 = self.pt(r[0], r[1]); x1, y1 = self.pt(r[2], r[3])
        return skia.Rect(x0 - pad, y0 - pad, x1 + pad, y1 + pad)

def cam_at(shot, t):
    ks = shot["cam"]
    if t <= ks[0][0]: k = ks[0][1:]
    elif t >= ks[-1][0]: k = ks[-1][1:]
    else:
        for a, b in zip(ks, ks[1:]):
            if a[0] <= t <= b[0]:
                u = e_sine(prog(t, a[0], b[0]))
                k = tuple(lerp(a[i], b[i], u) for i in (1, 2, 3)); break
    cx, cy, w = k
    w *= 0.86  # mais perto: leitura no celular
    # "punch" no corte seco: entra 4% mais perto e assenta
    w *= 1 - 0.045 * (1 - e_out(prog(t, shot["t0"], shot["t0"] + 0.32)))
    # mantem dentro da imagem quando possivel
    vh = w * VH / VW
    if w <= 1440: cx = clamp(cx, w / 2, 1440 - w / 2)
    if vh <= 900: cy = clamp(cy, vh / 2, 900 - vh / 2)
    return Cam(cx, cy, w)

VIEW_RR = skia.RRect.MakeRectXY(skia.Rect(VX, VY, VX + VW, VY + VH), 34, 34)

def draw_view_frame(cv, a=1.0):
    sh = paint("#000000", 0.45 * a)
    sh.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 26))
    cv.drawRRect(VIEW_RR.makeOffset(0, 18), sh)
    cv.drawRRect(VIEW_RR, paint(IMG_BG, a))

def draw_view_border(cv):
    cv.drawRRect(VIEW_RR, paint(BORDER, 1, stroke=2))

def rrect(r, rad): return skia.RRect.MakeRectXY(r, rad, rad)

def draw_label(cv, text, cx, y_anchor, side, color=LIME, a=1.0, sc=1.0, icon=False):
    f = font("Bold", 38)
    tw = f.measureText(text)
    padx, h = 26, 64
    iw = 44 if icon else 0
    w = tw + 2 * padx + iw
    x0 = clamp(cx - w / 2, VX + 18, VX + VW - 18 - w)
    y0 = y_anchor - h - 16 if side == "top" else y_anchor + 16
    y0 = clamp(y0, VY + 16, VY + VH - h - 16)
    cv.save()
    pcx, pcy = x0 + w / 2, y0 + h / 2
    cv.translate(pcx, pcy); cv.scale(sc, sc); cv.translate(-pcx, -pcy)
    r = skia.Rect(x0, y0, x0 + w, y0 + h)
    gl = paint(color, 0.35 * a); gl.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 14))
    cv.drawRRect(rrect(r, h / 2), gl)
    cv.drawRRect(rrect(r, h / 2), paint(color, a))
    tx = x0 + padx
    if icon:  # icone "copiar" (dois quadrados)
        p = paint(BG, a, stroke=4)
        cv.drawRRect(rrect(skia.Rect(tx + 8, y0 + 16, tx + 28, y0 + 38), 4), p)
        cv.drawRRect(rrect(skia.Rect(tx, y0 + 24, tx + 20, y0 + 46), 4), paint(color, a))
        cv.drawRRect(rrect(skia.Rect(tx, y0 + 24, tx + 20, y0 + 46), 4), p)
        tx += iw
    cv.drawString(text, tx, y0 + h / 2 + 13, f, paint(BG, a))
    cv.restore()

def fx_highlight(cv, cam, t, t_in, t_out, r, o):
    a = fade(t, t_in, t_out + 0.001, 0.22, 0.0)
    if a <= 0: return
    u = e_out(prog(t, t_in, t_in + 0.32))
    col = o.get("color", LIME)
    sr = cam.rect(r, pad=10)
    grow = (1 - u) * 26
    sr = skia.Rect(sr.left() - grow, sr.top() - grow, sr.right() + grow, sr.bottom() + grow)
    if o.get("spot"):
        path = skia.Path()
        path.addRRect(VIEW_RR)
        path.addRRect(rrect(sr, 16))
        path.setFillType(skia.PathFillType.kEvenOdd)
        cv.drawPath(path, paint("#05070A", 0.58 * a))
    pulse = 0.5 + 0.5 * math.sin((t - t_in) * 5.5)
    gl = paint(col, (0.35 + 0.25 * pulse) * a, stroke=12)
    gl.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 10))
    cv.drawRRect(rrect(sr, 16), gl)
    cv.drawRRect(rrect(sr, 16), paint(col, a, stroke=5))
    if o.get("label"):
        la = fade(t, t_in + 0.12, t_out + 0.001, 0.2, 0.0)
        sc = e_back(prog(t, t_in + 0.12, t_in + 0.42)) if t < t_in + 0.42 else 1.0
        side = o.get("side", "top")
        anchor = sr.top() if side == "top" else sr.bottom()
        draw_label(cv, o["label"], sr.centerX(), anchor, side, o.get("labelcolor", col), la, max(0.01, sc),
                   icon=o.get("copyicon", False))

CURSOR = [(0, 0), (0, 36), (9, 27.5), (15.5, 42), (22, 39), (15.8, 25.5), (28, 25.5)]
def draw_cursor(cv, x, y, sc=1.0, a=1.0):
    path = skia.Path()
    k = 1.75 * sc
    path.moveTo(x + CURSOR[0][0] * k, y + CURSOR[0][1] * k)
    for px, py in CURSOR[1:]: path.lineTo(x + px * k, y + py * k)
    path.close()
    sh = paint("#000000", 0.5 * a); sh.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 6))
    cv.save(); cv.translate(4, 6); cv.drawPath(path, sh); cv.restore()
    cv.drawPath(path, paint(LIME, a))
    cv.drawPath(path, paint(BG, a, stroke=3.5))

def fx_cursor(cv, cam, t, keys, clicks, late):
    # keys: (t, x, y) em px da imagem
    if t <= keys[0][0]: x, y = keys[0][1:]
    elif t >= keys[-1][0]: x, y = keys[-1][1:]
    else:
        for a, b in zip(keys, keys[1:]):
            if a[0] <= t <= b[0]:
                u = e_io(prog(t, a[0], b[0]))
                x, y = lerp(a[1], b[1], u), lerp(a[2], b[2], u); break
    # deriva sutil para nunca ficar parado
    x += 2.5 * math.sin(t * 2.1); y += 2.0 * math.cos(t * 1.7)
    sx, sy = cam.pt(x, y)
    if not late:
        return (sx, sy)
    sc = 1.0
    for c in clicks:
        if c - 0.02 <= t <= c + 0.55:
            k = prog(t, c, c + 0.5)
            for i, dl in enumerate((0, 0.12)):
                kk = prog(t, c + dl, c + dl + 0.5)
                if kk > 0:
                    rr = 14 + 70 * e_out(kk)
                    cv.drawCircle(sx, sy, rr, paint(LIME, (1 - kk) * 0.9, stroke=5 - 2 * i))
            if t < c + 0.14:
                sc = 0.84
    draw_cursor(cv, sx, sy, sc)

def fx_type(cv, cam, t, t0, t1, r, bg):
    f = e_io(prog(t, t0, t1)) if t1 > t0 else 1
    if f >= 1: return
    x0 = lerp(r[0], r[2], f)
    cover = cam.rect((x0, r[1], r[2], r[3]))
    cv.drawRect(cover, paint(bg))
    if (t * 2.2) % 1 < 0.6 or (t0 < t < t1):
        cx, _ = cam.pt(x0, 0)
        _, cy0 = cam.pt(0, r[1] + 6); _, cy1 = cam.pt(0, r[3] - 6)
        cv.drawRect(skia.Rect(cx + 2, cy0, cx + 6, cy1), paint(LIME))

def fx_paste(cv, cam, t, t0, t1, rows, bg):
    n = len(rows)
    for i, r in enumerate(rows):
        ti = lerp(t0, t1, i / max(1, n - 1))
        u = prog(t, ti, ti + 0.28)
        if u >= 1: continue
        sr = cam.rect(r, pad=2)
        cv.drawRect(sr, paint(bg))
        if u > 0:  # entra deslizando
            src = skia.Rect(*r)
            dy = (1 - e_out(u)) * 30
            dst = cam.rect(r)
            dst.offset(0, dy)
            p = skia.Paint(); p.setAlphaf(e_out(u))
            cv.drawImageRect(img("napkin"), src, dst, SAMP, p)
    # marca o item que acabou de entrar
    for i, r in enumerate(rows):
        ti = lerp(t0, t1, i / max(1, n - 1))
        k = prog(t, ti, ti + 0.6)
        if 0 < k < 1:
            sr = cam.rect(r, pad=4)
            cv.drawRRect(rrect(sr, 12), paint(LIME, (1 - k) * 0.9, stroke=4))

# --- fluxograma do Napkin -----------------------------------------------------
NODES = [(536, 268, 724, 386), (756, 268, 944, 386), (976, 268, 1164, 386), (756, 488, 944, 606)]
LINES = [  # (ta, pontos)
    (0.30, [(724, 322), (756, 322)]),
    (0.80, [(944, 322), (976, 322)]),
    (1.25, [(620, 386), (620, 522), (756, 522)]),
    (1.25, [(1070, 386), (1070, 522), (944, 522)]),
]
NODE_T = [0.0, 0.50, 1.00, 1.85]
LINE_COVERS = [(722, 316, 758, 328), (942, 316, 978, 328), (614, 384, 626, 528), (614, 516, 758, 528),
               (1064, 384, 1076, 528), (942, 516, 1076, 528)]

def poly_partial(pts, u):
    segs = [math.dist(a, b) for a, b in zip(pts, pts[1:])]
    L = sum(segs) * u
    out = [pts[0]]
    for (a, b), s in zip(zip(pts, pts[1:]), segs):
        if L >= s: out.append(b); L -= s
        else:
            k = L / s if s else 0
            out.append((lerp(a[0], b[0], k), lerp(a[1], b[1], k))); break
    return out

def fx_flow(cv, cam, t, t0):
    lt = t - t0
    for r in NODES: cv.drawRect(cam.rect(r, pad=2), paint("#1c1f25"))
    for r in LINE_COVERS: cv.drawRect(cam.rect(r), paint("#1c1f25"))
    # linhas desenhando
    for ta, pts in LINES:
        u = e_io(prog(lt, ta, ta + 0.5))
        if u <= 0: continue
        pp = poly_partial(pts, u)
        path = skia.Path(); path.moveTo(*cam.pt(*pp[0]))
        for q in pp[1:]: path.lineTo(*cam.pt(*q))
        cv.drawPath(path, paint("#9aa0a8", 1, stroke=3 * cam.s))
        # pulso verde-limao percorrendo o fluxo depois de desenhado
        if u >= 1:
            k = ((lt - ta - 0.5) * 0.9) % 1
            q = poly_partial(pts, k)[-1]
            sx, sy = cam.pt(*q)
            g = paint(LIME, 0.9); g.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 6))
            cv.drawCircle(sx, sy, 9, g); cv.drawCircle(sx, sy, 6, paint(LIME))
    # nos surgindo
    for i, (r, tn) in enumerate(zip(NODES, NODE_T)):
        u = prog(lt, tn, tn + 0.42)
        if u <= 0: continue
        sc = e_back(u, 2.4) if u < 1 else 1.0
        dst = cam.rect(r)
        cx, cy = dst.centerX(), dst.centerY()
        cv.save(); cv.translate(cx, cy); cv.scale(sc, sc); cv.translate(-cx, -cy)
        p = skia.Paint(); p.setAlphaf(min(1, u * 2))
        cv.drawImageRect(img("napkin"), skia.Rect(*r), dst, SAMP, p)
        cv.restore()
        if i == 3 and u >= 1:  # "Reuniao pronta" pulsando
            k = 0.5 + 0.5 * math.sin((lt - tn) * 6)
            gl = paint(LIME, 0.25 + 0.35 * k, stroke=14)
            gl.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 14))
            cv.drawRRect(rrect(cam.rect((760, 492, 940, 602), pad=4), 18), gl)

def fx_playhead(cv, cam, t, t0, t1, x0, x1, y0, y1):
    if t < t0: return
    x = lerp(x0, x1, prog(t, t0, t1))
    # barras ja "tocadas" ganham tinta verde-limao (multiplica o cinza)
    srct = (x0, y0, x, y1); src = skia.Rect(*srct)
    if x > x0 + 1:
        p = skia.Paint()
        p.setColorFilter(skia.ColorFilters.Matrix([
            0, 0, 0, 0, 0xC8 / 255, 0, 0, 0, 0, 0xF5 / 255, 0, 0, 0, 0, 0x4A / 255,
            3.4, 0, 0, 0, -0.85]))
        cv.drawRect(cam.rect(srct), paint("#1c1f25"))
        cv.drawImageRect(img("studio"), src, cam.rect(srct), SAMP, p)
    sx, sy0 = cam.pt(x, y0 - 6); _, sy1 = cam.pt(x, y1 + 6)
    g = paint(WHITE, 0.9); g.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 4))
    cv.drawRect(skia.Rect(sx - 2, sy0, sx + 2, sy1), g)
    cv.drawCircle(sx, sy0, 7, paint(WHITE))

def fx_check(cv, cam, t, t0, pos):
    u = prog(t, t0, t0 + 0.45)
    if u <= 0: return
    sx, sy = cam.pt(*pos)
    sc = e_back(prog(t, t0, t0 + 0.3)) if t < t0 + 0.3 else 1
    r = 34 * sc
    cv.drawCircle(sx, sy, r, paint(LIME))
    pts = [(-14, 1), (-4, 11), (15, -10)]
    pp = poly_partial(pts, e_out(prog(t, t0 + 0.15, t0 + 0.45)))
    path = skia.Path(); path.moveTo(sx + pp[0][0], sy + pp[0][1])
    for q in pp[1:]: path.lineTo(sx + q[0], sy + q[1])
    cv.drawPath(path, paint(BG, 1, stroke=7))

def fx_badge(cv, t, t0, t1, text, pos, align):
    a = fade(t, t0, t1 + 0.001, 0.15, 0.0)
    if a <= 0: return
    sc = e_back(prog(t, t0, t0 + 0.38), 2.2) if t < t0 + 0.38 else 1 + 0.025 * math.sin((t - t0) * 4.5)
    f = font("ExtraBold", 50)
    tw = f.measureText(text)
    w, h = tw + 64, 92
    x0 = pos[0] - w if align == "right" else pos[0]
    y0 = pos[1] - h
    cx, cy = x0 + w / 2, y0 + h / 2
    cv.save(); cv.translate(cx, cy); cv.rotate(-3 + 0.6 * math.sin(t * 1.6)); cv.scale(sc, sc); cv.translate(-cx, -cy)
    r = skia.Rect(x0, y0, x0 + w, y0 + h)
    sh = paint("#000000", 0.5 * a); sh.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 18))
    cv.drawRRect(rrect(r.makeOffset(0, 10), 22), sh)
    cv.drawRRect(rrect(r, 22), paint(LIME, a))
    cv.drawRRect(rrect(r.makeInset(7, 7), 16), paint(BG, 0.55 * a, stroke=2.5))
    cv.drawString(text, x0 + 32, y0 + h / 2 + 18, f, paint(BG, a))
    cv.restore()

def draw_shot(cv, shot, t):
    cam = cam_at(shot, t)
    draw_view_frame(cv)
    cv.save()
    cv.clipRRect(VIEW_RR, True)
    im = img(shot["img"])
    dst = cam.rect((0, 0, 1440, 900))
    cv.drawImageRect(im, skia.Rect(0, 0, 1440, 900), dst, SAMP, skia.Paint())
    cursors = []
    for fx in shot["fx"]:
        k = fx[0]
        if k == "type": fx_type(cv, cam, t, *fx[1:])
        elif k == "paste": fx_paste(cv, cam, t, *fx[1:])
        elif k == "flow": fx_flow(cv, cam, t, fx[1])
        elif k == "playhead": fx_playhead(cv, cam, t, *fx[1:])
    for fx in shot["fx"]:
        k = fx[0]
        if k == "hl": fx_highlight(cv, cam, t, *fx[1:])
        elif k == "check": fx_check(cv, cam, t, *fx[1:])
        elif k == "cursor": cursors.append(fx)
    for fx in cursors: fx_cursor(cv, cam, t, fx[1], fx[2], True)
    cv.restore()
    for fx in shot["fx"]:
        if fx[0] == "badge": fx_badge(cv, t, *fx[1:])
    draw_view_border(cv)

# --- legendas cineticas ------------------------------------------------------
def draw_caption(cv, t, cap):
    t_in, t_out, ws, style = cap
    if not (t_in <= t < t_out): return
    big = style == "big"
    size = 128 if big else 84
    f = font("Black" if big else "ExtraBold", size)
    lh = size * 1.12
    space = f.measureText(" ")
    # quebra manual (\n) + automatica por largura
    lines, cur, cw = [], [], 0
    for (w, ta, col) in ws:
        if w == "\n":
            lines.append(cur); cur, cw = [], 0; continue
        ww = f.measureText(w)
        if cur and cw + space + ww > CAP_W:
            lines.append(cur); cur, cw = [], 0
        cur.append((w, ta, col, ww)); cw += (space if cw else 0) + ww
    if cur: lines.append(cur)
    out = 1 - e_out(prog(t, t_out - 0.12, t_out))  # some rapido no corte
    y = CAP_Y + (0 if len(lines) == 1 else -lh * (len(lines) - 1) * 0.5) + (24 if big else 0)
    for li, line in enumerate(lines):
        x = CAP_X
        for (w, ta, col, ww) in line:
            u = prog(t, ta, ta + 0.26)
            if u > 0:
                dy = (1 - e_back(u, 1.6)) * 46
                a = min(1, u * 2.2) * out
                p = paint(col or WHITE, a)
                sh = paint("#000000", 0.75 * a); sh.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 10))
                cv.drawString(w, x, y + dy + 6, f, sh)
                cv.drawString(w, x, y + dy, f, p)
                if col == LIME and big:  # sublinhado vivo
                    k = e_out(prog(t, ta + 0.1, ta + 0.45))
                    cv.drawRect(skia.Rect(x, y + 26, x + ww * k, y + 36), paint(LIME, a))
            x += ww + space
        y += lh

def draw_header(cv, t):
    for (t0, t1, num, name) in HEADERS:
        if t0 <= t < t1:
            a = fade(t, t0, t1, 0.25, 0.05)
            x, y = 64, 232
            u = e_out(prog(t, t0, t0 + 0.4))
            x += (1 - u) * -30
            if num:
                fN = font("Black", 40)
                tw = fN.measureText(num)
                r = skia.Rect(x, y - 44, x + tw + 32, y + 12)
                cv.drawRRect(rrect(r, 14), paint(LIME, a))
                cv.drawString(num, x + 16, y - 2, fN, paint(BG, a))
                x = r.right() + 18
            else:
                pulse = 0.6 + 0.4 * math.sin(t * 4)
                cv.drawCircle(x + 10, y - 16, 10, paint(LIME, a * pulse))
                x += 34
            cv.drawString(name, x, y, font("Bold", 46), paint(WHITE, a))
            # barra de progresso das 3 ferramentas
            seg_w, gap, bx = 70, 10, W - 64 - (3 * 70 + 2 * 10)
            idx = {"01": 0, "02": 1, "03": 2, "✓": 3}.get(num, -1)
            for i in range(3):
                col = LIME if i <= idx else "#3A3F48"
                al = a * (1 if i <= idx else 0.9)
                rr = skia.Rect(bx + i * (seg_w + gap), y - 22, bx + i * (seg_w + gap) + seg_w, y - 12)
                cv.drawRRect(rrect(rr, 5), paint(col, al))
            # barra fina de tempo do capitulo
            k = prog(t, t0, t1)
            cv.drawRect(skia.Rect(64, y + 30, 64 + (W - 128) * k, y + 33), paint(LIME, 0.5 * a))
            cv.drawRect(skia.Rect(64 + (W - 128) * k, y + 30, W - 64, y + 33), paint("#FFFFFF", 0.07 * a))

def draw_chapter(cv, t, ch):
    t0, t1, num, name, sub = ch
    lt = t - t0
    drift = lt * 18
    fN = font("Black", 420)
    # numero gigante em contorno + preenchimento entrando
    u = e_out(prog(t, t0 + 0.12, t0 + 0.5))
    x, y = 56, 1010 - drift
    pN = paint(LIME, 0.95 * u)
    cv.drawString(num, x + (1 - u) * -60, y, fN, pN)
    f2 = font("Black", 112)
    u2 = e_out(prog(t, t0 + 0.22, t0 + 0.55))
    cv.drawString(name, x + 8, y + 150 + (1 - u2) * 40, f2, paint(WHITE, u2))
    u3 = e_out(prog(t, t0 + 0.32, t0 + 0.65))
    cv.drawString(sub.upper(), x + 12, y + 228, font("SemiBold", 38), paint(MUTED, u3))
    # linha verde-limao crescendo
    cv.drawRect(skia.Rect(x + 12, y + 262, x + 12 + 300 * u3, y + 268), paint(LIME, u3))

def draw_wipe(cv, t, T):
    d = 0.42
    p = prog(t, T - d / 2, T + d / 2)
    if p <= 0 or p >= 1: return
    sk = 260  # borda diagonal
    if p < 0.5:
        k = e_io(p * 2)
        top = H - (H + sk) * k
        path = skia.Path()
        path.moveTo(0, top + sk); path.lineTo(W, top); path.lineTo(W, H); path.lineTo(0, H); path.close()
    else:
        k = e_io((p - 0.5) * 2)
        bot = H - (H + sk) * k
        path = skia.Path()
        path.moveTo(0, -sk); path.lineTo(W, -sk); path.lineTo(W, bot); path.lineTo(0, bot + sk); path.close()
    cv.drawPath(path, paint(LIME))

# --- CTA (montado com recortes do proprio 08-cta-link-bio.png) ----------------
CTA_PIECES = {
    "t1": (424, 228, 768, 296), "t2": (768, 228, 1018, 296),
    "s1": (408, 322, 516, 360), "a1": (526, 326, 552, 356),
    "s2": (560, 322, 718, 360), "s3": (760, 322, 1030, 360),
    "btn": (438, 428, 1002, 532),
    "foot": (650, 604, 790, 638),
}
SAMP_UP = skia.SamplingOptions(skia.CubicResampler.Mitchell())

def piece(cv, name, cx, cy, sc, a=1.0, rot=0):
    r = CTA_PIECES[name]
    w, h = (r[2] - r[0]) * sc, (r[3] - r[1]) * sc
    p = skia.Paint(); p.setAlphaf(clamp(a))
    cv.save(); cv.translate(cx, cy); cv.rotate(rot)
    cv.drawImageRect(img("cta"), skia.Rect(*r), skia.Rect(-w / 2, -h / 2, w / 2, h / 2), SAMP_UP, p)
    cv.restore()
    return w, h

def draw_cta(cv, t):
    lt = t - CTA_T0
    cv.clear(C(IMG_BG))
    breathe = 0.5 + 0.5 * math.sin(t * 2.4)
    zoom = 1 + 0.004 * lt  # Ken Burns leve em toda a composicao
    cv.save(); cv.translate(W / 2, H / 2); cv.scale(zoom, zoom); cv.translate(-W / 2, -H / 2)
    # "Tres ferramentas." / "Um fluxo so."
    for n, ts, y in (("t1", CTA_T0 + 0.02, 520), ("t2", 71.95, 665)):
        u = e_out(prog(t, ts, ts + 0.38))
        if u > 0: piece(cv, n, W / 2, y + (1 - u) * 44, 2.25 * (0.96 + 0.04 * u), u)
    # Le o PDF -> checa a fonte -> chega com visual pronto (empilhado)
    steps = [("s1", 73.25, 830), ("a1", 73.75, 905), ("s2", 73.86, 980), ("a1", 74.85, 1055), ("s3", 74.94, 1130)]
    for n, ts, y in steps:
        u = e_out(prog(t, ts, ts + 0.3))
        if u <= 0: continue
        if n == "a1":
            piece(cv, n, W / 2, y - (1 - u) * 20, 1.7, u * 0.9, rot=90)
        else:
            hi = 1 + 0.08 * (1 - e_out(prog(t, ts + 0.1, ts + 0.6)))
            piece(cv, n, W / 2, y + (1 - u) * 26, 2.3 * hi, u)
    k = e_out(prog(t, 76.4, 76.9))
    if k > 0:
        w3 = (CTA_PIECES["s3"][2] - CTA_PIECES["s3"][0]) * 2.3 - 34
        cv.drawRect(skia.Rect(W / 2 - w3 / 2, 1174, W / 2 - w3 / 2 + w3 * k, 1181), paint(LIME, 0.9))
    # botao: entra em 77.82 ("Eu deixei o caminho completo no link da bio"), pulsa ate o fim
    BY = 1330
    ub = prog(t, 77.82, 78.25)
    if ub > 0:
        sc = 1.58 * (e_back(ub, 2.0) if ub < 1 else 1 + 0.03 * math.sin((t - 78.25) * 5.2))
        emph = e_out(prog(t, 79.35, 79.6)) * (1 - prog(t, 79.6, 80.1))
        sc *= 1 + 0.05 * emph
        bw = (CTA_PIECES["btn"][2] - CTA_PIECES["btn"][0]) * sc
        bh = (CTA_PIECES["btn"][3] - CTA_PIECES["btn"][1]) * sc
        gl = paint(LIME, (0.25 + 0.25 * breathe + 0.3 * emph) * min(1, ub * 2))
        gl.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 40))
        cv.drawRRect(rrect(skia.Rect(W / 2 - bw / 2, BY - bh / 2, W / 2 + bw / 2, BY + bh / 2), 30), gl)
        piece(cv, "btn", W / 2, BY, sc, min(1, ub * 2))
        for i in range(2):
            k = ((t - 78.25) * 0.9 + i * 0.5) % 1 if t > 78.25 else 0
            if k > 0:
                g = 14 + 30 * e_out(k)
                rr = skia.Rect(W / 2 - bw / 2 - g, BY - bh / 2 - g, W / 2 + bw / 2 + g, BY + bh / 2 + g)
                cv.drawRRect(rrect(rr, 32 + g), paint(LIME, 0.5 * (1 - k), stroke=3))
        cu = e_io(prog(t, 78.6, 79.3))
        if cu > 0:
            cx = lerp(W - 40, W / 2 + bw * 0.28, cu)
            cy = lerp(1650, BY + bh * 0.15, cu)
            if 79.35 <= t <= 79.95:
                kk = prog(t, 79.35, 79.85)
                cv.drawCircle(cx, cy, 14 + 70 * e_out(kk), paint(WHITE, 0.8 * (1 - kk), stroke=4))
            draw_cursor(cv, cx, cy, 0.86 if 79.35 <= t <= 79.48 else 1.0)
    uf = e_out(prog(t, 78.4, 78.9))
    if uf > 0: piece(cv, "foot", W / 2, 1520, 1.6, uf * 0.9)
    cv.restore()

# ================================================================ FRAME
def render(t, cv):
    if t >= CTA_T0:
        draw_cta(cv, t); return
    draw_bg(cv, t)
    ch = next((c for c in CHAPTERS if c[0] <= t < c[1]), None)
    if ch:
        draw_chapter(cv, t, ch)
    else:
        shot = next((s for s in SHOTS if s["t0"] <= t < s["t1"]), None)
        if shot is None:  # seguranca: segura o shot anterior
            shot = max((s for s in SHOTS if s["t0"] <= t), key=lambda s: s["t0"])
        draw_shot(cv, shot, t)
    draw_header(cv, t)
    for cap in CAPTIONS: draw_caption(cv, t, cap)
    for T in WIPES: draw_wipe(cv, t, T)

def frame_bytes(i, surf):
    t = i / FPS
    cv = surf.getCanvas()
    cv.save(); render(t, cv); cv.restore()
    return surf.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType)

def worker(args):
    a, b, path = args
    surf = skia.Surface(W, H)
    ff = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}",
                           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "10",
                           "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    for i in range(a, b):
        ff.stdin.write(frame_bytes(i, surf).tobytes())
    ff.stdin.close(); ff.wait()
    return path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", help="tempos em s separados por virgula para PNG de checagem")
    ap.add_argument("--jobs", type=int, default=os.cpu_count())
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if args.frames:
        d = os.path.join(OUT, "check"); os.makedirs(d, exist_ok=True)
        surf = skia.Surface(W, H)
        for s in args.frames.split(","):
            i = int(round(float(s) * FPS))
            arr = frame_bytes(i, surf)
            skia.Image.fromarray(arr, colorType=skia.kRGBA_8888_ColorType).save(os.path.join(d, f"f_{float(s):06.2f}.png"), skia.kPNG)
        return
    tmp = os.path.join(OUT, "parts"); os.makedirs(tmp, exist_ok=True)
    n = args.jobs * 3
    bounds = [round(NFRAMES * k / n) for k in range(n + 1)]
    jobs = [(bounds[k], bounds[k + 1], os.path.join(tmp, f"p{k:03d}.mp4")) for k in range(n)]
    with Pool(args.jobs) as pool:
        parts = pool.map(worker, jobs)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w") as f:
        for p in parts: f.write(f"file '{p}'\n")
    silent = os.path.join(OUT, "atalhos-de-ia-9x16-SEM-AUDIO.mp4")
    final = os.path.join(OUT, "atalhos-de-ia-9x16.mp4")
    subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
                           "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                           "-profile:v", "high", "-r", str(FPS), "-movflags", "+faststart", silent])
    subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-i", silent, "-i", AUDIO,
                           "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                           "-ar", "48000", "-t", f"{DUR:.3f}", "-movflags", "+faststart", final])
    for p in parts: os.remove(p)
    os.remove(lst); os.rmdir(tmp)
    print("ok", final, f"{NFRAMES} frames @ {FPS}fps = {NFRAMES / FPS:.3f}s (audio {DUR:.3f}s)")

if __name__ == "__main__":
    main()
