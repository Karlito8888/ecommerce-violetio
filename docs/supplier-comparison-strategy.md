# Embedded Commerce Supplier Comparison & Strategy

**Date:** 2026-03-03
**Status:** Research Complete
**Purpose:** Define Adapter Pattern strategy with Violet.io (primary) and firmly.ai (backup)

---

## 📊 Quick Comparison Matrix

| Criterion                   | Violet.io                      | firmly.ai                       | Winner for MVP    |
| --------------------------- | ------------------------------ | ------------------------------- | ----------------- |
| **MVP Speed**               | 2-3 weeks                      | 3-4 days                        | firmly (5-7x)     |
| **Test Merchant Available** | ✅ StyleSphere (14 products)   | ❌ Requires partnership         | Violet            |
| **SEO-Friendly**            | ✅ Full control                | ❌ Embedded only                | Violet            |
| **API Maturity**            | ✅ Mature & documented         | ✅ Modern (v2 APIs)             | Tie               |
| **Merchant Network Size**   | Open (any Shopify)             | Millions (via CJ)               | firmly (at scale) |
| **Commission Transparency** | ✅ Clear                       | ❌ Undisclosed                  | Violet            |
| **Customization Freedom**   | ✅ High (direct API)           | ⚠️ Limited (MCP-bound)          | Violet            |
| **AI/Agentic Features**     | ⚠️ Minimal                     | ✅ MCP Server designed for LLMs | firmly            |
| **Vendor Lock-in Risk**     | Low (API-driven)               | Medium (MCP dependency)         | Violet            |
| **Payment Processing**      | Violet handles                 | Merchant or firmly handles      | Tie               |
| **Brand Control**           | ✅ 100% white-label            | ⚠️ firmly branding visible      | Violet            |
| **Webhook Support**         | ✅ Full (blocking requirement) | ⚠️ Limited documentation        | Violet            |

---

## 🎯 Decision Framework

### For "Digital Personal Shopper" MVP

Your product brief emphasizes:

- ✅ **SEO-first web acquisition** → Violet (you own the content/ranking)
- ✅ **Premium Apple-style UX** → Violet (full control, white-label)
- ✅ **AI conversational search** → Could be either (Violet + your own embeddings)
- ✅ **White-label invisible** → Violet (fully customizable)
- ✅ **Solo-dev maintainable** → Violet (no MCP learning curve)

### Score: Violet = 85/100, firmly = 65/100

---

## 🗺️ Recommended Path

### PHASE 1: MVP with Violet.io (Weeks 1-6)

**Timeline:** March 3 - April 14, 2026

**Objectives:**

- Validate end-to-end flow with real products
- Prove commission model works
- Build customer acquisition via SEO
- Establish baseline metrics

**Technical Stack:**

```
Frontend: TanStack (web) + Expo (mobile)
Backend: Supabase (PostgreSQL + pgvector + Edge Functions)
Commerce: Violet.io (StyleSphere demo + future merchants)
Supplier Abstraction: SupplierAdapter interface
```

**Deliverables:**

- Product sync (StyleSphere → Supabase)
- AI search (embeddings + pgvector)
- Checkout flow (Violet integration)
- Mobile app (App Store + Play Store)
- SEO content (3-5 guides/reviews)
- First customer acquisition

**Success Gates:**

- ✅ First organic purchase via Google search
- ✅ First affiliate commission earned
- ✅ First returning customer
- ✅ App install from web user

### PHASE 2: Scale & Optionality (Weeks 7-12)

**Decision Point:** Evaluate firmly.ai if:

- Merchant recruitment is bottleneck
- Agentic commerce becomes strategic priority
- Commission rates become unfavorable
- Need to expand merchant network 5x+

**If switching to firmly.ai:**

```
├─ Swap: Violet adapter → firmly adapter
├─ Reuse: Entire frontend, UX, AI search
├─ Gain: CJ partnership network access
├─ Gain: Agentic commerce capabilities
└─ Loss: Direct merchant relationships
```

**Cost of switch:** 2-3 days (thanks to Adapter Pattern)

### PHASE 3: Dual Integration (Weeks 13+)

**Future vision:** Serve different channels via different providers

