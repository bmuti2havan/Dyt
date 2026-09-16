// Panelin "Randevular" sayfasındaki "🔔 WhatsApp Hatırlatma" ayarına göre,
// randevudan belirlenen saat önce danışana otomatik WhatsApp mesajı gönderir.
const { firebaseGetData, firebaseWriteFullData } = require('./_firebase-helper');

exports.config = {
  schedule: '*/10 * * * *'
};

const TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.WA_PHONE_ID;

function turkeyNow() {
  const now = new Date();
  return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}

function normalizePhone(raw) {
  let n = String(raw || '').replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = n.slice(1);
  if (!n.startsWith('90')) n = '90' + n;
  return n;
}

async function sendText(to, message) {
  const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'text',
      text: { body: message }
    })
  });
  return resp.ok;
}

exports.handler = async function () {
  if (!TOKEN || !PHONE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'WA_TOKEN / WA_PHONE_ID eksik' }) };
  }

  try {
    const { data, uid } = await firebaseGetData();

    const settings = data && data.apptReminder;
    if (!settings || !settings.on) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, note: 'Hatırlatma kapalı' }) };
    }
    if (!Array.isArray(data.appts) || !data.appts.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, note: 'Randevu yok' }) };
    }

    const hours = Number(settings.hours) || 3;
    const windowMs = hours * 60 * 60 * 1000;
    const template = settings.message ||
      'Merhaba {isim}, {tarih} saat {saat} randevunuzu hatırlatmak isteriz. Görüşmek üzere! 🌿';

    const clientsById = {};
    (data.clients || []).forEach(c => { clientsById[c.id] = c; });

    const now = turkeyNow();
    let sentCount = 0;
    let changed = false;

    for (const a of data.appts) {
      if (!a || a.reminded) continue;
      if (!a.when || !a.clientId) continue;

      const c = clientsById[a.clientId];
      if (!c || !c.phone) continue;

      const apptTime = new Date(a.when);
      if (isNaN(apptTime.getTime())) continue;

      const diffMs = apptTime.getTime() - now.getTime();
      if (diffMs < 0 || diffMs > windowMs) continue;

      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(a.when);
      const tarih = m ? `${m[3]}.${m[2]}.${m[1]}` : '';
      const saat = m ? `${m[4]}:${m[5]}` : '';

      const msg = template
        .replace(/\{isim\}/g, c.name || '')
        .replace(/\{ad\}/g, c.name || '')
        .replace(/\{tarih\}/g, tarih)
        .replace(/\{saat\}/g, saat);

      const ok = await sendText(c.phone, msg);
      if (ok) {
        a.reminded = true;
        a.remindedAt = new Date().toISOString();
        changed = true;
        sentCount++;
      }
    }

    // Panelin kendi cift-katmanli formatiyla TUM veriyi geri yaziyoruz.
    if (changed) {
      await firebaseWriteFullData(uid, data);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, sent: sentCount }) };
  } catch (err) {
    console.error('Randevu hatırlatma hatası:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
