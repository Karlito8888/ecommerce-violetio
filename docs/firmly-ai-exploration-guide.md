# Firmly.ai Exploration Guide

**Date:** 2026-03-03
**Status:** Research Complete
**Purpose:** Evaluate firmly.ai as backup/alternative provider for Adapter Pattern architecture

---

## 🎯 Executive Summary

**firmly.ai** is a competing **Embedded Commerce API** platform with a fundamentally different positioning than Violet.io:

| Aspect                    | firmly.ai                                                | Violet.io                                |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| **Market Focus**          | Publishers, AI agents, ad tech, social                   | Merchants (all types)                    |
| **Integration Model**     | Simple script embed + MCP Server                         | API-first development                    |
| **Target Channels**       | AI chatbots, social, editorial, ads, messaging, CTV      | All e-commerce channels                  |
| **Merchant Role**         | Remains Merchant of Record (MoR)                         | Violet handles MoR, you as channel       |
| **Learning Curve**        | "Zero engineering" for merchants, simple for channels    | More technical, requires API integration |
| **Commission Model**      | Performance-based (SaaS fee + transaction commission)    | Transaction commission (test: 0%)        |
| **Latest Launch**         | "Buy Now" Platform (Nov 2025) - unified agentic commerce | Mature, stable                           |
| **Partnership Ecosystem** | CJ Forge partnership, Perplexity integration             | Independent                              |

---

## 🌐 Platform Positioning

### firmly.ai Core Value

**"Buy Now—Anywhere"** philosophy:

- Transform fragmented commerce into unified experience
- Enable merchants to be shoppable across **any channel** without integration effort
- Power agentic commerce (AI making recommendations and handling purchases)

### Key Differentiator vs Violet

- **firmly:** "Make merchants shoppable anywhere" (merchant-centric)
- **Violet:** "Enable channels to sell anything" (channel-centric)

For your "Digital Personal Shopper" use case:

- ✅ **firmly** fits if positioning as "AI agent powering shopping"
- ✅ **Violet** fits if positioning as "curated marketplace showing multiple merchants"

---

## 🔧 Technical Architecture

### firmly.ai Technology Stack

**Integration Approach:**

```
Your Frontend
    ↓
Firmly Embed Script (simple)
    ↓
Firmly MCP Server (centralized, handles all merchants)
    ↓
Merchants (via firmly, not direct)
```

**Key Endpoint Categories:**

1. **Cart API** (v1 and v2)
   - `POST /api/cart/addItem` - Add product
   - `GET /api/cart` - Get cart contents
   - `POST /api/cart/clearCart` - Clear cart
   - `POST /api/cart/setAttribution` - Track source

2. **Catalog API**
   - `GET /api/catalog/product/{id}` - Get single product
   - `GET /api/catalog/merchant/{id}/products` - Get merchant catalog
   - `GET /api/catalog/search?query=` - Search products
   - `GET /api/catalog/product/url-info` - Extract product from URL

3. **Checkout API**
   - `POST /api/checkout/complete` - Complete order
   - `POST /api/checkout/shipping` - Set shipping info
   - `POST /api/checkout/payment` - Process payment
   - `POST /api/auth/session/transfer` - Browser session transfer

4. **Session Management**
   - `POST /api/session/otp/create` - Create OTP
   - `POST /api/session/otp/validate` - Validate OTP
   - `GET /api/session/carts/active` - Get active carts

5. **MCP Server (Centralized)**
   - Delivers structured product, pricing, availability, fulfillment data
   - In AI-readable format
   - Merchants can't directly integrate—must use firmly as intermediary

### Violet.io Technology Stack (Comparison)

```
Your Frontend
    ↓
Your Backend (Supabase Edge Functions)
    ↓
Violet API (direct integration)
    ↓
Individual Merchants (direct API connections)
```

**Fundamental difference:**

- **firmly:** You never contact merchants directly; firmly acts as intermediary
- **Violet:** You contact merchants directly; Violet provides unified checkout

---

## 💰 Business Model

### firmly.ai Pricing

- **SaaS Fee:** Monthly subscription (amount not publicly disclosed, likely performance-based)
- **Commission:** Transaction-based (% not publicly disclosed)
- **Model Philosophy:** "You only pay as you earn"

### Violet.io Pricing (from StyleSphere demo)

- **SaaS Fee:** None in test mode
- **Commission:** 0% (demo), negotiated with real merchants
- **Model Philosophy:** Pure commission-based, no monthly fees

**Advantage for your MVP:**

- Violet's zero SaaS fee for testing is better for MVP validation
- firmly's "pay-as-you-earn" might be better at scale if commission rates are lower

---

## 🤝 Partnership & Ecosystem

### firmly.ai

