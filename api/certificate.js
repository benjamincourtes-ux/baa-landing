const crypto = require('crypto');
const admin = require('firebase-admin');

const PACKS = {
  decouverte: { level: 0, name: 'MLM Découverte', modules: ['dec-1', 'dec-2', 'dec-3', 'dec-4'] },
  fondations: { level: 1, name: 'MLM Fondations', modules: ['fond-5', 'fond-6', 'fond-7', 'fond-8', 'fond-9'] },
  elite: { level: 2, name: 'MLM Elite', modules: ['elite-1', 'elite-2', 'elite-3', 'elite-4'] },
  empire: { level: 3, name: 'MLM Empire', modules: ['empire-1', 'empire-2', 'empire-3', 'empire-4', 'empire-5', 'empire-6', 'empire-7'] }
};
const LEVELS = { decouverte: 0, fondations: 1, elite: 2, empire: 3, boutique: 4 };

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

function newNumber() {
  return `PP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const firebase = getAdmin();
    const decoded = await firebase.auth().verifyIdToken(token);
    const pack = req.body?.pack;
    const definition = PACKS[pack];
    if (!definition) return res.status(400).json({ error: 'Pack invalide' });

    const db = firebase.firestore();
    const profileRef = db.collection('acheteurs_formations').doc(decoded.uid);
    const result = await db.runTransaction(async (transaction) => {
      const profileSnap = await transaction.get(profileRef);
      if (!profileSnap.exists) throw new Error('Profil introuvable');
      const profile = profileSnap.data();
      if ((LEVELS[profile.pack] ?? -1) < definition.level) throw new Error('Accès non autorisé');
      const progression = profile.progression || {};
      if (!definition.modules.every((id) => progression[id] === 'done')) {
        throw new Error('Formation non terminée');
      }
      const existing = profile.certificatsObtenus?.[pack];
      if (existing) return existing;

      const now = new Date();
      const prenom = String(profile.prenom || profile.identifiant || '').trim();
      const nom = String(profile.nom || '').trim();
      const certificate = {
        numero: newNumber(), formationNom: definition.name,
        nomComplet: `${prenom} ${nom}`.trim(), dateObtention: now.toISOString(),
        dateAffichee: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
        statut: 'valide'
      };
      const publicRef = db.collection('certificats_publics').doc(certificate.numero);
      transaction.update(profileRef, { [`certificatsObtenus.${pack}`]: certificate });
      transaction.create(publicRef, {
        numero: certificate.numero, formationNom: certificate.formationNom,
        nomAffichagePublic: `${prenom} ${nom ? `${nom.charAt(0).toUpperCase()}.` : ''}`.trim(),
        dateObtention: certificate.dateObtention, dateAffichee: certificate.dateAffichee, statut: 'valide'
      });
      return certificate;
    });
    return res.status(200).json({ certificat: result });
  } catch (error) {
    const status = /terminée|autorisé|introuvable/.test(error.message) ? 403 : 500;
    return res.status(status).json({ error: status === 403 ? error.message : 'Impossible de délivrer le certificat' });
  }
};
