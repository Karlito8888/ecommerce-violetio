# Audit Phase 4 — 2026-05-18

## Corrections appliquées (6 findings → 6 résolus)

### F1 — Hooks convex morts (🔴 Critique) → ✅ RÉSOLU

**Problème** : `packages/shared/src/hooks/convex/` contenait 7 fichiers + un barrel export (`index.ts`) qui n'étaient **importés par aucun fichier** web ou mobile. Les pages consomment déjà Convex directement (`useQuery(api.xxx)` + `#convex/_generated/api`).

**Fichiers supprimés** :
- `packages/shared/src/hooks/convex/useWishlist.ts`
- `packages/shared/src/hooks/convex/useOrders.ts`
- `packages/shared/src/hooks/convex/useProfile.ts`
- `packages/shared/src/hooks/convex/useTracking.ts`
- `packages/shared/src/hooks/convex/useContent.ts`
- `packages/shared/src/hooks/convex/useNotifications.ts`
- `packages/shared/src/hooks/convex/useSupport.ts`
- `packages/shared/src/hooks/convex/index.ts`

**Export retiré** : `"./hooks/convex": "./src/hooks/convex/index.ts"` dans `packages/shared/package.json`

**Justification** : La doc officielle Convex (React Quickstart) montre `useQuery(api.xxx)` directement dans les composants. Un hook `useWishlistConvex()` qui appelle `useQuery(api.wishlists.queries.getWishlist)` est un proxy inutile (DRY/KISS).

### F2 — Mobile notifications Supabase résiduel (🔴 Critique) → ✅ RÉSOLU

**Problème** : `apps/mobile/src/app/settings/notifications.tsx` importait `useNotificationPreferences`/`useUpdateNotificationPreference` de `@ecommerce/shared` (TanStack Query + Supabase client).

**Correction** : Réécriture complète pour utiliser Convex directement :
- `useQuery(api.notifications.queries.getNotificationPreferences)` pour la lecture
- `useMutation(api.notifications.mutations.upsertNotificationPreference)` pour l'écriture
- Merge local avec `DEFAULT_PREFERENCES` (pattern sparse DB rows + defaults)

**C'était le dernier fichier mobile qui appelait encore du code Supabase actif.**

### F3 — Imports relatifs fragiles (🟡 Moyen) → ✅ RÉSOLU (par F1)

**Problème** : Les 7 fichiers utilisaient `../../../../convex/_generated/api` (chemin relatif à 4 niveaux) au lieu du path alias `#convex/*` — lequel n'est pas configuré dans `packages/shared/tsconfig.json`.

**Résolution** : Les fichiers ont été supprimés (F1). Le path alias `#convex/*` n'est PAS dans `packages/shared/tsconfig.json` intentionnellement : le package shared ne doit pas dépendre du backend Convex.

### F4 — Triple redondance DRY (🟡 Moyen) → ✅ RÉSOLU

**Problème** : Pour chaque fonctionnalité (wishlist, tracking, etc.), il existait 3 copies :
1. Ancien hook Supabase (`packages/shared/src/hooks/useWishlist.ts`)
2. Hook Convex mort (`packages/shared/src/hooks/convex/useWishlist.ts`)
3. Code inline dans les pages web/mobile

**Résolution** :
- Couche 2 (hooks convex morts) : supprimée par F1
- Couche 1 (hooks Supabase orphelins) : 4 hooks Supabene orphelins supprimés (voir détail ci-dessous)
- Couche 3 (code inline) : reste — c'est le pattern retenu (Convex direct dans les pages)

**Hooks Supabase orphelins supprimés** :
- `packages/shared/src/hooks/useWishlist.ts` — 0 consommateur web/mobile
- `packages/shared/src/hooks/useAuth.ts` — 0 consommateur web/mobile
- `packages/shared/src/hooks/useProfile.ts` — 0 consommateur web/mobile
- `packages/shared/src/hooks/useNotificationPreferences.ts` — 0 consommateur web/mobile

