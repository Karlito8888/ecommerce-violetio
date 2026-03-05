---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
classification:
  projectType: "web_app + mobile_app (dual-platform)"
  domain: "E-commerce / Affiliate Marketplace"
  complexity: "medium"
  projectContext: "greenfield"
inputDocuments:
  - "_bmad-output/planning-artifacts/product-brief-E-commerce-2026-03-03.md"
  - "_bmad-output/planning-artifacts/research/domain-white-label-affiliate-suppliers-research-2026-03-03.md"
  - "_bmad-output/planning-artifacts/research/market-curated-shopping-experience-research-2026-03-03.md"
  - "_bmad-output/planning-artifacts/research/technical-tanstack-expo-supabase-stack-research-2026-03-03.md"
  - "docs/violet-io-integration-guide.md"
  - "docs/violet-io-action-plan.md"
  - "docs/VIOLET_QUICK_REFERENCE.md"
  - "docs/firmly-ai-exploration-guide.md"
  - "docs/supplier-comparison-strategy.md"
  - "docs/google-ucp-strategy-2026.md"
  - "docs/IMPLEMENTATION-ROADMAP-2026.md"
documentCounts:
  briefs: 1
  research: 3
  brainstorming: 0
  projectDocs: 7
workflowType: "prd"
date: 2026-03-03
author: Charles
---

# Product Requirements Document - E-commerce

**Author:** Charles
**Date:** 2026-03-03

## Executive Summary

E-commerce is a white-label affiliate platform that delivers a premium, unified shopping experience — web and mobile — without operating as a merchant. The platform aggregates partner product catalogs through embedded commerce APIs (Violet.io primary, with firmly.ai and Google UCP as future adapters), presenting them under a single brand with integrated checkout, AI-powered conversational search, and centralized customer support.

The founder operates as a pure service provider earning affiliate commissions only — no inventory, no buy/resell, no merchant-of-record status, no complex accounting. The product is not the physical goods; it is the shopping experience itself: a "Digital Personal Shopper" that combines the trust and polish of a premium e-commerce store with the lightweight cost structure of an affiliate model.

The platform targets English-speaking online shoppers who arrive via organic SEO (product reviews, guides, comparisons), converting them through an Apple-style minimalist UX, AI conversational search ("I need a gift for my dad who likes cooking"), and a frictionless guest-first one-step checkout with Apple Pay / Google Pay. Returning users are retained through a dedicated mobile app (Expo/React Native) with personalized AI search, cross-device cart sync, and ultra-targeted push notifications.

The technical architecture — TanStack Start (SSR web), Expo Router (mobile), Supabase (PostgreSQL + pgvector + Edge Functions) — is chosen specifically for solo-developer maintainability with full technical autonomy. A supplier-agnostic Adapter Pattern enables pluggable provider integrations without platform-level changes, positioning the platform to capitalize on the Google UCP wave projected at 50M daily AI shopping queries by Q4 2026.

### What Makes This Special

This platform creates a category that does not exist. Today, building an e-commerce experience requires a binary choice: operate as a full merchant (inventory, logistics, complex accounting) or settle for traditional affiliate marketing that redirects users to third-party sites — destroying brand consistency and UX. No one has built a premium, Apple-style shopping experience on top of white-label affiliate infrastructure.

The core insight: the product is the experience, not the merchandise. AI conversational search as primary discovery mechanism, invisible white-label multi-supplier aggregation, and one-step guest checkout — combined into an interface where users never suspect they are on an affiliate platform — because the experience is too good for that assumption.

The timing is uniquely favorable: Violet.io provides mature embedded commerce APIs ready today, Google UCP launched January 2026 as the emerging open standard for agentic commerce, and the Adapter Pattern architecture ensures the platform can ride whichever wave dominates — with a switching cost of days, not months.

## Project Classification

| Attribute           | Value                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Project Type**    | Web App + Mobile App (dual-platform: TanStack Start SSR + Expo Router/React Native)                                                                                |
| **Domain**          | E-commerce / Affiliate Marketplace                                                                                                                                 |
| **Complexity**      | Medium — no heavy regulatory burden, but multi-supplier orchestration, FTC disclosure, payment routing via third parties, and SEO strategy add architectural depth |
| **Project Context** | Greenfield — new product built from scratch, supported by extensive research and planning artifacts                                                                |
| **Tech Stack**      | TypeScript end-to-end: TanStack (web) · Expo/RN (mobile) · Supabase (backend) · pgvector (AI search)                                                               |
| **Business Model**  | Pure affiliate commissions — zero inventory, zero merchant status                                                                                                  |

## Success Criteria

### User Success

| Metric                   | Target                                         | What It Validates                                 |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------- |
| Search-to-product time   | < 30 seconds via AI conversational search      | AI differentiator delivers real value             |
| Checkout completion rate | > 70% of carts started → completed             | Frictionless one-step guest checkout works        |
| Guest checkout usage     | > 80% of first-time buyers use guest checkout  | No-forced-signup strategy is correct              |
| App install rate         | > 5% of returning web visitors install the app | Web experience drives mobile adoption             |
| Return visit rate        | > 30% of buyers return within 60 days          | Experience creates loyalty, not just transactions |

**User success signal:** A first-time visitor from Google finds a product via AI search, checks out as guest in under 2 minutes, and comes back within a month — either on web or by downloading the app.

### Business Success

**Immediate priority:** Cover platform operating costs as fast as possible.

| Milestone                 | Target                                                                  | Signal                     |
| ------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| Operating cost breakeven  | Commission revenue ≥ ~$50/month (Supabase Pro $25 + domain + hosting)   | Model is self-sustaining   |
| First organic purchase    | Real user from Google completes a purchase without leaving the platform | End-to-end flow works      |
| First commission received | Affiliate commission hits the account                                   | Business model validated   |
| First return buyer        | A user who bought once comes back and buys again                        | Experience creates loyalty |
| Consistent organic growth | Weekly SEO traffic growing week-over-week                               | Acquisition engine working |

**Daily dashboard — 5 numbers to check every morning:**

| KPI                               | Why It Matters                        |
| --------------------------------- | ------------------------------------- |
| Daily unique visitors (SEO)       | Is the acquisition engine working?    |
| Conversion rate (visitor → buyer) | Is the UX delivering?                 |
| Daily commission revenue          | Is the business model working?        |
| AI search usage rate              | Is the key differentiator being used? |
| App DAU (daily active users)      | Is the retention loop growing?        |

### Technical Success

| Metric                    | Target                                          | Rationale                                                             |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Page load time (web, SSR) | < 1.5s First Contentful Paint                   | Premium feel demands instant response; SEO Core Web Vitals compliance |
| AI search response time   | < 2s end-to-end (query → results displayed)     | Conversational search must feel natural, not laggy                    |
| Checkout flow latency     | < 3s total (cart → confirmation via Violet API) | One-step checkout loses impact if it stutters                         |
| Mobile app startup        | < 2s cold start on mid-range device             | App must feel native and snappy                                       |
| API availability          | > 99.5% uptime (Supabase + Edge Functions)      | Shopping platform must be reliably available                          |
| Lighthouse score (web)    | > 90 Performance, > 95 Accessibility            | Premium UX backed by measurable quality                               |
| Cross-device cart sync    | < 1s latency (web ↔ mobile)                     | Seamless experience across devices                                    |

### Measurable Outcomes

**3-month milestone (post-launch):**

- Platform live with Violet.io (StyleSphere) fully integrated
- Organic SEO traffic growing week-over-week
- First commissions earned — operating costs covered
- Mobile app published on App Store and Google Play
- AI conversational search operational with real product data

**12-month milestone:**

