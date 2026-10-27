// Tek seferlik kurulum: Telegram webhook'unu bu siteye baglar.
// Token ve sifre Netlify ortam degiskenlerinden okunur, cevapta gosterilmez.
exports.handler = async function () {
  const bot = process.env.TELEGRAM_BOT_TOKEN, secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const out = (o) => ({ statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(o, null, 2) });
  if (!bot || !secret) return out({ ok: false, eksik: [!bot && 'TELEGRAM_BOT_TOKEN', !secret && 'TELEGRAM_WEBHOOK_SECRET'].filter(Boolean) });
  const site = 'https://takip.dytaysenurkorkmazantalya.com.tr';
  try {
    const me = await (await fetch('https://api.telegram.org/bot' + bot + '/getMe')).json();
    if (!me.ok) return out({ ok: false, adim: 'getMe', aciklama: me.description || 'token gecersiz' });
    const r = await (await fetch('https://api.telegram.org/bot' + bot + '/setWebhook', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: site + '/.netlify/functions/telegram', secret_token: secret, allowed_updates: ['message'] }) })).json();
    const info = await (await fetch('https://api.telegram.org/bot' + bot + '/getWebhookInfo')).json();
    return out({ ok: !!r.ok, bot: '@' + (me.result && me.result.username), aciklama: r.description, webhook_url: info.result && info.result.url, son_hata: info.result && info.result.last_error_message || null, chat_id_var: !!process.env.TELEGRAM_CHAT_ID });
  } catch (e) { return out({ ok: false, hata: String(e.message || e).slice(0, 150) }); }
};
