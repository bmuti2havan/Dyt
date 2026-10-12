// Danışan takip sayfasındaki "🌸 Diyet Asistanın" sohbet kutusu için.
//
// GÜVENLİK: Anthropic API anahtarı danışanın tarayıcısına, herkese açık
// "shares/{token}" verisine ya da başka hiçbir yere ASLA gönderilmez —
// aksi halde linki açan herkes anahtarı görüp kötüye kullanabilirdi.
// (Bu, diyetisyenin kendi panelinde kullandığı claude-proxy.js'den farklı:
// orada anahtar onun kendi tarayıcısından geliyor, burada hiç tarayıcıya
// çıkmıyor.)
//
// Anahtarı NEREDEN alıyoruz: diyetisyen Ayarlar sayfasında "Claude API
// anahtarı"nı zaten kendi hesabına (DB.profile.claude) kaydetmişse, onu
// kullanıyoruz — ayrıca Netlify'da yeni bir ortam değişkeni ayarlamasına
// gerek kalmıyor. Bunun için zaten var olan FIREBASE_EMAIL/FIREBASE_PASSWORD
// ortam değişkenleriyle (scheduled-weekly.js / scheduled-backup.js'de de
// kullanılıyor) kendi verisine sunucu tarafında, kimliği doğrulanmış olarak
// bağlanıp DB.profile.claude'u okuyoruz. İstenirse process.env.ANTHROPIC_API_KEY
// da yedek olarak kullanılabilir (ayarlıysa, profildeki anahtara göre önceliklidir).
const { firebaseGetData } = require('./_firebase-helper');
const CLOUD_DB = 'https://dyt-aysenur-korkmaz-default-rtdb.europe-west1.firebasedatabase.app';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '{}');
    body = JSON.parse(raw);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Geçersiz istek gövdesi' }) };
  }

  const token = String(body.token || '').trim();
  const question = String(body.question || '').trim().slice(0, 600);
  const context = String(body.context || '').slice(0, 2000);
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  if (!token || !question) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Eksik bilgi' }) };
  }

  // Token gerçekten geçerli bir paylaşım linkine mi ait, kontrol et.
  try {
    const chk = await fetch(`${CLOUD_DB}/shares/${encodeURIComponent(token)}.json`);
    const snap = await chk.json().catch(() => null);
    if (!snap) return { statusCode: 403, body: JSON.stringify({ error: 'Geçersiz bağlantı' }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Doğrulama yapılamadı, tekrar dener misin?' }) };
  }

  // Anahtarı önce diyetisyenin kendi Ayarlar'da kayıtlı Claude anahtarından
  // almaya çalış (DB.profile.claude), yoksa Netlify ortam değişkenine düş.
  let apiKey = '';
  try {
    const { data } = await firebaseGetData();
    apiKey = String((data && data.profile && data.profile.claude) || '').replace(/\s+/g, '').replace(/[^\x21-\x7E]/g, '');
  } catch (e) {
    // Firebase'e erişilemedi - alttaki env-var yedeğine düşülecek.
  }
  if (!apiKey) {
    apiKey = String(process.env.ANTHROPIC_API_KEY || '').replace(/\s+/g, '');
  }
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Asistan şu an yapılandırılmamış. Diyetisyenine haber ver: Ayarlar sayfasında bir Claude API anahtarı girmesi gerekiyor.' }) };
  }

  const system = `Sen "Diyet Asistanın" adında, sıcak ve destekleyici bir beslenme asistanısın. Bir diyetisyenin danışanıyla, onun kendi takip sayfasında konuşuyorsun. Kurallar:
- Kısa, sade, samimi cevaplar ver (en fazla 4-5 cümle ya da kısa bir madde listesi). Gereksiz uzatma.
- Asla tıbbi teşhis koyma, ilaç/doz önerme. Programında somut bir değişiklik (porsiyon, öğün değiştirme/çıkarma, kalori hedefi vb.) istenirse, bunun diyetisyeninin onayı gerektiğini nazikçe söyle ve diyetisyenine yazmasını öner.
- Beslenme, bu programın mantığı, genel sağlıklı yaşam ve motivasyon sorularını rahatça yanıtlayabilirsin.
- Hastalık/ilaç/laboratuvar sonucu gibi tıbbi konularda yorum yapma, doktoruna veya diyetisyenine danışmasını öner.
- Türkçe, pozitif ve samimi bir dil kullan; emoji kullanımı ölçülü olsun.
- Danışanın güncel bilgileri: ${context || 'belirtilmemiş'}`;

  const messages = [
    ...history.filter(h => h && h.role && h.text).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: String(h.text).slice(0, 600) })),
    { role: 'user', content: question }
  ];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, system, messages })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { statusCode: r.status, body: JSON.stringify({ error: (data.error && data.error.message) || 'Yanıt alınamadı' }) };
    }
    const text = (data.content && data.content[0] && data.content[0].text) || 'Şu an cevap veremiyorum, tekrar dener misin?';
    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Asistana ulaşılamadı: ' + String(err) }) };
  }
};
