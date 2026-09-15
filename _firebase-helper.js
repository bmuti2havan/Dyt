// Bu dosya diger fonksiyonlar tarafindan kullanilir - tek basina calismaz.
// Panelin kendi Firebase bulut senkron sistemine (aynen panelin kullandigi
// email+sifre girisi ile) baglanip /diyetpro/{uid} altindaki veriyi okur/yazar.

const CLOUD_API = 'AIzaSyAYwAcAsMbjYN8xXdPwwpq1O3u5Rema85Y'; // panelin kendi Firebase anahtari (zaten herkese acik, HTML'de de var)
const CLOUD_DB = 'https://dyt-aysenur-korkmaz-default-rtdb.europe-west1.firebasedatabase.app';

async function firebaseSignIn() {
  const email = process.env.FIREBASE_EMAIL;
  const password = process.env.FIREBASE_PASSWORD;
  if (!email || !password) {
    throw new Error('FIREBASE_EMAIL / FIREBASE_PASSWORD Netlify ortam degiskenleri eksik');
  }
  const r = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + CLOUD_API,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const d = await r.json();
  if (!r.ok) throw new Error('Firebase giris hatasi: ' + (d.error && d.error.message));
  return { idToken: d.idToken, uid: d.localId };
}

async function firebaseGetData() {
  const { idToken, uid } = await firebaseSignIn();
  const url = `${CLOUD_DB}/diyetpro/${uid}.json?auth=${encodeURIComponent(idToken)}`;
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) throw new Error('Firebase okuma hatasi');
  return { data, uid, idToken };
}

async function firebaseWrite(path, value) {
  const { idToken, uid } = await firebaseSignIn();
  const url = `${CLOUD_DB}/${path.replace('{uid}', uid)}.json?auth=${encodeURIComponent(idToken)}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error('Firebase yazma hatasi (' + r.status + ')');
  return true;
}

module.exports = { firebaseSignIn, firebaseGetData, firebaseWrite, CLOUD_DB };
