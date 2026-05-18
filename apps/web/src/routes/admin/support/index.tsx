/**
 * @module AdminSupportPage
 *
 * Admin route for managing customer support inquiries.
 *
 * Auth: requires admin role (verified via Convex Auth).
 * Data: loaded via Convex reactive queries.
 *
 * Phase 9: migrated from Supabase server functions to Convex queries/mutations.
 */

import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import { buildPageMeta } from "@ecommerce/shared";
import type { SupportInquiryStatus, SupportSubject } from "@ecommerce/shared";
import { SUPPORT_STATUSES, SUPPORT_SUBJECTS } from "@ecommerce/shared";
import { useConvexAuth } from "@convex-dev/auth/react";
import { SupportStatusBadge } from "#/components/admin/SupportStatusBadge";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/admin/support/")({
  head: () => ({
    meta: buildPageMeta({
      title: "Support Inquiries | Maison Émile",
      description: "Manage customer support inquiries.",
      url: "/admin/support",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  component: AdminSupportPage,
});

function AdminSupportPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<SupportInquiryStatus | "">("");
  const [subjectFilter, setSubjectFilter] = useState<SupportSubject | "">("");

  // Convex reactive query — automatically refetches when data changes
  const inquiries = useQuery(
    api.support.queries.getSupportInquiries,
    statusFilter ? { status: statusFilter } : {},
  );

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

  // Filter by subject client-side (Convex index is on status only)
  const filteredInquiries = subjectFilter
    ? (inquiries ?? []).filter((i) => i.subject === subjectFilter)
    : (inquiries ?? []);

  function handleRowClick(inquiryId: string) {
    navigate({ to: "/admin/support/$inquiryId", params: { inquiryId } });
  }

  return (
    <div className="page-wrap admin-support">
      <header className="admin-support__header">
        <div className="admin-support__title-row">
          <Link to="/admin" className="admin-support__back">
            ← Dashboard
          </Link>
          <h1 className="admin-support__title">Support Inquiries</h1>
        </div>
        <div className="support-filters">
          <select
            className="support-filters__select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SupportInquiryStatus | "")}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {SUPPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="support-filters__select"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value as SupportSubject | "")}
            aria-label="Filter by subject"
          >
            <option value="">All Subjects</option>
            {SUPPORT_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section
        className={`admin-support__list${inquiries === undefined ? " admin-support__list--loading" : ""}`}
      >
        {filteredInquiries.length === 0 ? (
          <p className="inquiry-list__empty">No inquiries found.</p>
        ) : (
          <div className="inquiry-list">
            <table className="inquiry-list__table">
              <thead>
                <tr className="inquiry-list__header">
                  <th scope="col">Date</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Status</th>
                  <th scope="col">Order ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredInquiries.map((inquiry) => (
                  <tr
                    key={inquiry._id}
                    className="inquiry-list__row"
                    onClick={() => handleRowClick(inquiry._id)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(inquiry._id);
                      }
                    }}
                  >
                    <td>{new Date(inquiry._creationTime).toLocaleDateString()}</td>
                    <td>{inquiry.name}</td>
                    <td>{inquiry.email}</td>
                    <td>{inquiry.subject}</td>
                    <td>
                      <SupportStatusBadge status={inquiry.status as SupportInquiryStatus} />
                    </td>
                    <td>{inquiry.orderId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
