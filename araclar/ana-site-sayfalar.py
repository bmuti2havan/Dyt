"""Ana site icin Google'in okuyabildigi statik sayfalari uretir.

Ne uretir (ana-site/ altina):
  yazi/<slug>/index.html     her blog yazisi icin gercek sayfa
  tarif/<slug>/index.html    her tarif icin gercek sayfa
  blog/index.html            tum yazilar
  tarifler/index.html        tum tarifler
  sitemap.xml, robots.txt

Icerik, sitenin kendisinden (ana-site/index.html + panelden eklenen yazilar) okunur.
Panelden yeni yazi eklendiginde bu betik tekrar calistirilip site yeniden yuklenmelidir.

Kullanim:  python3 araclar/ana-site-sayfalar.py
Gerekli:   playwright (chromium)
"""
import html, json, os, re, subprocess, sys, time, datetime
from playwright.sync_api import sync_playwright

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ana-site')
KOK = os.path.abspath(KOK)
SITE = 'https://dytaysenurkorkmazantalya.com.tr'
TAKIP = 'https://takip.dytaysenurkorkmazantalya.com.tr/?promo=1'
BUGUN = datetime.date.today()
TR_AY = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
BUGUN_TR = '%02d.%02d.%d' % (BUGUN.day, BUGUN.month, BUGUN.year)
e = lambda x: html.escape(str(x or ''), quote=True)


def icerik_cek():
    port = 8791
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port)], cwd=KOK,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.launch(); pg = b.new_page()
            pg.goto('http://localhost:%d/' % port); pg.wait_for_timeout(4000)
            d = pg.evaluate('''() => {
              const v = AK.veriAl();
              const g = {}; AK.gorselListe().forEach(k => { const u = AK.gorselUrl(k); if (u && !u.startsWith('data:')) g[k] = u; });
              return {yazi: (v.yazilar||[]).concat(window.AK_YAZI||[]), tarif: (v.tarifler||[]).concat(window.AK_TARIF||[]),
                      gorsel: g, ayar: {ad:v.ad, adres:v.adres, saatler:v.saatler, telefon:v.telefon, eposta:v.eposta,
                      whatsapp:v.whatsapp, instagram:v.instagram}};
            }''')
            b.close()
        return d
    finally:
        srv.terminate()


