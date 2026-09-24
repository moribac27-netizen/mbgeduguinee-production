# Sécurité et déploiement — MBGEduGuinée

## Important avant tout déploiement

- Le projet doit utiliser **un seul projet Supabase** côté serveur et navigateur.
- `SUPABASE_URL` et `VITE_SUPABASE_URL` doivent pointer vers le même `project-ref`.
- `SUPABASE_PUBLISHABLE_KEY` et `VITE_SUPABASE_PUBLISHABLE_KEY` doivent appartenir à ce même projet.
- `SUPABASE_SERVICE_ROLE_KEY` est strictement serveur et ne doit jamais être préfixée par `VITE_`.
- Ne commitez jamais `.env`. Utilisez `.env.example` comme modèle.

## Clés exposées dans une ancienne version

L'archive analysée contenait des secrets dans `.env` et dans `definir-mot-de-passe.mjs`. Ces fichiers ne doivent pas être livrés dans l'archive finale.

**Action requise côté Supabase :** révoquer/régénérer toute ancienne clé service-role qui a pu être exposée dans le dépôt ou son historique Git. Cette opération n'est pas exécutée automatiquement par la correction locale.

## Configuration Vercel

Configurer les variables suivantes dans Production et Preview :

- `APP_URL`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Toutes les variables Supabase doivent référencer le même projet.
