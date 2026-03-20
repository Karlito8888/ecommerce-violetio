import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { buildPageMeta, formatPrice } from "@ecommerce/shared";
import type { SupportInquiryStatus, AdminSupportDetailData } from "@ecommerce/shared";
import { SUPPORT_STATUSES } from "@ecommerce/shared";
import { getAdminUserFn } from "#/server/adminAuth";
import { getAdminSupportDetailFn } from "#/server/getAdminSupport";
import { updateSupportStatusFn, updateSupportNotesFn } from "#/server/updateSupportInquiry";
import { replySupportFn } from "#/server/replySupportInquiry";
import { SupportStatusBadge } from "#/components/admin/SupportStatusBadge";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/admin/support/$inquiryId")({
  beforeLoad: async () => {
    const adminUser = await getAdminUserFn();
    if (!adminUser) {
      throw redirect({ to: "/" });
    }
  },
  loader: async ({ params }) => {
    return getAdminSupportDetailFn({ data: { inquiryId: params.inquiryId } });
  },
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
  const data = Route.useLoaderData() as AdminSupportDetailData;
  const { linkedOrder } = data;

  const [inquiry, setInquiry] = useState(data.inquiry);
  const [selectedStatus, setSelectedStatus] = useState<SupportInquiryStatus>(inquiry.status);
  const [notes, setNotes] = useState(inquiry.internalNotes ?? "");
  const [replyMessage, setReplyMessage] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleStatusUpdate() {
    setStatusUpdating(true);
    setFeedback(null);
    try {
      const result = await updateSupportStatusFn({
        data: { inquiryId: inquiry.id, status: selectedStatus },
      });
      if (result.success) {
        setInquiry((prev) => ({ ...prev, status: selectedStatus }));
        setFeedback("Status updated.");
      } else {
        setFeedback(result.error ?? "Failed to update status.");
      }
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
      const result = await updateSupportNotesFn({
        data: { inquiryId: inquiry.id, notes },
      });
      if (result.success) {
        setInquiry((prev) => ({ ...prev, internalNotes: notes }));
        setFeedback("Notes saved.");
      } else {
        setFeedback(result.error ?? "Failed to save notes.");
      }
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
      const result = await replySupportFn({
        data: { inquiryId: inquiry.id, replyMessage },
      });
      if (result.success) {
        setFeedback("Reply sent successfully.");
        setReplyMessage("");
        // Auto-advance status display if it was "new"
        if (inquiry.status === "new") {
          setInquiry((prev) => ({ ...prev, status: "in-progress" }));
          setSelectedStatus("in-progress");
        }
      } else {
        setFeedback(result.error ?? "Failed to send reply.");
      }
    } catch {
      setFeedback("Failed to send reply.");
    } finally {
      setReplySending(false);
    }
  }

  return (
    <div className="page-wrap admin-support-detail">
      <header className="admin-support-detail__header">
        <Link to="/admin/support" className="admin-support-detail__back">
          ← Back to Inquiries
        </Link>
        <div className="admin-support-detail__title-row">
          <h1 className="admin-support-detail__title">Inquiry from {inquiry.name}</h1>
          <SupportStatusBadge status={inquiry.status} />
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
          <dd>{new Date(inquiry.createdAt).toLocaleString()}</dd>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
          </dd>
          <dt>Subject</dt>
          <dd>{inquiry.subject}</dd>
          <dt>Order ID</dt>
          <dd>{inquiry.orderId ?? "None"}</dd>
        </dl>
      </section>

      <section className="admin-support-detail__message">
        <h2 className="admin-support-detail__section-title">Customer Message</h2>
        <blockquote className="admin-support-detail__message-text">{inquiry.message}</blockquote>
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
            <dd>{new Date(linkedOrder.createdAt).toLocaleDateString()}</dd>
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
              disabled={statusUpdating || selectedStatus === inquiry.status}
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
  );
}
