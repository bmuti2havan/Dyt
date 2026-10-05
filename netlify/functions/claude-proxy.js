// Tarayici dogrudan api.anthropic.com'a istek atamiyor (CORS engelliyor),
// bu yuzden "Listeden program olustur" ozelligi istegi buraya, kendi
// sunucumuza gonderiyor; biz de sunucu tarafindan (CORS kisitlamasi
// olmadan) Anthropic'e iletip cevabi aynen geri donduruyoruz.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: { message: 'Method not allowed' } }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: { message: 'Gecersiz istek govdesi' } }) }; }

  const { apiKey, prompt, maxTokens, model } = body;
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