**Exports nettoyés** : Le barrel `packages/shared/src/hooks/index.ts` ne référence plus ces 4 fichiers.

**Fonction `mergeWithDefaults` relogée** : Déplacée de `useNotificationPreferences.ts` (supprimé) vers `packages/shared/src/types/notification.types.ts` — endroit canonique pour une fonction pure de merge de types. Exportée via `packages/shared/src/types/index.ts`.

### F5 — Rules of Hooks (🟡 Moyen) → ✅ RÉSOLU (par F1)

**Problème** : `useIsInWishlistConvex` appelait `useWishlistProductIdsConvex(userId)` qui appelle `useQuery(...)`. Le wrapper retournait un `boolean` — pattern fragile de hook-qui-wrap-hook pour un simple derived value.

**Résolution** : Le fichier a été supprimé (F1). Les pages web/mobile implémentent ce check inline (2 lignes) au lieu d'un hook wrapper.

### F6 — `Id` import relatif (🟢 Mineur) → ✅ RÉSOLU (par F1)

**Problème** : `useOrders.ts` importait `Id` depuis `../../../../convex/_generated/dataModel`.

**Résolution** : Le fichier a été supprimé (F1). Les pages qui ont besoin de `Id` l'importent via `#convex/_generated/dataModel` (path alias correct configuré dans le tsconfig de chaque app).

## Vérifications post-correction

| Vérification | Résultat |
|---|---|
| TypeScript web (`tsc --noEmit`) | ✅ Clean |
| TypeScript mobile (`tsc --noEmit`) | ✅ Clean |
| ESLint (`bun run lint --max-warnings 0`) | ✅ Clean |
| Tests web (514 tests) | ✅ Pass |
| Tests shared (376 tests) | ✅ Pass |
| Tests mobile (68 tests) | ✅ Pass |
| Build web (`bun run build`) | ✅ Success |

## Points d'architecture validés

1. **Pattern Convex direct** : Confirmé par la doc officielle — `useQuery(api.xxx)` dans les composants est le pattern idiomatique.

2. **`packages/shared` reste utile pour** :
   - Types partagés (`OrderDetail`, `NotificationType`, `TrackingEvent`, etc.)
   - Utilitaires (`formatPrice`, `buildPageMeta`, `getOrCreateLocalId`, `mapAuthError`)
   - Hook `useTracking` (déduplication pure, agnostique du backend)
   - Query options factories pour Violet API (`ordersQueryOptions`, `contentListQueryOptions`)
   - Adapters Violet (`violetAdapter`, `violetAuth`)
   - `mergeWithDefaults` (maintenant dans `types/notification.types.ts`)

3. **Aucun gap web/mobile** : Toutes les fonctionnalités migrées utilisent Convex des deux côtés avec le même pattern.

4. **DRY/KISS respecté** : La triple redondance est éliminée. Il ne reste qu'une seule couche : le code Convex direct dans les pages.

## Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `packages/shared/src/hooks/convex/*` (8 fichiers) | **Supprimé** |
| `packages/shared/src/hooks/useWishlist.ts` | **Supprimé** |
| `packages/shared/src/hooks/useAuth.ts` | **Supprimé** |
| `packages/shared/src/hooks/useProfile.ts` | **Supprimé** |
| `packages/shared/src/hooks/useNotificationPreferences.ts` | **Supprimé** |
| `packages/shared/src/hooks/index.ts` | **Nettoyé** — retraits des exports orphelins |
| `packages/shared/package.json` | **Nettoyé** — retrait export `"./hooks/convex"` |
| `packages/shared/src/types/notification.types.ts` | **Ajouté** `mergeWithDefaults()` |
| `packages/shared/src/types/index.ts` | **Ajouté** export `mergeWithDefaults` |
| `apps/mobile/src/app/settings/notifications.tsx` | **Réécrit** — Convex direct au lieu de Supabase |
| `MIGRATION-SUPABASE-TO-CONVEX.md` | **Mis à jour** — Phase 4 marquée terminée |
