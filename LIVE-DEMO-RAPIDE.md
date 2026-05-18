# 🟣 Live Demo — Rappel Rapide

> Fichier de référence pour le Go-Live Demo Violet.io. Garde ce fichier ouvert pendant le demo.

---

## Démarrage (1 commande)

```bash
./scripts/tunnel.sh start
```

Ça lance Convex + tunnel cloudflared + met à jour les 48 webhooks Violet + webhook Stripe automatiquement.

```bash
./scripts/tunnel.sh status   # vérifier que tout tourne
./scripts/tunnel.sh stop     # arrêter
```

---

## Go-Live Demo — Calendrier

- **Date** : Booké via Cal.com (Brenna Wagner + Ishan Guru)
- **Zoom** : `https://us02web.zoom.us/u/kbRhbkfNs8`
- **Ticket** : TKT-2473 (support@violet.io)

---

## Comptes & Credentials

| Service | Identifiant | Notes |
|---------|-------------|-------|
| **Violet Dashboard** | `channel.violet.io` | App ID `11371`, login `cb.webd.ph@gmail.com` |
| **Stripe Dashboard** | `dashboard.stripe.com` | Account `acct_1TRsMHFrhqgD6M70` (FR) |
| **Convex Dashboard** | `npx convex dashboard` | Local backend port 3210 |
| **Violet API** | `sandbox-api.violet.io/v1` | Test Mode actif |

---

## Checklist du Jour J

### Avant le call

- [ ] `./scripts/tunnel.sh start` — vérifier que tout est vert
- [ ] `./scripts/tunnel.sh status` — confirmer tunnel actif
- [ ] Ouvrir le Stripe Dashboard (compte `acct_1TRsMHFrhqgD6M70`, Test Mode)
- [ ] Ouvrir le Violet Channel Dashboard (`channel.violet.io`)

### Pendant le call — ce que Violet va demander de montrer

| # | Démo | Commentaire |
|---|------|-------------|
| 1 | **Violet Connect** | Montrer l'URL d'onboarding merchant dans le Dashboard |
| 2 | **Catalog Sync** | Naviguer sur l'app → produits visibles |
| 3 | **Checkout complet** | Ajouter au panier → adresse → shipping → paiement → submit |
| 4 | **Paiement Stripe** | Ouvrir Stripe Dashboard → chercher le Payment Intent |
| 5 | **Multi-merchant** | Panier avec 2 merchants si possible |
| 6 | **Webhooks** | Montrer les événements reçus dans Convex logs ou Dashboard |
| 7 | **Distribution/Transfer** | Stripe Dashboard → Transfers visibles |
| 8 | **Order Management** | Page `/account/orders` avec statuts bags |
| 9 | **Error Handling** | Expliquer la gestion 3DS, rate limits, partial failures |
| 10 | **Payment Settings** | Automatic Capture + Automatic Transfer + Merchant Tax Remitter |

### Après le call

- Violet active le **Live Mode** sur l'app
- Le **Live App Secret** apparaît dans le Channel Dashboard
- Mettre à jour `VIOLET_APP_SECRET` en mode Live
- Changer `VIOLET_API_BASE` vers `https://api.violet.io/v1`

---

## Architecture en bref

```
Shopper → App Web (port 3000)
              ↓
         TanStack Start Server Functions
              ↓
         Violet API (sandbox-api.violet.io)
              ↓
         Stripe (acct_1TRsMHFrhqgD6M70)
              ↓
         Merchant Stripe Connect

Violet Webhooks → Tunnel cloudflared → Convex (port 3211)
```

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `scripts/tunnel.sh` | Démarrage infrastructure démo |
| `VIOLET-LIVE-DEMO-CHECKLIST.md` | Checklist complète avec statuts |
| `docs/violet-stripe-credentials-encrypted.json` | Credentials Stripe chiffrés (partagés avec Violet) |
| `convex/webhooks/violet.ts` | Handler webhooks (1826 lignes, 45+ event types) |
| `.env.local` | Variables d'env (Stripe, Violet, Convex) |

---

## En cas de problème

| Problème | Solution |
|----------|----------|
| Tunnel URL morte | `./scripts/tunnel.sh stop && ./scripts/tunnel.sh start` |
| Convex ne démarre pas | Vérifier `npx convex env list` — les vars VIOLET_* doivent être présentes |
| Webhook Violet non reçu | Vérifier `./scripts/tunnel.sh status` + tester `curl -X POST <tunnel-url>/api/webhooks/violet` |
| Paiement échoue | Vérifier `.env.local` → clés Stripe = `pk_test_51TRsMH...` (bon compte) |
| Page blanche checkout | Supabase doit tourner (migration en cours) ou checkout migré vers Convex |
