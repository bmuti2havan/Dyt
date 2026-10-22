# Diyetisyen Tanıtım Sayfası (Şablon)

Tek sayfalık, mobil uyumlu diyetisyen tanıtım sitesi. Sunucu, kurulum ya da veritabanı gerekmez.

## İçinde neler var
- Karşılama bölümü, WhatsApp / Instagram / Google Haritalar butonları
- Günün motivasyon sözü + günlük su takibi
- Örnek haftalık program (günlere tıklanır)
- 7 günlük küçük meydan okuma
- Alışveriş listesi örneği ve tüyolar
- 63 konuda beslenme rehberi (arama + kategoriler), hastalıklara göre beslenme, hamilelik rehberi
- Kilo/boy hesaplayıcı, hamilelik haftası hesaplayıcı
- "Tanışalım" formu (doldurunca WhatsApp'a hazır mesaj olarak gider)
- Sık sorulan sorular

## Kendi bilgilerinizi nasıl yazarsınız
Sadece **`config.js`** dosyasını açıp düzenleyin: ad, fotoğraf, WhatsApp numarası, Instagram, şehir, adres, "kimdir" yazısı.
Fotoğrafınızı bu klasöre koyup `foto: 'foto.jpg'` yazın.

Örnek haftalık programı değiştirmek için `index.html` içinde `DEMO_GUNLER` bölümünü düzenleyin.

## Yayınlama
- **Netlify**: netlify.com → "Add new site" → "Deploy manually" → bu klasörü sürükleyip bırakın. (Ücretsiz)
- **GitHub Pages / herhangi bir hosting**: klasördeki dosyaları olduğu gibi yükleyin.

## Google'da çıkması için
`index.html` içindeki `<meta name="robots" content="noindex">` satırını silin (bu satır demo sürümün aramalarda çıkmasını engeller).
