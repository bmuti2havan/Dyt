// Panelin "Otomatik Mesaj Programı" (haftalık takvim) ekranında kaydedilen
// programları her 10 dakikada bir kontrol edip zamanı gelenleri gerçekten gönderir.
// Kişiler panelin 4 sabit grubuna (Yeni danışan / Kadın danışan / Erkek danışan / Özel danışan) göre bulunuyor.
//
// Güvenilirlik tasarımı: her slot için "bugün kime gönderildi" listesi
// (sentLog[tarih]) HER BAŞARILI gönderimden hemen sonra Firebase'e
// yazılıyor — toplu halde en sonda değil. Böylece fonksiyon yarıda
// kesilse (zaman aşımı, sunucu hatası, art arda iki çalışma üst üste
// binse) bile, bir kişiye aynı gün içinde iki kez mesaj gitmez: bir
// sonraki çalışma kaldığı yerden devam eder.
const { firebaseSignIn, CLOUD_DB } = require('./_firebase-helper');

exports.config = {
  schedule: '*/10 * * * *'
};

/* _firebase-helper'daki firebaseGetData/firebaseWriteFullData her çağrıda
   YENİDEN giriş yapıyor (yeni idToken alıyor). Bu fonksiyonda tek bir
   çalışma içinde çok sayıda yazma olabileceği için (her başarılı
   gönderimden sonra bir yazma), aynı idToken'ı tekrar kullanıyoruz —
   hem daha hızlı hem de Netlify'nin fonksiyon zaman sınırına takılma
   riskini azaltıyor. */