- Multiple suppliers integrated via Adapter Pattern
- Commission revenue trending toward sustainable income
- SEO as primary acquisition channel with zero paid marketing
- Discoverer → Loyalist conversion loop working (web → app retention)
- GCPAdapter ready for Google UCP activation if market warrants it

## Product Scope

### MVP — Minimum Viable Product

All 10 core features ship at launch — no compromises, wow effect from day 1:

1. **AI Conversational Search** — Natural language product discovery as primary differentiator
2. **Product Catalog & Pages** — Apple-style minimalist pages with real products via Violet.io Adapter
3. **Unified Checkout** — One-step, guest-first, Apple Pay / Google Pay, single cart across suppliers
4. **Order Tracking** — Unified status across all suppliers, push notifications on mobile
5. **Customer Support** — Centralized point of contact regardless of supplier
6. **Web Platform (SEO-First)** — TanStack Start SSR, SEO-optimized content pages, premium design
7. **Mobile App (Day 1)** — Expo Router/RN, cross-device cart, targeted push notifications
8. **Backend Infrastructure** — Supabase (PostgreSQL, Auth, Edge Functions), Adapter Pattern architecture
9. **Brand & Design** — Ultra-minimalist, premium, white-label invisible, "wow moment" confirmation page
10. **Content & SEO** — Honest guides, product comparisons, conversational content as acquisition channel

**MVP prerequisite:** Violet.io supplier fully integrated with API access (catalog, order, tracking).

### Growth & Vision

Phase 2 (Growth) and Phase 3 (Vision) features are detailed with trigger conditions and prerequisites in the **Project Scoping & Phased Development** section below. Key themes:

- **Phase 2:** Cashback, sponsored placement, referral program, offline browsing, additional suppliers (firmly.ai), Google UCP activation
- **Phase 3:** Predictive trends, anonymized insights, volume negotiation, international expansion, deep personalization

## User Journeys

### Journey 1: Sarah — The Search-Driven Discoverer (Success Path)

Sarah, 34, freelance designer in London, is looking for a birthday gift for her husband who loves cooking. She types "best premium chef knife set 2026" on Google.

**Opening Scene:** Sarah is frustrated. She has already spent 20 minutes on Amazon, overwhelmed by 4,000 results, fake reviews, and dubious sponsored products. She clicks a Google result that takes her to a guide titled "The 5 Best Chef Knife Sets — Tested & Compared".

**Rising Action:** The page is clean, minimalist, no pop-ups. The guide is honest — it clearly states which set is the best and why. Sarah notices the AI search bar at the top. Out of curiosity, she types: "I need a gift for my husband who loves cooking, budget around $150". The AI returns 4 curated results with personalized explanations of why each option matches her request.

**Climax:** Sarah picks a set. The product page is sparse — a hero photo, the price, essential specs, an internal review, and an "Add to Cart" button. She clicks, checkout opens: a single page. Name, address, Apple Pay. No account to create. In 45 seconds, it's done.

**Resolution:** Confirmation page with a "wow moment" — a polished message, a clear summary, a tracking number to follow. Sarah thinks: "Wait — I just bought something and it was... easy? Why can't every site be like this?" Two weeks later, she receives an email notification that the item has been delivered. She comes back to browse for herself.

**Requirements revealed:** SEO content pages, AI conversational search, Apple-style product pages, one-step guest checkout, Apple Pay, order confirmation UX, email notifications.

---

### Journey 2: Sarah Returns — The Returning Loyalist (Retention Path)

**Opening Scene:** Three weeks after her first purchase, Sarah thinks about the platform again. "That site was really good." She looks up the name in her browser history and this time, a subtle banner suggests the mobile app. She downloads it.

**Rising Action:** The app opens in under 2 seconds. No forced onboarding, no 5-screen tutorial. She finds the same clean design. She types in the AI search: "minimalist leather tote bag for work, not too expensive". The AI suggests 3 options with a conversational tone. She adds one to her wishlist.

**Climax:** Two days later, a push notification: "The leather tote you liked is now 15% off." It's not spam — it's exactly the product she had wishlisted. She opens the app, the product is already in her cross-device cart (she had added it on web). Checkout in one tap.

**Resolution:** Sarah has become a regular. She opens the app when considering a purchase, before even going to Amazon. The Discoverer → Loyalist cycle is complete.

**Requirements revealed:** App download prompt (non-intrusive), mobile app cold start < 2s, cross-device cart sync, wishlist, targeted push notifications, personalization over time.

---

### Journey 3: Marcus — The Premium Seeker (Trust Path)

**Opening Scene:** Marcus, 28, developer in Berlin, hates flashy e-commerce sites. He has abandoned AliExpress, Wish, and even Amazon Marketplace out of disgust for dark patterns ("Only 2 left!", "47 people viewing this!"). He lands on the platform via a comparison blog article.

**Rising Action:** First impression: the site is sober, almost austere. No promotional banners, no countdown timers, no newsletter pop-ups. Marcus scrolls the product page — a single high-quality hero image, the price displayed clearly (no "was $299, now $149!!!"), an honest description, a transparent internal review. He notices at the bottom of the page a clear mention: "We earn a commission when you purchase through us. That's how we stay independent."

**Climax:** The transparency surprises him. Instead of feeling deceived, he feels respected. He adds an item to the cart. The checkout is a single page — no "create account to continue", no 4 steps, no forced cross-sell. Just: address, payment, confirm.

**Resolution:** Marcus returns regularly. Not because of promotions, but because the site treats him like an adult. He recommends the platform to two colleagues. "It's like if Apple made an online store but for everything."

**Requirements revealed:** Anti-dark-pattern design, FTC disclosure integrated naturally, honest pricing (no fake discounts), transparent affiliate model, premium minimalist aesthetic, zero manipulation UX.

---

### Journey 4: Charles — The Solo Operator (Admin Path)

**Opening Scene:** Monday morning, 8 AM. Charles opens his laptop and checks the daily dashboard — the 5 morning KPIs. SEO visitors: up. Conversion: stable at 3.2%. Day's commission: $12. AI search usage: 40% of visitors use it. App DAU: 45.

**Rising Action:** Charles notices a StyleSphere product showing "out of stock" since the nightly sync. He checks the Supabase dashboard — the sync cron job ran fine, it's the merchant who ran out of stock on the Violet side. The product is automatically marked "unavailable" on the site — nothing to do manually.

He publishes a new SEO guide he had prepared ("Best Minimalist Wallets 2026"), runs a quick Lighthouse check (score 94), and reviews Supabase Edge Function logs to ensure Violet webhooks are arriving error-free.

**Climax:** A notification email: an order was placed via Violet. Charles checks the Violet dashboard — the commission is tracked. The webhook automatically updated the status in Supabase. The customer will receive a confirmation email without any intervention.

**Resolution:** In 30 minutes, Charles has verified everything is running. The rest of his day is free for SEO content, UX improvements, or exploring Google UCP integration. The platform is on autopilot — he only intervenes to publish content and monitor.

**Requirements revealed:** Admin dashboard (KPIs), automated product sync (cron), Supabase monitoring, Violet dashboard integration, webhook reliability, SEO content publishing workflow, Lighthouse performance monitoring.

---

### Journey 5: Sarah's Failed Payment — Error Recovery Path

**Opening Scene:** Sarah tries to order an item. She fills out the checkout, enters her info, clicks "Pay". The payment fails — her card was declined (she forgot she had switched cards).

**Rising Action:** Instead of a cryptic error screen, she sees a clear message: "Payment didn't go through — your card was declined. Your cart is saved. Try a different payment method?" Her cart is intact. No need to start over.

