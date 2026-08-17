# Migration Firebase Authentication

1. Exporter Firestore et relever les règles actuellement déployées.
2. Dans un environnement sûr, définir `GOOGLE_APPLICATION_CREDENTIALS` vers le chemin absolu du fichier JSON du compte de service Firebase. Ne jamais ajouter ce fichier ou son contenu au dépôt.
3. Exécuter `node scripts/migrate-legacy-auth.js --dry-run`, puis corriger chaque entrée de `failures`.
4. Exécuter `node scripts/migrate-legacy-auth.js`. Chaque document `acheteurs_formations` garde son identifiant : cet identifiant devient l'UID Firebase Auth, sans déplacer les données ni les droits.
5. Vérifier des comptes migrés, déployer `firestore.rules` avec `firebase deploy --only firestore:rules`, puis déployer le client Vercel.

Un compte sans e-mail, sans mot de passe historique, ou avec un mot de passe de moins de six caractères est volontairement laissé intact et signalé dans `failures` : il requiert une invitation ou une réinitialisation manuelle, sans perte de profil.
