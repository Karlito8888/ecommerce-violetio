---
stepsCompleted: [1, 2, 3, 4, 5, 6]
workflow_completed: true
inputDocuments:
  - "_bmad-output/brainstorming/brainstorming-session-2026-03-02-1400.md"
  - "_bmad-output/planning-artifacts/product-brief-E-commerce-2026-03-03.md"
workflowType: "research"
lastStep: 6
research_type: "domain"
research_topic: "White-label affiliate suppliers — API-first providers with integrated checkout (no redirection)"
research_goals: "Identify and evaluate white-label affiliate suppliers offering full API access (product catalog, order placement, tracking, payment) enabling a seamless e-commerce experience without merchant status — for a Digital Personal Shopper platform"
user_name: "Charles"
date: "2026-03-03"
web_research_enabled: true
source_verification: true
---

# Research Report: Domain

**Date:** 2026-03-03
**Author:** Charles
**Research Type:** Domain — White-Label Affiliate Suppliers

---

## Research Overview

This research investigates the viability and landscape of **white-label affiliate suppliers with integrated checkout APIs** — the critical prerequisite for building a "Digital Personal Shopper" platform that offers a premium e-commerce experience without merchant status. The research was conducted using 30+ web searches across authoritative sources (market research firms, official API documentation, regulatory bodies, industry publications) with multi-source validation for all critical claims.

**Key finding:** The embedded commerce market — where channels can sell products natively (no redirect) while merchants remain the Merchant of Record — is real, nascent, and growing fast. Three providers (Violet.io, firmly.ai, Shoppable) and one emerging standard (Google UCP, Jan 2026) offer the exact infrastructure needed. Violet.io emerges as the primary recommended provider for its developer-first API, comprehensive documentation, and headless architecture that gives the channel full control over UX.

**Strategic insight:** AI conversational search, originally identified as the project's #1 differentiator, has been commoditized by ChatGPT Shopping (Nov 2025), Perplexity, and Google AI Mode. The true differentiator shifts to: curated shopping experience + premium Apple-style UX + brand trust + seamless native checkout — a combination no one has built on embedded commerce APIs. The competitive space remains empty. For full findings and recommendations, see the **Research Synthesis** section at the end of this document.

---

## Domain Research Scope Confirmation

**Research Topic:** White-label affiliate suppliers — API-first providers with integrated checkout (no redirection)
**Research Goals:** Identify and evaluate white-label affiliate suppliers offering full API access (product catalog, order placement, tracking, payment) enabling a seamless e-commerce experience without merchant status — for a Digital Personal Shopper platform

**Domain Research Scope:**

- Industry Analysis - market structure of white-label affiliation, key players, competitive landscape
- Regulatory Environment - compliance requirements for affiliate service-provider model, legal frameworks
- Technology Trends - API capabilities (catalog, order, tracking, payment), checkout integration patterns
- Economic Factors - commission rates, payment models, financial viability
- Supply Chain Analysis - value chain (affiliate networks, semi white-label, API-first dropshipping, D2C brands), ecosystem relationships

**Research Methodology:**

- All claims verified against current public sources
- Multi-source validation for critical domain claims
- Confidence level framework for uncertain information
- Comprehensive domain coverage with industry-specific insights

**Scope Confirmed:** 2026-03-03

---

## Industry Analysis

### Market Size and Valuation

The global affiliate marketing industry represents a massive and rapidly growing market. Multiple research firms converge on a valuation of **$17–18.5 billion in 2025**, with projections exceeding **$20 billion in 2026**.

