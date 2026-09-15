const { firebaseGetData, firebaseWrite } = require('./_firebase-helper');

// Turkiye saatiyle 12:00 ve 18:00 = UTC 09:00 ve 15:00
// Netlify Scheduled Functions - cron her zaman UTC'dir.
exports.config = {
  schedule: '0 9,15 * * *'
};

exports.handler = async function () {
  try {
    const { data, uid } = await firebaseGetData();

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');

    // Yedegi ayri bir "backups" dugumune, tarih-saat damgasiyla yaziyoruz.
    // Boylece asil veriye hicbir sekilde dokunmuyoruz, sadece bir kopya olusuyor.
    await firebaseWrite(`diyetpro_backups/${uid}/${stamp}`, data);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, backedUpAt: stamp })
    };
  } catch (err) {
    console.error('Yedekleme hatasi:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String(err) })
    };
  }
};
