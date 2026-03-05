# Violet.io Implementation Action Plan

**Created:** 2026-03-03
**Current Status:** Account Created + System Explored
**Target:** MVP Launch with StyleSphere (March - April 2026)

---

## 🚀 Immediate Actions (This Week)

### 1. 🔑 Secure API Credentials

**Status:** ⏳ TODO

**What to do:**

1. Go to `https://channel.violet.io/overview`
2. Copy your **App ID** (11371) and **Secret Key**
3. Store in `.env.local` (NEVER commit to git):
   ```
   VIOLET_APP_ID=11371
   VIOLET_SECRET_KEY=<your_secret_key>
   VIOLET_MODE=test
   ```

**Time:** 5 minutes

---

### 2. 📖 Read Violet API Documentation

**Status:** ⏳ TODO

**What to do:**

- Visit `https://docs.violet.io`
- Read these sections:
  - "Getting Started" → Authentication
  - "Merchants" → Get merchant details
  - "Offers/Products" → Fetch catalog
  - "Checkout" → Create orders
  - "Webhooks" → Event subscriptions

**Deliverable:**

- [ ] Understand `/merchants/{id}/offers` endpoint
- [ ] Understand `/checkout/create` endpoint
- [ ] Know webhook event types needed

**Time:** 1-2 hours

---

### 3. 🔌 Configure Webhooks (BLOCKING)

**Status:** ⏳ TODO

**Critical:** You MUST do this before writing order handling code.

**What to do:**

1. Go to `https://channel.violet.io/configuration`
2. Navigate to **Webhooks**
3. Add new webhook endpoint:
   ```
   URL: https://your-backend.com/webhooks/violet
   Events to enable:
   - order.created
   - order.updated
   - order.shipped
   - order.delivered
   - payment.completed
   - payment.failed
   ```

**Deliverable:**

- [ ] Webhook URL registered with Violet
- [ ] Test event sent successfully
- [ ] Your backend receives test payload

**Time:** 30 minutes setup + 1 hour testing

**Note:** You'll need a public backend URL (Supabase deployment or ngrok tunnel for testing)

---

### 4. 🧪 Test API Endpoints

**Status:** ⏳ TODO

**What to do:**

Test with Postman or cURL:

```bash
# 1. Get StyleSphere products
curl -X GET "https://api.violet.io/v1/merchants/10225/offers" \
  -H "Authorization: Bearer 11371:YOUR_SECRET_KEY" \
  -H "Content-Type: application/json"

# 2. Get merchant details
curl -X GET "https://api.violet.io/v1/merchants/10225" \
  -H "Authorization: Bearer 11371:YOUR_SECRET_KEY"

# 3. Create test checkout
curl -X POST "https://api.violet.io/v1/checkout" \
  -H "Authorization: Bearer 11371:YOUR_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"offer_id": "59398", "quantity": 1}],
    "customer_email": "test@example.com"
  }'
```

**Deliverable:**

- [ ] Successfully fetch StyleSphere catalog
- [ ] Parse JSON response
- [ ] Verify product data structure matches API docs
- [ ] Create test order

**Time:** 1 hour

---

## 🏗️ Backend Integration Phase (Week 2-3)

### 5. 📊 Create Supabase Tables

**Status:** ⏳ TODO

```sql
-- Products table
CREATE TABLE violet_products (
  id BIGINT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',
  tags TEXT[],
  image_url TEXT,
  status TEXT,
  embedding vector(1536),
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Orders table
CREATE TABLE violet_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violet_order_id TEXT UNIQUE,
  user_id UUID REFERENCES auth.users,
  merchant_id TEXT,
  total_amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',
  status TEXT,
  items JSONB,
  shipping_address JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order items
CREATE TABLE violet_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES violet_orders,
  offer_id TEXT,
  merchant_id TEXT,
  quantity INT,
  price_per_unit DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster searches
CREATE INDEX idx_products_tags ON violet_products USING GIN(tags);
CREATE INDEX idx_products_merchant ON violet_products(merchant_id);
CREATE INDEX idx_products_embedding ON violet_products USING ivfflat (embedding vector_cosine_ops);
```