**Climax:** She pulls out her new card, re-enters the info. This time, Apple Pay is available — she uses it. Instant payment. No data lost.

**Resolution:** Sarah didn't even have time to be frustrated. The error flow was so smooth she barely noticed it. Her cart, her address, everything was preserved.

**Requirements revealed:** Graceful payment error handling, cart persistence on failure, clear error messaging, multiple payment method fallback, no data loss on retry.

---

### Journey 6: Out-of-Stock During Checkout — Edge Case

**Opening Scene:** A user adds an item to their cart, spends 10 minutes filling out the checkout. Meanwhile, the last unit was purchased by someone else on the merchant's site.

**Rising Action:** At checkout time, the system receives an error from Violet.io — product unavailable. Instead of a 500 error, the user sees: "Sorry, this item just sold out. We've saved your cart. Here are similar products you might like."

**Climax:** The AI search suggests 3 similar alternatives based on pgvector embeddings of the original product. The user picks one and completes the purchase.

**Resolution:** What could have been a cart abandonment (and a lost user) turns into a successful sale thanks to intelligent recovery.

**Requirements revealed:** Real-time inventory validation at checkout, graceful stock-out handling, AI-powered similar product suggestions, cart preservation, supplier error abstraction.

---

### Journey Requirements Summary

| Journey                     | Key Capabilities Revealed                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| **Sarah — Discoverer**      | SEO content, AI search, Apple-style product pages, guest checkout, Apple Pay, order confirmation |
| **Sarah — Loyalist**        | Mobile app, cross-device cart, wishlist, push notifications, personalization                     |
| **Marcus — Premium Seeker** | Anti-dark-pattern UX, FTC disclosure, transparent pricing, premium design                        |
| **Charles — Solo Operator** | Admin dashboard, automated sync, monitoring, content publishing, webhook reliability             |
| **Failed Payment**          | Error handling, cart persistence, clear messaging, payment fallback                              |
| **Out-of-Stock**            | Inventory validation, graceful degradation, AI similar products, supplier error abstraction      |

## Domain-Specific Requirements

### Regulatory & Compliance Requirements

| Requirement                                | Description                                                                                                                                                                                                             | Source                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **FTC Affiliate Disclosure**               | Every page displaying products must include clear, conspicuous disclosure that the platform earns commissions on purchases. Disclosure must be proximate to CTAs ("We earn a commission when you purchase through us"). | FTC Endorsement Guides (16 CFR §255)    |
| **Channel KYC (Stripe)**                   | Before processing any payment, the channel (our platform) must complete Stripe KYC identity verification as a Stripe Platform Account. This is a hard prerequisite — no KYC = no transactions.                          | Violet.io Channel KYC Guide             |
| **Marketing Consent per Order**            | Violet.io requires marketing consent to be captured and passed for every order. Must present opt-in checkbox at checkout and transmit consent status via the API. GDPR/CASL compliance mandatory.                       | Violet.io Marketing Consent docs        |
| **Tax Remittance Configuration**           | Tax remitter settings must be configured in payment setup. Tax calculation occurs during the pricing phase (Price Cart / Estimate Cart endpoints). Channel must define who remits taxes (Violet, channel, or merchant). | Violet.io Tax Remitter Settings         |
| **Country Restrictions**                   | Violet.io enforces supported country lists for both payments and payouts. Platform must restrict checkout to supported jurisdictions only — attempting unsupported countries will fail at API level.                    | Violet.io Supported Countries           |
| **GDPR Data Minimization**                 | Guest checkout collects only: name, email, shipping address, payment token. No persistent storage of payment data (Stripe handles PCI). Session data cleared after order completion for guests.                         | GDPR Article 5(1)(c)                    |
| **Consumer Protection (Distance Selling)** | Clear pre-purchase information: total price incl. taxes, delivery timeframe (from merchant via Violet), right of withdrawal notice. Platform displays but does not set these policies — merchants own fulfillment.      | EU Consumer Rights Directive 2011/83/EU |

### Technical Constraints (from Violet.io API Reality)