def duz(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', str(s or ''))).strip()


def kisalt(s, n=158):
    s = duz(s)
    return s if len(s) <= n else s[:n].rsplit(' ', 1)[0] + '…'


def ic_link(h):
    # sitedeki "#/kvkk" gibi baglantilar statik sayfadan ana siteye gitsin
    return re.sub(r'href="#', 'href="/#', str(h or '')).replace('href="/#/', 'href="/#/')


CSS = '''
:root{--krem:#F7F2E9;--kagit:#fff;--zeytin:#435342;--orman:#3E6B2F;--kahve:#705642;--murekkep:#2B3229;--cizgi:#E5E0D0;--turunc:#EE9440;--yaprak:#6FA33C}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--krem);color:var(--murekkep);font:400 17px/1.75 'AKSans',system-ui,-apple-system,'Segoe UI',sans-serif}
a{color:var(--orman)}img{max-width:100%;height:auto;display:block}
.ust{position:sticky;top:0;z-index:10;background:rgba(247,242,233,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--cizgi)}
.ust-ic{max-width:1080px;margin:0 auto;padding:.6rem 16px;display:flex;align-items:center;gap:1rem}
.ust .logo img{height:44px;width:auto;mix-blend-mode:multiply}
.ust nav{margin-left:auto;display:flex;gap:1.1rem;align-items:center;font-size:.95rem}
.ust nav a{text-decoration:none;color:var(--zeytin);font-weight:500}
.ust nav .ana{background:var(--zeytin);color:#fff;padding:.5rem 1rem;border-radius:999px}
@media (max-width:700px){.ust nav a:not(.ana){display:none}}
.bas{background:var(--zeytin);color:#fff;padding:2.6rem 16px 2.2rem}
.bas-ic{max-width:760px;margin:0 auto}
.yol{font-size:.82rem;opacity:.8;margin:0 0 1rem}.yol a{color:#fff}
.rozet{display:inline-block;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;background:rgba(255,255,255,.14);padding:.3rem .8rem;border-radius:999px}
h1{font-family:'AKSerif',Georgia,serif;font-weight:500;font-size:clamp(1.9rem,5vw,2.8rem);line-height:1.2;margin:.8rem 0 .8rem}
.ub{font-size:.88rem;opacity:.85;margin:0;display:flex;flex-wrap:wrap;gap:.4rem 1.2rem}
main{max-width:760px;margin:0 auto;padding:2rem 16px 3rem}
.kapak{border-radius:20px;overflow:hidden;margin:-3.2rem 0 1.8rem;box-shadow:0 20px 40px -26px rgba(40,40,20,.5);background:#e9e2d4}
.kapak img{width:100%;aspect-ratio:16/9;object-fit:cover}
.oz{font-family:'AKSerif',Georgia,serif;font-size:1.25rem;line-height:1.6;font-style:italic;border-left:4px solid var(--karamel,#B69A7D);padding-left:1rem;margin:0 0 1.6rem}
.ici{background:var(--kagit);border:1px solid var(--cizgi);border-radius:16px;padding:1rem 1.2rem;margin:0 0 2rem;font-size:.95rem}
.ici ol{margin:.4rem 0 0;padding-left:1.2rem}
h2{font-family:'AKSerif',Georgia,serif;font-weight:500;font-size:1.55rem;line-height:1.3;margin:2.2rem 0 .6rem;color:var(--zeytin)}
.ipc{background:#eef3e6;border-radius:16px;padding:1.1rem 1.3rem;margin:2rem 0}.ipc b{display:block;margin-bottom:.3rem;color:var(--orman)}
.uyari{font-size:.9rem;opacity:.75;border-top:1px solid var(--cizgi);padding-top:1rem;margin-top:2rem}
.cta{background:var(--kagit);border:1px solid var(--cizgi);border-radius:20px;padding:1.5rem;margin:2.2rem 0;display:grid;gap:.9rem}
.cta h3{margin:0;font-family:'AKSerif',Georgia,serif;font-weight:500;font-size:1.35rem}.cta p{margin:0}
.dg{display:flex;flex-wrap:wrap;gap:.6rem}
.dgm{display:inline-flex;align-items:center;justify-content:center;padding:.75rem 1.2rem;border-radius:999px;text-decoration:none;font-weight:600;font-size:.95rem}
.dgm.ana{background:var(--zeytin);color:#fff}.dgm.hat{border:1px solid var(--zeytin);color:var(--zeytin)}
.bilgi{display:flex;flex-wrap:wrap;gap:.6rem;margin:0 0 1.6rem}
.bilgi span{background:var(--kagit);border:1px solid var(--cizgi);border-radius:999px;padding:.35rem .9rem;font-size:.9rem}
.malz{background:var(--kagit);border:1px solid var(--cizgi);border-radius:16px;padding:1rem 1.2rem 1rem 2.2rem}
.adim li{margin:.5rem 0}
.ilgili{display:grid;gap:.8rem;margin-top:1rem}
@media (min-width:640px){.ilgili{grid-template-columns:1fr 1fr}}
.kart{display:block;background:var(--kagit);border:1px solid var(--cizgi);border-radius:18px;overflow:hidden;text-decoration:none;color:inherit}
.kart img{aspect-ratio:16/10;object-fit:cover;width:100%}
.kart div{padding:.9rem 1rem 1.1rem}.kart small{color:var(--kahve);letter-spacing:.06em;text-transform:uppercase;font-size:.72rem}
.kart h3{font-family:'AKSerif',Georgia,serif;font-weight:500;font-size:1.15rem;line-height:1.35;margin:.3rem 0 .3rem}
.kart p{margin:0;font-size:.9rem;opacity:.8;line-height:1.55}
.liste{display:grid;gap:1rem}@media (min-width:700px){.liste{grid-template-columns:repeat(2,1fr)}}@media (min-width:1000px){.liste{grid-template-columns:repeat(3,1fr)}}
main.genis{max-width:1080px}
.alt{border-top:1px solid var(--cizgi);background:#f1ebdf;font-size:.88rem}
.alt-ic{max-width:1080px;margin:0 auto;padding:1.6rem 16px 2rem;display:grid;gap:.6rem}
.alt a{color:var(--zeytin)}
'''


def sablon(baslik, aciklama, yol_url, govde, ld, ayar, gorsel=None, tur='article', bas_html='', genis=False):
    wa = 'https://wa.me/%s?text=%s' % (re.sub(r'\D', '', ayar.get('whatsapp') or ''),
                                       'Merhaba%2C%20randevu%20almak%20istiyorum.')
    url = SITE + yol_url
    og = (SITE + '/' + gorsel.lstrip('/')) if gorsel else SITE + '/img/site/og.jpg'
    return f'''<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(baslik)} | Dyt. Ayşenur Korkmaz — Antalya Diyetisyen</title>
<meta name="description" content="{e(aciklama)}">
<link rel="canonical" href="{e(url)}">
<meta name="robots" content="index, follow">
<meta name="author" content="Dyt. Ayşenur Korkmaz">
<meta name="theme-color" content="#435342">
<meta property="og:type" content="{tur}">
<meta property="og:locale" content="tr_TR">
<meta property="og:site_name" content="Dyt. Ayşenur Korkmaz">
<meta property="og:title" content="{e(baslik)}">
<meta property="og:description" content="{e(aciklama)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(og)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/site/favicon.jpg">
<link rel="stylesheet" href="/assets/fonts.css">
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<header class="ust"><div class="ust-ic">
  <a class="logo" href="/" aria-label="Dyt. Ayşenur Korkmaz — ana sayfa"><img src="/img/site/logo.jpg" alt="Dyt. Ayşenur Korkmaz" width="760" height="312"></a>
  <nav><a href="/">Ana Sayfa</a><a href="/blog/">Blog</a><a href="/tarifler/">Tarifler</a><a href="/#takip-sistemi">Takip Sistemi</a><a class="ana" href="{e(wa)}" target="_blank" rel="noopener">Randevu Al</a></nav>
</div></header>
{bas_html}
<main{' class="genis"' if genis else ''}>
{govde}
</main>
<footer class="alt"><div class="alt-ic">
  <div><strong>Dyt. Ayşenur Korkmaz</strong> · {e(ayar.get('adres'))}</div>
  <div>{e(ayar.get('saatler'))}</div>
  <div><a href="/">Ana sayfa</a> · <a href="/blog/">Blog</a> · <a href="/tarifler/">Tarifler</a> · <a href="{e(TAKIP)}" target="_blank" rel="noopener">Danışan Takip Sistemi</a> · <a href="/#/kvkk">KVKK Aydınlatma Metni</a> · <a href="/#/gizlilik">Gizlilik</a></div>
  <div>İçerik sorumlusu ve site editörü: <strong>Dyt. Ayşenur Korkmaz</strong> · <a href="mailto:{e(ayar.get('eposta'))}">{e(ayar.get('eposta'))}</a> · Son güncelleme: <strong>{BUGUN_TR}</strong></div>
  <div>Bu sitedeki içerikler genel bilgilendirme amaçlıdır; kişiye özel değerlendirme, tanı veya tedavi yerine geçmez.</div>
</div></footer>
</body>
</html>
'''


def cta_html(ayar):
    wa = 'https://wa.me/%s?text=%s' % (re.sub(r'\D', '', ayar.get('whatsapp') or ''), 'Merhaba%2C%20randevu%20almak%20istiyorum.')
    return f'''<section class="cta">
  <h3>Size özel bir düzen kuralım</h3>
  <p>Antalya'da yüz yüze, Türkiye'nin her yerinden online görüşme. İşaret dili biliyorum; işitme engelli danışanlarla doğrudan görüşüyorum.</p>
  <div class="dg"><a class="dgm ana" href="{e(wa)}" target="_blank" rel="noopener">WhatsApp'tan Randevu Al</a><a class="dgm hat" href="{e(TAKIP)}" target="_blank" rel="noopener">Danışan takip sistemini inceleyin</a></div>
</section>'''


def kisi():
    return {"@type": "Person", "name": "Dyt. Ayşenur Korkmaz", "jobTitle": "Diyetisyen", "url": SITE + "/"}


def kirinti(*parcalar):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": ad, "item": SITE + u} for i, (ad, u) in enumerate(parcalar)]}


def kart(href, img, ust, baslik, ozet):
    im = f'<img src="{e(img)}" alt="" loading="lazy" width="1100" height="688">' if img else ''
    return f'<a class="kart" href="{e(href)}">{im}<div><small>{e(ust)}</small><h3>{e(baslik)}</h3><p>{e(kisalt(ozet, 120))}</p></div></a>'


def yaz(yol, icerik):
    tam = os.path.join(KOK, yol)
    os.makedirs(os.path.dirname(tam), exist_ok=True)
    open(tam, 'w', encoding='utf-8').write(icerik)


def main():
    d = icerik_cek()
    ayar, G = d['ayar'], d['gorsel']
    gimg = lambda k: ('/' + G[k].lstrip('/')) if G.get(k) else None
    yazilar = [y for y in d['yazi'] if y.get('s') and y.get('b')]
    tarifler = [t for t in d['tarif'] if t.get('s') and t.get('b')]
    urls = [('/', '1.0'), ('/blog/', '0.8'), ('/tarifler/', '0.8')]

    # ---- yazilar
    for y in yazilar:
        u = '/yazi/%s/' % y['s']; img = gimg('yazi_' + y['s'])
        bolumler = [b for b in (y.get('i') or []) if isinstance(b, list) and len(b) >= 2]
        basliklar = [b[0] for b in bolumler if b[0]]
        ici = ('<nav class="ici"><b>Bu yazıda</b><ol>' + ''.join('<li><a href="#b%d">%s</a></li>' % (i, e(h)) for i, h in enumerate(basliklar)) + '</ol></nav>') if len(basliklar) >= 3 else ''
        n = -1; govde_b = []
        for b in bolumler:
            if b[0]:
                n += 1; govde_b.append('<h2 id="b%d">%s</h2>' % (n, e(b[0])))
            govde_b.append('<p>%s</p>' % ic_link(b[1]))
        diger = [x for x in yazilar if x['s'] != y['s']][:4]
        govde = (f'<figure class="kapak"><img src="{e(img)}" alt="{e(y["b"])}" width="1100" height="619" fetchpriority="high"></figure>' if img else '') + \
            f'<p class="oz">{e(y.get("o"))}</p>{ici}' + ''.join(govde_b) + \
            (f'<div class="ipc"><b>Akılda kalsın</b>{e(y.get("t"))}</div>' if y.get('t') else '') + \
            '<p class="uyari">Bu yazı genel bilgilendirme amaçlıdır ve kişiye özel değerlendirme yerine geçmez. Sağlıkla ilgili şikâyetleriniz için önce hekiminize başvurun. Yazan: Dyt. Ayşenur Korkmaz.</p>' + \
            cta_html(ayar) + \
            '<h2>Diğer yazılar</h2><div class="ilgili">' + ''.join(kart('/yazi/%s/' % x['s'], gimg('yazi_' + x['s']), x.get('k'), x['b'], x.get('o')) for x in diger) + '</div>'
        bas = f'''<div class="bas"><div class="bas-ic"><p class="yol"><a href="/">Ana sayfa</a> › <a href="/blog/">Blog</a></p>
<span class="rozet">{e(y.get("k"))}</span><h1>{e(y["b"])}</h1>
<p class="ub"><span>Yazan: Dyt. Ayşenur Korkmaz</span><span>{e(y.get("dk"))} okuma</span></p></div></div>'''
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "BlogPosting", "headline": y['b'], "description": kisalt(y.get('o')), "inLanguage": "tr-TR",
             "author": kisi(), "publisher": kisi(), "mainEntityOfPage": SITE + u, "dateModified": BUGUN.isoformat(),
             **({"image": SITE + img} if img else {})},
            kirinti(('Ana sayfa', '/'), ('Blog', '/blog/'), (y['b'], u))]}
        yaz(u.strip('/') + '/index.html', sablon(y['b'], kisalt(y.get('o')), u, govde, ld, ayar, img, 'article', bas))
        urls.append((u, '0.7'))

    # ---- tarifler
    for t in tarifler:
        u = '/tarif/%s/' % t['s']; img = gimg('tarif_' + t['s'])
        bilgi = ''.join('<span>%s</span>' % e(x) for x in [t.get('k'), t.get('sure'), t.get('kisi'), t.get('zor')] if x)
        govde = (f'<figure class="kapak"><img src="{e(img)}" alt="{e(t["b"])}" width="1100" height="619" fetchpriority="high"></figure>' if img else '') + \
            f'<p class="oz">{e(t.get("o"))}</p><div class="bilgi">{bilgi}</div>' + \
            '<h2>Malzemeler</h2><ul class="malz">' + ''.join('<li>%s</li>' % e(m) for m in (t.get('m') or [])) + '</ul>' + \
            '<h2>Hazırlanışı</h2><ol class="adim">' + ''.join('<li>%s</li>' % e(a) for a in (t.get('a') or [])) + '</ol>' + \
            (f'<div class="ipc"><b>Diyetisyen notu</b>{e(t.get("t"))}</div>' if t.get('t') else '') + \
            '<p class="uyari">Tarifler genel mutfak önerileridir. Besin alerjisi, çölyak, böbrek hastalığı gibi durumlarda malzeme ve porsiyonların size göre uyarlanması gerekir.</p>' + \
            cta_html(ayar) + \
            '<h2>Diğer tarifler</h2><div class="ilgili">' + ''.join(kart('/tarif/%s/' % x['s'], gimg('tarif_' + x['s']), x.get('k'), x['b'], x.get('o')) for x in tarifler if x['s'] != t['s']) + '</div>'
        bas = f'''<div class="bas"><div class="bas-ic"><p class="yol"><a href="/">Ana sayfa</a> › <a href="/tarifler/">Tarifler</a></p>
<span class="rozet">{e(t.get("k"))}</span><h1>{e(t["b"])}</h1>
<p class="ub"><span>Dyt. Ayşenur Korkmaz</span>{('<span>' + e(t.get("sure")) + '</span>') if t.get('sure') else ''}</p></div></div>'''
        rec = {"@type": "Recipe", "name": t['b'], "description": kisalt(t.get('o')), "author": kisi(), "inLanguage": "tr-TR",
               "recipeCategory": t.get('k'), "recipeYield": t.get('kisi'), "recipeCuisine": "Türk",
               "recipeIngredient": t.get('m') or [], "recipeInstructions": [{"@type": "HowToStep", "text": a} for a in (t.get('a') or [])]}
        m = re.match(r'^(\d+)\s*dk$', str(t.get('sure') or '').strip())
        if m: rec["totalTime"] = "PT%sM" % m.group(1)
        if img: rec["image"] = [SITE + img]
        ld = {"@context": "https://schema.org", "@graph": [rec, kirinti(('Ana sayfa', '/'), ('Tarifler', '/tarifler/'), (t['b'], u))]}
        yaz(u.strip('/') + '/index.html', sablon(t['b'], kisalt(t.get('o')), u, govde, ld, ayar, img, 'article', bas))
        urls.append((u, '0.7'))

    # ---- liste sayfalari
    for yol, baslik, acik, ogeler, onek, gk in [
        ('/blog/', 'Beslenme yazıları', 'Dyt. Ayşenur Korkmaz\'ın öğün düzeni, etiket okuma, lif, su ve pratik mutfak hazırlığı üzerine sade ve uygulanabilir beslenme yazıları.', yazilar, '/yazi/', 'yazi_'),
        ('/tarifler/', 'Pratik tarifler', 'Market ürünleriyle, kısa sürede ve özel ekipman gerektirmeden hazırlanan dengeli tarifler. Dyt. Ayşenur Korkmaz, Antalya.', tarifler, '/tarif/', 'tarif_')]:
        bas = f'<div class="bas"><div class="bas-ic"><p class="yol"><a href="/">Ana sayfa</a></p><h1>{e(baslik)}</h1><p class="ub"><span>{e(acik)}</span></p></div></div>'
        govde = '<div class="liste">' + ''.join(kart(onek + x['s'] + '/', gimg(gk + x['s']), x.get('k'), x['b'], x.get('o')) for x in ogeler) + '</div>' + cta_html(ayar)
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "CollectionPage", "name": baslik, "description": acik, "url": SITE + yol, "inLanguage": "tr-TR",
             "hasPart": [{"@type": "CreativeWork", "name": x['b'], "url": SITE + onek + x['s'] + '/'} for x in ogeler]},
            kirinti(('Ana sayfa', '/'), (baslik, yol))]}
        yaz(yol.strip('/') + '/index.html', sablon(baslik, acik, yol, govde, ld, ayar, None, 'website', bas, genis=True))

    # ---- sitemap + robots
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, pr in urls:
        sm.append('  <url><loc>%s%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>' % (SITE, u, BUGUN.isoformat(), pr))
    sm.append('</urlset>')
    open(os.path.join(KOK, 'sitemap.xml'), 'w', encoding='utf-8').write('\n'.join(sm) + '\n')
    open(os.path.join(KOK, 'robots.txt'), 'w', encoding='utf-8').write('User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n' % SITE)
    print('yazi', len(yazilar), 'tarif', len(tarifler), 'url', len(urls))


if __name__ == '__main__':
    main()
