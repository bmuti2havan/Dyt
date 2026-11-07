"""Tanisma videosu: eski (videoya islenmis) yazilari kirparak cikarir, yeni altyazi ve isim etiketi ekler.

Girdi : video + transkript.json (faster-whisper cikisi, kelime zamanlariyla)
Cikti : ASS altyazi dosyasi + WebVTT (site icin) ; ffmpeg komutu en altta.
"""
import json, re, sys

W, H = 720, 605          # kirpilmis kare: y 280..885 (ustteki isim ve alttaki eski altyazi bandi disarida)
MAX_SATIR = 28           # bir satirdaki en fazla karakter
MAX_PARCA = 2            # ekranda en fazla iki satir

# Transkriptin duzeltilmis hali (segment sirasi ve sayisi ayni)
DUZELT = [
 "Merhabalar, ben Dyt. Ayşenur Korkmaz, ofisime hoş geldiniz.",
 "Antalya'da yaşayan danışanlarımla ofisimde yüz yüze görüşmeler gerçekleştiriyor",
 "ve tartı cihazımda detaylı vücut analizlerini alıyorum.",
 "Her hafta bu analizi alarak vücutları için en doğru beslenme modelini seçerek ilerliyoruz.",
 "Tabii ki online danışanlarımda da süreç elbette çok verimli geçiyor.",
 "Onlarda da görüntü alarak, ölçüm alarak bu süreci ilerletmeye çalışıyoruz.",
 "Ve kendi bedeninizi ölçmeyi aslında öğrenmiş oluyorsunuz.",
 "Programın detaylarından bahsedeyim sizlere.",
 "İlk görüşmemiz genellikle 45 ile 60 dakika arasında sürer.",
 "Sizlerden bir kan tahlili isterim ve yaşam standartlarınıza göre ilk hafta programımızı şekillendiririz.",
 "Sizi daha yakından tanımaya, hastalıklarınızı ve vücudunuzu tanımaya öncelik veririm ilk görüşmemizde.",
 "Tabii ki daha sonraki haftalarda da vücudunuzun verdiği tepkilere",
 "ve neler söylediğine uygun olarak yeni beslenme programımızı oluştururuz.",
 "Ve listelerimiz her günü tarifli ve detaylı ilerler.",
 "Yani ne yiyeceğinizi düşünmenize artık gerek yok.",
 "Ben size tarifleri veriyorum ve siz onları uygulamaya geçiyorsunuz.",
 "Ve bu sürecin en önemli parçası ise eğitimlerle destekleniyor olması.",
 "Her hafta sizlere eğitim kitapçıkları iletirim ve bu eğitim kitapçıklarında",
 "sizlerin bu süreci daha iyi oturtmasını sağlayacak bilgiler yer alır.",
 "Neyi, neden, niçin, nasıl yaptığınızı bilmek en doğal hakkınız.",
 "Siz de bunları detaylı öğrenerek hayatınızın geri kalan kısmını daha sürdürülebilir",
 "ve alışkanlık hâline gelebilecek bir beslenme modeliyle çizmiş olursunuz.",
 "Benim için en önemli kısım disiplindir ve bu disiplini sağlamak için sizlerle her gün birlikte oluyorum.",
 "Sizleri yakından, sıkı takip ediyorum; ensenizdeyim yani.",
 "Herhangi bir sorun olduğu zaman bana ulaşabilir, sorularınızın cevaplarını alabilirsiniz.",
]


def satirla(metin):
    kel, satirlar, s = metin.split(), [], ''
    for k in kel:
        if len(s) + len(k) + 1 > MAX_SATIR and s:
            satirlar.append(s); s = k
        else:
            s = (s + ' ' + k).strip()
    if s: satirlar.append(s)
    return satirlar


def parcala(seg, metin):
    """Segmenti ekrana sigan parcalara boler; zamanlari karakter oranina gore dagitir."""
    satirlar = satirla(metin)
    gruplar = [satirlar[i:i + MAX_PARCA] for i in range(0, len(satirlar), MAX_PARCA)]
    # iki satirlik gruplari dengele (son grup tek kelime kalmasin)
    toplam = sum(len(' '.join(g)) for g in gruplar)
    t0, t1 = seg['start'], seg['end']
    out, c = [], 0
    for g in gruplar:
        n = len(' '.join(g))
        a = t0 + (t1 - t0) * c / toplam; c += n
        b = t0 + (t1 - t0) * c / toplam
        out.append((a, b, g))
    return out


def ts_ass(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return '%d:%02d:%05.2f' % (h, m, s)


def ts_vtt(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return '%02d:%02d:%06.3f' % (h, m, s)


def main(tr_json, ass_out, vtt_out):
    segs = json.load(open(tr_json, encoding='utf-8'))
    assert len(segs) == len(DUZELT), (len(segs), len(DUZELT))
    parcalar = []
    for seg, metin in zip(segs, DUZELT):
        parcalar += parcala(seg, metin)
    # bosluklari kapat: bir sonraki parcaya 0.35 sn'den az varsa birlestir (titreme olmasin)
    for i in range(len(parcalar) - 1):
        a, b, g = parcalar[i]; na = parcalar[i + 1][0]
        if na - b < 0.35: parcalar[i] = (a, na, g)

    ass = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: %d" % W, "PlayResY: %d" % H, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
           "[V4+ Styles]",
           "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
           # beyaz Poppins, ince koyu golge; alt orta
           "Style: Alt,Poppins,34,&H00FFFFFF,&H00FFFFFF,&H64202818,&H8C101410,1,0,0,0,100,100,0,0,1,1.6,1.2,2,40,40,34,1",
           # isim etiketi: krem kutu, zeytin yazi
           "Style: Isim,Poppins,28,&H00425343,&H00425343,&H00E9F2F7,&H00000000,1,0,0,0,100,100,0.5,0,3,10,0,7,26,26,26,1",
           "Style: Unvan,Lora,23,&H00FFFFFF,&H00FFFFFF,&H00425343,&H00000000,0,1,0,0,100,100,0.3,0,3,8,0,7,26,26,80,1",
           "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    # isim etiketi: 0.4 - 5.2 sn, yumusak gir/cik
    ass.append("Dialogue: 2,%s,%s,Isim,,0,0,0,,{\\fad(400,400)}Dyt. Ayşenur Korkmaz" % (ts_ass(0.4), ts_ass(5.2)))
    ass.append("Dialogue: 2,%s,%s,Unvan,,0,0,0,,{\\fad(400,400)}Diyetisyen · Antalya" % (ts_ass(0.6), ts_ass(5.2)))
    for a, b, g in parcalar:
        ass.append("Dialogue: 1,%s,%s,Alt,,0,0,0,,{\\fad(90,90)}%s" % (ts_ass(a), ts_ass(b), '\\N'.join(g)))
    open(ass_out, 'w', encoding='utf-8').write('\n'.join(ass) + '\n')

    vtt = ['WEBVTT', '']
    for i, (a, b, g) in enumerate(parcalar, 1):
        vtt += [str(i), '%s --> %s' % (ts_vtt(a), ts_vtt(b))] + g + ['']
    open(vtt_out, 'w', encoding='utf-8').write('\n'.join(vtt))
    print('parca', len(parcalar))


if __name__ == '__main__':
    main(*sys.argv[1:4])

# ffmpeg -i girdi.mp4 -i gradyan.png -filter_complex "[0]crop=720:605:0:280[v];[v][1]overlay,ass=altyazi.ass:fontsdir=fonts,format=yuv420p" \
#   -c:v libx264 -preset veryfast -crf 26 -c:a aac -b:a 96k -movflags +faststart tanisma.mp4
