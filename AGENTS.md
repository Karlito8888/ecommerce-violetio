# AGENTS.md — E-commerce

Plateforme e-commerce multi-marchand (web TanStack Start + mobile Expo Router) branchée sur
l'API affiliation **Violet.io**, backend **Convex self-hosted** (binaire Rust). Migration en
cours depuis Supabase.

## Ce qui n'est PAS ici

| Quoi                                                                                                                                                      | Où                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Règles de travail générales — vérifier avant d'affirmer, DRY/KISS/YAGNI, périmètre, échelle de doc officielle, outils obligatoires, git, accord explicite | `~/.omp/agent/RULES.md`           |
| Le poste, les graphes de code, les workflows                                                                                                              | `~/.omp/agent/AGENTS.md`          |
| Faits durables du projet — versions, gate mesuré, dettes, points ouverts                                                                                  | `~/.omp/agent/bank/E-commerce.md` |

## Structure (Bun workspaces)

```
apps/
  web/          # TanStack Start (Vite), file-based routing
  mobile/       # Expo Router, React Native
packages/
  shared/       # @ecommerce/shared — logique métier, types, hooks
  ui/           # @ecommerce/ui — design tokens, composants cross-platform
  config/       # @ecommerce/config — configuration partagée
convex/         # backend Convex — schema, functions, auth, webhooks, crons
supabase/       # legacy — migrations SQL + Edge Functions, à supprimer en fin de migration
```

Packages consommés en `workspace:*`, imports TypeScript source directs (pas de build de package).

## Stack (versions lues dans les `package.json`)

Expo `~55.0.17` · React Native `0.83.6` · React `19.2.0` (pin racine, ne jamais bumper seul) ·
Vite `^7.3.1` · TanStack Router `^1.166.2` + Query `^5.90.21` · Convex `^1.39.1` +
`@convex-dev/auth` `^0.0.92` · Supabase `^2.100.1` (encore une dépendance active, cf. migration
ci-dessous).

**`vitest` désaligné entre workspaces** : racine et `packages/shared` sont sur `^4.x`,
`apps/web` est resté sur `^3.0.5`. `vite-tsconfig-paths` est resté sur `^5.1.4` (v6 dispo, pas
bumpé). Bump non fait volontairement — vérifier avant de le faire en aveugle.

## Commandes

```bash
bun run dev              # web (TanStack Start, port 3000)
bun run dev:mobile       # Expo mobile
npx convex dev           # backend Convex local (binaire Rust auto-téléchargé)
npx convex deploy        # déploie les fonctions Convex
bun run gate             # = bun run check, gate complet
```

`bun run check` (le gate) enchaîne, dans cet ordre, **5 étapes déjà agrégées** dans
`package.json` racine — rien à recomposer : `format` (prettier --check) → `lint` (eslint
`apps/ packages/ convex/` `--max-warnings 0`) → `typecheck` (web + mobile) → `test` (vitest :
web → shared → mobile → convex, dans cet ordre) → `build` (web).

⚠️ **`node_modules` est absent de ce dépôt.** Le gate n'a jamais été lancé ici — statut réel
inconnu, rien de ce qui suit n'a été éprouvé par l'exécution, seulement vérifié par lecture du
code.

## Migration Supabase → Convex — état réel vérifié dans le code

Le guide complet est `MIGRATION-SUPABASE-TO-CONVEX.md` (2926 lignes) — à lire avant tout
changement backend. Son propre suivi de phases dit : phases 0 à 9 **terminées**, phase 10
(tests Convex) **P0/P1/P2 terminés, P3 restant** (webhooks + notifications, non bloquant),
phase 11 (nettoyage) **en cours**, 6/8 findings corrigés.

Ce qui reste, vérifié par lecture directe du code (pas seulement par la doc, qui a des
affirmations obsolètes — ex. son F4 dit « 28 fichiers clients Supabase morts » ;
`packages/shared/src/clients/` n'en contient plus que 2 aujourd'hui) :

- **`apps/web/src/server/supabaseServer.ts`** — encore le client Supabase actif, consommé par
  8 fichiers (`orderHandlers.ts`, `cartSync.ts`, `guestOrderHandlers.ts`, `cartActions.ts`,
  `checkout.ts` + les 3 routes ci-dessous).