```
Web SEO users
  ├─ Violet adapter (you control brand/ranking)
  └─ Direct merchant relationships

AI agent users
  ├─ firmly adapter (MCP Server native)
  └─ CJ partnership network

Google Shopping
  ├─ Google UCP adapter (emerging standard)
  └─ Unified data feed
```

---

## 🏗️ Adapter Pattern Implementation

### Interface Definition (Day 1)

```typescript
// libs/suppliers/types.ts

export interface Product {
  id: string;
  name: string;
  description: string;
  price: Decimal;
  currency: string;
  merchant_id: string;
  image_url: string;
  tags: string[];
  embedding?: Vector1536;
}

export interface Order {
  id: string;
  user_id: string;
  items: OrderItem[];
  total: Decimal;
  status: "pending" | "processing" | "shipped" | "delivered";
  created_at: Date;
}

export interface OrderItem {
  product_id: string;
  quantity: number;
  price_per_unit: Decimal;
}

export interface SupplierAdapter {
  // Catalog operations
  getProduct(id: string): Promise<Product>;
  listProducts(merchantId: string): Promise<Product[]>;
  searchProducts(query: string): Promise<Product[]>;

  // Order operations
  createCheckout(items: CartItem[]): Promise<CheckoutSession>;
  completeOrder(session: CheckoutSession, payment: Payment): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;

  // Webhook handling
  handleWebhook(event: WebhookEvent): Promise<void>;

  // Metadata
  getName(): string;
  getVersion(): string;
  isHealthy(): Promise<boolean>;
}

export interface WebhookEvent {
  type: "order.created" | "order.updated" | "payment.completed";
  data: Record<string, any>;
  timestamp: Date;
  signature: string;
}
```

### Violet Adapter

```typescript
// libs/suppliers/violet-adapter.ts

import { SupplierAdapter, Product, Order } from "./types";

export class VioletAdapter implements SupplierAdapter {
  private appId: string;
  private secretKey: string;
  private apiBase = "https://api.violet.io/v1";

  constructor(appId: string, secretKey: string) {
    this.appId = appId;
    this.secretKey = secretKey;
  }

  getName(): string {
    return "violet-io";
  }

  async getProduct(id: string): Promise<Product> {
    // GET /v1/merchants/{id}/offers
    // Transform Violet product format → SupplierAdapter format
  }

  async createCheckout(items: CartItem[]): Promise<CheckoutSession> {
    // POST /v1/checkout
    // Return Violet checkout URL
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    // Verify signature: HMAC-SHA256
    // Route based on event.type
    // Update orders in Supabase
  }
}
```

### firmly Adapter (Future)

```typescript
// libs/suppliers/firmly-adapter.ts

import { SupplierAdapter, Product, Order } from "./types";

export class FirmlyAdapter implements SupplierAdapter {
  private apiBase = "https://api.firmly.ai/v1";
  private embedScript: string;

  getName(): string {
    return "firmly-ai";
  }

  async getProduct(id: string): Promise<Product> {
    // GET /api/catalog/product/{id}
    // Transform firmly product format → SupplierAdapter format
  }

  async createCheckout(items: CartItem[]): Promise<CheckoutSession> {
    // POST /api/cart/addItem + Cart API v2
    // Return firmly cart URL
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    // firmly uses MCP Server for data
    // Different webhook implementation
  }
}
```

### Usage in Backend

```typescript
// supabase/functions/sync-products/index.ts

import { VioletAdapter } from "~/libs/suppliers/violet-adapter";

const supplier = new VioletAdapter(
  Deno.env.get("VIOLET_APP_ID")!,
  Deno.env.get("VIOLET_SECRET_KEY")!,
);

// Later: easy to swap
// const supplier = new FirmlyAdapter(...)

export async function syncProducts() {
  const products = await supplier.listProducts("10225");
  // Save to Supabase (independent of supplier)
}
```

---

## 💡 Key Strategic Insights

### 1. Violet is Right for MVP

- StyleSphere gives you launch leverage
- SEO strategy requires full control
- 6-week timeline is workable
- Commission model is transparent

### 2. firmly is Right for Scale

- CJ network = millions of merchants instantly
- Agentic commerce is trending
- 3-4 day implementation = rapid pivots
- Perfect for "Phase 2 optionality"

