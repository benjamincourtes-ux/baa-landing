const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }) });
  }
  return admin;
}

function numberOrFallback(value, fallback) {
  return Number.isFinite(value) && value >= 0 && value <= 1000000 ? value : fallback;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  try {
    const db = getAdmin().firestore();
    const [statsSnap, membersSnap] = await Promise.all([
      db.collection('landing_stats').doc('global').get(),
      db.collection('users').where('accountStatus', '==', 'active').count().get()
    ]);
    const stats = statsSnap.exists ? statsSnap.data() : {};
    return res.status(200).json({
      membres: numberOrFallback(membersSnap.data().count, 0),
      formations: numberOrFallback(stats.formations, 30),
      outils: numberOrFallback(stats.outils, 30)
    });
  } catch (error) {
    console.error('Public statistics error:', error.message);
    return res.status(500).json({ error: 'Statistics unavailable' });
  }
};
