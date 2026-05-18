/**
 * @module AdminSupportDetailPage
 *
 * Admin route for viewing and managing a single support inquiry.
 *
 * Auth: requires admin role (verified via Convex Auth).
 * Data: loaded via Convex reactive queries and mutations.
 *
 * Phase 9: migrated from Supabase server functions to Convex queries/mutations.
 */

import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "#convex/_generated/api";
import type { Id } from "#convex/_generated/dataModel";
import { buildPageMeta, formatPrice } from "@ecommerce/shared";
import type { SupportInquiryStatus } from "@ecommerce/shared";
import { SUPPORT_STATUSES } from "@ecommerce/shared";
import { useConvexAuth } from "@convex-dev/auth/react";
import { SupportStatusBadge } from "#/components/admin/SupportStatusBadge";
import { AdminErrorBoundary } from "#/components/admin/ErrorBoundary";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/admin/support/$inquiryId")({
  head: () => ({
    meta: buildPageMeta({
      title: "Inquiry Detail | Maison Émile",
      description: "Support inquiry details.",
      url: "/admin/support",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  component: AdminSupportDetailPage,
});

function AdminSupportDetailPage() {
  const { inquiryId } = Route.useParams();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigate = useNavigate();

  // Convex reactive queries
  const inquiry = useQuery(api.support.queries.getSupportInquiry, {
    inquiryId: inquiryId as Id<"supportInquiries">,
  });

  // Linked order (if inquiry has an orderId)
  const linkedOrder = useQuery(
    api.support.queries.getLinkedOrder,
    inquiry?.orderId ? { violetOrderId: inquiry.orderId } : "skip",
  );

  // Mutations
  const updateStatus = useMutation(api.support.mutations.updateInquiryStatus);
  const updateNotes = useMutation(api.support.mutations.updateInternalNotes);
  const sendReply = useAction(api.admin.mutations.replyToSupportInquiry);

  // Local state
  const [selectedStatus, setSelectedStatus] = useState<SupportInquiryStatus>("new");
  const [notes, setNotes] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="page-wrap">
        <p>Loading…</p>
      </div>
    );
  }

  if (inquiry === undefined) {
    return (
      <div className="page-wrap">
        <p>Loading inquiry…</p>
      </div>
    );
  }
  if (inquiry === null) {
    return (
      <div className="page-wrap">
        <p>Inquiry not found.</p>
      </div>
    );
  }

  // Non-null alias for closures (TS can't narrow across closures)
  const currentInquiry = inquiry;

  // Sync local state when inquiry loads or changes
  useEffect(() => {
    if (currentInquiry) {
      setSelectedStatus(currentInquiry.status as SupportInquiryStatus);
      if (currentInquiry.internalNotes) {
        setNotes(currentInquiry.internalNotes);
      }
    }
    // Only run when inquiry ID changes (not on every reactive data refresh)
  }, [currentInquiry?._id]);

  async function handleStatusUpdate() {
    setStatusUpdating(true);
    setFeedback(null);
    try {
      await updateStatus({ inquiryId: currentInquiry._id, status: selectedStatus });
      setFeedback("Status updated.");
    } catch {
      setFeedback("Failed to update status.");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleNotesSave() {
    setNotesSaving(true);
    setFeedback(null);
    try {
      await updateNotes({ inquiryId: currentInquiry._id, notes });
      setFeedback("Notes saved.");
    } catch {
      setFeedback("Failed to save notes.");
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleReply() {
    if (replyMessage.trim().length < 10) {
      setFeedback("Reply must be at least 10 characters.");
      return;
    }
    setReplySending(true);
    setFeedback(null);
    try {
      await sendReply({ inquiryId: currentInquiry._id, replyMessage });
      setFeedback("Reply sent successfully.");
      setReplyMessage("");
      if (currentInquiry.status === "new") {
        setSelectedStatus("in-progress");
      }
    } catch {
      setFeedback("Failed to send reply.");
    } finally {
      setReplySending(false);
    }
  }

  return (
    <AdminErrorBoundary>
      <div className="page-wrap admin-support-detail">
        <header className="admin-support-detail__header">
          <Link to="/admin/support" className="admin-support-detail__back">
            ← Back to Inquiries
          </Link>
          <div className="admin-support-detail__title-row">
            <h1 className="admin-support-detail__title">Inquiry from {currentInquiry.name}</h1>
            <SupportStatusBadge status={currentInquiry.status as SupportInquiryStatus} />
          </div>
        </header>

        {feedback && (
          <div className="admin-support-detail__feedback" role="status">
            {feedback}
          </div>
        )}

        <section className="admin-support-detail__meta">
          <dl className="admin-support-detail__info">
            <dt>Date</dt>
            <dd>{new Date(currentInquiry._creationTime).toLocaleString()}</dd>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${currentInquiry.email}`}>{currentInquiry.email}</a>
            </dd>
            <dt>Subject</dt>
            <dd>{currentInquiry.subject}</dd>
            <dt>Order ID</dt>
            <dd>{currentInquiry.orderId ?? "None"}</dd>
          </dl>
        </section>

        <section className="admin-support-detail__message">
          <h2 className="admin-support-detail__section-title">Customer Message</h2>
          <blockquote className="admin-support-detail__message-text">
            {currentInquiry.message}
          </blockquote>
        </section>

        {linkedOrder && (
          <section className="admin-support-detail__order">
            <h2 className="admin-support-detail__section-title">Linked Order</h2>
            <dl className="admin-support-detail__info">
              <dt>Violet Order ID</dt>
              <dd>{linkedOrder.violetOrderId}</dd>
              <dt>Status</dt>
              <dd>{linkedOrder.status}</dd>
              <dt>Total</dt>
              <dd>{formatPrice(linkedOrder.total)}</dd>
              <dt>Date</dt>
              <dd>{new Date(linkedOrder._creationTime).toLocaleDateString()}</dd>
            </dl>
          </section>
        )}

        <section className="admin-support-detail__actions">
          <div className="admin-support-detail__status-update">
            <h2 className="admin-support-detail__section-title">Update Status</h2>
            <div className="admin-support-detail__action-row">
              <select
                className="support-filters__select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as SupportInquiryStatus)}
                aria-label="Inquiry status"
              >
                {SUPPORT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-support-detail__button"
                onClick={handleStatusUpdate}
                disabled={
                  statusUpdating ||
                  selectedStatus === (currentInquiry.status as SupportInquiryStatus)
                }
              >
                {statusUpdating ? "Updating…" : "Update Status"}
              </button>
            </div>
          </div>

          <div className="admin-support-detail__notes">
            <h2 className="admin-support-detail__section-title">Internal Notes</h2>
            <textarea
              className="admin-support-detail__textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add internal notes (not visible to customer)…"
              rows={4}
            />
            <button
              type="button"
              className="admin-support-detail__button"
              onClick={handleNotesSave}
              disabled={notesSaving}
            >
              {notesSaving ? "Saving…" : "Save Notes"}
            </button>
          </div>

          <div className="admin-support-detail__reply">
            <h2 className="admin-support-detail__section-title">Reply to Customer</h2>
            <textarea
              className="admin-support-detail__textarea"
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              placeholder="Type your reply to the customer…"
              rows={5}
            />
            <button
              type="button"
              className="admin-support-detail__button admin-support-detail__button--primary"
              onClick={handleReply}
              disabled={replySending || replyMessage.trim().length < 10}
            >
              {replySending ? "Sending…" : "Send Reply"}
            </button>
          </div>
        </section>
      </div>
    </AdminErrorBoundary>
  );
}
