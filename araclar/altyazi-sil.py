"""Videoya islenmis beyaz, siyah kenarli altyazilari bulup cevredeki goruntuyle doldurur."""
import cv2, numpy as np, sys

def maske(fr):
    h, w = fr.shape[:2]
    hsv = cv2.cvtColor(fr, cv2.COLOR_BGR2HSV)
    beyaz = ((hsv[..., 2] > 200) & (hsv[..., 1] < 60)).astype(np.uint8)
    koyu = (hsv[..., 2] < 60).astype(np.uint8)
    koyu_yakin = cv2.dilate(koyu, np.ones((7, 7), np.uint8))
    m = np.zeros((h, w), np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(beyaz, 8)
    for i in range(1, n):
        x, y, bw, bh, a = st[i]
        if bh > 95 or a < 25:   # harf boyutunda olmayanlari (kiyafet, duvar) atla
            continue
        comp = lab[y:y+bh, x:x+bw] == i
        temas = koyu_yakin[y:y+bh, x:x+bw][comp].mean()
        if temas < 0.12:                    # siyah kenari olmayan beyaz alan = yazi degil
            continue
        m[y:y+bh, x:x+bw][comp] = 255
    # yalnizca yazi bantlari: ust isim ve alt altyazi
    bant = np.zeros_like(m); bant[int(h*.12):int(h*.21)] = 1; bant[int(h*.70):int(h*.83)] = 1
    m = m * bant
    # harflerin siyah kenarini da kapsa
    m = cv2.dilate(m, np.ones((15, 15), np.uint8))
    m = cv2.bitwise_and(m, cv2.dilate(m, np.ones((1, 1), np.uint8)))
    return m

def temizle(fr):
    m = maske(fr)
    if m.any():
        fr = cv2.inpaint(fr, m, 7, cv2.INPAINT_TELEA)
    return fr

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    cap = cv2.VideoCapture(src)
    fps = cap.get(cv2.CAP_PROP_FPS); w = int(cap.get(3)); h = int(cap.get(4))
    out = cv2.VideoWriter(dst, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
    while True:
        ok, fr = cap.read()
        if not ok: break
        out.write(temizle(fr))
    out.release()
