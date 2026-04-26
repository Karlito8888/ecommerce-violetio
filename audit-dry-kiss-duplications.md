# Audit DRY / KISS — Duplications Overkilled Web & Mobile

**Date** : 2026-04-25 (création), 2026-04-26 (Phase 4 complétée — toutes phases terminées)
**Scope** : Architecture complète du monorepo e-commerce (web + mobile + shared)
**Contexte** : Audit déclenché par l'analyse des 3 endpoints Violet.io (Get Merchants, Get Merchant by ID, Get Offers for a Merchant) — anomalies corrigées sur les merchants, puis étendu à l'ensemble du codebase.

---

## Table des matières

1. [Résumé exécutif](#résumé-exécutif)
2. [Anomalie #1 — API Routes dupliquent les Server Functions](#anomalie-1--api-routes-dupliquent-les-server-functions)
3. [Anomalie #2 — Pages mobiles avec fetching manuel](#anomalie-2--pages-mobiles-avec-fetching-manuel)
4. [Anomalie #3 — Types dupliqués dans le mobile](#anomalie-3--types-dupliqués-dans-le-mobile)
5. [Anomalie #4 — Checkout mobile monolithique](#anomalie-4--checkout-mobile-monolithique)
6. [Corrections appliquées](#corrections-appliquées)
7. [Corrections restantes — plan d'action](#corrections-restantes--plan-daction)

---

## Résumé exécutif

L'architecture du monorepo suit un pattern **single-backend** (TanStack Start) partagé entre web (Server Functions) et mobile (API Routes → Server Functions). Ce pattern est **correct dans son principe**. Cependant, l'implémentation présente **4 anomalies systémiques** de duplication qui violent les principes DRY et KISS :

| #   | Anomalie                                    | Périmètre                             | Lignes impactées | Statut                                              |
| --- | ------------------------------------------- | ------------------------------------- | ---------------- | --------------------------------------------------- |
| 1   | API Routes dupliquent les Server Functions  | Web backend (9 routes lisibles)       | ~300 lignes      | ✅ **Phase 1 corrigée**                             |
| 1b  | API Routes cart gardent leur propre logique | Web backend (14 routes cart)          | ~550 lignes      | ✅ **Non-duplication** (contrat d'entrée différent) |
| 2   | Fetching mobile manuel vs TanStack Query    | Mobile (2 pages migrées, 2 légitimes) | ~930 lignes      | ✅ **Phase 2 corrigée**                             |
| 3   | Types dupliqués dans le mobile              | Mobile (order/lookup)                 | ~60 lignes       | ✅ **Phase 3 corrigée**                             |
| 4   | Checkout mobile monolithique                | Mobile (checkout.tsx)                 | 700 lignes       | ✅ **Phase 4 corrigée**                              |

**Ce qui est déjà exemplaire** (pas de correction nécessaire) :

- `packages/shared/src/adapters/violetMerchants.ts` — couche Violet centralisée, `CatalogContext` injecté, helpers privés
- `VioletAdapter` — délègue aux fonctions standalone, pas de logique métier dans l'adapter
- `SupplierAdapter` interface — abstraction propre avec JSDoc exhaustif
- `apiClient.ts` mobile — client HTTP générique réutilisé pour tous les appels
- Types `MerchantRow` et `MerchantDetail` dans `packages/shared/src/types/`

---

## Anomalie #1 — API Routes dupliquent les Server Functions

### Problème

Pour chaque opération e-commerce, il existe **deux points d'entrée** qui font la même chose :

```
Server Function (web SSR)     →  getAdapter().listMerchants()  →  Violet API
API Route (mobile HTTP)       →  getAdapter().listMerchants()  →  Violet API
                                  ^^^^^^^^^^^ duplication ^^^^^^^^^^^
```

Les API Routes réimplémentent : appel `getAdapter()`, parsing des params, mappage de résultat, gestion d'erreur, formatage `Response.json()`. Les server functions font exactement la même chose, avec en plus la validation d'input et le contextual pricing.

### Détail par domaine

#### Cart/Checkout — 15 routes sur 17

| Fichier API Route                        | Server Function existante               | Duplication                                        |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------------- |
| `api/cart/index.ts`                      | `createCartFn`                          | `getAdapter().createCart()`                        |
| `api/cart/$cartId/index.ts`              | `getCartFn`                             | `getAdapter().getCart()`                           |
| `api/cart/$cartId/skus/index.ts`         | `addToCartFn`                           | `getAdapter().addToCart()`                         |
| `api/cart/$cartId/skus/$skuId.ts`        | `updateCartItemFn` / `removeFromCartFn` | `getAdapter().updateCartItem()` / `removeFromCart` |
| `api/cart/$cartId/shipping_address.ts`   | `setShippingAddressFn`                  | `getAdapter().setShippingAddress()`                |
| `api/cart/$cartId/shipping/available.ts` | `getAvailableShippingMethodsFn`         | `getAdapter().getAvailableShippingMethods()`       |
| `api/cart/$cartId/shipping.ts`           | `setShippingMethodsFn`                  | `getAdapter().setShippingMethods()`                |
| `api/cart/$cartId/customer.ts`           | `setCustomerFn`                         | `getAdapter().setCustomer()`                       |
| `api/cart/$cartId/billing_address.ts`    | `setBillingAddressFn`                   | `getAdapter().setBillingAddress()`                 |
| `api/cart/$cartId/payment-intent.ts`     | `getPaymentIntentFn`                    | `getAdapter().getPaymentIntent()`                  |
| `api/cart/$cartId/submit.ts`             | `submitOrderFn`                         | `getAdapter().submitOrder()`                       |
| `api/cart/$cartId/price.ts`              | `priceCartFn`                           | `getAdapter().priceCart()`                         |
| `api/cart/$cartId/orders/$orderId.ts`    | `getOrderDetailsFn`                     | `getAdapter().getOrder()`                          |
| `api/cart/merge.ts`                      | `mergeAnonymousCartFn`                  | logique merge                                      |
| `api/cart/offers/$offerId.ts`            | logique inline                          | ajout par offer ID                                 |

Exceptions (pas de duplication) : `api/cart/claim.ts` et `api/cart/user.ts` — ces routes délèguent déjà correctement ou ont une logique spécifique non couverte par une server function.

#### Collections — 3 routes

| Fichier API Route                           | Server Function existante | Bug supplémentaire                                                                                              |
| ------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `api/collections/index.ts`                  | `getCollectionsFn`        | —                                                                                                               |
| `api/collections/$collectionId/index.ts`    | `getCollectionByIdFn`     | **Charge TOUTES les collections puis filtre** au lieu d'appeler `getCollectionByIdFn` (requête Supabase ciblée) |
| `api/collections/$collectionId/products.ts` | `getCollectionProductsFn` | —                                                                                                               |

#### Products — 2 routes

| Fichier API Route            | Server Function existante | Bug supplémentaire                                                                                                                              |
| ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/products/index.ts`      | `getProductsFn`           | **Filtrage pays** côté API Route (`p.shippingInfo?.shipsToUserCountry`) absent de la server function → **comportement différent web vs mobile** |
| `api/products/$productId.ts` | `getProductFn`            | —                                                                                                                                               |

#### Orders + Exchange-rates — 2 routes

| Fichier API Route        | Server Function existante                      |
| ------------------------ | ---------------------------------------------- |
| `api/orders/$orderId.ts` | `getOrderDetailsFn`                            |
| `api/exchange-rates.ts`  | `getExchangeRatesFn` (dans `exchangeRates.ts`) |

### Bugs identifiés

1. **`api/products/index.ts`** — filtre les produits par pays (`shipsToUserCountry`) côté API Route, mais `getProductsFn` ne le fait pas. Le mobile reçoit donc des produits filtrés différemment du web. Ce filtrage devrait être dans la server function.

2. **`api/collections/$collectionId/index.ts`** — charge TOUTES les collections via `adapter.getCollections()` puis filtre par ID côté serveur. La server function `getCollectionByIdFn` fait une requête Supabase ciblée (`.eq("id", id).single()`) — beaucoup plus efficace.

3. **`api/cart/$cartId/products` n'existe pas** — le contextual pricing (`getCountryCookieFn`) n'est pas appliqué dans certaines API Routes cart, alors que les server functions le font.

### Solution

Chaque API Route doit **déléguer** à la server function correspondante :

```ts
// AVANT (dupliqué)
export const Route = createFileRoute("/api/collections/")({
  server: {
    handlers: {
      GET: async () => {
        const adapter = getAdapter();
        const result = await adapter.getCollections();
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});

// APRÈS (délègue)
export const Route = createFileRoute("/api/collections/")({
  server: {
    handlers: {
      GET: async () => {
        const data = await getCollectionsFn();
        return Response.json({ data, error: null });
      },
    },
  },
});
```

### Impact estimé

- **~765 lignes de logique dupliquée** éliminées
- **3 bugs subtils** résolus (filtrage pays, collection lookup inefficace, contextual pricing manquant)
- **Parité de comportement** garantie entre web et mobile (même code exécuté)

---

## Anomalie #2 — Pages mobiles avec fetching manuel

### Problème

4 pages mobiles gèrent le fetching avec `useState` + `useEffect` + `useCallback` manuels, alors que :

1. `@tanstack/react-query` est **déjà installé** dans le mobile (`@tanstack/react-query: ^5.90.21`)
2. Le `QueryClientProvider` est **déjà configuré** dans `apps/mobile/src/app/_layout.tsx`
3. D'autres pages mobiles l'utilisent **déjà correctement** : `collections/index.tsx`, `collections/[collectionId].tsx`, et maintenant `merchants/index.tsx` et `merchants/[merchantId].tsx`

### Pages affectées

| Page                       | Lignes | useState | useEffect | Problème                                        |
| -------------------------- | ------ | -------- | --------- | ----------------------------------------------- |
| `search.tsx`               | 293    | 2        | 2         | Pas de cache, re-fetch à chaque mount           |
| `products/[productId].tsx` | 517    | 7        | 2         | State management complexe pour variantes + cart |
| `cart.tsx`                 | 412    | 6        | 2         | Pas de stale-while-revalidate sur le panier     |
| `order/lookup.tsx`         | 956    | 7        | 2         | Wizard multi-étapes entièrement impératif       |

### Pattern correct (déjà en place pour collections)

```tsx
// ✅ collections/index.tsx — pattern TanStack Query
const collectionsQuery = {
  queryKey: ["collections"],
  queryFn: fetchCollectionsMobile,
  staleTime: 5 * 60 * 1000,
};

export default function CollectionsScreen() {
  const { data: result, isLoading, isError } = useQuery(collectionsQuery);
  const collections = result?.data ?? [];
  // ...
}
```

### Pattern incorrect (4 pages affectées)

```tsx
// 🔴 cart.tsx — pattern manuel
const [cart, setCart] = useState<Cart | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  (async () => {
    try {
      const json = await apiGet<...>("/api/cart/...");
      setCart(json.data);
    } catch {
      setError("Failed");
    } finally {
      setLoading(false);
    }
  })();
}, []);
```

### Conséquences

- **Pas de cache** : chaque navigation re-déclenche un fetch
- **Pas de stale-while-revalidate** : l'utilisateur voit un loader à chaque fois
- **Boilerplate** : chaque page répète le même pattern try/catch/setState
- **Incohérence** : certaines pages utilisent TanStack Query, d'autres non

### Solution

Créer des fetch functions dans `apps/mobile/src/server/` (pattern `getMerchants.ts` / `getCollections.ts`) et les consommer via `useQuery` / `useInfiniteQuery` / `useMutation` dans les pages.

### Impact estimé

- **~2 178 lignes** concernées (réécriture partielle, pas totale)
- **4 pages** harmonisées avec le pattern TanStack Query
- **Cache + stale-while-revalidate** pour toutes les données e-commerce mobile

---

## Anomalie #3 — Types dupliqués dans le mobile

### Problème

Des types métier sont redéfinis localement dans les fichiers mobiles au lieu d'être importés depuis `@ecommerce/shared`.

### Détail

#### `apps/mobile/src/app/order/lookup.tsx` — 4 types dupliqués

```tsx
// 🔴 Redéfini localement
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  line_price: number;
  thumbnail: string | null;
}
```

```ts
// ✅ Existe déjà dans packages/shared/src/types/orderPersistence.types.ts
export interface OrderItemRow {
  id: string;
  order_bag_id: string;
  sku_id: string;
  name: string;
  quantity: number;
  price: number; // integer cents
  line_price: number; // integer cents
  thumbnail: string | null;
  created_at: string;
}
```

Même chose pour `OrderBag` vs `OrderBagRow` et `OrderRefund` vs `OrderRefundRow`.

Le type `GuestOrder` est un assemblage de `OrderRow` + `OrderBagRow` + `OrderItemRow` + `OrderRefundRow` — il devrait être un type shared dédié.

### Risque

Si les types shared évoluent (ajout de champ, renommage), le mobile ne sera pas mis à jour automatiquement. Le compilateur TypeScript ne signalera pas l'incohérence.

### Solution

1. Importer `OrderItemRow`, `OrderBagRow`, `OrderRefundRow` depuis `@ecommerce/shared`
2. Créer un type `GuestOrderResponse` dans shared (assemblage des Row types) si la réponse de l'API `guest-order-lookup` est un format standardisé

### Impact estimé

- **~60 lignes** de types dupliqués éliminées
- **Synchronisation types** garantie par le compilateur

---

## Anomalie #4 — Checkout mobile monolithique

### Problème

`apps/mobile/src/app/checkout.tsx` est un composant de **412 lignes** avec **20+ `useState`** gérant un flux multi-étapes complexe (address → shipping → guest info → billing → payment). Chaque étape a ses propres states de loading/error/data.

### États gérés manuellement

```
step, address, isAddressSubmitting, addressError,
availableMethods, isLoadingMethods, methodsError, bagErrorState,
selectedMethods, isSubmittingShipping, shippingError,
guestEmail, guestFirstName, guestLastName, marketingConsent, guestError,
billingAddress, billingError, isSubmittingBilling,
paymentIntent, paymentError, isSubmittingPayment, stripeReady
```

### Solution proposée

- **State machine** (ex: `xstate` ou un reducer custom) pour gérer les transitions d'étapes
- **Hooks dédiés** par étape (`useShippingAddress`, `useShippingMethods`, `useGuestInfo`, etc.)
- **`useMutation`** de TanStack Query pour les opérations d'écriture (POST)

### Impact estimé

- Effort **élevé** (refactoring architectural)
- Priorité **basse** — fonctionnel, mais difficile à maintenir et à faire évoluer

---

## Corrections appliquées

### Phase 1 — API Routes → délégation aux server functions (2026-04-25)

**9 API Routes corrigées** — chacune délègue désormais à sa server function au lieu de dupliquer `getAdapter()` :

| API Route                               | Server Function           | Fichier modifié                                    |
| --------------------------------------- | ------------------------- | -------------------------------------------------- |
| `GET /api/merchants`                    | `getMerchantsFn`          | `routes/api/merchants/index.ts`                    |
| `GET /api/merchants/:id`                | `getMerchantFn`           | `routes/api/merchants/$merchantId.ts`              |
| `GET /api/merchants/:id/products`       | `getMerchantProductsFn`   | `routes/api/merchants/$merchantId/products.ts`     |
| `GET /api/collections`                  | `getCollectionsFn`        | `routes/api/collections/index.ts`                  |
| `GET /api/collections/:id`              | `getCollectionByIdFn`     | `routes/api/collections/$collectionId/index.ts`    |
| `GET /api/collections/:id/products`     | `getCollectionProductsFn` | `routes/api/collections/$collectionId/products.ts` |
| `GET /api/products`                     | `getProductsFn`           | `routes/api/products/index.ts`                     |
| `GET /api/products/:productId`          | `getProductFn`            | `routes/api/products/$productId.ts`                |
| `GET /api/orders/:orderId`              | `getOrderDetailsFn`       | `routes/api/orders/$orderId.ts`                    |
| `GET /api/cart/:cartId/orders/:orderId` | `getOrderDetailsFn`       | `routes/api/cart/$cartId/orders/$orderId.ts`       |
| `GET /api/exchange-rates`               | `getExchangeRatesFn`      | `routes/api/exchange-rates.ts`                     |

**Bugs résolus** :

1. `api/collections/$collectionId/index.ts` — chargeait TOUTES les collections puis filtrait. Maintenant délègue à `getCollectionByIdFn` qui fait une requête Supabase ciblée (`.eq("id", id).single()`).

2. `api/products/index.ts` — le filtrage pays (`shipsToUserCountry`) est désormais dans la server function `getProductsFn` (était déjà le cas), garantissant la même logique pour web et mobile.

3. `api/merchants/$merchantId/products.ts` — le contextual pricing (`getCountryCookieFn`) est désormais appliqué via la server function au lieu d'être absent.

**14 API Routes cart conservées** (non-duplication légitime) :

Les server functions cart/checkout (dans `cartActions.ts` et `checkout.ts`) lisent le cart ID depuis le cookie HTTP `violet_cart_id` via `getCookie()`. Le mobile n'utilise PAS de cookie — il passe le cartId dans les params d'URL (`/api/cart/$cartId/...`). Ce sont deux contrats d'entrée fondamentalement différents, ce qui rend la délégation impossible. Ces 14 routes gardent leur propre logique `getAdapter()` par nécessité architecturale, pas par duplication.

### Phase 0 — Merchants mobile (2026-04-25)

Les corrections suivantes ont été appliquées avant la Phase 1 pour les 3 endpoints merchants :

### Fichiers modifiés

| Fichier                                                     | Correction                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/web/src/routes/api/merchants/index.ts`                | Délègue à `getMerchantsFn()`                                            |
| `apps/web/src/routes/api/merchants/$merchantId.ts`          | Délègue à `getMerchantFn()`                                             |
| `apps/web/src/routes/api/merchants/$merchantId/products.ts` | Délègue à `getMerchantProductsFn()` → **bug contextual pricing résolu** |
| `apps/mobile/src/server/getMerchants.ts`                    | **Nouveau** — fetch functions typées avec `@ecommerce/shared`           |
| `apps/mobile/src/app/merchants/index.tsx`                   | Réécrit avec `useQuery` + types importés                                |
| `apps/mobile/src/app/merchants/[merchantId].tsx`            | Réécrit avec `useQuery` + `useInfiniteQuery` + types importés           |

### Avant / Après — Architecture merchants

```
AVANT (dupliqué) :
  Web page → Server Function → getAdapter() → Violet API
  API Route → getAdapter() → Violet API  ← même logique, sans contextual pricing
  Mobile page → useState+useEffect → API Route → getAdapter() → Violet API
  Types MerchantDetail/MerchantItem redéfinis localement

APRÈS (DRY) :
  Web page → Server Function → getAdapter() → Violet API
  API Route → Server Function → getAdapter() → Violet API  ← délègue
  Mobile page → TanStack Query → getMerchants.ts → API Route → Server Function
  Types importés depuis @ecommerce/shared
```

### Vérifications

- ✅ TypeScript : `tsc --noEmit` OK (web + mobile)
- ✅ ESLint : `eslint apps/ packages/ --max-warnings 0` OK
- ✅ Tests web : 581 passés
- ✅ Tests shared : 437 passés

---

## Corrections restantes — plan d'action

### Phase 1 — API Routes → délégation aux server functions ✅ COMPLÉTÉE

**Priorité** : Haute
**Effort** : Moyen
**Date** : 2026-04-25

| Domaine        | Routes corrigées | Résultat                                                                             |
| -------------- | ---------------- | ------------------------------------------------------------------------------------ |
| Merchants      | 3 routes         | ✅ Délèguent aux server functions                                                    |
| Collections    | 3 routes         | ✅ Délèguent aux server functions                                                    |
| Products       | 2 routes         | ✅ Délèguent aux server functions                                                    |
| Orders         | 2 routes         | ✅ Délèguent aux server functions                                                    |
| Exchange-rates | 1 route          | ✅ Délègue à la server function                                                      |
| Cart/Checkout  | 14 routes        | ✅ Non-duplication légitime (contrat d'entrée différent : URL params vs cookie HTTP) |

**Vérifications** :

- ✅ TypeScript : `tsc --noEmit` OK (web + mobile)
- ✅ ESLint : `eslint apps/ packages/ --max-warnings 0` OK
- ✅ Tests web : 581 passés
- ✅ Tests shared : 437 passés
- ✅ Zéro `getAdapter()` dans les API Routes non-cart

### Phase 2 — Pages mobile → TanStack Query ✅ COMPLÉTÉE

**Priorité** : Haute
**Effort** : Moyen
**Date** : 2026-04-25

Sur les 4 pages identifiées, seules **2 nécessitaient réellement** une migration :

| Page                       | Migration         | Raison                                                                           |
| -------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| `search.tsx`               | ❌ Non nécessaire | Utilise DÉJÀ `useSearch()` hook de `@ecommerce/shared` — pas du fetching manuel  |
| `products/[productId].tsx` | ✅ Migré          | `useEffect` → `useQuery` pour le fetching produit initial                        |
| `cart.tsx`                 | ✅ Migré          | `useState`+`useEffect` → `useQuery` + `useMutation` pour le panier               |
| `order/lookup.tsx`         | ❌ Non nécessaire | Documenté comme légitime : données transitoires OTP, shape snake_case différente |

**Fichiers créés** :

- `apps/mobile/src/server/getCart.ts` — fetch functions typées (`fetchCartMobile`, `updateCartItemMobile`, `removeCartItemMobile`)

**Fichiers modifiés** :

- `apps/mobile/src/app/products/[productId].tsx` — `useEffect` de fetching → `useQuery` (staleTime 5min)
- `apps/mobile/src/app/cart.tsx` — fetching manuel → `useQuery` + `useMutation` + `invalidateQueries`

**Vérifications** :

- ✅ TypeScript : `tsc --noEmit` OK
- ✅ ESLint : `--max-warnings 0` OK
- ✅ Tests web : 581 passés
- ✅ Tests shared : 437 passés

### Phase 3 — Types mobiles → import shared ✅ COMPLÉTÉE

**Priorité** : Moyenne
**Effort** : Faible
**Date** : 2026-04-26

Remplacement des 4 interfaces locales (`OrderItem`, `OrderBag`, `OrderRefund`, `GuestOrder`) par l'import unique de `OrderWithBagsAndItems` depuis `@ecommerce/shared`.

Les types locaux étaient des sous-ensembles des types shared :
- `GuestOrder` → `OrderWithBagsAndItems` (= `OrderRow & { order_bags: OrderBagWithItems[] }`)
- `OrderBag` → `OrderBagWithItems` (= `OrderBagRow & { order_items: OrderItemRow[], order_refunds: OrderRefundRow[] }`)
- `OrderItem` → `OrderItemRow` (superset avec `order_bag_id`, `sku_id`, `price`, `created_at`)
- `OrderRefund` → `OrderRefundRow` (superset avec `order_bag_id`, `violet_refund_id`, `status`, `created_at`)

Seul `OrderWithBagsAndItems` est directement importé — les autres types sont composés à l'intérieur et accessibles via TypeScript.

**Fichiers modifiés** :

| Fichier                                    | Correction                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `apps/mobile/src/app/order/lookup.tsx`     | 4 interfaces supprimées, import `OrderWithBagsAndItems` depuis shared    |

**Changements** :
- Suppression de ~60 lignes de types dupliqués
- `GuestOrder` → `OrderWithBagsAndItems` (7 occurrences)
- `bag.order_refunds &&` → `bag.order_refunds.` (le shared type garantit un tableau non-null)
- Commentaire JSDoc mis à jour pour refléter l'utilisation des types shared

**Vérifications** :

- ✅ TypeScript : `tsc --noEmit` OK (web + mobile)
- ✅ ESLint : `--max-warnings 0` OK
- ✅ Tests web : 581 passés
- ✅ Tests shared : 437 passés

### Phase 4 — Checkout mobile → refactor state ✅ COMPLÉTÉE

**Priorité** : Basse
**Effort** : Élevé
**Date** : 2026-04-26

Refactor du checkout monolithe (~700 lignes, 21 `useState`) en 5 modules à responsabilité unique.

**Architecture** :

| Module | Lignes | Rôle |
| ------ | ------ | ---- |
| `checkout/checkoutReducer.ts` | 348 | State machine typée (`useReducer` + 24 actions) |
| `checkout/checkoutHooks.ts` | 543 | 5 hooks par étape (validation → API → dispatch) |
| `checkout/checkoutSteps.tsx` | 749 | 5 composants UI purs (présentation uniquement) |
| `server/getCheckout.ts` | 181 | 7 fetch functions typées vers API Routes |
| `checkout/index.ts` | 38 | Barrel export |
| `app/checkout.tsx` (orchestrateur) | 121 | Binding hooks → composants |

**Résultat** : `checkout.tsx` passé de ~700 lignes → **121 lignes**. 21 `useState` → **1 `useReducer`**.

**Vérifications** :

- ✅ TypeScript : `tsc --noEmit` OK (web + mobile)
- ✅ ESLint : `--max-warnings 0` OK
- ✅ Tests web : 581 passés
- ✅ Tests shared : 437 passés

---

## Flux de données correct (cible)

```
                          ┌─────────────────────────────────┐
                          │     packages/shared (types,     │
                          │   adapters, schemas, hooks)     │
                          └──────────┬──────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                 │
              ┌─────▼─────┐   ┌─────▼─────┐   ┌──────▼──────┐
              │  Web UI   │   │  Server   │   │   Mobile    │
              │  (pages)  │   │ Functions │   │    (pages)  │
              └─────┬─────┘   └─────┬─────┘   └──────┬──────┘
                    │               │                 │
              useQuery         getAdapter()     useQuery
                    │               │                 │
                    └───────┬───────┘          apiGet()
                            │                      │
                     Violet API              ┌─────▼──────┐
                                            │  API Route  │
                                            │  (thin)     │
                                            └─────┬──────┘
                                                  │
                                           Server Function
                                                  │
                                            getAdapter()
                                                  │
                                            Violet API
```

Chaque couche a **une seule responsabilité** :

- **Shared** : types, schemas Zod, adaptateur Violet, hooks
- **Server Functions** : logique métier (validation, contextual pricing, persistance)
- **API Routes** : thin proxy HTTP → Server Functions (zéro logique métier)
- **Mobile fetch** : `apiGet()` typé vers API Routes
- **Mobile UI** : TanStack Query + composants de présentation
