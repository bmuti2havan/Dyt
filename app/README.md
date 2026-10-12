# Diyet Takip — Android/iOS Uygulaması

Bu klasör, `takip.dytaysenurkorkmazantalya.com.tr` sitesini Android ve iOS'ta
gerçek bir uygulama olarak paketleyen [Capacitor](https://capacitorjs.com)
kabuğudur. Uygulama kendi içinde kod taşımaz — açılır açılmaz canlı siteyi
yükler. Yani **siteyi her güncellediğimizde uygulama da otomatik güncel
olur**, ayrıca mağazaya yeni sürüm yüklemeye gerek kalmaz (sadece görünüm/
izin gibi native bir şey değiştiğinde yeni sürüm gerekir).

## Derlemeler nasıl oluşuyor?

Bu sandbox'ın kendi ağ erişimi kısıtlı olduğu ve iOS derlemesi zaten bir Mac
gerektirdiği için, derlemeler **GitHub Actions** üzerinde otomatik yapılıyor:

- `.github/workflows/android-build.yml` → her `app/` değişikliğinde bir
  **Android APK** üretir (Actions sekmesi → ilgili çalıştırma → Artifacts).
- `.github/workflows/ios-build.yml` → şimdilik **imzasız bir simülatör
  derlemesi** yapar (gerçek cihaza kurulamaz) — sadece projenin doğru
  derlendiğini kanıtlamak için.

## Senin yapman gerekenler

1. **Google Play Console hesabı** — play.google.com/console, tek seferlik
   25$. Android uygulamasını buradan yayınlayacağız.
2. **Apple Developer Program hesabı** — developer.apple.com, 99$/yıl. iOS
   uygulamasını buradan yayınlayacağız; imzalama sertifikaları da bu hesapla
   oluşturuluyor (Mac'in olmasa da Xcode Cloud / bu CI üzerinden mümkün).
3. **Uygulama ikonu** — en az 1024×1024 piksel, kare, şeffaflıksız bir logo
   (klinik logon olabilir). Gönderince tüm boyutlardaki ikonları otomatik
   üretirim.
4. **Gizlilik politikası sayfası** — her iki mağaza da zorunlu tutuyor
   (danışan verisi topladığımız için). İstersen senin için bir taslak
   yazıp bir sayfa olarak yayınlayabilirim.
5. **Birkaç ekran görüntüsü** — mağaza listeleme sayfası için (ben de
   üretebilirim, gerçek ekranlardan alınması daha iyi olur).

## appId / uygulama adı

Şu an `com.aysenurkorkmaz.diyettakip` / "Diyet Takip" olarak ayarlı.
**appId mağazaya ilk yüklemeden sonra bir daha değiştirilemez** — yayınlamadan
önce bu isimden memnun olduğunu teyit edelim.

## Android imzalama anahtarı (keystore) — ÇOK ÖNEMLİ

Play Store'a ilk yüklemeden önce bir imzalama anahtarı (keystore) üretilecek.
**Bu dosya kaybolursa uygulamayı bir daha asla güncelleyemezsin** (yeni bir
uygulama olarak baştan yayınlaman gerekir). Üretildiğinde sana ayrıca
göndereceğim — Google Drive gibi güvenli iki ayrı yere yedekle.

## Gerçek (imzalı) sürümlere geçiş

Hesaplar hazır olunca:
- Android: bir keystore üretip GitHub'a gizli bilgi (secret) olarak
  ekleyeceğiz, workflow imzalı bir `.aab` (Play Store'un istediği format)
  üretecek şekilde güncellenecek.
- iOS: Apple Developer hesabından bir "App Store Connect API anahtarı"
  üretip yine GitHub secret olarak ekleyeceğiz, workflow gerçek cihaza/
  mağazaya yüklenebilir imzalı bir `.ipa` üretecek.

Bu adımların hiçbiri şu an yapılmadı — önce temel iskeletin gerçekten
derlendiğini doğruluyoruz.
