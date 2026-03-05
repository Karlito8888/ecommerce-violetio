---
stepsCompleted: [1, 2, 3, 4, 5, 6]
workflow_completed: true
inputDocuments:
  - "_bmad-output/brainstorming/brainstorming-session-2026-03-02-1400.md"
date: 2026-03-03
author: Charles
---

# Product Brief: E-commerce

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

E-commerce is a white-label affiliate platform delivering a premium, unified shopping experience — web and mobile — without operating as a merchant. The platform aggregates partner product catalogs through affiliate APIs, presenting them under a single brand with integrated checkout, AI-powered conversational search, and centralized customer support. The founder operates purely as a service provider earning affiliate commissions — no inventory, no buy/resell, no complex accounting. The product is not the physical goods; it is the shopping experience itself: a "Digital Personal Shopper" that combines the trust and polish of a premium e-commerce store with the lightweight cost structure of an affiliate blog.

---

## Core Vision

### Problem Statement

Today, building an e-commerce experience requires a binary choice: either operate as a full merchant (purchasing, stocking, shipping, complex accounting with assets and liabilities) or settle for traditional affiliate marketing that redirects users to third-party merchant sites — destroying brand consistency and user experience. There is no middle path that combines a premium, unified shopping experience with the simplicity of a pure service-provider model.

### Problem Impact

- **For consumers:** Affiliate sites offer fragmented, low-trust experiences with constant redirections. Premium shopping experiences exist only on merchant-owned platforms (Amazon, brand stores) that lock users into specific ecosystems.
- **For independent creators:** The barrier to entry for quality e-commerce is prohibitively high — merchant status, inventory management, logistics, and complex financial obligations. Affiliate marketing offers simplicity but sacrifices the user experience entirely.
- **Market gap:** No one has built a premium, Apple-style shopping experience on top of white-label affiliate infrastructure. The category does not yet exist.

### Why Existing Solutions Fall Short

- **Amazon Associates, Awin, CJ Affiliate, ShareASale:** Commission-based but redirect users to merchant sites. No integrated checkout. The affiliate is invisible to the buyer.
- **Shopify, WooCommerce:** Require merchant status with full buy/resell model. Inventory, logistics, accounting overhead.
- **Dropshipping platforms:** Still require merchant status (you buy then resell). Not a service-provider model.
- **Existing affiliate sites:** Low-effort content sites with banner ads and links. No curated shopping experience, no unified cart, no integrated checkout.

### Proposed Solution

A platform that operates as a pure service provider — earning only affiliate commissions — while delivering an e-commerce experience indistinguishable from a premium online store. Key elements:

- **White-label invisible:** Users never know they are not buying directly from the platform. Multi-supplier reality is completely hidden.
- **Unified checkout:** Single cart, single payment flow (one-step), regardless of how many suppliers fulfill the order. Payment handled via supplier API (scenario A) or embedded widget (scenario B) — never by the platform itself.
- **AI conversational search:** Natural language product discovery as the primary differentiator — not just filters and categories.
- **SEO-first web + mobile-first app:** User acquisition through SEO-driven web content, retention through a premium mobile experience (Expo/React Native).
- **Solo-dev maintainable:** Full TanStack (web) + Expo Router/RN (mobile) + Supabase backend. Designed to be built and maintained by one person.
- **Supplier-agnostic architecture:** Adapter Pattern enabling pluggable supplier integrations without platform-level changes.

### Key Differentiators

1. **Category creator:** No existing platform combines white-label affiliate with premium UX. This is an empty competitive space.
2. **Zero merchant overhead:** Pure service-provider model — single revenue stream (commissions), no assets/liabilities accounting, no inventory risk.
3. **The product is the experience:** AI search, Apple-style design, unified checkout — the shopping experience itself is the value proposition, not the physical products.
4. **Invisible white-label:** "The best white-label is one nobody suspects exists."
5. **Solo-dev architecture:** Modern stack (TanStack + Expo + Supabase) chosen specifically for maintainability by a single developer with full technical autonomy.

## Target Users

### Primary Users

**Persona 1: "The Search-Driven Discoverer" — Organic SEO Buyer**

- **Profile:** English-speaking online shopper, no specific age or demographic restriction. Arrives via search engine queries like "best wireless headphones 2026", "premium leather wallet review", or "top minimalist backpack".
- **Current behavior:** Compares across 3-5 sites, reads reviews, often ends up on Amazon out of habit and trust — even when they'd prefer an alternative.
- **Pain points:** Overwhelmed by choice on Amazon, distrusts low-effort affiliate sites full of ads and redirections, craves a curated, trustworthy shopping experience.
- **What wins them over:** Clean Apple-style product pages, honest content (guides & comparisons), AI-powered conversational search that understands what they actually want, and a seamless guest checkout — no forced account creation.
- **Success moment:** "I found exactly what I wanted in 2 minutes, the page told me everything I needed, and I checked out without creating an account. Why can't every site be like this?"

**Persona 2: "The Returning Loyalist" — Recurring App Buyer**

