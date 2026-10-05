// Tarayici dogrudan api.anthropic.com'a istek atamiyor (CORS engelliyor),
// bu yuzden "Listeden program olustur" ozelligi istegi buraya, kendi
// sunucumuza gonderiyor; biz de sunucu tarafindan (CORS kisitlamasi
// olmadan) Anthropic'e iletip cevabi aynen geri donduruyoruz.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: { message: 'Method not allowed' } }) };
  }
  // Netlify, govde icerigine gore (ozellikle cok-baytli / Turkce karakterler
  // yuzunden) istegi base64 ile kodlayabilir - once onu cozuyoruz, yoksa
  // JSON.parse yanlis/eksik veri uretebiliyordu.
  let rawBody;
  try {
    rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: { message: 'Istek govdesi cozulemedi' } }) };
  }
  let body;
  try { body = JSON.parse(rawBody); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: { message: 'Gecersiz istek govdesi' } }) }; }

  let { apiKey, prompt, maxTokens, model } = body;
  // HTTP header'lari yalnizca Latin-1 (ASCII) karakter kabul eder ve bir
  // API anahtarinin icinde hicbir zaman bosluk/satir sonu olmaz. Anahtar
  // kopyala-yapistir sirasinda gorunmez bir Unicode karakter (sifir
  // genislikli bosluk, akilli tirnak vb.) ya da satir kaydirmasindan gelen
  // bir ara bosluk/tab/yeni satir icerirse, header'a koyarken dusuk
  // seviyeli bir "ByteString" hatasiyla sunucu coker - bunun yerine
  // anahtari TUM bosluklardan (bas/son/ara fark etmeksizin) ve ASCII-disi
  // karakterlerden temizliyoruz.
  apiKey = String(apiKey || '').replace(/\s+/g, '').replace(/[^\x21-\x7E]/g, '');
  if (!apiKey) return { statusCode: 400, body: JSON.stringify({ error: { message: 'apiKey eksik' } }) };
  if (!prompt) return { statusCode: 400, body: JSON.stringify({ error: { message: 'prompt eksik' } }) };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens || 8192,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await r.json().catch(() => ({}));
    return { statusCode: r.status, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: { message: 'Anthropic sunucusuna ulasilamadi: ' + String(err) } }) };
  }
};
