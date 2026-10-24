// Su hatirlaticisi: her 15 dakikada acik olan danisanlara, belirledikleri saat araliginda ve
// sikliginda telefona "su vakti" bildirimi gonderir. (Turkiye saati = UTC+3)
const { firebaseSignIn, CLOUD_DB } = require('./_firebase-helper');
const { pushAll } = require('./push');
exports.config = { schedule: '*/15 * * * *' };
const MSG = ['Bir bardak su içme zamanı 💧 Vücudun teşekkür edecek!', 'Su molası! 🥤 Küçük bir yudum bile iyi gelir.', 'Hey, su içmeyi unutma 💦 Kaçamak yok, su var!', 'Bir bardak su, bir tebessüm 😊💧', 'Su vakti! 🌿 Kendine iyi bak.', 'Susadığını fark etmeden iç 💧 Böyle devam!', 'Mini mola: bir bardak su ve derin nefes 🫒💧', 'Güzel ciltler su sever ✨💧 Bir bardak içelim mi?'];
exports.handler = async function () {
  const out = { sent: 0 };
  try {
    const { idToken } = await firebaseSignIn();
    const q = '.json?auth=' + encodeURIComponent(idToken);
    const idx = (await (await fetch(CLOUD_DB + '/shares/waterq' + q)).json()) || {};
    const now = Date.now(), hour = new Date(now + 3 * 3600e3).getUTCHours(), priv = process.env.VAPID_PRIVATE_KEY;
    if (!priv) return { statusCode: 200, body: JSON.stringify({ error: 'VAPID yok' }) };
    for (const tok of Object.keys(idx)) {
      try {
        const w = (await (await fetch(CLOUD_DB + '/shares/w_' + tok + q)).json()) || {};
        const cfg = w.cfg || {};
        if (!cfg.on) { await fetch(CLOUD_DB + '/shares/waterq/' + tok + q, { method: 'DELETE' }); continue; }
        const from = +cfg.from, to = +cfg.to;
        if (!(from <= to ? hour >= from && hour < to : hour >= from || hour < to)) continue;
        const last = (w.last && +w.last.at) || 0;
        if (now - last < (+cfg.every || 120) * 60e3 - 120e3) continue;
        const msg = MSG[Math.floor(Math.random() * MSG.length)];
        await fetch(CLOUD_DB + '/shares/w_' + tok + '/last' + q, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'water', at: now, msg }) });
        const r = await pushAll('shares/p_' + tok, priv);
        out.sent += r.sent || 0;
      } catch (e) { console.error('water', tok, String(e.message || e)); }
    }
    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (e) { return { statusCode: 500, body: JSON.stringify({ error: String(e.message || e) }) }; }
};
