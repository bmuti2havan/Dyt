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
