// Tanitim sayfasi olay sayaci: kaynak (?kaynak=) ve buton tiklamalarini gunluk sayar.
const { firebaseSignIn, CLOUD_DB } = require('./_firebase-helper');
const EV = ['view', 'wa', 'ig', 'form', 'call'];
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  try {
    const b = JSON.parse(event.body || '{}');
    const ev = EV.includes(b.ev) ? b.ev : null;
    if (!ev) return { statusCode: 400, body: '' };
    const src = String(b.src || 'dogrudan').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'dogrudan';
    const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    const { idToken } = await firebaseSignIn();
    const url = `${CLOUD_DB}/promo_stats/${day}/${src}/${ev}.json?auth=${encodeURIComponent(idToken)}`;
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '.sv': { increment: 1 } }) });
    return { statusCode: r.ok ? 204 : 502, body: '' };
  } catch (e) { return { statusCode: 500, body: '' }; }
};
