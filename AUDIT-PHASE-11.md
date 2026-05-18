# Audit Phase 11 — Migration Supabase → Convex

> **Date** : 2026-05-19
> **Scope** : Ré-audit complet de la Phase 11 (Nettoyage et migration des données)
> **Méthode** : 5 subagents parallèles (3 scouts + 2 researchers) + audit local + docs officielles Convex, Violet, TanStack Start, Expo, React Native
> **Docs consultées** : `docs.convex.dev/llms.txt` (validation, best practices, HTTP actions, React Native), `docs.violet.io/llms.txt` (webhooks, auth), `tanstack.com/llms.txt` (server functions, SSR), `docs.expo.dev/llms.txt` (SecureStore, push), `reactnative.dev/llms.txt`
> **Rapports détaillés** : `/tmp/phase11-audit/` (5 fichiers, 72 KB total)

---

## Table des matières

- [Résultat global](#résultat-global)
- [Troubles existants vs nouveaux](#trouvailles-existantes-vs-nouvelles)
- [Trouvailles critiques](#trouvailles-critiques)
- [Trouvailles importantes](#trouvailles-importantes)
- [Trouvailles moyennes](#trouvailles-moyennes)
- [Trouvailles mineures](#trouvailles-mineures)
- [Points forts confirmés](#points-forts-confirmés)
- [Insight architectural critique](#insight-architectural-critique)
- [Plan d'action](#plan-daction)
- [Checklist de vérification](#checklist-de-vérification)

---

## Résultat global

| Catégorie | 🔴 Critique | 🟠 Important | 🟡 Moyen | 🟢 Mineur |
|-----------|:-----------:|:------------:|:--------:|:---------:|
| Supabase résiduel | 2 | 3 | 2 | 2 |
| Convex best practices | 1 | 1 | 2 | 1 |
| Web ↔ Mobile parité | 0 | 1 | 0 | 0 |
| DRY / KISS | 0 | 0 | 2 | 0 |
| **Total** | **3** | **5** | **4** | **3** |

**Verdict** : Le backend Convex est solide et complet. Le principal travail restant est la **migration du server layer web** (~2 000 lignes Supabase actif dans `apps/web/src/server/`), constituant le dernier obstacle avant la suppression complète de Supabase. Les points DRY/KISS et la parité Web↔Mobile sont globalement bons, avec quelques cleanups mineurs.

---

## Trouvailles existantes vs nouvelles

| # | Description | Sévérité | Source | Statut |
|---|-------------|:--------:|--------|--------|
| C1 | Server layer web ~2 000 lignes Supabase actif | 🔴 | Scout 4, Researcher 2 | **F2 existant** — scope sous-estimé (3 API routes → en réalité 10+ fichiers) |
| C2 | 71/72 fonctions Convex sans `returns` validators | 🔴 | Scout 3, Researcher 1, Docs Convex | **F3 existant** — confirmé critique par les docs officielles |
| I1 | `@supabase/*` dans 2 `package.json` | 🟠 | Scout 4 | Existant — deps listées |
| I2 | `supabase/` folder 644 K | 🟠 | Scout 4, 5 | **F6 existant** — inventaire complet |
| I3 | Export map cassé `packages/shared/package.json` | 🟠 | Scout 4, 5 | **🆕 Nouveau** |
| I4 | 3 champs morts dans `MobileAuthSession` | 🟠 | Scout 4, local | **🆕 Nouveau** |
| M1 | `scripts/generate-sitemap.ts` 100 % Supabase | 🟡 | Scout 5 | **🆕 Nouveau** |
| M2 | Config mobile `supabaseUrl/supabaseAnonKey` | 🟡 | Scout 4, 5 | **🆕 Nouveau** |
| M3 | `assertAdminAction()` manquant pour les actions | 🟡 | Scout 3 | **🆕 Nouveau** |
| M4 | Upsert pattern dupliqué | 🟡 | Scout 3 | **🆕 Nouveau** |
| M5 | Convex Auth tokens ≠ cookies — impact API routes | 🟡 | Researcher 2 | **🆕 Nouveau** — insight architectural |
| M6 | `apiClient.ts` mobile envoie headers vides | 🟡 | Scout 4, Researcher 2 | Partiellement documenté |
| F1 | Re-export shim `authErrors.ts` | 🟢 | Scout 5 | **🆕 Nouveau** |
| F2 | `convex/carts/` répertoire vide | 🟢 | Scout 3 | **🆕 Nouveau** |

---

## Trouvailles critiques

### C1. Server layer web = dernier bastion Supabase (~2 000 lignes actives)

**10+ fichiers** dans `apps/web/src/` utilisent **encore activement** le client Supabase :

| Fichier | Lignes Supabase | Rôle |
|---------|:---------------:|------|
| `server/cartActions.ts` | ~500 lignes, 17+ appels | CRUD panier complet |
| `server/checkout.ts` | 11+ appels `logError(getSupabaseServer(), ...)` | Confirmation commande |
| `server/orderHandlers.ts` | 6+ appels | Liste / détail commandes authentifiées |
| `server/guestOrderHandlers.ts` | 4+ appels | Recherche commandes invité |
| `server/cartSync.ts` | 3+ appels | Synchronisation panier |
| `server/supabaseServer.ts` | Factory centrale | Clients service-role + session |
| `utils/supabase.ts` | Browser client | 0 import — supprimable immédiatement |

**4 API routes** dépendent de Supabase :

| Route | Usage | Migration |
|-------|-------|-----------|
| `api/cart/user.ts` | `supabase.auth.getUser(token)` | → Convex query |
| `api/cart/claim.ts` | `supabase.auth.getUser(token)` | → Convex mutation |
| `api/guest-order-lookup.ts` | `supabase.auth.getUser(jwt)` | → Convex query |
| `api/orders/$orderId.ts` | Branch `source=supabase` | → Supprimer (mobile utilise Convex) |

**Shared packages Supabase-dépendants** :

| Fichier | Usage |
|---------|-------|
| `packages/shared/src/utils/errorLogger.ts` | `logError(supabase: SupabaseClient, ...)` |
| `packages/shared/src/utils/orderPersistence.ts` | `persistOrder(supabase: SupabaseClient, ...)` |
| `packages/shared/src/types/auth.types.ts` | Re-export `Session`, `User`, `AuthError` de `@supabase/supabase-js` |

### C2. `returns` validators manquants — 71/72 fonctions Convex

Seul `health/queries.ts::getStatus` a un `returns` validator. **45 fonctions publiques** (queries + mutations + actions) n'ont aucune validation runtime du retour.

**Impact** (docs officielles Convex — `docs.convex.dev/functions/validation`) :
- Pas de validation runtime des données réactives envoyées aux clients
- Bugs silencieux quand le type TypeScript ne correspond pas aux données réelles
- Convex recommande `returns` sur **toutes** les fonctions publiques en production

**Répartition par priorité** :

| Priorité | Fichiers | Fonctions |
|:--------:|----------|:---------:|
| **P0** | `orders/queries.ts`, `users/queries.ts`, `wishlists/queries.ts` | 10 |
| **P1** | `content/queries.ts`, `notifications/queries.ts`, `tracking/queries.ts` | 7 |
| **P2** | `admin/queries.ts`, `support/queries.ts`, mutations | 28 |

**Pattern de référence** (`convex/health/queries.ts`) :

```typescript
export const getStatus = query({
  args: { now: v.number() },
  returns: v.object({
    status: v.string(),
    timestamp: v.number(),
    backend: v.string(),
  }),
  handler: async (_ctx, { now }) => {
    return { status: "ok", timestamp: now, backend: "convex-self-hosted" };
  },
});
```

---

## Trouvailles importantes

### I1. `@supabase/*` encore dans les `package.json`

| Package.json | Dépendances |
|-------------|-------------|
| `apps/web/package.json` | `@supabase/ssr: ^0.9.0` + `@supabase/supabase-js: ^2.100.1` |
| `packages/shared/package.json` | `@supabase/supabase-js: ^2.100.1` |
| `apps/mobile/package.json` | ✅ Propre |
| `packages/ui/package.json` | ✅ Propre |

### I2. `supabase/` folder — inventaire complet (644 K)

```
supabase/
├── migrations/          55 fichiers SQL (mars–mai 2026)
├── functions/
│   ├── _shared/         7 fichiers (cacheInvalidation, constants, cors,
│   │                    fetchWithRetry, schemas, supabaseAdmin, violetAuth, webhookAuth)
│   ├── handle-webhook/  5 fichiers (index, orderProcessors, payoutAccountProcessors,
│   │                    processors, transferProcessors)
│   ├── health-check/    1 fichier
│   ├── send-notification/ 3 fichiers (index, templates, types)
│   ├── send-push/       2 fichiers (index, types)
│   ├── send-support-email/ 1 fichier
│   └── send-support-reply/ 1 fichier
├── config.toml
├── seed.sql
├── .env
└── snippets/
```

### I3. Export map cassé dans `packages/shared/package.json`

```json
{
  "exports": {
    "./server": "./src/clients/supabase.server.ts"  // ← FICHIER INTROUVABLE (supprimé)
  }
}
```

### I4. 3 champs morts dans `MobileAuthSession`

`apps/mobile/src/context/AuthContext.tsx` expose des champs Supabase de compatibilité avec **0 consommateur** :

- `user: null` — plus aucun composant ne lit `.user`
- `session: null` — plus aucun composant ne lit `.session`
- `isAnonymous: boolean` — plus aucun composant ne lit `.isAnonymous`

Le Web (`WebAuthSession`) n'a pas ces champs → **asymétrie**.

---

## Trouvailles moyennes

### M1. `scripts/generate-sitemap.ts` — 100 % Supabase

Le script `generate:sitemap` importe `@supabase/supabase-js` et interroge Supabase pour les produits et pages de contenu. Doit être réécrit pour Convex.

### M2. Config mobile Supabase résiduelle

| Fichier | Entrée morte |
|---------|-------------|
| `apps/mobile/app.config.ts` (l. 161-163) | `supabaseUrl` + `supabaseAnonKey` dans `extra` — 0 runtime |
| `apps/mobile/eas.json` | `SUPABASE_URL` + `SUPABASE_ANON_KEY` dans 3 profils de build |

### M3. `assertAdminAction()` manquant dans `convex/lib/admin.ts`

`replyToSupportInquiry` (action) appelle manuellement `ctx.runQuery(checkIsAdmin)` car `assertAdmin()` n'accepte que `QueryCtx | MutationCtx`, pas `ActionCtx`. Un helper `assertAdminAction(ctx)` serait plus DRY.

### M4. Upsert pattern dupliqué

`wishlists/mutations.ts` + `notifications/mutations.ts` utilisent le même pattern find-by-index → patch-or-insert. Un helper `upsertDoc(table, index, key, data)` dans `convex/lib/` éliminerait la duplication.

### M5. Convex Auth tokens ≠ cookies — impact API routes (insight architectural)

**Découvert par la researcher TanStack/Expo** :

> Contrairement à Supabase Auth (`@supabase/ssr` stocke les JWT dans des cookies HTTP-only), Convex Auth stocke les tokens dans `localStorage` (web) ou `SecureStore` (mobile). Les API routes TanStack Start **ne peuvent pas lire les tokens Convex** côté serveur.

**Conséquence** : Les 3 API routes Supabase ne peuvent PAS simplement remplacer `supabase.auth.getUser()` par un équivalent Convex. La stratégie DRY/KISS recommandée est de **déplacer la logique dans des Convex queries/mutations** qui ont nativement `ctx.auth.getUserIdentity()`.

### M6. `apiClient.ts` mobile envoie headers vides

`apps/mobile/src/server/apiClient.ts` — `getAuthHeaders()` retourne `{}`. Les endpoints authentifiés (cart, orders) dépendent de la Phase 11 pour la migration.

---

## Trouvailles mineures

### F1. Re-export shim `apps/web/src/utils/authErrors.ts`

`export { mapAuthError } from "@ecommerce/shared"` — 1 ligne, probablement 0 import direct. Tous les consommateurs importent depuis `@ecommerce/shared`.

### F2. `convex/carts/` — répertoire vide

Aucune fonction. Supprimable ou ajouter un README.

### F3. Commentaires Supabase dans `convex/` (27 références)

Tous dans des commentaires (`// Replaces supabase/...`). Aucun impact runtime. Nettoyage cosmétique optionnel.

---

## Points forts confirmés

| Aspect | Statut | Détail |
|--------|:------:|--------|
| **Convex schema** | ✅ | 23 tables, 47 indexes — complet et cohérent |
| **`assertAdmin()`** | ✅ | Appelé systématiquement sur toutes les fonctions admin publiques |
| **HMAC webhook** | ✅ | Validation HMAC-SHA256 via `crypto.subtle.verify()` (constant-time) |
| **`mapAuthError` DRY** | ✅ | Implémentation unique dans `@ecommerce/shared`, consommée web + mobile |
| **localId parité** | ✅ | Web (`localStorage`) ↔ Mobile (`SecureStore`) — même logique, storage adapté |
| **ConvexProvider** | ✅ | Les deux plateformes : `skipConvexDeploymentUrlCheck: true` |
| **Realtime Supabase** | ✅ | 0 souscription active — supprimée (Convex réactif par défaut) |
| **Mobile orders** | ✅ | Migré vers `useQuery(api.orders.queries.getOrderDetail)` — plus de `?source=supabase` |
| **Web auth** | ✅ | `useAuthSession()` avec Convex Auth, localId, identity query |
| **Hooks shared** | ✅ | 8 hooks dans `packages/shared/src/hooks/` — aucune référence Supabase |
| **`withIndex` vs `filter`** | ✅ | Corrigé Phase 8 — confirmé par docs Convex (best practices) |
| **`.collect()` borné** | ✅ | `getAllOrders` utilise `.take(100)` — confirmé par docs Convex |
| **Webhook pipeline** | ✅ | 55+ event types, idempotency, Zod validation, fire-and-forget via `ctx.scheduler` |
| **Push notifications** | ✅ | Batching Expo (max 100), préférences check, `DeviceNotRegistered` cleanup |
| **Email centralisé** | ✅ | `sendRawEmail()` + `escapeHtml()` dans `convex/lib/email.ts` |
| **Tests** | ✅ | 1 020+ tests (505 web + 376 shared + 71 convex + 68 mobile) |

---

## Insight architectural critique

### La séparation des responsabilités est correcte

L'architecture validée par les docs officielles :

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Frontend   │────▶│  Convex Backend   │────▶│  Convex DB  │
│  (Web/Mobile)│     │  (queries/mutations│     │  (23 tables)│
│              │     │   /actions/webhooks│     │             │
└──────┬───────┘     └──────────────────┘     └─────────────┘
       │                      ▲
       │                      │ ctx.auth.getUserIdentity()
       │                      │
       ▼                      │
┌──────────────────┐     ┌────┴─────────────┐
│ TanStack Start    │────▶│  Violet API       │
│  Server Functions │     │  (products, cart,  │
│  (API Routes)     │     │   checkout)       │
│                   │     └──────────────────┘
│  ⚠️ Encore Supabase│
│    pour cart/orders│
└──────────────────┘
```

**Règle** : Les appels Violet API (nécessitant `VIOLET_APP_SECRET`) restent dans les server functions. Les opérations de données (orders, wishlist, profile) doivent être dans Convex — pas dans les API routes.

### Ce qui doit disparaître

Les server functions Supabase (`orderHandlers`, `guestOrderHandlers`, `cartSync`) dupliquent des fonctionnalités **déjà existantes** dans Convex :

| Server function Supabase | Équivalent Convex existant |
|--------------------------|---------------------------|
| `orderHandlers.getOrderList()` | `api.orders.queries.getOrders` |
| `orderHandlers.orderDetailHandler()` | `api.orders.queries.getOrderDetail` |
| `guestOrderHandlers.lookupByToken()` | `api.orders.queries.getGuestOrderByToken` |
| `errorLogger.logError()` | `convex/lib/errors.ts::logError` (internalMutation) |
| `orderPersistence.persistOrder()` | Webhooks Convex (pipeline complet) |

---

## Plan d'action

### Étape 0 — Suppressions zéro risque ✅ TERMINÉ (2026-05-19)

```
├─ 🗑️ apps/web/src/utils/supabase.ts (0 import actif)
├─ 🗑️ packages/shared/package.json → corriger export "./server"
├─ 🗑️ apps/mobile/app.config.ts → supprimer supabaseUrl/supabaseAnonKey
├─ 🗑️ apps/mobile/eas.json → supprimer SUPABASE_* des 3 profils
├─ 🗑️ apps/mobile/src/context/AuthContext.tsx → supprimer user/session/isAnonymous
├─ 🗑️ apps/web/src/utils/authErrors.ts (re-export shim mort)
└─ 🗑️ convex/carts/ (répertoire vide)
```

**Gate** : typecheck ✅ | lint ✅ | 819 tests verts (301 web + 349 shared + 101 convex + 68 mobile)

### Étape 1 — `returns` validators sur 45 fonctions publiques ✅ TERMINÉ (2026-05-19)

```
├─ P0 : orders/queries.ts (4), users/queries.ts (4), wishlists/queries.ts (2)         — 10 fonctions
├─ P1 : content/queries.ts (4), notifications/queries.ts (2), tracking/queries.ts (1) — 7 fonctions
├─ P2 : admin/queries.ts (8), support/queries.ts (4), users/mutations.ts (3),
│       wishlists/mutations.ts (2), notifications/mutations.ts (3),
│       support/mutations.ts (3), tracking/mutations.ts (1),
│       admin/mutations.ts (1 public), lib/email.ts (1), lib/push.ts (1),
│       health/queries.ts (1 — runHealthCheck auparavant manquant)                    — 28 fonctions
└─ Total : 46 returns validators sur 45 fonctions publiques + 1 health check
```

**Fichiers modifiés** (17) : orders/queries, users/queries, wishlists/queries, content/queries, notifications/queries, tracking/queries, admin/queries, support/queries, users/mutations, wishlists/mutations, notifications/mutations, support/mutations, tracking/mutations, admin/mutations, lib/email, lib/push, health/queries

**Gate** : typecheck ✅ | lint ✅ | 819 tests verts (301 web + 349 shared + 101 convex + 68 mobile)

**DRY** : Shared validators extraits dans orders/queries (`enrichedOrderValidator`, `guestEnrichedOrderValidator`, `orderDocValidator`) et content/queries (`contentPageValidator`).

**Note** : `getContentPages` utilise `v.any()` pour le wrapper de pagination (fields `splitCursor`, `pageStatus` trop complexes à typer). Les items internes sont validés par le shared `contentPageValidator`.

**Double check** (2026-05-19) :
- Étape 0 : 7 suppressions/modifications vérifiées ✅
- Étape 1 : 46 `returns` validators sur 45 fonctions publiques + 1 health check ✅
- 4 internal functions sans `returns` (`getHealthDataInternal`, `evaluateAlerts`, `updateAlertTriggerTime`, `deleteInvalidToken`) — conforme aux recommandations Convex
- Gate complète : typecheck ✅ | lint ✅ | 819 tests ✅
- Spot checks : validators DRY avec shared constants, types précis vs schema, `v.union(..., v.null())` pour les nullables

### Étape 2 — DRY improvements dans `convex/lib/` (1 h)

```
├─ Ajouter assertAdminAction(ctx) dans lib/admin.ts
├─ Ajouter upsertDoc(table, index, key, data) dans lib/
└─ Centraliser env key checks (VIOLET_APP_SECRET, RESEND_API_KEY)
```

### Étape 3 — Migration server layer web (6-8 h — le gros morceau)

```
├─ 3 API routes → Convex queries/mutations
│   ├─ api/cart/user.ts → Convex query getCartByUserId
│   ├─ api/cart/claim.ts → Convex mutation claimAnonymousCart
│   └─ api/guest-order-lookup.ts → Convex query getGuestOrderByToken (existe déjà)
├─ orders/$orderId.ts → supprimer branch source=supabase
├─ cartActions.ts → Convex mutations + Violet API (reste dans server functions)
├─ checkout.ts → supprimer persistOrder Supabase (webhooks font le job)
├─ orderHandlers.ts → supprimer (Convex queries le font déjà)
├─ guestOrderHandlers.ts → supprimer (getGuestOrderByToken existe dans Convex)
├─ cartSync.ts → Convex mutations
├─ errorLogger.ts → utiliser convex/lib/errors.ts (existe déjà)
├─ orderPersistence.ts → supprimer (webhooks persister déjà)
└─ 🗑️ supabaseServer.ts (en tout dernier)
```

### Étape 4 — Dépendances et cleanup final (1 h)

```
├─ 🗑️ supabase/ folder (644 K)
├─ bun remove @supabase/* (apps/web + packages/shared)
├─ 🗑️ packages/shared/src/types/auth.types.ts → Convex Auth types
├─ 🗑️ packages/shared/src/types/orderPersistence.types.ts
├─ 🔄 scripts/generate-sitemap.ts → Convex
├─ 🗑️ packages/shared/src/utils/orderPersistence.ts
├─ 🗑️ packages/shared/src/utils/errorLogger.ts
└─ 🗑️ apps/mobile/src/server/apiClient.ts → implémenter getAuthHeaders() Convex
```

### Étape 5 — Data migration (2-3 h)

```
├─ Script scripts/supabase-to-convex-export.js
├─ 17 tables sans remapping ID (IDs Violet = integers/strings)
├─ 5 tables avec remapping UUID → Convex userId (userProfiles, carts, wishlists,
│   userEvents, supportInquiries)
└─ npx convex import pour chaque table
```

---

## Checklist de vérification

Après chaque étape, exécuter :

```bash
# Gate complet
bun run check                              # format + lint + typecheck + test

# Tests par app
bun --cwd=apps/web run test                # ~505 tests web
bun --cwd=packages/shared run test         # ~376 tests shared
bun --cwd=apps/mobile run test             # ~68 tests mobile

# Vérification zéro référence Supabase
grep -rn "supabase\|@supabase" apps/ packages/ convex/ \
  --include='*.ts' --include='*.tsx' \
  | grep -v __tests__ | grep -v node_modules | grep -v '.gen.'

# Backend Convex démarre sans erreur
npx convex dev
```

---

## Fichiers sources de l'audit

| Fichier | Taille | Contenu |
|---------|:------:|---------|
| `/tmp/phase11-audit/convex-functions-audit.md` | 9,8 K | Inventaire des 72 fonctions Convex, `returns` validators, `assertAdmin` |
| `/tmp/phase11-audit/web-mobile-parity-audit.md` | 15,2 K | Parité Web↔Mobile, refs Supabase résiduelles, API routes |
| `/tmp/phase11-audit/dry-kiss-audit.md` | 12,2 K | Code mort, duplications, TODO/FIXME, package.json cleanup |
| `/tmp/phase11-audit/convex-violet-docs.md` | 17,8 K | Best practices Convex + Violet (docs officielles) |
| `/tmp/phase11-audit/tanstack-expo-rn-docs.md` | 17,6 K | Best practices TanStack Start + Expo + React Native |

---

*Dernière mise à jour : 2026-05-19 — Étape 0 + Étape 1 terminées et vérifiées (double check OK), Étape 2 à venir*
