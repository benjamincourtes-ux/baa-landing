const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const pack = session.metadata?.pack || '';
    const ref = session.metadata?.ref || '';
    const montant = session.amount_total / 100;
    const email = session.customer_details?.email || '';
    const nom = session.customer_details?.name || '';

    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
          })
        });
      }
      const db = admin.firestore();

      // 1. Sauvegarder la vente
      const venteRef = await db.collection('ventes_formations').add({
        pack, montant, email, nom, ref,
        sessionId: session.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. Calculer commission niveau 1 (40%)
      if (ref) {
        const commission1 = montant * 0.40;
        await db.collection('commissions').add({
          affilieRef: ref,
          venteId: venteRef.id,
          pack, montant,
          commission: commission1,
          niveau: 1,
          statut: 'en_attente',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 3. Chercher qui a recruté cet affilié (niveau 2)
        const affilieSnap = await db.collection('affilies').where('ref', '==', ref).limit(1).get();
        if (!affilieSnap.empty) {
          const affilieData = affilieSnap.docs[0].data();
          const recrutePar = affilieData.recrutePar || '';
          if (recrutePar) {
            const commission2 = montant * 0.05;
            await db.collection('commissions').add({
              affilieRef: recrutePar,
              venteId: venteRef.id,
              pack, montant,
              commission: commission2,
              niveau: 2,
              statut: 'en_attente',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      }

      // 4. Créer le compte affilié de l'acheteur
      await db.collection('affilies').add({
        email, nom, pack,
        ref: email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() + Math.floor(Math.random() * 1000),
        recrutePar: ref || '',
        actif: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('Vente traitée:', pack, montant, email);
    } catch (err) {
      console.error('Firebase error:', err);
    }
  }

  res.status(200).json({ received: true });
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
