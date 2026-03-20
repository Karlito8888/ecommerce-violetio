-- Story 8.1: FAQ & Help Center + Story 8.2: Contact & Support Form (shared migration)
-- Creates faq_items table for FAQ content and support_inquiries table for contact form submissions.
-- Public read for published FAQ items, anon insert for support inquiries, service_role full access.

-- ─── faq_items table ───
CREATE TABLE IF NOT EXISTS public.faq_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category         TEXT NOT NULL,
  question         TEXT NOT NULL,
  answer_markdown  TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_published     BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── support_inquiries table (used by Story 8.2) ───
CREATE TABLE IF NOT EXISTS public.support_inquiries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  subject        TEXT NOT NULL CHECK (subject IN ('Order Issue', 'Payment Problem', 'General Question', 'Other')),
  message        TEXT NOT NULL CHECK (char_length(message) >= 20 AND char_length(message) <= 2000),
  order_id       TEXT,
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in-progress', 'resolved')),
  internal_notes TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_faq_items_category_sort
  ON public.faq_items(category, sort_order)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_support_inquiries_status
  ON public.support_inquiries(status, created_at DESC);

-- ─── Column comments for Supabase Studio ───
COMMENT ON COLUMN faq_items.category IS 'FAQ category grouping. Standard: Shipping & Delivery, Returns & Refunds, Payment Methods, Order Tracking, Account & Privacy';
COMMENT ON COLUMN faq_items.question IS 'The FAQ question as displayed to visitors';
COMMENT ON COLUMN faq_items.answer_markdown IS 'Markdown-formatted answer. Supports links: [text](/path). Keep concise but comprehensive';
COMMENT ON COLUMN faq_items.sort_order IS 'Display order within category. Lower = first. Use multiples of 10 for easy reordering';
COMMENT ON COLUMN faq_items.is_published IS 'Set to false to hide without deleting. Only published items visible to visitors';

COMMENT ON COLUMN support_inquiries.subject IS 'Dropdown values: Order Issue, Payment Problem, General Question, Other';
COMMENT ON COLUMN support_inquiries.status IS 'Workflow: new → in-progress → resolved. Updated by admin';
COMMENT ON COLUMN support_inquiries.order_id IS 'Optional Violet order ID for order-related inquiries';
COMMENT ON COLUMN support_inquiries.message IS 'Customer message, 20-2000 characters';
COMMENT ON COLUMN support_inquiries.internal_notes IS 'Admin-only notes, not visible to the customer';

-- ─── updated_at triggers (reuse existing function) ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_faq_items'
  ) THEN
    CREATE TRIGGER set_updated_at_faq_items
      BEFORE UPDATE ON public.faq_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_support_inquiries'
  ) THEN
    CREATE TRIGGER set_updated_at_support_inquiries
      BEFORE UPDATE ON public.support_inquiries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── RLS ───
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_published_faq" ON public.faq_items
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "service_role_all_faq" ON public.faq_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.support_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_support" ON public.support_inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "service_role_all_support" ON public.support_inquiries
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── Seed FAQ data for development/testing ───
INSERT INTO public.faq_items (category, question, answer_markdown, sort_order) VALUES
  -- Shipping & Delivery
  ('Shipping & Delivery', 'How long does shipping take?',
   'Shipping times depend on the merchant fulfilling your order. Most orders ship within **2–5 business days**. You can track your order status on the [order tracking page](/orders/lookup).

Each item in your order may ship separately since they come from different merchants.',
   10),
  ('Shipping & Delivery', 'Do you ship internationally?',
   'International shipping availability depends on the individual merchant. Check the product page for shipping details.

Currently, most of our merchants ship within the **United States and Canada**.',
   20),
  ('Shipping & Delivery', 'How much does shipping cost?',
   'Shipping costs are calculated at checkout based on the merchant''s rates and your delivery address. You''ll see the exact shipping cost before completing your purchase.',
   30),

  -- Returns & Refunds
  ('Returns & Refunds', 'What is your return policy?',
   'Return policies are set by each individual merchant. You can find the return policy on the product page or in your order confirmation email.

Most merchants accept returns within **30 days** of delivery for unused items in original packaging.',
   10),
  ('Returns & Refunds', 'How do I request a refund?',
   'To request a refund:

1. Go to your [order history](/orders/lookup)
2. Find the order you want to return
3. Contact the merchant directly through the order details

Refunds are typically processed within **5–10 business days** after the merchant receives the returned item.',
   20),

  -- Payment Methods
  ('Payment Methods', 'What payment methods do you accept?',
   'We accept all major credit and debit cards through our secure Stripe payment processing:

- **Visa**
- **Mastercard**
- **American Express**
- **Discover**

All payments are processed securely with SSL encryption.',
   10),
  ('Payment Methods', 'Is my payment information secure?',
   'Yes, your payment security is our top priority. We use **Stripe** for payment processing, which is PCI DSS Level 1 certified — the highest level of security certification.

Your card details are never stored on our servers.',
   20),

  -- Order Tracking
  ('Order Tracking', 'How do I track my order?',
   'You can track your order at any time:

1. Visit the [order lookup page](/orders/lookup)
2. Enter your email address
3. View your order status and tracking information

You''ll also receive email updates as your order progresses.',
   10),
  ('Order Tracking', 'I haven''t received my order. What should I do?',
   'If your order is delayed:

1. Check the [order tracking page](/orders/lookup) for the latest status
2. Allow an extra **2–3 business days** beyond the estimated delivery date
3. If the issue persists, [contact our support team](/help/contact) with your order ID

We''ll help resolve the issue as quickly as possible.',
   20),

  -- Account & Privacy
  ('Account & Privacy', 'How do I delete my account?',
   'To delete your account, please [contact our support team](/help/contact) with the subject "Account Deletion Request."

We''ll process your request within **48 hours** and confirm the deletion via email. Note that order history may be retained for legal purposes.',
   10),
  ('Account & Privacy', 'How is my data used?',
   'We take your privacy seriously. Your data is used to:

- Process and deliver your orders
- Provide personalized product recommendations
- Send order updates and notifications

For full details, please review our [Privacy Policy](/legal/privacy). You can manage your notification preferences in your [account settings](/profile).',
   20)
ON CONFLICT DO NOTHING;
