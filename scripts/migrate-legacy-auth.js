/*
 * Targeted, non-destructive migration for the historical Phoenix account.
 * The legacy "benjamin" account already has Firebase Auth, so this script
 * reuses that UID; it never creates an Auth user for this account.
 */
const admin = require('firebase-admin');

const dryRun = process.argv.includes('--dry-run');
const LEGACY_AUTH_EMAIL_OVERRIDES = Object.freeze({
  benjamin: 'benjamin.courtes@gmail.com'
});

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS doit pointer vers le fichier JSON du compte de service Firebase.');
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });

const db = admin.firestore();
const auth = admin.auth();
const failures = [];
const planned = [];
let migrated = 0;
let skipped = 0;

function copyableProfile(data, legacyDocumentId) {
  // Never move the legacy plaintext password into the new Firestore profile.
  const { motDePasse, ...profile } = data;
  return {
    ...profile,
    migratedFromLegacyProfileId: legacyDocumentId,
    authMigratedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function migrateExistingAuthAccount(doc, data, email) {
  let authUser;
  try {
    authUser = await auth.getUserByEmail(email);
  } catch (error) {
    failures.push({ id: doc.id, identifiant: data.identifiant || null, reason: 'Compte Firebase Auth existant introuvable.' });
    return;
  }

  const targetRef = db.collection('acheteurs_formations').doc(authUser.uid);
  const target = await targetRef.get();
  if (target.exists) {
    const targetData = target.data();
    if (targetData.migratedFromLegacyProfileId === doc.id) {
      skipped += 1;
      planned.push({ action: 'already-migrated', legacyProfileId: doc.id, targetProfileId: authUser.uid, createsAuthUser: false, modifiesUsersDocument: false });
      return;
    }
    failures.push({ id: doc.id, identifiant: data.identifiant || null, reason: 'Le profil de destination existe déjà : aucune donnée ne sera écrasée.' });
    return;
  }

  planned.push({
    action: 'copy-to-existing-auth-uid', legacyProfileId: doc.id, targetProfileId: authUser.uid,
    createsAuthUser: false, modifiesLegacyProfile: false, modifiesUsersDocument: false,
    copiesPassword: false
  });
  if (dryRun) { migrated += 1; return; }

  // create() fails rather than overwriting if the target appears concurrently.
  await targetRef.create(copyableProfile(data, doc.id));
  migrated += 1;
}

async function migrateProfile(doc) {
  const data = doc.data();
  const identifiant = String(data.identifiant || '').trim().toLowerCase();
  const overrideEmail = LEGACY_AUTH_EMAIL_OVERRIDES[identifiant];
  if (overrideEmail) {
    await migrateExistingAuthAccount(doc, data, overrideEmail);
    return;
  }

  // All other historical accounts remain untouched in this targeted run.
  skipped += 1;
}

(async () => {
  const snapshot = await db.collection('acheteurs_formations').get();
  for (const doc of snapshot.docs) await migrateProfile(doc);
  console.log(JSON.stringify({ dryRun, scanned: snapshot.size, migrated, skipped, planned, failures }, null, 2));
  if (failures.length) process.exitCode = 2;
})().catch((error) => { console.error(error); process.exitCode = 1; });
