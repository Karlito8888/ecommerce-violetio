# Migration Supabase → Convex — Guide Complet

> **Objectif** : Convertir le backend de ce monorepo e-commerce (Maison Émile) de Supabase vers **Convex self-hosted** (binaire Rust, pas de Docker, pas de cloud), tout en conservant l'intégration Violet.io, les deux plateformes (web TanStack Start + mobile Expo), et les fonctionnalités existantes.
>
> **Contrainte architecturale** : Convex est utilisé **exclusivement en self-hosted via le binaire Rust précompilé**. Jamais le cloud Convex, jamais Docker — en développement comme en production.

---

## 📚 Documentation officielle — Lecture obligatoire avant implémentation

> **⚠️ Règle absolue** : Avant d'implémenter **n'importe quelle phase** de cette migration, **toujours consulter les documentations officielles** en utilisant le skill `crawl4ai` pour explorer les docs en profondeur.
>
> Ne **jamais** coder à partir de ce guide seul — il est une feuille de route, pas une référence API. Les docs officielles sont la source de vérité pour les signatures, les patterns, et les best practices.

### Sources de référence

| Documentation | Fichier local | Contenu | Quand consulter |
|---------------|---------------|---------|----------------|
| **Violet.io API** | `docs/violetio.md` (36 KB) | 120+ endpoints, catalogue, panier, checkout, commandes, webhooks, marchands | Avant les phases 6 (schéma), 7 (auth localId), 8 (fonctions), 12 (webhooks), et **toute** interaction avec l'API Violet |
| **Convex** | `docs/convex.md` (38 KB) | Schema, queries, mutations, actions, auth, HTTP actions, self-hosting, TanStack Start, React Native, File Storage, Cron, Tests | Avant **chaque** phase de cette migration — c'est la référence API Convex |

### Procédure obligatoire avant chaque phase

```
1. Identifier la phase à implémenter (ex: Phase 7 — Authentification)
2. Ouvrir le skill crawl4ai : « explore docs/convex.md pour auth setup, @convex-dev/auth, providers, callbacks »
3. Ouvrir le skill crawl4ai : « explore docs/violetio.md pour les endpoints cart, customer, et le flux guest checkout »
4. Comparer avec le présent guide pour valider l'approche
5. Coder en suivant les best practices des docs officielles
```

### Principes DRY et KISS

Ce guide est intentionnellement **déclaratif** (le QUOI), pas prescriptif (le COMMENT exact). Les exemples de code sont des **squelettes** pour illustrer la migration — pas du code production-ready à copier-coller aveuglément.