- **Profile:** Former Search-Driven Discoverer who had such a good first experience they downloaded the mobile app.
- **Current behavior:** Opens the app to browse when considering a purchase. Uses the AI search conversationally ("I need a gift for my dad who likes cooking"). Has a wishlist. Checks push notifications — but only because they are ultra-targeted and relevant, not spammy.
- **What keeps them coming back:** The AI search learns their preferences over time. Persistent cross-device cart. Push notifications that feel like a personal shopper whispering "that item you liked is on sale" — not "BUY NOW 50% OFF!!!".
- **Purchase frequency:** Monthly to bi-monthly, with seasonal spikes.
- **Success moment:** "This app just gets me. I described what I wanted in plain words and it showed me exactly the right thing. It's like having a personal shopper in my pocket."

**Persona 3: "The Premium Seeker" — Quality-Over-Price Buyer**

- **Profile:** The platform's design DNA (Apple-style, minimalist, anti-AliExpress) naturally attracts buyers who value quality presentation and trust signals over bargain hunting.
- **Current behavior:** Avoids cluttered discount sites. Willing to pay fair price for products presented with clarity and confidence. Values honest reviews over manufactured urgency.
- **What wins them over:** No dark patterns. No "Only 2 left!" pressure tactics. No Booking.com-style manipulation. A wishlist that respects them. A platform that feels premium without being pretentious.
- **Success moment:** "Finally, a shopping site that treats me like an adult. Clean design, honest information, no tricks."

### Secondary Users

No secondary user segments. Merchant partners operate purely on the supplier side and have no visibility or interaction surface on the platform. The white-label model is invisible by design.

### User Journey

**Discovery → Conversion → Retention Loop:**

1. **Discovery (SEO):** User searches Google for a product or comparison. Finds a high-quality content page (guide, review, comparison) on the platform. The content is honest, well-designed, and provides genuine value.
2. **First impression:** Clean, premium design immediately builds trust. No ads, no pop-ups, no clutter. The user feels they've found something different.
3. **Product exploration:** AI conversational search lets them refine what they want in natural language. Product pages are Apple-style — essential information only, no noise.
4. **Checkout (the "aha!" moment):** Guest checkout, one-step, Apple Pay / Google Pay. No forced account creation. No redirection to another site. The user never leaves the platform. "Wait — I just bought something and it was... easy?"
5. **Post-purchase:** Unified order tracking across all suppliers (invisible to user). Centralized customer support — one point of contact regardless of supplier. "Wow moment" confirmation page.
6. **Retention trigger:** Experience was so good the user downloads the mobile app. Cross-device cart syncs. AI search becomes personalized. Push notifications are relevant and respectful. The platform becomes their default starting point for online shopping.
7. **Long-term loyalty:** The Discoverer becomes a Loyalist. SEO acquisition cost drops to zero for returning users. The platform breaks the Amazon habit — not by competing on selection, but by winning on experience.

## Success Metrics

### User Success Metrics

| Metric                   | What it measures                                    | Target                                         |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------- |
| Search-to-product time   | How fast AI search delivers relevant results        | < 30 seconds to find desired product           |
| Checkout completion rate | Friction-free purchase experience                   | > 70% of carts started → completed             |
| Guest checkout usage     | No-friction purchase without forced signup          | > 80% of first-time buyers use guest checkout  |
| App install rate         | Web experience good enough to drive mobile adoption | > 5% of returning web visitors install the app |
| Return visit rate        | Users come back without paid acquisition            | > 30% of buyers return within 60 days          |

**User success signal:** A first-time visitor from Google finds a product via AI search, checks out as guest in under 2 minutes, and comes back within a month — either on web or by downloading the app.

### Business Objectives

**3-month milestone (post-launch):**

- Platform live with at least one white-label supplier fully integrated
- Organic SEO traffic growing week-over-week
- First commissions earned — proof that the model works end-to-end
- Mobile app published on App Store and Google Play

**12-month milestone:**

- Multiple suppliers integrated via Adapter Pattern
- Sustainable monthly commission revenue trending toward financial independence
- SEO as primary acquisition channel with low/zero paid marketing spend
- Discoverer → Loyalist conversion loop working (web → app retention)

**Long-term vision:**

- The platform becomes a recognized alternative shopping destination
- Commission revenue covers living expenses and platform operating costs
- Maintained by one person without operational overhead

### Key Performance Indicators

**Daily dashboard — the 5 numbers to check every morning:**

| KPI                               | Why it matters                        |
| --------------------------------- | ------------------------------------- |
| Daily unique visitors (SEO)       | Is the acquisition engine working?    |
| Conversion rate (visitor → buyer) | Is the UX delivering?                 |
| Daily commission revenue          | Is the business model working?        |
| AI search usage rate              | Is the key differentiator being used? |
| App DAU (daily active users)      | Is the retention loop growing?        |

**Leading indicators (predict future success):**

- SEO keyword rankings improving → future traffic growth
- Content pages indexed by Google → expanding acquisition surface
- AI search satisfaction (results clicked vs. refined) → UX quality
- Wishlist additions → purchase intent pipeline

**Vanity metrics to ignore:**