**Deliverable:**

- [ ] Tables created in Supabase
- [ ] RLS policies configured
- [ ] Indexes created

**Time:** 1-2 hours

---

### 6. 📥 Build Product Sync Function

**Status:** ⏳ TODO

**Create Supabase Edge Function:** `/functions/sync-violet-products/index.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VIOLET_API_BASE = "https://api.violet.io/v1";
const VIOLET_APP_ID = Deno.env.get("VIOLET_APP_ID")!;
const VIOLET_SECRET_KEY = Deno.env.get("VIOLET_SECRET_KEY")!;

export async function syncVioletProducts(merchantId: string) {
  try {
    // 1. Fetch products from Violet
    const response = await fetch(
      `${VIOLET_API_BASE}/merchants/${merchantId}/offers`,
      {
        headers: {
          Authorization: `Bearer ${VIOLET_APP_ID}:${VIOLET_SECRET_KEY}`,
        },
      },
    );

    const { offers } = await response.json();

    // 2. Upsert into Supabase
    for (const offer of offers) {
      await supabase.from("violet_products").upsert({
        id: offer.id,
        offer_id: offer.offer_id,
        merchant_id: offer.merchant_id,
        name: offer.name,
        description: offer.description,
        price: offer.price.amount,
        currency: offer.price.currency,
        tags: offer.tags,
        image_url: offer.image_url,
        status: offer.status,
        synced_at: new Date().toISOString(),
      });
    }

    return { success: true, count: offers.length };
  } catch (error) {
    console.error("Sync failed:", error);
    throw error;
  }
}
```

**Deliverable:**

- [ ] Function syncs StyleSphere products to Supabase
- [ ] Products indexed with pgvector embeddings
- [ ] Cron job runs daily

**Time:** 2-3 hours

---

### 7. 🎣 Build Webhook Handler

**Status:** ⏳ TODO

