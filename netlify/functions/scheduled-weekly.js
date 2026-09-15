const { firebaseGetData, firebaseWrite } = require('./_firebase-helper');

// Her 10 dakikada bir calisir, o an gecmis olan ve bugun henuz
// gonderilmemis programlari bulup gonderir.
exports.config = {
  schedule: '*/10 * * * *'
};

const TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.WA_PHONE_ID;

const WA_DAYS = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']; // JS getDay(): 0=Pazar

function turkeyNow() {
  // Sunucu UTC calisir, Turkiye UTC+3
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
    if (!data || !Array.isArray(data.waSchedule) || !data.waSchedule.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, note: 'Program yok' }) };
    }

    const now = turkeyNow();
    const todayName = WA_DAYS[now.getDay()];
    const todayISO = now.toISOString().slice(0, 10);
    const nowHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    const clientsById = {};
    (data.clients || []).forEach(c => { clientsById[c.id] = c; });

    let sentTotal = 0;
    let changed = false;

    for (const slot of data.waSchedule) {
      if (!slot.days || !slot.days.includes(todayName)) continue;
      if (slot.lastSentDate === todayISO) continue;          // bugun zaten gonderildi
      if (!slot.time || nowHHMM < slot.time) continue;         // saati henuz gelmedi

      let anySent = false;
      for (const cid of (slot.clientIds || [])) {
        const c = clientsById[cid];
        if (!c || !c.phone) continue;
        const msg = String(slot.message || '').replace(/\{isim\}/g, c.name || '');
        const ok = await sendText(c.phone, msg);
        if (ok) { sentTotal++; anySent = true; }
      }
      if (anySent) {
        slot.lastSentDate = todayISO;
        changed = true;
      }
    }

    if (changed) {
      await firebaseWrite(`diyetpro/${uid}`, data);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, sent: sentTotal }) };
  } catch (err) {
    console.error('Programli gonderim hatasi:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
