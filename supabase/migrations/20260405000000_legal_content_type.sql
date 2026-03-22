-- Story 8.6: Legal & Compliance Pages
-- Extends content_page_type enum with 'legal' and seeds legal pages.

-- Add 'legal' to the content_page_type enum.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
-- but Supabase CLI runs each migration file as a single implicit transaction.
-- PostgreSQL 12+ supports IF NOT EXISTS for ADD VALUE, making this idempotent.
ALTER TYPE public.content_page_type ADD VALUE IF NOT EXISTS 'legal';

-- Seed legal pages
INSERT INTO public.content_pages (slug, title, type, body_markdown, author, published_at, seo_title, seo_description, status)
VALUES (
  'privacy',
  'Privacy Policy',
  'legal',
  '## Privacy Policy

**Last updated:** March 2026

Maison Émile ("we," "us," or "our") operates the Maison Émile website and mobile application (the "Platform"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our Platform.

### 1. Information We Collect

**Personal Information You Provide:**

- **Account Registration:** Email address, name
- **Orders:** Full name, email address, shipping address (street, city, postal code, country)
- **Support Inquiries:** Name, email address, message content, optional order ID

**Automatically Collected Information:**

- **Authentication Data:** Session tokens managed by our authentication provider (Supabase)
- **Usage Data:** Pages visited, products viewed, search queries (stored locally on your device and in our database for personalization)

**Information We Do NOT Collect:**

- Payment card details (processed directly by Stripe — we never see or store card numbers)
- Precise geolocation data
- Data from children under 16 years of age

### 2. How We Use Your Information

We use the information we collect to:

- Process and fulfill your orders
- Send order confirmations and shipping updates
- Provide customer support
- Personalize your shopping experience (product recommendations, search results)
- Improve our Platform and services
- Comply with legal obligations

### 3. Third-Party Services

We share data with the following third-party services, each with their own privacy policies:

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| **Supabase** | Authentication, database, file storage | Email, name, account data |
| **Violet.io** | Product catalog and order fulfillment | Name, email, shipping address (for order processing) |
| **Stripe** | Payment processing | Payment is processed directly by Stripe — we transmit only a payment token, never card details |
| **Resend** | Transactional email delivery | Email address, order details (for confirmation/shipping emails) |

We do not sell your personal information to third parties. We do not use third-party advertising or tracking cookies.

### 4. Your Rights (GDPR)

If you are located in the European Economic Area (EEA), you have the following rights:

- **Right of Access:** Request a copy of the personal data we hold about you
- **Right to Rectification:** Request correction of inaccurate data
- **Right to Erasure:** Request deletion of your personal data ("right to be forgotten")
- **Right to Restrict Processing:** Request limitation of how we process your data
- **Right to Data Portability:** Receive your data in a structured, machine-readable format
- **Right to Object:** Object to processing based on legitimate interests

To exercise any of these rights, contact us at **privacy@maisonemile.com**.

We will respond to your request within 30 days.

### 5. Data Retention

- **Account data:** Retained while your account is active; deleted upon request
- **Order data:** Retained for 5 years for legal and tax compliance purposes
- **Guest order data:** Session data is cleared after order completion; order records retained per above
- **Support inquiries:** Retained for 2 years after resolution

### 6. Data Security

We implement appropriate technical and organizational measures to protect your data, including:

- Encryption in transit (TLS 1.2+) and at rest
- Row-Level Security (RLS) on all database tables
- Environment-variable-based secret management (no credentials in code)
- Regular security reviews

### 7. Children''s Privacy

Our Platform is not directed at children under 16. We do not knowingly collect personal information from children under 16. If you believe we have inadvertently collected such data, please contact us immediately.

### 8. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last updated" date. Continued use of the Platform constitutes acceptance of the updated policy.

### 9. Contact Us

For privacy-related inquiries or to exercise your data rights:

- **Email:** privacy@maisonemile.com
- **Contact Form:** [Contact Support](/help/contact)',
  'Maison Émile',
  now(),
  'Privacy Policy | Maison Émile',
  'Learn how Maison Émile collects, uses, and protects your personal information. Your privacy matters to us.',
  'published'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.content_pages (slug, title, type, body_markdown, author, published_at, seo_title, seo_description, status)
VALUES (
  'terms',
  'Terms of Service',
  'legal',
  '## Terms of Service

**Last updated:** March 2026

Welcome to Maison Émile. By accessing or using our website and mobile application (the "Platform"), you agree to be bound by these Terms of Service ("Terms"). Please read them carefully.

### 1. About Maison Émile

Maison Émile is a curated online shopping platform that connects you with products from independent merchants. **We operate as an affiliate marketplace** — when you make a purchase through our Platform, we earn a commission from the merchant. This commission does not affect the price you pay.

Our role is to curate, present, and facilitate the discovery of quality products. The actual sale, fulfillment, shipping, and returns are handled by the individual merchants through our commerce partner, Violet.io.

### 2. Affiliate Disclosure (FTC Compliance)

In accordance with the Federal Trade Commission (FTC) guidelines (16 CFR §255):

**Maison Émile earns commissions on purchases made through our Platform.** This means:

- We receive a percentage of each sale as a commission from the merchant
- The price you pay is the same whether you purchase through our Platform or directly from the merchant
- Our product curation and recommendations may be influenced by commercial relationships
- Commission rates vary by merchant and product category

This disclosure applies to all product pages, search results, and recommendations on our Platform.

### 3. Products and Merchants

- Products displayed on our Platform are sold and fulfilled by independent merchants
- Product descriptions, images, pricing, and availability are provided by merchants via Violet.io
- We make reasonable efforts to ensure accuracy but cannot guarantee that all product information is complete or error-free
- Prices are displayed in the applicable currency and include estimated taxes where required by law

### 4. Orders and Payments

- All payments are processed securely through Stripe. We never see, store, or have access to your credit card details
- By placing an order, you agree to pay the total displayed price including taxes and shipping
- Order confirmation will be sent to your provided email address
- Orders may contain items from multiple merchants, each shipped separately

### 5. Shipping and Delivery

- Shipping is handled by the individual merchants, not by Maison Émile
- Delivery timeframes are estimates provided by merchants and may vary
- Shipping costs are calculated during checkout based on your delivery address and the merchant''s shipping policies

### 6. Returns and Refunds

- Return and refund policies are set by individual merchants
- We facilitate the refund process through our commerce partner (Violet.io) but cannot override merchant policies
- To initiate a return, contact our support team with your order details
- Refund processing times depend on the merchant and your payment provider

### 7. Right of Withdrawal (EU Consumers)

If you are an EU consumer, you have the right to withdraw from your purchase within 14 days of receiving the goods, without giving any reason, in accordance with the EU Consumer Rights Directive (2011/83/EU).

To exercise this right:

1. Contact our support team at [Contact Support](/help/contact)
2. Clearly state your intention to withdraw
3. Return the goods in their original condition

The merchant will refund your payment within 14 days of receiving the returned goods.

**Exceptions:** The right of withdrawal does not apply to sealed goods that have been opened after delivery (where unsealing makes return unreasonable for hygiene or health reasons), or to goods made to your specifications.

### 8. User Accounts

- Account creation is optional — you can browse and purchase as a guest
- You are responsible for maintaining the security of your account credentials
- You must provide accurate information when creating an account or placing an order
- We reserve the right to suspend accounts that violate these Terms

### 9. Intellectual Property

- The Maison Émile name, logo, and Platform design are our intellectual property
- Product images and descriptions are the property of their respective merchants
- You may not reproduce, distribute, or create derivative works from our Platform content without permission

### 10. Limitation of Liability

- Maison Émile acts as a marketplace facilitator, not as a seller of goods
- We are not liable for product defects, shipping delays, or merchant-related issues beyond our reasonable control
- Our liability is limited to the commission earned on the relevant transaction
- We provide the Platform "as is" without warranties of any kind beyond those required by law

### 11. Governing Law

These Terms are governed by the laws of the jurisdiction in which Maison Émile operates. Any disputes shall be resolved through the courts of that jurisdiction, without prejudice to your consumer rights under applicable local law.

### 12. Changes to These Terms

We may update these Terms from time to time. Material changes will be communicated via email or prominent notice on the Platform. Continued use after changes constitutes acceptance.

### 13. Contact Us

For questions about these Terms:

- **Email:** legal@maisonemile.com
- **Contact Form:** [Contact Support](/help/contact)',
  'Maison Émile',
  now(),
  'Terms of Service | Maison Émile',
  'Read the Terms of Service for Maison Émile. Understand your rights and obligations when using our curated shopping platform.',
  'published'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.content_pages (slug, title, type, body_markdown, author, published_at, seo_title, seo_description, status)
VALUES (
  'cookies',
  'Cookie Policy',
  'legal',
  '## Cookie Policy

**Last updated:** March 2026

This Cookie Policy explains how Maison Émile uses cookies and similar technologies on our website.

### 1. What Are Cookies?

Cookies are small text files stored on your device by your web browser. They help websites remember your preferences and improve your experience.

### 2. Cookies We Use

Maison Émile uses a minimal set of cookies, focused entirely on functionality — **we do not use any advertising or tracking cookies**.

| Cookie/Storage | Type | Purpose | Duration |
|----------------|------|---------|----------|
| `sb-*` (Supabase auth) | Strictly Necessary | Authentication session — keeps you logged in | Session / 7 days |
| `cookie-consent` (localStorage) | Functional | Remembers your cookie preference choice | Persistent |
| Cart state (localStorage) | Functional | Preserves your shopping cart between visits | Persistent |
| User preferences (localStorage) | Functional | Stores display preferences (e.g., dark mode) | Persistent |
| Browsing history (localStorage) | Functional | Powers "Recently Viewed" and personalized recommendations | Persistent |

### 3. What We Do NOT Use

- ❌ **No advertising cookies** — we do not show ads
- ❌ **No third-party tracking** — no Google Analytics, Facebook Pixel, or similar
- ❌ **No cross-site tracking** — we do not track you across other websites
- ❌ **No fingerprinting** — we do not use browser fingerprinting techniques

### 4. Strictly Necessary Cookies

Authentication cookies (`sb-*`) are essential for the Platform to function. They allow you to log in and maintain your session. These cookies are exempt from consent requirements under GDPR as they are strictly necessary for the service you requested.

### 5. Managing Your Preferences

**On our Platform:**
You can accept or decline non-essential cookies using the cookie consent banner shown on your first visit.

**In your browser:**
You can manage cookies through your browser settings:

- **Chrome:** Settings → Privacy and Security → Cookies
- **Firefox:** Settings → Privacy & Security → Cookies
- **Safari:** Preferences → Privacy → Cookies
- **Edge:** Settings → Cookies and Site Permissions

Note: Blocking all cookies may affect the functionality of our Platform (e.g., you may not be able to stay logged in).

### 6. Changes to This Policy

We may update this Cookie Policy from time to time. Changes will be reflected on this page with an updated date.

### 7. More Information

For more details about how we handle your data, please read our [Privacy Policy](/legal/privacy).

For questions about cookies:

- **Email:** privacy@maisonemile.com
- **Contact Form:** [Contact Support](/help/contact)',
  'Maison Émile',
  now(),
  'Cookie Policy | Maison Émile',
  'Learn about the cookies Maison Émile uses. We use minimal, functional cookies only — no advertising or tracking.',
  'published'
)
ON CONFLICT (slug) DO NOTHING;