- Total registered users (guest checkout means many buyers won't register)
- Social media followers (not part of acquisition strategy)
- Time on site (meaningless without conversion context)

## MVP Scope

### Core Features

**Prerequisite (before any development with real data):**

- Find and integrate at least one white-label supplier with full API access (catalog, order, tracking) — no checkout redirection

**1. AI Conversational Search (Primary Differentiator)**

- Natural language product search ("I need a gift for my dad who likes cooking")
- Curated, relevant results — not infinite scroll
- Powered by OpenAI or GLM
- Search works identically on web and mobile

**2. Product Catalog & Pages**

- Aggregated product catalog from supplier(s) via Adapter Pattern
- Apple-style minimalist product pages — essential info only, no noise
- Real products only — zero mock data, ever
- Internal reviews/trust score system

**3. Unified Checkout**

- One-step checkout — everything on a single screen
- Guest checkout (no forced account creation)
- Apple Pay / Google Pay support
- Single cart across multiple suppliers (invisible to user)
- Payment handled via supplier API (scenario A) or embedded widget (scenario B) — platform never processes payments directly

**4. Order Tracking**

- Unified tracking across all suppliers
- User sees one coherent order status — multi-supplier reality hidden
- Push notifications for order status updates (mobile)

**5. Customer Support**

- Centralized point of contact — one SAV regardless of supplier
- Scope and format dependent on supplier policy (to be defined after supplier integration)
- Minimum: dedicated contact channel with clear response commitment

**6. Web Platform (SEO-First)**

- Full TanStack (Router, Query, Start, Form)
- SEO-optimized content pages (guides, reviews, comparisons)
- Premium Apple-style design — anti-AliExpress aesthetic
- Responsive, but designed primarily as SEO acquisition surface

**7. Mobile App (Day 1 — Non-Negotiable)**

- Expo Router + React Native
- Shared components with web
- Persistent cross-device cart
- Ultra-targeted push notifications (not spam)
- Published on App Store and Google Play at launch

**8. Backend Infrastructure**

- Supabase (PostgreSQL, Auth, Edge Functions)
- Supplier-agnostic Adapter Pattern architecture
- Authentication system (optional for users — guest checkout is default)
- No Shopify, no WooCommerce, no Next.js

**9. Brand & Design**

- Ultra-minimalist visual identity
- Premium, sober, honest design DNA
- White-label invisible — user never suspects multi-supplier model
- "Wow moment" confirmation page
- Wishlist without dark patterns

**10. Content & SEO**

- Honest guides and product comparisons
- SEO conversational content as primary acquisition channel
- Content marketing strategy ready at launch

### Out of Scope for MVP

| Feature                                        | Rationale                                                    | Target Phase           |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| Cashback / credit system                       | Adds complexity, not core to value proposition               | Phase 2                |
| Sponsored merchant placement                   | Requires merchant volume and negotiation leverage            | Phase 2                |
| Anonymized data sales                          | Requires significant user base first                         | Phase 2+               |
| Conditional referral program                   | Needs proven retention loop before incentivizing acquisition | Phase 2                |
| Offline browsing                               | Nice-to-have, not essential for core experience              | Phase 2                |
| Predictive trend detection                     | Requires data volume and ML pipeline                         | Phase 3                |
| Multi-supplier packaging white-label           | Dependent on supplier capabilities                           | When available         |
| Social features (curators, feed, gamification) | Eliminated in brainstorming — excessive complexity           | Never (current vision) |
| Scan & Compare                                 | Out of scope — eliminated in brainstorming                   | Never (current vision) |

### MVP Success Criteria

**Go / No-Go gates:**

| Gate                   | Validation                                                                | Signal                        |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| Supplier integration   | At least one white-label supplier live with full API                      | Model is technically feasible |
| First organic purchase | A real user from Google completes a purchase without leaving the platform | End-to-end flow works         |
| Commission received    | First affiliate commission hits the account                               | Business model validated      |
| Return buyer           | A user who bought once comes back and buys again                          | Experience creates loyalty    |
| App install from web   | A web user downloads the mobile app after purchase                        | Retention loop initiated      |

**Decision point to scale beyond MVP:**

- Consistent weekly organic traffic growth from SEO
- Conversion rate above 2% (visitor → buyer)
- At least one returning buyer per week
- Commission revenue covering platform operating costs (Supabase, hosting, APIs)

### Future Vision

**Phase 2 — Growth (post-MVP validation):**

- Cashback as platform credit (not cash — keeps users in ecosystem)
- Sponsored merchant placement (monetize supplier visibility)
- Conditional referral program (minimum purchase or curated products only)
- Offline browsing on mobile
- Additional supplier integrations via Adapter Pattern

**Phase 3 — Scale:**

- Predictive trend detection powered by user behavior data
- Anonymized data insights (aggregated, ethical)
- Volume-based negotiation with suppliers for exclusive pricing
- International expansion with multilingual support (foundation built day 1)

**Long-term (2-3 years):**

- The platform becomes a recognized alternative to Amazon for curated, premium shopping
- Multiple suppliers integrated seamlessly — category expansion
- AI search becomes genuinely personalized — knows each user's taste
- "Digital Personal Shopper" brand identity fully established
- Solo-dev maintained with sustainable commission-based revenue
