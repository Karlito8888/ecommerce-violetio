import { useState } from "react";
import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { buildPageMeta } from "@ecommerce/shared";
import type {
  SupportInquiry,
  SupportInquiryFilters,
  SupportInquiryStatus,
  SupportSubject,
} from "@ecommerce/shared";
import { SUPPORT_STATUSES, SUPPORT_SUBJECTS } from "@ecommerce/shared";
import { getAdminUserFn } from "#/server/adminAuth";
import { getAdminSupportListFn } from "#/server/getAdminSupport";
import { SupportStatusBadge } from "#/components/admin/SupportStatusBadge";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/admin/support/")({
  beforeLoad: async () => {
    const adminUser = await getAdminUserFn();
    if (!adminUser) {
      throw redirect({ to: "/" });
    }
  },
  loader: async () => {
    return getAdminSupportListFn({ data: { filters: {} } });
  },
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
  const initialData = Route.useLoaderData();
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState<SupportInquiry[]>(initialData.inquiries);
  const [statusFilter, setStatusFilter] = useState<SupportInquiryStatus | "">("");
  const [subjectFilter, setSubjectFilter] = useState<SupportSubject | "">("");
  const [loading, setLoading] = useState(false);

  async function applyFilters(
    newStatus: SupportInquiryStatus | "",
    newSubject: SupportSubject | "",
  ) {
    setLoading(true);
    try {
      const filters: SupportInquiryFilters = {};
      if (newStatus) filters.status = newStatus;
      if (newSubject) filters.subject = newSubject;
      const result = await getAdminSupportListFn({ data: { filters } });
      setInquiries(result.inquiries);
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }

  function handleStatusChange(value: string) {
    const newStatus = value as SupportInquiryStatus | "";
    setStatusFilter(newStatus);
    applyFilters(newStatus, subjectFilter);
  }

  function handleSubjectChange(value: string) {
    const newSubject = value as SupportSubject | "";
    setSubjectFilter(newSubject);
    applyFilters(statusFilter, newSubject);
  }

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
            onChange={(e) => handleStatusChange(e.target.value)}
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
            onChange={(e) => handleSubjectChange(e.target.value)}
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

      <section className={`admin-support__list${loading ? " admin-support__list--loading" : ""}`}>
        {inquiries.length === 0 ? (
          <p className="inquiry-list__empty">No inquiries found.</p>
        ) : (
          <div className="inquiry-list">
            <table className="inquiry-list__table">
              <thead>
                <tr className="inquiry-list__header">
                  <th>Date</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Order ID</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => (
                  <tr
                    key={inquiry.id}
                    className="inquiry-list__row"
                    onClick={() => handleRowClick(inquiry.id)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(inquiry.id);
                      }
                    }}
                  >
                    <td>{new Date(inquiry.createdAt).toLocaleDateString()}</td>
                    <td>{inquiry.name}</td>
                    <td>{inquiry.email}</td>
                    <td>{inquiry.subject}</td>
                    <td>
                      <SupportStatusBadge status={inquiry.status} />
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
