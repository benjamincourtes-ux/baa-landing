const admin = require('firebase-admin');

const PUBLIC_TUNNEL_FIELDS = [
  'themeBanniere', 'formePhoto', 'photoURL', 'prenom', 'societe', 'offreTitre',
  'offreDate', 'description', 'avantages', 'projection', 'commPerso', 'commEquipe',
  'temoin1', 'temoin1Nom', 'temoin2', 'temoin2Nom', 'lienBoutique', 'lienParrainage',
  'faqQ1', 'faqR1', 'faqQ2', 'faqR2', 'faqQ3', 'faqR3', 'faqQ4', 'faqR4', 'faqQ5', 'faqR5'
];

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

function isValidUid(uid) {
  return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

function publicTunnel(data) {
  const result = {};
  PUBLIC_TUNNEL_FIELDS.forEach((field) => {
    if (typeof data[field] === 'string' || typeof data[field] === 'number') result[field] = data[field];
  });
  return result;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const uid = req.query.uid;
  if (!isValidUid(uid)) return res.status(400).json({ error: 'Invalid link' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = getAdmin().firestore();
    const snap = await db.collection('acheteurs_formations').doc(uid).get();
    const tunnel = snap.exists ? snap.data().tunnelRecrutement : null;
    if (!tunnel || !tunnel.societe) return res.status(404).json({ error: 'Tunnel unavailable' });
    return res.status(200).json({ tunnel: publicTunnel(tunnel) });
  } catch (error) {
    console.error('Public recruitment tunnel error:', error.message);
    return res.status(500).json({ error: 'Tunnel unavailable' });
  }
};
