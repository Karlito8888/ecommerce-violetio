# Audit : Architecture Dual-Backend (Edge Functions Deno + Server Functions Node)

> **Date** : 23 avril 2026
> **Statut** : Phase 1 ✅ terminée · Phase 2 ✅ terminée · Phase 3 ⬜ à faire · Phase 4 ⬜ à faire

---

## Table des matières

1. [État des lieux](#1-état-des-lieux)
2. [Cartographie des Edge Functions](#2-cartographie-des-edge-functions)
3. [Code dupliqué `_shared/` (Deno)](#3-code-dupliqué-_shared-deno)
4. [Problèmes concrets déjà rencontrés](#4-problèmes-concrets-déjà-rencontrés)
5. [Solution proposée](#5-solution-proposée)
6. [Plan de migration](#6-plan-de-migration)
7. [Gains attendus](#7-gains-attendus)
8. [Risques et mitigations](#8-risques-et-mitigations)
9. [Estimation](#9-estimation)
10. [Recommandations](#10-recommandations-claude-code--23-avril-2026)

---

## 1. État des lieux

### Le problème

L'application mobile n'utilise pas le même backend que le web. Chaque appel API Violet existe en **deux exemplaires** :

```
Web (Node.js)                    Mobile (Deno)
─────────────────                ──────────────────
Server Function → shared →       EF (Supabase) → copie →
    Violet API                       Violet API
```

Le mobile appelle des Supabase Edge Functions (Deno) qui **recopient** la logique métier déjà implémentée dans `@ecommerce/shared` (Node), consommé par les TanStack Server Functions du web.

### Pourquoi ce dual-backend existe

À l'origine du développement mobile, les Edge Functions Supabase étaient le moyen le plus rapide d'avoir un backend intermédiaire :

- Les secrets Violet (`VIOLET_APP_SECRET`, `VIOLET_PASSWORD`) ne peuvent **jamais** être dans le bundle mobile.
- Deno (Edge Functions) ne peut pas importer le workspace Bun (`@ecommerce/shared`).
- Résultat : chaque endpoint a été réimplémenté à la main en Deno, avec `@ts-nocheck`.

Ce choix pragmatique a accumulé du tech debt au fil des épics.

### Chiffres clés

| Composant | Lignes | Runtime | Typé | Testé |
|-----------|--------|---------|------|-------|
| `packages/shared/src/` | 22 374 | Node | ✅ Strict | ✅ 437 tests |
| `apps/web/src/server/` | 3 908 | Node | ✅ Strict | ✅ 581 tests |
| `supabase/functions/*/index.ts` | 5 860 | Deno | ⚠️ `@ts-nocheck` | ❌ 0 tests |
| `supabase/functions/_shared/` | 1 362 | Deno | ⚠️ `@ts-nocheck` | ❌ 0 tests |
| `apps/mobile/src/server/` | 282 | React Native | ✅ | N/A |

**Total du code Deno : 7 222 lignes**, dont la grande majorité recopie ce que `@ecommerce/shared` fait déjà en Node.

---

## 2. Cartographie des Edge Functions

### 9 EFs dupliquées (appelées par le mobile, existent déjà en Node)

Ces EFs recopient la logique métier de `@ecommerce/shared` et des server functions web. Chaque correction ou évolution doit être appliquée **deux fois**.

| Edge Function (Deno) | Lignes | `@ts-nocheck` | Équivalent Node (déjà existant) |
|---|---|---|---|
| `cart/index.ts` | 1 534 | Non | `cartActions.ts` + `checkout.ts` → `violetCart.ts` + `violetCheckout.ts` |
| `get-products/index.ts` | 326 | Non | `getProducts.ts` → `violetCatalog.ts` |
| `get-product/index.ts` | 358 | Non | `getProduct.ts` → `violetCatalog.ts` |
| `get-merchants/index.ts` | 63 | Oui | `getMerchants.ts` → `violetMerchants.ts` |
| `get-merchant/index.ts` | 62 | Oui | `getMerchant.ts` → `violetMerchants.ts` |
| `get-collection-products/index.ts` | 206 | Non | `getCollections.ts` → `violetCollections.ts` |
| `get-exchange-rates/index.ts` | 60 | Non | `exchangeRates.ts` → `violetCurrency.ts` |
| `guest-order-lookup/index.ts` | 213 | Non | `guestOrderHandlers.ts` |
| `track-event/index.ts` | 144 | Non | `trackingHandlers.ts` |
| **TOTAL** | **2 966** | | |

### 9 EFs légitimes (pas dupliquées, à garder)

Ces EFs ont des raisons spécifiques d'exister en Deno : webhooks entrants, opérations internes, ou fonctionnalités sans équivalent dans le backend web.

| Edge Function | Lignes | Raison de rester en Deno |
|---|---|---|
| `handle-webhook` | 768 | URL publique pour les webhooks Violet entrants (OFFER_ADDED, MERCHANT_CONNECTED, BAG_*, etc.) |
| `health-check` | 384 | Monitoring admin — vérifie connectivité Violet + scopes Shopify |
| `generate-embeddings` | 137 | Appelé par le pipeline webhook pour générer les vecteurs pgvector |
| `search-products` | 373 | Backend AI search (OpenAI embeddings + pgvector) |
| `get-recommendations` | 295 | Backend AI recommendations |
| `send-notification` | 323 | Notifications in-app |
| `send-push` | 259 | Push notifications (expo-push) |
| `send-support-email` | 211 | Email de support au merchant |
| `send-support-reply` | 144 | Réponse à un inquiry support |

---

## 3. Code dupliqué `_shared/` (Deno)

Le dossier `supabase/functions/_shared/` est une copie manuelle de portions de `@ecommerce/shared`, adaptée au runtime Deno. Chaque modification dans le package shared doit être répliquée ici.

| Fichier Deno | Lignes | Copie de (Node) |
|---|---|---|
| `violetAuth.ts` | 275 | `shared/clients/violetAuth.ts` — JWT 24h + refresh proactif + re-login fallback |
| `fetchWithRetry.ts` | 209 | `shared/adapters/violetFetch.ts` — retry 429 + timeout 30s + auth headers |
| `constants.ts` | 27 | `shared/adapters/violetConstants.ts` — `MAX_RETRIES`, `BASE_DELAY_MS`, etc. |
| `schemas.ts` | 467 | `shared/adapters/violetTransforms.ts` + `product.schema.ts` — Zod schemas, snake_case → camelCase |
| `cors.ts` | 26 | Pas d'équivalent (Deno-only) |
| `supabaseAdmin.ts` | 30 | Pas d'équivalent (Deno-only) |
| `webhookAuth.ts` | 114 | `shared/adapters/violetWebhook.ts` — validation signatures Violet |
| `openai.ts` | 110 | Pas d'équivalent Node (AI-only) |
| `personalization.ts` | 104 | Pas d'équivalent Node (AI-only) |
| **TOTAL** | **1 362** | |

Les 4 premiers fichiers (`violetAuth`, `fetchWithRetry`, `constants`, `schemas`) sont les plus critiques — ils dupliquent le cœur de l'authentification et de la communication Violet.

---

## 4. Problèmes concrets déjà rencontrés

### Incident 1 — Pages merchants vides (23 avril 2026)

**Symptôme** : Les pages `/merchants` (web + mobile) affichaient "No merchants connected yet".

**Cause** : Le web et le mobile interrogeaient la table Supabase `merchants` qui n'était **jamais peuplée** (elle est alimentée uniquement par les webhooks `MERCHANT_CONNECTED`). Les product cards, elles, fonctionnaient car elles appellent directement `GET /merchants` via l'API Violet.

**Correction appliquée** : `getMerchants.ts` (web) et `get-merchants/index.ts` (mobile) modifiés pour appeler `GET /merchants` Violet au lieu de la table Supabase. **Mais la correction a dû être faite deux fois** (Node + Deno).

### Incident 2 — Pagination cassée (audit Violet #5)

**Symptôme** : Pagination infinie qui dupliquait la page 1.

**Cause** : Violet retourne `number: 0` (0-based) mais le code attendait `1` (1-based).

**Correction** : `data.number + 1` ajouté dans `violetCollections.ts`, `violetOrders.ts` et l'Edge Function `get-collection-products/index.ts`. La correction dans shared a été testée (437 tests). La correction dans l'EF Deno n'a pu être testée automatiquement.

### Risque permanent — Désynchronisation

Chaque évolution ou bugfix dans `@ecommerce/shared` doit être **manuellement répliqué** dans `supabase/functions/_shared/`. Avec `@ts-nocheck`, les erreurs de mapping, de typage ou de pagination sont invisibles jusqu'à la production.

---

## 5. Solution proposée

### Principe

Le mobile appelle le **backend web** (TanStack Start) au lieu des Edge Functions Supabase pour toute la logique métier dédupliquée.

```
AVANT (actuel) :
  Web:    Browser → Server Function (Node) → @ecommerce/shared → Violet API
  Mobile: App    → Edge Function (Deno)    → copie @ts-nocheck → Violet API

APRÈS (proposé) :
  Web:    Browser → Server Function (Node) → @ecommerce/shared → Violet API
  Mobile: App    → API Route REST (Node)   → @ecommerce/shared → Violet API
```

### TanStack Start supporte ça nativement

La documentation TanStack Start (v1.166+) offre deux mécanismes :

1. **Server Functions** (`createServerFn`) — appelées par le client web via un protocole interne TanStack. Pas utilisables depuis l'extérieur.

2. **Server Routes** (`createFileRoute('/api/...')` + `server.handlers`) — de vrais endpoints REST (GET, POST) accessibles par n'importe quel client HTTP. C'est ce mécanisme qu'on utilise pour le mobile.

Exemple :

```typescript
// apps/web/src/routes/api/merchants.ts
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "../../server/violetAdapter";

export const Route = createFileRoute("/api/merchants")({
  server: {
    handlers: {
      GET: async () => {
        const result = await getAdapter().listMerchants();
        return Response.json(result.data ?? []);
      },
    },
  },
});
```

Le mobile appelle simplement `GET https://maisonemile.com/api/merchants` et reçoit du JSON.

### Côté mobile : un seul fichier client

```typescript
// apps/mobile/src/server/apiClient.ts
const API_URL = process.env.EXPO_PUBLIC_API_URL; // https://maisonemile.com

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
```

---

## 6. Plan de migration

### Phase 1 — Créer l'API client mobile (~15 min) ✅ TERMINÉE

- **Fichier créé** : `apps/mobile/src/server/apiClient.ts` (57 lignes)
  - Fonctions `apiGet<T>()` et `apiPost<T>()` — client HTTP typé générique
  - Resolution de l'URL via `Constants.expoConfig?.extra?.apiUrl` → `process.env.EXPO_PUBLIC_API_URL` → fallback `http://10.0.2.2:3000`
- **Variable d'environnement ajoutée** : `EXPO_PUBLIC_API_URL`
  - `.env.example` : `http://127.0.0.1:3000`
  - `.env.local` : `http://10.0.2.2:3000` (Android emulator)
- **Validations** : TypeScript ✅ · ESLint ✅

### Phase 2 — Créer les API Routes web (~2 h) ✅ TERMINÉE

13 API Routes REST créées dans `apps/web/src/routes/api/`, chacune déléguant aux server functions existantes via `getAdapter()` et les handlers métier. Le pattern a été validé sur `/api/exchange-rates` en premier (Recommandation 1).

| Route REST | Méthode | Fichier | Délègue à |
|---|---|---|---|
| `/api/exchange-rates` | GET | `api/exchange-rates.ts` | `getAdapter().getExchangeRates()` |
| `/api/merchants` | GET | `api/merchants/index.ts` | `getAdapter().listMerchants()` |
| `/api/merchants/:id` | GET | `api/merchants/$merchantId.ts` | `getAdapter().getMerchant()` |
| `/api/merchants/:id/products` | GET | `api/merchants/$merchantId/products.ts` | `getAdapter().getMerchantProducts()` |
| `/api/products` | GET | `api/products/index.ts` | `getAdapter().getProducts()` + filtre shipping |
| `/api/products/:id` | GET | `api/products/$productId.ts` | `getAdapter().getProduct()` |
| `/api/collections/:id/products` | GET | `api/collections/$collectionId/products.ts` | `getAdapter().getCollectionOffers()` |
| `/api/cart` | POST | `api/cart/index.ts` | `getAdapter().createCart()` |
| `/api/cart/:id` | GET | `api/cart/$cartId/index.ts` | `getAdapter().getCart()` |
| `/api/cart/:id/skus` | POST | `api/cart/$cartId/skus/index.ts` | `getAdapter().addToCart()` |
| `/api/cart/:id/skus/:sku` | PUT | `api/cart/$cartId/skus/$skuId.ts` | `getAdapter().updateCartItem()` |
| `/api/cart/:id/skus/:sku` | DELETE | `api/cart/$cartId/skus/$skuId.ts` | `getAdapter().removeFromCart()` |
| `/api/guest-order-lookup` | POST | `api/guest-order-lookup.ts` | `guestOrderHandlers.ts` |
| `/api/track-event` | POST | `api/track-event.ts` | `trackingHandlers.ts` |

**Observations techniques** :

- **Boundary client/server** : aucun problème. `getAdapter()` est importé dans les handlers `server.handlers` qui sont exclus du bundle client par TanStack Start. L'alias `#/server/violetAdapter` fonctionne correctement.
- **Dynamic params** : les segments `$merchantId`, `$productId`, `$collectionId`, `$cartId`, `$skuId` sont accessibles via `params` dans le handler — confirmé par la doc TanStack Start.
- **Query params** : lus via `new URL(request.url).searchParams` — pattern standard Web API.
- **Server Functions non appelables directement** : les `createServerFn` (ex: `getProductsFn`) sont des RPC TanStack, pas des fonctions normales. Les API Routes contournent cela en appelant directement `getAdapter()` — la même couche basse que les server functions utilisent en interne.
- **CORS** : pas nécessaire en dev. En prod, le mobile est une app native (pas de CORS).

**Tests HTTP manuels** (tous réussis) :

```
GET /api/exchange-rates        → {}
GET /api/merchants              → { data: [...3 merchants], error: null }
GET /api/merchants/10225        → { data: { id, name, platform, ... }, error: null }
GET /api/merchants/10225/products?page=1&pageSize=2 → { data: { data: [...], total, hasNext }, error: null }
GET /api/products               → { data: { data: [...12 products], total: 36, hasNext: true }, error: null }
GET /api/products/59398         → { data: { id, name, minPrice, skus, ... }, error: null }
POST /api/cart {}               → { data: { violetCartId: "233324", ... }, error: null }
GET /api/cart/233324            → { data: { violetCartId, bags: [], ... }, error: null }
POST /api/guest-order-lookup    → { data: null, error: null } (token invalide)
POST /api/track-event           → { success: true }
```

**Validations** : TypeScript (web + mobile) ✅ · ESLint ✅ · 1018 tests ✅

### Phase 3 — Migrer les appels mobile (~2 h)

Remplacer chaque `fetch(SUPABASE_URL/functions/v1/...)` par `apiGet/apiPost` vers le backend web.

Fichiers impactés :

| Fichier mobile | EF actuelle | Nouvelle route |
|---|---|---|
| `merchants/index.tsx` | `functions/v1/get-merchants` | `apiGet("/api/merchants")` |
| `merchants/[merchantId].tsx` | `functions/v1/get-merchant` | `apiGet("/api/merchants/{id}")` |
| `merchants/[merchantId].tsx` | `functions/v1/get-products` | `apiGet("/api/merchants/{id}/products")` |
| `products/[productId].tsx` | `functions/v1/get-product` | `apiGet("/api/products/{id}")` |
| `server/getProducts.ts` | `functions/v1/get-products` | `apiGet("/api/products")` |
| `server/getCollections.ts` | `functions/v1/get-collection-products` | `apiGet("/api/collections/{id}/products")` |
| `_layout.tsx` | `functions/v1/get-exchange-rates` | `apiGet("/api/exchange-rates")` |
| `cart.tsx` | `functions/v1/cart` | `apiPost("/api/cart/...")` |
| `checkout.tsx` | `functions/v1/cart` | `apiPost("/api/cart/...")` |
| `order/lookup.tsx` | `functions/v1/guest-order-lookup` | `apiPost("/api/guest-order-lookup")` |
| `order/[orderId]/confirmation.tsx` | `functions/v1/cart` | `apiGet("/api/cart/orders/{id}")` |
| `context/AuthContext.tsx` | `functions/v1/cart` | `apiPost("/api/cart/...")` |
| `hooks/useMobileTracking.ts` | `functions/v1/track-event` | `apiPost("/api/track-event")` |

Chaque migration = tester que le feature fonctionne, puis passer au suivant.

### Phase 4 — Nettoyer (~1 h)

- Supprimer les 9 EFs dupliquées (`cart`, `get-products`, `get-product`, `get-merchants`, `get-merchant`, `get-collection-products`, `get-exchange-rates`, `guest-order-lookup`, `track-event`)
- Supprimer les fichiers `_shared/` devenus inutiles (`violetAuth.ts`, `fetchWithRetry.ts`, `constants.ts`, `schemas.ts`, `cors.ts`)
- Garder les 9 EFs légitimes et les fichiers `_shared/` qu'elles utilisent encore (`supabaseAdmin.ts`, `webhookAuth.ts`, `openai.ts`, `personalization.ts`)
- Nettoyer les variables d'environnement mobile : supprimer `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` si plus aucun appel direct Supabase ne subsiste
- Mettre à jour `.env.example`

---

## 7. Gains attendus

| Critère | Avant | Après |
|---|---|---|
| Code dupliqué Violet | 7 222 lignes Deno | **0** |
| Nouvel endpoint à écrire | 2 implémentations (Node + Deno) | **1 seule (Node)** |
| Typage côté backend mobile | `@ts-nocheck` | **Strict (via shared)** |
| Tests backend mobile | 0 | **Couvert par les 437 tests shared** |
| Secrets Violet dans Supabase | Oui (`VIOLET_APP_SECRET`, `VIOLET_PASSWORD` en env vars EF) | **Non (uniquement dans le backend web)** |
| Risque de désynchronisation | Permanent | **Éliminé** |
| CORS | Non | **Oui (1 config sur `/api/*`)** |
| Runtime backend mobile | Deno (isolé) | **Node (même que le web)** |

---

## 8. Risques et mitigations

### Risque 1 — Le backend web doit être déployé pour que le mobile marche

**Gravité** : Moyenne
**Mitigation** : Le site web sera déployé de toute façon (c'est le storefront). En dev local, le mobile pointe vers `localhost:3000` via `EXPO_PUBLIC_API_URL`. Si le web est down, le mobile ne fonctionne plus — mais c'est le cas aussi du storefront web.

### Risque 2 — CORS

**Gravité** : Faible
**Mitigation** : Une seule config CORS sur les routes `/api/*` du serveur web. En dev, CORS n'est pas nécessaire (même origine). En prod, le mobile est une app native — pas de restriction CORS.

### Risque 3 — Latence supplémentaire

**Gravité** : Faible
**Mitigation** : Le mobile appelait déjà un serveur intermédiaire (Supabase Edge Functions). Le backend web sera déployé sur un CDN/edge similaire. La différence de latence est négligeable (potentiellement meilleure si le backend web est plus proche des serveurs Violet).

### Risque 4 — Les 9 EFs légitimes restent en Deno

**Gravité** : Nulle
**Mitigation** : Ces EFs (webhooks, AI, push) ne sont pas dupliquées — elles ont des raisons légitimes d'exister en Deno. Elles ne sont pas impactées par la migration.

### Risque 5 — Authentification des requêtes mobile → web

**Gravité** : Faible
**Mitigation** : Les endpoints publics (products, merchants, exchange rates) ne nécessitent pas d'auth. Les endpoints utilisateur (cart, orders) peuvent utiliser le Supabase JWT token existant comme header `Authorization: Bearer {token}`. Configurable via le `apiClient.ts`.

---

## 9. Estimation

| Phase | Description | Durée |
|---|---|---|
| Phase 1 | API client mobile (`apiClient.ts` + env var) | ~15 min |
| Phase 2 | 9 API Routes web (`/api/*`) | ~2 h |
| Phase 3 | Migration des 13 fichiers mobile | ~2 h |
| Phase 4 | Nettoyage EFs + _shared + env vars | ~1 h |
| **Total** | | **~½ journée** |

---

## 10. Recommandations (Claude Code — 23 avril 2026)

### Validation de la solution

La solution est **techniquement cohérente**. Les points suivants ont été vérifiés :

- **TanStack Start Server Routes** : la feature `createFileRoute` + `server.handlers` est confirmée dans la documentation officielle (v1 latest). La distinction entre `createServerFn` (protocol interne, web uniquement) et `server.handlers` (REST pur, accessible depuis n'importe quel client HTTP) est correcte et bien appliquée dans ce plan.
- **Dossier `apps/web/src/routes/api/`** : existe déjà dans le repo (créé le 13 mars, actuellement vide) — cohérent avec la Phase 2.
- **CORS + app native** : l'affirmation "pas de restriction CORS en production pour une app native" est exacte. Les restrictions CORS sont une contrainte navigateur uniquement ; React Native utilise un fetch natif sans enforcement CORS.
- **Les 9 EFs à conserver** : la sélection est justifiée. Webhooks entrants, AI search/recommendations, push notifications et emails de support ont de vraies raisons d'être en Deno (URL publique Violet, dépendances OpenAI/pgvector, Expo Push API). Aucune ne duplique un équivalent Node existant.

---

### Recommandation 1 — Valider le pattern avant de tout migrer

**Risque identifié** : Si le pattern Server Routes présente un problème inattendu (import `getAdapter()` à travers la boundary server/client, type retour, CORS en dev), le découvrir sur le premier endpoint simple est peu coûteux. Le découvrir sur `cart` après 3h de migration l'est beaucoup moins.

**Action** : Implémenter et tester **un seul endpoint simple en premier** (`/api/exchange-rates` ou `/api/merchants`) de bout en bout avant de démarrer les 8 autres. L'endpoint `exchange-rates` est le meilleur candidat : 60 lignes Deno, logique triviale, pas d'auth, facile à valider sur le mobile.

```typescript
// apps/web/src/routes/api/exchange-rates.ts  ← à faire en premier
import { createFileRoute } from "@tanstack/react-router";
import { getAdapter } from "../../server/violetAdapter";

export const Route = createFileRoute("/api/exchange-rates")({
  server: {
    handlers: {
      GET: async () => {
        const result = await getAdapter().getExchangeRates();
        return Response.json(result.data ?? {});
      },
    },
  },
});
```

Valider sur le mobile que `apiGet("/api/exchange-rates")` retourne les mêmes données qu'actuellement. Seulement ensuite, lancer les 8 endpoints restants.

---

### Recommandation 2 — Migrer `cart` en dernier, après avoir validé l'auth

**Risque identifié** : `cart` est de loin l'endpoint le plus complexe (1 534 lignes Deno, multiples opérations : création, ajout de produits, application de coupon, checkout, récupération de commande). L'estimation de "~2h" pour la Phase 3 entière est optimiste si `cart` révèle des surprises.

**Action** : Respecter cet ordre dans la Phase 3 :

1. Endpoints publics sans auth (merchants, products, exchange-rates, collections) — valider que `apiClient.ts` fonctionne
2. Valider l'injection du JWT Supabase dans `apiClient.ts` **avant** de toucher au cart :

```typescript
// apps/mobile/src/server/apiClient.ts — version auth
import { supabase } from "../lib/supabase"; // client Supabase mobile

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
```

3. Seulement ensuite migrer `cart`, `checkout`, `order`, `AuthContext`.

---

### Recommandation 3 — Vérifier la boundary server/client dans les routes API

**Risque identifié** : TanStack Start impose une boundary stricte entre code client et code serveur. Un import de `getAdapter()` dans un fichier de route peut déclencher un warning ou une erreur si le bundler essaie de l'inclure côté client.

**Observation rassurante** : `getMerchants.ts` importe déjà `getAdapter()` dans un `createServerFn` sans problème — ce qui suggère que la boundary est déjà correctement configurée dans ce projet. Mais les Server Routes sont un mécanisme différent.

**Action** : Si un `import { getAdapter }` dans un fichier `routes/api/*.ts` génère une erreur au build, utiliser l'import dynamique ou déplacer la logique dans un fichier explicitement server-only :

```typescript
// Option A — import dynamique (workaround si nécessaire)
GET: async () => {
  const { getAdapter } = await import("../../server/violetAdapter");
  const result = await getAdapter().listMerchants();
  return Response.json(result.data ?? []);
},
```

Dans la pratique, ce problème ne se posera probablement pas (les Server Routes sont exécutées uniquement côté serveur), mais il vaut mieux le savoir avant.

---

### Recommandation 4 — Ajuster l'estimation Phase 3

**Observation** : La Phase 3 liste 13 fichiers à migrer, dont `cart.tsx`, `checkout.tsx`, `AuthContext.tsx` et `order/confirmation.tsx` qui appellent tous la même EF `cart` (1 534 lignes, multiples opérations). Ces 4 fichiers représentent probablement 60% de l'effort réel de la Phase 3.

**Estimation révisée** :

| Groupe | Fichiers | Durée révisée |
|---|---|---|
| Endpoints publics (merchants, products, collections, exchange-rates) | 7 fichiers | ~45 min |
| Validation auth + `apiClient.ts` complet | — | ~30 min |
| Cart/Checkout/Orders/AuthContext | 6 fichiers | ~2–3 h |
| **Total Phase 3 révisé** | | **~3–4 h** |

La durée totale du projet passe de **~½ journée** à **~¾ journée** dans le cas nominal, et **1 journée** si le cart réserve des surprises. Raisonnable pour l'élimination de 7 222 lignes de code dupliqué.
