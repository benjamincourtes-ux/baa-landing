const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PACKS = {
  'decouverte': {
    priceId: 'price_1Tv0cD2MXwGWfMm8NQwx5ZdZ',
    nom: 'MLM Découverte',
    paiementMax: 2
  },
  'fondations': {
    priceId: 'price_1TuxPh2MXwGWfMm8UTh6VmzD',
    nom: 'MLM Fondations',
    paiementMax: 4
  },
  'elite': {
    priceId: 'price_1TuxRh2MXwGWfMm8bgM8CW2X',
    nom: 'MLM Elite',
    paiementMax: 4
  },
  'empire': {
    priceId: 'price_1Tv0eV2MXwGWfMm8mvcmHKCz',
    nom: 'MLM Empire',
    paiementMax: 4
  },
  'boutique': {
    priceId: 'price_1Tv0gN2MXwGWfMm8kthrfG28',
    nom: 'Boutique clé en main',
    paiementMax: 4
  }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { pack, ref } = req.body;
    if (!pack || !PACKS[pack]) {
      res.status(400).json({ error: 'Pack invalide' });
      return;
    }

    const packData = PACKS[pack];
    const successUrl = `https://baa-landing.vercel.app/merci?pack=${pack}${ref ? '&ref=' + ref : ''}`;
    const cancelUrl = `https://baa-landing.vercel.app/formations`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'klarna'],
      line_items: [{
        price: packData.priceId,
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        pack: pack,
        ref: ref || '',
        nomPack: packData.nom
      },
      payment_intent_data: {
        metadata: {
          pack: pack,
          ref: ref || ''
        }
      }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