async function readData(idToken, uid) {
  const url = `${CLOUD_DB}/diyetpro/${uid}.json?auth=${encodeURIComponent(idToken)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Firebase okuma hatası');
  const raw = await r.json();
  let data = raw;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  return data;
}
async function writeData(idToken, uid, dataObj) {
  const url = `${CLOUD_DB}/diyetpro/${uid}.json?auth=${encodeURIComponent(idToken)}`;
  const asString = JSON.stringify(dataObj);
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(asString)
  });
  if (!r.ok) throw new Error('Firebase yazma hatası (' + r.status + ')');
  return true;
}

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
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'text',
        text: { body: message }
      })
    });
    return resp.ok;
  } catch (e) {
    console.error('sendText hatası:', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Panelde eklenen görsel base64 (data:...) olarak Firebase'de saklanıyor.
// WhatsApp'a link olarak gönderemeyiz, önce Meta'nın medya sunucusuna yüklüyoruz.
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
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'image',
        image: { id: mediaId, caption: caption || undefined }
      })
    });
    return resp.ok;
  } catch (e) {
    console.error('sendImage hatası:', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Bir kişiye kalıcı olarak ulaşılamıyorsa (geçersiz numara, süresi dolmuş
// token vb.) bu limit olmadan fonksiyon o kişiyi gün boyunca her 10
// dakikada bir yeniden dener — gereksiz Meta API çağrısı ve günlük şişmesi
// yaratır. 3 denemeden sonra o gün için bırakılır (ertesi uygun günde
// yeniden denenir); kaç kişiye gidemediği panelde görünür.
const MAX_ATTEMPTS_PER_DAY = 3;

// sentLog/failLog'u sadece son 7 günle sınırlı tutar, DB'nin sonsuza kadar büyümesini engeller.
function trimLog(log, todayISO) {
  if (!log) return;
  const keep = new Set();
  const base = new Date(todayISO + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() - i * 86400000);
    keep.add(d.toISOString().slice(0, 10));
  }
  Object.keys(log).forEach(k => { if (!keep.has(k)) delete log[k]; });
}

exports.handler = async function () {
  if (!TOKEN || !PHONE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'WA_TOKEN / WA_PHONE_ID eksik' }) };
  }

  try {
    const { idToken, uid } = await firebaseSignIn();
    const data = await readData(idToken, uid);
    if (!data || !Array.isArray(data.waSchedule) || !data.waSchedule.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, note: 'Program yok' }) };
    }

    const now = turkeyNow();
    const todayName = WA_DAYS_BY_GETDAY[now.getDay()];
    const todayISO = now.toISOString().slice(0, 10);
    const nowHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    const contacts = Array.isArray(data.wa) ? data.wa : [];
    let sentTotal = 0;

    for (const slot of data.waSchedule) {
      if (!slot.days || !slot.days.includes(todayName)) continue;
      if (!slot.time || nowHHMM < slot.time) continue;      // saati henüz gelmedi
      if (slot.lastSentDate === todayISO) continue;         // bugün için bu slot zaten tamamlandı

      if (!slot.sentLog || typeof slot.sentLog !== 'object') slot.sentLog = {};
      if (!Array.isArray(slot.sentLog[todayISO])) slot.sentLog[todayISO] = [];
      if (!slot.failLog || typeof slot.failLog !== 'object') slot.failLog = {};
      if (!slot.failLog[todayISO] || typeof slot.failLog[todayISO] !== 'object') slot.failLog[todayISO] = {};
      const alreadySentIds = new Set(slot.sentLog[todayISO]);
      const attempts = slot.failLog[todayISO];
      const givenUpIds = new Set(Object.keys(attempts).filter(id => attempts[id] >= MAX_ATTEMPTS_PER_DAY));

      // "Çözüldü" (resolved) = ya gönderildi ya da deneme hakkı bitti.
      const isResolved = c => alreadySentIds.has(c.id) || givenUpIds.has(c.id);
      const allTargets = contacts.filter(c => c && c.tel && slot.groups && slot.groups.includes(c.grup));
      const targets = allTargets.filter(c => !isResolved(c));

      if (!targets.length) {
        // Hedef yok, hepsine zaten gönderilmiş ya da deneme hakkı bitenler kaldı — bugün için kapat.
        slot.lastSentDate = todayISO;
        trimLog(slot.sentLog, todayISO);
        trimLog(slot.failLog, todayISO);
        try { await writeData(idToken, uid, data); } catch (e) { console.error('Kayıt hatası:', e); }
        continue;
      }

      let mediaId = null;
      if (slot.image) {
        try { mediaId = await uploadMedia(slot.image); }
        catch (e) { console.error('Görsel yüklenemedi, mesaj yine de metin olarak gidecek:', e); }
      }

      for (const c of targets) {
        const msg = String(slot.message || '')
          .replace(/\{isim\}/g, c.ad || '')
          .replace(/\{ad\}/g, c.ad || '');
        const ok = mediaId ? await sendImage(c.tel, mediaId, msg) : await sendText(c.tel, msg);
        if (ok) {
          sentTotal++;
          slot.sentLog[todayISO].push(c.id);
        } else {
          attempts[c.id] = (attempts[c.id] || 0) + 1;
        }
        // HER denemeden hemen sonra kaydet (başarılı ya da başarısız):
        // fonksiyon burada kesilse bile bir sonraki çalışma bu kişiyi
        // doğru durumda görür — ne tekrar gönderir ne de sınırsız dener.
        try { await writeData(idToken, uid, data); }
        catch (e) { console.error('Kayıt başarısız, sıradaki kişiye geçiliyor (bir sonraki 10 dakikalık turda bu adım yeniden denenir):', e); }
      }

      // (isResolved yukarıdaki sabit Set'leri kullanıyordu; burada bilerek
      // slot.sentLog/attempts'i DOĞRUDAN okuyoruz çünkü döngü sırasında
      // güncellendiler — isResolved'ın yakaladığı Set'ler artık bayat.)
      const stillPending = allTargets.some(c =>
        !slot.sentLog[todayISO].includes(c.id) && (attempts[c.id] || 0) < MAX_ATTEMPTS_PER_DAY);
      if (!stillPending) {
        slot.lastSentDate = todayISO;
        trimLog(slot.sentLog, todayISO);
        trimLog(slot.failLog, todayISO);
        try { await writeData(idToken, uid, data); } catch (e) { console.error('Kayıt hatası:', e); }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, sent: sentTotal }) };
  } catch (err) {
    console.error('Programlı gönderim hatası:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
