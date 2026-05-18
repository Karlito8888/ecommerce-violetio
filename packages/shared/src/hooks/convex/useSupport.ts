// packages/shared/src/hooks/convex/useSupport.ts
//
// Convex-based support hooks.
// Replaces the Supabase-based support client during migration.

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

/**
 * Count recent inquiries from an email (rate limiting check).
 */
export function useRecentInquiryCount(email: string | undefined) {
  return useQuery(api.support.queries.countRecentInquiries, email ? { email } : "skip");
}

/** Mutation: submit a new support inquiry (public, no auth). */
export function useInsertSupportInquiry() {
  return useMutation(api.support.mutations.insertSupportInquiry);
}

// ─── Admin mutations ────────────────────────────────────────────────

/** Mutation: update inquiry status (admin). */
export function useUpdateInquiryStatus() {
  return useMutation(api.support.mutations.updateInquiryStatus);
}

/** Mutation: update internal notes on an inquiry (admin). */
export function useUpdateInternalNotes() {
  return useMutation(api.support.mutations.updateInternalNotes);
}
