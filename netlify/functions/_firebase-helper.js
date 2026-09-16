// Bu dosya diger fonksiyonlar tarafindan kullanilir - tek basina calismaz.
const CLOUD_API = 'AIzaSyAYwAcAsMbjYN8xXdPwwpq1O3u5Rema85Y';
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

/* ONEMLI: Panel, tum veriyi Firebase'e YAZARKEN cift kat JSON olarak
   yaziyor (once JSON.stringify(DB), sonra o metni bir daha JSON.stringify
   ile govdeye koyuyor). Yani Firebase'deki diyetpro/{uid} dugumunun
   DEGERI aslinda bir METIN (string) - icinde JSON formatinda DB var.
   Bu yuzden burada r.json() bize dogrudan bir STRING dondurur, onu bir
   kere daha JSON.parse etmemiz gerekir; aksi halde data.clients,
   data.waSchedule gibi alanlara hicbir zaman erisilemez ("Program yok",
   "Danisan bulunamadi" gibi yanlis sonuclar cikar). */
async function firebaseGetData() {
  const { idToken, uid } = await firebaseSignIn();
  const url = `${CLOUD_DB}/diyetpro/${uid}.json?auth=${encodeURIComponent(idToken)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Firebase okuma hatasi');
  const raw = await r.json(); // Firebase REST API JSON dondurur
  let data = raw;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  return { data, uid };
}

/* Butun diyetpro/{uid} dugumunu, PANELIN KENDI KULLANDIGI ayni cift-kat
   formatla geri yazar. Sunucu tarafinda bir seyi degistirdiginizde
   (orn. slot.lastSentDate, appt.reminded) BU fonksiyonu kullanin -
   dogrudan alt yola (diyetpro/{uid}/xxx) yazmayin, cunku ust dugum bir
   STRING oldugu icin alt yola yazmak veri yapisini bozar. */
async function firebaseWriteFullData(uid, dataObj) {
  const { idToken } = await firebaseSignIn();
  const url = `${CLOUD_DB}/diyetpro/${uid}.json?auth=${encodeURIComponent(idToken)}`;
  const asString = JSON.stringify(dataObj); // panelin ic katmani
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(asString) // dis katman - govdeye tekrar JSON olarak koyuyoruz
  });
  if (!r.ok) throw new Error('Firebase yazma hatasi (' + r.status + ')');
  return true;
}

/* Genel amacli, tek-katmanli bir alt yola yazma (orn. diyetpro_backups/{uid}/{tarih}
   gibi diyetpro/{uid} DISINDAKI yollar icin hala kullanilabilir). */
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

module.exports = { firebaseSignIn, firebaseGetData, firebaseWrite, firebaseWriteFullData, CLOUD_DB };
