# 🎥 Go-Live Demo — Maison Émile × Violet.io

> **Date** : À planifier via [cal.com/team/violet/violet-go-live-demo](https://cal.com/team/violet/violet-go-live-demo)
> **Mode** : Test Mode (sandbox) — Live Mode est activé PAR Violet APRÈS la démo
> **Format** : Screen sharing — aucun déploiement public requis

---

## 📋 Préparation (15 min avant le call)

```bash
# 1. Lancer Supabase local
cd /home/charles/Bureau/E-commerce
supabase start

# 2. Lancer le web app (pour montrer l'UI)
bun run dev

# 3. Vérifier les tests passent
bun run fix-all          # typecheck + lint + format
bun --cwd=packages/shared run test   # 397 tests shared
bun --cwd=apps/web run test           # 581 tests web
```

**Total : 978 tests, 100% pass rate**

---

## 🎯 Plan de Démonstration (30-45 min)

### Section 1 : Architecture & Setup (5 min)

**À montrer :**
- [ ] **Monorepo structure** : `apps/web` (TanStack Start) + `apps/mobile` (Expo) + `packages/shared`
- [ ] **Single backend** : web + mobile partagent le même backend TanStack Start
- [ ] **Env vars** : `.env.example` — App ID (`11371`), App Secret, API base (sandbox vs live)
- [ ] **Channel Dashboard** : `channel.violet.io` → App Settings → Violet Connect configuré

**Points clés à mentionner :**
- Architecture DRY : les packages shared sont importés directement en TypeScript (pas de build step)
- Mobile passe par le même backend web via `EXPO_PUBLIC_API_URL`
- Credentials Violet jamais exposés côté client

---

### Section 2 : Authentication & Security (5 min)

**Fichiers à montrer :**
- [ ] `packages/shared/src/clients/violetAuth.ts` — `VioletTokenManager` singleton
- [ ] `packages/shared/src/clients/violetFetch.ts` — `fetchWithRetry()` avec retry 401 + 429

**Points clés :**
```
Login → JWT 24h + Refresh proactif 5 min avant expiry
  ↓
fetchWithRetry() injecte automatiquement :
  - X-Violet-Token
  - X-Violet-App-Id
  - X-Violet-App-Secret
  ↓
Retry 429 : exponential backoff (1s → 2s → 4s, max 3 retries)
Retry 401 : invalidateToken → refreshOrLogin → retry one-time
```

- Token jamais envoyé au navigateur — tout est server-side
- Mobile : zero appel Violet direct, passe par le web backend
- Deno (Edge Functions) : même logique synchronisée

**Montrer les tests :**
```bash
bun --cwd=packages/shared run test -- --grep "VioletTokenManager"
# 20 tests : cold start, cache, proactive refresh, fallback, dedup concurrent
```

---

### Section 3 : Webhook System — LE PIÈCE DE RÉSISTANCE (15 min)

#### 3a. Couverture événements

**À montrer :**
- [ ] `supabase/functions/_shared/schemas.ts` — `webhookEventTypeSchema` avec 55 events
- [ ] `packages/shared/src/schemas/webhook.schema.ts` — schema Node synchronisé (zéro diff)
- [ ] **Channel Dashboard** : 48 webhooks actifs en sandbox (screen share du Dashboard)

**Entity types couverts (8/8) :**
| Entity | Events |
|--------|--------|
| Offers | OFFER_CREATED, OFFER_ADDED, OFFER_UPDATED, OFFER_REMOVED, OFFER_DELETED |
| Product Syncs | PRODUCT_SYNC_STARTED/COMPLETED/FAILED |
| Collection Syncs | COLLECTION_SYNC_STARTED/COMPLETED/FAILED |
| Merchants | MERCHANT_CONNECTED/DISCONNECTED/ENABLED/DISABLED/COMPLETE/NEEDS_ATTENTION |
| Collections | COLLECTION_CREATED/UPDATED/REMOVED/OFFERS_UPDATED |
| Orders | ORDER_ACCEPTED/UPDATED/COMPLETED/CANCELED/REFUNDED/RETURNED/SHIPPED/DELIVERED/FAILED |
| Transfers | TRANSFER_SENT/PARTIALLY_SENT/FAILED/UPDATED/REVERSED/PARTIALLY_REVERSED/REVERSAL_FAILED |
| Payment Transactions | 6 CAPTURE_STATUS events |
| Payout Accounts | CREATED/REQUIREMENTS_UPDATED/DELETED/ACTIVATED/DEACTIVATED |

#### 3b. Handler architecture

**Fichier à ouvrir :** `supabase/functions/handle-webhook/index.ts`

**Expliquer le flow (10 étapes documentées dans le JSDoc) :**
```
POST → CORS → Read raw body → Phase 1 headers (200) → Phase 2 eventType (200 si inconnu)
  → HMAC validation (401 si invalide — seul non-2xx)
  → Idempotency SELECT → INSERT UNIQUE (race guard 23505)
  → Parse JSON → Zod validation → Route to processor → 200
```

**Points clés :**
- **Always 2xx** (sauf HMAC) : protège contre le disable automatique (50 failures → 1h/3h/24h ban)
- **HMAC-SHA256** : `crypto.subtle.verify()` — constant-time comparison, pas de timing attacks
- **2-phase validation** : Phase 1 structural, Phase 2 eventType enum — unknown events → 200 + log
- **Idempotency 2-level** : SELECT fast path + INSERT UNIQUE race condition guard

#### 3c. Sécurité HMAC

**Fichier à ouvrir :** `supabase/functions/_shared/webhookAuth.ts`

```typescript
// Algorithme : Base64(HMAC-SHA256(VIOLET_APP_SECRET, rawRequestBody))
// crypto.subtle.verify() = constant-time comparison
// Valide AVANT JSON.parse() — raw body only
```

#### 3d. Processors par domaine

**Fichiers à montrer (ouvrir rapidement) :**
- `processors.ts` — 6 processors (OFFER_*, SYNC_*, COLLECTION_*)
- `orderProcessors.ts` — 4 processors (ORDER_*, BAG_*) + syncDistributions + fetchRefundDetails
- `transferProcessors.ts` — 4 processors (TRANSFER_*) + upsertTransfer
- `payoutAccountProcessors.ts` — 5 processors (MERCHANT_PAYOUT_ACCOUNT_*)

**Montrer les tables DB :**
- `webhook_events` — idempotency, audit trail, status lifecycle
- `order_transfers` — fund movement tracking (7 statuses)
- `order_distributions` — financial breakdown per bag
- `merchant_payout_accounts` — Stripe KYC requirements tracking
- `merchants` — source of truth (merchant_id PK, status, commission_rate)

#### 3e. Tests automatisés

```bash
# Lancer les tests webhook en live
bun --cwd=packages/shared run test -- --grep "webhook"
# ~50 tests : schemas, HMAC, event types, payloads
```

---

### Section 4 : Catalog & Checkout Flow (5-10 min)

#### 4a. Catalog

**À montrer :**
- [ ] **Web UI** : `localhost:3000/products` — infinite scroll, filters, category chips
- [ ] **Mobile UI** : Expo app — FlatList products + PDP avec variant selector
- [ ] **Code** : `violetCatalog.ts` — `POST /catalog/offers/search` avec filtres + contextual pricing

#### 4b. Checkout itératif

**Expliquer le flux documenté :**
```
Create Cart (wallet_based_checkout: true)
  → Apply Customer (email, name, shipping address)
  → Get Shipping Methods (per-bag)
  → Apply Shipping Method
  → Payment (Stripe PaymentElement + 3DS)
  → Submit Cart (idempotence UUID v4)
```

**À montrer :**
- [ ] `violetCheckout.ts` — `submitOrder()` avec idempotence `crypto.randomUUID()`
- [ ] `violetCart.ts` — `createCart()` avec `wallet_based_checkout: true` + `channel_id`
- [ ] **Country validation** : `eeaCountries.ts` — EEA-only en production (FR platform)

---

### Section 5 : Financial Tracking (5 min)

**Tables à montrer (Supabase local SQL editor) :**

```sql
-- Distributions : breakdown financier par bag
SELECT * FROM order_distributions LIMIT 5;

-- Transfers : suivi des fonds Channel → Merchant
SELECT * FROM order_transfers LIMIT 5;

-- Commission estimation
SELECT * FROM mv_commission_summary LIMIT 5;

-- Webhook events audit trail
SELECT event_type, status, COUNT(*) 
FROM webhook_events 
GROUP BY event_type, status 
ORDER BY event_type;
```

**Admin UI :** `localhost:3000/admin` — dashboard métriques + DistributionsTable + health-check

---

### Section 6 : Payment Settings & Go-Live Readiness (5 min)

**À confirmer avec Violet :**
- [ ] Capture Method : **Automatic** (recommandé)
- [ ] Transfer Method : **Automatic** (recommandé)
- [ ] Tax Remitter : **Merchant** (notre config)
- [ ] Stripe Platform Account : **FR (EU)** — EEA-only onboarding

**Go-Live checklist :**
- ✅ KYC Stripe complété (2026-04-30)
- ✅ 48 webhooks actifs en sandbox
- ✅ 55 events gérés dans le code
- ✅ 978 tests passent
- ⚠️ Webhooks endpoint à configurer en production (URL live)
- ⚠️ Env vars live mode (VIOLET_API_BASE, VIOLET_APP_SECRET différent)
- ⚠️ Stripe Platform Account connecté en live mode

---

## 🚀 Ce qu'on attend de Violet APRÈS la démo

1. **Activation du Live Mode** sur l'app 11371
2. **App Secret live** visible dans le Dashboard
3. **Confirmation des payment settings** (Automatic/Automatic/Merchant as Tax Remitter)
4. **URL du Stripe Connect live** pour onboarder les premiers marchands

---

## 📊 Chiffres clés (à mentionner)

| Métrique | Valeur |
|----------|--------|
| Event types gérés | **55** |
| Webhooks abonnés (sandbox) | **48** |
| Entity types couverts | **8/8** |
| Processors webhook | **~20 fonctions** |
| Tests automatisés | **978** (397 shared + 581 web) |
| Tables DB Supabase | **48 migrations** |
| Packages shared | **136 fichiers TypeScript** |
| Schemas Zod synchronisés (Deno ↔ Node) | **0 diff** |
| Sécurité | HMAC-SHA256 constant-time, idempotency 2-level, always-2xx |
| Plates-formes | Web (TanStack Start) + Mobile (Expo) |
