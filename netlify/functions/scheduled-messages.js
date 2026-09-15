const { firebaseGetData, firebaseWrite } = require('./_firebase-helper');

// Her gun Turkiye saatiyle 10:00'da calisir (UTC 07:00).
// Istediginiz saati degistirmek icin asagidaki cron'u duzenleyin.
exports.config = {
  schedule: '0 7 * * *'
};

const TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.WA_PHONE_ID;

// ── BURADAN MESAJ METINLERINI DUZENLEYEBILIRSINIZ ──────────────────────
// {isim} yazan yer otomatik olarak danisanin adiyla degistirilir.
const MSG_NEW_FEMALE = process.env.WA_MSG_NEW_FEMALE ||
  'Merhaba {isim}, aramıza hoş geldiniz! Beslenme yolculuğunuzda yanınızdayım. 🌿';
const MSG_NEW_MALE = process.env.WA_MSG_NEW_MALE ||
  'Merhaba {isim}, aramıza hoş geldin! Beslenme programın için buradayım. 💪';
// ─────────────────────────────────────────────────────────────────────

function fmtDate(d) {
  return new Date(d).toISOString().slice(0, 10);
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
    if (!data || !Array.isArray(data.clients)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, note: 'Danisan bulunamadi' }) };
    }

    const today = fmtDate(new Date());
    let sentCount = 0;
    let changed = false;

    for (const c of data.clients) {
      if (!c || !c.phone) continue;
      if (c.waWelcomeSent) continue; // daha once gonderilmisse tekrar gonderme
      if (!c.created) continue;
      if (fmtDate(c.created) !== today) continue; // sadece BUGUN eklenenler

      const template = c.sex === 'K' ? MSG_NEW_FEMALE : MSG_NEW_MALE;
      const msg = template.replace(/\{isim\}/g, c.name || '');

      const ok = await sendText(c.phone, msg);
      if (ok) {
        c.waWelcomeSent = true;
        changed = true;
        sentCount++;
      }
    }

    if (changed) {
      await firebaseWrite(`diyetpro/${uid}`, data);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, sent: sentCount }) };
  } catch (err) {
    console.error('Otomatik mesaj hatasi:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
