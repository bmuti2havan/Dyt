// Danışan takip sayfasındaki "🛒 Alışveriş Listesi" butonu için.
//
// Programdaki ham öğün satırlarını ("700 adet badem", "300 gram marul",
// "2 yumurta" — haftada 5 kez tekrar eden gibi) alıp, gerçekçi bir market
// listesine çeviriyoruz: tekrarları haftalık mantıklı bir toplama
// dönüştürüyor, klinik gramaj/adetleri markette alınabilir doğal
// ifadelere çeviriyor (örn. "3 avuç badem", "1 demet marul").
//
// GÜVENLİK/ANAHTAR: ask-assistant.js ile birebir aynı yöntem — anahtar
// danışanın tarayıcısına hiç gönderilmez, diyetisyenin Ayarlar'da kayıtlı
// Claude anahtarı (DB.profile.claude) sunucu tarafında, kimliği doğrulanmış
// olarak okunur; yoksa process.env.ANTHROPIC_API_KEY'e düşülür. Anahtar hiç
// yoksa 200 + items:null döneriz — istemci bunu basit bir listeye (tekrarsız,
// olduğu gibi) düşmesi gerektiğinin sinyali olarak kullanır, hata göstermez.
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
  const items = Array.isArray(body.items)
    ? body.items.map(x => String(x || '').trim()).filter(Boolean).slice(0, 300)
    : [];
  if (!token || !items.length) {
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

  let apiKey = '';
  try {
    const { data } = await firebaseGetData();
    apiKey = String((data && data.profile && data.profile.claude) || '').replace(/\s+/g, '').replace(/[^\x21-\x7E]/g, '');
  } catch (e) { /* alttaki env-var yedeğine düşülecek */ }
  if (!apiKey) apiKey = String(process.env.ANTHROPIC_API_KEY || '').replace(/\s+/g, '');
  if (!apiKey) {
    // Anahtar yok — istemci basit (tekrarsız) listeye kendi düşsün, bunu hata saymıyoruz.
    return { statusCode: 200, body: JSON.stringify({ items: null }) };
  }

  const system = `Bir diyetisyenin haftalık beslenme programından çıkan ham öğün satırlarını, danışanın markete giderken kullanacağı gerçekçi ve sade bir alışveriş listesine çeviren bir asistansın. Kurallar:
- Sana haftalık programdaki TÜM öğün satırları, ham haliyle ve günler arası tekrarlarıyla birlikte verilecek (aynı ürün birden çok günde geçebilir).
- Aynı ürün birden çok kez geçiyorsa, bunları haftalık gerçekçi TEK bir alışveriş miktarına birleştir (örn. "2 yumurta" 5 farklı günde geçiyorsa "10 adet yumurta" ya da "1 koli yumurta" gibi tek bir madde yap — her tekrarı ayrı satır yapma).
- Klinik/porsiyon ölçülerini (gram, adet gibi tuhaf veya aşırı büyük sayılar) markette fiilen satın alınan, günlük hayatta kullanılan doğal ifadelere çevir. Örnekler: "700 adet badem" → "3 avuç badem" ya da "1 paket (yaklaşık 250g) badem"; "300 gram marul" → "1 baş marul"; "40 gram ıspanak" günlerce tekrarsa → "1 demet ıspanak".
- Sağduyulu ol: bir ürün zaten makul bir markette-alınabilir miktarda yazılmışsa (örn. "1 adet elma", "200g yoğurt") olduğu gibi bırakabilir, sadece hafta boyunca tekrarını topla.
- SADECE sana verilen satırlardaki ürünleri yorumla/birleştir — programda hiç geçmeyen yeni bir ürün UYDURMA.
- Baharat, tuz, limon gibi çok küçük/belirsiz miktarlı ek malzemeleri de makul şekilde tek bir maddeye indir (örn. "tuz, karabiber" gibi tekrar eden küçük eklentileri listede ayrı ayrı şişirme).
- Yanıtını SADECE şu JSON formatında ver, başka hiçbir açıklama, markdown ya da yorum ekleme: {"items":["madde 1","madde 2", ...]}
- Liste en fazla 40 madde olsun, mantıklı bir sırada (örn. kategoriye yakın ürünler yan yana) olabilir.`;

  const userMsg = 'Haftalık programdaki ham öğün satırları (tekrarlarıyla birlikte):\n' + items.map(i => '- ' + i).join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, system, messages: [{ role: 'user', content: userMsg }] })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { statusCode: r.status, body: JSON.stringify({ error: (data.error && data.error.message) || 'Yanıt alınamadı' }) };
    }
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    let parsed = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : text);
    } catch (e) { /* aşağıda null olarak dönecek, istemci fallback kullanır */ }
    const list = (parsed && Array.isArray(parsed.items))
      ? parsed.items.map(x => String(x || '').trim()).filter(Boolean).slice(0, 60)
      : null;
    return { statusCode: 200, body: JSON.stringify({ items: list }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Asistana ulaşılamadı: ' + String(err) }) };
  }
};
