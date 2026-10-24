// Danisan bir sey yazinca / fotograf atinca tarayicisi buraya haber verir.
// Mesaj "shares/q_<token>" kuyruguna yazilir; scheduled-autoreply.js belirlenen sure
// icinde diyetisyen cevap vermediyse otomatik cevabi uretir.
const { firebaseSignIn, CLOUD_DB } = require('./_firebase-helper');
const { shareExists } = require('./push');
const res = (c, o) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o || {}) });

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return res(405);
  let b;
  try { b = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}')); }
  catch (e) { return res(400); }
  const tok = String(b.token || '');
  const e = b.entry || {};
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(tok) || !['clientNote', 'dailyMeal', 'mealPhoto'].includes(e.type)) return res(400);
  const text = String(e.text || '').slice(0, 600);
  let photo = typeof e.photo === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(e.photo) ? e.photo : '';
  if (photo.length > 4.5e6) photo = '';
  if (!text && !photo) return res(200, { queued: 0 });
  try {
    if (!(await shareExists(tok))) return res(404);
    const { idToken } = await firebaseSignIn();
    const now = Date.now();
    const id = 'q' + now + Math.floor(Math.random() * 1000);
    const item = { id, type: e.type, text, mealType: String(e.mealType || '').slice(0, 40), mealName: String(e.mealName || '').slice(0, 80), photo, at: now };
    const r = await fetch(CLOUD_DB + '/shares/q_' + tok + '/' + id + '.json?auth=' + encodeURIComponent(idToken), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
    if (r.ok) await fetch(CLOUD_DB + '/shares/autoq/' + tok + '.json?auth=' + encodeURIComponent(idToken), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: String(now) });
    return res(r.ok ? 200 : 502, { queued: r.ok ? 1 : 0 });
  } catch (err) { return res(500, { error: String(err.message || err) }); }
};
