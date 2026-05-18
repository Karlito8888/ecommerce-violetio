# Audit Migration Supabase → Convex — Phases 0 & 1

> **Date** : 2026-05-18
> **Scope** : Phase 0 (Installation & initialisation) + Phase 1 (Schéma de base de données)
> **Référentiel** : `MIGRATION-SUPABASE-TO-CONVEX.md` + code réel (`convex/schema.ts`, `convex/auth.ts`, clients web/mobile)
> **Docs officielles consultées** :
>
> | Source | URL |
> |--------|-----|
> | Convex | https://docs.convex.dev/llms-full.txt — Schema, Best Practices, Self-Hosting, TanStack Start, React Native, Functions Auth |
> | Violet.io | https://docs.violet.io/llms.txt — Order/Bag States, Transfers, Distributions, Payout Accounts, Webhook Events, Handling Webhooks |
> | TanStack | https://tanstack.com/llms.txt — TanStack Start + Convex integration |
> | Expo | https://docs.expo.dev/llms.txt — React Native, SecureStore, Convex client |
> | React Native | https://reactnative.dev/llms.txt — `crypto.randomUUID()` availability |

---

## Table des matières

1. [Méthodologie](#1-méthodologie)
2. [Phase 0 — Installation & initialisation](#2-phase-0--installation--initialisation)
   - [2.1 Points validés](#21-points-validés)
   - [2.2 Points d'attention](#22-points-dattention)
3. [Phase 1 — Schéma de base de données](#3-phase-1--schéma-de-base-de-données)
   - [3.1 Correspondance avec les données Violet.io](#31-correspondance-avec-les-données-violetio)
   - [3.2 Best Practices Convex appliquées au schéma](#32-best-practices-convex-appliquées-au-schéma)
   - [3.3 Anomalies détectées](#33-anomalies-détectées)
4. [Cohérence Web ↔ Mobile (Phases 0–1)](#4-cohérence-web--mobile-phases-01)
5. [Cohérence Guide de migration ↔ Code réel](#5-cohérence-guide-de-migration--code-réel)
6. [Synthèse des actions](#6-synthèse-des-actions)

---

## 1. Méthodologie

L'audit a suivi la méthodologie suivante :

1. **Lecture du guide de migration** `MIGRATION-SUPABASE-TO-CONVEX.md` — sections Phase 0 (§5) et Phase 1 (§6)
2. **Consultation des docs officielles** via les fichiers `llms.txt` et les pages Markdown détaillées :
   - Convex : Schema, Best Practices, Indexes, Self-Hosting, TanStack Start, React Native
   - Violet.io : Order/Bag States, Transfers, Distributions, Payout Accounts, Webhook Events & Headers
3. **Examen du code réel** :
   - `convex/schema.ts` — 23 tables + authTables
   - `convex/auth.ts`, `convex/http.ts`, `convex/auth.config.js`, `convex/lib/admin.ts`, `convex/health/queries.ts`, `convex/tsconfig.json`
   - `apps/web/src/router.tsx` — ConvexReactClient + ConvexAuthProvider
   - `apps/mobile/src/app/_layout.tsx` — ConvexReactClient + ConvexAuthProvider + SecureStore storage
   - `apps/mobile/src/utils/convexStorage.ts` — TokenStorage
   - `packages/shared/src/utils/localId.ts` + `apps/mobile/src/utils/mobileLocalId.ts`
4. **Croisement** des données Violet.io (types, statuts, IDs, webhooks) avec le schéma Convex pour vérifier la fidélité du miroir

---

## 2. Phase 0 — Installation & initialisation

### 2.1 Points validés ✅

| # | Point | Fichier(s) | Source doc |
|---|-------|-----------|------------|
| 1 | Dépendances Convex installées dans les bons packages | `package.json` (root, web, mobile, shared) — `convex@1.39.1`, `@convex-dev/auth@0.0.92`, `@convex-dev/react-query@0.1.0` | Convex Quickstart |
| 2 | Structure `convex/` complète — 13 dossiers + `tsconfig.json` + `_generated/` | `convex/` tree | Convex Dev Workflow |
| 3 | Backend local fonctionnel via binaire Rust auto-téléchargé | `npx convex dev` | Convex Self-Hosting |
| 4 | `skipConvexDeploymentUrlCheck: true` sur les deux clients | `apps/web/src/router.tsx` L42, `apps/mobile/src/app/_layout.tsx` | Convex Self-Hosting doc |
| 5 | `ConvexAuthProvider` câblé dans le router web (`Wrap`) | `apps/web/src/router.tsx` L81–83 | Convex TanStack Start doc |
| 6 | `ConvexAuthProvider` câblé dans le layout mobile + `storage` custom | `apps/mobile/src/app/_layout.tsx` L228–230 | Convex React Native doc : "we recommend wrapping expo-secure-store" |
| 7 | `convexTokenStorage` implémente correctement `TokenStorage` | `apps/mobile/src/utils/convexStorage.ts` | `@convex-dev/auth/react` TokenStorage interface |
| 8 | `.env.example` mis à jour avec section Convex | `.env.example` | — |
| 9 | Cohabitation Supabase ↔ Convex sans conflit | Imports `@supabase/*` encore présents dans les fichiers non migrés | — |
| 10 | Fallback erreur si `EXPO_PUBLIC_CONVEX_URL` manquant | `apps/mobile/src/app/_layout.tsx` L220–227 | — |
| 11 | `convex/_generated/` commité dans git (nécessaire pour self-hosted en CI) | `.gitignore` (retiré), `.prettierignore` + `eslint.config.js` (ignoré) | Convex : pas de `npx convex codegen` sans `CONVEX_DEPLOYMENT` |

### 2.2 Points d'attention 🟡

| # | Point | Détail | Recommandation |
|---|-------|--------|----------------|
| 1 | **`@convex-dev/react-query` installé mais inutilisé** | Le package est dans `apps/web/package.json` et `packages/shared/package.json`. Le bridge `ConvexQueryClient` a été retiré de `router.tsx` en Phase 5 car aucun hook n'appelait `convexQuery()`. Les hooks Convex utilisent `convex/react` directement, les hooks Violet utilisent `@tanstack/react-query` directement. | Retirer `@convex-dev/react-query` des dependencies web + shared pour réduire le bundle et éviter la confusion |
| 2 | **`convex/tsconfig.json` minimal** | Pas de `include` ni `paths`. Le schema et les functions compilent via le bundler Convex (pas `tsc`), donc ce n'est pas bloquant. | Ajouter `"include": ["**/*.ts"]` pour améliorer l'expérience IDE (autocompletion, diagnostics) |

---

## 3. Phase 1 — Schéma de base de données

### 3.1 Correspondance avec les données Violet.io

#### 3.1.1 Orders & Bags — Statuts officiels Violet.io

La [doc Violet.io Order and Bag States](https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states) définit les statuts suivants :

**Order States** :

| Statut Violet | Description | Statut terminal ? |
|---------------|-------------|-------------------|
| `IN_PROGRESS` | Order not yet submitted | Non |
| `PROCESSING` | Being submitted (millisecondes) | Non |
| `ACCEPTED` | All bags accepted | Non |
| `REJECTED` | Critical failure during submission | **Oui** |
| `COMPLETED` | Successfully processed + payment captured | **Oui** (sauf cancellation) |
| `CANCELED` | Cancelled after acceptance | **Oui** |
| `REQUIRES_ACTION` | 3D Secure or similar | Non |

**Bag States** :

| Statut Violet | Description | Statut terminal ? |
|---------------|-------------|-------------------|
| `IN_PROGRESS` | Initial state | Non |
| `SUBMITTED` | Being submitted to merchant (ms→s) | Non |
| `ACCEPTED` | Merchant accepted | Non |
| `COMPLETED` | All fulfillments shipped | **Oui** (sauf refunds) |
| `REFUNDED` | Full refund | **Oui** |
| `PARTIALLY_REFUNDED` | Partial refund | Non (→ REFUNDED) |
| `CANCELED` | Merchant cancelled | **Oui** |
| `REJECTED` | Platform rejected after retries | **Oui** |

**Schema Convex actuel** : `orders.status` et `orderBags.status` sont typés `v.string()`.

**Verdict** 🟡 : Le `v.string()` est **pragmatique** (Violet peut ajouter des statuts sans préavis), mais c'est un risque — les statuts invalides sont acceptés silencieusement. Recommandation : ajouter un commentaire dans le schema listant les valeurs officielles Violet et envisager une validation côté webhook processor via Zod.

#### 3.1.2 Transfers — Champs officiels Violet.io

La [doc Violet.io Transfers](https://docs.violet.io/prism/payments/payments-during-checkout/transfers) montre :

```json
{
  "id": 93001,                    // integer
  "payment_provider_id": "tr_...",  // string
  "payout_account_id": 1025,       // integer
  "amount": 3290,                  // integer (cents)
  "currency": "USD",               // string
  "status": "SENT",                // string: SUCCESS, FAILED
  "related_orders": ["148830"],    // array of strings (order IDs)
  "related_bags": ["139177"],      // array of strings (bag IDs)
  "related_distributions": ["87770"], // array of strings
  "errors": []
}
```

**Comparaison avec le schema Convex `orderTransfers`** :

| Champ Violet | Type doc | Type schema Convex | Cohérent ? |
|-------------|----------|-------------------|------------|
| `id` (transfer ID) | integer | `violetTransferId: v.optional(v.string())` | ✅ Stocké en string — cohérent avec la convention du projet |
| `related_bags` | array of strings | `violetBagId: v.optional(v.number())` | 🔴 **Incohérent** — voir §3.3.1 |
| `related_orders` | array of strings | `violetOrderId: v.string()` | ✅ |
| `status` | SENT, SUCCESS, FAILED | `status: v.string()` | ✅ |
| `amount` | integer (cents) | `amount: v.optional(v.number())` | ✅ |
| `currency` | string | `currency: v.optional(v.string())` | ✅ |

#### 3.1.3 Distributions — Types et statuts officiels

La [doc Violet.io Distributions](https://docs.violet.io/prism/payments/payouts/distributions) définit :

**Types** : `PAYMENT`, `REFUND`, `ADJUSTMENT`
**Statuts** : `PENDING`, `QUEUED`, `SENT`, `FAILED`

**Comparaison avec le schema Convex `orderDistributions`** :

| Champ | Type doc | Type schema | Cohérent ? |
|-------|----------|------------|------------|
| `type` | PAYMENT / REFUND / ADJUSTMENT | `v.string()` | ✅ |
| `status` | PENDING / QUEUED / SENT / FAILED | `v.optional(v.string())` | ✅ |
| `distributionId` | integer | `v.optional(v.string())` | ✅ Clé d'upsert |
| `channelAmount`, `stripeFee`, `merchantAmount`, `subtotal` | integers (cents) | `v.optional(v.number())` | ✅ Ajoutés post-revue |

#### 3.1.4 Payout Accounts — Champs officiels

La [doc Violet.io Prism Payout Accounts](https://docs.violet.io/prism/payments/payouts/prism-payout-accounts) montre :

```json
{
  "id": 13618,                    // integer — Violet Payout Account ID
  "merchant_id": 15756,           // integer — Violet Merchant ID
  "is_active": true,              // boolean
  "payment_provider": "STRIPE",   // string
  "payment_provider_account_id": "acct_...", // string
  "payment_provider_account": { ... },       // object (Stripe details + requirements)
  "errors": []
}
```

**Comparaison avec le schema `merchantPayoutAccounts`** :

| Champ Violet | Type schema | Cohérent ? |
|-------------|------------|------------|
| `id` (Violet PPA ID) | `violetPayoutAccountId: v.number()` | ✅ Integer — correct |
| `merchant_id` | `merchantId: v.id("merchants")` | ✅ FK Convex |
| `is_active` | Déduit du `status: v.string()` | ✅ |
| `payment_provider` | Dans `violetData` | ✅ |
| `requirements` | `requirements: v.optional(v.any())` | ✅ |

#### 3.1.5 Webhook Events — Headers officiels

La [doc Violet.io Handling Webhooks](https://docs.violet.io/prism/webhooks/handling-webhooks) + [Webhook Events](https://docs.violet.io/prism/webhooks/events) définit :

| Header officiel | Usage | Code Convex (`webhooks/violet.ts`) | Guide migration §12.3 |
|----------------|-------|-----------------------------------|----------------------|
| `X-Violet-Hmac` | HMAC-SHA256 signature | ✅ `x-violet-hmac` (L115) | ❌ `X-Violet-Signature` |
| `X-Violet-Event-Id` | Unique event ID | ✅ `x-violet-event-id` (L116) | ✅ |
| `X-Violet-Topic` | Event type | ✅ `x-violet-topic` (L117) | ❌ `X-Violet-Event-Type` |
| `X-Violet-Entity-Id` | Related entity | Non utilisé dans le code | Non mentionné |
| `X-Violet-Order-Id` | Order context | Non utilisé | Non mentionné |
| `X-Violet-Bag-Id` | Bag context | Non utilisé | Non mentionné |
| `X-Violet-Reason` | Merchant event reason | ✅ `x-violet-reason` (L118) | Non mentionné |

**Verdict** : Le **code est correct** et utilise les bons headers Violet. Le **guide de migration** est trompeur avec des noms erronés.

**Événements par catégorie** (7 catégories, ~47 events) :

| Catégorie | Events | Couverts par le code ? |
|-----------|--------|----------------------|
| Orders | `ORDER_ACCEPTED`, `ORDER_UPDATED`, `ORDER_COMPLETED`, `ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_REFUNDED`, `ORDER_CANCELLED`, `ORDER_FAILED` | ✅ |
| Merchants | `MERCHANT_CONNECTED`, `MERCHANT_DISCONNECTED`, `MERCHANT_ENABLED`, `MERCHANT_DISABLED`, `MERCHANT_NEEDS_ATTENTION`, `MERCHANT_COMPLETE` | ✅ |
| Offers | `OFFER_ADDED`, `OFFER_UPDATED`, `OFFER_REMOVED`, `OFFER_DELETED` (+ deprecated `OFFER_CREATED`) | ✅ |
| Collections | `COLLECTION_CREATED`, `COLLECTION_UPDATED`, `COLLECTION_REMOVED`, `COLLECTION_OFFERS_UPDATED` | ✅ |
| Syncs | `PRODUCT_SYNC_STARTED/COMPLETED/FAILED`, `COLLECTION_SYNC_STARTED/COMPLETED/FAILED` | ✅ |
| Payout Accounts | `CREATED/REQUIREMENTS_UPDATED/ACTIVATED/DEACTIVATED/DELETED` | ✅ |
| Payment Transactions | `CAPTURE_STATUS_UPDATED/AUTHORIZED/CAPTURED/REFUNDED/PARTIALLY_REFUNDED/FAILED` | ✅ |
| Transfers | `TRANSFER_SENT/PARTIALLY_SENT/FAILED/UPDATED/REVERSED/PARTIALLY_REVERSED/REVERSAL_FAILED` | ✅ |

### 3.2 Best Practices Convex appliquées au schéma

La [doc Convex Best Practices](https://docs.convex.dev/understanding/best-practices) liste plusieurs règles vérifiées :

| # | Best Practice | Statut dans le schema | Détail |
|---|--------------|----------------------|--------|
| 1 | **Éviter `.filter()` sur les queries DB** | 🟡 Voir §3.3.3 | `wishlistItems` utilise `.filter()` pour le lookup productId — un index composé serait plus efficace |
| 2 | **`.collect()` uniquement sur de petits résultats** | ✅ | Les webhook processors utilisent `.take(500)` pour les crons |
| 3 | **Vérifier les index redondants** | 🟡 Voir §3.3.4 | 2 paires d'index redondants détectées |
| 4 | **Validateurs d'arguments sur toutes les fonctions publiques** | ✅ | Toutes les queries/mutations ont des `args` validés |
| 5 | **Contrôle d'accès sur toutes les fonctions publiques** | ✅ | Admin queries utilisent `assertAdmin()`, les queries user filtrent par userId |
| 6 | **Seulement `internal.*` dans `ctx.run*` et `scheduler`** | ✅ | Les crons et webhook processors utilisent `internal.*` |

### 3.3 Anomalies détectées

#### 🔴 Critique #1 — `orderTransfers.violetBagId` : `v.number()` vs `v.string()` partout ailleurs

**Fichier** : `convex/schema.ts`

**Problème** : `orderTransfers` définit `violetBagId: v.optional(v.number())` mais `orderBags` définit `violetBagId: v.string()`. Les IDs Violet Bag sont des integers côté API, mais le projet les stocke en `string` dans toutes les autres tables (`violetOrderId: v.string()`, `violetBagId: v.string()`, `violetRefundId: v.string()`).

**Impact** : Quand un webhook Transfer référence un bag, il faudra convertir l'integer en string pour le lookup, ou inversement. Incohérence dans les patterns de query.

**Correction** : Changer `orderTransfers.violetBagId` en `v.optional(v.string())` pour être cohérent avec `orderBags.violetBagId`.

---

#### 🔴 Critique #2 — Guide migration §12.3 : noms de headers webhook erronés

**Fichier** : `MIGRATION-SUPABASE-TO-CONVEX.md` §12.3

**Problème** : Le guide référence :
- `X-Violet-Signature` → le code utilise `x-violet-hmac` (correct selon la doc Violet)
- `X-Violet-Event-Type` → le code utilise `x-violet-topic` (correct selon la doc Violet)

**Impact** : Tout développeur qui suit le guide de migration aveuglément écrira un handler webhook avec les mauvais headers.

**Correction** : Mettre à jour le guide §12.3 avec les vrais noms de headers documentés par Violet.io.

---

#### 🔴 Critique #3 — Guide migration §6.1 : `webhookEvents.status` incomplet

**Fichier** : `MIGRATION-SUPABASE-TO-CONVEX.md` §6.1

**Problème** : Le guide liste 3 statuts (`received` / `processed` / `failed`) mais le code en a 4 (`received` / `processing` / `processed` / `failed`).

**Impact** : Le statut `processing` est un ajout légitime (intermédiaire entre réception et traitement complet). La documentation est en retard.

**Correction** : Mettre à jour le guide pour lister les 4 statuts et expliquer le rôle de `processing`.

---

#### 🟡 #4 — Index redondant `cartItems.by_cartId`

**Fichier** : `convex/schema.ts`

**Problème** : `.index("by_cartId", ["cartId"])` est un préfixe de `.index("by_cart_sku", ["cartId", "skuId"])`. La doc Convex Best Practices dit : *"Indexes like `by_foo` and `by_foo_and_bar` are usually redundant"*. Les queries qui filtrent par `cartId` seul peuvent utiliser `by_cart_sku` sans condition sur `skuId`.

**Exception** : Si on a besoin de trier les items d'un panier par `_creationTime` (et non par `skuId`), l'index `by_cartId` serait utile car `by_cart_sku` trie par `[cartId, skuId, _creationTime]`.

**Correction** : Supprimer `by_cartId` sauf si le tri par `_creationTime` sur cartId seul est nécessaire.

---

#### 🟡 #5 — Index redondant `notificationPreferences.by_userId`

**Fichier** : `convex/schema.ts`

**Problème** : `.index("by_userId", ["userId"])` est un préfixe de `.index("by_userId_type", ["userId", "notificationType"])`. Même pattern que #4.

**Correction** : Supprimer `by_userId` sauf si le tri par `_creationTime` sur userId seul est un use case réel.

---

#### 🟡 #6 — Index composé manquant `wishlistItems.by_wishlistId_productId`

**Fichier** : `convex/schema.ts`

**Problème** : Le code `convex/wishlists/mutations.ts` vérifie si un produit est déjà dans la wishlist via :

```typescript
await ctx.db
  .query("wishlistItems")
  .withIndex("by_wishlistId", (q) => q.eq("wishlistId", wishlist._id))
  .filter((q) => q.eq(q.field("productId"), productId))
  .first();
```

La doc Convex Best Practices dit d'éviter `.filter()` sur les DB queries — un index composé `["wishlistId", "productId"]` permettrait un lookup direct sans scan.

**Atténuation** : La table `wishlistItems` est petite (1–50 items par user), donc l'impact performance est négligeable. Mais c'est un anti-pattern selon la doc.

**Correction** : Ajouter `.index("by_wishlistId_productId", ["wishlistId", "productId"])` et mettre à jour la mutation pour utiliser cet index.

---

#### 🟡 #7 — `@convex-dev/react-query` installé mais inutilisé

**Fichiers** : `apps/web/package.json`, `packages/shared/package.json`

**Problème** : Le package est listé en dependency mais aucun hook n'appelle `convexQuery()`. Le bridge `ConvexQueryClient` a été retiré de `router.tsx` en Phase 5. Les hooks Convex utilisent `convex/react` directement.

**Correction** : Retirer `@convex-dev/react-query` des dependencies.

---

#### 🟡 #8 — `orders.status` et `orderBags.status` en `v.string()` sans validation

**Fichier** : `convex/schema.ts`

**Problème** : Les statuts Violet sont stockés en `v.string()` sans contrainte. Si Violet ajoute un statut ou si un payload corrompu arrive, il sera accepté silencieusement.

**Atténuation** : La validation Zod dans `convex/lib/webhookSchemas.ts` filtre les payloads webhook avant écriture. Le `v.string()` est donc un filet de sécurité supplémentaire, pas le seul gardien.

**Recommandation** : Ajouter un commentaire dans le schema listant les valeurs officielles Violet (§3.1.1 ci-dessus) pour documentation.

---

## 4. Cohérence Web ↔ Mobile (Phases 0–1)

### 4.1 Configuration Convex client

| Aspect | Web (`apps/web/src/router.tsx`) | Mobile (`apps/mobile/src/app/_layout.tsx`) | Cohérent ? |
|--------|------|--------|------------|
| ConvexReactClient | ✅ `new ConvexReactClient(VITE_CONVEX_URL, {...})` | ✅ `new ConvexReactClient(EXPO_PUBLIC_CONVEX_URL, {...})` | ✅ |
| `skipConvexDeploymentUrlCheck` | ✅ `true` | ✅ `true` | ✅ |
| `unsavedChangesWarning` | ✅ `false` | ✅ `false` | ✅ |
| ConvexAuthProvider | ✅ Dans `Wrap` du router | ✅ Wraps `appContent` | ✅ |
| TokenStorage | N/A (localStorage par défaut) | ✅ `convexTokenStorage` (SecureStore) | ✅ Adapté par plateforme |
| URL manquante | ✅ `throw new Error(...)` | ✅ Fallback UI + `console.warn` | ✅ Différent mais adapté (web peut crasher, mobile doit render) |
| Path alias `#convex/*` | ✅ Dans `apps/web/tsconfig.json` | ✅ Dans `apps/mobile/tsconfig.json` | ✅ |

### 4.2 Modèle localId

| Aspect | Web (`packages/shared/src/utils/localId.ts`) | Mobile (`apps/mobile/src/utils/mobileLocalId.ts`) | Cohérent ? |
|--------|------|--------|------------|
| Stockage | `localStorage` | `expo-secure-store` | ✅ Adapté par plateforme |
| Signature | `getOrCreateLocalId(): string` (sync) | `getOrCreateLocalIdMobile(): Promise<string>` (async) | ✅ Nécessaire — SecureStore est async |
| Clé | `maison_emile_local_id` | `maison_emile_local_id` | ✅ Même clé |
| UUID | `crypto.randomUUID()` | `crypto.randomUUID()` | ✅ Disponible dans Hermes depuis RN 0.76+ (projet utilise 0.83.6) |
| `clearLocalId` | ✅ `clearLocalId()` | ✅ `clearLocalIdMobile()` | ✅ |
| `getLocalId` | ✅ `getLocalId(): string | null` | ✅ `getLocalIdMobile(): Promise<string | null>` | ✅ |

**Verdict** : Les deux implémentations sont **nécessairement différentes** (sync vs async) mais partagent la même clé et le même UUID generator. DRY sur la logique, adaptées sur le storage. ✅

---

## 5. Cohérence Guide de migration ↔ Code réel

### 5.1 Incohérences détectées 🔴

| # | Section guide | Guide dit | Code fait | Sévérité |
|---|-------------|-----------|----------|----------|
| 1 | §12.3 — HTTP Action webhook | `request.headers.get("X-Violet-Signature")` | `request.headers.get("x-violet-hmac")` | 🔴 Doc trompeuse |
| 2 | §12.3 — HTTP Action webhook | `request.headers.get("X-Violet-Event-Type")` | `request.headers.get("x-violet-topic")` | 🔴 Doc trompeuse |
| 3 | §6.1 — webhookEvents.status | 3 statuts : received / processed / failed | 4 statuts : received / processing / processed / failed | 🔴 Doc incomplète |
| 4 | §6.1 — Index nom `by_type_date` | `.index("by_type_date", ["eventType", "_creationTime"])` | `.index("by_eventType", ["eventType"])` (équivalent car `_creationTime` est auto-ajouté) | 🟡 Nom différent, résultat identique |
| 5 | §6.1 — Index nom `by_userId_createdAt` | `.index("by_userId_createdAt", ["userId", "_creationTime"])` | `.index("by_userId", ["userId"])` (équivalent) | 🟡 Nom différent, résultat identique |
| 6 | §6.1 — `userProfiles.preferences` | `v.object({})` | `v.record(v.string(), v.any())` | ✅ Code est meilleur |

### 5.2 Code meilleur que le guide ✅

| Aspect | Guide | Code | Pourquoi le code est meilleur |
|--------|-------|------|------------------------------|
| `userProfiles.preferences` | `v.object({})` — objet vide | `v.record(v.string(), v.any())` — clé/valeur dynamique | Les préférences sont dynamiques (thème, langue, etc.) |
| `webhookEvents.status` | 3 statuts | 4 statuts (+ `processing`) | État intermédiaire utile pour les events longs |
| `orderDistributions.distributionId` | Absent du guide initial | Ajouté post-revue | Clé de déduplication nécessaire |
| `orderDistributions` champs enrichis | Absents | `channelAmount`, `stripeFee`, `merchantAmount`, `subtotal` | Données financières détaillées de Violet |

---

## 6. Synthèse des actions

### 🔴 À corriger — 3 actions

| # | Action | Fichier | Priorité |
|---|--------|---------|----------|
| **S1** | Changer `orderTransfers.violetBagId` de `v.optional(v.number())` en `v.optional(v.string())` | `convex/schema.ts` | Haute — incohérence de type pour le même concept |
| **S2** | Corriger les noms de headers webhook dans le guide : `X-Violet-Signature` → `X-Violet-Hmac`, `X-Violet-Event-Type` → `X-Violet-Topic` | `MIGRATION-SUPABASE-TO-CONVEX.md` §12.3 | Haute — guide trompeur |
| **S3** | Ajouter le statut `processing` dans la liste des webhookEvents.status du guide | `MIGRATION-SUPABASE-TO-CONVEX.md` §6.1 | Haute — doc incomplète |

### 🟡 À améliorer — 5 actions

| # | Action | Fichier | Priorité |
|---|--------|---------|----------|
| **S4** | Supprimer l'index redondant `cartItems.by_cartId` (préfixe de `by_cart_sku`) | `convex/schema.ts` | Moyenne — best practice Convex |
| **S5** | Supprimer l'index redondant `notificationPreferences.by_userId` (préfixe de `by_userId_type`) | `convex/schema.ts` | Moyenne — best practice Convex |
| **S6** | Ajouter l'index composé `wishlistItems.by_wishlistId_productId` | `convex/schema.ts` | Moyenne — élimine un `.filter()` |
| **S7** | Retirer `@convex-dev/react-query` des dependencies web + shared | `apps/web/package.json`, `packages/shared/package.json` | Basse — package mort |
| **S8** | Ajouter un commentaire dans le schema listant les valeurs officielles des statuts Violet (orders, bags, distributions, transfers) | `convex/schema.ts` | Basse — documentation |

### ✅ Validé — Aucune action requise

| Catégorie | Points validés |
|-----------|---------------|
| Phase 0 | 11 points validés (deps, structure, backend, clients, env, cohabitation) |
| Phase 1 Schema | 23 tables, authTables, indexes, types Convex, commentaires |
| Phase 1 Violet.io | Orders, Bags, Merchants, Payout Accounts, Distributions — fidèles à la doc officielle |
| Phase 1 Best Practices | Validateurs d'args, contrôle d'accès, internal functions, `.take()` borné |
| Web ↔ Mobile | Clients Convex, providers, localId, path alias — cohérents |
| Webhooks | 7 catégories d'événements couvertes, HMAC validé, headers corrects |

---

> **Prochaine étape** : Corriger S1–S3 (bloquants), puis S4–S8 (améliorations) avant de passer à l'audit des phases 2–9.
