# Design : Intégration Stripe + Commissions Violet

**Date** : 2026-03-29
**Statut** : Approuvé
**Contexte** : Maison Émile — plateforme e-commerce multi-marchands via Violet.io

---

## Objectif

Mettre en place l'infrastructure de paiement complète pour recevoir les commissions Violet :

1. Connecter un compte Stripe Platform à Violet (M1)
2. Persister les vrais taux de commission par bag (M2)
3. Syncer les distributions Violet par commande (M3)
4. Préparer le go-live avec Violet (M4)

---

## État actuel

- Checkout Stripe Elements : **entièrement implémenté** (adresse → shipping → customer → paiement → submit)
- SupplierAdapter / VioletAdapter : **complet**
- Webhooks Violet (HMAC, idempotence, processors) : **complets**
- Commission dashboard admin : **existe mais hardcode 10% pour tous les marchands**
- Clés Stripe : **placeholders** (`pk_test_placeholder`), `STRIPE_SECRET_KEY` absent partout
- Distributions Violet : **aucun code existant**

---

## Architecture cible

```
Acheteur → Stripe Elements → Violet (payment_intent) → Marchands
                                ↓
               Notre compte Stripe Platform (commissions)
                                ↓
             order_bags.commission_rate  (taux réel par bag)
                                ↓
             order_distributions        (montants exacts par commande)
                                ↓
             Admin dashboard            (vrais chiffres, pas 10% estimé)
```

**Principe clé** : Violet reste source de vérité pour tout le commerce. Supabase est un miroir local pour les requêtes admin et l'historique. On ne bypasse jamais Violet pour les paiements.

---

## M1 — Configuration externe + clés Stripe

### Prérequis (actions manuelles, hors code)