| Constraint                            | Impact                                                                                                                                                                                                       | Mitigation                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cart → Bags model**                 | Each cart contains bags — one per merchant. Shipping, pricing, and order states operate at bag level, not cart level. UX must present unified cart while orchestrating per-bag operations behind the scenes. | Abstract bags in UI: show single cart, single checkout. Map bag states to unified order status internally.                                                                             |
| **Bag-level refunds only**            | Violet.io supports refunds at bag level, not item level. If a user wants to return one item from a 3-item bag, the entire bag must be refunded or partial refund negotiated externally.                      | Document this limitation in return policy. Build customer support flow to handle partial returns manually with merchants.                                                              |
| **Iterative checkout flow**           | Violet requires sequential steps: customer info → shipping address → billing address → shipping method selection → price cart → payment → submit. Cannot skip steps.                                         | Build one-step UI that collects everything upfront, then execute API calls sequentially server-side (Edge Functions). User sees single page; backend orchestrates the multi-step flow. |
| **Token refresh management**          | API tokens expire. Must implement automatic token refresh before expiration to avoid mid-checkout failures.                                                                                                  | Supabase Edge Function handles token lifecycle: store tokens, monitor expiry, refresh proactively. Never expose tokens to client.                                                      |
| **Rate limits**                       | Violet.io enforces rate limits on API calls. High-traffic periods (sales events) could trigger throttling.                                                                                                   | Implement request queuing, caching of catalog data (products don't change frequently), and exponential backoff on rate limit responses.                                                |
| **Stripe as payment processor**       | All payments route through Stripe. No alternative payment processor available via Violet.io. Stripe fees apply on top of Violet commissions.                                                                 | Accept Stripe dependency for MVP. Stripe supports Apple Pay, Google Pay, and card payments — covers all MVP payment methods. Monitor Stripe status page for outages.                   |
| **Shipping method selection per bag** | Available shipping methods returned as array per bag — different merchants offer different shipping options.                                                                                                 | Present combined shipping view: if single merchant (most common case), show options directly. For multi-merchant carts, group by bag with clear labels.                                |
| **Contextual / dynamic pricing**      | Prices may vary by merchant context. Price Cart vs. Estimate Cart endpoints serve different purposes — Estimate for preview, Price for final calculation.                                                    | Always call Estimate Cart for cart display, Price Cart before final submission. Handle price discrepancies gracefully ("Price updated since you added to cart").                       |

### Integration Requirements

| Integration                   | Protocol                               | Key Implementation Details                                                                                                                                                                                             |
| ----------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Violet.io Checkout API**    | REST + Token Auth                      | Sequential checkout: create cart → add SKUs → apply customer → set shipping → set billing → get shipping methods → price → submit. Two modes: iterative (step-by-step) or direct submission.                           |
| **Violet.io Webhooks**        | HTTPS POST + Custom Headers            | Events for: Orders, Merchants, Offers, Collections, Syncs, Payouts, Payment Transactions, Transfers. Support event simulation for testing. Resend by event ID or entity ID. Custom webhook headers for authentication. |
| **Violet.io Catalog (Relay)** | REST + Sync Webhooks                   | Offers (products) → SKUs → Categories (hierarchical) → Collections. Media transformations for image resizing (bandwidth optimization). Sync webhooks for real-time catalog updates from merchants.                     |
| **Stripe Payments**           | Stripe Elements + Connect              | Channel creates Stripe Platform Account (KYC required). Supports Stripe Elements for custom payment UI, Apple Pay, Google Pay via dedicated Violet endpoints. Capture settings (immediate vs. delayed) configurable.   |
| **Supabase Backend**          | PostgreSQL + Edge Functions + Realtime | Edge Functions orchestrate Violet API calls server-side. PostgreSQL stores product cache, order mirrors, user sessions. Realtime for cross-device cart sync. pgvector for AI search embeddings.                        |
| **Commission & Payouts**      | Violet.io Payout API                   | Per-merchant commission rates. Commission Rate Change Log for audit trail. Commissions auto-deducted during merchant payout. Transfer scheduling (immediate, scheduled, or external).                                  |
| **Merchant Onboarding**       | Violet.io Connect URLs                 | Merchants self-register via Violet Connect URLs. Connection health monitoring API for diagnostics. Pre-registration flow for Shopify merchants.                                                                        |

### Risk Mitigations

| Risk                                 | Severity | Likelihood | Mitigation Strategy                                                                                                                                                                                                         |
| ------------------------------------ | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Violet.io API outage**             | High     | Low        | Cache product catalog in Supabase (refresh via sync webhooks). Display cached products during outage with "Checkout temporarily unavailable" messaging. Adapter Pattern allows future supplier failover.                    |
| **Stripe outage / payment failure**  | High     | Low        | Stripe has 99.99% uptime SLA. Implement graceful payment error handling (Journey 5). Cart persistence on failure. Retry with exponential backoff. No alternative processor available via Violet — accept this risk for MVP. |
| **Rate limit throttling**            | Medium   | Medium     | Aggressive catalog caching (products update infrequently). Batch webhook processing. Queue checkout API calls during spikes. Monitor rate limit headers proactively.                                                        |
| **Bag-level refund complexity**      | Medium   | Medium     | Clear return policy documentation. Customer support flow for partial returns. Build admin tools to track bag-level refund states (pending → confirmed → refunded).                                                          |
| **Token expiration mid-checkout**    | Medium   | Low        | Proactive token refresh before expiry window. Retry failed calls with fresh token automatically. Never cache tokens client-side.                                                                                            |
| **Multi-merchant cart UX confusion** | Medium   | Medium     | Default case is single-merchant cart. For multi-merchant: clear bag grouping with merchant attribution. Separate shipping selection per bag. Transparent per-bag delivery estimates.                                        |
| **Country restriction rejections**   | Low      | Low        | Validate shipping country against Violet supported countries list before checkout submission. Surface clear error: "We don't currently ship to [country]" at address entry, not at payment.                                 |
| **Merchant catalog desync**          | Medium   | Medium     | Relay sync webhooks for real-time updates. Nightly full catalog validation cron. Real-time inventory check at checkout submission (Journey 6 — stock-out handling).                                                         |
| **Commission rate disputes**         | Low      | Low        | Commission Rate Change Log API provides full audit trail. Monitor rate changes via webhook events. Alert admin on unexpected rate modifications.                                                                            |

## Innovation & Novel Patterns

### Detected Innovation Areas

#### 1. The "Missing Category" Innovation

The platform creates a product category that does not currently exist in the market. Today, e-commerce requires a binary choice: operate as a full merchant (inventory, logistics, accounting) or settle for traditional affiliate marketing (redirect users to third-party sites, destroying brand and UX). No one has built a premium, Apple-style shopping experience on top of white-label affiliate infrastructure. This is not an incremental improvement — it is a structural innovation in how affiliate commerce is experienced by the end user.

#### 2. AI Conversational Search as Primary Navigation

Unlike competitor platforms that bolt on a chatbot as a secondary feature, this platform uses AI conversational search (pgvector embeddings + natural language processing) as the **primary product discovery mechanism**. Users don't browse categories — they describe what they need: "minimalist leather tote bag for work, not too expensive". The AI returns curated, contextual results with explanations of why each product matches. This replaces the traditional browse-filter-sort paradigm entirely.

#### 3. Supplier-Agnostic Adapter Pattern for Commerce

The architecture abstracts the entire supplier layer behind a unified TypeScript interface (SupplierAdapter). Violet.io is the primary implementation, but firmly.ai and Google UCP adapters can be plugged in without modifying any platform-level code. The switching cost between suppliers is measured in days, not months. This is architecturally novel — most e-commerce platforms are tightly coupled to their commerce backend.

#### 4. Guest-First as Architectural Foundation

Guest checkout is not a feature — it is the default architecture. Anonymous Supabase authentication creates invisible sessions; users shop, search, and buy without ever seeing a login screen. Account creation happens organically only when the value proposition justifies it (wishlist sync, order history across devices). This inverts the standard e-commerce pattern where registration is a gate, not a reward.

#### 5. Strategic Platform Timing — Google UCP Positioning

Google's Universal Commerce Protocol (launched January 2026) is projected to drive 50M daily AI shopping queries by Q4 2026. The Adapter Pattern architecture means a GCPAdapter can be built when the market signal is clear, positioning the platform to participate in the agentic commerce wave without any architectural changes. The platform is designed today for a market that is still forming.

### Market Context & Competitive Landscape

| Competitor Category                                        | What They Do                                                    | What They Miss                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Traditional Affiliates** (Wirecutter, The Strategist)    | Expert reviews + affiliate links                                | Redirect users off-site — no owned checkout, no UX control             |
| **Curated Marketplaces** (Goop, The Sill)                  | Branded shopping experience                                     | Operate as merchants — inventory, logistics, high overhead             |
| **AI Shopping Assistants** (Google Shopping, Amazon Rufus) | AI-powered product search                                       | Locked to single ecosystem, no cross-platform curation                 |
| **Social Commerce** (LTK, ShopMy)                          | Influencer-driven affiliate                                     | Personality-dependent, no own-brand destination                        |
| **This Platform**                                          | Premium UX + AI search + white-label affiliate + multi-supplier | Creates the missing middle: branded experience without merchant burden |

No direct competitor occupies this exact position — premium brand experience with zero-inventory affiliate model and AI-first navigation.

### Validation Approach

| Innovation               | Validation Method                                                                    | Success Signal                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Missing Category         | First organic purchase end-to-end (SEO → AI search → checkout → commission)          | User completes purchase without leaving platform, commission received                  |
| AI Conversational Search | A/B: AI search vs. traditional browse. Track search-to-product time, conversion rate | AI search users convert at higher rate and find products faster than browse users      |
| Adapter Pattern          | Build firmly.ai adapter as second implementation                                     | New adapter operational within 1 sprint (5 days), no platform code changes             |
| Guest-First Architecture | Track guest vs. registered checkout rates                                            | > 80% of first-time buyers complete as guest; registered users show higher repeat rate |
| UCP Timing               | Monitor Google UCP adoption metrics Q3-Q4 2026                                       | GCPAdapter ships within 2 sprints of decision to proceed                               |

### Risk Mitigation

| Innovation Risk                    | What Could Go Wrong                                                                 | Fallback Strategy                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Category doesn't resonate          | Users don't perceive value vs. Amazon or direct merchant sites                      | Double down on SEO niche content — become the trusted review source that also lets you buy                                       |
| AI search underperforms            | Natural language queries return irrelevant results; users prefer traditional browse | Keep traditional category/filter browse as secondary navigation. AI search improves with data volume                             |
| Adapter Pattern over-engineered    | Only one supplier (Violet) ever used; abstraction adds complexity for nothing       | Adapter interface is lightweight (< 200 lines). Cost of maintaining it is near-zero even if unused                               |
| Guest-first creates support burden | Anonymous users harder to track for order issues                                    | Email-based order lookup. Encourage optional account creation post-purchase for tracking convenience                             |
| UCP timing wrong                   | Google UCP adoption slower than projected, or protocol changes significantly        | GCPAdapter is not built until market signal is clear. Zero wasted investment — architecture is ready, implementation is deferred |

## Web App + Mobile App Specific Requirements

### Project-Type Overview

Dual-platform product delivering the same core experience through two complementary channels: a server-rendered web application (TanStack Start) optimized for SEO-driven acquisition, and a native-feel mobile application (Expo Router / React Native) optimized for retention and repeat engagement. Shared TypeScript codebase, shared Supabase backend, unified Adapter Pattern for supplier integration. The web is the front door (Google search); the app is the living room (daily use).

### Web Platform — Technical Requirements

#### Browser Support Matrix

| Browser          | Minimum Version       | Notes                                                                |
| ---------------- | --------------------- | -------------------------------------------------------------------- |
| Chrome           | Last 2 major versions | Primary target — ~65% of global traffic                              |
| Safari           | Last 2 major versions | Critical for iOS web users and Apple Pay support                     |
| Firefox          | Last 2 major versions | Secondary but important for privacy-conscious users (Marcus persona) |
| Edge             | Last 2 major versions | Chromium-based, shares Chrome compatibility                          |
| Samsung Internet | Last 2 major versions | Significant Android web traffic share                                |

**Not supported:** Internet Explorer (EOL). Opera, Brave, and other Chromium-based browsers receive implicit support via Chrome compatibility.

**Testing strategy:** Primary testing on Chrome + Safari (covers ~85% of traffic). Automated cross-browser checks via Playwright for regression.

#### Responsive Design

| Breakpoint      | Target                            | Design Priority                                    |
| --------------- | --------------------------------- | -------------------------------------------------- |
| 320px — 480px   | Mobile phones (portrait)          | Content-first, single column, touch targets ≥ 44px |
| 481px — 768px   | Tablets / large phones            | Two-column product grids, expanded search          |
| 769px — 1024px  | Small laptops / tablets landscape | Full navigation, side-by-side product comparison   |
| 1025px — 1440px | Desktop                           | Maximum content density, hero layouts              |
| 1441px+         | Large displays                    | Max-width container (1440px), centered content     |

**Approach:** Mobile-first CSS. Base styles target smallest viewport; progressive enhancement via media queries. Touch-friendly targets on all breakpoints (no hover-only interactions).

#### SEO Strategy (Technical)

| Aspect                    | Implementation                                                              | Rationale                                                                   |
| ------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Server-Side Rendering** | TanStack Start SSR — full HTML delivered on first request                   | Google crawlers receive complete content; no JavaScript-dependent rendering |
| **Meta tags**             | Dynamic `<title>`, `<meta description>`, Open Graph, Twitter Cards per page | Each product page, guide, and category has unique, crawlable metadata       |
| **Structured data**       | JSON-LD Product schema, BreadcrumbList, Article (for guides), FAQ           | Rich snippets in search results — price, availability, ratings              |
| **Sitemap**               | Auto-generated XML sitemap from product catalog + content pages             | Ensure all pages are discoverable by crawlers                               |
| **Canonical URLs**        | `<link rel="canonical">` on all pages                                       | Prevent duplicate content from filters, pagination, sorting                 |
| **Core Web Vitals**       | LCP < 1.5s, FID < 100ms, CLS < 0.1                                          | Google ranking factor since 2021; premium UX signal                         |
| **Image optimization**    | Violet.io Media Transformations for dynamic resizing + WebP/AVIF            | Bandwidth savings, faster page loads, better Lighthouse scores              |
| **Internal linking**      | Guide pages link to product pages; product pages link to related guides     | SEO juice flows between content and commerce pages                          |

#### Accessibility Level

**Target: WCAG 2.1 Level AA**

| Requirement               | Implementation                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Keyboard navigation**   | All interactive elements reachable and operable via keyboard. Visible focus indicators.               |
| **Screen reader support** | Semantic HTML, ARIA labels on custom components, alt text on all images                               |
| **Color contrast**        | Minimum 4.5:1 for normal text, 3:1 for large text (premium minimalist design supports this naturally) |
| **Focus management**      | Focus trapped in modals/dialogs, restored on close. Skip-to-content link.                             |
| **Form accessibility**    | Labels associated with inputs, error messages linked via aria-describedby, clear validation feedback  |
| **Motion preferences**    | Respect `prefers-reduced-motion`. No essential information conveyed only through animation.           |
| **Touch targets**         | Minimum 44x44px for all interactive elements (mobile and desktop)                                     |

**Lighthouse target:** > 95 Accessibility score (defined in Success Criteria).

#### Performance Targets (Web-Specific)

| Metric                   | Target          | Measurement                                  |
| ------------------------ | --------------- | -------------------------------------------- |
| First Contentful Paint   | < 1.5s          | Lighthouse lab + Chrome UX Report field data |
| Largest Contentful Paint | < 2.5s          | Core Web Vital — Google ranking signal       |
| Time to Interactive      | < 3.0s          | Full interactivity including AI search bar   |
| Cumulative Layout Shift  | < 0.1           | No content jumping during page load          |
| Total bundle size (JS)   | < 200KB gzipped | TanStack Start with code splitting           |
| Image payload per page   | < 500KB         | Violet Media Transformations + lazy loading  |

### Mobile Platform — Technical Requirements

#### Platform Requirements

| Platform         | Minimum Version                          | Rationale                                                                 |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| **iOS**          | 16.0+                                    | Covers ~95% of active iOS devices. Required for latest Expo SDK features. |
| **Android**      | API 24 (Android 7.0)+                    | Covers ~95% of active Android devices. Expo default minimum.              |
| **Expo SDK**     | Latest stable (SDK 52+)                  | Access to latest APIs, performance improvements, EAS Build                |
| **React Native** | New Architecture (Fabric + TurboModules) | Better performance, concurrent features, native module interop            |

**Build & Distribution:** EAS Build (Expo Application Services) for cloud builds. EAS Submit for store submission automation.

#### Device Permissions

| Permission                 | Usage                                                        | Required?                                                    |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **Push Notifications**     | Targeted alerts (price drops, wishlist items, order updates) | Optional — requested after first purchase or wishlist action |
| **Camera**                 | Future: barcode scanning, visual search                      | Not MVP — deferred to Growth                                 |
| **Location**               | Not used                                                     | Not requested — privacy-first approach                       |
| **Biometric Auth**         | Face ID / fingerprint for quick re-authentication            | Optional — for registered users only                         |
| **Network State**          | Detect online/offline for graceful degradation               | Background — no user prompt needed                           |
| **Apple Pay / Google Pay** | Payment via device wallet                                    | Triggered only during checkout — system-level permission     |

**Permission philosophy:** Request only when contextually relevant (just-in-time), never on app launch. Explain value before requesting ("Get notified when prices drop on your wishlist items").

#### Offline Mode (Phase 2 — Architecture Prep)

| Capability             | MVP                          | Phase 2                            |
| ---------------------- | ---------------------------- | ---------------------------------- |
| Browse cached products | No                           | Yes — SQLite/MMKV local cache      |
| AI search              | No (requires API)            | Partial — cached recent results    |
| Cart persistence       | Yes (Supabase Realtime sync) | Yes + local queue for offline adds |
| Order history          | No                           | Yes — cached locally               |
| Checkout               | No (requires Violet API)     | No (always requires network)       |

**MVP approach:** Graceful offline detection — show clear "You're offline" message with cached cart contents. Checkout requires network; no pretend-offline-checkout.

#### Push Notification Strategy

| Notification Type           | Trigger                                                             | Frequency Cap           | User Value                                  |
| --------------------------- | ------------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| **Order status update**     | Bag state change via Violet webhook (confirmed, shipped, delivered) | No cap — transactional  | Essential — user needs to know order status |
| **Price drop on wishlist**  | Catalog sync detects price decrease on wishlisted item              | Max 1/day per user      | High — directly actionable savings          |
| **Back in stock**           | Previously out-of-stock wishlisted item returns                     | Once per item           | High — solves frustration from Journey 6    |
| **Personalized suggestion** | AI detects strong match based on purchase/search history            | Max 2/week              | Medium — must prove value, not annoyance    |
| **Cart abandonment**        | Cart idle > 24h with items                                          | Once per abandoned cart | Medium — gentle reminder, not aggressive    |

**Anti-spam philosophy:** Notifications are a privilege, not a right. Every notification must be directly useful. Users can granularly opt out by type. Default: only transactional (order updates) enabled; marketing notifications require explicit opt-in.

#### Store Compliance

**Apple App Store (iOS)**

| Requirement                      | Implementation                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Privacy Policy**               | Hosted on web domain, linked in App Store listing and app settings. Covers data collection (email, address for checkout), Supabase auth, Violet.io data sharing.           |
| **App Privacy Labels**           | Declare: email (for orders), name + address (for shipping), payment (processed via Stripe — not stored), usage data (analytics). "Data not linked to you" for guest users. |
| **In-App Purchase rules**        | Physical goods purchased via external checkout (Stripe through Violet) are exempt from Apple's 30% IAP commission per App Store Review Guidelines §3.1.5(a).               |
| **Age Rating**                   | 4+ (no objectionable content, no user-generated content in MVP)                                                                                                            |
| **Review Guidelines**            | Minimum functionality: search, browse, cart, checkout. No "thin" app — full-featured from day 1.                                                                           |
| **Deep links / Universal Links** | Web ↔ App handoff via Apple Universal Links for shared URLs                                                                                                                |

**Google Play Store (Android)**

| Requirement                  | Implementation                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| **Privacy Policy**           | Same hosted policy, linked in Play Console and app settings                                |
| **Data Safety Section**      | Equivalent to Apple Privacy Labels — declare data types collected, purposes, sharing       |
| **Physical goods exemption** | Same exemption as Apple — physical goods via external checkout not subject to Play billing |
| **Target API level**         | Must target latest Android API level within 1 year of release (Google Play policy)         |
| **Content Rating**           | IARC questionnaire — expected rating: Everyone                                             |
| **App Links**                | Android App Links for web ↔ app handoff                                                    |

**Cross-platform store strategy:** Simultaneous launch on both stores. EAS Submit automates submission. Same feature set on both platforms — no iOS-first or Android-first.

### Implementation Considerations

| Consideration        | Decision                                                                                                                             | Rationale                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Code sharing**     | Shared TypeScript business logic, API clients, state management. Platform-specific UI components where needed (navigation patterns). | Maximize reuse, minimize maintenance for solo dev                        |
| **Navigation**       | TanStack Router (web) + Expo Router (mobile) — file-based routing on both platforms                                                  | Consistent mental model, familiar patterns                               |
| **State management** | TanStack Query for server state (API caching, revalidation). Minimal client state via React context.                                 | TanStack Query handles 90% of state needs; no Redux overhead             |
| **Authentication**   | Supabase Auth — anonymous session (guest) → optional email/password or OAuth upgrade                                                 | Single auth system for both platforms, seamless guest-to-registered flow |
| **Deployment**       | Web: Vercel or Netlify (SSR support). Mobile: EAS Build + EAS Submit. Backend: Supabase Cloud.                                       | Managed services = zero DevOps overhead for solo dev                     |
| **Monitoring**       | Sentry for error tracking (web + mobile). Supabase Dashboard for backend. Violet Dashboard for orders.                               | Three dashboards = full observability without custom tooling             |

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP — the minimum product that delivers the full "wow effect" experience. Not a feature-stripped skeleton, but a complete, polished experience across all 10 core capabilities. The philosophy is "fewer users served excellently" rather than "many users served poorly".

**Resource Model:** Solo amateur developer. No deadline pressure. Quality over speed. Each feature is built, tested, and polished before moving to the next. The build sequence below ensures every intermediate state is functional and demoable.

**Key Decision:** All 10 features ship at Phase 1 launch. No feature is deferred to Phase 2. The rationale: the competitive advantage is the integrated experience — removing any single feature degrades the whole. An AI search without checkout is a demo. A checkout without AI search is a generic store. The "wow" comes from the combination.

### MVP Build Sequence (Phase 1)

The 10 MVP features are built in dependency order. Each build step produces a functional increment.

| Build Order | Feature                                                                                                                               | Dependencies  | Milestone When Complete                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------ |
| 1           | **Backend Infrastructure** — Supabase project, PostgreSQL schema, Edge Functions, Adapter Pattern interface, Violet.io authentication | None          | API calls to Violet succeed; tokens refresh automatically    |
| 2           | **Product Catalog & Pages** — Violet Relay sync, product cache in Supabase, Apple-style product pages                                 | #1            | Products visible on screen with real merchant data           |
| 3           | **Web Platform (SSR/SEO)** — TanStack Start, SSR rendering, meta tags, structured data, responsive layout                             | #2            | Product pages crawlable by Google; Lighthouse score > 90     |
| 4           | **AI Conversational Search** — pgvector embeddings, natural language query processing, contextual results                             | #2            | "Gift for my dad who likes cooking" returns relevant results |
| 5           | **Unified Checkout** — Violet iterative flow (cart → bags → shipping → payment → submit), Stripe KYC, Apple Pay / Google Pay          | #1, #2        | End-to-end purchase completes; commission tracked in Violet  |
| 6           | **Order Tracking** — Violet webhooks, bag state mapping, email notifications                                                          | #5            | User receives order confirmation and shipping updates        |
| 7           | **Brand & Design** — Ultra-minimalist premium aesthetic, anti-dark-pattern UX, FTC disclosure, wow-moment confirmation page           | Parallel #3-6 | Visual polish applied across all existing pages              |
| 8           | **Content & SEO** — Launch guides, product comparisons, internal linking, XML sitemap                                                 | #3            | First SEO content pages live and indexable                   |
| 9           | **Mobile App** — Expo Router, shared business logic, cross-device cart sync, push notifications, store submission                     | #1, #4, #5    | App published on App Store + Google Play                     |
| 10          | **Customer Support** — Centralized contact, order lookup, FAQ, refund flow documentation                                              | #6            | Support email/form live; return policy published             |

**Stripe KYC Note:** Channel KYC verification (Build Step 5) involves an administrative process with Stripe. Start this early — submit KYC paperwork during Build Step 1-2 so approval is ready when checkout development begins.

### Core User Journeys Supported at MVP

| Journey                            | Supported at Launch? | Notes                                                                                |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| Sarah — Search-Driven Discoverer   | Yes — full path      | SEO → AI search → product page → guest checkout → confirmation                       |
| Sarah Returns — Returning Loyalist | Yes — full path      | Web revisit → app download → cross-device cart → push notification → repeat purchase |
| Marcus — Premium Seeker            | Yes — full path      | Transparency, anti-dark-pattern, FTC disclosure, premium aesthetic                   |
| Charles — Solo Operator            | Yes — full path      | KPI dashboard, automated sync, webhook monitoring, content publishing                |
| Failed Payment — Error Recovery    | Yes — full path      | Graceful error handling, cart persistence, payment retry                             |
| Out-of-Stock — Edge Case           | Yes — full path      | Real-time inventory check, AI-powered alternatives, cart preservation                |

All 6 user journeys are fully supported at MVP launch. No journey is partially implemented.

### Post-MVP Features (Phase 2 — Growth)

| Feature                              | Rationale                                                                      | Trigger to Build                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Cashback as platform credit**      | Increases repeat purchase rate; keeps users in ecosystem                       | When monthly active buyers > 100                                           |
| **Sponsored merchant placement**     | Monetize supplier visibility; new revenue stream                               | When catalog has 3+ merchants                                              |
| **Conditional referral program**     | Organic growth via satisfied users; minimum purchase threshold prevents abuse  | When return buyer rate > 20%                                               |
| **Offline browsing (mobile)**        | Retention feature for commuters and low-connectivity users                     | When app DAU > 200                                                         |
| **Additional supplier integrations** | Expand catalog; validate Adapter Pattern with firmly.ai                        | When Violet catalog feels limiting or firmly.ai offers strategic advantage |
| **Google UCP activation**            | Capture agentic commerce wave; 50M daily AI shopping queries projected Q4 2026 | When Google UCP adoption metrics show critical mass                        |

**Phase 2 philosophy:** Each Growth feature has a concrete trigger condition. No feature is built speculatively — each is activated when data justifies the investment.

### Phase 3 — Vision (Long-Term)

| Feature                               | Description                                                          | Prerequisite                               |
| ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| **Predictive trend detection**        | AI identifies rising product trends from user behavior data          | Sufficient purchase data volume            |
| **Anonymized data insights**          | Aggregated, ethical trend reporting (never individual user data)     | GDPR-compliant data pipeline               |
| **Volume-based supplier negotiation** | Leverage purchase volume for exclusive pricing or higher commissions | Proven traffic and conversion volume       |
| **International expansion**           | Multilingual support, multi-currency, regional compliance            | Stable domestic operation                  |
| **Deep personalization**              | AI search learns individual taste profiles over time                 | Registered user base with purchase history |

### Risk Mitigation Strategy

**Technical Risks**

| Risk                                        | Severity | Mitigation                                                                                                                            |
| ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Violet.io iterative checkout complexity     | High     | Build Step 5 dedicates full focus to checkout; one-step UI abstracts multi-step API. Edge Functions handle orchestration server-side. |
| AI search quality with limited initial data | Medium   | Launch with curated product embeddings. Quality improves with usage data. Traditional browse available as fallback.                   |
| Cross-platform code sharing friction        | Medium   | Shared TypeScript business logic; platform-specific UI only where navigation patterns differ. TanStack Query as shared data layer.    |
| Stripe KYC approval delay                   | Medium   | Submit KYC paperwork immediately during Build Step 1. If delayed, checkout development proceeds with Violet test mode.                |

**Market Risks**

| Risk                                               | Severity | Mitigation                                                                                                                      |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Users don't discover the platform (SEO takes time) | High     | Content-first approach: launch with 10+ SEO guides before expecting organic traffic. Patience — SEO compounds over months.      |
| Users prefer Amazon/known platforms                | Medium   | Compete on experience, not selection. Target niche queries where Amazon overwhelms. "Best chef knife set" not "buy knife".      |
| Affiliate commission rates too low                 | Medium   | Violet commission rates are per-merchant. Monitor commission per order. If unsustainable, explore higher-commission categories. |

**Resource Risks**

| Risk                                            | Severity | Mitigation                                                                                                                            |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Solo dev burnout from 10-feature MVP            | Medium   | No deadline. Build in order. Each step is a functional milestone — celebrate progress. Take breaks between build steps.               |
| Skill gaps (e.g., pgvector, Stripe integration) | Medium   | Extensive documentation available (Violet docs, Supabase docs, Expo docs). AI coding assistants for acceleration. Learn as you build. |
| Scope creep during development                  | Low      | PRD is the contract. If a new idea emerges, add it to Phase 2 backlog — never to current build step.                                  |

## Functional Requirements

### Product Discovery & Search

- **FR1:** Visitors can search for products using natural language queries (e.g., "gift for my dad who likes cooking, budget $150")
- **FR2:** The system can return contextual product results with personalized explanations of why each product matches the query
- **FR3:** Visitors can browse products by category and collection
- **FR4:** Visitors can filter and sort product results by relevance, price, and availability
- **FR5:** The system can suggest similar products based on semantic similarity when a viewed product is unavailable
- **FR6:** Returning users can receive search results weighted by their purchase and browsing history, with relevance scoring that improves as interaction data accumulates

### Product Presentation

- **FR7:** Visitors can view product detail pages displaying hero image, price, essential specifications, and an internal review
- **FR8:** Visitors can view product images optimized for their device viewport via dynamic media transformations
- **FR9:** Visitors can read editorial content pages (guides, comparisons, reviews) that link to relevant products
- **FR10:** Visitors can see transparent pricing with no fake discounts, countdown timers, or dark-pattern manipulation
- **FR11:** Visitors can see clear affiliate disclosure on every page displaying products

### Shopping Cart & Checkout

- **FR12:** Visitors can add products from multiple merchants to a single unified cart
- **FR13:** Visitors can view their cart with accurate price estimates including tax and shipping
- **FR14:** Visitors can complete checkout as a guest without creating an account
- **FR15:** Visitors can pay using credit/debit card, Apple Pay, or Google Pay
- **FR16:** Visitors can select shipping methods for their order (per merchant when multiple merchants are in cart)
- **FR17:** The system can orchestrate the supplier's multi-step checkout flow (customer details, shipping, billing, payment) behind a single-page UI
- **FR18:** The system can validate inventory availability in real-time at checkout submission
- **FR19:** Visitors can retry payment with a different method if the initial payment fails, without losing cart or address data
- **FR20:** The system can capture and transmit marketing consent status per order as required by Violet.io
- **FR21:** The system can restrict checkout to Violet-supported countries and surface clear messaging for unsupported locations

### Order Management

- **FR22:** Buyers can view order confirmation with summary, tracking information, and estimated delivery
- **FR23:** Buyers can receive email notifications for order status changes (confirmed, shipped, delivered)
- **FR24:** Buyers can track order status across all merchants in a unified view
- **FR25:** The system can map Violet bag-level states to a simplified, user-facing unified order status
- **FR26:** The system can process bag-level refunds and communicate refund status to buyers
- **FR27:** Buyers can look up their order status by email without an account

### Customer Support

- **FR27a:** Visitors can access a centralized contact page with an email form to submit support inquiries
- **FR27b:** Visitors can browse a FAQ/help page covering common questions (shipping, returns, payment methods, order tracking)
- **FR27c:** Visitors can view the return and refund policy on a dedicated page accessible from product pages and checkout

### User Accounts & Personalization

- **FR28:** Visitors can use the platform with an anonymous session without any login requirement
- **FR29:** Visitors can optionally create an account to access persistent features (wishlist, order history, cross-device sync)
- **FR30:** Registered users can maintain a wishlist of saved products
- **FR31:** Registered users can access their cart across web and mobile devices in real-time
- **FR32:** Registered users can view their complete order history
- **FR33:** Registered users can authenticate using biometric methods (Face ID, fingerprint) on mobile

### Content & SEO

- **FR34:** The system can render all pages server-side with complete HTML for search engine crawlers
- **FR35:** The system can generate dynamic meta tags, Open Graph tags, and structured data (JSON-LD) per page
- **FR36:** The system can generate and maintain an XML sitemap covering all product and content pages
- **FR37:** Content editors (admin) can publish and manage editorial content pages (guides, reviews, comparisons)
- **FR38:** Content pages can include internal links to product pages and related editorial content

### Mobile Experience

- **FR39:** Web visitors can be prompted to download the mobile app via a dismissible banner that appears once per session after the first product view
- **FR40:** Mobile users can access all core features (search, browse, cart, checkout, order tracking) within the native app
- **FR41:** Mobile users can receive targeted push notifications for order updates, price drops on wishlisted items, and back-in-stock alerts
- **FR42:** Mobile users can configure push notification preferences by notification type
- **FR43:** The system can deep-link between web URLs and mobile app screens for seamless handoff

### Administration & Operations

- **FR44:** Admin can view a daily dashboard showing key performance indicators (visitors, conversion rate, revenue, AI search usage, app DAU)
- **FR45:** The system can automatically synchronize the product catalog from the supplier API via event-driven updates and scheduled sync
- **FR46:** The system can automatically mark products as unavailable when merchants report out-of-stock
- **FR47:** Admin can monitor webhook delivery health and Edge Function execution logs
- **FR48:** The system can automatically refresh API tokens before expiration without manual intervention
- **FR49:** The system can handle API rate limits gracefully via caching and request queuing
- **FR50:** Admin can receive alert notifications for critical system events (webhook failures, sync errors, unusual order patterns)

### Compliance & Trust

- **FR51:** The system can display FTC-compliant affiliate disclosure proximate to all purchase CTAs
- **FR52:** The system can enforce payment processor KYC verification as a prerequisite for payment processing
- **FR53:** The system can display pre-purchase information required by consumer protection laws (total price incl. taxes, delivery estimate, withdrawal rights)
- **FR54:** The system can handle guest user data according to GDPR data minimization principles (collect only what's needed, clear session data post-order)
- **FR55:** The system can process tax calculations during the pricing phase and configure tax remittance settings

## Non-Functional Requirements

### Performance

| NFR ID   | Requirement                                                                   | Metric                                               | Context                                                                      |
| -------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| **NFR1** | Web pages must load fast enough to feel premium and satisfy Core Web Vitals   | FCP < 1.5s, LCP < 2.5s, CLS < 0.1, TTI < 3.0s        | Measured on mid-range mobile device over 4G connection                       |
| **NFR2** | AI conversational search must respond fast enough to feel like a conversation | Query → results displayed < 2s end-to-end            | Includes pgvector similarity search + result formatting                      |
| **NFR3** | Checkout flow must complete without perceptible delays                        | Cart → confirmation < 3s total perceived time        | Backend orchestrates Violet's multi-step API; user sees spinner only briefly |
| **NFR4** | Mobile app must start fast enough to feel native                              | Cold start < 2s on mid-range device                  | Expo/React Native with New Architecture                                      |
| **NFR5** | Cross-device cart sync must be imperceptible                                  | Web ↔ mobile sync latency < 1s                       | Via Supabase Realtime subscriptions                                          |
| **NFR6** | Product images must load without blocking page rendering                      | Lazy-loaded, progressive rendering, WebP/AVIF format | Violet Media Transformations for dynamic resizing                            |
| **NFR7** | JavaScript bundle must be small enough for fast initial load                  | Total JS < 200KB gzipped                             | TanStack Start with route-based code splitting                               |

### Security

| NFR ID    | Requirement                                             | Metric                                                                                                             | Context                                                |
| --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **NFR8**  | Payment data must never touch our servers               | Zero payment card data stored or transmitted by platform                                                           | All payment processing handled by Stripe via Violet.io |
| **NFR9**  | API tokens must never be exposed to client-side code    | Zero Violet/Stripe tokens in browser or mobile app runtime                                                         | All API calls routed through Supabase Edge Functions   |
| **NFR10** | All data in transit must be encrypted                   | 100% HTTPS (TLS 1.2+), no HTTP endpoints                                                                           | HSTS headers enforced on web platform                  |
| **NFR11** | All data at rest must be encrypted                      | Database encryption at rest enabled; verified via provider dashboard                                               | Default Supabase Cloud configuration                   |
| **NFR12** | Guest session data must be minimized and ephemeral      | Only name, email, shipping address collected; session cleared post-order for guests                                | GDPR Article 5(1)(c) compliance                        |
| **NFR13** | Authentication must be resilient against common attacks | Rate-limited login attempts, industry-standard password hashing, no credential storage beyond managed auth service | OWASP Authentication best practices                    |
| **NFR14** | Webhook endpoints must validate request authenticity    | Custom webhook headers verified on every incoming Violet webhook                                                   | Reject unsigned or tampered webhook payloads           |

### Scalability

| NFR ID    | Requirement                                                            | Metric                                                                  | Context                                                   |
| --------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| **NFR15** | System must handle organic traffic growth without architecture changes | Support 10x current traffic with managed service tier upgrades only     | Supabase Pro plan + Edge Functions scale horizontally     |
| **NFR16** | Product catalog cache must scale with catalog size                     | Support 100,000+ products in primary database without query degradation | PostgreSQL indexing + pgvector HNSW index for search      |
| **NFR17** | Concurrent checkout sessions must not interfere with each other        | Support 50+ simultaneous checkout sessions                              | Each checkout is independent cart → order flow via Violet |
| **NFR18** | SEO traffic spikes must not degrade performance for existing users     | SSR response time remains < 1.5s at 5x normal traffic                   | TanStack Start SSR with caching layer                     |

### Accessibility

| NFR ID    | Requirement                                          | Metric                                          | Context                                                    |
| --------- | ---------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| **NFR19** | Web platform must meet WCAG 2.1 Level AA             | Lighthouse Accessibility score > 95             | Automated testing + manual screen reader verification      |
| **NFR20** | All interactive elements must be keyboard-accessible | 100% of actions completable via keyboard alone  | Tab navigation, Enter/Space activation, Escape to close    |
| **NFR21** | Color contrast must meet minimum ratios              | 4.5:1 for normal text, 3:1 for large text       | Premium minimalist design naturally supports high contrast |
| **NFR22** | Motion must respect user preferences                 | All animations respect `prefers-reduced-motion` | No essential information conveyed through animation alone  |
| **NFR23** | Touch targets must be usable on mobile               | Minimum 44x44px for all interactive elements    | Applies to both web (responsive) and native app            |

### Reliability

| NFR ID    | Requirement                                          | Metric                                                                           | Context                                                                |
| --------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **NFR24** | Platform must be consistently available for shoppers | > 99.5% uptime across backend infrastructure and web hosting                     | Maximum ~3.6 hours unplanned downtime per month                        |
| **NFR25** | Cart data must survive failures                      | Zero cart data loss on payment failure, browser crash, or app force-quit         | Cart persisted server-side in Supabase before checkout                 |
| **NFR26** | Webhook processing must be resilient                 | Zero lost order status updates; retry failed webhook processing within 5 minutes | Idempotent webhook handlers; dead letter queue for persistent failures |
| **NFR27** | Catalog sync must self-recover from transient errors | Automatic retry with exponential backoff; full resync on persistent failure      | Nightly validation cron catches any missed updates                     |
| **NFR28** | Token refresh must be transparent to users           | Zero user-facing errors from expired API tokens                                  | Proactive refresh before expiry window                                 |

### Integration

| NFR ID    | Requirement                                          | Metric                                                                                         | Context                                                           |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **NFR29** | Violet.io API dependency must be gracefully degraded | Product browsing available during Violet API outage; checkout unavailable with clear messaging | Supabase product cache serves as read-only fallback               |
| **NFR30** | Stripe payment failures must not corrupt order state | Order state remains consistent regardless of payment outcome                                   | Atomic operations: cart → order only on confirmed payment         |
| **NFR31** | API rate limits must be handled without user impact  | Zero user-facing errors from rate limiting under normal traffic                                | Request queuing, caching, exponential backoff                     |
| **NFR32** | Adapter Pattern must enable supplier switching       | New supplier adapter operational within 5 developer-days                                       | Validated by firmly.ai adapter as second implementation (Phase 2) |