- **3 routes API web valident encore un JWT Supabase** au lieu de Convex Auth :
  `routes/api/cart/user.ts`, `routes/api/cart/claim.ts`, `routes/api/guest-order-lookup.ts`.
- **`scripts/generate-sitemap.ts`**, **`packages/shared/src/utils/orderPersistence.ts`**,
  **`errorLogger.ts`**, **`packages/shared/src/types/auth.types.ts`** importent encore
  `@supabase/supabase-js` ou `@supabase/ssr`.
- **`supabase/`** (79 fichiers — migrations SQL + Edge Functions) toujours présent, à
  supprimer une fois les données exportées vers Convex (`npx convex import`).
- `@supabase/supabase-js` + `@supabase/ssr` toujours dans `apps/web/package.json` et
  `packages/shared/package.json`.
- `.env.example` porte encore les variables `SUPABASE_*` / `VITE_SUPABASE_*` /
  `EXPO_PUBLIC_SUPABASE_*` en clair (à côté des `CONVEX_*` commentées, auto-configurées par
  `npx convex dev`) — les deux backends coexistent tant que la migration n'est pas finie.

Comparer à `myggv`, où la même migration est terminée et vérifiée — les mentions « Supabase »
qui y restent sont uniquement du JSDoc historique.

## Architecture backend

- **Un seul backend pour les deux plateformes** : web et mobile partagent le même Convex
  self-hosted. Web = Convex client + TanStack Start server functions (API Violet, secrets
  `VIOLET_APP_SECRET`). Mobile = Convex client direct + `EXPO_PUBLIC_API_URL` → routes web
  uniquement pour Violet.
- **Self-hosted only** — binaire Rust précompilé, pas de cloud, pas de Docker.
  `skipConvexDeploymentUrlCheck: true` obligatoire sur `ConvexReactClient` (URL non standard).
- **Auth** : `@convex-dev/auth` (email/password, OAuth Google/Apple) + modèle **localId**
  (`crypto.randomUUID()` en localStorage/SecureStore) pour les visiteurs anonymes — pas de
  session serveur, migré vers le userId via `migrateAnonymousData()` à l'inscription. Admin :
  `userProfiles.isAdmin` vérifié dans chaque query/mutation via `assertAdmin()`.
- **Webhooks Violet** traités par une HTTP Action Convex (`convex/webhooks/violet.ts`),
  persistés dans les tables Convex — queries réactives par défaut, pas de WebSocket manuel.

## Contraintes de code

- **Pas de Tailwind** — CSS vanilla + BEM (`.block__element--modifier`) exclusivement.
  `apps/web/src/styles/` : ordre d'import obligatoire
  `tokens → base → utilities → components → pages`.
- **Pin Expo** : `react` (19.2.0), `react-native` (0.83.6), `reanimated` (4.2.1) ne se bumpent
  jamais indépendamment d'une montée de SDK Expo.
- **Alias de chemins** : web `#/*` et `@/*` → `./src/*`, `#convex/*` → `../../convex/*` ;
  mobile `@/*` → `./src/*`, `@/assets/*` → `./assets/*`, `#convex/*` idem.
- **Prettier** : guillemets doubles, points-virgules, trailing commas, largeur 100.
- **ESLint** (flat config) : `no-console: warn`, `no-debugger: error`, var inutilisée préfixée
  `_` pour être ignorée. Exception mobile : `@typescript-eslint/no-require-imports` désactivé.

## Variables d'environnement

Source unique : `.env.example` à la racine → copier en `.env.local`, ne jamais créer d'autre
fichier `.env.*.example`. Web lit `VITE_*`, mobile lit `EXPO_PUBLIC_*`, le backend Convex lit
ses propres vars via `npx convex env set` (jamais commitées).

## Documentation locale

- Violet.io : `/home/charles/Documents/Documentations Officielles/violet-io.md` — ne jamais
  coder contre son API sans l'avoir consultée.
- Convex : `docs/convex.md` — schema, queries/mutations/actions, auth, HTTP actions,
  self-hosting, React Native, tests.