- **CJ Forge Partnership** (Sept 2025)
  - Gives firmly access to CJ's entire publisher/merchant network
  - CJ affiliates now have access to firmly's embedded checkout
  - Integration: publishers can add checkout without custom code

- **Perplexity Integration** (Announced 2026)
  - firmly powers shopping results and purchases in Perplexity
  - Shows trend toward "AI agents making purchases on behalf of users"

- **Merchant Network** Indirectly via CJ and partnerships

### Violet.io

- **Merchant Partnerships** Direct merchant relationships
- **Network** Open to any merchant with Shopify/custom API
- **Ecosystem** No major integrations announced yet

**Takeaway for you:**

- firmly's CJ partnership gives access to large merchant network instantly
- Violet's open model lets you negotiate custom deals with merchants
- For MVP, Violet's StyleSphere demo is faster; firmly requires CJ/partnership approval

---

## 🎯 Aligned Use Cases

### When to use firmly.ai

1. **AI Agent Commerce:** Your platform is an AI chatbot that recommends and sells
2. **Publisher Commerce:** You're a blog/editorial site monetizing with native checkout
3. **Ad Tech Commerce:** You're an ad platform enabling direct checkout from ads
4. **Social Commerce:** You're a social platform adding shopping experiences
5. **Messaging Commerce:** SMS, WhatsApp, Telegram native shopping

### When to use Violet.io

1. **Curated Marketplace:** You're creating a hand-selected product catalog
2. **White-Label Shopping:** You want complete brand control of UX
3. **Custom Supplier Mix:** You need flexibility to add non-standard suppliers
4. **Commission Negotiation:** You want merchant-by-merchant pricing control
5. **Direct Merchant Relationships:** You want partnership revenue sharing

### For "Digital Personal Shopper"

**Decision Matrix:**

| Aspect                | Choosing firmly           | Choosing Violet                |
| --------------------- | ------------------------- | ------------------------------ |
| **Brand positioning** | "AI-powered shopping"     | "Curated marketplace"          |
| **User journey**      | "Ask AI, AI finds & buys" | "Browse, search, explore, buy" |
| **Supplier control**  | Via CJ partnerships       | Direct negotiations            |
| **Technical effort**  | Low ("embed and done")    | Medium (custom integrations)   |
| **Scale path**        | Via AI adoption           | Via marketplace reputation     |

---

## ⚙️ Integration Complexity

### firmly.ai Integration Path

```
1. Sign up for firmly (1 day)
   ↓
2. Get API credentials & MCP endpoint (1 day)
   ↓
3. Embed firmly script in your frontend (30 min)
   ↓
4. Add items to cart using Cart API (2 hours)
   ↓
5. Launch checkout (configured in firmly dashboard) (1 hour)
   ↓
6. LIVE (total: 3-4 days)
```

**Claim:** "Zero engineering for merchants" (but you still need basic API integration)

### Violet.io Integration Path (from action-plan)

```
1. Create account (✅ done)
   ↓
2. Read API docs (1-2 hours)
   ↓
3. Configure webhooks (1 hour)
   ↓
4. Test API endpoints (1 hour)
   ↓
5. Create Supabase tables (1-2 hours)
   ↓
6. Build product sync function (2-3 hours)
   ↓
7. Build webhook handler (2-3 hours)
   ↓
8. Build frontend components (4-6 hours)
   ↓
9. LIVE (total: 2-3 weeks)
```

**Verdict:** firmly is 5-7x faster for MVP, but less flexible for customization

---

## 🔐 Security & Compliance

### firmly.ai Model