- **DRY** (*Don't Repeat Yourself*) : Les patterns récurrents (upsert, pagination, cascade delete, admin check) doivent être factorisés dans `convex/lib/` une seule fois, puis réutilisés. Ne pas dupliquer la logique Supabase en logique Convex table par table.
- **KISS** (*Keep It Simple, Stupid*) : Convex élimine une énorme complexité Supabase (plus de RLS, plus de migrations SQL, plus de Realtime manuel, plus de Edge Functions). **Ne pas réintroduire cette complexité**. Si une solution semble compliquée, consulter les docs Convex — il y a probablement un pattern natif plus simple.

### Points où DRY/KISS s'appliquent particulièrement

| Tentation complexe | Approche simple (DRY/KISS) |
|-------------------|--------------------------|
| Réécrire chaque RLS policy en vérification Convex | Utiliser `assertAdmin()` + `assertOwner(ctx, userId)` — 2 utilitaires pour toutes les fonctions |
| Recréer les 47 migrations SQL en Convex | **Un seul** `schema.ts` déclaratif — Convex gère les migrations automatiquement |
| Recoder les subscriptions Realtime pour chaque table | **Rien à coder** — les queries Convex sont réactives par défaut |
| Dupliquer la logique Violet API dans chaque action | Un seul `convex/lib/violetApi.ts` avec auth token management centralisé |
| Wrapper chaque client Supabase dans un wrapper Convex | **Supprimer** les 14 fichiers `clients/*.ts` — les hooks consomment Convex directement |
| Créer un système d'anonymous auth custom | **localId** = `crypto.randomUUID()` dans localStorage — 10 lignes, pas de session serveur |

### Méthodologie — Web + Mobile + Tests avant de passer à la suite

> **⚠️ Règle stricte** : Chaque phase doit être validée de bout en bout sur **les deux plateformes** avant de passer à la suivante. Ce n'est pas un guide qu'on parcourt linéairement en espérant que « ça marchera au bout » — c'est une séquence de **mises en production incrémentales**.

Le projet est un **monorepo biplateforme**. Chaque changement backend impacte **à la fois** le web (TanStack Start) et le mobile (Expo). La méthode obligatoire pour chaque phase est :

```
Pour chaque phase N :

  1. 📖 Docs     → crawl4ai sur docs/convex.md (+ docs/violetio.md si pertinent)
  2. ⚙️  Backend   → Implémenter les fonctions Convex (schema, queries, mutations, actions)
  3. 🌐 Web      → Adapter apps/web (providers, routes, hooks, pages)
  4. 📱 Mobile   → Adapter apps/mobile (layout, context, hooks, écrans)
  5. ✅ Tests    → Écrire les tests (convex-test + tests web + tests mobile)
  6. 🔒 Valider  → GREEN sur les deux plateformes + tests passing → passer à N+1
```

**Ne jamais** passer à la phase suivante si :
- ❌ Le web fonctionne mais le mobile est cassé (ou inversement)
- ❌ Les tests ne passent pas
- ❌ La phase précédente a des TODOs ou des `// FIXME`

#### Checklist de validation par phase

| Étape | Web | Mobile | Tests |
|-------|-----|--------|-------|
| Schema déployé | `npx convex dev` sans erreur | — | — |
| Convex Auth configuré | Login/signup web fonctionnel | Login/signup mobile fonctionnel | Tests auth verts |
| Queries/Mutations | Pages web affichent les données | Écrans mobiles affichent les données | Tests fonctions verts |
| Clients partagés refactorés | Hooks web utilisent Convex | Hooks mobile utilisent Convex | Tests hooks verts |
| Webhooks Violet | Dashboard reçoit les événements | Idem (même backend) | Tests webhook verts |
| Realtime supprimé | Pages web réactives sans Realtime | Écrans mobiles réactifs sans Realtime | — |
| Administration | Dashboard admin web fonctionnel | — (pas de dash mobile) | Tests admin verts |
| Données migrées | Toutes les données accessibles | Toutes les données accessibles | — |
| Supabase supprimé | App web tourne sans `@supabase/*` | App mobile tourne sans `@supabase/*` | Suite de tests complète GREEN |

#### Commande de validation rapide

```bash
# Après chaque phase — vérifier que tout compile + tests passent
bun run check          # format + lint + typecheck
bun run test           # tous les tests

# Valider le web
cd apps/web && bun run dev --port 3000
# → Ouvrir http://localhost:3000, tester les fonctionnalités de la phase

# Valider le mobile
cd apps/mobile && npx expo start
# → Tester sur émulateur/device les fonctionnalités de la phase
```

---

## Table des matières

1. [Vue d'ensemble de la migration](#1-vue-densemble-de-la-migration)
2. [Audit de l'existant — Inventaire Supabase](#2-audit-de-lexistant--inventaire-supabase)
3. [Résolutions natives Violet.io — Points critiques levés](#3-résolutions-natives-violetio--points-critiques-levés)
4. [Convex Self-Hosted — Architecture et configuration](#4-convex-self-hosted--architecture-et-configuration)
5. [Installation et initialisation Convex](#5-installation-et-initialisation-convex)
6. [Phase 1 — Schéma de base de données](#6-phase-1--schéma-de-base-de-données)
7. [Phase 2 — Authentification (modèle localId + Convex Auth)](#7-phase-2--authentification-modèle-localid--convex-auth)
8. [Phase 3 — Fonctions Convex (queries, mutations, actions)](#8-phase-3--fonctions-convex-queries-mutations-actions)
9. [Phase 4 — Remplacement des clients partagés (`packages/shared`)](#9-phase-4--remplacement-des-clients-partagés-packagesshared)
10. [Phase 5 — Intégration Web (TanStack Start)](#10-phase-5--intégration-web-tanstack-start)
11. [Phase 6 — Intégration Mobile (Expo)](#11-phase-6--intégration-mobile-expo)
12. [Phase 7 — Webhooks Violet.io (remplacement des Edge Functions)](#12-phase-7--webhooks-violetio-remplacement-des-edge-functions)
13. [Phase 8 — Realtime et synchronisation](#13-phase-8--realtime-et-synchronisation)
14. [Phase 9 — Administration et monitoring](#14-phase-9--administration-et-monitoring)
15. [Phase 10 — Tests](#15-phase-10--tests)
16. [Phase 11 — Nettoyage et migration des données](#16-phase-11--nettoyage-et-migration-des-données)
17. [Cartographie Supabase → Convex](#17-cartographie-supabase--convex)
18. [Risques et points d'attention](#18-risques-et-points-dattention)

---

## 1. Vue d'ensemble de la migration

### Ce qui change

| Aspect | Supabase (avant) | Convex self-hosted (après) |
|--------|-------------------|---------------------------|
| Base de données | PostgreSQL (via Supabase) | Convex DB (document store réactif, backend open-source) |
| Hébergement | Supabase Cloud ou local (`supabase start`) | **Self-hosted** — binaire Rust sur infrastructure propre |
| Auth | `supabase.auth` (anon + OTP + OAuth) | `@convex-dev/auth` + modèle **localId** pour les visiteurs (voir §3 et §7) |
| Fonctions serveur | Edge Functions (Deno) + Server Functions (TanStack Start) | Convex functions (queries/mutations/actions) + HTTP actions |
| Realtime | Supabase Realtime (WebSocket, channels manuels) | Natif — Convex queries sont réactives par défaut |
| RLS | Row Level Security (Postgres policies) | Convex functions avec `ctx.auth` + filtres applicatifs |
| Stockage fichiers | Supabase Storage | Convex File Storage |
| Migrations SQL | 47 fichiers `.sql` dans `supabase/migrations/` | `convex/schema.ts` (schema déclaratif, versionné par Convex) |
| Clients | `@supabase/supabase-js`, `@supabase/ssr` | `convex/react`, `@convex-dev/auth/react` |
| Env vars | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `CONVEX_URL` (URL du backend self-hosted) |
| Dashboard | Supabase Studio (local ou cloud) | Dashboard statique (9.5 MB) servi par Caddy/Nginx |

### Ce qui ne change PAS

- **Violet.io** : Toute l'intégration API (produits, panier, checkout, commandes) reste dans `packages/shared/adapters/` et les Server Functions TanStack Start
- **Violet.io n'a aucun concept d'utilisateur** : Le Channel n'a pas besoin d'auth côté Violet. Les paniers, commandes et checkout fonctionnent sans identité utilisateur (voir §3)
- **Stripe** : Payment processing via Violet (inchangé)
- **Frontend Web** : TanStack Start, TanStack Router, Vanilla CSS + BEM
- **Frontend Mobile** : Expo SDK 55, expo-router
- **TanStack Query** : Conservation via `@tanstack/react-query` pour les appels Violet API uniquement
- **Design** : CSS, composants UI, pages — aucun changement visuel

---

## 2. Audit de l'existant — Inventaire Supabase

### 2.1 Tables Supabase (47 migrations) → 22 tables

| Table | Usage | Complexité migration |
|-------|-------|---------------------|
| `user_profiles` | Profil utilisateur (1:1 avec auth) | 🟢 Simple |
| `webhook_events` | Audit trail + idempotence webhooks Violet | 🟡 Moyen (UNIQUE constraint → upsert Convex) |
| `carts` | Paniers (auth + anonyme), sync Violet | 🟡 Moyen (Realtime + merge logic) |
| `cart_items` | Lignes de panier | 🟢 Simple |
| `orders` | Miroir des commandes Violet | 🟡 Moyen (plusieurs index composés) |
| `order_bags` | Sac marchand par commande | 🟡 Moyen (tracking, financial_status) |
| `order_items` | Lignes de commande (immuables) | 🟢 Simple |
| `order_refunds` | Remboursements | 🟢 Simple |
| `order_distributions` | Distributions financières | 🟢 Simple |
| `order_transfers` | Transferts de fonds | 🟢 Simple |
| `wishlists` | 1 liste par utilisateur | 🟢 Simple |
| `wishlist_items` | Produits sauvegardés | 🟢 Simple |
| `user_events` | Tracking browsing (product_view, search) | 🟢 Simple |
| `content_pages` | Pages éditoriales + légales | 🟡 Moyen (enum type, Markdown, SEO) |
| `faq_items` | FAQ par catégorie | 🟢 Simple |
| `support_inquiries` | Formulaire contact | 🟢 Simple |
| `user_push_tokens` | Tokens push Expo | 🟢 Simple |
| `notification_preferences` | Opt-in/out par type | 🟢 Simple |
| `notification_logs` | Audit emails/push envoyés | 🟢 Simple |
| `error_logs` | Erreurs structurées | 🟢 Simple |
| `alert_rules` | Seuils de monitoring | 🟢 Simple |
| `merchants` | Marchands Violet (miroir) | 🟢 Simple |
| `merchant_payout_accounts` | Comptes de paiement marchands | 🟢 Simple |
| `product_embeddings` | ⚠️ **Déjà supprimé** (migration `20260506`) | — À ignorer |

### 2.2 Vue matérialisées (2)

| Vue | Statut |
|-----|--------|
| `mv_dashboard_metrics` | → Remplacer par des queries Convex agrégées ou une table pré-calculée mise à jour par cron |
| `mv_commission_summary` | → Idem |

### 2.3 SQL Functions (8)

| Fonction | Remplacement Convex |
|----------|-------------------|
| `match_products()` | Supprimée avec les embeddings |
| `get_user_search_profile()` | Query Convex `getUserSearchProfile` |
| `fn_health_metrics()` | Query Convex `getHealthMetrics` |
| `fn_dashboard_metrics_by_range()` | Query Convex `getDashboardMetrics` |
| `estimate_commission()` | Fonction utilitaire TypeScript |
| `refresh_dashboard_views()` | Mutation Convex appelée par cron |
| `handle_updated_at()` / `update_updated_at_column()` | **Non nécessaire** — Convex gère les timestamps via `_creationTime` ou champ `updatedAt` mis à jour dans les mutations |
| `handle_new_user()` | Mutation Convex `createUserProfile` appelée après inscription |

### 2.4 Edge Functions (7)

| Edge Function | Remplacement Convex |
|--------------|-------------------|
| `handle-webhook` | → **HTTP Action Convex** `convex/webhooks/violet.ts` |
| `send-notification` | → **Action Convex** (appel API Resend) |
| `send-push` | → **Action Convex** (appel Expo Push API) |
| `send-support-email` | → **Action Convex** (appel Resend) |
| `send-support-reply` | → **Action Convex** (appel Resend) |
| `health-check` | → **HTTP Action Convex** simple |
| `_shared/*` | → Fonctions utilitaires dans `convex/lib/` |

### 2.5 RLS Policies (~80 policies)

Toutes les RLS policies sont remplacées par de la logique applicative dans les fonctions Convex (`ctx.auth.getUserIdentity()` + filtres dans les queries).

### 2.6 Fichiers impactés

**Packages partagés** (`packages/shared/src/`) :
- `clients/supabase.ts` → Remplacer par client Convex
- `clients/supabase.server.ts` → Remplacer par `convex/server`
- `clients/auth.ts` → Remplacer par `@convex-dev/auth/react`
- `clients/wishlist.ts` → Remplacer par queries/mutations Convex
- `clients/profile.ts` → Remplacer par queries/mutations Convex
- `clients/tracking.ts` → Remplacer par mutations Convex
- `clients/notifications.ts` → Remplacer par queries/mutations Convex
- `clients/content.ts` → Remplacer par queries Convex
- `clients/faq.ts` → Remplacer par query Convex
- `clients/support.ts` → Remplacer par mutations Convex
- `clients/biometricAuth.ts` → Remplacer par query/mutation Convex
- `clients/admin.ts` → Remplacer par queries Convex (admin-only)
- `clients/admin-support.ts` → Remplacer par queries/mutations Convex
- `clients/health.ts` → Remplacer par queries Convex
- `hooks/useOrders.ts` → Adapté pour utiliser Convex queries
- `hooks/useCart.ts` → Conservation du pattern TanStack Query + Convex
- `hooks/useWishlist.ts` → Remplacer les appels Supabase par Convex
- `hooks/useAuth.ts` → Remplacer par Convex Auth hooks
- `hooks/useCartSync.ts` → **Éliminer** — Convex est réactif par défaut
- `hooks/useRecentlyViewed.ts` → Partiellement adapté (localStorage reste)
- `hooks/useProducts.ts` → Inchangé (Violet API)
- `hooks/useContent.ts` → Adapté pour Convex
- `hooks/useNotificationPreferences.ts` → Adapté pour Convex

**Web app** (`apps/web/src/`) :
- `utils/supabase.ts` → Remplacer par ConvexProvider
- `server/supabaseServer.ts` → Remplacer par ConvexHttpClient
- `server/orders.ts` → Refactor pour appeler Convex
- `server/orderHandlers.ts` → Migrer vers Convex queries
- `server/cartActions.ts` → Refactor
- `server/cartSync.ts` → Simplifier (Convex réactif)
- `server/guestOrders.ts` → Migrer vers Convex
- `server/checkout.ts` → Partiellement impacté (Violet API reste)
- `server/authInit.ts` → Remplacer par Convex Auth
- `server/adminAuth.ts` / `adminAuthGuard.ts` → Convex identity checks
- `server/tracking.ts` / `trackingHandlers.ts` → Migrer vers Convex mutations
- `server/getFaq.ts` → Migrer vers Convex query
- `server/getContent.ts` / `getLegalContent.ts` → Migrer vers Convex queries
- `server/getAdminDashboardHandler.ts` → Migrer vers Convex queries
- `server/getAdminHealthHandler.ts` → Migrer vers Convex queries
- `server/getAdminSupportHandler.ts` → Migrer vers Convex queries
- `server/submitSupportHandler.ts` → Migrer vers Convex mutation
- `server/replySupportInquiryHandler.ts` → Migrer vers Convex action
- `server/updateSupportInquiryHandler.ts` → Migrer vers Convex mutation
- `server/payoutAccounts.ts` → Migrer vers Convex queries
- `server/getMerchants.ts` → Migrer vers Convex query
- `contexts/CartContext.tsx` → Simplifier (remplacer Realtime par réactivité Convex)
- `hooks/useAuthSession.ts` → Remplacer par Convex Auth
- `hooks/useUser.ts` → Remplacer par Convex Auth
- `routes/__root.tsx` → Remplacer SupabaseProvider par ConvexProvider
- `routes/auth/*` → Remplacer par Convex Auth flows
- `routes/api/*` → Remplacer par Convex queries/mutations/actions (HTTP endpoints via Convex)
- Tous les `routes/account/*` → Adaptés pour Convex

**Mobile app** (`apps/mobile/src/`) :
- `server/apiClient.ts` → Remplacer par client Convex direct
- `server/getOrders.ts` → Remplacer par Convex queries
- `context/AuthContext.tsx` → Remplacer par Convex Auth
- `utils/authInit.ts` → Remplacer par Convex Auth
- `services/biometricService.ts` → Adapter pour Convex Auth
- `hooks/usePushRegistration.ts` → Adapter
- `app/_layout.tsx` → ConvexProvider + ConvexAuthProvider

**Supabase** (à supprimer) :
- `supabase/` (dossier entier : migrations, functions, config, seed)

**Tests** :
- `apps/web/src/__tests__/` (9+ fichiers de tests Supabase)
- `packages/shared/src/hooks/__tests__/` (2+ fichiers)
- `packages/shared/src/clients/__tests__/` (2+ fichiers)
- `packages/shared/src/adapters/__tests__/` (1 fichier)
- `packages/shared/src/utils/__tests__/` (1 fichier)

**Config** :
- `.env.example` → Remplacer les vars Supabase par `CONVEX_URL`
- `package.json` (root, web, shared) → Remplacer `@supabase/*` par `convex`, `@convex-dev/*`
- `tsconfig.base.json` → Ajouter les paths Convex si nécessaire

---

## 3. Résolutions natives Violet.io — Points critiques levés

L'audit croisé de la documentation Violet.io (1871 lignes, 120+ endpoints audités) révèle que Violet résout **nativement** les principaux points critiques identifiés dans la migration. Cette section documente chaque résolution.

### 3.1 🔴→🟢 Auth anonyme : RÉSOLU par Violet

**Le problème** : Convex Auth n'a pas de mode `signInAnonymously()` comme Supabase.

**La résolution Violet** : Violet **n'a aucun concept d'utilisateur côté Channel**. La documentation le confirme à travers **5 preuves indépendantes** :

1. **Cart = pas de user requis** : `POST /checkout/cart` nécessite seulement `channel_id` + `currency`. Aucun `user_id` n'est exigé pour créer un panier.

2. **Customer = modèle guest-only** : La doc Customers dit explicitement : *"does not let you save for re-use"*. Le client est un invité par défaut — un email suffit.

3. **Order submission = pas de compte** : Le flux checkout itératif complet (Create Cart → Customer → Shipping → Payment → Submit) ne nécessite **jamais** de compte utilisateur. Seul un email est passé dans `POST /customer`.

4. **Cart = Order ID** : La doc `Lifecycle of a Cart` confirme *"Order ID = Cart ID"* — le même ID Violet relie le panier à la commande. Pas besoin d'un UUID Supabase pour cette correspondance.

5. **`app_order_id` UUID v4** : Déjà généré côté Channel via `crypto.randomUUID()`. C'est la clé d'idempotence de submit — **indépendant de toute identité Supabase**.

#### Qu'est-ce que l'anonymous auth Supabase servait VRAIMENT ?

| Usage Supabase anonymous | Remplacement Convex + Violet |
|--------------------------|----------------------------|\n| Persisté un panier entre sessions | **Pas besoin** : `violet_cart_id` dans cookie/SecureStore suffit. Violet gère le panier côté API, nous ne faisons que stocker l'ID localement. |
| Associer des événements de tracking | **localId** : `crypto.randomUUID()` dans localStorage. Les events Convex utilisent ce localId comme clé, migré vers userId à l'inscription. |
| Merger le panier anonymous → auth | **Simplifié** : comparer le `violet_cart_id` local avec le cart existant en Convex — même logique de merge, pas de session Supabase nécessaire. |

**Impact** : Le point critique 🔴 le plus gros est **éliminé**. On n'a pas besoin d'un mode anonyme dans Convex Auth.

### 3.2 🔴→🟡 Migration UUID : ATTÉNUÉ par Violet

**Le problème** : Les UUID Supabase (`auth.users.id`) ne sont pas des IDs Convex (`Id<"table">`).

**La résolution** : Le projet utilise déjà des **identifiants propres** indépendants de Supabase pour **tout ce qui touche Violet** :

| Donnée | Identifiant | Dépendance Supabase ? |
|--------|-------------|----------------------|
| Panier Violet | `violet_cart_id` (integer Violet) | ❌ Non |
| Commande Violet | `violet_order_id` (integer Violet) | ❌ Non |
| Idempotence submit | `app_order_id` (UUID v4 local) | ❌ Non |
| Marchand | `violet_merchant_id` (integer Violet) | ❌ Non |
| Bag | `violet_bag_id` (integer Violet) | ❌ Non |
| SKU | `sku_id` (string Violet) | ❌ Non |
| Webhook event | `event_id` (string Violet) | ❌ Non |
| Payout Account | `violet_payout_account_id` (integer) | ❌ Non |
| Transfer | `violet_transfer_id` (string Violet) | ❌ Non |
| Refund | `violet_refund_id` (string Violet) | ❌ Non |

**Seul le `user_id` (FK vers `auth.users`) dépend de Supabase**, et il n'est présent que dans **5 tables** :

| Table avec `user_id` | Volume attendu | Complexité remapping |
|---------------------|---------------|--------------------|
| `user_profiles` | 1 row/user | 🟢 Trivial (1:1) |
| `wishlists` + `wishlist_items` | ~1-5 items/user | 🟢 Simple |
| `carts` + `cart_items` | ~1 row/user (actifs seulement) | 🟢 Simple |
| `user_events` | ~100-500 rows/user | 🟡 Batch (mais données jetables) |
| `user_push_tokens` + `notification_preferences` | ~1-2 rows/user | 🟢 Trivial |

Les **17 autres tables** n'ont **aucun UUID Supabase** à remapper :
`orders`, `order_bags`, `order_items`, `order_refunds`, `order_distributions`, `order_transfers`, `merchants`, `merchant_payout_accounts`, `webhook_events`, `content_pages`, `faq_items`, `support_inquiries`, `notification_logs`, `error_logs`, `alert_rules`

**Impact** : Critique → **Moyen**. La migration de données est largement simplifiée.

### 3.3 🟡 Cascade deletes : ATTÉNUÉ par le modèle Violet

Les données Violet sont organisées en hiérarchies claires et **immuables après création** (seuls les statuts changent) :

```
Order → Bags → Items → Refunds     (immuables sauf statuts)
Order → Distributions              (immuable)
Order → Transfers                  (immuable)
```

Les suppressions en cascade concernent seulement :
- `carts` → `cart_items` (panier abandonné — cleanup par cron)
- `wishlists` → `wishlist_items` (suppression compte)
- `orders` → `order_bags` → `order_items` + `order_refunds` (très rare — admin seulement)

→ **3 fonctions utilitaires Convex** suffisent pour couvrir tous les cas.

### 3.4 Autres simplifications apportées par Violet

1. **Webhook idempotence** : Le pattern `event_id` UNIQUE de Violet → index Convex + `first()` check. Pas besoin de SQL `ON CONFLICT`.

2. **Cart = Order ID** : Violet utilise le même ID pour le panier et la commande (`"Order ID = Cart ID"` dans la doc). Simplifie le mapping.

3. **Guest checkout natif** : Le lookup token (`order_lookup_token_hash`) est un pattern applicatif pur. Pas de session Supabase.

4. **Customer = invité** : *"does not let you save for re-use"*. Pas de persistance customer côté Violet.

---

## 4. Convex Self-Hosted — Architecture et configuration

### 4.1 Principe

Convex est **open-source** ([`github.com/get-convex/convex-backend`](https://github.com/get-convex/convex-backend)). Le backend self-hosted contient le **même code à jour** que le service cloud. Il s'exécute en tant que **machine unique** (single-machine) avec les mêmes APIs applicatives.

**Trois méthodes** de déploiement existent :

| Méthode | Usage recommandé | Docker requis ? |
|---------|-----------------|-----------------|
| `npx convex dev` | Dev local | ❌ Non |
| Docker Compose | Alternative dev/prod | ✅ Oui |
| **Binaire Rust précompilé** | **Dev et prod (retenue)** | ❌ **Non** |

### 4.2 Dev local — `npx convex dev` (zéro Docker)

Le CLI Convex télécharge **automatiquement** le binaire Rust + le dashboard dans `~/.cache/convex/` et lance le tout comme sous-processus :

```bash
# Sélectionner le déploiement local (une seule fois)
npx convex deployment select local

# Démarrer le backend + watch mode
npx convex dev

# Ouvrir le dashboard dans le navigateur
npx convex dashboard
```

- **Backend** : tourne sur `localhost:3210` (binaire Rust téléchargé auto)
- **Dashboard** : servi automatiquement (assets statiques du `dashboard.zip`)
- **Données** : SQLite dans le CWD
- **Tout s'arrête** quand `npx convex dev` est arrêté (Ctrl+C)
- **Zéro config, zéro Docker** — le CLI gère tout

### 4.3 Production VPS — Binaire Rust + systemd + Caddy (zéro Docker)

Le binaire précompilé est disponible dans les [GitHub Releases](https://github.com/get-convex/convex-backend/releases) pour Linux (x86_64, ARM64), macOS (Intel, Apple Silicon) et Windows.

Le dashboard est un **build statique Next.js** de 9.5 MB (`dashboard.zip` dans les mêmes releases), servi par n'importe quel serveur HTTP.

#### Architecture production

```
┌──────────────────────────────────────────────────────────┐
│                   VPS (no Docker)                         │
│                                                           │
│  ┌──────────────────────┐   ┌──────────────────────────┐ │
│  │  convex-local-backend │   │  Caddy (reverse proxy)    │ │
│  │  (binaire Rust)      │   │  + sert le dashboard      │ │
│  │                      │   │    statique               │ │
│  │  :3210 (API)         │◄──┤  api.maisonemile.com      │ │
│  │  :3211 (HTTP actions)│◄──┤  maisonemile.com/http      │ │
│  │                      │   │  dash.maisonemile.com →    │ │
│  └──────────────────────┘   │    /opt/convex/dashboard/  │ │
│          │                   └──────────────────────────┘ │
│          │                                               │
│          ▼                                               │
│  ┌──────────────────────┐                               │
│  │  PostgreSQL 16       │                               │
│  │  (systemd)           │                               │
│  └──────────────────────┘                               │
└──────────────────────────────────────────────────────────┘
```

#### Setup production complet

```bash
# 1. Télécharger le binaire Convex
sudo mkdir -p /opt/convex /opt/convex/data /opt/convex/dashboard
cd /opt/convex

# Linux x86_64 :
sudo wget https://github.com/get-convex/convex-backend/releases/latest/download/convex-local-backend-x86_64-unknown-linux-gnu.zip
# Linux ARM64 :
# sudo wget https://github.com/get-convex/convex-backend/releases/latest/download/convex-local-backend-aarch64-unknown-linux-gnu.zip
sudo unzip convex-local-backend-*.zip
sudo chmod +x convex-local-backend

# 2. Télécharger le dashboard statique
cd /opt/convex/dashboard
sudo wget https://github.com/get-convex/convex-backend/releases/latest/download/dashboard.zip
sudo unzip dashboard.zip
sudo rm dashboard.zip

# 3. Générer le secret d'instance (garder précieusement !)
export INSTANCE_SECRET=$(openssl rand -hex 32)

# 4. Créer la DB PostgreSQL
sudo -u postgres psql -c "CREATE USER convex WITH PASSWORD 'your-strong-password';"
sudo -u postgres psql -c "CREATE DATABASE convex_self_hosted OWNER convex;"

# 5. Générer la clé admin (nécessite cargo ou le repo)
git clone --depth 1 https://github.com/get-convex/convex-backend /tmp/convex-backend
cd /tmp/convex-backend
cargo run -p keybroker --bin generate_key -- maison-emile "$INSTANCE_SECRET"
# → Copier la clé affichée

# 6. Lancer le backend (vérification)
cd /opt/convex
./convex-local-backend \
  --instance-name maison-emile \
  --instance-secret "$INSTANCE_SECRET" \
  --db postgres-v5 "postgresql://convex:your-strong-password@localhost:5432"
```

#### Service systemd

```ini
# /etc/systemd/system/convex-backend.service
[Unit]
Description=Convex Backend (Maison Émile)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=convex
Group=convex
WorkingDirectory=/opt/convex/data
EnvironmentFile=/opt/convex/convex.env
ExecStart=/opt/convex/convex-local-backend \
  --instance-name maison-emile \
  --instance-secret ${INSTANCE_SECRET} \
  --db postgres-v5 "postgresql://convex:${DB_PASSWORD}@localhost:5432/convex_self_hosted"
Restart=always
RestartSec=5
LimitNOFILE=65536

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/convex/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
# /opt/convex/convex.env
INSTANCE_SECRET=<64-char-hex-from-step-3>
DB_PASSWORD=<your-strong-password>

sudo systemctl daemon-reload
sudo systemctl enable convex-backend
sudo systemctl start convex-backend
sudo systemctl status convex-backend
```

#### Caddyfile (reverse proxy + dashboard statique + TLS automatique)

```caddyfile
# API backend + Convex queries
api.maisonemile.com {
    reverse_proxy localhost:3210
}

# HTTP actions (webhooks Violet, etc.)
maisonemile.com {
    reverse_proxy localhost:3211
}

# Dashboard (statique — 9.5 MB)
dash.maisonemile.com {
    root * /opt/convex/dashboard
    file_server
    try_files {path} /index.html
}
```

```bash
sudo apt install -y caddy
sudo systemctl enable caddy
# Caddy gère les certificats TLS automatiquement (Let's Encrypt)
```

#### Configuration du projet local pour pointer vers le VPS

```bash
# .env.local (dans le monorepo, pas sur le VPS)
CONVEX_SELF_HOSTED_URL=https://api.maisonemile.com
CONVEX_SELF_HOSTED_ADMIN_KEY=<admin-key-from-step-5>
```

### 4.4 Configuration client — `skipConvexDeploymentUrlCheck`

Le backend self-hosted utilise une URL non-standard (pas `*.convex.cloud`). Tous les clients doivent passer ce flag :

```typescript
// Web (router.tsx)
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL, {
  unsavedChangesWarning: false,
  skipConvexDeploymentUrlCheck: true,  // Requis pour self-hosted
});

// Mobile (_layout.tsx)
const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
  skipConvexDeploymentUrlCheck: true,  // Requis pour self-hosted
});
```

### 4.5 Différences cloud vs self-hosted

| Fonctionnalité | Cloud Convex | Self-hosted |
|----------------|-------------|-------------|
| APIs applicatives (queries, mutations, actions, HTTP) | ✅ | ✅ **Identique** |
| Réactivité temps réel | ✅ | ✅ **Identique** |
| Dashboard | cloud.convex.dev | ✅ Statique (9.5 MB) servi par Caddy |
| Schema, validations, indexes | ✅ | ✅ **Identique** |
| Auth (`@convex-dev/auth`) | ✅ | ✅ **Identique** |
| File Storage | ✅ | ✅ **Identique** |
| Cron Jobs | ✅ | ✅ **Identique** |
| Full Text Search | ✅ | ✅ **Identique** |
| Vector Search | ✅ | ✅ **Identique** |
| Log Streams | ✅ Intégré | ⚠️ Via intégrations externes (Sentry) |
| Backups automatiques | ✅ Managé | ⚠️ `pg_dump` cron quotidien |
| Haute disponibilité | ✅ Managé | ❌ Single-machine (gérer soi-même) |
| Scaling automatique | ✅ Managé | ❌ Manuel (vertical) |
| Team management | ✅ | ❌ Non disponible |
| Coût | Payant (usage) | ✅ **Gratuit** (infrastructure seule) |

### 4.6 Comparatif des méthodes de déploiement

| | `npx convex dev` | Docker Compose | **Binaire Rust** |
|---|---|---|---|
| **Setup** | 1 commande | `docker compose up` | Download + chmod |
| **Dépendances** | Node.js | Docker + Docker Compose | **Rien** (binaire statique) |
| **RAM min** | ~100 MB | ~300 MB (2 conteneurs) | **~80 MB** |
| **Persistance** | SQLite (CWD) | SQLite ou Postgres | **SQLite ou Postgres** |
| **Survit au reboot** | ❌ Non (subprocess) | ✅ Oui (restart policy) | ✅ Oui (**systemd**) |
| **Prod-ready** | ❌ Non | ✅ Oui | **✅ Oui** |
| **Dashboard** | Intégré auto | Conteneur séparé (6791) | **Statique** (Caddy) |
| **VPS 2 GB** | ✅ | ⚠️ Tight | **✅ Parfait** |

### 4.7 Production checklist

- [ ] Serveur VPS avec assez de RAM (2 GB min, 4+ GB recommandé)
- [ ] Binaire Rust installé dans `/opt/convex/`
- [ ] Dashboard statique dans `/opt/convex/dashboard/`
- [ ] PostgreSQL 16 configuré avec utilisateur `convex` + DB `convex_self_hosted`
- [ ] Service systemd `convex-backend` activé et démarré
- [ ] Caddy configuré avec TLS automatique (3 domaines : API, HTTP, dashboard)
- [ ] Firewall : ports 80/443 ouverts, 3210/3211 bloqués (accès local seulement)
- [ ] Backups PostgreSQL : `pg_dump` cron quotidien vers stockage externe
- [ ] Monitoring : Prometheus + Grafana ou équivalent
- [ ] Variables d'environnement Convex : tous les secrets (Violet, Stripe, Resend)

---

## 5. Installation et initialisation Convex

> ✅ **Phase 0 TERMINÉE** (2026-05-15). Les dépendances Convex cohabitent avec Supabase en attendant la migration complète.

### 5.1 Installer les dépendances npm

```bash
# Root — convex CLI + runtime
cd /home/charles/Bureau/E-commerce
bun add convex                    # → convex@1.39.1

# Packages/shared — Convex + Auth
bun add convex @convex-dev/auth
# → convex@1.39.1, @convex-dev/auth@0.0.92

# Web app — Convex + Auth
cd apps/web
bun add convex @convex-dev/auth
# → convex@1.39.1, @convex-dev/auth@0.0.92

# Mobile app — Convex + Auth
cd apps/mobile
bun add convex @convex-dev/auth
# → convex@1.39.1, @convex-dev/auth@0.0.92

# ⚠️ Les dépendances @supabase/* sont conservées pendant la cohabitation.
# Elles seront supprimées en Phase 11 (Nettoyage).
```

### 5.2 Créer la structure `convex/`

```bash
# Créer l'arborescence
mkdir -p convex/{lib,users,orders,carts,wishlists,content,support,tracking,notifications,admin,webhooks,health}
```

Structure cible (remplie progressivement au fil des phases) :

```
convex/
├── schema.ts                    # Schéma de base de données (Phase 1)
├── tsconfig.json                # Config TypeScript Convex
├── _generated/                  # Auto-généré par npx convex dev
├── auth.ts                      # Configuration auth (Phase 2) — Password + Resend OTP
├── auth.config.js               # OIDC config (généré par npx @convex-dev/auth)
├── http.ts                      # HTTP routes (auth OIDC/JWKS + futurs webhooks)
├── lib/
│   ├── violetApi.ts             # Client API Violet (Phase 3)
│   ├── email.ts                 # Envoi d'emails Resend (Phase 3)
│   ├── resendOTP.ts             # Resend OTP providers (Phase 2)
│   ├── push.ts                  # Push notifications Expo (Phase 3)
│   ├── errors.ts                # Types d'erreurs + logging
│   └── admin.ts                 # Vérification rôle admin (Phase 2)
├── users/
│   ├── queries.ts               # getProfile, getUserEvents
│   └── mutations.ts             # updateProfile, migrateAnonymousData
├── orders/
│   ├── queries.ts               # getOrders, getOrderDetail
│   └── mutations.ts             # syncOrderFromWebhook
├── carts/
│   ├── queries.ts               # getCart, getCartByVioletId
│   └── mutations.ts             # createCart, updateCart, mergeCart
├── wishlists/
│   ├── queries.ts               # getWishlist, getWishlistProductIds
│   └── mutations.ts             # addToWishlist, removeFromWishlist
├── content/
│   ├── queries.ts               # getContentPage, getFaq
│   └── mutations.ts             # admin: create/update content
├── support/
│   ├── queries.ts               # getInquiries (admin)
│   └── mutations.ts             # submitInquiry, updateInquiryStatus
├── tracking/
│   └── mutations.ts             # recordEvent
├── notifications/
│   ├── queries.ts               # getPreferences
│   └── mutations.ts             # upsertPreference, upsertPushToken
├── admin/
│   ├── queries.ts               # getDashboardMetrics, getHealthMetrics
│   └── mutations.ts             # refreshDashboardViews
├── webhooks/
│   └── violet.ts                # HTTP Action webhooks Violet (Phase 7)
├── health/
│   └── queries.ts               # Health check ✅ (Phase 0)
├── crons.ts                     # Cron jobs (Phase 3)
└── http.ts                      # Routeur HTTP (Phase 7)
```

### 5.3 Initialiser le déploiement local

```bash
# Dans le monorepo, à la racine
npx convex dev --once --local

# Ce que cette commande fait :
# 1. Télécharge le binaire Rust + le dashboard dans ~/.cache/convex/
# 2. Lance le backend sur 127.0.0.1:3210
# 3. Crée convex/_generated/ (api.js, api.d.ts, dataModel.d.ts, server.js, server.d.ts)
# 4. Écrit dans .env.local :
#    CONVEX_DEPLOYMENT=anonymous:anonymous-E-commerce
#    CONVEX_URL=http://127.0.0.1:3210
#    CONVEX_SITE_URL=http://127.0.0.1:3211
# 5. Push le schema et les fonctions

# ⚠️ Noms de tables réservés : ne pas utiliser le préfixe _ (ex: _health est réservé)
```

Pour le développement quotidien, lancer en mode watch :

```bash
npx convex dev --local
# → Backend actif tant que la commande tourne (Ctrl+C pour arrêter)
# → Dashboard sur http://127.0.0.1:6790
```

### 5.4 Variables d'environnement

`.env.example` a été mis à jour avec la section Convex et les vars Supabase marquées legacy. `npx convex dev --local` configure automatiquement `CONVEX_URL`, `CONVEX_SITE_URL` et `CONVEX_DEPLOYMENT` dans `.env.local`.

Les variables d'environnement Convex (secrets Violet, Stripe, Resend) se configurent via le **Dashboard local** (`http://127.0.0.1:6790`) ou `npx convex env set` :

```bash
npx convex env set VIOLET_APP_ID "your_id"
npx convex env set VIOLET_APP_SECRET "your_secret"
npx convex env set RESEND_API_KEY "re_xxx"
npx convex env list
```

Variables à configurer :
- `VIOLET_APP_ID`, `VIOLET_APP_SECRET`, `VIOLET_USERNAME`, `VIOLET_PASSWORD`
- `VIOLET_API_BASE`
- `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `SUPPORT_EMAIL`
- `WEBHOOK_SECRET` (pour validation HMAC des webhooks Violet)
- `STRIPE_SECRET_KEY`

### 5.5 Validation Phase 0 (2026-05-15)

```
✅ Dépendances : convex@1.39.1, @convex-dev/auth@0.0.92
✅ Structure convex/ : 13 dossiers créés + tsconfig.json
✅ Backend local : 127.0.0.1:3210 (binaire Rust auto-téléchargé)
✅ Dashboard : http://127.0.0.1:6790 (HTTP 200)
✅ Query health/getStatus : {status: "ok", backend: "convex-self-hosted"}
✅ TypeScript web : tsc --noEmit sans erreur
✅ TypeScript mobile : tsc --noEmit sans erreur
✅ .env.example : section Convex ajoutée, Supabase marqué legacy
✅ Cohabitation : Convex + Supabase coexistent sans conflit
```

---

## 6. Phase 1 — Schéma de base de données

> ✅ **Phase 1 TERMINÉE** (2026-05-15). 23 tables, 46 indexes, déployé et validé avec `npx convex dev`.
>
> Points notables appris :
> - `_creationTime` est **ajouté automatiquement** à chaque index — ne pas l'inclure explicitement
> - Les noms de tables ne doivent pas commencer par `_` (réservé système)
> - Les noms d'index doivent être uniques par table (pas de doublon)
>
> Corrections post-revue (2026-05-16) :
> - `getUserById` : ajout de `assertAdmin(ctx)` — tout utilisateur pouvait lire le profil de n'importe qui via userId
>
> Audit Phase 0–1 (2026-05-18) — 8 corrections appliquées (voir `AUDIT-PHASES-0-1.md`) :
> - `orderTransfers.violetBagId` : `v.number()` → `v.string()` (cohérence avec `orderBags`)
> - Index redondants supprimés : `cartItems.by_cartId`, `notificationPreferences.by_userId`
> - Index composé ajouté : `wishlistItems.by_wishlistId_productId` (élimine `.filter()`)
> - `@convex-dev/react-query` retiré des deps (package mort)
> - Statuts officiels Violet.io documentés dans le schema (`orders.status`, `orderBags.status`)
> - Headers webhook corrigés dans ce guide : `X-Violet-Hmac` (pas Signature), `X-Violet-Topic` (pas Event-Type)
> - `webhookEvents.status` : 4 statuts (received/processing/processed/failed)

### 6.1 `convex/schema.ts` — 23 tables déployées

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Users ────────────────────────────────────────────────────
  userProfiles: defineTable({
    userId: v.string(), // Convex auth subject ID ou localId (§7)
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    preferences: v.object({}), // JSONB → objet Convex
    biometricEnabled: v.boolean(),
    isAdmin: v.optional(v.boolean()),
  })
    .index("by_userId", ["userId"])
    .index("by_displayName", ["displayName"]),

  // ─── Webhook Events (idempotency) ────────────────────────────
  webhookEvents: defineTable({
    eventId: v.string(), // Violet X-Violet-Event-Id
    eventType: v.string(),
    entityId: v.string(),
    status: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    payload: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventType", ["eventType"])
    .index("by_status", ["status"]),

  // ─── Carts ────────────────────────────────────────────────────
  carts: defineTable({
    violetCartId: v.string(),
    userId: v.optional(v.string()), // Convex auth subject ou localId
    sessionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("abandoned"),
      v.literal("merged"),
    ),
  })
    .index("by_violetCartId", ["violetCartId"])
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"]),

  cartItems: defineTable({
    cartId: v.id("carts"),
    skuId: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    productName: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
  })
    .index("by_cart_sku", ["cartId", "skuId"]),

  // ─── Orders ───────────────────────────────────────────────────
  orders: defineTable({
    violetOrderId: v.string(),
    userId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    email: v.string(),
    status: v.string(), // Violet Order States: IN_PROGRESS | PROCESSING | ACCEPTED | REJECTED | COMPLETED | CANCELED | REQUIRES_ACTION
    subtotal: v.number(),
    shippingTotal: v.number(),
    taxTotal: v.number(),
    total: v.number(),
    currency: v.string(),
    orderLookupTokenHash: v.optional(v.string()),
    emailSent: v.boolean(),
  })
    .index("by_violetOrderId", ["violetOrderId"])
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_email", ["email"])
    .index("by_lookupToken", ["orderLookupTokenHash"])
    .index("by_status", ["status"]),

  orderBags: defineTable({
    orderId: v.id("orders"),
    violetBagId: v.string(),
    merchantName: v.string(),
    merchantId: v.optional(v.id("merchants")),
    status: v.string(),
    financialStatus: v.string(),
    subtotal: v.number(),
    shippingTotal: v.number(),
    taxTotal: v.number(),
    total: v.number(),
    shippingMethod: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    carrier: v.optional(v.string()),
    commissionRatePct: v.optional(v.number()),
    fulfillmentStatus: v.optional(v.string()),
  })
    .index("by_orderId", ["orderId"])
    .index("by_violetBagId", ["violetBagId"]),

  orderItems: defineTable({
    orderBagId: v.id("orderBags"),
    skuId: v.string(),
    name: v.string(),
    quantity: v.number(),
    price: v.number(),
    linePrice: v.number(),
    thumbnail: v.optional(v.string()),
  }).index("by_orderBagId", ["orderBagId"]),

  orderRefunds: defineTable({
    orderBagId: v.id("orderBags"),
    violetRefundId: v.string(),
    amount: v.number(),
    reason: v.optional(v.string()),
    currency: v.string(),
    status: v.string(),
  })
    .index("by_orderBagId", ["orderBagId"])
    .index("by_violetRefundId", ["violetRefundId"]),

  orderDistributions: defineTable({
    violetOrderId: v.string(),
    type: v.string(),
    amount: v.number(),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
    violetData: v.optional(v.any()),
  }).index("by_violetOrderId", ["violetOrderId"]),

  orderTransfers: defineTable({
    violetTransferId: v.optional(v.string()),
    violetOrderId: v.string(),
    violetBagId: v.optional(v.string()), // Integer Violet stocké en string (cohérent avec orderBags)
    type: v.string(),
    status: v.string(),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    violetData: v.optional(v.any()),
  })
    .index("by_violetTransferId", ["violetTransferId"])
    .index("by_violetOrderId", ["violetOrderId"]),

  // ─── Merchants ────────────────────────────────────────────────
  merchants: defineTable({
    violetMerchantId: v.number(),
    name: v.string(),
    domain: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    status: v.optional(v.string()),
    violetData: v.optional(v.any()),
  }).index("by_violetMerchantId", ["violetMerchantId"]),

  merchantPayoutAccounts: defineTable({
    violetPayoutAccountId: v.number(),
    merchantId: v.id("merchants"),
    type: v.optional(v.string()),
    status: v.string(), // active, inactive, deleted
    requirements: v.optional(v.any()),
    violetData: v.optional(v.any()),
  })
    .index("by_violetPayoutAccountId", ["violetPayoutAccountId"])
    .index("by_merchantId", ["merchantId"]),

  // ─── Wishlists ────────────────────────────────────────────────
  wishlists: defineTable({
    userId: v.string(), // Convex userId ou localId
  })
    .index("by_userId", ["userId"]),

  wishlistItems: defineTable({
    wishlistId: v.id("wishlists"),
    productId: v.string(),
  })
    .index("by_wishlistId", ["wishlistId"])
    .index("by_wishlistId_productId", ["wishlistId", "productId"]) // Dedup lookup
    .index("by_productId", ["productId"]),

  // ─── User Events (tracking) ───────────────────────────────────
  userEvents: defineTable({
    userId: v.string(), // Convex userId ou localId
    eventType: v.string(), // product_view, search, category_view
    payload: v.optional(v.any()),
  })
    .index("by_user_type", ["userId", "eventType"])
    .index("by_user_created", ["userId", "_creationTime"]),

  // ─── Content ──────────────────────────────────────────────────
  contentPages: defineTable({
    slug: v.string(),
    title: v.string(),
    type: v.string(), // guide, comparison, review, legal
    bodyMarkdown: v.string(),
    author: v.string(),
    status: v.string(), // draft, published, archived
    publishedAt: v.optional(v.number()),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    featuredImageUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    relatedSlugs: v.optional(v.array(v.string())),
    sortOrder: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_status_published", ["status", "publishedAt"]),

  faqItems: defineTable({
    category: v.string(),
    question: v.string(),
    answerMarkdown: v.string(),
    sortOrder: v.number(),
    isPublished: v.boolean(),
  }).index("by_category_sort", ["category", "sortOrder"]),

  // ─── Support ──────────────────────────────────────────────────
  supportInquiries: defineTable({
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    message: v.string(),
    orderId: v.optional(v.string()),
    status: v.string(), // new, in-progress, resolved
    internalNotes: v.optional(v.string()),
  }).index("by_status", ["status"]),

  // ─── Notifications ────────────────────────────────────────────
  userPushTokens: defineTable({
    userId: v.string(),
    expoPushToken: v.string(),
    deviceId: v.string(),
    platform: v.string(), // ios, android
  })
    .index("by_userId", ["userId"])
    .index("by_expoPushToken", ["expoPushToken"]),

  notificationPreferences: defineTable({
    userId: v.string(),
    notificationType: v.string(),
    enabled: v.boolean(),
  })
    .index("by_userId_type", ["userId", "notificationType"]),

  notificationLogs: defineTable({
    orderId: v.optional(v.id("orders")),
    notificationType: v.string(),
    recipientEmail: v.string(),
    status: v.string(), // pending, sent, failed
    resendEmailId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    attempt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_status", ["status"]),

  // ─── Error Logging & Health ───────────────────────────────────
  errorLogs: defineTable({
    source: v.string(), // web, mobile, convex
    errorType: v.string(),
    message: v.string(),
    stackTrace: v.optional(v.string()),
    context: v.optional(v.any()),
    userId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  })
    .index("by_source_created", ["source", "_creationTime"])
    .index("by_errorType", ["errorType"]),

  alertRules: defineTable({
    ruleName: v.string(),
    description: v.optional(v.string()),
    thresholdValue: v.number(),
    timeWindowMinutes: v.number(),
    enabled: v.boolean(),
    lastTriggeredAt: v.optional(v.number()),
  }).index("by_ruleName", ["ruleName"]),
});
```

### 6.2 Notes importantes sur le schéma

- **`_creationTime`** : Convex fournit automatiquement un timestamp de création pour chaque document. Remplace `created_at`.
- **Pas de triggers `updated_at`** : Les mutations Convex doivent explicitement mettre à jour un champ `updatedAt` si nécessaire.
- **Pas de FK en cascade** : Convex n'a pas de clés étrangères. Les suppressions en cascade doivent être gérées applicativement dans les mutations (seulement 3 cas — voir §3.3).
- **Pas de CHECK constraints** : La validation se fait via les validators Convex (`v.string()`, `v.number()`, etc.) dans les arguments des mutations.
- **Pas d'enum Postgres** : Utiliser `v.union(v.literal(...), ...)` ou `v.string()` avec validation.
- **`v.any()`** : Remplace les colonnes JSONB qui stockaient des données arbitraires (payloads webhook, context, violetData).
- **Index** : Convex supporte les index simples et composés. Le `withIndex()` remplace les `WHERE` optimisés.

---

## 7. Phase 2 — Authentification (modèle localId + Convex Auth)

> ✅ **Phase 2 TERMINÉE** (2026-05-15).
>
> Ce qui est fait :
> - `convex/auth.ts` — Password provider avec **email verification** (OTP 6 chiffres via Resend) + **password reset** (OTP 6 chiffres via Resend)
> - `convex/http.ts` — Routes HTTP pour Convex Auth (OIDC, JWKS, OAuth callbacks)
> - `convex/auth.config.js` — Configuration OIDC (généré par `npx @convex-dev/auth`)
> - `convex/lib/resendOTP.ts` — Providers Resend OTP custom (verify + reset, emails HTML branded)
> - `convex/schema.ts` — `authTables` intégrées (11 tables : users, authAccounts, authSessions, authRefreshTokens, authVerificationCodes, authVerifiers, authRateLimits + indexes)
> - Key material généré : `JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL` (via `npx @convex-dev/auth`)
> - Env vars Convex : `AUTH_RESEND_KEY`, `EMAIL_FROM_ADDRESS`, `JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL`
> - Callback `afterUserCreatedOrUpdated` crée automatiquement le `userProfiles`
> - Queries `getIdentity`, `getProfile`, `getUserById`, `getBiometricPreference` fonctionnelles
> - Mutation `migrateAnonymousData(localId → userId)` implémentée
> - Mutation `updateProfile` implémentée
> - `assertAdmin()` / `assertAuthenticated()` dans `convex/lib/admin.ts`
> - `packages/shared/src/utils/localId.ts` — modèle localId complet
> - **Web** : `ConvexAuthProvider` + `ConvexQueryClient` bridge câblé dans `apps/web/src/router.tsx`
> - **Mobile** : `ConvexAuthProvider` + `ConvexReactClient` + SecureStore storage câblé dans `apps/mobile/src/app/_layout.tsx`
> - `apps/mobile/src/utils/convexStorage.ts` — TokenStorage basé sur expo-secure-store
> - `.env.local` : `VITE_CONVEX_URL` + `EXPO_PUBLIC_CONVEX_URL` ajoutés
> - `.env.example` : Section Convex Auth ajoutée (Resend, Apple, Google)
> - Dépendances : `resend@6.12.3`, `@oslojs/crypto@1.0.1` ajoutées au root
>
> Corrections post-revue (2026-05-16) :
> - `getBiometricPreference` déplacé de `convex/users/mutations.ts` vers `convex/users/queries.ts` (une query n'a rien à faire dans un fichier de mutations)
> - `getUserById` : ajout de `assertAdmin(ctx)` — tout utilisateur pouvait lire le profil de n'importe qui via userId
>
> Audit Phase 2 (2026-05-18) — 5 corrections appliquées :
> - `getAuthUserId(ctx)` remplace `identity.subject` partout (backend) — pattern officiel Convex Auth (`@convex-dev/auth/server`). Le `.d.ts` déprécie explicitement l'ancien `getUserId`.
> - Ajout `validatePasswordRequirements` sur le Password provider : 8+ chars, 1 majuscule, 1 minuscule, 1 chiffre
> - Ajout validation email dans `profile()` via check `includes("@")` — bloque les emails vides ou invalides côté serveur
> - `mobileLocalId.ts` web fallback corrigé : `crypto.randomUUID()` au lieu de `web-${Date.now()}-${Math.random()}`
> - Fichiers modifiés : `convex/auth.ts`, `convex/lib/admin.ts`, `convex/users/queries.ts`, `convex/users/mutations.ts`, `apps/mobile/src/utils/mobileLocalId.ts`
>
> À activer plus tard (env vars nécessaires) :
> - Google OAuth : `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` (décommenter `Google` dans `convex/auth.ts`)
> - Apple OAuth : `AUTH_APPLE_ID` + `AUTH_APPLE_SECRET` (décommenter `Apple` dans `convex/auth.ts`)
> - Domaine Resend : vérifier `maisonemile.com` sur resend.com/domains, puis changer `EMAIL_FROM_ADDRESS` → `noreply@maisonemile.com`
>
> Dev local actuel : `onboarding@resend.dev` (envoi limité à l'email du compte Resend `cb.webd.fr@gmail.com`)
>
> Leçons apprises :
> - `npx @convex-dev/auth` est **obligatoire** — il génère `JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL`, `auth.config.js`. Sans ça, les routes HTTP retournent `Missing environment variable JWKS`
> - `authTables` doit être ajouté au schema AVANT le déploiement — Convex crée les 11 tables auth automatiquement
> - Les providers OAuth Google/Apple s'importent depuis `@auth/core/providers/google|apple`, pas depuis `@convex-dev/auth/providers/*`
> - Les providers OAuth nécessitent des env vars (`AUTH_GOOGLE_ID`, etc.) pour `setEnvDefaults` — **ne pas les ajouter sans les vars** sinon le backend plante au démarrage
> - `@convex-dev/auth` a besoin de `@auth/core@^0.37.0` (pas 0.34.x)
> - Bun peut créer des copies dupliquées de `@convex-dev/auth` dans `node_modules/.bun/` si résolu depuis plusieurs workspaces — `rm -rf node_modules && bun install` déduplique
> - Le callback s'appelle `afterUserCreatedOrUpdated` (pas `afterUserCreated` qui est deprecated)
> - Convex Auth sign-in se fait via le client Convex (mutations/actions), pas via des endpoints REST HTTP
> - Sur mobile, `ConvexAuthProvider` nécessite un `storage` custom basé sur `expo-secure-store` (pas de `localStorage` en React Native)
> - **Password reset flow** : la doc officielle utilise `flow: "reset"` pour l'envoi de l'OTP et `flow: "reset-verification"` pour la vérification du code + nouveau mot de passe. Ne PAS utiliser `flow: "reset"` avec `code` + `newPassword`.

**Décision clé** : Violet.io n'ayant **aucun concept d'utilisateur côté Channel** (cf. §3.1), nous n'avons **pas besoin d'un mode anonymous dans Convex Auth**. Le modèle "anonymous" de Supabase était uniquement un mécanisme de persistance locale — nous le remplaçons par un simple identifiant local.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Modèle d'authentification                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  VISITEUR (anonymous)                                               │
│  ├── localId = crypto.randomUUID() stocké dans localStorage/SS     │
│  ├── Panier Violet → cookie violet_cart_id (pas de DB)              │
│  ├── Wishlist → Convex docs avec ownerId = localId                  │
│  ├── Tracking → Convex docs avec ownerId = localId                  │
│  └── Pas de Convex Auth session                                     │
│                                                                     │
│  UTILISATEUR AUTHENTIFIÉ                                            │
│  ├── Convex Auth (email/password ou OAuth)                           │
│  ├── userId Convex → remplace localId                                │
│  ├── Migration: données localId → userId (wishlist, events, cart)    │
│  └── Violet: inchangé (email dans customer, pas de user_id)         │
│                                                                     │
│  ADMIN                                                              │
│  ├── Convex Auth + isAdmin dans userProfiles                        │
│  └── Accès admin queries via vérification applicative               │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Configuration Convex Auth

```typescript
// convex/auth.ts — Configuration finale (Phase 2)
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ResendOTP } from "./lib/resendOTP";
import { ResendOTPPasswordReset } from "./lib/resendOTP";
import type { MutationCtx } from "./_generated/server";

// OAuth providers — décommenter quand les env vars seront configurées :
// import Apple from "@auth/core/providers/apple";
// import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      verify: ResendOTP,           // Email verification — OTP 6 chiffres via Resend
      reset: ResendOTPPasswordReset, // Password reset — OTP 6 chiffres via Resend
      profile(params) {
        return { email: params.email as string, name: params.name as string };
      },
    }),
    // Apple({ profile: (info) => ({ id: info.sub, name: ..., email: info.email }) }),
    // Google,
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      const typedCtx = ctx as unknown as MutationCtx;
      const existing = await typedCtx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      if (!existing) {
        await typedCtx.db.insert("userProfiles", {
          userId, preferences: {}, biometricEnabled: false,
        });
      }
    },
  },
});
```

### 7.2.1 Routes HTTP — `convex/http.ts`

```typescript
// convex/http.ts — Obligatoire pour les routes Convex Auth
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http); // OIDC, JWKS, OAuth callbacks
export default http;
```

### 7.2.2 Providers Resend OTP — `convex/lib/resendOTP.ts`

Deux providers custom `Email` pour Convex Auth :
- `ResendOTP` — email verification (sign-up), OTP 6 chiffres, 15 min validité
- `ResendOTPPasswordReset` — password reset, OTP 6 chiffres, 15 min validité

Tous deux envoient via l'API Resend avec templates HTML branded Maison Émile.

### 7.2.3 Initialisation — `npx @convex-dev/auth`

**Obligatoire avant le premier déploiement**. Génère :
- `convex/auth.config.js` (OIDC provider config)
- `JWKS` + `JWT_PRIVATE_KEY` (key material RSA)
- `SITE_URL` (URL du frontend)
- Modifie `convex/tsconfig.json`

```bash
npx @convex-dev auth
```

### 7.2.4 Variables d'environnement Convex

| Var | Valeur dev local | Usage |
|-----|-----------------|-------|
| `AUTH_RESEND_KEY` | `re_75CWU...` | Resend API key pour OTP |
| `EMAIL_FROM_ADDRESS` | `onboarding@resend.dev` | Adresse d'envoi (prod: `noreply@maisonemile.com`) |
| `JWKS` | Auto-généré | Clé publique RSA (JWKS) |
| `JWT_PRIVATE_KEY` | Auto-généré | Clé privée RSA |
| `SITE_URL` | `http://localhost:3000` | URL du frontend |

Configurées via : `npx convex env set KEY VALUE`

### 7.3 Implémentation du modèle localId

```typescript
// packages/shared/src/utils/localId.ts

const LOCAL_ID_KEY = "maison_emile_local_id";

/**
 * Retourne un ID local persistant (localStorage web / SecureStore mobile).
 * Sert de propriétaire pour les données pré-inscription (wishlist, tracking).
 *
 * Contrairement à Supabase anonymous auth, cet ID :
 * - Ne crée PAS de session côté serveur
 * - Ne consomme PAS de licence ou de connexion
 * - Est migré vers le userId Convex Auth à l'inscription
 */
export function getOrCreateLocalId(): string {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    let id = localStorage.getItem(LOCAL_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LOCAL_ID_KEY, id);
    }
    return id;
  }
  // Mobile: lire depuis SecureStore (adapté côté mobile)
  throw new Error("localId must be initialized platform-specifically on mobile");
}

/** Supprime le localId après migration vers userId Convex Auth. */
export function clearLocalId(): void {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.removeItem(LOCAL_ID_KEY);
  }
}
```

### 7.4 Migration anonymous → authenticated

```typescript
// convex/users/mutations.ts
export const migrateAnonymousData = mutation({
  args: {
    localId: v.string(),
    convexUserId: v.string(),
  },
  handler: async (ctx, { localId, convexUserId }) => {
    // 1. Migrer la wishlist
    const anonWishlist = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", localId))
      .first();
    if (anonWishlist) {
      await ctx.db.patch(anonWishlist._id, { userId: convexUserId });
    }

    // 2. Migrer les user_events
    const events = await ctx.db
      .query("userEvents")
      .withIndex("by_user_type", (q) => q.eq("userId", localId))
      .collect();
    for (const event of events) {
      await ctx.db.patch(event._id, { userId: convexUserId });
    }

    // 3. Migrer notification_preferences, push_tokens, etc. — même pattern
  },
});
```

### 7.5 Côté client — Remplacements

| Supabase | Convex |
|----------|--------|
| `supabase.auth.getSession()` | `const { isAuthenticated } = useConvexAuth()` |
| `supabase.auth.signInAnonymously()` | **Éliminé** → `getOrCreateLocalId()` |
| `supabase.auth.signInWithPassword()` | `signIn("password", { email, pass })` |
| `supabase.auth.signInWithOAuth()` | `signIn("google")` / `signIn("apple")` |
| `supabase.auth.signOut()` | `signOut()` |
| `supabase.auth.onAuthStateChange()` | `useConvexAuth()` (réactif) |
| `supabase.auth.getUser()` | `ctx.auth.getUserIdentity()` |
| `supabase.auth.updateUser({ email, password })` | `signUp("password", ...)` ou update profil |
| `supabase.auth.verifyOtp()` | Convex Auth gère la vérification email auto |
| `supabase.auth.signInAnonymously()` + `updateUser()` | **localId → `migrateAnonymousData()`** à l'inscription |

### 7.6 Admin

Le rôle admin est stocké dans `userProfiles.isAdmin` (pas dans les JWT metadata) :

```typescript
// convex/lib/admin.ts
import type { QueryCtx } from "../_generated/server";

export async function assertAdmin(ctx: QueryCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
    .first();
  if (!profile?.isAdmin) throw new Error("Admin access required");
}
```

---

## 8. Phase 3 — Fonctions Convex (queries, mutations, actions)

> ✅ **Phase 3 TERMINÉE** (2026-05-18).
>
> Ce qui est fait :
> - **Queries** : `orders`, `wishlists`, `tracking`, `notifications`, `content`, `support`, `admin`, `users`, `health` — toutes implémentées avec index composés, pas de `.filter()` sur DB queries
> - **Mutations** : `wishlists`, `tracking`, `notifications`, `support`, `users` — upsert patterns, idempotent writes, cascade deletes applicatifs
> - **Actions** : `lib/email.ts` (`sendEmail`, `sendRawEmail`, `escapeHtml`), `lib/push.ts`, `lib/violetApi.ts` (token manager singleton), `admin/mutations.ts` (`replyToSupportInquiry`, `evaluateAlerts`)
> - **Cron jobs** : 4 jobs — cleanup webhooks (mensuel), cleanup abandoned carts (journalier), retry stuck webhooks (horaire), evaluate alerts (horaire)
> - **Webhooks** : `webhooks/violet.ts` — HTTP action complet avec HMAC validation, idempotency, Zod validation, 30+ event types
> - **HTTP routes** : `http.ts` — auth routes + webhook endpoint
> - **Types** : `types.d.ts` — env vars typées, `webhookSchemas.ts` — Zod schemas pour tous les payloads Violet
>
> Audit Phase 3 (2026-05-18) — 9 corrections appliquées :
>
> **Convex Best Practices** (doc: https://docs.convex.dev/understanding/best-practices) :
> - **`Date.now()` interdit dans queries** : 4 queries (`getContentPageBySlug`, `getContentPages`, `getDashboardData`, `getHealthData`) + 2 queries health (`getStatus`, `runHealthCheck`) + `countRecentInquiries` → paramètre `now: v.number()` passé par le client. Les internal queries appelées par crons utilisent `Date.now()` (exception officielle : les internal queries ne sont pas des subscriptions réactives). 6 callers web/mobile mis à jour.
> - **`ctx.db.get/patch/delete` avec nom de table** (Convex 1.31+) : 37+ occurrences corrigées dans TOUS les fichiers convex (webhooks, users, wishlists, support, orders, notifications, crons, admin). Exemple : `ctx.db.get(id)` → `ctx.db.get("orders", id)`, `ctx.db.patch(id, data)` → `ctx.db.patch("userProfiles", id, data)`.
> - **`.filter()` → `.withIndex()`** : `migrateAnonymousData` utilise l'index composé `by_wishlistId_productId` au lieu de `.filter()` pour le lookup de doublons.
> - **`.collect()` borné** : `cleanupAbandonedCarts` utilise `.take(500)` au lieu de `.collect()` sans borne.
>
> **DRY (Don't Repeat Yourself)** :
> - **`escapeHtml` centralisé** : 2 copies identiques (admin/mutations.ts + webhooks/violet.ts) → 1 seule source dans `lib/email.ts`, importée partout.
> - **`sendRawEmail` centralisé** : 3 appels Resend duplicés (replyToSupportInquiry, evaluateAlerts, sendWebhookNotification) → 1 seul helper async dans `lib/email.ts`. `sendEmail` action délègue aussi à `sendRawEmail`.
> - **`VioletTokenManager` singleton** : `violetFetch()` créait un nouveau manager par appel → module-level singleton `_manager` réutilisé entre appels au sein d'une même action (évite N logins Violet).
>
> **Webhook processing** :
> - **`processOrderUpdated` : pas de bruit dans `errorLogs`** : Les webhooks ORDER_* arrivent souvent avant que le checkout soit persisté en DB. Remplacé `ctx.db.insert("errorLogs", ...)` par `console.log()` — ces événements sont normaux et ne doivent pas polluer le dashboard admin.
>
> Fichiers modifiés : `convex/content/queries.ts`, `convex/support/queries.ts`, `convex/admin/queries.ts`, `convex/health/queries.ts`, `convex/users/mutations.ts`, `convex/wishlists/mutations.ts`, `convex/orders/queries.ts`, `convex/support/mutations.ts`, `convex/notifications/mutations.ts`, `convex/crons.ts`, `convex/admin/mutations.ts`, `convex/lib/email.ts`, `convex/lib/violetApi.ts`, `convex/webhooks/violet.ts`, `apps/web/src/routes/admin/index.tsx`, `apps/web/src/routes/admin/health.tsx`, `apps/mobile/src/app/content/[slug].tsx`, `apps/mobile/src/app/content/index.tsx`
>
> Leçons apprises :
> - **`Date.now()` invalide le cache Convex** — les queries réactives sont re-exécutées quand les données changent, pas quand le temps change. Toujours passer le temps en argument client.
> - **`ctx.db.get/patch/delete` avec nom de table** est forward-compat depuis Convex 1.31 — requis pour custom ID generation futur. La version 1.39.1 du projet le supporte.
> - **`violetFetch` singleton** — Convex actions preserve module scope within a single invocation. Un module-level singleton est la bonne abstraction.
> - **`sendRawEmail` comme helper plain TS** — Convex recommande les helpers TS plutôt que `ctx.runAction()` quand on reste dans le même runtime. `sendRawEmail` est appelable depuis n'importe quelle action sans overhead.
> - **Les webhooks ORDER_* précèdent parfois le checkout** — c'est un comportement normal de Violet (envoi eager). Ne pas les traiter comme des erreurs.

### 8.1 Principe de base

Remplacer chaque accès Supabase par une fonction Convex :

| Type Supabase | Type Convex | Usage |
|---------------|-------------|-------|
| `supabase.from("table").select()` | `query()` | Lecture réactive |
| `supabase.from("table").insert()` | `mutation()` | Écriture |
| `supabase.from("table").update()` | `mutation()` | Mise à jour |
| `supabase.from("table").delete()` | `mutation()` | Suppression |
| `supabase.rpc("function")` | `query()` ou `mutation()` | Fonction custom |
| Edge Function (fetch externe) | `action()` | Appel API externe |
| HTTP endpoint | `httpAction()` | Webhook handler |

### 8.2 Best Practices Convex (obligatoires pour toutes les fonctions)

> Source : https://docs.convex.dev/understanding/best-practices

#### 8.2.1 Jamais `Date.now()` dans les queries

Les queries Convex sont réactives — elles sont re-exécutées quand les données changent, pas quand le temps change. `Date.now()` invalide le cache inutilement.

```typescript
// ❌ INTERDIT dans query handlers
export const getDashboardData = query({
  args: { range: v.string() },
  handler: async (ctx, { range }) => {
    const now = Date.now(); // ← invalide le cache à chaque exécution

// ✅ CORRECT — temps passé en argument par le client
export const getDashboardData = query({
  args: { range: v.string(), now: v.number() },
  handler: async (ctx, { range, now }) => {
    // `now` vient de Date.now() côté client
```

Exception : les `internalQuery` appelées par des crons/actions peuvent utiliser `Date.now()` car elles ne sont pas des subscriptions réactives.

#### 8.2.2 Toujours utiliser le nom de table dans `ctx.db.*`

Depuis Convex 1.31, les méthodes `ctx.db.get`, `ctx.db.patch`, `ctx.db.delete` acceptent un nom de table comme premier argument. C'est un safeguard forward-compat :

```typescript
// ❌ Sans nom de table (déprécié)
await ctx.db.get(orderId);
await ctx.db.patch(profile._id, { displayName: "Alice" });
await ctx.db.delete(item._id);

// ✅ Avec nom de table (requis)
await ctx.db.get("orders", orderId);
await ctx.db.patch("userProfiles", profile._id, { displayName: "Alice" });
await ctx.db.delete("wishlistItems", item._id);
```

#### 8.2.3 Éviter `.filter()` sur les database queries

Les `.filter()` sont équivalents à un filtrage en code mais moins lisibles. Préférer `.withIndex()` avec un index composé, ou filtrer en TypeScript :

```typescript
// ❌ .filter() scanne potentiellement toute la table
const existing = await ctx.db
  .query("wishlistItems")
  .withIndex("by_wishlistId", (q) => q.eq("wishlistId", wishlistId))
  .filter((q) => q.eq(q.field("productId"), productId))
  .first();

// ✅ Utiliser un index composé (O(1) lookup)
const existing = await ctx.db
  .query("wishlistItems")
  .withIndex("by_wishlistId_productId", (q) =>
    q.eq("wishlistId", wishlistId).eq("productId", productId)
  )
  .first();
```

#### 8.2.4 `.collect()` seulement pour de petits résultats

Si le nombre de résultats est potentiellement grand (1000+), utiliser `.take(N)` ou la pagination :

```typescript
// ❌ Non borné — peut exploser en production
const carts = await ctx.db.query("carts")
  .filter(/* ... */)
  .collect();

// ✅ Borné à 500 max
const carts = await ctx.db.query("carts")
  .filter(/* ... */)
  .take(500);
```

#### 8.2.5 Utiliser des helpers TypeScript (DRY)

Préférer les fonctions TypeScript pures aux `ctx.runQuery/runMutation/runAction` pour le code partagé :

```typescript
// ✅ Helper centralisé dans convex/lib/email.ts
export function escapeHtml(text: string): string { /* ... */ }
export async function sendRawEmail(params: {...}): Promise<...> { /* ... */ }

// Utilisable depuis n'importe quelle action sans ctx.runAction()
import { sendRawEmail, escapeHtml } from "../lib/email";
```

### 8.3 Exemples de migration

#### Wishlist (lecture)

**Avant (Supabase)** :
```typescript
const { data, error } = await supabase
  .from("wishlists")
  .select("*, wishlist_items(*)")
  .eq("user_id", userId)
  .single();
```

**Après (Convex)** :
```typescript
// convex/wishlists/queries.ts
export const getWishlist = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const wishlist = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!wishlist) return null;

    const items = await ctx.db
      .query("wishlistItems")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", wishlist._id))
      .collect();

    return { ...wishlist, items };
  },
});
```

#### Wishlist (écriture)

**Avant (Supabase)** :
```typescript
const { data, error } = await supabase
  .from("wishlists")
  .upsert({ user_id: userId }, { onConflict: "user_id" })
  .select("id")
  .single();
```

**Après (Convex)** :
```typescript
// convex/wishlists/mutations.ts
export const addToWishlist = mutation({
  args: { userId: v.string(), productId: v.string() },
  handler: async (ctx, { userId, productId }) => {
    let wishlist = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!wishlist) {
      const id = await ctx.db.insert("wishlists", { userId });
      wishlist = await ctx.db.get("wishlists", id);
      if (!wishlist) throw new Error("Failed to create wishlist");
    }

    // Vérifier si le produit est déjà dans la wishlist (index composé)
    const existing = await ctx.db
      .query("wishlistItems")
      .withIndex("by_wishlistId_productId", (q) =>
        q.eq("wishlistId", wishlist._id).eq("productId", productId),
      )
      .first();

    if (!existing) {
      await ctx.db.insert("wishlistItems", {
        wishlistId: wishlist._id,
        productId,
      });
    }
  },
});
```

#### Tracking (enregistrement d'événement)

**Avant** :
```typescript
await client.from("user_events").insert({
  user_id: userId,
  event_type: event.event_type,
  payload: event.payload,
});
```

**Après** :
```typescript
// convex/tracking/mutations.ts
export const recordEvent = mutation({
  args: {
    userId: v.string(),
    eventType: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("userEvents", {
      userId: args.userId,
      eventType: args.eventType,
      payload: args.payload,
    });
  },
});
```

#### Action — appel API externe (envoi email centralisé)

**Avant (Edge Function)** :
```typescript
// supabase/functions/send-notification/index.ts
const response = await fetch("https://api.resend.com/emails", { ... });
```

**Après (Convex — helpers centralisés DRY)** :
```typescript
// convex/lib/email.ts — helpers partagés par toutes les actions

// Helper HTML escaping — utilisé par support reply, webhook notifications, alert emails
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Helper email raw fetch — utilisable depuis toute action sans ctx.runAction()
export async function sendRawEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  idempotencyKey?: string;
}): Promise<{ success: true; resendEmailId?: string } | { success: false; error: string }> {
  // ... appelle Resend API avec gestion d'erreur centralisée
}

// Action publique — wrappe sendRawEmail pour les appels client
export const sendEmail = action({
  args: { to: v.string(), subject: v.string(), html: v.string(), text: v.optional(v.string()) },
  handler: async (_ctx, { to, subject, html, text }) => {
    const result = await sendRawEmail({ to, subject, html, text });
    if (!result.success) throw new Error(`Failed to send email: ${result.error}`);
  },
});
```

### 8.4 Tables avec index composés — attention

Les index Convex sont préfixés. `_creationTime` est automatiquement ajouté à la fin de chaque index. Exemple pour `orders` :

```typescript
// ✅ CORRECT — utilise l'index composé
await ctx.db
  .query("orders")
  .withIndex("by_userId", (q) =>
    q.eq("userId", userId)
    // _creationTime est implicitement trié via l'index
  )
  .order("desc")
  .take(50); // Toujours borner les résultats

// ❌ NE FONCTIONNE PAS — scanne TOUTE la table
await ctx.db
  .query("orders")
  .filter((q) => q.eq(q.field("userId"), userId))
```

### 8.5 Pagination

Remplacer `.range(from, to)` de Supabase par la pagination native Convex :

```typescript
// Convex pagination avec curseur — le client passe now: Date.now()
export const getContentPages = query({
  args: {
    type: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
    now: v.number(), // Date.now() passé par le client
  },
  handler: async (ctx, { type, paginationOpts, now }) => {
    const results = await ctx.db
      .query("contentPages")
      .withIndex("by_status_published", (q) => q.eq("status", "published"))
      .order("desc")
      .paginate(paginationOpts);

    const filtered = results.page.filter((page) => {
      if (page.publishedAt && page.publishedAt > now) return false;
      if (type) return page.type === type;
      return page.type !== "legal";
    });

    return { ...results, page: filtered };
  },
});
```

### 8.6 Violet API — Token Manager Singleton

`violetFetch()` utilise un module-level singleton pour réutiliser le token Violet au sein d'une même action :

```typescript
// convex/lib/violetApi.ts

// Singleton par module scope — réutilisé entre appels dans la même action
let _manager: VioletTokenManager | null = null;

function getManager(): VioletTokenManager {
  if (!_manager) {
    _manager = new VioletTokenManager();
  }
  return _manager;
}

export async function violetFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const manager = getManager(); // Réutilise le même token
  // ... retry logic, 401 refresh, 429 backoff
}
```

Les actions Convex preserve le module scope au sein d'une invocation, donc le token est partagé entre tous les `violetFetch()` d'une même action (ex: fetch refunds + send notification). Le module scope est frais à chaque nouvelle invocation.

### 8.7 Structure finale des fichiers Phase 3

```
convex/
├── lib/
│   ├── admin.ts              # assertAdmin(), assertAuthenticated()
│   ├── email.ts              # sendEmail action, sendRawEmail helper, escapeHtml
│   ├── errors.ts             # logError internal mutation
│   ├── push.ts               # sendPushNotification action
│   ├── resendOTP.ts          # Convex Auth OTP providers
│   ├── violetApi.ts          # violetFetch + VioletTokenManager singleton
│   └── webhookSchemas.ts     # Zod validation schemas
├── users/
│   ├── queries.ts            # getProfile, getIdentity, getBiometricPreference, getUserById
│   └── mutations.ts          # updateProfile, setBiometricPreference, migrateAnonymousData
├── orders/
│   └── queries.ts            # getOrders, getOrderDetail, getGuestOrderByToken, getAllOrders
├── wishlists/
│   ├── queries.ts            # getWishlist, getWishlistProductIds
│   └── mutations.ts          # addToWishlist, removeFromWishlist
├── tracking/
│   ├── queries.ts            # getUserEvents
│   └── mutations.ts          # recordEvent
├── content/
│   └── queries.ts            # getContentPageBySlug, getContentPages, getRelatedContent, getFaqItems
├── support/
│   ├── queries.ts            # getSupportInquiries, getSupportInquiry, getLinkedOrder, countRecentInquiries
│   └── mutations.ts          # insertSupportInquiry, updateInquiryStatus, updateInternalNotes
├── notifications/
│   ├── queries.ts            # getUserPushTokens, getNotificationPreferences
│   └── mutations.ts          # upsertPushToken, deletePushToken, upsertNotificationPreference
├── admin/
│   ├── queries.ts            # getDashboardData, getHealthData, getRecentErrors, getMerchants, etc.
│   └── mutations.ts          # replyToSupportInquiry, evaluateAlerts, updateAlertTriggerTime
├── health/
│   └── queries.ts            # getStatus, runHealthCheck
├── webhooks/
│   └── violet.ts             # handleVioletWebhook HTTP action + 30+ event processors
├── crons.ts                  # 4 cron jobs
├── http.ts                   # Auth routes + webhook endpoint
└── types.d.ts                # Env vars TypeScript declarations
```

---

## 9. Phase 4 — Remplacement des clients partagés (`packages/shared`)

> ✅ **Phase 4 TERMINÉE** (2026-05-18).
>
> Ce qui est fait :
> - **Pattern retenu** : Les pages web et mobile consomment `convex/react` directement (`useQuery`, `useMutation` + `#convex/_generated/api`). Pas de hook intermédiaire dans `packages/shared`.
> - **Justification** : La doc officielle Convex (React Quickstart) montre `useQuery(api.xxx)` directement dans les composants — c'est le pattern idiomatique. Ajouter une couche de hooks dans `packages/shared` créerait une indirection inutile (DRY/KISS).
> - `packages/shared/src/hooks/convex/` — **Supprimé** (audit Phase 4) : 7 fichiers + barrel export étaient du code mort (0 import depuis web, 0 depuis mobile). Les pages consomment déjà Convex directement.
> - `packages/shared/src/hooks/useWishlist.ts` — **Supprimé** (audit Phase 4) : hook Supabase orphelin (0 consommateur web/mobile depuis Phase 5/6).
> - `packages/shared/src/hooks/useAuth.ts` — **Supprimé** (audit Phase 4) : hook Supabase orphelin (0 consommateur).
> - `packages/shared/src/hooks/useProfile.ts` — **Supprimé** (audit Phase 4) : hook Supabase orphelin (0 consommateur).
> - `packages/shared/src/hooks/useNotificationPreferences.ts` — **Supprimé** (audit Phase 4) : hook Supabase orphelin (0 consommateur après migration mobile).
> - `packages/shared/src/hooks/index.ts` — **Nettoyé** : retraits des exports orphelins (4 hooks Supabase + 7 hooks Convex morts).
> - `packages/shared/package.json` — Export `"./hooks/convex"` retiré.
> - `packages/shared/src/types/notification.types.ts` — `mergeWithDefaults()` relogée ici (était dans le hook Supabase supprimé).
> - `packages/shared/src/types/index.ts` — Export `mergeWithDefaults` ajouté.
> - `apps/mobile/src/app/settings/notifications.tsx` — **Migré vers Convex** : remplacé les hooks Supabase `useNotificationPreferences`/`useUpdateNotificationPreference` (`@ecommerce/shared`) par `useQuery`/`useMutation` Convex directs. Dernier fichier mobile qui appelait encore Supabase.
>
> Audit Phase 4 (2026-05-18) — 6 findings, 6 résolus :
>
> | # | Sévérité | Problème | Résolution |
> |---|----------|----------|------------|
> | F1 | 🔴 Critique | Hooks convex morts (7 fichiers, 0 consommateur) | Supprimé dossier `hooks/convex/` + export `package.json` |
> | F2 | 🔴 Critique | Mobile notifications appelait encore Supabase | Réécrit `notifications.tsx` avec Convex direct |
> | F3 | 🟡 Moyen | Imports relatifs `../../../../convex/_generated/api` fragiles | Résolu par suppression (F1) |
> | F4 | 🟡 Moyen | Triple redondance DRY (Supabase + Convex mort + inline) | Supprimé couche Convex morte (F1) + 4 hooks Supabase orphelins. `mergeWithDefaults` relogé dans `types/` |
> | F5 | 🟡 Moyen | `useIsInWishlistConvex` fragilité Rules of Hooks | Résolu par suppression (F1) |
> | F6 | 🟢 Mineur | `Id` import relatif `../../../../convex/_generated/dataModel` | Résolu par suppression (F1) |
>
> Leçons apprises :
> - **Ne pas créer de hooks shared juste pour wrapper Convex** — `convex/react` est déjà le hook. Un hook `useWishlistConvex` qui appelle `useQuery(api.wishlists.queries.getWishlist)` n'ajoute aucune valeur — c'est juste un proxy. Les pages doivent appeler Convex directement.
> - **Vérifier les consommateurs avant de créer des hooks** — Si web et mobile utilisent déjà `useQuery(api.xxx)` inline, un hook shared est du code mort par construction.
> - **Supprimer les hooks orphelins immédiatement** — Attendre la Phase 11 pour nettoyer les hooks Supabase orphelins n'ajoute que de la confusion. Si un hook n'a plus de consommateur, le supprimer tout de suite (principe YAGNI).
> - **`packages/shared` reste utile pour** : types partagés (`OrderDetail`, `NotificationType`, `TrackingEvent`), utilitaires (`formatPrice`, `buildPageMeta`, `getOrCreateLocalId`), et le hook `useTracking` (logique de déduplication pure, pas de dépendance Convex/Supabase).
> - **Le path alias `#convex/*`** est configuré dans `apps/web/tsconfig.json` et `apps/mobile/tsconfig.json` mais PAS dans `packages/shared/tsconfig.json` — c'est voulu : le package shared ne doit pas dépendre du backend Convex (il est frontend-agnostic).

### 9.1 Stratégie

Le package `@ecommerce/shared` est refactoré selon le principe suivant :

- **Ce qui reste dans shared** : types, utilitaires, hooks agnostiques du backend (`useTracking` avec déduplication, query options factories pour Violet API)
- **Ce qui sort de shared** : les appels backend directs. Chaque plateforme (web/mobile) appelle Convex directement depuis ses pages/composants.
- **Ce qui est supprimé en Phase 11** : les clients Supabase restants (`clients/*.ts`)

### 9.2 Pattern retenu — Convex direct dans les pages

Les pages web et mobile consomment `convex/react` directement :

```typescript
// ✅ Pattern retenu — chaque page appelle Convex directement
import { useQuery, useMutation } from "convex/react";
import { api } from "#convex/_generated/api";

function WishlistPage() {
  const wishlist = useQuery(api.wishlists.queries.getWishlist, userId ? { userId } : "skip");
  const removeMutation = useMutation(api.wishlists.mutations.removeFromWishlist);
  // ...
}
```

```typescript
// ❌ Anti-pattern — hook proxy dans shared (code mort)
// packages/shared/src/hooks/convex/useWishlist.ts
export function useWishlistConvex(userId: string | undefined) {
  return useQuery(api.wishlists.queries.getWishlist, userId ? { userId } : "skip");
}
// → Supprimé : n'ajoute aucune valeur par rapport à l'appel direct
```

### 9.3 Hooks actifs restants dans `packages/shared/src/hooks/`

| Hook | Raison de conservation | Backend |
|------|----------------------|---------|
| `useTracking.ts` | Logique de déduplication pure (60s window, prune stale keys) | Agnostique — `sendEvent` injecté par chaque plateforme |
| `useCart.ts` | TanStack Query + optimistic updates pour Violet API | Violet API (Server Functions) |
| `useProducts.ts` | Query options factories pour catalogue Violet | Violet API |
| `useProductVariants.ts` | Logique de sélection de variants (pure) | Agnostique |
| `useOrders.ts` | Query options factories pour checkout/confirmation | Violet API (TanStack Query) |
| `useContent.ts` | Query options factories pour listing Violet | Violet API |
| `useRecentlyViewed.ts` | localStorage + TanStack Query | Agnostique (localStorage) |
| `useBrowsingHistory.ts` | TanStack Query pour historique navigation | Violet API |
| `useShare.ts` | Abstraction plateforme-agnostique | Agnostique |

### 9.4 Clients Supabase restants dans `packages/shared/src/clients/` (Phase 11)

Ces fichiers restent en cohabitation jusqu'à la Phase 11 (nettoyage final) :

- `supabase.ts` → Remplacé par `convex/react` + `ConvexProvider`
- `supabase.server.ts` → Remplacé par fonctions Convex (pas besoin de client serveur)
- `auth.ts` → Remplacé par `@convex-dev/auth/react`
- `wishlist.ts` → Remplacé par `convex/wishlists/queries.ts` + `mutations.ts`
- `profile.ts` → Remplacé par `convex/users/queries.ts` + `mutations.ts`
- `tracking.ts` → Remplacé par `convex/tracking/mutations.ts`
- `notifications.ts` → Remplacé par `convex/notifications/queries.ts` + `mutations.ts`
- `content.ts` → Remplacé par `convex/content/queries.ts`
- `faq.ts` → Remplacé par `convex/content/queries.ts`
- `support.ts` → Remplacé par `convex/support/mutations.ts`
- `biometricAuth.ts` → Remplacé par `convex/users/queries.ts`
- `admin.ts` → Remplacé par `convex/admin/queries.ts`
- `admin-support.ts` → Remplacé par `convex/support/queries.ts` + `mutations.ts`
- `health.ts` → Remplacé par `convex/health/queries.ts`

### 9.5 `packages/shared/package.json` — mises à jour

```diff
{
  "dependencies": {
-   "@supabase/supabase-js": "^2.100.1",
+   "convex": "^1.x",
+   "@convex-dev/auth": "^0.x",
    "zod": "^4.3.6"
  }
}
```

## 10. Phase 5 — Intégration Web (TanStack Start)

> ✅ **Phase 5 TERMINÉE** (2026-05-16).
>
> Ce qui est fait :
> - `apps/web/src/hooks/useAuthSession.ts` — Réécrit : `useConvexAuth()` + `useQuery(api.users.queries.getIdentity)` + modèle localId. Plus de Supabase session, plus de anonymous session. Interface `WebAuthSession { userId, email, localId, isAuthenticated, isLoading }`.
> - `apps/web/src/hooks/useUser.ts` — Réécrit : `useConvexAuth()` + `useQuery(api.users.queries.getIdentity)`. Interface `ConvexUser { id, email, name, emailVerified }`.
> - `apps/web/src/routes/__root.tsx` — Supprimé `getSupabaseBrowserClient()`, `_setSupabaseClient()`, `supabase` prop sur `CartProvider`. Utilise `useAuthSession()` pour le userId + localId (audit Phase 5 : pattern cohérent, tracking anonymous corrigé).
> - `apps/web/src/contexts/CartContext.tsx` — Supprimé `SupabaseClient` prop, `useCartSync` Realtime, `useQueryClient`. La réactivité vient nativement de Convex.
> - `apps/web/src/routes/auth/login.tsx` — Réécrit : `signIn("password", { email, password, flow: "signIn" })` via `useAuthActions()` de Convex Auth. Plus de `getSupabaseBrowserClient()`.
> - `apps/web/src/routes/auth/signup.tsx` — Réécrit : `signIn("password", { email, password, flow: "signUp" })` → navigate to `/auth/verify` avec password en router state.
> - `apps/web/src/routes/auth/verify.tsx` — Réécrit : `signIn("password", { email, password, flow: "signUp", code: otp })` + `migrateAnonymousData(localId)` après vérification réussie.
> - `apps/web/src/routes/account/route.tsx` — Réécrit : guard client-side via `useConvexAuth()` au lieu de `createServerFn` + `getSupabaseSessionClient()`.
> - `apps/web/src/routes/account/profile.tsx` — Réécrit : Convex queries/mutations. Flow change password complet en 3 étapes (idle → otp-sent → success).
> - `apps/web/src/routes/account/wishlist.tsx` — Réécrit : Convex queries/mutations (`useQuery(api.wishlists.queries.getWishlist)`, `useMutation(api.wishlists.mutations.removeFromWishlist)`).
> - `apps/web/src/routes/account/orders/index.tsx` — Réécrit : Convex query `useQuery(api.orders.queries.getOrders)` avec types partagés.
> - `apps/web/src/routes/account/orders/$orderId.tsx` — Réécrit : Convex query `useQuery(api.orders.queries.getOrderDetail)` avec types partagés. Plus de `useOrderRealtime` Supabase.
> - `apps/web/src/routes/checkout/index.tsx` — Modifié : `useAuthSession()` retourne `{ userId, isAuthenticated }` au lieu de `{ user, isAnonymous }`.
> - `apps/web/src/components/Header.tsx` — `isAuthenticated` vient de `useUser()` directement.
> - `apps/web/src/components/product/ProductDetail.tsx` — Convex Auth pour userId au lieu de Supabase session.
> - `apps/web/src/components/product/WishlistButton.tsx` — **Migré vers Convex** : utilise directement `useQuery(api.wishlists.queries.getWishlistProductIds)` + `useMutation(api.wishlists.mutations.addToWishlist/removeFromWishlist)` au lieu des hooks Supabase/TanStack Query.
> - `apps/web/src/components/product/RecentlyViewedRow.tsx` — Idem.
> - `apps/web/src/hooks/useTrackingListener.ts` — **Migré vers Convex** : utilise `useMutation(api.tracking.mutations.recordEvent)` au lieu du server function Supabase `trackEventFn`. Supporte userId Convex (authentifié) et localId (anonyme).
> - `packages/shared/src/utils/index.ts` — Ajout export `getOrCreateLocalId`, `getLocalId`, `clearLocalId`.
> - `packages/shared/package.json` — Export `"./hooks/convex"` retiré (code mort, audit Phase 4).
> - `apps/web/tsconfig.json` — Ajout path alias `"#convex/*": ["../../convex/*"]` pour remplacer les imports relatifs profonds.
> - `apps/web/src/types/convexOrders.ts` — Types partagés `ConvexOrder`, `ConvexOrderBag`, `ConvexOrderItem`, `ConvexOrderRefund` extraits des pages orders.
>
> Fichiers backend Convex corrigés :
> - `convex/orders/queries.ts` — **Sécurité** : `getOrderDetail` vérifie l'appartenance (owner/admin/guest). **Performance** : `getOrders` ajoute paramètre `limit` (défaut 50, utilise `.take()` au lieu de `.collect()`).
> - `convex/users/mutations.ts` — **Correction collision** : `migrateAnonymousData` détecte si une wishlist utilisateur existe déjà → merge les items (skip doublons) → supprime la wishlist anonyme. Plus de risque de doublons.
> - `convex/auth.ts` — Commentaire sur `afterUserCreatedOrUpdated` : documenté que la mise à jour profil sera nécessaire quand OAuth sera activé.
> - `convex/health/queries.ts` — `_ctx` au lieu de `ctx` (unused var)
> - `convex/lib/resendOTP.ts` — `type RandomReader` import (verbatimModuleSyntax)
> - `convex/wishlists/mutations.ts` — Fix: `ctx.db.get(id)` au lieu de type assertion incomplète
>
> Tests :
> - `__tests__/useAuthSession.test.tsx` → désactivé (tests Supabase, Phase 10)
> - `components/product/__tests__/ProductDetail.test.tsx` — Ajout mocks `@convex-dev/auth/react` + `convex/react`
> - Suite de tests complète : 512 web + 383 shared = 895 tests verts
>
> Ce qui n'a **PAS** été supprimé (cohabitation) :
> - `apps/web/src/utils/supabase.ts` — Toujours importé par les server functions et API routes non migrées (Violet API, cart actions, etc.)
> - `apps/web/src/server/supabaseServer.ts` — Toujours utilisé par les server functions qui lisent Supabase
> - `apps/web/src/server/orders.ts`, `cartSync.ts`, `guestOrderHandlers.ts`, etc. — Server functions Supabase toujours actives pour les routes API
> - `packages/shared/src/clients/*.ts` — Toujours importés par le mobile et les routes API
> - `packages/shared/src/hooks/useCartSync.ts` — Supprimé du CartContext web, mais toujours dans le package
>
> Leçons apprises :
> - Les chemins d'import relatifs vers `convex/_generated/api` doivent être remplacés par le path alias `#convex/*` dans le tsconfig — évite la fragilité lors des refactorings
> - `npx @convex-dev/auth` configure `ConvexAuthProvider` dans `router.tsx` Wrap, mais les pages doivent utiliser `useConvexAuth()` et `useAuthActions()` côté client
> - Le guard d'authentification `account/route.tsx` ne peut plus utiliser `createServerFn().handler()` car Convex Auth stocke les tokens en localStorage (pas de cookie). Le guard est client-side uniquement avec `useConvexAuth()`
> - La migration anonymous → authenticated se fait dans la page verify via `migrateAnonymousData(localId)`, pas dans un callback afterUserCreatedOrUpdated
> - Les Convex queries retournent `undefined` pendant le chargement (pas `null`). `order === undefined` = loading, `order === null` = pas trouvé
> - Le type `any` doit être évité — utiliser des interfaces locales (`ConvexOrder`, `ConvexOrderBag`, etc.) pour typer les résultats Convex
> - Les tests existants qui mockaient Supabase doivent être adaptés pour mocker aussi `@convex-dev/auth/react` et `convex/react`
> - **WishlistButton** : `ReactMutation` de Convex est une fonction callable (pas d'`isPending`) — gérer le pending state manuellement via `useState`
> - **Tracking** : Le server function `trackEventFn` routait vers Supabase — remplacé par `useMutation(api.tracking.mutations.recordEvent)` directement
> - **Password change** : Le flow Convex Auth nécessite un OTP inline — le message "allez voir ailleurs" n'est pas acceptable en UX
> - **Ownership check** : `getOrderDetail` doit vérifier que l'utilisateur est le propriétaire ou admin — sinon n'importe qui peut lire n'importe quelle commande via document ID
> - **N+1 queries** : Les Convex queries qui font des boucles imbriquées (orders→bags→items→refunds) doivent utiliser `.take(limit)` pour borner le nombre d'opérations
>
> Corrections post-revue (2026-05-16) :
> - **Password reset `flow`** : `flow: "reset"` est pour l'envoi de l'OTP, `flow: "reset-verification"` est pour la vérification du code + nouveau mot de passe. Le code utilisait `flow: "reset"` avec `code` + `newPassword` — corrigé.
> - **`mapAuthError` DRY** : 6 copies identiques de la fonction étaient dupliquées entre web (3) et mobile (3). Remplacées par une seule fonction partagée `packages/shared/src/utils/authErrors.ts` avec un paramètre `context` (`"signIn"` | `"signUp"` | `"verify"` | `"reset"`).
> - **`ConvexQueryClient` bridge** : Retiré de `router.tsx` — importé mais jamais utilisé par aucun hook. Le bridge interceptait toutes les queries TanStack Query (y compris Violet API) sans bénéfice.
> - **`getAllOrders`** : Ajout paramètre `limit` (défaut 100) + `.take(limit)` au lieu de `.collect()` sans borne.
>
> Audit Phase 5 (2026-05-18) — 5 corrections appliquées :
>
> | # | Sévérité | Fichier | Problème | Correction |
> |---|----------|---------|----------|------------|
> | F3 | 🟡 Moyen | `apps/web/src/routes/__root.tsx` | Pattern identity query dupliqué (3e endroit après `useAuthSession` et `useUser`). Tracking passait `undefined` pour les anonymous au lieu du `localId`. | Remplacé par `useAuthSession()` — 1 seul hook cohérent. Tracking utilise `userId ?? localId`. |
> | F4 | 🟡 Moyen | `apps/web/src/components/product/WishlistButton.tsx` | Error boundary silencieux — masquait les erreurs ConvexProvider manquant en production. | Ajout `console.warn` dans `getDerivedStateFromError` pour visibilité en dev. |
> | F6 | 🟢 Mineur | `convex/users/queries.ts` | JSDoc `getIdentity` disait "Debug" — query de production utilisée par `useAuthSession`, `useUser`, `AuthContext`, `__root.tsx`. | Mis à jour : "Returns the Convex Auth identity of the caller." |
> | F7 | 🟢 Mineur | `apps/web/src/routes/account/orders/index.tsx` | `useConvexAuth` importé de `convex/react` au lieu de `@convex-dev/auth/react` (source canonique selon doc officielle). | Import standardisé vers `@convex-dev/auth/react`. |
> | F8 | 🟡 Moyen | `apps/web/src/routes/auth/signup.tsx` + `profile.tsx` + `apps/mobile/src/app/auth/signup.tsx` + `profile.tsx` | Validation frontend password = 6 chars vs backend `validatePasswordRequirements` = 8+ chars + majuscule + minuscule + chiffre. Mauvaise UX : l'utilisateur voyait "Creating Account..." puis une erreur backend. | Synchronisé : frontend et mobile valident 8 chars + uppercase + lowercase + digit (identique au backend). |
>
> Fichiers modifiés : `apps/web/src/routes/__root.tsx`, `apps/web/src/components/product/WishlistButton.tsx`, `convex/users/queries.ts`, `apps/web/src/routes/account/orders/index.tsx`, `apps/web/src/routes/auth/signup.tsx`, `apps/web/src/routes/account/profile.tsx`, `apps/mobile/src/app/auth/signup.tsx`, `apps/mobile/src/app/profile.tsx`
>
> Parité Web ↔ Mobile vérifiée : Convex hooks, auth flows, password validation, tracking, wishlist, orders — identiques sur les deux plateformes.
> Docs officielles consultées : `docs.convex.dev` (TanStack Start, React, React Native, Auth, Best Practices), `tanstack.com`, `docs.expo.dev`, `reactnative.dev`, `docs.violet.io`.
> Gate : typecheck ✅ | lint ✅ | 958 tests verts (514 web + 376 shared + 68 mobile).

### 10.1 Router — ConvexProvider + ConvexAuthProvider (✅ En place Phase 2, nettoyé Phase 5)

`apps/web/src/router.tsx` utilise `ConvexReactClient` + `ConvexAuthProvider` dans le `Wrap`. Le bridge `ConvexQueryClient` (`@convex-dev/react-query`) a été retiré lors de la revue post-migration — il interceptait toutes les queries TanStack Query (y compris Violet API) sans qu'aucun hook ne l'utilise réellement. Convex queries utilisent `convex/react` directement, Violet queries utilisent `@tanstack/react-query` directement.

### 10.2 Auth hooks (✅ Nouveau Phase 5)

Deux hooks remplacent les anciens hooks Supabase :

- `useAuthSession()` — retourne `{ userId, email, localId, isAuthenticated, isLoading }`. Utilise `useConvexAuth()` + `useQuery(api.users.queries.getIdentity)`. Remplace l'ancien hook qui appelait `supabase.auth.onAuthStateChange()` + `initAnonymousSession()`.
- `useUser()` — retourne `{ data: ConvexUser | null, isLoading, isAuthenticated }`. Utilisé par Header et composants UI.

### 10.3 Auth pages (✅ Réécrites Phase 5)

| Page | Implémentation Convex Auth |
|------|---------------------------|
| `auth/login.tsx` | `signIn("password", { email, password, flow: "signIn" })` via `useAuthActions()` |
| `auth/signup.tsx` | `signIn("password", { email, password, flow: "signUp" })` → OTP envoyé via Resend |
| `auth/verify.tsx` | `signIn("password", { email, password, flow: "signUp", code: otp })` + `migrateAnonymousData(localId)` |

### 10.3.1 Path alias `#convex/*`

`apps/web/tsconfig.json` expose `"#convex/*": ["../../convex/*"]`, résolu par `vite-tsconfig-paths`. Tous les fichiers web utilisent maintenant `import { api } from "#convex/_generated/api"` au lieu de chemins relatifs profonds (`../../../../../convex/_generated/api`).

### 10.4 Account pages (✅ Migrées Phase 5)

| Page | Changement |
|------|-----------|
| `account/route.tsx` | Guard client-side `useConvexAuth()` (pas de createServerFn) |
| `account/profile.tsx` | Convex queries/mutations + flow change password complet (idle → OTP envoyé → OTP + nouveau mot de passe → succès) |
| `account/wishlist.tsx` | Convex queries/mutations directes |
| `account/orders/index.tsx` | `useQuery(api.orders.queries.getOrders)` réactif |
| `account/orders/$orderId.tsx` | `useQuery(api.orders.queries.getOrderDetail)` réactif |

### 10.5 API Routes — Stratégie

Les API routes sont divisées en deux catégories :

| Catégorie | Routes | Statut Phase 5 |
|-----------|--------|----------------|
| **Violet API** (Server Functions) | `api/products/*`, `api/cart/*/shipping`, `api/cart/*/payment-intent`, `api/collections/*`, `api/merchants/*` | **Inchangé** — nécessitent `VIOLET_APP_SECRET` |
| **Supabase reads** | `api/orders/*`, `api/guest-order-lookup.ts`, `api/track-event.ts` | **Pages migrées** vers Convex queries côté client — les API routes restent mais ne sont plus appelées par les pages account |
| **Supabase writes** | `api/cart/claim.ts`, `api/cart/merge.ts`, `api/cart/user.ts` | **Toujours actives** — utilisées par `cartSync.ts` server functions |

Les server functions liées au cart (`cartSync.ts`, `cartActions.ts`) utilisent encore Supabase car elles interagissent avec la table `carts` Supabase. La migration complète du cart nécessite la Phase 7 (webhooks) + migration de `cartSync.ts`.

### 10.6 Fichiers Supabase restants (Phase 11)

Les fichiers Supabase sont conservés pour la cohabitation :

- `apps/web/src/utils/supabase.ts` — Importé par checkout, ProductDetail (cart), server functions
- `apps/web/src/server/supabaseServer.ts` — Utilisé par toutes les server functions
- Ils seront supprimés en Phase 11 après migration complète des server functions

---


## 11. Phase 6 — Intégration Mobile (Expo)

> ✅ **Phase 6 TERMINÉE** (2026-05-16).
>
> Ce qui est fait :
> - `apps/mobile/tsconfig.json` — Ajout path alias `"#convex/*": ["../../convex/*"]` (identique au web).
> - `apps/mobile/src/utils/mobileLocalId.ts` — **Nouveau fichier** : implémentation mobile du modèle localId via `expo-secure-store`. Fonctions `getOrCreateLocalIdMobile()`, `getLocalIdMobile()`, `clearLocalIdMobile()`. Remplace `localStorage` du web par SecureStore (chiffrement natif iOS Keychain / Android Keystore).
> - `apps/mobile/src/utils/pendingSignup.ts` — **Réécrit (audit Phase 6)** : stockage des données pending signup (email + password) dans SecureStore au lieu de variables module en clair. Le password n'est jamais en mémoire JS heap entre les écrans.
> - `apps/mobile/src/context/AuthContext.tsx` — **Réécrit** : `useConvexAuth()` + `useQuery(api.users.queries.getIdentity)` au lieu de `supabase.auth.onAuthStateChange`. Interface `MobileAuthSession { userId, email, localId, isAuthenticated, isLoading, user: null, isAnonymous, session: null }` (compatibilité descendante pour les consommateurs existants). Cart merge adapté pour Convex userId. Migration anonymous data intégrée. Biometric enrollment utilise `useMutation(api.users.mutations.setBiometricPreference)`.
> - `apps/mobile/src/app/_layout.tsx` — **Simplifié** : supprimé tout le code Supabase Auth (anonymous session init, `onAuthStateChange`, `useCartSync` Realtime, `supabaseClient` singleton, `configureEnv` Supabase). Gardé : ConvexAuthProvider + ConvexReactClient, StripeProvider, thème, push notifications, exchange rates. Net -100 lignes.
> - `apps/mobile/src/app/auth/login.tsx` — **Réécrit** : `signIn("password", { email, password, flow: "signIn" })` via `useAuthActions()`. OAuth commenté (comme web).
> - `apps/mobile/src/app/auth/signup.tsx` — **Réécrit** : `signIn("password", { email, password, flow: "signUp" })` → pending signup via SecureStore (`setPendingSignup`) → navigate to verify.
> - `apps/mobile/src/app/auth/verify.tsx` — **Réécrit** : `signIn("password", { flow: "signUp", code })` + `migrateAnonymous({ localId })` + `clearLocalIdMobile()`. Plus de `verifyEmailOtp`, `setAccountPassword`, `supabase.from("user_profiles").upsert()`. Pending signup data chargé async depuis SecureStore (chiffré, pas en mémoire JS).
> - `apps/mobile/src/app/orders/index.tsx` — **Réécrit** : `useQuery(api.orders.queries.getOrders)` au lieu de TanStack Query + Supabase Realtime.
> - `apps/mobile/src/app/orders/[orderId].tsx` — **Réécrit** : `useQuery(api.orders.queries.getOrderDetail)` au lieu de TanStack Query + `useOrderRealtime`.
> - `apps/mobile/src/app/profile.tsx` — **Réécrit** : Convex queries/mutations pour le profil. Flow change password complet en 3 étapes (idle → otp-sent → success) identique au web.
> - `apps/mobile/src/app/wishlist.tsx` — **Réécrit** : `useQuery(api.wishlists.queries.getWishlist)` + `useMutation(api.wishlists.mutations.removeFromWishlist)` au lieu de `useWishlist`/`useRemoveFromWishlist` de `@ecommerce/shared` (Supabase).
> - `apps/mobile/src/components/product/WishlistButton.tsx` — **Réécrit** : `useQuery(api.wishlists.queries.getWishlistProductIds)` + `useMutation` au lieu de `useIsInWishlist`/`useAddToWishlist`/`useRemoveFromWishlist` de `@ecommerce/shared`. Pending state manuel via `useState`.
> - `apps/mobile/src/components/HamburgerMenu.tsx` — `useAuth()` de `@/context/AuthContext` au lieu de `useUser` de `@ecommerce/shared`.
> - `apps/mobile/src/app/content/index.tsx` — **Réécrit** : `usePaginatedQuery(api.content.queries.getContentPages)` avec infinite scroll natif au lieu de `createSupabaseClient()` + `getContentPages()`.
> - `apps/mobile/src/app/content/[slug].tsx` — **Réécrit** : `useQuery(api.content.queries.getContentPageBySlug)` + `useQuery(api.content.queries.getRelatedContent)` au lieu de `createSupabaseClient()` + `getContentPageBySlug()`/`getRelatedContent()`.
> - `apps/mobile/src/app/help/index.tsx` — **Réécrit** : `useQuery(api.content.queries.getFaqItems)` au lieu de `createSupabaseClient()` + `getFaqItems()`.
> - `apps/mobile/src/app/help/contact.tsx` — **Réécrit** : `useMutation(api.support.mutations.insertSupportInquiry)` au lieu de `createSupabaseClient()` + `insertSupportInquiry()`. Supprimé l'appel à `client.functions.invoke("send-support-email")` (TODO: action Convex Resend).
> - `apps/mobile/src/app/order/lookup.tsx` — **Réécrit** : Flux OTP invité migré de `supabase.auth.signInWithOtp`/`verifyOtp` vers Convex Auth `signIn("password", { flow: "reset" })`. Plus de session Supabase temporaire, plus de `supabase.auth.signOut()`. Réutilise intentionnellement le flow `reset` de Convex Auth — le provider `ResendOTP` envoie l'email indépendamment de l'existence du compte (voir DESIGN NOTE dans le fichier).
> - `apps/mobile/src/app/products/[productId].tsx` — **Modifié** : `useAuth()` de Convex pour vérifier l'authentification au lieu de `createSupabaseClient()` + `getSession()`. Plus de `getSessionToken()` helper.
> - `apps/mobile/src/hooks/usePushRegistration.ts` — **Réécrit** : `useMutation(api.notifications.mutations.upsertPushToken)` au lieu de `upsertPushToken` de `@ecommerce/shared` (Supabase).
> - `apps/mobile/src/hooks/useMobileTracking.ts` — **Réécrit** : `useMutation(api.tracking.mutations.recordEvent)` au lieu de `apiPost("/api/track-event")` (routait vers Supabase). Supporte userId Convex + localId (anonyme).
> - `apps/mobile/src/server/apiClient.ts` — **Modifié** : `getAuthHeaders()` ne retourne plus de token Supabase. Les endpoints publics (products, collections, merchants) fonctionnent sans auth. Les endpoints authentifiés (cart, orders) nécessiteront la Phase 11 pour accepter Convex Auth.
> - `apps/mobile/src/services/biometricService.ts` — **Réécrit** : `enrollBiometric` et `disableBiometric` prennent maintenant une référence `setBiometricFn` (mutation Convex) au lieu d'un userId. `attemptBiometricLogin` ne restaure plus de session Supabase — la restauration est gérée par ConvexAuthProvider via convexStorage.
> - `apps/mobile/src/app/index.tsx` — Adapté : `useAuth()` retourne `{ userId, isAuthenticated }` au lieu de `{ user, isAnonymous }`.
> - `apps/mobile/src/app/settings/notifications.tsx` — Adapté : `useAuth()` → `userId` au lieu de `user?.id`.
> - `convex/users/mutations.ts` — **Ajouté** : `setBiometricPreference` mutation + `getBiometricPreference` query pour remplacer les fonctions Supabase `setBiometricPreference`/`getBiometricPreference` de `@ecommerce/shared`.
> - `apps/mobile/src/services/__tests__/biometricService.test.ts` — **Mis à jour** : Tests adaptés pour la nouvelle signature `enrollBiometric(fn, email, token)` et `disableBiometric(fn)`. Supprimé test de restauration de session Supabase.
>
> Fichiers orphelins (plus appelés, supprimables en Phase 11) :
> - `apps/mobile/src/utils/authInit.ts` — Init Supabase non utilisé
> - `apps/mobile/src/server/getOrders.ts` — Orders via Supabase non utilisé (pages utilisent Convex)
>
> Ce qui n'a **PAS** été migré (nécessite des changements web backend) :
> - `apps/mobile/src/server/apiClient.ts` — `getAuthHeaders()` retourne des headers vides. Les endpoints web backend authentifiés (cart, orders API routes) valident encore les JWT Supabase. Nécessite Phase 11 pour migrer les API routes vers Convex Auth.
> - `apps/mobile/src/app/order/[orderId]/confirmation.tsx` — Utilise des types `@ecommerce/shared` mais ne dépend pas directement de Supabase (appelle l'API web via apiClient).
>
> **Zéro import Supabase actif** dans les fichiers sources mobile (hors fichiers orphelins `authInit.ts` et `getOrders.ts`).

### 11.1 Layout racine (✅ Migré Phase 6)

`apps/mobile/src/app/_layout.tsx` utilise maintenant : ConvexAuthProvider (déjà câblé Phase 2) + AuthProvider (réécrit pour Convex Auth). Plus de Supabase anonymous session, plus de `onAuthStateChange`, plus de `useCartSync` Realtime.

NOTE : Le `ConvexReactClient` est instancié via `useState(() => ...)` dans `LayoutInner` (pas au module level comme le montre la doc React Native Quickstart) parce qu'on gère le cas où `EXPO_PUBLIC_CONVEX_URL` est manquant (fallback UI au lieu de crash). Le `useState` garantit une seule instanciation (React guarantee).

Provider stack (inside-out) :
1. QueryClientProvider (TanStack Query — Violet API data)
2. ConvexAuthProvider (Convex Auth — useConvexAuth, useAuthActions)
3. AuthProvider (Mobile auth context — userId, localId, biometric)
4. DynamicStripeProvider (payments)
5. ThemePreferenceProvider + ThemeProvider (dark/light)

### 11.2 Auth Context (✅ Réécrit Phase 6)

`AuthContext` utilise `useConvexAuth()` + `useQuery(api.users.queries.getIdentity)` au lieu de `supabase.auth.onAuthStateChange()`. Le modèle localId est basé sur SecureStore (`mobileLocalId.ts`).

Interface `MobileAuthSession` (compatibilité descendante) :
- `userId: string | null` — Convex Auth subject ID
- `email: string | null` — depuis identity query
- `localId: string` — UUID SecureStore pour les visiteurs
- `isAuthenticated: boolean` — depuis `useConvexAuth()`
- `user: null` — toujours null (Supabase `user` n'existe plus)
- `isAnonymous: boolean` — `!isAuthenticated` (pas de session anonyme Convex)

### 11.3 Auth pages (✅ Réécrites Phase 6)

| Page | Implémentation Convex Auth |
|------|---------------------------|
| `auth/login.tsx` | `signIn("password", { email, password, flow: "signIn" })` via `useAuthActions()` |
| `auth/signup.tsx` | `signIn("password", { email, password, flow: "signUp" })` → pending signup → `/auth/verify` |
| `auth/verify.tsx` | `signIn("password", { flow: "signUp", code })` + `migrateAnonymous({ localId })` + `clearLocalIdMobile()` |

### 11.4 Orders pages (✅ Migrées Phase 6)

| Page | Changement |
|------|----------|
| `orders/index.tsx` | `useQuery(api.orders.queries.getOrders)` — réactif par défaut, pas de Realtime |
| `orders/[orderId].tsx` | `useQuery(api.orders.queries.getOrderDetail)` — réactif par défaut |

### 11.5 Profile (✅ Migré Phase 6)

`profile.tsx` utilise Convex queries/mutations + flow change password 3 étapes (identique au web).

### 11.6 Wishlist (✅ Migré Phase 6)

| Fichier | Changement |
|---------|-----------|
| `app/wishlist.tsx` | `useQuery(api.wishlists.queries.getWishlist)` + `useMutation(removeFromWishlist)` |
| `components/product/WishlistButton.tsx` | `useQuery(getWishlistProductIds)` + `useMutation(addToWishlist/removeFromWishlist)`, pending state manuel |

### 11.7 Content & FAQ (✅ Migré Phase 6)

| Fichier | Changement |
|---------|-----------|
| `app/content/index.tsx` | `usePaginatedQuery(api.content.queries.getContentPages)` avec infinite scroll natif |
| `app/content/[slug].tsx` | `useQuery(getContentPageBySlug)` + `useQuery(getRelatedContent)` |
| `app/help/index.tsx` | `useQuery(api.content.queries.getFaqItems)` |
| `app/help/contact.tsx` | `useMutation(api.support.mutations.insertSupportInquiry)` |

### 11.8 Guest Order Lookup (✅ Migré Phase 6)

`order/lookup.tsx` utilise Convex Auth `signIn("password", { flow: "reset" })` pour le flux OTP invité au lieu de `supabase.auth.signInWithOtp`/`verifyOtp`. Plus de session Supabase temporaire.

**Design note** : Le flow `reset` de Convex Auth est réutilisé intentionnellement pour les guests. Le provider `ResendOTP` (`convex/lib/resendOTP.ts`) envoie l'email via Resend indépendamment de l'existence d'un compte Convex Auth — l'OTP sert uniquement de preuve de possession email. Après vérification, les orders sont récupérés via le web backend `/api/guest-order-lookup`.

### 11.9 Services & Hooks (✅ Migrés Phase 6)

| Fichier | Changement |
|---------|-----------|
| `hooks/usePushRegistration.ts` | `useMutation(api.notifications.mutations.upsertPushToken)` |
| `hooks/useMobileTracking.ts` | `useMutation(api.tracking.mutations.recordEvent)` + userId Convex/localId |
| `services/biometricService.ts` | Prend `setBiometricFn` (mutation Convex) au lieu de userId. Session restoration via ConvexAuthProvider. |
| `components/HamburgerMenu.tsx` | `useAuth()` de Convex au lieu de `useUser` de `@ecommerce/shared` |
| `app/products/[productId].tsx` | `useAuth()` pour auth check au lieu de `createSupabaseClient()` |
| `server/apiClient.ts` | `getAuthHeaders()` retourne headers vides (Phase 11 pour endpoints authentifiés) |

### 11.10 Backend Convex (✅ Ajouté Phase 6)

| Fichier | Ajout |
|---------|-------|
| `convex/users/mutations.ts` | `setBiometricPreference` mutation + `getBiometricPreference` query |

### 11.11 Fichiers orphelins (supprimables Phase 11)

| Fichier | Raison |
|---------|--------|
| `utils/authInit.ts` | Init Supabase non appelé |
| `server/getOrders.ts` | Orders via Supabase non utilisé |

### 11.12 Env vars mobile

`EXPO_PUBLIC_CONVEX_URL` déjà configuré (Phase 2). `EXPO_PUBLIC_API_URL` inchangé (appels Violet).

### 11.13 Corrections post-revue (2026-05-16)

- **`verify.tsx` mobile — double migration anonymous** : La page verify ET l'AuthContext appelaient tous les deux `migrateAnonymous({ localId })` à l'inscription. La migration a été retirée de `verify.tsx` mobile — elle est centralisée dans `AuthContext.tsx` uniquement (comme pour le futur OAuth, le point unique garantit que toute authentification passe par le même chemin).
- **`mobileLocalId.ts` — faux UUID** : L'implémentation générait un pseudo-UUID basé sur timestamp+random au lieu d'un vrai UUID v4. Corrigé pour utiliser `crypto.randomUUID()`, disponible dans Hermes depuis React Native 0.76+ (le projet utilise RN 0.83.6).
- **`AuthContext.tsx` — `getBiometricPreference` Supabase** : L'import `getBiometricPreference` de `@ecommerce/shared` appelait encore `createSupabaseClient()`. Remplacé par une vérification locale via `hasBiometricCredentials()` (SecureStore).
- **Password reset `flow`** : Même correction que web — `flow: "reset"` → `flow: "reset-verification"` pour l'étape code+nouveau mot de passe.
- **`_layout.tsx` — crash silencieux** : Si `EXPO_PUBLIC_CONVEX_URL` est manquant, `convexClient` était `null` et l'app était rendue sans `ConvexAuthProvider` (tous les hooks Convex crashaient). Ajout d'un fallback affichant un message d'erreur.
- **`mapAuthError` DRY** : Les 3 copies mobiles ont été remplacées par l'import depuis `@ecommerce/shared`.

Audit Phase 6 (2026-05-18) — 5 corrections appliquées :

| # | Sévérité | Fichier | Problème | Correction |
|---|----------|---------|----------|------------|
| F1 | 🟡 Moyen | `apps/mobile/src/app/_layout.tsx` | Pattern `useState(() => new ConvexReactClient())` non documenté — la doc officielle montre l'instanciation module-level. | Ajout commentaire 5 lignes expliquant le choix : gestion URL manquante, fallback UI, garantie React single-run. |
| F2 | 🟡 Moyen | `apps/mobile/src/utils/pendingSignup.ts` + `signup.tsx` + `verify.tsx` | Mot de passe stocké en clair dans `let _password` (variable module). En cas de crash avec dump mémoire, le password serait exposé. | Réécriture complète : `pendingSignup.ts` utilise SecureStore (`setItemAsync/getItemAsync/deleteItemAsync`). `signup.tsx` → `await setPendingSignup()`. `verify.tsx` → chargement async via `useEffect` + `useState` + `ActivityIndicator` pendant la lecture chiffrée. Le password n'est jamais en mémoire JS heap entre les écrans. |
| F4 | 🟡 Moyen | `apps/mobile/src/app/content/index.tsx` | `loadMore` était un no-op factice (`setTimeout 500ms`). Seule la première page (12 items) était chargée. | Remplacé `useQuery` + `paginationOpts` par `usePaginatedQuery` natif Convex avec `initialNumItems: 12`. `loadMore(12)` charge réellement les 12 items suivants. `now` stabilisé via `useMemo(() => Date.now(), [])` pour éviter le reset de pagination. |
| F5 | 🟡 Moyen | `apps/mobile/src/app/order/lookup.tsx` | Guest order lookup réutilise le flow `reset` de Convex Auth sans documentation — comportement non garanti par la doc officielle si l'email n'a pas de compte. | Ajout bloc `DESIGN NOTE` 8 lignes documentant : (1) réutilisation intentionnelle du flow `reset`, (2) pourquoi ça fonctionne (ResendOTP envoie indépendamment de l'existence du compte), (3) l'OTP sert uniquement de preuve de possession email. |
| F6 | 🟢 Mineur | `apps/mobile/src/services/biometricService.ts` | `attemptBiometricLogin` retourne `{ success: true }` même si la session Convex a expiré. | Documenté : le biometric prompt agit comme un déverrouillage local des credentials SecureStore. ConvexAuthProvider restaure la session automatiquement. Si la session est expirée, `isAuthenticated` reste `false` et le prompt sera re-montré. Pas de correction code nécessaire — le flow est correct. |

Fichiers modifiés : `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/utils/pendingSignup.ts`, `apps/mobile/src/app/auth/signup.tsx`, `apps/mobile/src/app/auth/verify.tsx`, `apps/mobile/src/app/content/index.tsx`, `apps/mobile/src/app/order/lookup.tsx`

Parité Web ↔ Mobile vérifiée : Convex hooks, auth flows, password validation, tracking, wishlist, orders — identiques sur les deux plateformes.
Docs officielles consultées : `docs.convex.dev` (llms.txt, React Native Quickstart, React client, Convex Auth, Best Practices), `docs.expo.dev` (llms.txt), `labs.convex.dev/auth/setup` (React Native tab).
Gate : typecheck ✅ | lint ✅ | 958 tests verts (514 web + 376 shared + 68 mobile).

Leçons apprises :
 - **SecureStore pour les données sensibles transitoires** : Sur mobile, ne jamais stocker un mot de passe dans une variable JS module (`let _password = ""`) — utiliser `expo-secure-store` même pour les données éphémères entre écrans. Le coût async est négligeable comparé au gain de sécurité.
 - **`usePaginatedQuery` > `useQuery` + paginationOpts manuelle** : Convex fournit un hook natif `usePaginatedQuery` avec `loadMore()` automatique. Ne pas réimplémenter la pagination manuellement.
 - **Documenter les détournements de flow** : Quand on réutilise un flow officiel dans un contexte non prévu (ex: flow `reset` pour guest OTP), documenter clairement le DESIGN NOTE — le prochain développeur doit comprendre pourquoi ça fonctionne.

---

## 12. Phase 7 — Webhooks Violet.io (remplacement des Edge Functions)
>
> ✅ **Phase 7 TERMINÉE** (2026-05-16).
>
> Ce qui est fait :
> - `convex/webhooks/violet.ts` — **Nouveau fichier** (~1870 lignes) : HTTP Action `handleVioletWebhook` + 15+ internal mutations/actions pour le traitement complet de tous les événements webhook Violet.io. Remplace les 7 fichiers Deno Edge Function (`supabase/functions/handle-webhook/`, `send-notification/`, `send-push/`, etc.).
> - `convex/http.ts` — **Mis à jour** : Route `POST /api/webhooks/violet` ajoutée au routeur HTTP Convex.
> - `convex/lib/violetApi.ts` — **Nouveau fichier** : Client API Violet avec gestion de token (login + refresh + retry 429 + 401 auto-invalidation). Remplace `supabase/functions/_shared/violetAuth.ts` + `fetchWithRetry.ts`.
> - `convex/lib/webhookSchemas.ts` — **Nouveau fichier** : 10 schemas Zod pour la validation des payloads webhook (order, bag, merchant, transfer, payout account, offer, sync, collection, payment transaction).
> - `convex/crons.ts` — **Nouveau fichier** : 3 cron jobs (nettoyage webhooks > 90j, nettoyage paniers abandonnés > 30j, détection webhooks bloqués > 1h).
>
> Événements Violet gérés (55+ event types) :
> - **OFFER_*** (5 types) — Audit trail
> - **PRODUCT_SYNC_*** + **COLLECTION_SYNC_*** (6 types) — Audit trail
> - **MERCHANT_*** (6 types) — Upsert merchants + auto-enable feature flags + error logs
> - **COLLECTION_*** (4 types) — Audit trail
> - **ORDER_*** (10 types) — Status update direct
> - **BAG_*** (5 types) — Status update + order derivation + tracking info + notifications
> - **TRANSFER_*** (7 types) — Upsert transfers + error logging pour transfers échoués
> - **MERCHANT_PAYOUT_ACCOUNT_*** (5 types) — Upsert PPA + KYC alerting + activation/désactivation
> - **PAYMENT_TRANSACTION_CAPTURE_STATUS_*** (6 types) — Audit trail
>
> Corrections post-revue (2026-05-16) :
> - **`upsertDistribution` doublons** : Remplacé l'INSERT aveugle par un vrai upsert via `distributionId` (clé de déduplication depuis l'API Violet) + index `by_distributionId`. Le schéma `orderDistributions` enrichi avec `channelAmount`, `stripeFee`, `merchantAmount`, `subtotal`, `violetBagId`.
> - **Validation Zod des payloads** : Ajout de `convex/lib/webhookSchemas.ts` avec 10 schemas Zod. La fonction `validatePayload()` est appelée avant le routing dans `processEvent` — les payloads invalides sont marqués `failed` sans être traités.
> - **Orders non trouvées** : `processOrderUpdated` insère maintenant un log `errorLogs` de type `ORDER_NOT_FOUND` au lieu d'un `console.log` silencieux, pour visibilité dans le dashboard admin.
> - **Désactivation silencieuse des PPAs** : `processPayoutAccountActivated` logue maintenant le nombre de PPAs désactivées dans `errorLogs` avec le type `MERCHANT_PAYOUT_ACCOUNT_ACTIVATED`.
> - **Templates email enrichis** : Remplacé le HTML minimaliste par un layout branded (header + footer + CTA button), avec `escapeHtml()` anti-XSS et `formatCents()` pour les montants.
>
> Pipeline de traitement :
> 1. HTTP Action reçoit le POST → valide HMAC → idempotence → insère webhookEvents
> 2. Internal Mutation route vers le processeur spécifique → écritures DB (ACID)
> 3. ctx.scheduler.runAfter(0, ...) pour les tâches asynchrones non-bloquantes :
>    - Envoi email (Resend API) avec idempotency key
>    - Envoi push notification (Expo Push API)
>    - Sync distributions depuis Violet API
>    - Fetch refund details depuis Violet API
>    - Auto-enable feature flags marchands
>
> Leçons apprises :
> - Convex `internalQuery` est nécessaire pour les queries appelées depuis les actions via `ctx.runQuery`. Les queries publiques ne sont pas accessibles via `internal.*`.
> - `ctx.scheduler.runAfter(0, fn, args)` est l'équivalent Convex du fire-and-forget. Les actions planifiées s'exécutent après que le 200 est renvoyé à Violet.
> - Les cron jobs mensuels nécessitent `minuteUTC` explicite (pas de valeur par défaut).
> - `GenericMutationCtx<any>` permet de typer le contexte sans exiger le type complet du data model.
> - Les HTTP Actions Convex sont la bonne couche pour les webhooks — elles offrent `request.text()`, `request.headers`, et `new Response()` nativement.
> - La validation HMAC utilise `crypto.subtle` (Web Crypto API), disponible dans le runtime Convex sans import.
> - Les types `VioletAuthHeaders` (interface avec clés littérales) ne sont pas assignables à `Record<string, string>` en TypeScript strict — utiliser `Record<string, string>` directement.
> - **Zod validation des payloads** : Violet peut changer la structure de ses payloads sans préavis. Sans validation Zod, un `String(undefined)` produit `"undefined"` silencieusement. La validation par event type (critical vs audit-only) équilibre sécurité et pragmatisme.
> - **Upsert pattern Convex** : Il n'y a pas de `ON CONFLICT` en Convex. Le pattern `first() → patch/insert` via un index unique est l'équivalent. Ne JAMAIS faire un `insert` sans vérification préalable sur les tables alimentées par des webhooks (déduplication essentielle).
> - **Templates email** : Le CSS doit être inline pour la compatibilité email clients. `<style>` est stripé par Gmail/Outlook. Utiliser des `<table>` pour le layout, pas des `<div>` flexbox.

### 12.3 Créer l'HTTP Action pour les webhooks

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/api/webhooks/violet",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();

    // 1. Valider HMAC
    const hmac = request.headers.get("X-Violet-Hmac");
    const isValid = await validateHmac(rawBody, hmac);
    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    // 2. Extraire les headers
    const eventId = request.headers.get("X-Violet-Event-Id")!;
    const eventType = request.headers.get("X-Violet-Topic")!;

    // 3. Idempotence — vérifier si l'événement existe déjà
    const existing = await ctx.runQuery(internal.webhooks.violet.checkEvent, { eventId });
    if (existing) {
      return new Response("Already processed", { status: 200 });
    }

    // 4. Parser le payload
    const payload = JSON.parse(rawBody);

    // 5. Router vers le processeur
    await ctx.runMutation(internal.webhooks.violet.processEvent, {
      eventId,
      eventType,
      entityId: String(payload.id ?? "unknown"),
      payload,
    });

    return new Response("OK", { status: 200 });
  }),
});

export default http;
```

### 12.4 Processeurs d'événements

Migrer la logique de `supabase/functions/handle-webhook/processors.ts`, `orderProcessors.ts`, `transferProcessors.ts`, `payoutAccountProcessors.ts` dans des mutations Convex :

```typescript
// convex/webhooks/violet.ts
export const processEvent = mutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    entityId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    // Enregistrer l'événement (idempotence)
    await ctx.db.insert("webhookEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      entityId: args.entityId,
      status: "received",
      payload: args.payload,
    });

    // Router vers le bon processeur
    switch (args.eventType) {
      case "ORDER_UPDATED":
      case "ORDER_COMPLETED":
      case "ORDER_CANCELED":
        await processOrderUpdated(ctx, args.payload);
        break;
      case "BAG_SHIPPED":
        await processBagShipped(ctx, args.payload);
        break;
      // ... tous les autres event types
    }

    // Marquer comme traité
    // (update webhookEvents status → "processed")
  },
});
```

### 12.5 Configuration du webhook Violet

Dans le Dashboard Violet, mettre à jour l'URL du webhook :
```
Avant : https://<project>.supabase.co/functions/v1/handle-webhook
Après : https://api.maisonemile.com/api/webhooks/violet
```

### 12.6 Actions — Emails et Push

Remplacer les Edge Functions `send-notification`, `send-push`, `send-support-email`, `send-support-reply` par des **Convex Actions** :

```typescript
// convex/lib/email.ts
export const sendOrderConfirmation = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    // Récupérer les données de la commande (via query interne)
    const order = await ctx.runQuery(api.orders.queries.getById, { orderId });
    // Envoyer l'email via Resend
    await fetch("https://api.resend.com/emails", { ... });
    // Logger l'envoi
    await ctx.runMutation(internal.notifications.logNotification, { ... });
  },
});
```

### 12.7 Scheduler pour les actions différées

Convex supporte les actions programmées via `ctx.scheduler.runAfter()` et les cron jobs :

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Nettoyer les webhook_events traités (> 90 jours)
crons.monthly(
  "cleanup-old-webhooks",
  { day: 1, hourUTC: 3 },
  internal.crons.cleanupOldWebhooks,
);

// Nettoyer les paniers abandonnés
crons.daily(
  "cleanup-abandoned-carts",
  { hourUTC: 4 },
  internal.carts.mutations.cleanupAbandoned,
);

// Rafraîchir les vues dashboard
crons.hourly(
  "refresh-dashboard",
  internal.admin.mutations.refreshDashboardViews,
);

export default crons;
```

---

## 13. Phase 8 — Realtime et synchronisation

> ✅ **Phase 8 TERMINÉE** (2026-05-16).
>
> Ce qui est fait :
> - `packages/shared/src/hooks/useCartSync.ts` — **Supprimé** : hook Supabase Realtime pour le panier, remplacé par la réactivité native Convex.
> - `packages/shared/src/hooks/useOrders.ts` — **Nettoyé** : retiré `useOrderRealtime`, `createOrdersRealtimeChannel` et les imports `SupabaseClient`/`RealtimeChannel`. Les query options factories (`ordersQueryOptions`, `orderDetailQueryOptions`) sont conservées (utilisées par checkout/confirmation).
> - `packages/shared/src/hooks/__tests__/useOrders.test.ts` — **Nettoyé** : 7 tests `createOrdersRealtimeChannel` supprimés. 11 tests `ordersQueryOptions`/`orderDetailQueryOptions` conservés.
> - `packages/shared/src/hooks/index.ts` — Retiré les exports `useCartSync`, `useOrderRealtime`, `createOrdersRealtimeChannel`.
> - `apps/web/src/contexts/CartContext.tsx` — Mis à jour le commentaire Realtime.
>
> Leçons apprises :
> - Convex queries sont **réactives par défaut** — chaque `useQuery(api.xxx)` crée automatiquement un WebSocket subscription. Quand les données changent (via mutation), tous les clients sont notifiés.
> - Pas besoin de `useEffect` subscribe/unsubscribe, pas de channels manuels, pas de cache invalidation manuelle.
> - Cross-device sync est automatique : mobile et web consomment la même query Convex et se mettent à jour instantanément.
> - `"skip"` comme 2e argument de `useQuery` désactive conditionnellement la subscription.
>
> Corrections post-revue (2026-05-16) :
> - **`cartSync.ts` JSDoc obsolète** : Le `@see` pointait vers `useCartSync.ts` (fichier supprimé). Remplacé par une référence vers `useCart.ts`.
> - **`CartContext.tsx` commentaire ambigu** : La phrase `"Realtime when userId is set"` mélangeait l'ancien modèle Supabase et le nouveau modèle Convex. Simplifié en une seule phrase claire.
> - **`CartSyncEvent` type mort** : Le type `CartSyncEvent` dans `cart.types.ts` est exporté mais jamais importé/consommé. Documenté pour suppression en Phase 11 (nettoyage global des types Supabase).
> - **Références Realtime résiduelles** : Uniquement dans des commentaires (JSDoc, notes de migration) et le dossier `supabase/` legacy. Aucune dans du code exécutable. Nettoyage complet prévu en Phase 11.

### 13.1 Le plus gros avantage de Convex : la réactivité native

Avec Supabase, chaque realtime nécessitait :
1. Un channel WebSocket manuel
2. Un `useEffect` pour subscribe/unsubscribe
3. Des callbacks `onpostgres_changes` avec invalidation TanStack Query

Avec Convex, **toute query est réactive par défaut**. Quand les données changent (via une mutation), tous les clients abonnés à cette query sont notifiés automatiquement.

### 13.2 Ce qui disparaît

| Pattern Supabase | Remplacement Convex |
|-------------------|-------------------|
| `useOrderRealtime()` + channels WebSocket | **Supprimer** — `useQuery(api.orders.queries.getOrders)` est auto-réactif |
| `useCartSync()` + Supabase Realtime sur `carts` | **Supprimer** — Les queries Convex se mettent à jour seules |
| `createOrdersRealtimeChannel()` | **Supprimer** |
| `supabase.channel(...).on("postgres_changes", ...)` | **Tout supprimer** |

### 13.3 Cross-device sync

La synchronisation multi-appareils est automatique : si l'utilisateur modifie son panier sur mobile, le web se met à jour instantanément (et inversement) car les deux consomment la même query Convex.

---

## 14. Phase 9 — Administration and monitoring
>
> ✅ **Phase 9 TERMINÉE** (2026-05-16). Post-revue : 12 corrections appliquées (2026-05-16).
>
> Ce qui est fait :
> - `convex/admin/queries.ts` — **Réécrit** : `getDashboardData` (KPIs + commission par marchand + distributions par order, index ranges sur `by_status` + `_creationTime`, `Promise.all` pour bag lookups parallèles) + `getHealthData` (error metrics, webhook success rate via index ranges exacts par status, alert rules, recent errors) + `getOrderDistributions` + `getRecentErrors` + `getAlertRules` + `getMerchants` + `getPayoutAccounts`. Toutes les queries publiques utilisent `assertAdmin()`.
> - `convex/admin/queries.ts` — **Ajouté** : `getHealthDataInternal` (internalQuery — mêmes métriques que getHealthData mais sans `assertAdmin`, pour le cron evaluate-alerts) + `checkIsAdmin` (internalQuery — vérifie le rôle admin par userId, pour les actions).
> - `convex/admin/mutations.ts` — **Nouveau fichier** : `replyToSupportInquiry` (action publique — vérifie admin via `checkIsAdmin` internalQuery + envoie email Resend + auto-advance status new→in-progress) + `evaluateAlerts` (internalAction — appelle `getHealthDataInternal` au lieu de `getHealthData`, évalue les alert rules, envoie emails admin si seuils dépassés) + `updateAlertTriggerTime` (internalMutation — met à jour lastTriggeredAt).
> - `convex/health/queries.ts` — **Enrichi** : `runHealthCheck` (query admin — vérifie connectivité Convex/Violet/Stripe).
> - `convex/crons.ts` — **Enrichi** : ajout cron `evaluate-alerts` (horaire à :45, envoie alertes email quand seuils sont dépassés) + `triggerEvaluateAlerts` (internalMutation wrapper) + `cleanupOldWebhooks` borné avec `.take(500)`.
> - `convex/lib/admin.ts` — **Élargi** : `assertAdmin` accepte `QueryCtx | MutationCtx` (pas seulement `QueryCtx`).
> - `apps/web/src/components/admin/ErrorBoundary.tsx` — **Nouveau** : `AdminErrorBoundary` (class component React) pour capturer les erreurs Convex (useQuery throw on assertAdmin failure) et afficher un fallback graceful.
> - `apps/web/src/routes/admin/index.tsx` — **Réécrit** : Convex queries + `useNavigate()` au lieu de `window.location.href` + `AdminErrorBoundary` wrapper + supprimé `instanceof Error` (code mort) + retiré args `customStart`/`customEnd` inutilisés.
> - `apps/web/src/routes/admin/health.tsx` — **Réécrit** : Convex query `getHealthData` + health check on-demand via `useQuery(api.health.queries.runHealthCheck)` (pas de fetch HTTP bidon) + `useNavigate()` + `AdminErrorBoundary`.
> - `apps/web/src/routes/admin/support/index.tsx` — **Réécrit** : Convex query + `useNavigate()` au lieu de `window.location.href`.
> - `apps/web/src/routes/admin/support/$inquiryId.tsx` — **Réécrit** : Convex queries/mutations/actions + `useNavigate()` + `AdminErrorBoundary` + state sync via `useEffect` au lieu de side effects pendant render.
>
> Ce qui n'a **PAS** été migré (nécessite des changements plus larges) :
> - `apps/web/src/server/distributions.ts` — `syncOrderDistributionsFn` utilise encore Supabase (upsert distributions dans la DB). La sync distributions depuis Violet est maintenant gérée par les webhooks (Phase 7). Ce server function reste pour les appels manuels admin.
> - `apps/web/src/server/merchants.ts` — `setCommissionRateFn` appelle l'API Violet (pas de Supabase). Reste en server function car nécessite `VIOLET_APP_SECRET`.
> - `apps/web/src/server/payoutAccounts.ts` — Appelle l'API Violet + Supabase. Reste en server function.
> - `apps/web/src/server/adminAuth.ts` — `getAdminUserFn` (Supabase JWT). Les pages admin utilisent maintenant `useConvexAuth()` + `assertAdmin()` dans les queries Convex. Ce fichier reste importé par les server functions non migrées.
>
> Fichiers orphelins (plus appelés par les pages routes, supprimables en Phase 11) :
> - `apps/web/src/server/getAdminDashboard.ts` + `getAdminDashboardHandler.ts`
> - `apps/web/src/server/getAdminHealth.ts` + `getAdminHealthHandler.ts`
> - `apps/web/src/server/getAdminSupport.ts` + `getAdminSupportHandler.ts`
> - `apps/web/src/server/updateSupportInquiry.ts` + `updateSupportInquiryHandler.ts`
> - `apps/web/src/server/replySupportInquiry.ts` + `replySupportInquiryHandler.ts`
> - `apps/web/src/server/adminAuthGuard.ts`
>
> Tests : 376 shared + 514 web = **890 tests verts**. Typecheck clean. Lint clean.
>
> Leçons apprises :
> - Les Convex queries admin retournent `null` ou **lancent une erreur** si `assertAdmin()` échoue. `useQuery` ne retourne JAMAIS un objet `Error` — `instanceof Error` est du code mort. Utiliser un ErrorBoundary React ou `useQuery_experimental` avec `{ status: "error" }`.
> - `useAction` (pas `useMutation`) est nécessaire pour les Convex `action` — TypeScript les distingue.
> - Les crons ne peuvent appeler que des `internalMutation` ou `internalAction`. Les queries publiques ne sont pas accessibles depuis `internal.*`. **Les crons n'ont PAS de contexte auth** — `assertAdmin()` crasherait. Créer des `internalQuery` sans auth pour les données consommées par les crons.
> - Les actions (`action`) ont `ctx.auth.getUserIdentity()` mais PAS `ctx.db`. Pour vérifier le rôle admin dans une action, appeler une query interne (`ctx.runQuery(internal.admin.queries.checkIsAdmin, { userId })`).
> - Les index Convex sont préfixés : un index `["status"]` est en réalité `["status", "_creationTime"]` (auto-ajouté). Cela permet `.withIndex("by_status", q => q.eq("status", "COMPLETED").gte("_creationTime", since))` — filtrer efficacement par status + période.
> - `.collect()` sur de grandes tables est un anti-pattern Convex. Utiliser `.take(N)` pour borner, des index ranges pour filtrer, ou pré-calculer les métriques via cron + table dédiée.
> - Les lookups N+1 (boucle de queries séquentielles) doivent être remplacés par `Promise.all()` pour paralléliser — Convex exécute les lectures en parallèle.
> - Les pages admin TanStack Start ne peuvent pas utiliser `createServerFn().handler()` pour le guard d'auth car Convex Auth stocke les tokens en localStorage (pas de cookie serveur). Le guard est client-side uniquement via `useConvexAuth()` + `useNavigate()`.
> - Les types shared (`DistributionRow`, `CommissionSummary`, etc.) ont des types stricts (littéraux union). Les données Convex (string) nécessitent des casts `as DistributionType` ou `as unknown as HealthCheckResult`.
> - TypeScript ne peut pas rétrécir le type d'une variable à travers les fermetures. Utiliser un alias `const currentInquiry = inquiry` après le guard null.
> - Les mutations de cron cleanup doivent être bornées (`.take(500)`) — sinon le risque de dépasser la limite d'exécution Convex sur de grandes tables.
> - Ne pas faire de side effects pendant le render (setState conditionnel) — utiliser `useEffect` avec les bonnes dépendances.
> - `window.location.href = "/"` provoque un rechargement complet — préférer `useNavigate()` de TanStack Router pour une navigation SPA.

---

## 15. Phase 10 — Tests

### 15.1 Tests unitaires — `convex-test`

Convex fournit un framework de test dédié : `convex-test` qui permet de mocker le backend.

```bash
bun add -D convex-test
```

```typescript
// tests/orders.test.ts
import { test } from "convex-test";
import { api } from "../convex/_generated/api";

test("getOrders returns only user's orders", async (t) => {
  const { query, mutation } = t.setup({ asUserId: "user-123" });
  // ... assertions
});
```

### 15.2 Tests à réécrire

Tous les tests existants qui mockaient `SupabaseClient` doivent être réécrits :

| Fichier de test | Action |
|----------------|--------|
| `apps/web/__tests__/supabaseClient.test.ts` | Supprimer |
| `apps/web/__tests__/authFunctions.test.ts` | Réécrire avec Convex Auth |
| `apps/web/__tests__/authForms.test.tsx` | Réécrire |
| `apps/web/__tests__/useAuthSession.test.tsx` | Réécrire |
| `apps/web/__tests__/rlsPolicy.test.ts` | Supprimer (pas de RLS avec Convex) |
| `apps/web/__tests__/rlsPolicy.integration.test.ts` | Supprimer |
| `apps/web/__tests__/admin.test.ts` | Réécrire |
| `apps/web/__tests__/admin-health.test.ts` | Réécrire |
| `apps/web/__tests__/admin-support.test.ts` | Réécrire |
| `apps/web/__tests__/contentAdmin.test.ts` | Réécrire |
| `apps/web/__tests__/faq.test.ts` | Réécrire |
| `apps/web/__tests__/legal-pages.test.ts` | Réécrire |
| `apps/web/__tests__/recently-viewed.test.ts` | Adapter |
| `apps/web/__tests__/support.test.ts` | Réécrire |
| `apps/web/__tests__/submitSupportHandler.test.ts` | Réécrire |
| `apps/web/server/__tests__/guestOrders.test.ts` | Réécrire |
| `apps/web/server/__tests__/orders.test.ts` | Réécrire |
| `packages/shared/src/hooks/__tests__/useCart.test.ts` | Réécrire |
| `packages/shared/src/hooks/__tests__/useOrders.test.ts` | Réécrire |
| `packages/shared/src/clients/__tests__/biometricAuth.test.ts` | Réécrire |
| `packages/shared/src/clients/__tests__/tracking.test.ts` | Réécrire |
| `packages/shared/src/adapters/__tests__/webhookProcessors.test.ts` | Réécrire |
| `packages/shared/src/utils/__tests__/orderPersistence.test.ts` | Adapter |
| `apps/mobile/src/services/__tests__/biometricService.test.ts` | Adapter |

---

## 16. Phase 11 — Nettoyage et migration des données

### 16.1 Export Supabase → Import Convex

1. **Exporter les données Supabase** via `supabase db dump` ou le Dashboard
2. **Transformer le SQL en JSON** pour chaque table (scripts custom)
3. **Importer dans Convex** via `npx convex import` :

```bash
# Exporter depuis Supabase
supabase db dump -f backup.sql

# Transformer en JSON (script custom)
node scripts/supabase-to-convex-export.js

# Importer dans Convex
npx convex import --table userProfiles userProfiles.json
npx convex import --table orders orders.json
# ... pour chaque table
```

### 16.2 Script de transformation

Créer `scripts/supabase-to-convex-export.js` qui :
- Lit le dump SQL Supabase
- Convertit les timestamps en millisecondes (Convex utilise `number`)
- Mappe les noms de colonnes snake_case → camelCase
- **Tables Violet (17/22)** : Pas de transformation d'ID nécessaire (les IDs Violet sont des integers/strings, pas des UUID Supabase)
- **Tables utilisateur (5/22)** : Créer une table de mapping `oldSupabaseUserId → newConvexUserId`
- Génère un fichier JSON par table compatible `convex import`

### 16.3 Suppression du dossier `supabase/`

Une fois la migration validée :

```bash
rm -rf supabase/
```

Incluant :
- `supabase/migrations/` (47 fichiers)
- `supabase/functions/` (7 Edge Functions + shared)
- `supabase/config.toml`
- `supabase/seed.sql`
- `supabase/.env`

### 16.4 Nettoyage des dépendances

```bash
# Supprimer des package.json
bun remove @supabase/supabase-js @supabase/ssr

# Supprimer du root package.json
# (supprimer les scripts dev:functions, dev:all, dev:web qui référencent supabase)
```

### 16.5 Mise à jour de CLAUDE.md

Remplacer toutes les références à Supabase par Convex dans le fichier `CLAUDE.md`.

### 16.6 Mise à jour des scripts dans `package.json` root

```diff
{
  "scripts": {
-   "dev:functions": "supabase functions serve --env-file supabase/.env",
-   "dev:all": "supabase start 2>&1 && ...",
-   "dev:web": "supabase start 2>&1 && ...",
+   "convex:dev": "npx convex dev",
+   "convex:deploy": "npx convex deploy",
+   "dev:web": "concurrently --kill-others --names convex,web 'npx convex dev' 'bun --env-file=.env.local --cwd=apps/web run dev'",
+   "dev:all": "concurrently --kill-others --names convex,web,mobile 'npx convex dev' 'bun --env-file=.env.local --cwd=apps/web run dev' 'cd apps/mobile && npx expo start'",
-   "devDependencies": { "@supabase/supabase-js": "^2.100.1" }
  }
}
```

---

## 17. Cartographie Supabase → Convex

### 17.1 Accès base de données

| Opération | Supabase | Convex |
|-----------|----------|--------|
| Lire tous les docs | `.select("*")` | `.query("table").collect()` |
| Lire avec filtre | `.select().eq("col", val)` | `.query("table").withIndex("by_col", q => q.eq("col", val)).collect()` |
| Lire un seul doc | `.select().single()` | `.query("table").withIndex(...).first()` |
| Insérer | `.insert({ ... })` | `ctx.db.insert("table", { ... })` |
| Upsert | `.upsert({ ... }, { onConflict })` | `first()` → `if (existing) patch() else insert()` |
| Mettre à jour | `.update({ ... }).eq("id", id)` | `ctx.db.patch(id, { ... })` |
| Supprimer | `.delete().eq("id", id)` | `ctx.db.delete(id)` |
| Joindre | `.select("*, relation(*)")` | Deux queries ou `.withIndex()` |
| Pagination | `.range(from, to)` | `.paginate(paginationOpts)` |
| Compter | `.select({ count: "exact" })` | `.collect().length` (ou index count) |
| Transaction | Pas de transaction multi-tables | Chaque mutation est une transaction ACID |
| RPC | `.rpc("function", args)` | Appeler une query/mutation Convex |

### 17.2 Authentification

| Opération | Supabase | Convex |
|-----------|----------|--------|
| État actuel | `supabase.auth.getSession()` | `useConvexAuth()` |
| ID utilisateur | `session.user.id` | `ctx.auth.getUserIdentity()?.subject` |
| Email | `session.user.email` | `identity.email` |
| JWT | `session.access_token` | Géré automatiquement par Convex |
| Role admin | `app_metadata.user_role` | `userProfiles.isAdmin` |
| Sign in | `signInWithPassword()` | `signIn("password", { email, pass })` |
| Sign up | `signUp()` ou `updateUser()` | `signIn("password", { flow: "signUp" })` |
| Sign out | `signOut()` | `signOut()` |
| OAuth | `signInWithOAuth({ provider })` | `signIn("google")` |
| Anonymous | `signInAnonymously()` | **Modèle localId** — `getOrCreateLocalId()` (pas de session serveur) |
| Merge anon→auth | Supabase préserve l'UUID | `migrateAnonymousData(localId, userId)` (mutation Convex) |

### 17.3 Realtime

| Opération | Supabase | Convex |
|-----------|----------|--------|
| Subscribe | `.channel().on().subscribe()` | **Automatique** — toute query est réactive |
| Unsubscribe | `.unsubscribe()` | **Non nécessaire** |
| Filter changes | `filter: "user_id=eq.xxx"` | Filtrer dans la query `withIndex` |

---

## 18. Risques et points d'attention

### 🔴 Critique

1. **Convex self-hosted = single-machine** : Pas de clustering natif. Pour la production :
   - VPS dédié (2 GB min, 4+ GB recommandé pour Convex + PostgreSQL)
   - Backups PostgreSQL via `pg_dump` cron quotidien vers stockage externe (S3, etc.)
   - Reverse proxy Caddy avec TLS automatique
   - Monitoring (Prometheus/Grafana ou équivalent)
   - Firewall : ports 3210/3211 bloqués, seuls 80/443 ouverts

2. **Appels Violet depuis les Convex Actions** : Le runtime Convex n'est PAS Node.js. `process.env` est accessible, `fetch()` est supporté nativement dans les actions. Les secrets Violet sont dans les env vars Convex (configurées via le dashboard local ou `npx convex env set`).

### 🟡 Moyen

3. **Cascade deletes** : **Atténué par Violet** — les hiérarchies de données Violet (Order → Bags → Items) sont immuables après création. Seulement 3 paires de tables nécessitent des cascades (carts/cart_items, wishlists/wishlist_items, et rarement orders/*).

4. **UPSERT atomique** : Pattern Convex `first() → patch/insert`. L'idempotence Violet (`event_id` UNIQUE) se traduit par un index + `first()` check — fonctionnellement équivalent au `ON CONFLICT` SQL.

5. **Index préfixés** : Index `[\"userId\", \"createdAt\"]` ne peut pas être interrogé par `createdAt` seul.

6. **Taille des documents** : Limite 1MB par document Convex. Stocker uniquement les champs nécessaires dans `webhookEvents.payload`.

7. **Dashboard self-hosted** : Build statique (9.5 MB) servi par Caddy. Fonctionnalités complètes (data browser, logs, env vars, function runner). Pas de log streams ou exception reporting intégrés — utiliser Sentry pour les erreurs.

### 🟢 Mineur

8. **Pas de triggers `updated_at`** : Remplacer par des mises à jour explicites dans chaque mutation.

9. **Materialized views** : Pas d'équivalent direct. Remplacer par des queries Convex avec agrégation ou des tables pré-calculées mises à jour par cron.

10. **`pgvector`** : Déjà supprimé du projet. Pas pertinent.

11. **Biometric auth mobile** : Le service biometric stocke un refresh token dans SecureStore. Adapter pour Convex Auth (le refresh token Convex sera stocké de la même manière).

12. **Convex self-hosted = pas de scaling auto** : La montée en charge se fait verticalement (plus de ressources sur le VPS). Pour un e-commerce en early stage, c'est largement suffisant.

### ✅ Points critiques RÉSOLUS par Violet.io

13. **~~Auth anonyme~~** → **🟢 RÉSOLU** (§3.1) : Modèle `localId` + Violet sans concept d'utilisateur. Convex Auth n'a pas besoin de mode anonyme.

14. **~~Migration UUID~~** → **🟡 ATTÉNUÉ** (§3.2) : 17/22 tables utilisent des IDs Violet (pas des UUID Supabase). Seules 5 tables ont un `user_id` à remapper.


### 📋 Checklist de migration

- [x] **Phase 0 — Installation** : Convex installé (v1.39.1), backend local actif, dashboard accessible, TypeScript compile, `.env.example` mis à jour *(2026-05-15)*
- [x] **Phase 1 — Schema** : `convex/schema.ts` complet — 23 tables, 44 indexes (2 redondants supprimés + 1 composé ajouté), déployé *(2026-05-15)*. Post-revue : `getUserById` sécurisé avec `assertAdmin()`. Audit 2026-05-18 : `violetBagId` uniformisé en string, index redondants supprimés, index wishlist composé ajouté, statuts Violet documentés.
- [x] **Phase 2 — Auth** : Password + Resend OTP (verify + reset) + authTables + http.ts + ConvexAuthProvider web+mobile + localId + queries/mutations profils + admin utils *(2026-05-15)*. Post-revue : `getBiometricPreference` déplacé dans queries.ts, leçon `flow: "reset-verification"` documentée. OAuth Apple/Google en attente de credentials.
- [x] **Phase 3 — Fonctions Convex** : 43+ fonctions créées (queries, mutations, actions) dans `convex/` *(2026-05-15)*. Post-revue : `getAllOrders` borné avec `.take(100)`. Audit 2026-05-18 : 9 corrections (Date.now→now arg, ctx.db table names, .filter→.withIndex, escapeHtml/sendRawEmail centralisés, VioletTokenManager singleton, cleanupAbandonedCarts borné, processOrderUpdated sans errorLogs bruit).
- [x] **Phase 4 — Clients partagés** : Pattern Convex direct adopté (pages appellent `useQuery`/`useMutation` directement). Hooks proxy `packages/shared/src/hooks/convex/` supprimés (code mort). 4 hooks Supabase orphelins supprimés (`useWishlist`, `useAuth`, `useProfile`, `useNotificationPreferences`). Mobile notifications migré vers Convex. `mergeWithDefaults` relogé dans `types/` *(2026-05-18)*
- [x] **Phase 5 — Intégration Web** : Auth pages réécrites Convex Auth, account guard client-side, account pages migrées, CartContext sans Realtime, tracking migré, path alias `#convex/*`, types partagés, ownership check, password change complet *(2026-05-16)*. Post-revue : `flow: "reset-verification"` corrigé, `mapAuthError` DRY (6 copies → 1 partagée), `ConvexQueryClient` bridge inutilisé retiré, `getAllOrders` borné. Audit 2026-05-18 : 5 corrections (`__root.tsx` → `useAuthSession()`, WishlistBoundary log, `getIdentity` JSDoc, `useConvexAuth` import standardisé, password validation frontend synchronisé avec backend 8+chars+upper+lower+digit).
- [x] **Phase 6 — Intégration Mobile** : `_layout.tsx` nettoyé, AuthContext réécrit, auth pages réécrites, orders/wishlist/profile/content/FAQ/support/tracking migrés Convex, biometric adapté *(2026-05-16)*. Post-revue : double migration anonymous supprimée (centralisée AuthContext), `mobileLocalId` utilise `crypto.randomUUID()`, `getBiometricPreference` Supabase remplacé, `flow: "reset-verification"` corrigé, fallback erreur `_layout.tsx` si URL manquante, `mapAuthError` DRY. Audit 2026-05-18 : `pendingSignup.ts` SecureStore (password chiffré), `content/index.tsx` `usePaginatedQuery` natif, `lookup.tsx` DESIGN NOTE (guest OTP flow documenté), `_layout.tsx` ConvexReactClient pattern documenté.
- [x] **Phase 7** : Webhooks Violet migrés vers HTTP Actions Convex — 55+ event types, cron jobs, notification emails + push, Violet API client *(2026-05-16)*
- [x] **Phase 8** : Realtime Supabase supprimé — `useCartSync`, `useOrderRealtime`, `createOrdersRealtimeChannel` retirés. Convex queries réactives par défaut *(2026-05-16)*. Post-revue : JSDoc `cartSync.ts` corrigé, commentaire `CartContext.tsx` clarifié, `CartSyncEvent` type mort documenté pour Phase 11.
- [x] **Phase 9** : Admin dashboard/health/support migré vers Convex queries/mutations/actions. Pages web réécrites. Cron evaluate-alerts ajouté. Post-revue : 12 corrections (cron crash, admin check actions, ErrorBoundary, index ranges, N+1→Promise.all, useNavigate, health check Convex, sampling bias, args inutilisés, assertAdmin signature, state sync, cleanup borné) *(2026-05-16)*
- [ ] **Phase 10** : Réécrire tous les tests
- [ ] **Phase 11** : Exporter les données Supabase → Importer dans Convex (5 tables avec remapping UUID, 17 sans)
- [ ] **Nettoyage** : Supprimer `supabase/`, les dépendances `@supabase/*`, les vars d'env Supabase
- [ ] **Docs** : Mettre à jour `CLAUDE.md`, `.env.example`, les `package.json` *(CLAUDE.md déjà fait)*
- [ ] **Validation** : Tests de bout en bout sur le backend self-hosted local
- [ ] **Production** : Déployer le binaire Rust sur le VPS + Caddy TLS + backups pg_dump

---

> **Temps estimé** : 3-5 semaines de développement pour un développeur, en travaillant phase par phase avec validation continue via `npx convex dev`.
>
> **Gain majeur** : Les deux points critiques identifiés dans l'audit initial (auth anonyme + migration UUID) sont résolus ou fortement atténués grâce à l'architecture Violet.io, qui isole complètement l'identité utilisateur du backend de données. L'infrastructure self-hosted (binaire Rust, pas de Docker) offre un contrôle total à coût minimal.
