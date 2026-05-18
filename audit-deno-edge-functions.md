# Audit Deno Edge Functions — 2026-05-14

## Contexte

Analyse DRY/KISS de l'utilisation de Deno Edge Functions (Supabase) vs le web backend Node.js (TanStack Start). Question : **Deno est-il utilisé à juste mesure, ou pourrait-on s'en passer partiellement ?**

## État actuel

| Edge Function | Lignes | Appelé par | Rôle |
|---|---|---|---|
| `handle-webhook` | 2 865 | Violet.io (HTTP POST) | Recevoir + traiter tous les webhooks Violet |
| `health-check` | 385 | Uptime monitors + admin UI | Vérifier connectivité Supabase/Violet/Stripe |
| `send-notification` | 323 | `handle-webhook` (Deno→Deno) | Envoyer emails transactionnels via Resend |
| `send-push` | 259 | `handle-webhook` (Deno→Deno) | Envoyer push notifications via Expo Push API |
| `send-support-email` | 211 | Web backend + mobile (Node→Deno) | Email support visiteur via Resend |
| `send-support-reply` | 144 | Web backend (Node→Deno) | Email réponse admin via Resend |
| `_shared/` | 1 166 | — | Auth, schemas, fetch, cors (dupliqué avec Node) |
| **Total** | **~5 940** | | |

## Code dupliqué Node ↔ Deno

`_shared/` duplique ~800 lignes déjà présentes dans `@ecommerce/shared` et `packages/shared/src/` :

| Fichier | Deno | Node | Équivalent |
|---|---|---|---|
| `violetAuth.ts` | 277 lignes | 248 lignes | `packages/shared/src/clients/violetAuth.ts` |
| `fetchWithRetry.ts` | 209 lignes | 162 lignes | `packages/shared/src/adapters/violetFetch.ts` |
| `schemas.ts` | 426 lignes | 566 lignes | `packages/shared/src/schemas/webhook.schema.ts` |
| `webhookAuth.ts` | 123 lignes | — | Pas d'équivalent Node (webhook inbound = Deno only) |

**Cause racine** : Supabase Edge Functions tournent en Deno et ne peuvent pas `import` le package `@ecommerce/shared`. La duplication est structurelle, pas un choix.

## Verdict par Edge Function

### ✅ `handle-webhook` — JUSTIFIÉ, À CONSERVER

Seul point d'entrée public pour les webhooks Violet.io. Justifications :

1. **URL publique stable** — `https://xxx.supabase.co/functions/v1/handle-webhook` est l'URL enregistrée dans Violet. Les Edge Functions sont serverless, toujours disponibles.
2. **Résilience de déploiement** — Si le web backend redémarre (deploy, cold start), les webhooks continuent d'être reçus. L'Edge Function répond 200 immédiatement (idempotency check) puis process.
3. **Indépendance** — Le webhook handler ne dépend pas du cycle de vie du web backend.

### ⚠️ `send-notification` — ÉLIMINABLE

- Appelé uniquement par `handle-webhook` via `supabase.functions.invoke()` — c'est du **Deno→Deno**
- Contient 2 appels `fetch()` vers Resend API
- **Alternative** : merger directement dans `handle-webhook/orderProcessors.ts`
- **Gain** : -323 lignes, -1 Edge Function, -1 appel inter-function

### ⚠️ `send-push` — ÉLIMINABLE

- Appelé uniquement par `handle-webhook` via `supabase.functions.invoke()` — c'est du **Deno→Deno**
- Contient 1 appel `fetch()` vers Expo Push API + logique anti-spam
- **Alternative** : merger directement dans `handle-webhook/orderProcessors.ts`
- **Gain** : -259 lignes, -1 Edge Function, -1 appel inter-function

### ⚠️ `send-support-email` — ÉLIMINABLE

- Appelé par le **web backend Node.js** (`submitSupportHandler.ts`) et le **mobile** — c'est du **Node→Deno**
- Contient 2 appels `fetch()` vers Resend API (pas de SDK, fetch raw car Deno)
- **Alternative** : appeler Resend directement depuis le web backend (SDK Node.js officiel `resend` disponible) + API Route pour le mobile
- **Gain** : -211 lignes, -1 Edge Function, -1 dépendance Node→Deno

### ⚠️ `send-support-reply` — ÉLIMINABLE

- Appelé uniquement par le **web backend Node.js** (`replySupportInquiryHandler.ts`) — c'est du **Node→Deno**
- Même pattern que `send-support-email` : fetch raw vers Resend
- **Alternative** : Resend SDK Node.js dans le web backend
- **Gain** : -144 lignes, -1 Edge Function

### ⚠️ `health-check` — ÉLIMINABLE

- Appelé par l'admin web et les uptime monitors
- Contient des checks Supabase + Violet API + Stripe + Connection Health
- **Alternative** : API Route TanStack Start (web backend déjà public)
- **Gain** : -385 lignes, -1 Edge Function

## Scénario cible (si refactor)

| Métrique | Avant | Après |
|---|---|---|
| Edge Functions | 6 | **1** (`handle-webhook`) |
| Lignes Deno | ~5 940 | **~4 000** |
| Code dupliqué | ~800 lignes | ~800 lignes (structurel, inchangeable) |
| Appels Deno→Deno | 2 | **0** |
| Appels Node→Deno | 2 | **0** |
| Dépendance Resend | fetch raw (Deno) | SDK Node.js officiel |
| Pipeline webhooks | Deno → Deno → Deno | **Deno → Node** (pour emails/push) |

### Architecture cible

```
Violet.io ──POST──→ handle-webhook (Deno)
                       ├── Upsert DB (Supabase)
                       ├── Envoi email Resend (fetch inline)
                       ├── Envoi push Expo (fetch inline)
                       └── Invalidation cache web backend

Web backend (Node) ──→ Resend SDK Node (emails support)
Mobile           ──→ API Route web backend (emails support)
Uptime monitors  ──→ API Route web backend (health)
```

### Code dupliqué restant (inchangeable)

Même avec 1 seule Edge Function, ces fichiers restent dupliqués car Deno ≠ Node :

- `violetAuth.ts` — VioletTokenManager (login, refresh, dedup)
- `fetchWithRetry.ts` — retry 429 + retry 401
- `schemas.ts` — Zod webhook payloads (30+ events)
- `webhookAuth.ts` — HMAC-SHA256 validation
- `constants.ts` — MAX_RETRIES, BASE_DELAY_MS, etc.

**Note** : Supabase a annoncé le support natif de Node.js dans les Edge Functions (Deno 2 + npm specifiers). Quand ce sera stable, on pourra `import` directement `@ecommerce/shared` et éliminer la duplication. En attendant, c'est un maintenance cost acceptable.

## Décision

**Reporté** — Pas de refactor immédiat. Le fonctionnement actuel est correct et stable. Le refactor sera envisagé quand :
1. Le coût de maintenance de la duplication Node↔Deno devient un problème réel (oubli de sync, bugs divergents)
2. Supabase supporte nativement les imports npm dans les Edge Functions
3. On a un créneau dédié pour ce travail mécanique mais risqué (handle-webhook est critique)
