# Violet.io Integration Guide

**Document Date:** 2026-03-03
**Author:** Charles BOURGAULT
**Project:** Digital Personal Shopper (E-commerce white-label affiliate platform)
**Status:** Account Created & System Explored

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Account Setup Process](#account-setup-process)
3. [System Architecture](#system-architecture)
4. [Merchants & Products](#merchants--products)
5. [Data Structure](#data-structure)
6. [API Credentials](#api-credentials)
7. [Next Steps](#next-steps)
8. [Key Learnings](#key-learnings)

---

## Executive Summary

**What is Violet.io?**

Violet is an **Embedded Commerce API platform** that enables channels (like your "Digital Personal Shopper") to:

- Connect to multiple merchant stores (Shopify, custom APIs)
- Access product catalogs via API
- Process orders without becoming a merchant
- Manage commissions and payouts
- Handle webhooks for real-time order updates

**Your Account Status:**

- ✅ Channel account created
- ✅ Organization set up (solo mode)
- ✅ 3 demo merchants pre-connected for testing
- ✅ Ready to explore API & build integrations

**Key Advantage for Your Project:**
Violet handles the complex infrastructure (catalog sync, checkout orchestration, payment routing, merchant liability). You focus on UX, AI search, and content marketing.

---

## Account Setup Process

### Step 1: Account Creation (Completed ✅)

**URL:** `https://channel.violet.io/signup`

**Form Fields Filled:**

- **First Name:** Charles
- **Last Name:** BOURGAULT
- **Email Address:** cb.webd.ph@gmail.com
- **Company Function:** Marketplace
- **Password:** [Secure password created]
- **Accepted:** Terms & Conditions + Privacy Policy

**Why "Marketplace"?**

- You're aggregating multiple merchants in one storefront
- You're not a traditional affiliate (no redirects)
- You're building a unified shopping experience
- StyleSphere fits this model perfectly

### Step 2: Organization Setup (Completed ✅)

**URL:** `https://channel.violet.io/create-org/invites`

**Decision:** Skipped member invites

- Solo-dev mode is appropriate for MVP
- You can invite collaborators later via the Configuration panel

### Step 3: Account Activated (Completed ✅)

**URL:** `https://channel.violet.io/overview`

**Access Granted To:**

- Dashboard (analytics, KPIs)
- Merchants directory
- Commission tracking
- Order management
- Webhooks configuration
- API credentials

---

## System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────┐
│  Your "Digital Personal Shopper" Frontend               │
│  (TanStack web + Expo/React Native mobile)              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ REST API + GraphQL (optional)
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Your Backend (Supabase + Edge Functions)               │
│  - Product indexing (pgvector for AI search)            │
│  - Cart management                                      │
│  - Order orchestration                                  │
│  - Webhook handlers                                     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ Violet.io Unified API
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Violet.io Channel Platform                             │
│  - Merchant connections                                 │
│  - Catalog aggregation                                  │
│  - Checkout orchestration                               │
│  - Commission tracking                                  │
└──────────────┬─────────┬──────────────┬─────────────────┘
               │         │              │
        ┌──────┴─┐ ┌─────┴──┐  ┌───────┴────┐
        ↓        ↓ ↓        ↓  ↓            ↓
   Shopify   Custom  Stripe  PayPal    Webhooks
   Stores    APIs    Payment  Payment   (Order
             (via    Gateway  Gateway   Updates)
             Violet)
```

### Your Role vs. Violet's Role

| Responsibility           | Your System          | Violet.io                 |
| ------------------------ | -------------------- | ------------------------- |
| User Interface           | ✅ TanStack/Expo     | -                         |
| Product Search/Discovery | ✅ AI + pgvector     | -                         |
| Cart Management          | ✅ Your backend      | -                         |
| Merchant Connections     | -                    | ✅ API setup + sync       |
| Catalog Aggregation      | -                    | ✅ Unified API            |
| Checkout Flow            | ✅ Frontend UX       | ✅ Unified orchestration  |
| Payment Processing       | -                    | ✅ Routing to merchant    |
| Order Tracking           | ✅ Real-time display | ✅ Webhook updates        |
| Commission Accounting    | -                    | ✅ Auto-calculated        |
| Payout Management        | -                    | ✅ Direct to your account |

---

## Merchants & Products

### Understanding Merchant Types

#### **Demo Merchants (Current)**

Violet provides 3 pre-connected demo merchants for testing:

| ID    | Name                    | Status        | Platform | Purpose                          |
| ----- | ----------------------- | ------------- | -------- | -------------------------------- |
| 10225 | StyleSphere [DEMO]      | ✅ Complete   | Shopify  | Full testing (14 products ready) |
| 10226 | Apparel Avenue [DEMO]   | ⚠️ Incomplete | Shopify  | Configuration testing            |
| 10228 | Homestead Market [DEMO] | ⚠️ Incomplete | Shopify  | Configuration testing            |

**Why "Complete" vs "Incomplete"?**

- **Complete:** All 5 setup steps done (Connection, Scopes, Catalog, Payout, Commission Rate)
- **Incomplete:** Missing some configurations (API keys, payout details, etc.)

#### **Real Merchants (Future)**

Once you're ready to launch:

1. **Browse Violet Marketplace** — Violet.io/explore shows available merchants
   - Space Drinks
   - Violet Gallery
   - (and others)

2. **Direct Integration** — Contact merchants directly to join your platform

3. **Public Registration** — Create a page where merchants can request to connect

### StyleSphere Inventory

**14 Products Available:**

| Product                            | Price   | Category     | Status    |
| ---------------------------------- | ------- | ------------ | --------- |
| Unicorn Hoodie                     | $201.00 | Mens Shirt   | Available |
| Velvet Cape                        | $23.00  | Outerwear    | Available |
| Cosmic Shirt                       | $108.00 | Womens Shirt | Available |
| Steampunk Vest                     | $53.00  | Outerwear    | Available |
| Garden Pixie Skirt                 | $214.00 | Womens Dress | Available |
| Enchanted Forest Green Velvet Cape | $20.00  | Outerwear    | Archived  |
| Yellow Pants                       | $129.00 | Mens Pants   | Available |
| (+ 7 more)                         | ...     | ...          | ...       |

**Key Observations:**

- Products have diverse pricing ($20-$214)
- Multiple categories (shirts, outerwear, dresses, pants)
- Tags for filtering (e.g., "mens shirt example", "womens dress example")
- Archived items won't show to customers
- All ready to sell immediately

---

## Data Structure

### Product Data Model (from Violet API)

```json
{
  "offers": [
    {
      "id": "59398",
      "offer_id": "59398",
      "name": "Unicorn Hoodie",
      "description": "...",
      "price": {
        "amount": 201.0,
        "currency": "USD"
      },
      "merchant_id": "10225",
      "merchant_name": "StyleSphere",
      "image_url": "https://...",
      "images": ["https://...", "https://..."],
      "tags": ["mens", "shirt", "example"],
      "status": "available",
      "sku": "...",
      "inventory": {
        "available": true,
        "quantity": 100
      }
    }
  ]
}
```

### Order Data Model (Checkout Request)

```json
{
  "cart": {
    "items": [
      {
        "offer_id": "59398",
        "merchant_id": "10225",
        "quantity": 1,
        "price": 201.0
      }
    ],
    "customer": {
      "email": "user@example.com",
      "name": "Customer Name",
      "address": "..."
    }
  }
}
```

### Webhook Event Model (Order Update)

```json
{
  "event_type": "order.created",
  "merchant_id": "10225",
  "order_id": "order_12345",
  "status": "pending",
  "items": [...],
  "timestamp": "2026-03-03T17:50:00Z"
}
```

---

## API Credentials

### Your Channel Credentials

**Dashboard Location:** `https://channel.violet.io/overview`

| Credential      | Value          | Usage                                             |
| --------------- | -------------- | ------------------------------------------------- |
| **App ID**      | `11371`        | Public identifier for your channel                |
| **Secret Key**  | `••••••••••••` | Private key for API authentication (KEEP SECURE!) |
| **Environment** | Test Mode      | For development (switch to Live later)            |

### How to Use Credentials

**In Your Backend (Supabase Edge Functions):**

```typescript
// Authenticate with Violet API
const response = await fetch(
  "https://api.violet.io/v1/merchants/10225/offers",
  {
    headers: {
      Authorization: `Bearer ${VIOLET_APP_ID}:${VIOLET_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  },
);
```

**Environment Variables to Store (in Supabase):**

```
VIOLET_APP_ID=11311
VIOLET_SECRET_KEY=<your_secret_key>
VIOLET_API_BASE=https://api.violet.io/v1
VIOLET_MODE=test  # or 'live' later
```

### Credential Safety

⚠️ **CRITICAL:**

- Never expose `VIOLET_SECRET_KEY` in frontend code
- Only use it in backend (Supabase Edge Functions)
- Rotate keys if compromised
- Use environment variables, not hardcoded strings

---

## Next Steps

### Phase 1: Integration Testing (Week 1-2)

**Immediate Actions:**

1. **Retrieve Full API Documentation**
   - Visit `https://docs.violet.io`
   - Download API reference for:
     - GET `/merchants/{id}/offers`
     - POST `/checkout/create`
     - GET `/orders/{id}`
     - Webhooks setup

2. **Configure Webhooks** ✅ CRITICAL
   - Go to `https://channel.violet.io` → Configuration → Webhooks
   - Set webhook URL: `https://your-backend.com/webhooks/violet`
   - Events to enable:
     - `order.created`
     - `order.updated`
     - `order.shipped`
     - `order.delivered`

3. **Test API Endpoints** (via Postman or cURL)

   ```bash
   # Get product catalog from StyleSphere
   curl -X GET "https://api.violet.io/v1/merchants/10225/offers" \
     -H "Authorization: Bearer 11371:YOUR_SECRET_KEY"

   # Get merchant details
   curl -X GET "https://api.violet.io/v1/merchants/10225" \
     -H "Authorization: Bearer 11371:YOUR_SECRET_KEY"
   ```

4. **Test Checkout Flow**
   - Create test cart with Unicorn Hoodie
   - Trigger checkout
   - Verify payment routing
   - Check webhook delivery

### Phase 2: Backend Integration (Week 3-4)

1. **Build Supabase Tables**

   ```sql
   CREATE TABLE violet_products (
     id BIGINT PRIMARY KEY,
     offer_id TEXT,
     merchant_id TEXT,
     name TEXT,
     price DECIMAL,
     tags TEXT[],
     image_url TEXT,
     embedding vector(1536),  -- for AI search
     updated_at TIMESTAMP
   );

   CREATE TABLE violet_orders (
     id UUID PRIMARY KEY,
     violet_order_id TEXT,
     merchant_id TEXT,
     status TEXT,
     items JSONB,
     created_at TIMESTAMP
   );
   ```

2. **Build Edge Functions**
   - `/functions/sync-violet-products` — Fetch and index products
   - `/functions/webhook-violet` — Handle incoming webhooks
   - `/functions/create-violet-order` — Send cart to Violet checkout

3. **Implement Product Sync**
   - Daily cron job to refresh StyleSphere catalog
   - Index into pgvector for AI search
   - Update inventory status

4. **Build Cart → Order Pipeline**
   - User adds product to cart
   - Backend calls `/checkout/create` on Violet
   - Get checkout URL or embedded widget
   - Route payment to merchant
   - Store order in your database

### Phase 3: Frontend Implementation (Week 5-6)

1. **TanStack Frontend**
   - Product grid powered by Violet data
   - AI conversational search (powered by pgvector)
   - Cart UI (stores locally until checkout)
   - Checkout form (integrates with Violet)

2. **React Native Mobile App (Expo)**
   - Same UI components (cross-platform)
   - Push notifications for order updates
   - Wishlist persistence
   - Cross-device cart sync

3. **SEO Content**
   - "Best Unicorn Hoodies" guides
   - Product comparison pages
   - Category landing pages

---

## Key Learnings

### 1. Violet is NOT Your Merchant

**What this means:**

- You are the **channel** (Charles)
- Merchants are **suppliers** (StyleSphere, others)
- Merchant of Record (MoR) stays with merchant
- You earn **affiliate commissions** only
- You never touch payment processing or inventory

**Why this matters for your model:**
✅ No complex accounting (no assets/liabilities)
✅ No inventory risk
✅ Pure service provider status
✅ Compatible with Philippines Sole Proprietorship

### 2. Adapter Pattern Validation

Your original brainstorming idea to use **Adapter Pattern** is exactly right:

```typescript
// Your architecture
interface CatalogAdapter {
  getProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product>;
  search(query: string): Promise<Product[]>;
}

class VioletAdapter implements CatalogAdapter {
  async getProducts() {
    return fetch(`/v1/merchants/${merchantId}/offers`, ...)
  }
}

// Future: easily swap Violet for another provider
class FirmlyAdapter implements CatalogAdapter { ... }
class GoogleUCPAdapter implements CatalogAdapter { ... }
```

This means:

- **Low switching costs** if Violet terms change
- **Flexibility** to add multiple providers
- **Future-proof** for Google UCP (Jan 2026 launch)

### 3. Demo Merchants = Perfect for MVP

**Why start with StyleSphere:**

- ✅ 14 real products immediately available
- ✅ Full configuration already done
- ✅ No merchant approval needed
- ✅ Perfect for testing UX flow
- ✅ Can go live with this alone (though limited)

**Real merchants come later:**

- Once you prove the model works
- Once your UX is validated
- Once you have SEO traffic to send to them

### 4. The "Invisible White-Label" Tension

**Original concern from product brief:**

- "White-label" means users don't know it's an affiliate
- But FTC requires disclosure

**Violet's solution:**

- Display merchant logos openly
- Show commission model transparently
- Position as "curated marketplace" not "fake store"
- This actually **increases trust** vs. deceptive white-label

**For your positioning:**
"We partner with the best brands and earn a commission. That's how we stay independent."
— This is **honest affiliate marketing**, which is better than pretending.

### 5. Commission Rates Start at 0%

**Current status:** 0% commission from StyleSphere (demo setup)

**Real negotiations:**

- Typically 5-15% depending on merchant
- Some merchants pay flat fees
- Negotiate per merchant
- Violet helps facilitate deals

**For MVP:**

- Launch with 1-2 merchants at fair rates
- Focus on volume (repeat customers) not margin
- Commission revenue is bonus, not primary business model

### 6. Webhooks are Critical

**Why you need webhooks:**

- Customer places order → Violet notifies you immediately
- You display "Order confirmed" page
- Real-time order tracking
- Push notifications on mobile

**Without webhooks:**

- You'd have to poll API constantly (inefficient)
- Delays in order status (bad UX)
- Can't send push notifications

**Action required:**
Go to Configuration → Webhooks and configure your endpoint immediately after backend is set up.

---

## Dashboard Walkthrough

### Main Dashboard (`/overview`)

**Top Section:**

- Mode indicator (Test Mode warning)
- Date range selector
- App ID & Secret Key display

**KPI Cards:**

- **Total GOV** (Gross Order Value) — Total $ of orders
- **Commission** — Your earnings
- **Orders** — Number of sales
- **Avg Order Value** — Average cart size
- **Avg Commission %** — Effective commission rate

**Sections:**

- **New Merchants** — Recently connected suppliers
- **Top Merchants** — Highest revenue sources
- **Needs Attention** — Configuration issues (if any)

### Left Navigation

| Menu Item            | Purpose                            |
| -------------------- | ---------------------------------- |
| **Home**             | Dashboard view                     |
| **Notifications**    | System alerts (API issues, etc.)   |
| **Messages**         | Merchant communications            |
| **Merchants**        | View/manage connected suppliers    |
| **Commission Rates** | Set earning % per merchant         |
| **Payouts**          | View your earnings & transfers     |
| **Orders**           | Complete order history             |
| **Offers**           | Product catalog management         |
| **Webhooks**         | Configure event notifications      |
| **Configuration**    | Account settings & API credentials |

---

## Comparison: Violet vs. Alternatives

### Why Violet (vs. Shopify, WooCommerce, Dropshipping)

| Feature          | Violet  | Shopify    | WooCommerce | Dropshipping        |
| ---------------- | ------- | ---------- | ----------- | ------------------- |
| Merchant Status  | ❌ No   | ✅ Yes     | ✅ Yes      | ✅ Yes (buy/resell) |
| Inventory Risk   | ❌ No   | ✅ Yes     | ✅ Yes      | ⚠️ Partial          |
| Payment Risk     | ❌ No   | ⚠️ Medium  | ⚠️ Medium   | ⚠️ Medium           |
| API Integration  | ✅ Full | ⚠️ Limited | ⚠️ Plugins  | ❌ No               |
| White-Label      | ✅ Yes  | ❌ No      | ❌ No       | ❌ No               |
| Checkout Control | ✅ Full | ⚠️ Medium  | ⚠️ Medium   | ❌ Redirects        |
| Commission Model | ✅ Yes  | ❌ No      | ❌ No       | ✅ Yes (buy/resell) |
| Complexity       | Low     | High       | High        | Medium              |
| Cost (startup)   | Low     | Medium     | Low         | Low                 |

---

## Files & Resources

### Violet.io Resources

| Resource             | URL                        | What It Has                 |
| -------------------- | -------------------------- | --------------------------- |
| API Documentation    | https://docs.violet.io     | All endpoint specifications |
| API Playground       | https://api.violet.io/docs | Interactive API testing     |
| Merchant Marketplace | https://violet.io/channels | Browse available suppliers  |
| Status Page          | https://status.violet.io   | Service health              |
| Community Slack      | (via signup)               | Support + peer help         |

### Your Dashboard

| Page          | URL                                              | What To Do                    |
| ------------- | ------------------------------------------------ | ----------------------------- |
| Overview      | https://channel.violet.io/overview               | View KPIs, check alerts       |
| Merchants     | https://channel.violet.io/merchants              | Manage merchant connections   |
| Configuration | https://channel.violet.io/configuration          | Set webhooks, update API keys |
| Orders        | https://channel.violet.io/orders                 | View order history            |
| Webhooks      | https://channel.violet.io/configuration/webhooks | Configure event notifications |

---

## Quick Reference

### Credentials

- **App ID:** 11371
- **Secret Key:** [Stored securely in environment]
- **Environment:** Test Mode
- **Mode Toggle:** Dashboard → Mode → Live (when ready)

### Test Merchant

- **Merchant ID:** 10225 (StyleSphere)
- **Products:** 14 items ready
- **Status:** Complete & ready to sell

### Next Action

🔴 **BLOCKING:** Configure webhooks before writing order handling code
🟡 **IMPORTANT:** Retrieve full API docs and test endpoints
🟢 **NICE TO HAVE:** Explore Commission Rates and Payout setup

---

## Summary

**What You've Accomplished:**

- ✅ Created Violet channel account
- ✅ Explored system architecture
- ✅ Understood merchant ecosystem
- ✅ Reviewed product data structure
- ✅ Retrieved API credentials

**What's Clear Now:**

- Violet handles merchant infrastructure complexity
- You own the UX/discovery/content layer
- Adapter Pattern approach is validated
- Demo merchants are perfect for MVP testing
- Commission model is financially viable

**Next Milestone:**
Implement Violet integration in Supabase backend with product sync, webhook handling, and checkout flow.

---

**Document Version:** 1.0
**Last Updated:** 2026-03-03
**Next Review:** After backend integration starts
