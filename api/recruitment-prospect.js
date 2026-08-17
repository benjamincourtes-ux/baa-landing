const admin = require('firebase-admin');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const requestsByIp = new Map();

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

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const entry = requestsByIp.get(ip) || { startedAt: now, count: 0 };
  if (now - entry.startedAt >= WINDOW_MS) { entry.startedAt = now; entry.count = 0; }
  entry.count += 1;
  requestsByIp.set(ip, entry);
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isValidUid(uid) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isRateLimited(req)) return res.status(429).json({ error: 'Too many requests' });

  const body = req.body || {};
  const uid = text(body.recruteurUid, 128);
  const prenom = text(body.prenom, 80);
  const nom = text(body.nom, 80);
  const email = text(body.email, 254).toLowerCase();
  const tel = text(body.tel, 40);
  const motiv = text(body.motiv, 2000);
  if (!isValidUid(uid) || !prenom || !nom || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid prospect data' });
  }

  try {
    const firebase = getAdmin();
    const db = firebase.firestore();
    const recruiterSnap = await db.collection('acheteurs_formations').doc(uid).get();
    const recruiter = recruiterSnap.exists ? recruiterSnap.data() : null;
    const tunnel = recruiter?.tunnelRecrutement;
    if (!tunnel || !tunnel.societe) return res.status(404).json({ error: 'Tunnel unavailable' });

    let recruiterEmail = text(recruiter.email, 254);
    if (!recruiterEmail) {
      try { recruiterEmail = (await firebase.auth().getUser(uid)).email || ''; } catch (_) { /* Optional legacy profile. */ }
    }
    await db.collection('prospects_recrutement_formations').add({
      prenom, nom, email, tel, motiv,
      recruteurUid: uid,
      recruteurPrenom: text(tunnel.prenom || recruiter.prenom, 80),
      recruteurEmail,
      date: new Date().toISOString(),
      statut: 'nouveau'
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Recruitment prospect error:', error.message);
    return res.status(500).json({ error: 'Unable to submit prospect' });
  }
};
