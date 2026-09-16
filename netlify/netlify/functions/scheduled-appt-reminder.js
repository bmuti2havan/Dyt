// Panelin "Otomatik Mesaj Programı" (haftalık takvim) ekranında kaydedilen
// programları her 10 dakikada bir kontrol edip zamanı gelenleri gerçekten gönderir.
// Artık kişiler tek tek danışan seçilerek değil, panelin 4 sabit grubuna
// (Yeni danışan / Kadın danışan / Erkek danışan / Özel danışan) göre bulunuyor.
const { firebaseGetData, firebaseWrite } = require('./_firebase-helper');

exports.config = {
  schedule: '*/10 * * * *'
};

const TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.WA_PHONE_ID;

// JS'in kendi getDay() indeksi (0 = Pazar) ile panelin gün etiketlerini eşleştiriyoruz.
const WA_DAYS_BY_GETDAY = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function turkeyNow() {
  // Sunucu UTC çalışır, Türkiye UTC+3.
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

// Panelde eklenen görsel base64 (data:...) olarak Firebase'de saklanıyor.
// WhatsApp'a link olarak gönderemeyiz (herkese açık bir adres değil), bu yüzden
// önce Meta'nın medya sunucusuna yüklüyoruz, dönen "media id" ile mesaj atıyoruz.
// Aynı programdaki tüm alıcılar için görsel sadece 1 kere yükleniyor.
async function uploadMedia(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Geçersiz görsel verisi');
  const mime = m[1];
  const buffer = Buffer.from(m[2], 'base64');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buffer], { type: mime }), 'gorsel.jpg');

  const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Medya yükleme hatası: ' + JSON.stringify(data));
  return data.id;
}

async function sendImage(to, mediaId, caption) {
  const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'image',
      image: { id: mediaId, caption: caption || undefined }
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
    const todayName = WA_DAYS_BY_GETDAY[now.getDay()];
    const todayISO = now.toISOString().slice(0, 10);
    const nowHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    // Kişi listesi artık "wa" düğümünde, her kişinin "grup" alanı
    // (yeni / kadin / erkek / ozel) panelin 4 sabit grubundan birine eşit.
    const contacts = Array.isArray(data.wa) ? data.wa : [];

    let sentTotal = 0;
    let changed = false;

    for (const slot of data.waSchedule) {
      if (!slot.days || !slot.days.includes(todayName)) continue;
      if (slot.lastSentDate === todayISO) continue;    // bugün zaten gönderildi
      if (!slot.time || nowHHMM < slot.time) continue;   // saati henüz gelmedi

      const targets = contacts.filter(c => c && c.tel && slot.groups && slot.groups.includes(c.grup));
      if (!targets.length) { slot.lastSentDate = todayISO; changed = true; continue; }

      let mediaId = null;
      if (slot.image) {
        try { mediaId = await uploadMedia(slot.image); }
        catch (e) { console.error('Görsel yüklenemedi, mesaj yine de metin olarak gidecek:', e); }
      }

      let anySent = false;
      for (const c of targets) {
        const msg = String(slot.message || '')
          .replace(/\{isim\}/g, c.ad || '')
          .replace(/\{ad\}/g, c.ad || '');
        const ok = mediaId ? await sendImage(c.tel, mediaId, msg) : await sendText(c.tel, msg);
        if (ok) { sentTotal++; anySent = true; }
      }
      if (anySent) {
        slot.lastSentDate = todayISO;
        changed = true;
      }
    }

    // Sadece programın kendisini geri yazıyoruz (tüm veriyi değil) —
    // böylece panel aynı anda açıksa üzerine yazma riski en aza iner.
    if (changed) {
      await firebaseWrite(`diyetpro/${uid}/waSchedule`, data.waSchedule);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, sent: sentTotal }) };
  } catch (err) {
    console.error('Programlı gönderim hatası:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