### 3. Adapter Pattern Justifies Both

- Cost to switch providers: 2-3 days
- Cost to delay architecture: 4-6 weeks
- Implement now, make both work

### 4. Architecture Decisions

- **Supabase tables** stay the same (supplier-agnostic schema)
- **Webhook handlers** differ by supplier (abstracted)
- **Frontend** completely independent (calls your backend)
- **Product sync** swappable (just change adapter)

---

## 📋 Implementation Checklist

### Week 1-2: Violet MVP Setup

- [ ] Secure Violet API credentials
- [ ] Implement SupplierAdapter interface
- [ ] Build VioletAdapter
- [ ] Create Supabase tables
- [ ] Implement product sync (StyleSphere)
- [ ] Configure webhooks (blocking requirement)
- [ ] Test API endpoints (Postman)

### Week 3-5: Violet Frontend & Backend

- [ ] Build product grid (web + mobile)
- [ ] Implement AI search (pgvector)
- [ ] Build checkout flow (Violet integration)
- [ ] Implement order tracking
- [ ] Add SEO content (3-5 articles)

### Week 6: Testing & Launch

- [ ] End-to-end testing
- [ ] Deploy web (TanStack)
- [ ] Deploy mobile (Expo)
- [ ] Go live with StyleSphere
- [ ] Monitor first orders

### Phase 2 (Optional): firmly Readiness

- [ ] Book firmly demo
- [ ] Implement FirmlyAdapter
- [ ] A/B test checkout experiences
- [ ] Evaluate commission rates
- [ ] Plan migration (if needed)

---

## 🎓 Learning Path

### For Violet.io Deep Dive

1. Read docs.violet.io completely
2. Review API reference (5 key endpoints)
3. Test with Postman/cURL
4. Build product sync function
5. Implement webhook handler

### For firmly.ai Deep Dive (Future)

1. Book discovery call with firmly
2. Review MCP Server protocol (relevant for AI integrations)
3. Compare Cart API v1 vs v2
4. Evaluate CJ partnership access
5. Test embed script implementation

---

## ✨ Why Adapter Pattern Wins

**Without Adapter Pattern:**

- Violet integrated into 50+ places in codebase
- Switch to firmly = rewrite 50+ places (weeks)
- Lock-in to Violet's API quirks
- Hard to evaluate alternatives

**With Adapter Pattern:**

- Single interface for all suppliers
- Switch to firmly = change 1 config (hours)
- Easy to evaluate new providers
- Future-proof architecture

**Cost of implementation:** 4-8 hours (upfront)
**Cost of avoiding it:** 4-6 weeks (when you need to switch)

---

## 🔮 Future Considerations

### Google Universal Commerce Protocol (UCP)

- Emerging standard for e-commerce APIs
- Both Violet and firmly evolving toward it
- Your adapter interface = easy future adoption

### Market Evolution

- Agentic commerce is accelerating
- firmly's MCP Server = future-ready
- Violet's openness = flexibility
- You benefit from both trends

### Commission Rate Evolution

- Monitor both providers quarterly
- Easy to switch if rates change
- Benchmark against affiliate networks

---

## 📞 Next Actions

### Immediate (This week)

1. ✅ Complete Violet.io account setup
2. ✅ Document both providers (this doc)
3. 📋 Implement SupplierAdapter interface
4. 📋 Build VioletAdapter
5. 📋 Configure webhooks (BLOCKING)

### Short-term (Week 2-3)

1. 📋 Complete Violet integration
2. 📋 Product sync + AI search
3. 📋 Checkout flow
4. 📋 First test order

### Medium-term (Week 6+)

1. 📋 MVP launch with StyleSphere
2. 📋 Monitor commission earnings
3. 📋 Book firmly demo (optional)
4. 📋 Evaluate Phase 2 strategy

### Long-term (3+ months)

1. 📋 Add real merchants (Violet)
2. 📋 A/B test if firmly integration needed
3. 📋 Implement Google UCP (when available)
4. 📋 Optimize supply chain per channel

---

**Document Version:** 1.0
**Last Updated:** 2026-03-03
**Next Review:** After Phase 1 MVP launch
