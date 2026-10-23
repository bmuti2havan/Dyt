// Telefon bildirimleri (Web Push, VAPID). Mesaj icerigi tasinmaz: bildirim metnini sw.js gosterir.
//  - subscribe : danisanin telefonu abone olur (token gecerli bir danisan linki olmali)
//  - notify    : to='client' (sadece diyetisyen: Firebase idToken ile) | to='admin' (danisan yazinca diyetisyene)
// Gerekli Netlify ortam degiskeni: VAPID_PRIVATE_KEY   (FIREBASE_EMAIL / FIREBASE_PASSWORD zaten var)
const crypto = require('crypto');
const { firebaseSignIn, CLOUD_DB, CLOUD_API } = require('./_firebase-helper');
const VAPID_PUBLIC = 'BG0k8j09I5TZVqo-Hh38HtpOtEBXtTpAUepo_jqezLPuWWKv3x3RRJuylOLWmJjw4ISYCC4edtpuavWfpbwByhA';
const b64u = b => Buffer.from(b).toString('base64url');

function vapidJwt(endpoint, privB64u) {
  const pub = Buffer.from(VAPID_PUBLIC, 'base64url');
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: privB64u, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || 'mailto:iletisim@dytaysenurkorkmazantalya.com.tr' }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64u(sig);
}
async function sendOne(sub, privKey) {
  if (!sub || !sub.endpoint) return 0;
  const r = await fetch(sub.endpoint, { method: 'POST', headers: {
    Authorization: 'vapid t=' + vapidJwt(sub.endpoint, privKey) + ', k=' + VAPID_PUBLIC, TTL: '86400', Urgency: 'high', 'Content-Length': '0' } });
  return r.status;
}
const idOf = ep => crypto.createHash('sha1').update(ep).digest('hex').slice(0, 20);
const res = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj || {}) });
async function shareExists(tok) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(tok || '')) return false;
  const r = await fetch(CLOUD_DB + '/shares/' + tok + '/createdAt.json'); if (!r.ok) return false;
  return (await r.json()) != null;
}
async function isAdmin(authz) {
  const m = /^Bearer (.+)$/.exec(authz || ''); if (!m) return false;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + CLOUD_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) });
  if (!r.ok) return false; const d = await r.json(); const u = d.users && d.users[0]; if (!u) return false;
  const want = (process.env.FIREBASE_EMAIL || '').toLowerCase();
  return !want || (u.email || '').toLowerCase() === want;
}
async function pushAll(path, privKey) {
  const r = await fetch(CLOUD_DB + '/' + path + '.json'); if (!r.ok) return { sent: 0, gone: [] };
  const data = await r.json() || {}; let sent = 0; const gone = [];
  for (const id of Object.keys(data)) { try { const st = await sendOne(data[id], privKey); if (st >= 200 && st < 300) sent++; else if (st === 404 || st === 410) gone.push(id); } catch (e) {} }
  if (gone.length) { try { const { idToken } = await firebaseSignIn(); await Promise.all(gone.map(id => fetch(CLOUD_DB + '/' + path + '/' + id + '.json?auth=' + encodeURIComponent(idToken), { method: 'DELETE' }))); } catch (e) {} }
  return { sent, gone: gone.length };
}
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return res(405);
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) return res(500, { error: 'VAPID_PRIVATE_KEY Netlify ortam degiskeni eksik' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return res(400); }
  try {
    if (b.action === 'subscribe') {
      const s = b.sub; if (!s || !/^https:\/\//.test(s.endpoint || '') || String(s.endpoint).length > 600) return res(400);
      const clean = { endpoint: s.endpoint, keys: s.keys || {} };
      if (b.to === 'admin') { if (!(await isAdmin(event.headers.authorization || event.headers.Authorization))) return res(403); }
      else if (!(await shareExists(b.token))) return res(404);
      const { idToken } = await firebaseSignIn();
      const path = b.to === 'admin' ? 'shares/admin-push/' + idOf(s.endpoint) : 'shares/p_' + b.token + '/' + idOf(s.endpoint);
      const r = await fetch(CLOUD_DB + '/' + path + '.json?auth=' + encodeURIComponent(idToken), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean) });
      return res(r.ok ? 200 : 502);
    }
    if (b.action === 'notify') {
      if (b.to === 'client') {
        if (!(await isAdmin(event.headers.authorization || event.headers.Authorization))) return res(403);
        if (!(await shareExists(b.token))) return res(404);
        return res(200, await pushAll('shares/p_' + b.token, priv));
      }
      if (b.to === 'admin') {
        if (!(await shareExists(b.token))) return res(404);
        return res(200, await pushAll('shares/admin-push', priv));
      }
    }
    return res(400);
  } catch (e) { return res(500, { error: String(e.message || e) }); }
};
exports._test = { vapidJwt, sendOne, VAPID_PUBLIC };
