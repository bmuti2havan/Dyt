// Danisan "Su icmeyi hatirlat" ayarini acar/kapatir. Ayar shares/w_<token>/cfg altina yazilir,
// scheduled-water.js belirlenen saatlerde telefona bildirim gonderir.
const { firebaseSignIn, CLOUD_DB } = require('./_firebase-helper');
const { shareExists } = require('./push');
const res = (c, o) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o || {}) });
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return res(405);
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return res(400); }
  const tok = String(b.token || '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(tok) || tok === 'promo-landing') return res(400);
  try {
    if (!(await shareExists(tok))) return res(404);
    const { idToken } = await firebaseSignIn();
    const q = '.json?auth=' + encodeURIComponent(idToken);
    const put = (p, v) => fetch(CLOUD_DB + '/' + p + q, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
    if (b.on === true) {
      const cfg = { on: true, every: [60, 90, 120, 180].includes(+b.every) ? +b.every : 120, from: Math.max(0, Math.min(23, +b.from || 9)), to: Math.max(0, Math.min(24, +b.to || 21)) };
      await put('shares/w_' + tok + '/cfg', cfg);
      await put('shares/waterq/' + tok, Date.now());
    } else {
      await fetch(CLOUD_DB + '/shares/waterq/' + tok + q, { method: 'DELETE' });
      await put('shares/w_' + tok + '/cfg', { on: false });
    }
    return res(200, { ok: true });
  } catch (e) { return res(500, { error: String(e.message || e) }); }
};
