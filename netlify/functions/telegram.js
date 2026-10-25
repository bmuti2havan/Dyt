// Telegram botu: diyetisyen, danisan mesajini Telegram'da "Yanitla" ile cevaplar → danisanin sohbetine duser.
// Gerekli Netlify ortam degiskenleri: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET
const { firebaseSignIn, CLOUD_DB } = require('./_firebase-helper');
const { pushAll, shareExists, setLast } = require('./push');
const res = (c, o) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o || {}) });
const api = (bot, m, b) => fetch('https://api.telegram.org/bot' + bot + '/' + m, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const say = (bot, chat, text, replyTo) => api(bot, 'sendMessage', { chat_id: chat, text, reply_to_message_id: replyTo, allow_sending_without_reply: true, disable_web_page_preview: true }).catch(() => {});

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return res(200);
  const bot = process.env.TELEGRAM_BOT_TOKEN, secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!bot || !secret) return res(500, { error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET eksik' });
  const hdr = event.headers['x-telegram-bot-api-secret-token'] || event.headers['X-Telegram-Bot-Api-Secret-Token'];
  if (hdr !== secret) return res(403);
  let u; try { u = JSON.parse(event.body || '{}'); } catch (e) { return res(200); }
  const m = u.message; if (!m || !m.chat) return res(200);
  const chat = String(m.chat.id), owner = String(process.env.TELEGRAM_CHAT_ID || '');
  const text = (m.text || '').trim();
  try {
    if (!owner || chat !== owner) {
      if (text.startsWith('/start')) await say(bot, chat, 'Merhaba! Senin sohbet kimligin: ' + chat + '\nBunu Netlify > Environment variables > TELEGRAM_CHAT_ID olarak ekleyip siteyi yeniden yayinla.');
      return res(200);
    }
    if (text.startsWith('/start')) { await say(bot, chat, 'Hazir ✅ Danisan yazinca mesaj buraya duser. Cevaplamak icin mesaji Yanitla (Reply) ile sec ve yaz.'); return res(200); }
    const rm = m.reply_to_message;
    if (!rm) { await say(bot, chat, 'Cevaplamak icin danisandan gelen mesaji Yanitla (Reply) ile sec, sonra yaz.', m.message_id); return res(200); }
    if (!text) { await say(bot, chat, 'Su an yalnizca yazi mesajlari gonderebiliyorum.', m.message_id); return res(200); }
    let tok = '';
    for (const e of (rm.entities || [])) { const x = e.url && /[?&]v=([A-Za-z0-9_-]{8,80})/.exec(e.url); if (x) { tok = x[1]; break; } }
    if (!tok || !(await shareExists(tok))) { await say(bot, chat, 'Bu mesajdan danisani bulamadim. Danisandan gelen bir mesaji yanitla.', m.message_id); return res(200); }
    const { idToken } = await firebaseSignIn();
    const id = 'tg' + m.message_id + '-' + Math.abs(m.date || 0);
    const entry = { id, kind: 'msg', ref: '', label: '', date: new Date((m.date || Date.now() / 1000) * 1000 + 3 * 3600e3).toISOString().slice(0, 10), heart: false, emoji: '', text: text.slice(0, 600), at: (m.date || Math.floor(Date.now() / 1000)) * 1000 };
    const r = await fetch(CLOUD_DB + '/shares/t_' + tok + '/' + id + '.json?auth=' + encodeURIComponent(idToken), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    if (!r.ok) { await say(bot, chat, 'Kaydedilemedi (' + r.status + ')', m.message_id); return res(200); }
    let sent = 0;
    if (process.env.VAPID_PRIVATE_KEY) { try { await setLast(tok, 'msg', text); sent = (await pushAll('shares/p_' + tok, process.env.VAPID_PRIVATE_KEY)).sent; } catch (e) {} }
    await say(bot, chat, '✓ Danisana iletildi' + (sent ? ' (telefonuna bildirim gitti)' : ''), m.message_id);
  } catch (e) { await say(bot, chat, 'Hata: ' + String(e.message || e).slice(0, 120)); }
  return res(200);
};
