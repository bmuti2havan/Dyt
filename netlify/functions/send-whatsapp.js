const { isAdmin } = require('./push');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Sadece POST istekleri kabul edilir' };
  }
  // GUVENLIK: bu adres herkese acik oldugundan, sadece giris yapmis diyetisyen
  // (Firebase idToken, Authorization: Bearer ...) kullanabilsin - yoksa herkes klinik
  // numarasindan mesaj gonderebilirdi.
  if (!(await isAdmin(event.headers.authorization || event.headers.Authorization))) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Yetkisiz' }) };
  }

  const TOKEN = process.env.WA_TOKEN;
  const PHONE_ID = process.env.WA_PHONE_ID;

  if (!TOKEN || !PHONE_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Sunucu ayari eksik: WA_TOKEN veya WA_PHONE_ID tanimli degil.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Gecersiz istek govdesi' }) };
  }

  // Panelden gelen hazir Meta istegi: { payload: {messaging_product, to, type, ...} } -> yanit { ok, data }
  if (payload && payload.payload && typeof payload.payload === 'object') {
    const p = payload.payload;
    const okType = ['text', 'document', 'image', 'video'].includes(p.type);
    if (p.messaging_product !== 'whatsapp' || !okType || !/^\d{8,15}$/.test(String(p.to || ''))) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Gecersiz mesaj' }) };
    }
    try {
      const rr = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      const dd = await rr.json().catch(() => ({}));
      return { statusCode: 200, body: JSON.stringify({ ok: rr.ok, data: dd }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Meta sunucusuna ulasilamadi' }) };
    }
  }

  let { to, message, fileUrl, fileType, fileName } = payload;
  if (!to) {
    return { statusCode: 400, body: JSON.stringify({ error: '"to" alani gerekli' }) };
  }

  to = String(to).replace(/[^\d]/g, '');
  if (to.startsWith('0')) to = to.slice(1);
  if (!to.startsWith('90')) to = '90' + to;

  // Gonderilecek govdeyi olustur: dosya varsa dosya, yoksa duz metin.
  let body;
  if (fileUrl) {
    // fileType: 'document' | 'image' | 'video'
    const type = fileType || 'document';
    body = {
      messaging_product: 'whatsapp',
      to,
      type,
      [type]: {
        link: fileUrl,
        caption: message || undefined,
        filename: type === 'document' ? (fileName || 'dosya') : undefined
      }
    };
  } else {
    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: '"message" ya da "fileUrl" gerekli' }) };
    }
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    };
  }

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: 'Meta API hatasi', detail: data }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, result: data }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Sunucu hatasi', detail: String(err) }) };
  }
};
