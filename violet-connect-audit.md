# Audit Violet Connect — Maison Émile × Violet

> **Date** : 2026-04-27
> **Scope** : 14 sous-liens de `https://docs.violet.io/prism/violet-connect.md`
> **Rôle** : Channel Developer (affiliation, commission sur ventes — PAS marchand)

---

## Sommaire

| # | Lien | Statut | Code à écrire | Action Dashboard |
|---|------|--------|---------------|------------------|
| 1 | [Setup](#1-setup) | ✅ AUDITÉ | Aucun | **4 actions requises** |
| 2 | [Payouts](#2-payouts) | ✅ AUDITÉ | Aucun | **1 action requise** |
| 3 | [Commissions](#3-commissions) | ✅ AUDITÉ | Aucun | **1 action requise** |
| 4 | [Guides](#4-guides) | ✅ AUDITÉ | Aucun | Page de navigation |
| 5 | [Pre-provisioning Merchant Data](#5-pre-provisioning-merchant-data) | ✅ AUDITÉ | Aucun | Optionnel (scale futur) |
| 6 | [Violet Connect for Channels](#6-violet-connect-for-channels) | ✅ AUDITÉ | Aucun | **3 actions requises** |
| 7 | [Violet Connect for Merchants](#7-violet-connect-for-merchants) | ❌ NON PERTINENT | — | — |
| 8 | [Shopify Custom App Migration](#8-shopify-custom-app-migration) | ✅ AUDITÉ | Aucun | Déjà couvert (#13-18) |
| 9 | [Connection Health](#9-connection-health) | ✅ AUDITÉ | Aucun | **1 action requise** |
| 10 | [Detecting Merchants Connections](#10-detecting-merchants-connections) | ✅ AUDITÉ | Aucun | Déjà implémenté |
| 11 | [Connecting your BigCommerce App](#11-connecting-your-bigcommerce-app) | ❌ NON PERTINENT | — | — |
| 12 | [Testing](#12-testing) | ✅ AUDITÉ | Aucun | **1 action requise** |
| 13 | [Connecting a Shopify Store](#13-connecting-a-shopify-store) | ✅ AUDITÉ | Aucun | **1 action requise** |
| 14 | [FAQs](#14-faqs) | ✅ AUDITÉ | Aucun | Info |

---

## Détail par lien

### 1. Setup

**URL** : `https://docs.violet.io/prism/violet-connect/setup.md`
**Description** : Configuration complète de Violet Connect dans le Channel Dashboard.

#### Ce que la doc exige

| Config | Où | Description |
|--------|-----|-------------|
| **App Name** | `channel.violet.io` → App Settings | Nom affiché en haut à gauche de Violet Connect |
| **Square Logo/Icon** | `channel.violet.io` → App Settings | Logo affiché à côté du nom |
| **Redirect URL** | `channel.violet.io` → App Settings | URL post-onboarding marchand. Violet ajoute `?merchant_id=X` |
| **App Description** | `channel.violet.io` → App Settings | Description de votre expérience |
| **More Info URL** | `channel.violet.io` → App Settings | Lien vers votre site |
| **Custom Path** | Contacter `support@violet.io` | Ex: `connect.violet.io/maisonemile` — configuré par Violet |
| **Supported Platforms List** | Optionnel — contacter Violet | Filtrer les plateformes e-commerce affichées aux marchands |

#### Points techniques avancés

| Feature | Description | Implémenté ? |
|---------|-------------|-------------|
| **Redirect URL** avec `?merchant_id` | Violet redirige le marchand avec le merchant_id en query param | ⚠️ Pas de handler code — le webhook MERCHANT_CONNECTED suffit |
| **Auth Callback URL** | GET request après credentials step — optionnel, nécessite ticket Violet | ❌ Non configuré (optionnel) |
| **Custom State** (`?state=...`) | Passé dans l'URL Connect → retourné dans redirect + header `x-violet-connect-state` du webhook | ⚠️ Non capturé dans `extractWebhookHeaders()` — pas de cas d'usage actuel |
| **State in Webhooks** | `x-violet-connect-state` header sur MERCHANT_CONNECTED | ⚠️ Documenté en JSDoc mais non capturé |
| **Shopify Pre-Registration** | Obligatoire depuis janv. 2026 | ✅ Couvert audits #13-18 |

#### ⚠️ Actions Dashboard requises

- [x] **App Name** — ✅ changé : "Maison Émile" (était "CHARLES BOURGAULT app")
- [x] **Logo** — une image est présente ✅ (à vérifier si c'est le bon)
- [x] **Redirect URL** — ✅ changé : `maisonemile.com/admin/merchants` (était `merchant.violet.dev`)
- [x] **Country** — ✅ changé : France 🇫🇷 (était United States)
- [x] **Default Currency** — ✅ changé : EUR € (était USD)
- [x] **Organization Website** — ✅ rempli : `https://maisonemile.com`
- [ ] **App Description** — optionnel (décision : pas de description pour le moment)
- [ ] **More Info URL** — pas visible dans App Details → à vérifier
- [ ] **Custom Path** — actuel : UUID `7b95dc7c-b93d-434f-abd6-6c4d136dc918` → 📧 email envoyé à `support@violet.io` le 2026-04-27, en attente de réponse (slug demandé: `maisonemile`)
- [ ] **Supported Platforms** — optionnel — contacter Violet si filtrage souhaité

---

### 2. Payouts

**URL** : `https://docs.violet.io/prism/violet-connect/payouts.md`
**Description** : Configuration du compte bancaire marchand via Stripe Connect.

#### Ce que la doc recommande

| Point | Recommandation Violet | Statut projet |
|-------|----------------------|---------------|
| **Type de compte** | **Stripe Express UNIQUEMENT** (auto-debit negative balances) | ✅ Recommandation respectée (audits #105, #130) |
| **Standard = risqué** | Pas auto-debit, pas contrôle payout schedule, channel responsable des fonds | ✅ Non utilisé |
| **KYC simplifié** | Express KYC plus simple que full business Stripe | ✅ Flux géré via Violet Connect |
| **Onboarding automatique** | Via Violet Connect pendant l'onboarding marchand | ✅ PPA webhooks implémentés (CREATED, REQUIREMENTS_UPDATED, ACTIVATED, DEACTIVATED, DELETED) |
| **Payout schedule** | Platform contrôle le timing avec Express | ✅ Automatic Transfer par défaut |

#### Implémentation code

- ✅ `merchant_payout_accounts` table (migration `20260416000000`)
- ✅ Types `PayoutProvider`, `StripeRequirements`, `MerchantPayoutAccountRow`, `VioletPayoutAccount`
- ✅ 5 webhooks PPA implémentés dans `payoutAccountProcessors.ts`
- ✅ KYC alerts proactives dans `error_logs` (PAST_DUE, DUE, CHARGES_DISABLED, PAYOUTS_DISABLED)
- ✅ `payoutAccounts.ts` server functions (getActive, getAll, getById, sync)

#### ⚠️ Action Dashboard requise

- [ ] **Confirmer à Violet** : restreindre les marchands aux **Stripe Express accounts only** — 📧 email envoyé à `support@violet.io` le 2026-04-27, en attente de réponse

---

### 3. Commissions

**URL** : `https://docs.violet.io/prism/violet-connect/commissions.md`
**Description** : Commission rate = % que le Channel reçoit par vente via son app.

#### Ce que la doc dit

| Point | Description | Statut |
|-------|-------------|--------|
| **Le marchand définit le rate** | Le Channel ne peut PAS le changer lui-même pendant l'onboarding | ✅ Connu |
| **Confirmation dans Dashboard** | Le Channel peut voir/valider le rate dans `channel.violet.io/merchants` | ⚠️ À vérifier après 1er marchand |
| **API Set Commission Rate** | `PUT /apps/{app_id}/merchants/{merchant_id}/commission_rate` — pour modification post-onboarding | ✅ Implémenté `setCommissionRate()` dans `violetMerchants.ts` |
| **Rate par Channel** | Si le marchand travaille avec d'autres Channels, il peut avoir des rates différents | ✅ Connu |
| **Commission calculée sur Subtotal** | Tax + Shipping exclus | ✅ Conforme |

#### Implémentation code

- ✅ `merchants.commission_rate` dans la DB
- ✅ `order_bags.commission_rate` snapshot à la commande
- ✅ `estimate_commission()` SQL function
- ✅ `mv_commission_summary` materialized view
- ✅ `CommissionTable.tsx` admin UI
- ✅ `setCommissionRate()` API (PUT) avec `commission_locked` param

#### ⚠️ Action Dashboard requise

- [ ] **Commission rates** configurés par marchand dans `channel.violet.io/merchants` (à faire au 1er marchand)

---

### 4. Guides

**URL** : `https://docs.violet.io/prism/violet-connect/guides.md`
**Description** : Page index listant 7 guides Violet Connect.

**AUCUN CODE À ÉCRIRE** — page de navigation. Les 7 guides sont audités individuellement ci-dessous.

---

### 5. Pre-provisioning Merchant Data

**URL** : `https://docs.violet.io/prism/violet-connect/guides/pre-provisioning-merchant-data.md`
**Description** : APIs pour pré-enregistrer les marchands programmatiquement (`POST /merchants/onboard`).

#### Ce que la doc dit

| Point | Description |
|-------|-------------|
| **API** | `POST /v1/merchants/onboard` — pré-enregistrement programmatique |
| **Body** | `channel_merchant_id`, `name`, `store_url`, `platform` (SHOPIFY/WOO/etc.), `platform_credentials` |
| **Usage** | Pour les Channels qui ont déjà une base marchands existante |
| **Error 2514** | `merchant_already_onboarded` si le marchand existe déjà dans Violet |

#### Implémentation code

- ❌ **Non implémenté** — **justifié** :
  - Actuellement l'onboarding est **manuel** via Channel Dashboard → Pre-Registered tab
  - Le pre-provisioning programmatique est utile uniquement à scale (dizaines/centaines de marchands)
  - Notre modèle actuel : quelques marchands soigneusement sélectionnés

#### ⚠️ Action Dashboard

- Aucune. Optionnel — à envisager si scale future.

---

### 6. Violet Connect for Channels

**URL** : `https://docs.violet.io/prism/violet-connect/guides/violet-connect-for-channels.md`
**Description** : Guide complet du flux Channel (prérequis, partage du lien, vérification, personnalisation).

#### Ce que la doc exige (prérequis avant d'envoyer des marchands)

| # | Prérequis | Statut |
|---|-----------|--------|
| 1 | **Redirect URL configurée** dans App Settings | ⚠️ À faire sur Dashboard |
| 2 | **Commission rates pré-négociés** avec les marchands | ⚠️ À définir business-side |
| 3 | **Shopify pre-registration** pour marchands Shopify | ✅ Processus documenté |

#### Flux documenté (7 étapes côté marchand)

1. Email → 2. Sélection plateforme → 3. Store URL → 4. Credentials → 5. Payout setup → 6. Commission rate → 7. Terminé

#### Personnalisations possibles (contacter Violet)

| Customisation | Comment | Statut |
|---------------|---------|--------|
| **Skip Payout Account step** | Contacter Violet (utile si bypass payments) | ❌ Non applicable (on utilise Prism Pay) |
| **Skip Commission Rate step** | Contacter Violet (si rates pré-négociés, gérés par Channel) | ⚠️ À décider business-side |
| **Custom Path** | Contacter Violet | ⚠️ À demander |

#### ⚠️ Actions Dashboard requises

- [ ] **Redirect URL** configurée dans App Settings (recouvrement avec #1)
- [ ] **Décision** : le marchand choisit son commission rate OU le Channel le fixe ? Si fixe → contacter Violet pour skip l'étape
- [ ] **Vérifier** les marchands connectés dans `channel.violet.io/merchants` après 1er onboard

---

### 7. Violet Connect for Merchants

**URL** : `https://docs.violet.io/prism/violet-connect/guides/violet-connect-for-merchants.md`
**Description** : Guide pas-à-pas pour les marchands (7 étapes UI).

**❌ NON PERTINENT** — Ce guide est destiné aux **marchands** qui se connectent, pas au Channel.
Vous pouvez partager ce lien avec vos marchands quand ils font leur onboarding.

---

### 8. Shopify Custom App Migration

**URL** : `https://docs.violet.io/prism/violet-connect/guides/shopify-custom-app-migration.md`
**Description** : Page de redirection vers `docs.violet.io/ecom-platforms/shopify`.

**AUCUN CODE À ÉCRIRE** — Page redirect. Le contenu complet est déjà audité via les liens #13-18 (Shopify Prerequisites, App Setup, Pre-Registration, Merchant Onboarding, Troubleshooting & FAQs).

#### Quick Start (4 étapes)

1. ✅ Créer un Shopify Partner account
2. ⚠️ Créer une single-merchant custom app par marchand (Shopify Partner Dashboard)
3. ⚠️ Pre-register le marchand dans Channel Dashboard
4. ⚠️ Envoyer le Violet Connect link au marchand

---

### 9. Connection Health

**URL** : `https://docs.violet.io/prism/violet-connect/guides/connection-health.md`
**Description** : Dashboard de monitoring de l'état des connexions marchands.

#### Ce que la doc documente (3 états × 7 sous-vérifications)

**3 états globaux** :

| État | Signification | Commandes possibles ? |
|------|---------------|----------------------|
| **Complete** | Tout OK | ✅ Oui |
| **Incomplete** | Action non-bloquante requise (ex: KYC `currently_due`) | ✅ Oui (mais risque de transition → Needs Attention) |
| **Needs Attention** | Problème bloquant — commandes impossibles | ❌ Non |

**7 sous-vérifications par marchand** :

| # | Check | Ce que ça vérifie |
|---|-------|-------------------|
| 1 | **Connection** | Communication avec le store e-commerce |
| 2 | **Scopes** | Permissions API configurées (20 scopes Shopify) |
| 3 | **Sync Status** | Synchronisation produits en cours |
| 4 | **Invalid Products** | Produits non-synchronisables (avec raison) |
| 5 | **Offers Published** | Offres publiées pour votre app |
| 6 | **Payout Account** | Compte Stripe Connect configuré et KYC à jour |
| 7 | **Commission Rate** | Commission rate défini |

#### Implémentation code — COMPLÈTE

- ✅ **Edge Function `health-check`** — `GET /operations/connection_health` (batch, 1 appel API pour tous les marchands)
- ✅ **Seuls les marchands non-COMPLETE** sont retournés (filtrage INCOMPLETE/NEEDS_ATTENTION)
- ✅ **7 sous-vérifications** capturées avec `checkLabelMap` (connection, scopes, sync_status, invalid_products, offers_published, payout_account, commission_rate)
- ✅ **Types partagés** — `MerchantConnectionHealth` + `ConnectionHealthCheck` dans `health.types.ts`
- ✅ **Admin UI** — `/admin/health` avec `MerchantHealthCard` : statut global + checks détaillés + lien Channel Dashboard
- ✅ **Status normalisés** — COMPLETE/INCOMPLETE/NEEDS_ATTENTION avec fallback UNKNOWN pour variants GREEN/YELLOW/RED

#### ⚠️ Action Dashboard requise

- [ ] **Consulter régulièrement** `channel.violet.io/merchants` pour les marchands INCOMPLETE/NEEDS_ATTENTION (le code appelle l'API, mais le Dashboard est la source de vérité pour les actions correctives)

---

### 10. Detecting Merchants Connections

**URL** : `https://docs.violet.io/prism/violet-connect/guides/detecting-merchants-post-connection.md`
**Description** : 2 méthodes pour stocker le `merchant_id` après onboarding.

#### Les 2 méthodes documentées

| Méthode | Description | Implémenté ? |
|---------|-------------|-------------|
| **Redirects** | Violet ajoute `?merchant_id=X` à la Redirect URL | ⚠️ Pas de handler code — KISS justifié |
| **Webhooks** | `MERCHANT_CONNECTED` webhook avec l'objet Merchant complet | ✅ **Méthode principale utilisée** |

#### Pourquoi Webhook > Redirect (décision DRY/KISS)

1. **Fiabilité** : Server-to-server, retry 10×/24h, idempotency UNIQUE
2. **Complétude** : Payload complet (id, name, source, status)
3. **Automatisation** : `processMerchantConnected()` fait tout (DB + flags + audit)
4. **Le redirect** est un UX nice-to-have (page confirmation marchand)

#### Implémentation code — COMPLÈTE via Webhook

- ✅ `processMerchantConnected()` — upsert `merchants` table (source de vérité)
- ✅ Auto-enable 4 feature flags (sync_collections, sync_metadata, sync_sku_metadata, contextual_pricing)
- ✅ Persist `merchant_feature_flags` table
- ✅ Audit trail dans `error_logs`
- ✅ `processMerchantDisconnected()` — UPDATE status = DISCONNECTED
- ✅ `processMerchantStatusChange()` — ENABLED/DISABLED

---

### 11. Connecting your BigCommerce App

**URL** : `https://docs.violet.io/prism/violet-connect/guides/violet-connect-your-bigcommerce-app.md`

**❌ NON PERTINENT** — BigCommerce n'est pas dans votre stack. Vos marchands sont sur Shopify.

---

### 12. Testing

**URL** : `https://docs.violet.io/prism/violet-connect/testing.md`
**Description** : Test Mode Violet Connect pour tester l'onboarding end-to-end.

#### Ce que la doc dit

| Point | Description |
|-------|-------------|
| **Test Mode URL** | `connect.violet.dev/{your-path}` (sandbox) |
| **Activation** | Test Mode activé quand vous devenez client payant |
| **⚠️ CRITIQUE** | Ne **JAMAIS** connecter de vrais stores en Test Mode |
| **Email** | Ne pas réutiliser un email dev comme email marchand sandbox |

#### Implémentation code

- ✅ `VIOLET_API_BASE` configurable (sandbox vs live)
- ✅ Demo Mode fallback pour les produits
- ✅ Edge Functions fallback sandbox

#### ⚠️ Action requise

- [ ] **Vérifier** que le Test Mode est activé sur votre compte Violet (nécessite contrat signé)
- [ ] **Créer un test store Shopify** pour tester le flux end-to-end
- [ ] **Utiliser un email dédié** (pas votre email dev) pour le compte marchand test

---

### 13. Connecting a Shopify Store

**URL** : `https://docs.violet.io/prism/violet-connect/testing/connecting-a-shopify-store.md`
**Description** : Guide pas-à-pas pour connecter un store Shopify test en Test Mode.

#### Étapes documentées

1. Créer un store test Shopify (gratuit : `accounts.shopify.com/store-create`)
2. Naviguer vers le Test Mode Violet Connect URL (`connect.violet.dev/{path}`)
3. Créer un compte avec un email **dedicated** (⚠️ pas votre email dev !)
4. Sélectionner "Shopify"
5. Suivre le guide Shopify credentials
6. Compléter l'onboarding (payout + commission)
7. Vérifier dans Channel Dashboard → Merchants tab

#### ⚠️ Actions requises

- [ ] **Créer un Shopify Partner account** — ✅ fait (Partner ID: 4885470)
- [x] **Créer un développement store** — ✅ `maison-emile-test.myshopify.com` (plan Basic, test data généré)
- [ ] **Ajouter produits test** — ⚠️ 1 produit auto-généré (snowboard), ajouter plus si nécessaire
- [ ] **Connecter le store** via `connect.violet.dev/{path}` en Test Mode
- [ ] **Vérifier** le marchand apparaît dans `channel.violet.io/merchants`

---

### 14. FAQs

**URL** : `https://docs.violet.io/prism/violet-connect/faqs.md`
**Description** : 10 questions fréquentes sur Violet Connect.

#### Points clés à retenir

| # | FAQ | Réponse / Action |
|---|-----|------------------|
| 1 | **Squarespace support** | ✅ Violet supporte Squarespace |
| 2 | **Connecter un marchand** | Guide pas-à-pas disponible |
| 3 | **Pre-register Shopify** | Merchants → Pre-Registered tab → Add |
| 4 | **Disconnect marchand** | API `Request Merchant App Uninstall` endpoint |
| 5 | **Changer email marchand** | Processus manuel Violet — email `support@violet.io` avec MerchantId + emails |
| 6 | **`write_customers` scope** | Requis pour associer orders → customers dans Shopify. Forward compatibility juil. 2025 |
| 7 | **Marchand voit ses payouts** | `merchant.violet.io` → Go to Stripe → transactions tab |
| 8 | **Channel Login Detected** | Email déjà utilisé comme compte Channel — utiliser un autre email (`+merchant` trick) |
| 9 | **Stripe Express uniquement** | ✅ **Recommandé** — contacter Violet pour restriction |
| 10 | **Global-e compatible** | Oui, indirectement via les plateformes e-com |

#### ⚠️ Action requise

- [ ] **Confirmer à Violet** : Stripe Express accounts only (recouvrement avec #2)

---

## Récapitulatif des actions Dashboard

### 🔴 Actions prioritaires (bloquantes pour onboarding)

| # | Action | Où | Détail |
|---|--------|-----|--------|
| A1 | **App Name** | `channel.violet.io/app-settings` | Nom de votre app pour Violet Connect |
| A2 | **Logo carré** | `channel.violet.io/app-settings` | Upload icône/brand |
| A3 | **Redirect URL** | `channel.violet.io/app-settings` | Ex: `https://maisonemile.com/admin/merchants` |
| A4 | **Custom Path** | Email `support@violet.io` | Demander `connect.violet.io/maisonemile` (ou votre choix) |
| A5 | **Stripe Express only** | Email `support@violet.io` | "Please restrict merchants to Stripe Express accounts only" |

### 🟡 Actions secondaires (recommandées)

| # | Action | Où | Détail |
|---|--------|-----|--------|
| B1 | **App Description** | `channel.violet.io/app-settings` | Description de votre expérience |
| B2 | **More Info URL** | `channel.violet.io/app-settings` | Lien vers votre site |
| B3 | **Décision commission rate** | Business-side | Marchand choisit OU Channel fixe ? Si fixe → contacter Violet |
| B4 | **Consulter Connection Health** | `channel.violet.io/merchants` | Après 1er marchand connecté |
| B5 | **Commission rates** | `channel.violet.io/merchants` | Configurer par marchand après onboarding |

### 🟢 Actions Test Mode (pour valider le flux)

| # | Action | Détail |
|---|--------|--------|
| C1 | **Contrat Violet signé** | Prérequis pour Test Mode |
| C2 | **Shopify Partner account** | `shopify.com/partners` (gratuit) |
| C3 | **Créer développement store** | Partner Dashboard → Stores → Add store |
| C4 | **Ajouter produits test** | Products tab dans le store Shopify |
| C5 | **Connecter via Test Mode** | `connect.violet.dev/{path}` avec email dédié |
| C6 | **Vérifier dans Dashboard** | `channel.violet.io/merchants` → Connected tab |

---

## Code — Rien à écrire

L'ensemble du code backend pour Violet Connect est **complètement implémenté** :

| Composant | Fichiers | Statut |
|-----------|----------|--------|
| **Webhook MERCHANT_CONNECTED** | `supabase/functions/handle-webhook/processors.ts` | ✅ Complet |
| **Webhook MERCHANT_DISCONNECTED** | `supabase/functions/handle-webhook/processors.ts` | ✅ Complet |
| **Webhook MERCHANT_ENABLED/DISABLED** | `supabase/functions/handle-webhook/processors.ts` | ✅ Complet |
| **Auto-enable feature flags** | `supabase/functions/handle-webhook/processors.ts` → `autoEnableMerchantFlags()` | ✅ Complet |
| **Feature flags persistence** | `merchant_feature_flags` table + `processors.ts` | ✅ Complet |
| **Merchants table** | Migration `20260412000000` + `packages/shared/types/orderPersistence.types.ts` | ✅ Complet |
| **Connection Health API** | `supabase/functions/health-check/index.ts` → `checkMerchantConnectionHealth()` | ✅ Complet |
| **Connection Health types** | `packages/shared/types/health.types.ts` | ✅ Complet |
| **Admin Health UI** | `apps/web/src/routes/admin/health.tsx` → `MerchantHealthCard` | ✅ Complet |
| **Merchants listing WEB** | `apps/web/src/routes/merchants/index.tsx` | ✅ Complet |
| **Merchants listing MOBILE** | `apps/mobile/src/app/merchants/index.tsx` | ✅ Complet |
| **Merchant detail WEB** | `apps/web/src/routes/merchants/$merchantId.tsx` | ✅ Complet |
| **Merchant detail MOBILE** | `apps/mobile/src/app/merchants/[merchantId].tsx` | ✅ Complet |
| **Payout Account webhooks** | `supabase/functions/handle-webhook/payoutAccountProcessors.ts` (5 events) | ✅ Complet |
| **Commission Rate API** | `packages/shared/adapters/violetMerchants.ts` → `setCommissionRate()` | ✅ Complet |
| **Go-live checklist** | `docs/go-live-checklist.md` section "Violet Connect Configuration" | ✅ Documenté |