- **Merchant of Record:** Merchant remains MoR (not firmly, not you)
- **Payment Processing:** Handled via merchant's payment processor (or firmly's)
- **Data Flow:** You → firmly → Merchant
- **PCI DSS:** Merchant-managed (not firmly's responsibility directly)

### Violet.io Model

- **Merchant of Record:** Violet (they handle payment integration)
- **Payment Processing:** Via Violet's checkout system
- **Data Flow:** You → Violet → Merchant
- **PCI DSS:** Violet handles (you don't touch payment data)

**For Philippines solo proprietor:**

- Both are compliant if structured correctly
- Both handle complex liability (payment) for you
- FTC disclosure still required for both ("We earn commission")

---

## 📊 Advantages & Disadvantages

### firmly.ai

✅ **Advantages:**

- Extremely fast MVP (3-4 days vs 2-3 weeks)
- "Zero engineering" claim attracts non-technical founders
- CJ Forge partnership gives instant merchant network access
- AI-friendly (MCP Server format designed for LLMs)
- Trending with agentic commerce wave
- Perplexity integration validates platform viability
- Simple embed model = easier to iterate UX

❌ **Disadvantages:**

- Less flexible supplier mix (dependent on firmly's partnerships)
- Merchant data not directly available (you don't know inventory)
- Potential vendor lock-in (if you build on firmly's MCP)
- Commission rates not public (black box pricing)
- Smaller merchant network initially (vs Violet's open model)
- Less SEO-friendly (relies on partner channels, not owned discovery)
- Newer platform (founded ~2024, vs Violet's maturity)

### Violet.io

✅ **Advantages:**

- Direct merchant relationships (more control, flexibility)
- Mature API documentation (well-structured)
- Open model (connect to any Shopify/API merchant)
- Clear pricing & commission structure
- Better for SEO acquisition (you own the UX/content)
- Proven with real merchants
- More customizable white-label experience
- Full data access (inventory, pricing, etc.)

❌ **Disadvantages:**

- Longer MVP timeline (2-3 weeks)
- Requires more custom development
- StyleSphere demo is only test merchant (real merchants harder to onboard)
- Webhooks required before going live (blocking)
- Manual merchant recruitment needed
- Less trendy (not riding "agentic commerce" wave)
- Smaller CJ partnership integration (CJ recently added, not primary)

---

## 🎓 Key Learnings

### 1. Different Philosophies

- **firmly:** "Let merchants be shoppable everywhere" (bottom-up, merchant-centric)
- **Violet:** "Let channels sell everything" (top-down, channel-centric)

For your "Digital Personal Shopper" brand:

- If you're building the shopping experience yourself (web + app), **Violet** is better
- If you're power-law distributed (AI agents, social platforms, etc.), **firmly** is better

### 2. Adapter Pattern Validation

The existence of firmly confirms the Adapter Pattern strategy:

- Both provide similar value (embedded checkout, affiliate model)
- Both have different technical approaches (script vs API vs MCP)
- Switching costs are low if architecture is supplier-agnostic
- **Your code should be indifferent between them**

### 3. Market Positioning Matters

- firmly's CJ partnership = access to millions of merchants instantly
- Violet's open model = you control merchant selection & brand

For MVP: Violet's StyleSphere is faster start.
For scale: firmly's partnerships might be easier growth (if commission rates favorable).

### 4. SEO Consideration

- **firmly:** Less SEO-friendly (you're embedding, not owning discovery)
- **Violet:** More SEO-friendly (you own the content, site, ranking)

Your product brief emphasizes "SEO-first web", suggesting **Violet** is better strategic fit for MVP.

---

## 🚀 Recommendation for MVP

### Primary Provider: **Violet.io** ✅

**Why:**

- StyleSphere demo gives you 14 products immediately (no merchant negotiation)
- Better for SEO-first acquisition strategy
- More customizable white-label experience
- Clear pricing and transparent commission model
- Longer development timeline is acceptable (6-week MVP window exists)

### Backup Provider: **firmly.ai** (Adapter Pattern)

**When to switch:**

- If merchant recruitment becomes bottleneck
- If agentic commerce becomes core to product (AI recommending & buying)
- If CJ partnership becomes relevant to your distribution
- If you need 5x faster iteration on checkout UX

### Implementation Strategy

```
PHASE 1 (Current): Violet.io
  ├─ MVP with StyleSphere
  ├─ Validate end-to-end flow
  └─ Prove commission model works

PHASE 2 (If growth stalls): firmly.ai
  ├─ Leverage CJ partnerships for merchant growth
  ├─ Add "agentic commerce" features
  └─ Use firmly's MCP for AI integrations

ADAPTER PATTERN (Day 1):
  └─ Abstract supplier interface
      ├─ violetAdapter.ts
      ├─ firmelyAdapter.ts (future)
      └─ googleAdapter.ts (future - Google UCP)
```

---

## 📋 Next Steps

1. **Continue with Violet.io** for MVP
2. **Book firmly.ai demo call** (for strategic knowledge)
3. **Implement Adapter interface** from day 1 in code
4. **Monitor firmly's agentic commerce developments** (re-evaluate at Phase 2)

---

## 🔗 Sources & Resources

- [firmly.ai Homepage](https://www.firmly.ai)
- [firmly.ai Docs](https://docs.firmly.ai)
- [CJ Forge Partnership Announcement](https://junction.cj.com/article/cj-firmly)
- [firmly "Buy Now" Platform Launch (Nov 2025)](https://finance.yahoo.com/news/firmly-unveils-unified-buy-now-141200621.html)
- [PYMNTS: Affiliate Marketing Gets AI Makeover](https://www.pymnts.com/partnerships/2025/cj-and-firmly-team-to-provide-embedded-checkout-for-publishers/)

---

**Document Version:** 1.0
**Created:** 2026-03-03
**For:** Digital Personal Shopper E-commerce Project
**Team:** Charles BOURGAULT
