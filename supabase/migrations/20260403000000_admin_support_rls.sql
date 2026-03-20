-- Story 8.4: Support Inquiry Management — Admin RLS policies
-- Adds admin SELECT and UPDATE policies to the existing support_inquiries table.
-- These policies are ADDITIVE to the existing anon_insert_support and service_role_all_support policies.
-- Reuses is_admin() function from 20260402000000_admin_roles.sql.

-- Admin can read all support inquiries (for the management interface)
CREATE POLICY "admin_read_support" ON public.support_inquiries
  FOR SELECT TO authenticated
  USING (is_admin());

-- Admin can update support inquiries (status, internal_notes)
CREATE POLICY "admin_update_support" ON public.support_inquiries
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