**Create Supabase Edge Function:** `/functions/webhook-violet/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // 1. Verify webhook signature (Violet signs with HMAC)
  const signature = req.headers.get("X-Violet-Signature");
  // Verify signature...

  // 2. Parse event
  const event = await req.json();

  // 3. Handle by event type
  switch (event.type) {
    case "order.created":
      // Update order status in your DB
      // Send confirmation email
      // Trigger push notification
      break;

    case "order.shipped":
      // Update tracking info
      // Send notification to user
      break;

    case "payment.completed":
      // Mark order as paid
      // Fulfill any digital items
      break;

    case "payment.failed":
      // Notify user
      // Offer retry
      break;
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

**Deliverable:**

- [ ] Webhook endpoint live
- [ ] Handles all 4 event types
- [ ] Updates order status in DB
- [ ] Sends notifications to user

**Time:** 2-3 hours

---

## 🎨 Frontend Phase (Week 4-5)

### 8. 🛒 Build Product Grid (TanStack)

**Status:** ⏳ TODO

**Component:** `src/components/ProductGrid.tsx`

- Fetch from your Supabase backend
- Display 14 StyleSphere products
- Show name, price, image, tags
- Add to cart button

**Deliverable:**

- [ ] Products display correctly
- [ ] Images load
- [ ] Responsive layout

**Time:** 4-6 hours

---

### 9. 🔍 Implement AI Conversational Search

**Status:** ⏳ TODO

**Component:** `src/components/AISearch.tsx`

- User: "I need a gift for my dad who likes fashion"
- AI generates embedding
- pgvector searches
- Returns top 5 products

**Tech:**

- OpenAI embeddings API
- Supabase pgvector search

**Deliverable:**

- [ ] Natural language search works
- [ ] Results are relevant
- [ ] Fast (<500ms)

**Time:** 6-8 hours

---

### 10. 💳 Build Checkout Flow

**Status:** ⏳ TODO

**Component:** `src/components/Checkout.tsx`

1. Cart summary
2. Shipping address form
3. Call `POST /api/create-checkout` (your backend)
4. Backend calls Violet `/checkout/create`
5. Display Violet checkout (embedded or redirect)
6. Handle success/failure

**Deliverable:**

- [ ] Test purchase completes
- [ ] Order appears in Violet dashboard
- [ ] Webhook fires with order.created

**Time:** 6-8 hours

---

## 📱 Mobile App (Expo) — Parallel Work

### 11. 🔄 Reuse Web Components in React Native

**Status:** ⏳ TODO

- Share ProductCard, ProductGrid logic
- Adapt styling for mobile
- Add push notifications handler

**Time:** 4-6 hours

---

## 🧪 Testing & Launch Readiness

### 12. ✅ Comprehensive Testing

**Status:** ⏳ TODO

**Test Cases:**

- [ ] Browse 14 StyleSphere products
- [ ] Search for "shirt" → find Unicorn Hoodie, Cosmic Shirt
- [ ] Add to cart, modify quantity
- [ ] Complete guest checkout
- [ ] Verify order in Violet dashboard
- [ ] Receive order confirmation email
- [ ] Track order status via webhook

**Time:** 2-3 hours

---

### 13. 🚀 Deploy to Production

**Status:** ⏳ TODO

- [ ] TanStack web live at yourdomain.com
- [ ] Expo app published to App Store + Play Store
- [ ] Violet mode switched from "Test" to "Live"
- [ ] SEO content published (3-5 articles)
- [ ] Analytics configured

**Time:** 4-6 hours

---

## 📋 Checklist Summary

### Phase 1: Immediate (This Week)

- [ ] Secure API credentials
- [ ] Read API documentation
- [ ] Configure webhooks
- [ ] Test API endpoints

### Phase 2: Backend (Week 2-3)

- [ ] Create Supabase tables
- [ ] Build product sync function
- [ ] Build webhook handler

### Phase 3: Frontend (Week 4-5)

- [ ] Product grid (web)
- [ ] AI search
- [ ] Checkout flow
- [ ] Mobile app

### Phase 4: Launch (Week 6)

- [ ] Comprehensive testing
- [ ] Production deployment
- [ ] Violet Live mode

---

## 🎯 Success Criteria for MVP

**Go/No-Go Gates:**

| Gate                       | Validation                              | Signal                        |
| -------------------------- | --------------------------------------- | ----------------------------- |
| **Supplier integration**   | StyleSphere live with full API          | Model is technically feasible |
| **First organic purchase** | Real user buys Unicorn Hoodie           | End-to-end flow works         |
| **Commission received**    | First affiliate commission hits account | Business model validated      |
| **Return buyer**           | Same user comes back & buys again       | Experience creates loyalty    |
| **App install from web**   | Web user downloads mobile app           | Retention loop initiated      |

---

## 📞 Support Contacts

**Violet.io:**

- Docs: https://docs.violet.io
- Email: support@violet.io
- Community Slack: (via signup)

**Your Dashboard:**

- Overview: https://channel.violet.io/overview
- Configuration: https://channel.violet.io/configuration
- Webhooks: https://channel.violet.io/configuration/webhooks

---

## 💡 Pro Tips

1. **Use Postman for API testing** — Import Violet API spec directly
2. **Test webhooks locally** — Use ngrok to expose local backend
3. **Monitor Violet dashboard daily** — Watch commission tracking
4. **Start with StyleSphere only** — Don't complicate with multiple merchants in MVP
5. **Build with Adapter Pattern** — From day 1, make it easy to swap providers

---

## Timeline

```
Week 1: Setup + Testing
├─ Day 1: Credentials + Docs
├─ Day 2: Webhook config
├─ Day 3: API testing
└─ Day 4-5: Buffer

Week 2-3: Backend
├─ Supabase tables
├─ Product sync
└─ Webhook handlers

Week 4-5: Frontend
├─ Product grid
├─ AI search
├─ Checkout
└─ Mobile app

Week 6: Launch
├─ Testing
└─ Go live
```

---

**Target Launch Date:** Mid-April 2026

**Current Date:** 2026-03-03

**Time Available:** ~6 weeks ✅

---

**Document Version:** 1.0
**Last Updated:** 2026-03-03
**Next Review:** After Phase 1 completes