1. Créer un compte Stripe sur [stripe.com](https://stripe.com)
2. Activer Stripe Connect (Settings → Connect settings → Platform)
3. Compléter le KYC Stripe (identité + coordonnées bancaires)
4. Lier le compte Stripe Platform à Violet via [channel.violet.io](https://channel.violet.io) → App Settings → Payments

### Changements code

**Fichiers `.env` à mettre à jour :**

| Variable                             | Fichier(s)                                           | Action                          |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------- |
| `VITE_STRIPE_PUBLISHABLE_KEY`        | `.env.local`, `apps/web/.env.local`                  | Remplacer `pk_test_placeholder` |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `apps/mobile/.env.local`                             | Remplacer `pk_test_placeholder` |
| `STRIPE_SECRET_KEY`                  | `.env.local`, `apps/web/.env.local`, `supabase/.env` | Ajouter (absent partout)        |

**`.env.example` à mettre à jour :**
Ajouter `STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key` et `STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret` — les deux sont absents aujourd'hui.

### Validation M1

Une commande test passée en sandbox avec `pk_test_...` réel affiche le `PaymentElement` sans erreur, accepte `4242 4242 4242 4242`, et crée une commande dans Supabase.

---

## M2 — Vrais taux de commission

### Problème

`mv_commission_summary` hardcode `10.0` comme taux pour tous les marchands. Violet renvoie le vrai taux dans chaque bag au moment de la soumission de commande.

### Décision architecturale

Stocker le taux **au moment de la commande** (snapshot), pas le récupérer à la volée. Si Violet modifie le taux plus tard, les commissions historiques restent correctes — même principe que `order_items.price` qui capture le prix unitaire au moment de l'achat.

### Changements

**1. Migration SQL** — `order_bags.commission_rate` :

```sql
ALTER TABLE order_bags
  ADD COLUMN commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.0;

COMMENT ON COLUMN order_bags.commission_rate IS
  'Commission rate (%) from Violet at time of order. Snapshot — not updated retroactively.';
```

Le `DEFAULT 10.0` couvre les bags déjà en base (rétrocompatibilité).

**2. `persistAndConfirmOrderFn`** (`apps/web/src/server/checkout.ts`) :

- Lire `bag.commissionRate` depuis la réponse `OrderSubmitResult`
- L'inclure dans l'INSERT `order_bags`

**3. `mv_commission_summary`** — remplacer `10.0 AS commission_rate_pct` par `AVG(ob.commission_rate) AS commission_rate_pct` et passer `ob.commission_rate` à `estimate_commission()` bag par bag.

**4. `fn_dashboard_metrics_by_range`** — même correction, utiliser `ob.commission_rate` au lieu du `DEFAULT 10.0` implicite.

**5. Type `CommissionSummary`** (`packages/shared/src/types/admin.types.ts`) — vérifier que `commissionRatePct` est déjà présent (il l'est), aucun changement nécessaire.

### Validation M2

Le dashboard admin affiche des taux différents selon les marchands, reflétant ce que Violet a configuré — plus de `10%` identique partout.

---

## M3 — API Distributions Violet

### Contexte

Les distributions sont le niveau de détail le plus fin des paiements Violet : pour chaque commande, combien le channel a reçu (brut), combien Stripe a prélevé, et combien le marchand a touché.

Violet n'envoie pas de webhook pour les distributions → **fetch à la demande** uniquement.

Endpoints Violet utilisés :

- `GET /v1/orders/{orderId}/distributions`

### Nouvelle table `order_distributions`

```sql
CREATE TABLE order_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_bag_id UUID NOT NULL REFERENCES order_bags(id) ON DELETE CASCADE,
  violet_order_id TEXT NOT NULL,
  violet_bag_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('PAYMENT', 'REFUND', 'ADJUSTMENT')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'QUEUED', 'SENT', 'FAILED')),
  channel_amount_cents INTEGER NOT NULL DEFAULT 0,
  stripe_fee_cents INTEGER NOT NULL DEFAULT 0,
  merchant_amount_cents INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (violet_order_id, type, COALESCE(violet_bag_id, ''))
);

-- RLS : service_role uniquement (même pattern que mv_commission_summary)
ALTER TABLE order_distributions ENABLE ROW LEVEL SECURITY;
```

La contrainte `UNIQUE (violet_order_id, violet_bag_id, type)` garantit l'idempotence des syncs — même pattern que `webhook_events.event_id`.

### Nouveau Server Function `syncOrderDistributionsFn`

Fichier : `apps/web/src/server/distributions.ts`

- Appelle `GET /v1/orders/{violet_order_id}/distributions` via VioletAdapter
- Upsert dans `order_distributions` (ON CONFLICT DO UPDATE)
- Retourne les distributions persistées
- Appelé depuis : page de confirmation + bouton "Sync" du dashboard admin

### Nouveau `SupplierAdapter` method

```typescript
getOrderDistributions(violetOrderId: string): Promise<ApiResponse<Distribution[]>>;
```

À ajouter dans `supplierAdapter.ts` et implémenter dans `violetAdapter.ts`.

### Client Supabase

Nouvelle fonction `getOrderDistributions(violetOrderId: string)` dans `packages/shared/src/clients/admin.ts` — SELECT sur `order_distributions` avec JOIN `order_bags`.

### Admin dashboard

Nouvelle section sous `CommissionTable` :

- Tableau par commande : `type | status | commission brute | frais Stripe | net channel`
- Bouton "Sync distributions" → appelle `syncOrderDistributionsFn`

### Validation M3

Dans le dashboard admin, une commande affiche `PAYMENT | SENT | brut: $9.00 | stripe: -$3.20 | net: $5.80` — vrais chiffres Violet.

---

## M4 — Go-live checklist

### Checklist technique (avant de contacter Violet)

**Stripe**

- [ ] Compte Stripe Platform live (KYC validé)
- [ ] Clés live (`pk_live_...`, `sk_live_...`) dans les `.env` de production
- [ ] Stripe Connect activé et lié à Violet en live

**Violet Connect**

- [ ] App name, logo, URL de redirection configurés sur `channel.violet.io`
- [ ] Au moins un marchand onboardé et testé en sandbox
- [ ] Taux de commission configurés par marchand

**Application**

- [ ] Checkout complet testé (toutes étapes, y compris 3DS)
- [ ] Page de confirmation affiche les distributions réelles
- [ ] Remboursement test effectué, commission inversée correctement
- [ ] Dashboard admin : commissions et distributions visibles

**Variables d'environnement production**

- [ ] `VIOLET_API_BASE` → `https://api.violet.io/v1`
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`
- [ ] `STRIPE_SECRET_KEY` → `sk_live_...`

### Artefact

Fichier `docs/go-live-checklist.md` — checklist vivante à cocher au fur et à mesure, à partager avec Violet lors du go-live demo.

### Validation M4

Email envoyé à `support@violet.io` pour planifier le go-live demo.

---

## Fichiers à créer / modifier

| Action | Fichier                                                                            | Jalon |
| ------ | ---------------------------------------------------------------------------------- | ----- |
| UPDATE | `.env.example`                                                                     | M1    |
| UPDATE | `supabase/.env.example`                                                            | M1    |
| UPDATE | `.env.local` (valeurs réelles)                                                     | M1    |
| CREATE | `supabase/migrations/YYYYMMDD_commission_rate.sql`                                 | M2    |
| UPDATE | `supabase/migrations/20260402000001_admin_views.sql` (ou nouvelle migration patch) | M2    |
| UPDATE | `apps/web/src/server/checkout.ts` — `persistAndConfirmOrderFn`                     | M2    |
| CREATE | `supabase/migrations/YYYYMMDD_order_distributions.sql`                             | M3    |
| UPDATE | `packages/shared/src/adapters/supplierAdapter.ts`                                  | M3    |
| UPDATE | `packages/shared/src/adapters/violetAdapter.ts`                                    | M3    |
| UPDATE | `packages/shared/src/types/` — type `Distribution`                                 | M3    |
| UPDATE | `packages/shared/src/clients/admin.ts`                                             | M3    |
| CREATE | `apps/web/src/server/distributions.ts`                                             | M3    |
| UPDATE | `apps/web/src/routes/admin/index.tsx`                                              | M3    |
| UPDATE | `apps/web/src/components/admin/CommissionTable.tsx`                                | M3    |
| CREATE | `docs/go-live-checklist.md`                                                        | M4    |

---

## Ce qui ne change pas

- Flow checkout complet (`checkout.ts`, `cartActions.ts`, etc.)
- Webhooks Violet (`handle-webhook/`)
- `SupplierAdapter` pour le catalog et le cart
- Routing TanStack, styles BEM, tests existants
