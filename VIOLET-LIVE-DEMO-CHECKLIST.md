# 🟣 Violet.io — Live Demo Checklist

> **Objectif** : Ce document reprend **exhaustivement** toutes les étapes que l'équipe Violet.io vérifiera lors du **Go-Live Demo** (vidéo call). Chaque section correspond à un domaine fonctionnel que Violet va auditer.
>
> **Source** : Documentation officielle Violet.io — `https://docs.violet.io/llms.txt` + pages détaillées.
>
> **Référence live mode requirements** : `https://docs.violet.io/prism/payments/setup/live-mode/live-mode-requirements.md`

---

## Légende des statuts

| Icône | Signification |
|-------|---------------|
| ✅ | **Implémenté et vérifié dans le code** — prêt pour le demo |
| 🔶 | **Implémenté dans le code mais pas encore testé end-to-end** — à valider |
| ❌ | **Non implémenté** — nécessite du dev |
| ❓ | **Configuration / externe au code** — à vérifier manuellement |

---

## Sommaire

1. [Phase 0 — Prérequis & Configuration Globale](#phase-0--prérequis--configuration-globale)
2. [Phase 1 — Authentification & Token Management](#phase-1--authentification--token-management)
3. [Phase 2 — Violet Connect & Onboarding Merchants](#phase-2--violet-connect--onboarding-merchants)
4. [Phase 3 — Catalogue (Offers, SKUs, Collections)](#phase-3--catalogue-offers-skus-collections)
5. [Phase 4 — Checkout Itératif (Standard)](#phase-4--checkout-itératif-standard)
6. [Phase 5 — Direct Order Submission (DOS)](#phase-5--direct-order-submission-dos)
7. [Phase 6 — Paiements & Stripe Integration](#phase-6--paiements--stripe-integration)
8. [Phase 7 — Webhooks](#phase-7--webhooks)
9. [Phase 8 — Order Management & Lifecycle](#phase-8--order-management--lifecycle)
10. [Phase 9 — Distributions, Transfers & Payouts](#phase-9--distributions-transfers--payouts)
11. [Phase 10 — Payment Settings (Capture, Transfer, Tax)](#phase-10--payment-settings-capture-transfer-tax)
12. [Phase 11 — Gestion des Erreurs & Edge Cases](#phase-11--gestion-des-erreurs--edge-cases)
13. [Phase 12 — Channel Dashboard & Merchant Dashboard](#phase-12--channel-dashboard--merchant-dashboard)
14. [Récapitulatif des gaps prioritaires](#récapitulatif-des-gaps-prioritaires)

---

## Phase 0 — Prérequis & Configuration Globale

> **Réf** : Live Mode Requirements — `https://docs.violet.io/prism/payments/setup/live-mode/live-mode-requirements.md`

### 0.1 Contract & Account

- ❓ **Contrat signé avec Violet** — Accord formal entre votre business et Violet
- ❓ **Compte Channel Dashboard créé** — `https://channel.violet.io` avec Org slug configuré
- ✅ **Application Violet créée** — App ID + App Secret présents dans `.env.example` (`VIOLET_APP_ID`, `VIOLET_APP_SECRET`, `VIOLET_USERNAME`, `VIOLET_PASSWORD`)
- ❌ **Mode Live activé** — Actuellement en `sandbox-api.violet.io` (Test Mode). Live activé uniquement après le demo réussi
- ❓ **Team configurée** — Owner identifié dans le Channel Dashboard (seul son username/password génère un token)

### 0.2 Stripe Platform Account

> ⚠️ **BLOCKER #1** — C'est le prérequis le plus critique. Sans Stripe Platform configuré, pas de Test Mode, pas de Live Mode.

- ❓ **Compte Stripe Platform créé** — `https://stripe.com`
- ❓ **Stripe Connect activé** sur le compte Platform
  - "Buyers will purchase from you" sélectionné
  - "Payouts will be split between sellers" sélectionné
  - Industry "E-commerce Products" sélectionné
  - "Onboarding hosted by Stripe" (Stripe Express)
  - "Express Dashboards" pour le merchant management
  - Onboarding interface personnalisé avec votre branding
- ❓ **Stripe Account ID** (`acct_...`) noté et stocké
- ❓ **Stripe Publishable Key** (Test + Live) — Variables `VITE_STRIPE_PUBLISHABLE_KEY` et `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` présentes dans `.env.example` mais valeurs à vérifier
- ❓ **Restricted Keys** générés :
  - Clé `violet-test` avec les scopes requis (Test Mode)
  - Clé `violet-live` avec les scopes requis (Live Mode)
  - Scopes critiques : `PaymentIntents: Write`, `PaymentMethods: Write`, `Charges: Write`, `Customers: Write`, `Tokens: Write`, `Connect: All Write`, `Webhook Endpoints: Write`, `Payouts: Read`, `Balance transaction sources: Read`, `Subscriptions: Write`
- ❓ **OAuth Stripe configuré** (si Stripe Standard accounts pour merchants) :
  - Redirect URIs ajoutés : `https://connect.violet.io/payments/oauth/complete`, `https://merchant.violet.io/settings/payouts`, `https://channel.violet.io/settings/payouts`
- ❓ **Credentials chiffrés et partagés avec Violet** via `https://violetio.github.io/credentials-encryptor/encrypt-stripe-creds.html`

### 0.3 Environments

- ✅ **Comprendre les 3 environnements** — Architecture documentée dans le projet
- ✅ **Endpoints corrects par environnement** — `VIOLET_API_BASE` configuré à `https://sandbox-api.violet.io/v1` dans `.env.example`
- ❓ **App Secret différent par mode** — À vérifier dans le Channel Dashboard (toggle Test/Live)

### 0.4 Violet Connect Setup

- ❓ **Violet Connect configuré** — URL personnalisée, nom de l'app, description, logo
- ❓ **Redirect URL configurée** — Où rediriger les merchants après onboarding
- ❓ **Plateformes supportées définies** — Liste des e-com platforms à afficher dans Violet Connect
- ❓ **Shopify Pre-Registration** (si applicable) — Single-merchant custom apps configurés dans le Channel Dashboard

---

## Phase 1 — Authentification & Token Management

> **Réf** : `https://docs.violet.io/prism/overview/postman-login.md` + `https://docs.violet.io/concepts/overview.md`
>
> **Code audité** : `convex/lib/violetApi.ts` + `apps/web/src/server/violetAdapter.ts`

### Ce que Violet va vérifier :

- ✅ **Login API fonctionnel** — `violetLogin()` dans `convex/lib/violetApi.ts` : `POST /login` avec `X-Violet-App-Id`, `X-Violet-App-Secret`, `username`, `password`. Retourne `token` + `refresh_token`
- ✅ **Headers d'authentification sur chaque requête** — `getAppHeaders()` dans `violetApi.ts` fournit `X-Violet-App-Id` + `X-Violet-App-Secret` + `X-Violet-Token` sur chaque `violetFetch()`
- ✅ **Token Refresh fonctionnel** — `violetRefreshToken()` implémenté avec `refresh_token` pour obtenir un nouveau token sans re-saisir credentials
- 🔶 **Seul l'Owner peut générer un token** — Le code utilise les credentials stockés en env vars. À vérifier : que ces credentials correspondent bien à l'Owner de l'app
- ✅ **Gestion de l'expiration du token** — Auto-refresh 5 minutes avant expiry (`TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000`)
- ✅ **Bon App Secret selon l'environnement** — `VIOLET_APP_SECRET` lu depuis `process.env`. La valeur change automatiquement entre Test/Live via les env vars
- ✅ **Retry sur 401** — Si un appel reçoit 401, le token est invalidé et un nouveau login est tenté automatiquement
- ✅ **Workaround special chars** — `escapePasswordForViolet()` gère les `!` et caractères spéciaux dans le password (bug connu Violet)

---

## Phase 2 — Violet Connect & Onboarding Merchants

> **Réf** : `https://docs.violet.io/prism/violet-connect.md` + `https://docs.violet.io/prism/violet-connect/setup.md`
>
> ⚠️ **Pas de code spécifique trouvé** — L'onboarding se fait via le Channel Dashboard Violet, pas via votre app.

### Ce que Violet va vérifier :

- ❓ **Violet Connect URL accessible** — À vérifier dans le Channel Dashboard
- ❓ **Branding personnalisé** visible — Logo, nom de l'app, description
- ❓ **Flux d'onboarding complet** :
  1. Merchant sélectionne sa plateforme e-commerce
  2. Merchant entre ses credentials de store
  3. Violet Connect vérifie la connexion
  4. Merchant configure son Stripe Connect account (Express) pour les payouts
  5. Commission rate configuré
  6. Merchant redirigé vers la redirect URL
- ❓ **Merchant visible dans le Channel Dashboard** après onboarding
- ❓ **Catalogue sync démarré** — Les produits du merchant commencent à se synchroniser
- ❓ **Connection Health vérifiable** — `GET /v1/operations/connection/health`
- ❓ **Merchant Configurations accessibles** — `GET /v1/merchants/{merchant_id}/configuration`
- ❓ **Commission rate par merchant** — Défini via `POST /v1/apps/{app_id}/merchants/{merchant_id}/commission-rate`
- ❓ **Shopify Pre-Registration** (si Shopify merchants) — Single-merchant custom apps configurés

---

## Phase 3 — Catalogue (Offers, SKUs, Collections)

> **Réf** : `https://docs.violet.io/prism/catalog.md` + `https://docs.violet.io/prism/overview/interact-with-catalogs.md`
>
> **Code audité** : `apps/web/src/routes/api/products/`, `api/categories/`, `api/collections/`, `api/merchants/`, `apps/web/src/server/getProducts.ts`, `getMerchants.ts`, `getCollections.ts`

### Ce que Violet va vérifier :

- ✅ **Liste des Merchants connectés** — API route `GET /api/merchants` + server fn `getMerchants.ts`
- ✅ **Détail d'un Merchant** — API route `GET /api/merchants/$merchantId` + server fn `getMerchant.ts`
- ✅ **Offers (Produits) accessibles** :
  - `GET /api/products` — Toutes les offers (proxy vers Violet API)
  - `GET /api/merchants/$merchantId/products` — Offers par merchant
  - `GET /api/products/$productId` — Détail d'une offer
- 🔶 **Publishing Status géré** — Offers en statut `PUBLISHED` nécessaire. À vérifier que le code filtre ou gère l'erreur `offer_not_published` (code 2011)
- ✅ **SKUs accessibles** — Via les offres (SKUs embeddés dans les offers)
- ✅ **Categories** — API route `GET /api/categories`
- ✅ **Collections** — API routes `GET /api/collections`, `GET /api/collections/$collectionId`, `GET /api/collections/$collectionId/products`
- 🔶 **Media Transformations** — À vérifier si les URLs d'images utilisent le resizing dynamique Violet
- 🔶 **Pagination fonctionnelle** — À vérifier que les paramètres page/size sont passés à Violet

---

## Phase 4 — Checkout Itératif (Standard)

> **Réf** : `https://docs.violet.io/prism/overview/place-an-order.md` + `https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart.md`
>
> **Code audité** : `apps/web/src/routes/api/cart/` (25+ routes), `apps/web/src/server/checkout.ts`, `apps/web/src/server/cartActions.ts`, `apps/web/src/routes/checkout/`

#### Étape 4.1 — Créer un Cart

- ✅ **`POST /api/cart`** — API route avec support `skus`, `customer`, `walletBasedCheckout`
- ✅ **Cart créé avec statut `IN_PROGRESS`** — Géré par `createCartFn` dans `cartActions.ts`
- ✅ **Bags automatiquement créés** — Violet crée 1 bag par merchant automatiquement
- ✅ **`wallet_based_checkout: true`** — Supporté dans la route create cart (nécessaire pour Stripe Elements / Payment Intent)
- 🔶 **Erreur gérée** : Vérifier le champ `errors` dans la response (même avec status 200) — À confirmer dans le handler

#### Étape 4.2 — Ajouter/Modifier des Items

- ✅ **`POST /api/cart/$cartId/skus`** — Ajouter un SKU (route existante)
- ✅ **`PUT /api/cart/$cartId/skus/$skuId`** — Modifier quantité (route existante)
- ✅ **`DELETE /api/cart/$cartId/skus/$skuId`** — Supprimer un item (route existante)
- ✅ **Multi-merchant cart** — Géré automatiquement par Violet (bags séparés)

#### Étape 4.3 — Appliquer les infos Client

- ✅ **`POST /api/cart/$cartId/customer`** — Route existante, `customerInputSchema` validé par Zod
- ✅ **`POST /api/cart/$cartId/shipping_address`** — Route existante via `setShippingAddressFn`
- ✅ **`POST /api/cart/$cartId/billing_address`** — Route existante
- ✅ **`same_address: true`** supporté — Géré côté Violet API

#### Étape 4.4 — Obtenir les Shipping Methods

- ✅ **`GET /api/cart/$cartId/shipping/available`** — Route existante, retourne les méthodes par bag

#### Étape 4.5 — Appliquer les Shipping Methods

- ✅ **`POST /api/cart/$cartId/shipping`** — Route existante via `setShippingMethodsFn`
- ✅ **`setShippingMethodsFn`** dans `checkout.ts` — Applique `{ bag_id, shipping_id }` par bag

#### Étape 4.6 — Appliquer le Payment Method

- ✅ **`POST /api/cart/$cartId/payment-intent`** — Route existante pour appliquer le payment method Stripe
- ✅ **Stripe Elements** — Payment method géré via `PaymentElement` + `confirmPayment` côté client

#### Étape 4.7 — Pricing & Estimate

- ✅ **`POST /api/cart/$cartId/price`** — Route existante pour le pricing final
- 🔶 **`POST /api/carts/estimate`** — Estimation de prix — À vérifier si la route `api/exchange-rates` couvre ce besoin ou si un endpoint `/carts/estimate` séparé existe

#### Étape 4.8 — Submit le Cart

- ✅ **`POST /api/cart/$cartId/submit`** — Route existante via `submitOrderFn`
- ✅ **Order submit** — `useOrderSubmit.ts` gère le flux complet : submit → 3DS → retry → success
- ✅ **`app_order_id`** passé dans le submit — Traçabilité de l'order côté channel
- ✅ **Gestion `REQUIRES_ACTION`** — `useOrderSubmit.ts` : appelle `stripe.handleNextAction()` puis re-submit avec le même `appOrderId` pour idempotency
- ✅ **Gestion `REJECTED` / `CANCELED`** — Messages d'erreur dédiés via `ORDER_STATUS_MESSAGES`

#### Étape 4.9 — Quick Checkout (Optionnel)

- ✅ **Create Cart avec customer intégré** — `POST /api/cart` accepte `{ skus, customer }` dans le même appel
- 🔶 **Flux condensé complet** — Le code supporte les données combinées, mais le flux UI Quick Checkout n'est pas forcément séparé du standard
- ✅ **Wallet Checkout (Apple/Google Pay)** — `WalletCheckoutForm.tsx` : address + shipping + payment en 1 flow via `PaymentRequestButtonElement`

#### Étape 4.10 — Discounts

- ✅ **`POST /api/cart/$cartId/discounts`** — Route existante pour ajouter un discount
- ✅ **`DELETE /api/cart/$cartId/discounts/$discountId`** — Route existante pour retirer un discount
- 🔶 **Types de discounts** — À vérifier si synced (promo codes) et custom discounts sont supportés

#### Étape 4.11 — Cart Merge & Claim

- ✅ **`POST /api/cart/merge`** — Merge de carts (anonyme → authentifié)
- ✅ **`POST /api/cart/claim`** — Claim d'un cart anonyme après login
- ✅ **`GET /api/cart/user`** — Récupérer le cart de l'utilisateur courant

---

## Phase 5 — Direct Order Submission (DOS)

> **Réf** : `https://docs.violet.io/prism/checkout-guides/guides/direct-order-submission.md`

### Ce que Violet va vérifier :

- ❌ **`POST /v1/orders`** — Aucune route API trouvée pour le Direct Order Submission. Le projet utilise le checkout itératif standard exclusivement
- ❌ **Payload complet** (customer, bags, skus, shipping_method, tax, currency en 1 seul appel)
- ❌ **Line-item taxes** via `rates` array
- ❌ **Custom Discounts** dans DOS
- ❌ **Zero-dollar ($0) orders**
- ❌ **Pre-authorization Stripe** (Payment Intent `capture_method: manual`)

> 💡 **Note** : Le DOS n'est pas requis pour le live demo si le checkout standard fonctionne. C'est un flow alternatif pour les channels qui calculent leurs propres taxes et shipping. Le checkout itératif est le flow principal recommandé par Violet.

---

## Phase 6 — Paiements & Stripe Integration

> **Réf** : `https://docs.violet.io/prism/payments.md` + `https://docs.violet.io/prism/payments/payment-integrations/supported-providers/stripe/stripe-elements.md`
>
> **Code audité** : `apps/web/src/routes/checkout/PaymentForm.tsx`, `WalletCheckoutForm.tsx`, `useOrderSubmit.ts`, `useCheckoutState.ts`

#### 6.1 Stripe Elements Integration

- ✅ **Stripe.js installé** — `@stripe/react-stripe-js` + `@stripe/stripe-js` utilisés dans `PaymentForm.tsx`
- ✅ **`wallet_based_checkout: true`** — Supporté dans `POST /api/cart` pour obtenir le Payment Intent
- ✅ **Payment Intent Client Secret extrait** — Depuis `payment_transactions[].metadata.payment_intent_client_secret` dans la réponse cart
- ✅ **Elements Provider configuré** — `<Elements stripe={stripePromise} options={{ clientSecret }}>` dans le checkout page
- ✅ **PaymentElement rendu** — `<PaymentElement />` dans `PaymentForm.tsx`
- ✅ **`stripe.confirmPayment()`** — Appelé avec `redirect: "if_required"` avant submit à Violet
- ✅ **Submit du cart après confirmation Stripe** — `submitOrderFn` appelé dans le handler de confirmation
- ✅ **3D Secure / Next Action** — `useOrderSubmit.ts` : `stripe.handleNextAction({ clientSecret })` + re-submit avec même `appOrderId`

#### 6.2 Wallet Payments (Apple Pay / Google Pay)

- ✅ **WalletCheckoutForm** — `PaymentRequestButtonElement` avec le flux complet :
  - `shippingaddresschange` → apply customer address + fetch shipping methods
  - `shippingoptionchange` → apply selected shipping method
  - `paymentmethod` → confirm + submit avec `order_customer` contenant l'adresse complète
- 🔶 **Multi-merchant limitation** — Documentée dans le code : "Wallet sheet ne peut pas montrer différents shipping methods par merchant". Seul le 1er bag est affiché

#### 6.3 Payment Flow Validation

- 🔶 **PaymentTransaction visible dans la réponse** — À tester end-to-end. Le code le supporte mais il faut vérifier que `capture_status`, `transfer_status` remontent correctement
- ❓ **Payment Intent trouvé dans Stripe Dashboard** — Dépend de la config Stripe Platform
- ❓ **Transfer visible dans Stripe Dashboard** — Dépend de la config Stripe Connect

#### 6.4 Stripe Connect Verification

- ❓ **Merchant Connect Account visible** — Dans Stripe Dashboard `/connect/accounts`
- ❓ **KYC du merchant complété** — Via Stripe Express onboarding dans Violet Connect
- ❓ **`payouts_enabled: true`** sur le compte Connect
- ❓ **`charges_enabled: true`** sur le compte Connect

---

## Phase 7 — Webhooks

> **Réf** : `https://docs.violet.io/prism/webhooks.md` + `https://docs.violet.io/prism/webhooks/handling-webhooks.md`
>
> **Code audité** : `convex/webhooks/violet.ts` (1826 lignes !), `convex/lib/webhookSchemas.ts`

#### 7.1 Webhook Setup

- ✅ **Convex HTTP Action** — `POST /api/webhooks/violet` configuré dans `convex/http.ts`
- 🔶 **Webhooks créés dans le Channel Dashboard Violet** — Le code les traite, mais il faut créer les subscriptions aux événements dans le dashboard ou via API

**Événements gérés par le code** (tous présents dans le handler) :

| Événement | Statut code | Notes |
|-----------|-------------|-------|
| `ORDER_ACCEPTED` | ✅ | Processors implémentés |
| `ORDER_UPDATED` | ✅ | |
| `ORDER_COMPLETED` | ✅ | |
| `ORDER_SHIPPED` | ✅ | |
| `ORDER_DELIVERED` | ✅ | |
| `ORDER_REFUNDED` | ✅ | |
| `ORDER_CANCELED` / `CANCELLED` | ✅ | Les deux orthographes gérées |
| `ORDER_FAILED` | ✅ | |
| `ORDER_RETURNED` | ✅ | |
| `MERCHANT_CONNECTED` | ✅ | |
| `MERCHANT_DISCONNECTED` | ✅ | |
| `MERCHANT_ENABLED` | ✅ | |
| `MERCHANT_DISABLED` | ✅ | |
| `MERCHANT_COMPLETE` | ✅ | |
| `MERCHANT_NEEDS_ATTENTION` | ✅ | |
| `OFFER_CREATED` | ✅ | Deprecated, alias vers OFFER_ADDED |
| `OFFER_ADDED` | ✅ | |
| `OFFER_UPDATED` | ✅ | |
| `OFFER_REMOVED` | ✅ | |
| `OFFER_DELETED` | ✅ | |
| `COLLECTION_CREATED` | ✅ | |
| `COLLECTION_UPDATED` | ✅ | |
| `COLLECTION_REMOVED` | ✅ | |
| `COLLECTION_OFFERS_UPDATED` | ✅ | |
| `COLLECTION_SYNC_STARTED` | ✅ | |
| `COLLECTION_SYNC_COMPLETED` | ✅ | |
| `COLLECTION_SYNC_FAILED` | ✅ | |
| `TRANSFER_SENT` | ✅ | |
| `TRANSFER_PARTIALLY_SENT` | ✅ | |
| `TRANSFER_FAILED` | ✅ | |
| `TRANSFER_UPDATED` | ✅ | |
| `TRANSFER_REVERSED` | ✅ | |
| `TRANSFER_PARTIALLY_REVERSED` | ✅ | |
| `TRANSFER_REVERSAL_FAILED` | ✅ | |
| `PAYMENT_TRANSACTION_CAPTURE_STATUS_UPDATED` | ✅ | |
| `PAYMENT_TRANSACTION_CAPTURE_STATUS_AUTHORIZED` | ✅ | |
| `PAYMENT_TRANSACTION_CAPTURE_STATUS_CAPTURED` | ✅ | |
| `PAYMENT_TRANSACTION_CAPTURE_STATUS_REFUNDED` | ✅ | |
| `PAYMENT_TRANSACTION_CAPTURE_STATUS_PARTIALLY_REFUNDED` | ✅ | |
| `PAYMENT_TRANSACTION_CAPTURE_STATUS_FAILED` | ✅ | |
| `MERCHANT_PAYOUT_ACCOUNT_CREATED` | ✅ | |
| `MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED` | ✅ | |
| `MERCHANT_PAYOUT_ACCOUNT_ACTIVATED` | ✅ | |
| `MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED` | ✅ | |
| `MERCHANT_PAYOUT_ACCOUNT_DELETED` | ✅ | |
| `PRODUCT_SYNC_STARTED` | ✅ | Via sync handlers |
| `PRODUCT_SYNC_COMPLETED` | ✅ | |
| `PRODUCT_SYNC_FAILED` | ✅ | |

- ❓ **Remote endpoint accessible publiquement** — Le Convex backend doit être joignable par Violet. En prod: Caddy reverse proxy. En dev: tunnel nécessaire (ngrok, etc.)
- ❓ **Webhook status `ACTIVE`** — Vérifiable via `GET /v1/events/webhooks`

#### 7.2 Webhook Security

- ✅ **HMAC validation implémentée** — `validateHmac()` dans `violet.ts` : HMAC-SHA256 + `crypto.subtle.verify()` pour constant-time comparison (anti timing attacks). Utilise `VIOLET_APP_SECRET` comme clé
- ✅ **Idempotency** — `webhookEvents` table Convex avec index `by_eventId`. Check `checkEvent` query avant processing. Event ID extrait de `X-Violet-Event-Id` header
- ✅ **2xx response immédiat** — HTTP Action retourne 200 après idempotency check, processing en arrière-plan via `internalMutation` + `ctx.scheduler.runAfter()`

#### 7.3 Webhook Processing

- ✅ **Traitement asynchrone** — Architecture Convex : HTTP Action → `internalMutation` (sync) → `ctx.scheduler.runAfter()` (async actions : emails, push)
- ✅ **Schemas de validation** — `webhookSchemas.ts` avec Zod pour chaque type de payload (order, bag, merchant, transfer, payout account, offer, sync, collection, payment transaction)
- ✅ **Gestion des erreurs** :
  - Status tracking : `received` → `processing` → `processed` / `failed`
  - `errorMessage` persisté dans `webhookEvents` table
  - Retry via `ctx.scheduler.runAfter()` pour les actions asynchrones
- ✅ **Fire-and-forget actions** — Emails et notifications push via `ctx.scheduler.runAfter()` sans blocker le webhook

#### 7.4 Webhook Event Headers utilisés

- ✅ `X-Violet-Event-Id` — Pour idempotency check
- ✅ `X-Violet-Topic` — Pour router vers le bon processor (25+ event types)
- 🔶 Autres headers (`X-Violet-Entity-Id`, `X-Violet-Order-Id`, `X-Violet-Bag-Id`, `X-Violet-Reason`, `X-Violet-Entity-Length`) — À vérifier s'ils sont extraits et utilisés

#### 7.5 Webhook Simulation

- ❓ **Simulation testée** — À faire manuellement via `POST /v1/events/webhooks/{webhook_id}/simulate`

---

## Phase 8 — Order Management & Lifecycle

> **Réf** : `https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md` + `https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/lifecycle-of-a-bag.md`
>
> **Code audité** : `convex/orders/queries.ts`, `convex/schema.ts`, `apps/web/src/routes/account/orders/`, `apps/web/src/routes/order/`

#### 8.1 Order Lifecycle

- ✅ **`getOrders` query** — Orders pour un utilisateur authentifié, triés par date DESC, avec bags + items + refunds
- ✅ **`getOrderDetail` query** — Détail d'un order avec contrôle d'accès (owner / admin / guest)
- ✅ **`getAllOrders` query** — Admin seulement, avec filtre par statut
- ✅ **Order States** — Schema Convex supporte tous les états : `IN_PROGRESS`, `PROCESSING`, `ACCEPTED`, `REJECTED`, `COMPLETED`, `CANCELED`, `REQUIRES_ACTION`

#### 8.2 Bag Lifecycle

- ✅ **Bag States** — Schema `orderBags` : `IN_PROGRESS`, `SUBMITTED`, `ACCEPTED`, `COMPLETED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `CANCELED`, `REJECTED`
- ✅ **Financial status** — Champ `financialStatus` : `UNPAID`, `PAID`, `REFUNDED`, `PARTIALLY_REFUNDED`
- ✅ **Fulfillment status** — Champ `fulfillmentStatus` : `PROCESSING`, `FULFILLED`, `DELIVERED`, etc.
- ✅ **Multi-merchant orders** — Bags indépendants avec `merchantId` FK vers `merchants` table
- ✅ **`external_id`** sur chaque bag — Stocké dans `violetData` (payload Violet complet)

#### 8.3 Order Retrieval

- ✅ **User orders** — Page `/account/orders` avec `getOrders` query
- ✅ **Order detail** — Page `/account/orders/$orderId`
- ✅ **Guest order lookup** — `getGuestOrderByToken` query + page `/order/lookup` (recherche par token hash)
- ✅ **Admin orders** — Page admin avec tous les orders + filtres
- ✅ **Order confirmation page** — `/order/$orderId/confirmation`

#### 8.4 Refunds & Cancellations

- ✅ **Refund data** — Table `orderRefunds` dans le schema Convex avec index par `orderBagId`
- ✅ **Refund webhook processing** — `ORDER_REFUNDED` handler dans `violet.ts` persist les refunds
- 🔶 **Refund via API** — Aucune route API trouvée pour initier un refund côté channel (`POST /v1/orders/{order_id}/refunds`). Les refunds sont possédés par le merchant (via sa plateforme e-comm)
- 🔶 **Cancel via API** — Aucune route API trouvée pour cancel un order côté channel
- 🔶 **Order Adjustments** — Pas implémenté

> 💡 **Note** : Pour le live demo, les refunds/cancellations sont généralement initiés par le **merchant** dans sa plateforme (Shopify, etc.), puis remontent via webhooks. Le channel n'a pas besoin d'API de refund pour le demo.

---

## Phase 9 — Distributions, Transfers & Payouts

> **Réf** : `https://docs.violet.io/prism/payments/payments-during-checkout.md` + `https://docs.violet.io/prism/payments/payouts.md`
>
> **Code audité** : `convex/schema.ts` (tables `orderDistributions`, `orderTransfers`, `merchants`, `merchantPayoutAccounts`), `convex/webhooks/violet.ts`, `apps/web/src/server/distributions.ts`

#### 9.1 Distributions

- ✅ **Table `orderDistributions`** — Schema Convex avec `distributionId`, `violetOrderId`, `violetBagId`, `type`, `channelAmount`, `merchantAmount`, `stripeFee`, `subtotal`, `tax`
- ✅ **Webhook processing** — Distributions créées/mises à jour via les événements order/transfer
- ✅ **Server fn `syncOrderDistributionsFn`** — `distributions.ts` : fetch depuis Violet API + upsert dans la DB
- 🔶 **Distribution queries** — Pas de query Convex dédiée trouvée pour lire les distributions côté frontend. Les distributions sont persistées via webhooks mais pas encore affichées

#### 9.2 Transfers

- ✅ **Table `orderTransfers`** — Schema Convex avec `violetTransferId`, `violetOrderId`, `violetBagId`, `type`, `status`
- ✅ **Webhook processing** — Tous les événements transfer gérés : `TRANSFER_SENT`, `TRANSFER_FAILED`, `TRANSFER_UPDATED`, `TRANSFER_REVERSED`, `TRANSFER_PARTIALLY_REVERSED`, `TRANSFER_REVERSAL_FAILED`

#### 9.3 Payouts

- ✅ **Table `merchantPayoutAccounts`** — Schema Convex avec `merchantId` FK, `type`, `status`, `requirements`, `violetData`
- ✅ **Webhook processing** — Tous les événements payout account gérés : `CREATED`, `REQUIREMENTS_UPDATED`, `ACTIVATED`, `DEACTIVATED`, `DELETED`
- ❓ **Payout Account configuré pour les merchants** — Dépend de l'onboarding via Violet Connect (Stripe Express KYC)

#### 9.4 Transfer Groups

- 🔶 **Transfer Groups** — Pas de route API ni query dédiée trouvée. Le code persiste les transfers via webhooks mais n'expose pas les transfer groups

---

## Phase 10 — Payment Settings (Capture, Transfer, Tax)

> **Réf** : `https://docs.violet.io/prism/payments/payment-settings/capture-settings.md` + `transfer-settings.md`
>
> ⚠️ **Configuration externe** — Ces settings sont configurés côté Violet, pas dans votre code.

#### 10.1 Capture Settings

- ❓ **Capture Method configuré** — À confirmer avec Violet (probablement `AUTOMATIC` pour un marketplace standard)
- ❓ **Settings confirmés en Test Mode ET Live Mode** — Les settings sont mode-specific

#### 10.2 Transfer Settings

- ❓ **Transfer Method configuré** — À confirmer avec Violet (probablement `AUTOMATIC`)
- ❓ **Transfer Mechanism choisi** — Standard vs Destination Payments

#### 10.3 Tax Remitter Settings

- ❓ **Tax Remitter configuré** — Qui collecte et remet les taxes (Violet ou channel)
- ❓ **Pays supportés** pour les payouts — Vérifié pour vos merchants cibles

#### 10.4 Country Restrictions

- ✅ **`VITE_STRIPE_ACCOUNT_COUNTRY`** — Variable présente dans `.env.example` (`US` en sandbox, `FR` en prod). Documenté avec le lien vers les pays supportés

---

## Phase 11 — Gestion des Erreurs & Edge Cases

> **Réf** : `https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md` (Error States)

### Ce que Violet va vérifier :

- 🔶 **`errors` array toujours vérifié** — Documenté dans les commentaires du code ("A cart response can come back with status code 200 and still have errors"). À vérifier que tous les handlers de réponse le traitent
- 🔶 **Multi-bag partial failures** — Le schema supporte les erreurs par bag, mais le traitement UI côté client est à vérifier
- ✅ **Rate limiting géré** — `violetApi.ts` : retry sur 429 avec exponential backoff (`MAX_RETRIES = 3`, `BASE_DELAY_MS = 1000`)
- ✅ **Webhook failures** — `violet.ts` : système complet de status tracking (`received` → `processing` → `processed`/`failed`), error logging, async retry via `ctx.scheduler.runAfter()`
- ✅ **`REQUIRES_ACTION` (3D Secure)** — `useOrderSubmit.ts` : `stripe.handleNextAction()` + re-submit avec même `appOrderId` pour idempotency
- ✅ **Stripe error codes mappés** — `getStripeErrorMessage()` dans `PaymentForm.tsx` : `card_declined`, `expired_card`, `incorrect_cvc`, `processing_error`, `insufficient_funds`
- 🔶 **Duplicate submission prevention** — Gestion du 409 Conflict (`bag_submission_in_progress`). À vérifier si le code gère ce cas spécifique
- 🔶 **Cart errors non-bloquants** — `INTERNAL_ADD_ITEM` etc. À vérifier le traitement UI
- 🔶 **Bag `REJECTED` après retry** — Le webhook handler traite `ORDER_FAILED`, mais le flux de récupération UI est à vérifier
- ✅ **401 retry avec token invalidation** — `violetApi.ts` : si 401 reçu, le token est invalidé et un nouveau login est tenté

---

## Phase 12 — Channel Dashboard & Merchant Dashboard

> **Réf** : `https://docs.violet.io/resources/channel-dashboard.md` + `https://docs.violet.io/resources/merchant-dashboard.md`

#### 12.1 Channel Dashboard (`https://channel.violet.io`)

- ❓ **Merchants connectés** visibles
- ❓ **Orders list** avec détails complets
- ❓ **Payouts/Distributions** visibles
- ❓ **Settings de l'app** configurés :
  - Payment settings (capture, transfer, tax remitter)
  - Violet Connect URL
  - Team members
  - API credentials
- ❓ **Toggle Test/Live Mode** fonctionnel

#### 12.2 Merchant Dashboard (`https://merchant.violet.io`)

- ❓ **Merchant peut se connecter**
- ❓ **Orders visibles** dans le merchant dashboard
- ❓ **Payout account settings** accessibles
- ❓ **Synced offers** visibles

---

## Récapitulatif des gaps prioritaires

> Classé par **impact sur le live demo** (du plus critique au moins critique)

### 🔴 Blockers — À résoudre AVANT le demo

| # | Gap | Impact | Effort estimé | Action |
|---|-----|--------|---------------|--------|
| 1 | **Stripe Platform Account non vérifié** | Sans ça, pas de paiement réel, pas de Test Mode | ~2h setup | Créer/compléter le compte Stripe, activer Connect, générer restricted keys, partager credentials chiffrés avec Violet |
| 2 | **Webhooks non créés dans le Channel Dashboard** | Violet ne peut pas envoyer d'événements → pas de sync orders/merchants | ~30 min | Créer les webhooks via API ou dashboard vers votre endpoint Convex |
| 3 | **Endpoint webhook pas accessible publiquement** | Violet ne peut pas deliver les webhooks | ~1h | Configurer tunnel (dev) ou Caddy (prod) |
| 4 | **Violet Connect pas configuré** | Pas d'onboarding merchant possible | ~1h | Configurer dans le Channel Dashboard |

### 🟡 Important — À vérifier/tester

| # | Gap | Impact | Action |
|---|-----|--------|--------|
| 5 | **Test end-to-end complet jamais fait** | Risque de bugs le jour du demo | Faire 1 achat test complet en Test Mode |
| 6 | **Payment Settings non confirmés avec Violet** | Settings par défaut possiblement incorrects | Email Violet pour confirmer capture/transfer/tax settings |
| 7 | **Refund/Cancel API pas implémentée côté channel** | Pas grave : les refunds sont merchant-initiés | Clarifier avec Violet si c'est attendu |

### 🟢 Nice-to-have — Pas bloquant pour le demo

| # | Gap | Impact | Action |
|---|-----|--------|--------|
| 8 | **Direct Order Submission (DOS)** | Flow alternatif, pas requis si checkout standard fonctionne | Skip pour le demo |
| 9 | **Distribution queries / Transfer Groups UI** | Données persistées mais pas affichées | Optionnel — les données sont dans Convex |
| 10 | **Media Transformations** | Optimisation bandwidth | Vérifier les URLs d'images |
| 11 | **Pagination** | UX pour grands catalogues | Vérifier les params passés à Violet |

---

## Récapitulatif — Ce que l'équipe Violet va DEMANDER de démontrer

| # | Étape | Statut code | Ce qu'ils vont vous demander de montrer |
|---|-------|-------------|----------------------------------------|
| 1 | **Violet Connect** | ❓ Config | Onboard un merchant via Violet Connect — le merchant apparaît connecté |
| 2 | **Catalog Sync** | ✅ Code prêt | Les produits du merchant sont synchronisés et visibles dans votre app |
| 3 | **Checkout complet** | ✅ Code prêt | Cart → items → customer → shipping → payment → submit → order complétée |
| 4 | **Paiement Stripe** | ✅ Code prêt | Payment Intent visible dans Stripe Dashboard, funds capturés |
| 5 | **Multi-merchant** | ✅ Code prêt | Cart avec items de plusieurs merchants, checkout en 1 transaction |
| 6 | **Webhooks** | ✅ Code prêt | Endpoint reçoit ORDER_COMPLETED, TRANSFER_SENT, etc. |
| 7 | **Distribution/Transfer** | ✅ Code prêt | Funds correctement distribués : commission + payout merchant |
| 8 | **Merchant Payout** | ❓ Config | Merchant a un Stripe Connect account actif |
| 9 | **Order Management** | ✅ Code prêt | Orders, statuts bags, fulfillments |
| 10 | **Error Handling** | ✅ Code prêt | 3DS, partial failures, rate limits |
| 11 | **Payment Settings** | ❓ Config | Confirmer capture/transfer/tax settings |
| 12 | **Dashboard** | ❓ Config | Channel Dashboard + Merchant Dashboard |

---

## Post-Demo — Ce qui se passe après

Si le demo est réussi :

1. ✅ Violet **active le Live Mode** sur votre app
2. ✅ Votre **Live App Secret** devient visible dans le Channel Dashboard
3. ✅ Vous pouvez **onboard des vrais merchants** via Violet Connect
4. ✅ Les orders seront des **vraies transactions** (fonds réels)
5. ✅ Les **paiements sont capturés** via votre Stripe Platform account
6. ✅ Les **transfers sont envoyés** aux Stripe Connect accounts des merchants

---

## Score global de préparation

| Catégorie | Score | Détail |
|-----------|-------|--------|
| **Code & Architecture** | 🟢 90% | Checkout, webhooks, Stripe Elements, 3DS, wallet payments — tout implémenté |
| **Convex Backend** | 🟢 95% | 24 tables, toutes les queries, mutations, webhook handler complet |
| **Configuration Stripe** | 🔴 0% | Stripe Platform, Connect, restricted keys — à faire entièrement |
| **Configuration Violet** | 🔴 10% | Webhooks, Violet Connect, payment settings — à configurer |
| **Test end-to-end** | 🔴 0% | Jamais testé en conditions réelles Test Mode |

**Verdict** : Le code est **très solide** et largement prêt. Le travail restant est **100% configuration et validation** — pas de dev supplémentaire nécessaire pour le live demo.

---

*Document mis à jour le 2026-05-18 après audit du codebase*
*URL de booking du Go-Live Demo : https://cal.com/team/violet/violet-go-live-demo*