_Total Market Size: $17–18.5 billion globally (2025), $20+ billion (2026)_
_Growth Rate: CAGR of 15.2% — projected to reach $71.74 billion by 2034 (Grand View Research / FnF Research)_
_US Market: $12 billion (2025) → $13+ billion (2026), growing at 10–12% annually_
_Regional Split: North America 40%, Europe 30%, Asia-Pacific fastest-growing at 10% CAGR_
_Sources: [Post Affiliate Pro](https://www.postaffiliatepro.com/blog/affiliate-marketing-industry-size-2025/), [FnF Research](https://www.fnfresearch.com/affiliate-market), [Grand View Research](https://www.grandviewresearch.com/industry-analysis/affiliate-marketing-platform-market-report), [Cognitive Market Research](https://www.cognitivemarketresearch.com/regional-analysis/north-america-affiliate-market-report)_

**Critical distinction for this project:** The above figures cover the entire affiliate marketing ecosystem (networks, tracking software, management services, creative tools). The specific sub-segment relevant to Charles — **embedded commerce / native checkout affiliate APIs** — is an emerging niche within this market, not yet separately valued by research firms. This is both a risk (unproven sub-market) and an opportunity (empty competitive space, as identified in brainstorming).

### Market Dynamics and Growth

The affiliate marketing industry is experiencing a structural transformation driven by three converging forces:

**Growth Drivers:**

- AI integration in content creation, campaign optimization, and predictive analytics
- Mobile commerce acceleration — app-based shopping overtaking desktop
- Creator economy expansion — micro/nano-influencers growing at 25% annually as affiliate segment
- B2B affiliate adoption accelerating at 17% (2025)
- Cookie deprecation forcing innovation in tracking → 70% of platforms migrating to server-side (S2S) solutions
- Live commerce projected to exceed 5% of all North American e-commerce by 2026

**Growth Barriers:**

- Market saturation in traditional affiliate content (SEO competition)
- Fraud: 42% of marketers face fraudulent traffic, 34% encounter misreported conversions
- Multi-jurisdiction compliance increasing administrative overhead by 15–30%
- Dominant platforms (Google, Amazon, Facebook) setting stringent terms for smaller affiliates

**Market Maturity:** The traditional redirect-based affiliate model is mature. However, the **embedded commerce** model (native checkout without redirect) is in its **early-growth phase** — comparable to where SaaS was circa 2010. Key signal: CJ's partnership with firmly.ai (September 2025) is producing 20–40% more transactions for early publishers.

_Cyclical Patterns: Strong seasonality around Black Friday/Cyber Monday, holiday season, back-to-school_
_Sources: [IMD](https://www.imd.org/blog/marketing/affiliate-marketing/), [Hostinger](https://www.hostinger.com/tutorials/affiliate-marketing-statistics), [OptinMonster](https://optinmonster.com/affiliate-marketing-statistics/), [Business Research Insights](https://www.businessresearchinsights.com/market-reports/affiliate-market-118327)_

### Market Structure and Segmentation

The affiliate ecosystem can be segmented into **four distinct models**, ranging from traditional to cutting-edge. This segmentation is critical for Charles's project because it maps directly to the brainstorming's "four supplier categories":

**Segment 1: Traditional Affiliate Networks (Redirect Model)**

- Players: Amazon Associates, Awin (absorbed ShareASale Oct 2025), CJ Affiliate, Rakuten, Impact
- Model: Publisher places affiliate links → user clicks → redirected to merchant site → purchases there
- Commission: 1–50% depending on vertical (finance pays $50–200/lead flat fee)
- API capabilities: Product feeds (catalog), transaction reporting, link generation — but **NO order placement or checkout API**
- Relevance for project: **Low** — requires redirect, breaks white-label experience

**Segment 2: Embedded Commerce APIs (Native Checkout — No Redirect)**

- Players: **Violet.io** (Unified Checkout API), **firmly.ai** (Agentic Commerce), **Shoppable** (Universal Checkout)
- Model: API-first — channel displays products and completes checkout natively, orders routed to merchants behind the scenes
- Commission: Merchant-defined (Violet: 0–100%, channel max 50%), based on order subtotal
- API capabilities: **Full — catalog, cart, checkout, order placement, tracking**
- Relevance for project: **VERY HIGH** — this is exactly the model Charles described. Merchant remains "merchant of record" → channel (Charles) is NOT a merchant
- Market maturity: **Nascent** — Violet connects to 5M+ merchants across platforms; firmly.ai + CJ partnership launched Sept 2025

**Segment 3: API-First Dropshipping Platforms**

- Players: Wholesale2B, CJDropshipping, AutoDS, Spocket
- Model: Platform provides product catalog + order automation via API — but **you are the merchant** (buy/resell)
- Commission: N/A — you set your own margin
- API capabilities: Catalog, order placement, tracking
- Relevance for project: **LOW** — requires merchant status (buy/resell model), contradicts Charles's "zero merchant overhead" vision

**Segment 4: White-Label E-Commerce Platforms**

- Players: Yo-Kart, Simvoly, SellersCommerce, Store.icu
- Model: Platform-as-a-service to build your own branded marketplace
- Relevance for project: **LOW** — these are merchant-centric platforms, not affiliate infrastructure

_Geographic Distribution: Segment 1 global but US-centric; Segment 2 primarily US-based (Violet, firmly, Shoppable all US companies); Segment 3 global with strong China sourcing (CJDropshipping)_
_Vertical Integration: Segment 2 is the only one offering true vertical integration from product discovery to checkout without the channel becoming a merchant_
_Sources: [Violet.io](https://violet.io/), [firmly.ai + CJ](https://junction.cj.com/article/cj-firmly), [Shoppable](https://about.shoppable.com/products/api), [Wholesale2B](https://www.wholesale2b.com/dropship-api-plan.html), [Yo-Kart](https://www.yo-kart.com/blog/top-white-label-marketplace-platforms/)_

### Industry Trends and Evolution

**Emerging Trends:**

1. **Embedded Commerce Revolution** — The most significant trend for this project. The industry is shifting from "link out" to "buy here." CJ + firmly.ai (Sept 2025), Violet.io's Unified Checkout API, and Shoppable's patented Universal Checkout all signal that the next generation of affiliate is **checkout-native**, not redirect-based. Violet's blog explicitly states: "One of the greatest shortcomings of affiliate marketing is the inability to do multi-merchant checkout."
2. **AI-Powered Discovery** — AI is reshaping how products are found. Perplexity partnered with firmly.ai to create "shoppable answers" — AI search results with native checkout. This validates Charles's "AI conversational search" differentiator.
3. **Server-Side Tracking (S2S)** — Cookie deprecation is accelerating adoption of server-to-server attribution. 70% of platforms migrating. This aligns with the project's planned S2S tracking.
4. **Agentic Commerce** — firmly.ai brands itself as "agentic commerce" — AI agents that can browse, discover, and purchase on behalf of users. Early-stage but signals the direction.

**Historical Evolution (2020–2026):**

- 2020–2022: Traditional affiliate dominance — links, banners, content sites
- 2023–2024: API maturation — product feeds become standard, tracking improves
- 2025: Embedded checkout breakthrough — CJ/firmly partnership, Violet scaling, Shoppable patenting
- 2026: AI + embedded commerce convergence — the era Charles is entering

**Technology Integration:**

- Headless commerce architecture enables decoupled frontends (exactly TanStack + Expo approach)
- REST APIs becoming standard for product catalog access across platforms
- Payment orchestration evolving — channels can facilitate payments without being merchant of record

**Future Outlook (Confidence: Medium-High):**

- Embedded commerce will become a standard option alongside redirect within 2–3 years
- Major affiliate networks (Awin, Rakuten, Impact) will likely follow CJ's lead with embedded checkout partnerships
- AI-powered product discovery will become a competitive necessity, not a differentiator, within 3–5 years

_Sources: [PYMNTS](https://www.pymnts.com/partnerships/2025/cj-and-firmly-team-to-provide-embedded-checkout-for-publishers/), [Violet Blog](https://violet.io/blog/integrated-native-checkout-vs-automated-order-processing), [Shoppable](https://resources.shoppable.com/offer-online-shopping-everywhere), [GlobeNewsWire](https://www.globenewswire.com/news-release/2025/09/10/3147817/0/en/firmly-ai-and-CJ-Forge-Strategic-Partnership-to-Transform-Native-Commerce-for-Publishers-and-Merchants.html)_

### Competitive Dynamics

**Market Concentration:**

- Traditional affiliate: **Highly concentrated** — Awin (absorbed ShareASale), CJ, Rakuten, Amazon Associates, Impact dominate. $17B in annual sales through Awin/ShareASale alone, 270K+ active affiliates.
- Embedded commerce: **Fragmented/nascent** — 3 identified players (Violet, firmly, Shoppable) each with different approaches. No dominant player yet. This is the window.

**Competitive Intensity:**

- For traditional affiliate publishers: **Extreme** — saturated SEO, algorithmic changes, dominant platform control
- For embedded commerce channels: **Low** — very few players have built a consumer-facing brand on embedded commerce APIs. Most current users are media apps, social platforms, and content publishers — **not dedicated shopping experiences**. Charles's "Digital Personal Shopper" would be a novel application.

**Barriers to Entry:**

- **Low technical barriers** for embedded commerce (APIs are well-documented, especially Violet's)
- **High UX barrier** — building a premium, trustworthy shopping experience requires design and engineering excellence (Charles's strength)
- **Medium supplier barrier** — need to negotiate merchant relationships (Violet provides 5M+ merchants; Shoppable offers 500M+ SKUs — but actual availability and commission terms require validation)
- **Trust barrier** — new platform must build credibility from zero (mitigated by design quality and content strategy)

**Innovation Pressure:**

- The embedded commerce space is moving fast — new partnerships announced monthly
- AI integration is accelerating (Perplexity + firmly, ChatGPT shopping features)
- First-mover advantage in the "dedicated embedded commerce shopping platform" space could be significant

_Sources: [Awin](https://www.awin.com/us/news-and-events/awin-news/awin-shareasale-new-era), [Violet Docs](https://docs.violet.io/checkout/payouts/commission-rates), [Shoppable](https://resources.shoppable.com/2021/07/20/shoppable-drives-more-shopper-conversions), [Shopify](https://www.shopify.com/blog/what-is-barrier-to-entry)_

## Competitive Landscape

### Key Players and Market Leaders

The embedded commerce / native checkout space has **3 established players** and **1 major new entrant** (Google UCP). Each targets a different angle of the same problem: enabling commerce without redirect.

**Tier 1 — Dedicated Embedded Commerce APIs:**

| Player        | Founded | HQ           | Size               | Funding                                            | Merchants                        |
| ------------- | ------- | ------------ | ------------------ | -------------------------------------------------- | -------------------------------- |
| **Violet.io** | 2017    | Seattle, WA  | ~36 employees      | $14M (Series A led by Klarna)                      | 5M+ via 225+ ecommerce platforms |
| **firmly.ai** | ~2020   | Seattle, WA  | Small (startup)    | Seed round (FJ Labs, Ark Invest, BGV, Mu Ventures) | ~11M (majority of US online GMV) |
| **Shoppable** | 2012    | New York, NY | Profitable company | Undisclosed (Series A+)                            | 500M+ SKUs                       |

**Tier 2 — Protocol-Level Standard (New Entrant Jan 2026):**

| Player                                       | Launch       | Backers                                                                                                                                                                | Status                                            |
| -------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Google UCP** (Universal Commerce Protocol) | Jan 11, 2026 | Google, Shopify, Etsy, Wayfair, Target, Walmart, Visa, Mastercard, Stripe, Adyen, American Express, Best Buy, Macy's, The Home Depot, Zalando, Flipkart (20+ partners) | Open-source standard, waitlist for implementation |

**Tier 3 — Traditional Affiliate Networks (Redirect Model — competitors by category, not by model):**

- Awin/ShareASale (merged Oct 2025): 270K+ affiliates, $17B annual sales
- CJ Affiliate: Now partnered with firmly.ai for embedded checkout
- Rakuten, Impact, Amazon Associates: No embedded checkout capability

_Market Leaders: Violet.io leads in API maturity and documentation; firmly.ai leads in merchant coverage and AI partnerships; Shoppable leads in patents and longevity_
_Emerging Players: Google UCP is the most significant new force — could standardize the entire space_
_Global vs Regional: All Tier 1 players are US-based; Google UCP has global ambitions (but US-first launch)_
_Sources: [Violet.io](https://violet.io/), [firmly.ai](https://www.firmly.ai/), [Shoppable](https://about.shoppable.com/), [Google UCP](https://developers.google.com/merchant/ucp), [Klarna invests in Violet](https://violet.io/blog/violet-10m-series-a-by-klarna), [CJ + firmly](https://junction.cj.com/article/cj-firmly)_

### Market Share and Competitive Positioning

There is **no published market share data** for the embedded commerce sub-segment — it is too nascent. However, positioning can be mapped by approach and target audience:

**Competitive Positioning Map:**

```
                    DEVELOPER-FOCUSED
                          │
            Violet.io ────┤──── Google UCP
          (REST API,      │     (Open standard,
           headless,      │      protocol-level,
           build your     │      waitlist access)
           own UX)        │
                          │
  PUBLISHER ──────────────┼────────────── PLATFORM/AI
  FOCUSED                 │               FOCUSED
                          │
      Shoppable ──────────┤──── firmly.ai
     (Managed checkout,   │    (Agentic commerce,
      patented tech,      │     AI-native,
      plug & play)        │     Perplexity/CJ)
                          │
                    MANAGED SERVICE
```

**Value Proposition Mapping:**

- **Violet.io:** "One API for checkout, catalog, and orders across any commerce platform" — developer-first, build-your-own-UX
- **firmly.ai:** "Make any digital surface instantly shoppable" — AI-first, agentic, zero merchant engineering
- **Shoppable:** "Patented multi-retailer checkout with 500M+ SKUs" — managed service, proven, enterprise-oriented
- **Google UCP:** "Open standard for agentic commerce" — protocol-level, aims to be the HTTP of commerce

**Customer Segments Served:**

- Violet: Apps, social media platforms, content publishers wanting full control over checkout UX
- firmly: AI chatbots (Perplexity), social platforms, ad tech, publishers via CJ network
- Shoppable: Brands, media publishers, creators, agencies — more traditional media/advertising context
- Google UCP: Any merchant/retailer wanting to be discoverable by AI agents (Gemini, Google AI Mode)

_Sources: [Violet features](https://violet.io/features/checkout), [firmly solutions](https://www.firmly.ai/solutions), [Shoppable API](https://about.shoppable.com/products/api), [Google UCP Guide](https://developers.google.com/merchant/ucp/guides)_

### Competitive Strategies and Differentiation

**Violet.io — "The Developer's Choice"**

- **Strategy:** Developer-first API — full REST API with comprehensive documentation, headless architecture
- **Differentiation:** Only platform offering true headless checkout where the channel controls 100% of the UX. Catalog, cart, checkout, orders, events — all accessible via API. Channel builds its own frontend (web, mobile, anything).
- **Key advantage for Charles's project:** Maximum control over UX and design — aligns perfectly with "Apple-style premium experience" and custom TanStack + Expo frontend. No imposed UI components.
- **Weakness:** Requires engineering effort to integrate. Commission rates merchant-set (channel max 50%). Custom pricing = potentially expensive or hard to start small.

**firmly.ai — "The AI-Native Network"**

- **Strategy:** Agentic commerce — position as the infrastructure for AI-powered shopping (chatbots, AI search, social)
- **Differentiation:** Zero-code merchant onboarding (11M merchants!). PCI + SOC II compliant. Performance-based model + small SaaS fee. Partnership with CJ gives access to CJ's publisher ecosystem. Perplexity integration validates AI commerce use case.
- **Key advantage for Charles's project:** Massive merchant catalog (11M). CJ partnership means affiliate-style commission structure. AI-native positioning aligns with conversational search vision.
- **Weakness:** Appears more oriented toward AI chatbots and social platforms than dedicated shopping sites. Less developer documentation visible. May impose checkout UI constraints. API access seems gated behind partnership discussions.
- **Confidence: Medium** — limited public documentation makes it hard to assess full API capabilities for a custom frontend.

**Shoppable — "The Proven Patent Holder"**

- **Strategy:** Patented technology (4 US patents on universal checkout) + managed API service
- **Differentiation:** Only player with patented multi-retailer cart technology. 500M+ SKUs. Proven track record (since 2012). Profitable company. Transparent pricing.
- **Pricing (critical data):**
  - Startup: $279/mo (10K pageviews, 5 merchants)
  - Growth: $999/mo yearly (125K pageviews, 15 merchants)
  - Enterprise: Custom
  - API calls: $0.10–0.15 per call
  - Commission: **Publishers keep 100% of merchant commission** (Shoppable doesn't take a cut of commissions)
  - Dispute fee: $20/dispute + original transaction cost
- **Key advantage for Charles's project:** Transparent pricing. 100% commission to publisher. Proven technology.
- **Weakness:** Expensive for early-stage ($279/mo minimum + per-API-call costs). Pageview limits could be constraining. More traditional media/advertising context than premium shopping experience.

**Google UCP — "The Protocol Standard"**

- **Strategy:** Open-source standard aiming to become the universal language for AI-agent commerce
- **Differentiation:** Backed by Google + Shopify + 20 major retailers/payment providers. Open standard (vendor-agnostic). Supports checkout, identity linking, order management. Compatible with A2A, MCP, and REST APIs. JSON manifest discovery (/.well-known/ucp).
- **Key advantage for Charles's project:** If adopted widely, would give access to any UCP-compliant merchant. Open standard = no platform lock-in. Could complement or replace Violet/firmly long-term.
- **Weakness:** Just launched (Jan 2026). Waitlist access required. Currently focused on Google AI Mode and Gemini — unclear timeline for independent publishers. Not a turnkey API like Violet — requires more architectural work to integrate.
- **Confidence: Medium** — too new to assess reliability for production use, but strategically critical to monitor.

_Sources: [Violet API reference](https://docs.violet.io/api-reference), [firmly docs](https://docs.firmly.ai/), [Shoppable pricing](https://about.shoppable.com/pricing), [Google UCP FAQ](https://developers.google.com/merchant/ucp/faq), [PYMNTS firmly](https://www.pymnts.com/artificial-intelligence-2/2025/firmly-launches-platform-that-eases-merchant-adoption-of-agentic-commerce/), [TechCrunch UCP](https://techcrunch.com/2026/01/11/google-announces-a-new-protocol-to-facilitate-commerce-using-ai-agents/)_

### Business Models and Value Propositions

**How Each Player Makes Money:**

| Player         | Revenue Model                                              | Channel Cost                        | Commission Structure                                                                    |
| -------------- | ---------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| **Violet.io**  | Custom pricing (likely usage-based or revenue share)       | Undisclosed — contact sales         | Merchant-set (0–100%), channel max 50%, taken from order subtotal (excl. tax/shipping)  |
| **firmly.ai**  | Performance-based + small SaaS fee                         | Undisclosed — partnership-based     | Merchant remains MoR; commission via CJ network for CJ publishers                       |
| **Shoppable**  | SaaS subscription + per-API-call fee                       | $279–$999+/mo + $0.10–0.15/API call | **100% of merchant commission goes to publisher** — Shoppable takes zero commission cut |
| **Google UCP** | Free open standard (Google monetizes via ads/AI ecosystem) | Free (open source)                  | Merchant-defined; protocol is payment-agnostic                                          |

**Value Chain Integration:**

- Violet: Vertical API — one integration connects to all merchants on all supported platforms
- firmly: Horizontal network — one integration connects to 11M merchants; CJ adds affiliate tracking layer
- Shoppable: Managed marketplace — curated catalog of 500M+ SKUs with pre-integrated merchants
- Google UCP: Protocol layer — merchants expose capabilities via standard manifest; channels discover and consume

**Customer Relationship Models:**

- Violet: Developer relationship (API docs, self-serve possible for smaller channels)
- firmly: Partnership relationship (B2B, contact-based onboarding)
- Shoppable: SaaS customer (self-serve signup, tiered plans)
- Google UCP: Ecosystem participant (waitlist → implementation → approval)

_Sources: [Violet commissions](https://docs.violet.io/api-reference/apps/commission-rates/set-merchant-app-commission-rate), [Shoppable pricing](https://about.shoppable.com/pricing), [firmly business model](https://finance.yahoo.com/news/firmly-unveils-unified-buy-now-141200621.html), [Google UCP](https://ucp.dev/)_

### Competitive Dynamics and Entry Barriers

**Barriers to Entry for Charles's Project:**

| Barrier                     | Level                   | Analysis                                                                                                       |
| --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Technical (API integration) | **Low**                 | Violet.io has comprehensive API docs. firmly has docs.firmly.ai. Shoppable has self-serve signup.              |
| Financial (startup costs)   | **Low-Medium**          | Shoppable $279/mo minimum. Violet/firmly custom pricing — could be free or expensive depending on negotiation. |
| Merchant access             | **Low** (via platforms) | Violet: 5M+ merchants. firmly: 11M. Shoppable: 500M+ SKUs. Access comes through the platform.                  |
| Commission negotiation      | **Medium**              | Via Violet/firmly, commission is merchant-set. Need merchants willing to offer meaningful rates.               |
| UX/Design excellence        | **High**                | This is where the real competition lies — building a premium experience no one else has built on these APIs.   |
| Trust/Brand building        | **High**                | New platform with zero reputation. Must earn trust through design, content, and reliable service.              |
| SEO competition             | **High**                | Competing against established affiliate sites for organic traffic.                                             |

**Market Consolidation Trends:**

- Awin absorbed ShareASale (Oct 2025) — consolidation in traditional affiliate
- CJ partnered with firmly (Sept 2025) — traditional networks are adopting embedded commerce
- Google UCP (Jan 2026) — could standardize and commoditize the space
- Prediction: Within 2–3 years, all major affiliate networks will offer embedded checkout options

**Switching Costs:**

- For channels: **Low** — API integrations can be swapped via Adapter Pattern (exactly Charles's architecture plan)
- For merchants: **Low** — merchants can list on multiple embedded commerce platforms simultaneously
- This validates the Adapter Pattern architecture from brainstorming — supplier-agnostic by design

_Sources: [Awin/ShareASale merger](https://www.awin.com/us/news-and-events/awin-news/awin-shareasale-new-era), [Google UCP launch](https://www.infoq.com/news/2026/01/google-agentic-commerce-ucp/), [Shopify UCP](https://shopify.engineering/ucp)_

### Ecosystem and Partnership Analysis

**Supplier Relationships (who connects to whom):**

```
┌─────────────────────────────────────────────────────────────┐
│                    MERCHANT LAYER                           │
│  Shopify · WooCommerce · BigCommerce · Magento · Custom     │
│  (Millions of individual merchants)                         │
└──────┬──────────────┬──────────────┬───────────────┬────────┘
       │              │              │               │
  ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐   ┌─────▼──────┐
  │ Violet  │   │ firmly.ai │  │Shoppable│   │ Google UCP │
  │  API    │   │  + CJ     │  │   API   │   │ (Protocol) │
  └────┬────┘   └─────┬─────┘  └────┬────┘   └─────┬──────┘
       │              │              │               │
┌──────▼──────────────▼──────────────▼───────────────▼────────┐
│                    CHANNEL LAYER                             │
│  Apps · Social platforms · AI chatbots · Publishers ·       │
│  ★ CHARLES'S "DIGITAL PERSONAL SHOPPER" ★                   │
│  (Web + Mobile — TanStack + Expo + Supabase)                │
└─────────────────────────────────────────────────────────────┘
```

**Technology Partnerships:**

- Violet ↔ Klarna (investor + partner)
- firmly ↔ CJ Affiliate (strategic partnership for publisher network)
- firmly ↔ Perplexity (AI search + native commerce — March 2025)
- Google UCP ↔ Shopify, Stripe, Visa, Mastercard (protocol adoption)
- Shoppable ↔ PayPal, Stripe, Authorize.net (payment processing)

**Ecosystem Control:**

- **Merchants control commission rates** across all platforms — the channel must attract merchants willing to offer meaningful commissions
- **Platform APIs control checkout flow** — Violet gives most control to the channel; firmly/Shoppable impose more structure
- **Google UCP could shift control** — if widely adopted, merchants expose standardized interfaces, reducing dependency on any single embedded commerce platform

**Key Dependency for Charles's Project:**
The merchant → commission rate relationship is the critical dependency. Unlike traditional affiliate where networks aggregate standard commission offers, embedded commerce platforms require either:

1. Using pre-existing merchant commission rates (Violet, Shoppable), or
2. Leveraging an affiliate network's rates (firmly via CJ), or
3. Direct merchant negotiation

_Sources: [Violet integrations](https://violet.io/integrations), [firmly + Perplexity](https://www.globenewswire.com/news-release/2025/03/27/3050735/0/en/Perplexity-Integrates-firmly-ai-Commerce-Tech-to-Scale-Seamless-Ecommerce-Experience.html), [Shoppable merchants](https://about.shoppable.com/solutions-merchants), [Google UCP partners](https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/)_

## Regulatory Requirements

### Applicable Regulations

**1. Merchant of Record (MoR) — Who Bears Consumer Liability?**

This is the most critical regulatory finding for Charles's project. In the embedded commerce model (Violet, firmly, Shoppable), the **merchant remains the Merchant of Record**. This means:

- The merchant's name appears on the buyer's billing statement
- The merchant handles chargebacks, refunds, and payment disputes
- The merchant bears PCI compliance responsibility for payment processing
- The merchant is liable for product defects, shipping, and delivery

**However — the channel (Charles's platform) is NOT exempt from all liability:**

- The FTC will hold both affiliates AND companies responsible for marketing claims and disclosures
- If Charles's platform makes product recommendations, endorsement guidelines apply
- Consumer protection laws may still apply to the platform as the customer-facing brand — especially if the white-label model makes users believe they are buying "from" the platform
- Violet's documentation explicitly warns: if a Stripe Standard merchant account has insufficient balance for a refund/reversal, "your channel would then bear responsibility for these funds"

**Risk Level: Medium** — The MoR model significantly reduces liability, but the white-label strategy ("user never knows they're not buying from you") creates a grey area. If a consumer believes they bought from Charles's platform, they may have legal standing to hold the platform responsible for disputes.

**Recommendation:** Clearly document in Terms of Service that the platform is a "shopping facilitator" / "affiliate platform" — not a merchant. Include transparent (but non-intrusive) disclosure. Consult a lawyer specializing in e-commerce / affiliate law before launch.

_Sources: [FastSpring MoR Guide](https://fastspring.com/blog/what-is-a-merchant-of-record-and-why-you-should-care/), [FTC MoR Enforcement](https://www.allaboutadvertisinglaw.com/2025/06/ftc-targets-merchant-of-record-for-unlawful-payment-processing-tsr-and-rosca-violations.html), [Violet Checkout FAQ](https://docs.violet.io/faqs/checkout), [Checkout.com MoR](https://www.checkout.com/blog/what-is-a-merchant-of-record)_

**2. FTC Endorsement & Disclosure Guidelines**

The FTC requires "clear and conspicuous" disclosure of any material connection between an endorser and a business. This applies directly to Charles's platform:

- **Affiliate disclosure required:** Every page with commissionable products must include a disclosure that the platform earns commissions
- **Proximity rule:** Disclosure must appear close to the recommendation — not buried in a footer or separate page
- **Language clarity:** "Affiliate link" may not be sufficient; "Paid link" or "We earn a commission on purchases" is clearer
- **Applies to ALL content:** Product pages, search results, guides, comparisons — anywhere the platform recommends products it earns commissions on
- **Penalties:** Up to $50,120 per violation (2025 rate), $51,744 for fake reviews/AI-generated endorsements

**Practical implementation:** A subtle but clear site-wide disclosure ("We earn commissions on products sold through our platform") + per-page disclosure near product recommendations. This is compatible with premium UX if designed tastefully.

_Sources: [FTC Endorsement Guidelines](https://consumer.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking), [FTC Affiliate Disclosure Guide](https://termly.io/resources/articles/ftc-affiliate-disclosure/), [Referral Candy FTC Checklist](https://www.referralcandy.com/blog/ftc-affiliate-disclosure), [HeySeva FTC 2025](https://www.heyseva.com/blog-posts/ftc-guidelines-for-affiliates-creators-and-brands-2025)_

### Industry Standards and Best Practices

**PCI DSS 4.0.1 (Effective April 2025) — Payment Page Security:**

Since Charles's platform will NOT process payments directly (MoR handles this), PCI compliance burden is minimal but not zero:

- **If using embedded iframe checkout** (Violet/Shoppable scenario B): Must inventory, authorize, and monitor all third-party scripts on payment pages. Must confirm iframe vendor is PCI-compliant. Must implement iframe per vendor instructions.
- **If using API-based order placement** (Violet scenario A): Payment data never touches Charles's servers — PCI scope is extremely limited. Recommended: complete SAQ-A (Self-Assessment Questionnaire A) for full outsourced payment processing.
- **Script monitoring requirement:** All client-side scripts on pages with payment elements must be monitored for changes every 10 minutes (new 2025 requirement).

**Best Practice:** Use Violet's or Shoppable's hosted/embedded payment forms exclusively. Never handle card numbers, CVVs, or payment tokens on your own servers. This keeps PCI scope at the minimum level (SAQ-A).

_Sources: [PCI SSC Merchants](https://www.pcisecuritystandards.org/merchants/), [Davis Wright Tremaine PCI FAQ](https://www.dwt.com/blogs/privacy--security-law-blog/2025/03/pci-faqs-card-processing-ecommerce-merchants), [Stripe PCI Guide](https://stripe.com/guides/pci-compliance)_

### Compliance Frameworks

**Philippines Sole Proprietorship — Tax & Business Registration:**

| Requirement      | Details                                                                                                       | Status                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| DTI Registration | Business Name Registration via BNRS portal (bnrs.dti.gov.ph)                                                  | Required — online, ₱200–500, 1–3 days                                             |
| BIR Registration | BIR Form 1901 + ₱500 fee + ₱30 documentary stamp                                                              | Required                                                                          |
| Tax Option       | **8% flat tax** on gross income above ₱250,000 if annual gross ≤ ₱3M; OR graduated rates (0–35%)              | **8% flat is recommended** for simplicity                                         |
| VAT Threshold    | VAT registration required if gross > ₱3M/year                                                                 | Not applicable initially (affiliate commissions unlikely to exceed ₱3M in year 1) |
| Foreign Income   | Affiliate commissions from US platforms = Philippine taxable income (worldwide income taxation for residents) | Must be declared and taxed in PH                                                  |

**US-Philippines Tax Treaty:**

- Treaty signed 1976 — **outdated** but still in force
- Business profits (which affiliate commissions likely qualify as) are taxable ONLY in the country of residence (Philippines) unless Charles has a "permanent establishment" in the US — which he does not
- Withholding tax on royalties: capped at 15% at source under treaty
- **Key question (requires tax advisor):** Are affiliate commissions classified as "business profits" (no US withholding) or "royalties" (15% US withholding)? Most likely business profits → no US withholding, taxed in PH only at 8% flat rate
- US platforms (Violet, Shoppable) may require W-8BEN form to claim treaty benefits and avoid 30% default US withholding

**New as of June 2025:** Foreign digital platforms must charge Philippine users 12% VAT on service/platform fees. This is separate from Charles's income tax — it affects platforms he pays for (Supabase, APIs), not his commission income.

_Sources: [Taxumo Freelancer Guide 2025](https://www.taxumo.com/blog/taxes-for-freelancers-in-the-philippines-2025-complete-guide/), [IRS PH Treaty](https://www.irs.gov/businesses/international-businesses/philippines-tax-treaty-documents), [PWC Philippines Tax](https://taxsummaries.pwc.com/philippines/individual/taxes-on-personal-income), [Wise PH Business Tax](https://wise.com/ph/blog/how-much-tax-small-business-philippines), [Deel PH Sole Proprietorship](https://www.deel.com/blog/sole-proprietorship-philippines/)_

### Data Protection and Privacy

**GDPR (EU/EEA Users):**

- Applies if the platform targets EU residents (multilingual = likely)
- **Opt-in consent required** before collecting personal data
- Cookie consent banner mandatory
- Right to access, rectify, delete personal data
- Data Processing Agreement (DPA) needed with all third parties (Supabase, Violet, analytics)
- **Data minimization principle:** Only collect what's necessary

**CCPA/CPRA (California Users):**

- Applies if the platform meets thresholds (likely once at scale: >50K CA consumers/year OR >$25M revenue)
- **Opt-out model:** "Do Not Sell or Share My Personal Information" link required
- As of Jan 2026: opt-out confirmation is now mandatory (not just optional)
- Enhanced requirements phasing in through 2030

**Practical Implementation for MVP:**

- Cookie consent banner (GDPR-compliant = covers CCPA too)
- Privacy Policy with clear data handling disclosure
- "Do Not Sell" opt-out mechanism
- Data Processing Agreements with Supabase, Violet/firmly/Shoppable, analytics providers
- Guest checkout by default = minimal data collection = strong privacy posture

_Sources: [SecurePrivacy GDPR/CCPA 2025](https://secureprivacy.ai/blog/first-party-data-collection-compliance-gdpr-ccpa-2025), [Usercentrics GDPR vs CCPA 2026](https://usercentrics.com/knowledge-hub/gdpr-vs-ccpa-compliance/), [SecurePrivacy CCPA 2026](https://secureprivacy.ai/blog/ccpa-requirements-2026-complete-compliance-guide)_

### Licensing and Certification

**No specific licensing required** for an affiliate/embedded commerce platform. Key registrations:

| Registration                  | Jurisdiction        | Required?                                                     |
| ----------------------------- | ------------------- | ------------------------------------------------------------- |
| DTI Business Name             | Philippines         | Yes — mandatory for sole proprietorship                       |
| BIR Tax Registration          | Philippines         | Yes — mandatory                                               |
| Barangay Business Permit      | Philippines (local) | Yes — at business address                                     |
| App Store Developer Account   | Apple (US entity)   | Yes — $99/year                                                |
| Google Play Developer Account | Google (US entity)  | Yes — $25 one-time                                            |
| W-8BEN (IRS)                  | United States       | Yes — to claim treaty benefits on US-source commission income |
| No merchant license           | N/A                 | Correct — NOT required since platform is not MoR              |

**Confidence: High** — The affiliate/service-provider model explicitly avoids the need for merchant licenses, business permits related to goods sale, or import/export certifications.

### Implementation Considerations

**Pre-Launch Legal Checklist:**

1. **Terms of Service:** Clearly state platform is a "shopping facilitator" earning affiliate commissions — not a seller
2. **Privacy Policy:** GDPR + CCPA compliant, covering all data collection and third-party sharing
3. **Affiliate Disclosure:** Site-wide + per-content disclosure of commission relationship
4. **Refund/Returns Policy:** Clearly redirect to merchant's policy — platform facilitates but does not guarantee
5. **Cookie Consent:** Implement consent banner before any tracking cookies/analytics
6. **W-8BEN:** Submit to US-based platforms (Violet, Shoppable) to claim PH treaty rate
7. **BIR Registration:** Complete before first commission income is received
8. **Data Processing Agreements:** Execute with Supabase, Violet/firmly/Shoppable, any analytics provider

**Ongoing Compliance:**

- Quarterly BIR tax filing (or annual under 8% flat tax)
- Annual DTI renewal check (valid 5 years)
- Privacy policy updates as regulations evolve
- FTC disclosure audit on new content

### Risk Assessment

| Risk                                                            | Severity   | Likelihood                      | Mitigation                                                                 |
| --------------------------------------------------------------- | ---------- | ------------------------------- | -------------------------------------------------------------------------- |
| Consumer believes platform is the seller (white-label illusion) | **High**   | **Medium**                      | Clear ToS + subtle disclosure. Consult e-commerce lawyer.                  |
| FTC enforcement for insufficient disclosure                     | **High**   | **Low** (if disclosed properly) | Implement disclosure systematically on all commissionable content          |
| US withholding tax on commissions (30% default)                 | **Medium** | **Medium**                      | Submit W-8BEN to claim treaty rate. Consult PH-US tax advisor.             |
| GDPR complaint from EU user                                     | **Medium** | **Low** (if compliant)          | Cookie consent + privacy policy + DPAs in place                            |
| PCI DSS non-compliance on checkout pages                        | **Medium** | **Low**                         | Use embedded iframe only, never handle card data                           |
| Refund dispute — platform caught in the middle                  | **Medium** | **Medium**                      | ToS + clear refund policy redirecting to merchant. SAV process documented. |
| Philippine tax audit on foreign income                          | **Low**    | **Low**                         | Proper BIR registration + quarterly filing + 8% flat tax                   |

**Overall Regulatory Risk: MANAGEABLE** — The embedded commerce model with MoR staying with the merchant significantly de-risks the regulatory burden. The main risk is the tension between "white-label invisible" (branding goal) and "clear affiliate disclosure" (legal requirement). These can coexist with careful design — tasteful, transparent disclosure that builds trust rather than breaking immersion.

## Technical Trends and Innovation

### Emerging Technologies

**1. Embedded Commerce APIs — The Core Infrastructure**

Violet.io's API provides the exact technical foundation Charles's project needs. Key capabilities confirmed via documentation:

**Violet API Architecture (docs.violet.io):**

| Capability      | API Endpoint   | Details                                                                                                                                           |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Catalog**     | Catalog API    | Unified product schema, real-time data from all connected merchants. Single schema regardless of underlying ecommerce platform.                   |
| **Cart & Bags** | Cart API       | A Cart contains all checkout data. Multi-merchant support: each merchant gets a separate "Bag" within the parent Cart. Supports nested carts.     |
| **Checkout**    | Checkout API   | Orchestrates payment across multiple merchants in a single order. Syncs promotions/discounts from merchant systems. Handles shipping calculation. |
| **Orders**      | Order API      | Full order lifecycle — placement through fulfillment and returns. Aggregates across all Bags/SKUs.                                                |
| **Webhooks**    | Events API     | Real-time notifications for order status changes, fulfillment events, tracking data. HMAC-signed (X-Violet-Hmac header) for security.             |
| **Commission**  | Commission API | Set/get merchant-channel commission rates programmatically.                                                                                       |

**Developer Resources:**

- OpenAPI specification on GitHub (auto-generate client libraries)
- Postman collection for no-code API exploration
- Comprehensive documentation at docs.violet.io
- Direct order submission + checkout guides
- Order & Bag state machine documentation

**Confidence: High** — Violet's API is the most documented and developer-friendly of the 3 embedded commerce providers. The API structure maps cleanly to Charles's Adapter Pattern architecture.

_Sources: [Violet API Reference](https://docs.violet.io/api-reference), [Violet Cart Lifecycle](https://docs.violet.io/checkout/carts-and-bags/carts/lifecycle-of-a-cart), [Violet Orders](https://violet.io/features/orders), [Violet Webhooks](https://docs.violet.io/checkout/webhooks/overview)_

**2. AI-Powered Product Discovery — The Differentiator**

The AI shopping landscape exploded in late 2025:

- **ChatGPT Shopping Research** (Nov 2025): Powered by GPT-5 mini, 50M daily shopping queries, 700M weekly users. 52% product accuracy on multi-constraint queries. OpenAI launching "Instant Checkout" — buy directly inside ChatGPT (Etsy live, 1M+ Shopify merchants coming).
- **Perplexity + firmly.ai** (March 2025): "Shoppable answers" — AI search results with native checkout. Validates the AI search → instant purchase flow.
- **Google AI Mode + UCP** (Jan 2026): Google Search AI Mode will let shoppers check out directly from US retailers while researching products.

**Implications for Charles's project:**

- AI conversational search is no longer a differentiator by itself — ChatGPT, Perplexity, and Google are all doing it. **The differentiator is building a dedicated, curated shopping experience AROUND AI search**, not just having AI search.
- The "Digital Personal Shopper" concept is validated by the market direction, but the window is narrowing. The unique value must come from: curation quality, UX design, brand trust, and the seamless native checkout experience — not just "we have AI search."
- **Technical opportunity:** Use OpenAI's API (GPT-4o or successors) for the conversational search engine, with product embeddings stored in Supabase (pgvector) for semantic search across the catalog.

_Sources: [OpenAI Shopping Research](https://openai.com/index/chatgpt-shopping-research/), [ChatGPT Instant Checkout](https://openai.com/chatgpt/search-product-discovery/), [Perplexity + firmly](https://www.globenewswire.com/news-release/2025/03/27/3050735/0/en/Perplexity-Integrates-firmly-ai-Commerce-Tech-to-Scale-Seamless-Ecommerce-Experience.html), [DataSlayer ChatGPT Shopping](https://www.dataslayer.ai/blog/chatgpt-shopping-the-new-discovery-channel-processing-50-million-daily-queries)_

**3. Google Universal Commerce Protocol (UCP) — The Future Standard**

UCP's technical architecture is remarkably clean and directly relevant:

- **Layered architecture:** Shopping Service (core primitives) → Capabilities (Checkout, Orders, Catalog) → Extensions (domain-specific schemas)
- **Transport-agnostic:** Supports REST APIs, MCP (Model Context Protocol), and A2A (Agent-to-Agent). Businesses choose their preferred communication method.
- **Discovery via manifest:** Merchants publish `/.well-known/ucp` JSON manifest — agents dynamically discover capabilities, endpoints, payment configs
- **Capabilities map to MCP tools:** `create_checkout`, `get_order` — LLMs can call UCP tools directly
- **Open source:** Full spec on GitHub (Universal-Commerce-Protocol/ucp)
- **Server-selects architecture:** Business chooses protocol version and capabilities from intersection of both parties' capabilities

**Strategic implication:** UCP could become the long-term standard. Charles's Adapter Pattern should include a placeholder for a UCP adapter. When UCP matures (est. mid-2027 for broad merchant adoption), adding UCP support would give access to any compliant merchant without intermediary platforms.

_Sources: [Google UCP Developer Blog](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/), [UCP.dev](https://ucp.dev/), [Shopify UCP Engineering](https://shopify.engineering/ucp), [A2A Protocol UCP Guide](https://a2aprotocol.ai/blog/2026-universal-commerce-protocol), [GitHub UCP Spec](https://github.com/Universal-Commerce-Protocol/ucp)_

### Digital Transformation

**Server-Side Tracking (S2S) — The New Default**

Cookie-based affiliate tracking is effectively dead. By 2026, S2S tracking is the default operating model:

- Conversions transmitted directly server-to-server — immune to ad blockers, browser restrictions, and privacy settings
- Accuracy often exceeds legacy cookie systems when using deterministic identifiers
- Violet's webhook system provides native S2S tracking — order lifecycle events pushed to Charles's backend in real-time
- CJ's S2S postback system (via firmly.ai) supports the same pattern

**Implementation for Charles's project:**

- Violet webhooks → Supabase Edge Function → store conversion events in PostgreSQL
- No client-side tracking pixel needed for commission attribution
- Aligns with GDPR/privacy-first approach

_Sources: [IREV S2S Guide 2026](https://irev.com/blog/cookieless-affiliate-tracking-what-actually-works-in-2026/), [Taboola S2S](https://www.taboola.com/marketing-hub/s2s-tracking/), [Violet Webhooks](https://docs.violet.io/checkout/webhooks/overview)_

**Headless Commerce Architecture — Exact Fit for TanStack + Expo**

The headless commerce trend validates Charles's stack choice:

- **35% faster page loads** through static generation and edge rendering (TanStack Start supports this)
- **25% higher conversion rates** from fully custom checkout experiences
- **MACH principles** (Microservices, API-first, Cloud-native, Headless) — companies release features 40% faster
- React is the dominant frontend framework for headless storefronts
- **Key insight:** Unlike Shopify Hydrogen (locked to Shopify) or BigCommerce Catalyst, Charles's approach (TanStack + Violet API) is truly vendor-agnostic — the frontend is completely independent of any commerce platform

_Sources: [Digital Applied Headless 2026](https://www.digitalapplied.com/blog/headless-commerce-2026-api-first-ecommerce-guide), [BigCommerce Headless](https://www.bigcommerce.com/articles/headless-commerce/), [XICTRON Modular Commerce](https://www.xictron.com/en/blog/headless-commerce-modular-shop-architecture-2026/)_

### Innovation Patterns

**Adapter Pattern — Validated Architecture for Multi-Supplier Integration**

The Adapter Pattern is a well-established solution for exactly Charles's use case:

- **Canonical Data Model:** Define a unified product/order/cart schema that all adapters translate to/from. Regardless of whether the backend is Violet, firmly, Shoppable, or UCP — the frontend sees one consistent data model.
- **Interface segregation:** Define interfaces for `CatalogAdapter`, `CartAdapter`, `CheckoutAdapter`, `OrderAdapter`, `TrackingAdapter`. Each supplier implements these interfaces.
- **Hot-swappable:** Adding a new supplier = implementing one new adapter. No changes to frontend or business logic.
- **Real-world validation:** Payment gateway industry uses this exact pattern — switch between Stripe, PayPal, Adyen without touching application code.

**Proposed Architecture:**

```
┌─────────────────────────────────────────────────────┐
│              FRONTEND LAYER                          │
│  TanStack (Web) + Expo/RN (Mobile)                  │
│  Shared components + AI Search UI                   │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│              SUPABASE BACKEND                        │
│  PostgreSQL + Auth + Edge Functions                  │
│  pgvector (AI search embeddings)                    │
│  RLS (Row Level Security)                           │
│                                                     │
│  ┌─────────────────────────────────────┐            │
│  │  UNIFIED COMMERCE INTERFACE          │            │
│  │  CatalogService · CartService ·      │            │
│  │  CheckoutService · OrderService ·    │            │
│  │  TrackingService                     │            │
│  └─────────┬───────────┬───────┬───────┘            │
│            │           │       │                    │
│  ┌─────────▼──┐ ┌──────▼──┐ ┌─▼──────────┐        │
│  │VioletAdapter│ │FirmlyAd.│ │UCP Adapter │        │
│  │(Primary)   │ │(Alt.)   │ │(Future)    │        │
│  └─────────┬──┘ └──────┬──┘ └─┬──────────┘        │
└────────────┼───────────┼──────┼────────────────────┘
             │           │      │
     ┌───────▼──┐ ┌──────▼──┐ ┌▼──────────────┐
     │Violet API│ │firmly   │ │UCP Merchants  │
     │(5M+ merch│ │API + CJ │ │(/.well-known/ │
     │ants)     │ │(11M)    │ │ucp)           │
     └──────────┘ └─────────┘ └───────────────┘
```

_Sources: [Medium Adapter Pattern](https://medium.com/@jescrich_57703/harnessing-the-adapter-pattern-in-microservice-architectures-for-vendor-agnosticism-debc21d2fe21), [Bocoup Adapter Pattern](https://www.bocoup.com/blog/adapter-pattern-a-must-for-vendor-service-integrations), [DZone Multi-API Adapter](https://dzone.com/articles/b2b-integrations)_

### Future Outlook

**2026 Predictions (Confidence: Medium-High):**

1. **Google UCP adoption acceleration:** By end of 2026, expect 10K+ merchants to be UCP-compliant. Shopify is building native support. This will become a viable source of merchants for Charles's platform within 12–18 months.

2. **AI shopping becomes mainstream:** ChatGPT (50M daily queries), Google AI Mode, Perplexity — all converging on "search + buy" within AI interfaces. Charles's platform competes not just with Amazon, but with AI assistants themselves. **Differentiator shifts from "AI search" to "curated experience + trust + brand."**

3. **Embedded commerce standardization:** The number of platforms offering native checkout (no redirect) will multiply. CJ + firmly is the first major network partnership; expect Awin, Rakuten, Impact to follow.

4. **S2S tracking becomes mandatory:** Cookie deprecation is irreversible. All affiliate attribution will be server-side by end of 2026.

**2027-2028 Predictions (Confidence: Medium):**

5. **UCP becomes dominant standard:** If Google + Shopify push adoption, UCP could become the "HTTP of commerce" within 2-3 years.
6. **AI personalization moat:** Platforms with enough user data will offer genuinely personalized shopping — AI that learns individual taste. First-mover advantage in building this dataset is significant.
7. **Voice commerce integration:** Alexa, Siri, Google Assistant using UCP for voice-based shopping. Charles's API-first architecture would support this.

### Implementation Opportunities

**Immediate (MVP — use today):**

- Violet.io API as primary embedded commerce provider (best documentation, developer-friendly)
- Supabase Edge Functions as API proxy layer (TypeScript, global edge, <60ms latency)
- OpenAI API for conversational product search (GPT-4o + embeddings via pgvector)
- Supabase Auth for optional user accounts (guest checkout default)
- Violet webhooks for S2S order tracking and commission attribution

**Near-term (6-12 months post-launch):**

- firmly.ai integration as second adapter (11M merchants via CJ)
- Shoppable as third adapter (500M+ SKUs, 100% commission pass-through)
- Enhanced AI personalization with user behavior data

**Long-term (12-24 months):**

- Google UCP adapter when protocol matures
- Voice commerce integration
- Predictive product recommendations via accumulated user data

### Challenges and Risks

| Challenge                           | Impact                                          | Mitigation                                                                                           |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Violet API pricing unknown          | Could be expensive for low-volume MVP           | Contact Violet early. Negotiate startup/indie developer pricing. Have Shoppable ($279/mo) as backup. |
| AI search becoming commoditized     | ChatGPT/Google/Perplexity all offer AI shopping | Differentiate on curation, UX, brand trust — not on AI itself.                                       |
| firmly.ai API access gated          | May require partnership approval                | Apply via contact@firmly.ai. Reference CJ publisher network.                                         |
| UCP too new for production          | Can't rely on it for MVP                        | Build Adapter Pattern from day 1. Add UCP adapter when ready.                                        |
| Supabase Edge Functions cold starts | Latency spike on first request                  | Mitigated by Supabase's global edge deployment. Keep functions warm with cron.                       |
| Multi-merchant cart complexity      | Managing bags across suppliers                  | Violet handles this natively. Trust the API.                                                         |

## Recommendations

### Technology Adoption Strategy

**Phase 1 — MVP (recommended stack):**

```
Frontend:   TanStack (Router, Query, Start, Form) + Expo Router/RN
Backend:    Supabase (PostgreSQL, Auth, Edge Functions, pgvector)
Commerce:   Violet.io API (primary) via Adapter Pattern
AI Search:  OpenAI GPT-4o + pgvector embeddings
Tracking:   Violet webhooks → Supabase (S2S, no cookies)
Payments:   Via Violet (merchant is MoR)
```

**Phase 2 — Multi-supplier:**

```
+ firmly.ai adapter (CJ network, 11M merchants)
+ Shoppable adapter (500M+ SKUs)
+ Enhanced AI personalization
```

**Phase 3 — Protocol-native:**

```
+ Google UCP adapter (open standard, merchant self-discovery)
+ Voice commerce support
+ Full AI personalization engine
```

### Innovation Roadmap

| Timeline   | Innovation                            | Business Value                                         |
| ---------- | ------------------------------------- | ------------------------------------------------------ |
| MVP        | Violet.io + AI conversational search  | "Digital Personal Shopper" core experience             |
| +3 months  | Second supplier (firmly or Shoppable) | Expanded product catalog, commission optimization      |
| +6 months  | AI personalization (behavior-based)   | Higher conversion, longer sessions, repeat buyers      |
| +12 months | Google UCP adapter                    | Access to UCP-compliant merchants without intermediary |
| +18 months | Predictive product recommendations    | "The platform knows what I want before I do"           |

### Risk Mitigation

1. **Contact Violet.io NOW** — Request API access, understand pricing, confirm compatibility with Philippines-based sole proprietorship. This is the single most important action.
2. **Build Adapter Pattern from Day 1** — Even with only Violet, design the architecture to be supplier-agnostic. This is a one-time investment that pays off permanently.
3. **Don't compete on AI search alone** — ChatGPT has 700M users and 50M daily shopping queries. Compete on curation, UX, trust, and the unified native checkout experience.
4. **Monitor Google UCP monthly** — Subscribe to ucp.dev updates. When merchant adoption reaches critical mass, be ready with an adapter.
5. **Start SEO content BEFORE launch** — The "honest guides & comparisons" content strategy needs time to index. Start 2-3 months before the platform goes live.

_Sources: [Supabase Architecture 2026](https://www.valtorian.com/blog/supabase-mvp-architecture), [Supabase Edge Functions](https://supabase.com/docs/guides/functions), [RWIT Supabase + AI](https://www.rwit.io/blog/supabase-edge-functions-ai-microservices)_

---

## Research Synthesis

### Executive Summary

The white-label affiliate supplier market has undergone a fundamental transformation. What was once limited to redirect-based affiliate links has evolved into a fully-featured **embedded commerce ecosystem** where channels can offer complete native checkout experiences while merchants remain the Merchant of Record. This research conclusively validates Charles's "Digital Personal Shopper" concept and identifies a clear path to implementation.

**Three embedded commerce API providers** (Violet.io, firmly.ai, Shoppable) and **one emerging open standard** (Google UCP) now offer the infrastructure to build exactly the platform described in the brainstorming and product brief: a premium shopping experience with unified checkout, no redirect, and no merchant status required. The global affiliate marketing market ($17-18.5B in 2025, CAGR 15.2%) provides the economic foundation, while the embedded commerce sub-segment — nascent but accelerating — represents an empty competitive space for a dedicated consumer-facing shopping platform.

The research also reveals a critical strategic pivot: **AI conversational search is no longer a primary differentiator**. With ChatGPT processing 50M daily shopping queries, Perplexity offering shoppable answers, and Google launching AI Mode checkout, the unique value proposition must center on the curated premium experience, Apple-style design, and brand trust — the combination that no AI assistant or existing platform delivers.

**Key Findings:**

- Violet.io is the recommended primary provider: full REST API (catalog, cart, checkout, orders, webhooks, commissions), developer-first, headless, 5M+ merchants via 225+ ecommerce platforms
- firmly.ai (11M merchants, CJ partnership) and Shoppable (500M+ SKUs, $279/mo, 100% commission pass-through) are viable secondary adapters
- Google UCP (Jan 2026, open standard, 20+ major partners) is the long-term strategic bet — monitor and prepare an adapter
- Philippines Sole Proprietorship is compatible: 8% flat tax, worldwide income taxation, US-PH treaty minimizes double taxation
- Merchant of Record stays with the merchant — Charles is NOT a merchant, but FTC disclosure obligations apply
- The Adapter Pattern architecture from brainstorming is validated by low switching costs across all providers

**Strategic Recommendations:**

1. **Contact Violet.io immediately** — this is the single highest-priority action, blocking all development with real data
2. **Build Adapter Pattern from Day 1** — even with one supplier, architect for multiple
3. **Reframe the differentiator** — from "AI search" to "curated premium experience with AI-powered discovery"
4. **Start SEO content 2-3 months before launch** — organic traffic needs lead time
5. **Consult an e-commerce lawyer** — specifically on the white-label + FTC disclosure tension

### Table of Contents

1. [Domain Research Scope Confirmation](#domain-research-scope-confirmation)
2. [Industry Analysis](#industry-analysis)
   - Market Size and Valuation
   - Market Dynamics and Growth
   - Market Structure and Segmentation
   - Industry Trends and Evolution
   - Competitive Dynamics
3. [Competitive Landscape](#competitive-landscape)
   - Key Players and Market Leaders
   - Market Share and Competitive Positioning
   - Competitive Strategies and Differentiation
   - Business Models and Value Propositions
   - Competitive Dynamics and Entry Barriers
   - Ecosystem and Partnership Analysis
4. [Regulatory Requirements](#regulatory-requirements)
   - Applicable Regulations (MoR, FTC)
   - Industry Standards (PCI DSS)
   - Compliance Frameworks (PH Tax, US Treaty)
   - Data Protection (GDPR, CCPA)
   - Licensing and Certification
   - Risk Assessment
5. [Technical Trends and Innovation](#technical-trends-and-innovation)
   - Emerging Technologies (Violet API, AI Shopping, Google UCP)
   - Digital Transformation (S2S Tracking, Headless Commerce)
   - Innovation Patterns (Adapter Pattern Architecture)
   - Future Outlook and Predictions
   - Implementation Opportunities
6. [Recommendations](#recommendations)
   - Technology Adoption Strategy
   - Innovation Roadmap
   - Risk Mitigation
7. [Research Synthesis](#research-synthesis) (this section)

### Cross-Domain Strategic Insights

**Insight 1: Market-Technology Convergence Creates a Unique Window**

The convergence of embedded commerce APIs (Violet, firmly, Shoppable), AI-powered product discovery (OpenAI, Google), and the open commerce standard (UCP) creates a 12-18 month window where a dedicated, premium shopping platform can establish itself before the space becomes crowded. The technology is mature enough to build on, but new enough that no one has built a consumer-facing brand around it.

**Insight 2: The White-Label Tension is a Feature, Not a Bug**

The tension between "invisible white-label" and "FTC disclosure" can be resolved elegantly: position the platform as a **curated shopping service** that openly earns commissions. This is the model of high-end personal shoppers and concierge services. The disclosure becomes part of the value proposition: "We search thousands of brands to find the best products for you, and earn a commission when you buy."

**Insight 3: The Adapter Pattern Is the Strategic Moat**

While any individual provider (Violet, firmly) could change terms, pricing, or access, a supplier-agnostic Adapter Pattern ensures the platform is never dependent on a single provider. With Google UCP on the horizon, this architecture becomes even more valuable — the platform can adopt the dominant standard as it emerges, without rebuilding.

**Insight 4: Guest Checkout + AI = Privacy Advantage**

The product brief's emphasis on guest checkout (no forced registration) aligns perfectly with the privacy regulatory trend (GDPR opt-in, CCPA opt-out). Minimal data collection + AI-powered discovery without personal tracking = competitive advantage in a privacy-conscious market.

### Research Goals — Achievement Assessment

| Original Goal                                             | Status       | Evidence                                                                                                                     |
| --------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Find white-label affiliate suppliers with full API access | **ACHIEVED** | Violet.io (catalog, cart, checkout, orders, webhooks), firmly.ai (via CJ), Shoppable (500M+ SKUs)                            |
| Integrated checkout without redirection                   | **ACHIEVED** | All 3 providers offer native/embedded checkout. Merchant remains MoR.                                                        |
| No merchant status required                               | **ACHIEVED** | Confirmed: channel is NOT MoR in Violet, firmly, Shoppable models. PH Sole Proprietorship as service provider is compatible. |
| Understand the competitive landscape                      | **ACHIEVED** | 4 providers mapped with detailed capabilities, pricing, and positioning. Google UCP identified as strategic future standard. |
| Legal/fiscal framework                                    | **ACHIEVED** | PH 8% flat tax, US-PH treaty, FTC disclosure obligations, GDPR/CCPA requirements all documented.                             |

### Research Limitations

- **Violet.io pricing unknown** — Custom pricing not publicly available. Requires direct contact.
- **firmly.ai API depth uncertain** — Public documentation is limited. Full capabilities need partnership discussion.
- **Google UCP adoption timeline speculative** — Protocol launched Jan 2026, merchant adoption projections are estimates.
- **Tax classification of affiliate commissions** — Whether classified as "business profits" or "royalties" under PH-US treaty requires professional tax advice.
- **Consumer liability in white-label model** — The legal grey area of appearing to be the seller while legally being an affiliate needs legal counsel review.

### Immediate Next Actions (Priority Order)

| #   | Action                                                                           | Owner   | Timeline              | Blocking?                                        |
| --- | -------------------------------------------------------------------------------- | ------- | --------------------- | ------------------------------------------------ |
| 1   | **Contact Violet.io** — request API access, pricing, discuss use case            | Charles | This week             | YES — blocks all development with real data      |
| 2   | **Contact firmly.ai** — explore CJ publisher access, API capabilities            | Charles | This week             | No — parallel track                              |
| 3   | **Consult e-commerce lawyer** — MoR liability, FTC disclosure, white-label model | Charles | Within 2 weeks        | No — but blocks legal docs (ToS, Privacy Policy) |
| 4   | **Consult PH-US tax advisor** — commission classification, W-8BEN, 8% flat tax   | Charles | Within 2 weeks        | No — but blocks first revenue                    |
| 5   | **Register DTI + BIR** (if not already done)                                     | Charles | Within 1 month        | No — but blocks legal operation                  |
| 6   | **Start Shoppable free trial** ($279/mo Startup plan) as backup evaluation       | Charles | After Violet response | Only if Violet pricing is prohibitive            |
| 7   | **Subscribe to ucp.dev** — monitor Google UCP merchant adoption                  | Charles | Today                 | No — strategic monitoring                        |

---

**Research Completion Date:** 2026-03-03
**Research Period:** Comprehensive single-session analysis with 30+ web searches
**Document Coverage:** Industry analysis, competitive landscape, regulatory framework, technical trends, strategic recommendations
**Source Verification:** All factual claims cited with URLs from authoritative public sources
**Confidence Level:** High on market structure, providers, and regulatory framework. Medium on pricing (Violet, firmly) and timeline projections (UCP adoption).

_This comprehensive research document serves as the authoritative reference for the "Digital Personal Shopper" project's supplier strategy and validates the technical and business feasibility of the white-label affiliate embedded commerce model._
