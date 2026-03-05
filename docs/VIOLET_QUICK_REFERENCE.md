# Violet.io Quick Reference

**Last Updated:** 2026-03-03
**Your App ID:** 11371

---

## 🎯 What is Violet?

An **Embedded Commerce API** that lets you:

- Connect to merchant stores (Shopify, custom APIs)
- Sell their products without being a merchant
- Earn affiliate commissions
- Never touch payment processing

**Perfect for:** Your "Digital Personal Shopper" white-label marketplace.

---

## 📊 Your Account Status

| Item            | Status       | Details                       |
| --------------- | ------------ | ----------------------------- |
| Channel Account | ✅ Created   | https://channel.violet.io     |
| Demo Merchants  | ✅ Ready     | StyleSphere (14 products)     |
| API Credentials | ✅ Generated | App ID: 11371                 |
| Webhooks        | ⏳ Pending   | Required before launch        |
| Test Orders     | ⏳ Pending   | Can start after webhook setup |

---

## 🔑 Your Credentials

```
App ID:     11371
Secret Key: [STORE SECURELY IN .env]
Mode:       Test (switch to Live at launch)
```

**How to use:**

```bash
curl -X GET "https://api.violet.io/v1/merchants/10225/offers" \
  -H "Authorization: Bearer 11371:YOUR_SECRET_KEY"
```

---

## 📦 Your Test Merchant

| Property    | Value               |
| ----------- | ------------------- |
| Merchant ID | 10225               |
| Name        | StyleSphere [DEMO]  |
| Status      | ✅ Complete & Ready |
| Products    | 14 items            |
| Platform    | Shopify             |
| Commission  | 0% (demo)           |

**Products Available:**

- Unicorn Hoodie ($201)
- Velvet Cape ($23)
- Cosmic Shirt ($108)
- Steampunk Vest ($53)
- Garden Pixie Skirt ($214)
- Yellow Pants ($129)
- - 8 more

---

## 📚 Important URLs

| Name                     | URL                                              |
| ------------------------ | ------------------------------------------------ |
| **Dashboard**            | https://channel.violet.io                        |
| **Configuration**        | https://channel.violet.io/configuration          |
| **Webhooks**             | https://channel.violet.io/configuration/webhooks |
| **API Docs**             | https://docs.violet.io                           |
| **Merchant Marketplace** | https://violet.io/channels                       |

---

## 🚀 Critical Path to MVP

**This Week:**

1. ✅ Account created
2. ⏳ Read API docs (1-2 hrs)
3. ⏳ Configure webhooks (1 hr)
4. ⏳ Test API endpoints (1 hr)

**Week 2-3:**

- Build Supabase tables
- Create product sync
- Create webhook handler

**Week 4-5:**

- Product grid (web)
- AI search
- Checkout

**Week 6:**

- Testing
- Launch

---

## 📋 Key Endpoints

### Products

```
GET /v1/merchants/{id}/offers
Get all products from a merchant
```

### Checkout

```
POST /v1/checkout
Create new order
```

### Orders

```
GET /v1/orders/{id}
Get order details
```

### Webhooks

```
Events: order.created, order.updated, order.shipped, payment.completed
```

---

## ⚠️ Critical Things to Remember

1. **Webhooks MUST be configured BEFORE you handle orders**
   - Location: Configuration → Webhooks
   - You need a public backend URL

2. **Secret Key is PRIVATE**
   - Never expose in frontend
   - Only use in backend (Supabase Edge Functions)
   - Store in .env, never commit

3. **You are NOT a Merchant**
   - Violet handles payments
   - You just earn commissions
   - No inventory risk

4. **Demo First, Real Later**
   - Launch MVP with StyleSphere
   - Add real merchants after validation

5. **FTC Disclosure Required**
   - Must disclose affiliate relationship
   - Position as "curated marketplace"
   - Transparency builds trust

---

## 💻 Database Schema (Quick)

```sql
-- Products
CREATE TABLE violet_products (
  id BIGINT PRIMARY KEY,
  offer_id TEXT,
  merchant_id TEXT,
  name TEXT,
  price DECIMAL,
  tags TEXT[],
  image_url TEXT,
  embedding vector(1536),
  synced_at TIMESTAMP
);

-- Orders
CREATE TABLE violet_orders (
  id UUID PRIMARY KEY,
  violet_order_id TEXT,
  user_id UUID,
  merchant_id TEXT,
  total_amount DECIMAL,
  status TEXT,
  items JSONB,
  created_at TIMESTAMP
);
```

---

## 🎯 MVP Success Gates

- [ ] Browse StyleSphere products
- [ ] AI search returns relevant results
- [ ] Checkout flow completes
- [ ] Order appears in Violet dashboard
- [ ] Webhook fires with order details
- [ ] First real user completes purchase

---

## 📞 When You're Stuck

| Problem              | Solution                                             |
| -------------------- | ---------------------------------------------------- |
| API 401 error        | Check credentials format: `Bearer APP_ID:SECRET_KEY` |
| Webhook not firing   | Make sure endpoint is public + error logging         |
| Products not syncing | Check merchant ID (10225) and permissions            |
| Checkout redirects   | Verify you're using embed/widget, not redirect       |

---

## 🗂️ Documentation Files

| File                             | Purpose                          |
| -------------------------------- | -------------------------------- |
| `violet-io-integration-guide.md` | Complete technical guide         |
| `violet-io-action-plan.md`       | Step-by-step implementation plan |
| `VIOLET_QUICK_REFERENCE.md`      | This file                        |

---

## ⏱️ Timeline

```
Day 1-2:   Setup + Read Docs
Day 3:     Webhook Config
Day 4:     API Testing
Day 5:     Plan Week 2

Week 2-3:  Backend (Supabase tables, sync, webhooks)
Week 4-5:  Frontend (TanStack, Expo)
Week 6:    Testing + Launch
```

**Target Launch:** Mid-April 2026 ✅

---

## 🎓 Key Concepts

**Embedded Commerce** = You own UX, Violet owns infrastructure

**Adapter Pattern** = Swap Violet for firmly.ai or Google UCP later

**Commission Model** = Earn % on each sale, no inventory risk

**White-Label** = Users see StyleSphere products, not an obvious affiliate store

**Guest Checkout** = No forced registration = higher conversion

---

## 🔗 Architecture

```
Your Frontend (TanStack + Expo)
        ↓
Your Backend (Supabase Edge Functions)
        ↓
Violet API (Unified Checkout)
        ↓
Merchants (StyleSphere, others)
```

You own top 2 layers, Violet owns bottom 2.

---

## ✨ Next Immediate Action

**🔴 BLOCKING:** Go to Configuration → Webhooks and configure webhook endpoint

Once that's done, you can start building the backend.

---

**Version:** 1.0
**For:** Charles BOURGAULT
**Project:** Digital Personal Shopper E-commerce
**Created:** 2026-03-03
