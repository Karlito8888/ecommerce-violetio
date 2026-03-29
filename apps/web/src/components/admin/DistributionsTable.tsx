/**
 * @module DistributionsTable
 *
 * Displays per-distribution breakdown for a Violet order with sync capability.
 *
 * Shows each distribution record (channel gross/net, Stripe fees, merchant payout)
 * with status badges and type labels. Includes a sync button to fetch latest from Violet.
 *
 * All monetary values arrive as cents and are formatted via `formatPrice`.
 *
 * Accessibility features:
 * - `scope="col"` on table headers for screen reader cell-header association (WCAG 1.3.1)
 */

import { formatPrice } from "@ecommerce/shared";
import type { DistributionRow } from "@ecommerce/shared";

interface DistributionsTableProps {
  distributions: DistributionRow[];
  violetOrderId: string;
  onSync: (violetOrderId: string) => void;
  isSyncing: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  SENT: "Sent",
  FAILED: "Failed",
};

const TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

export default function DistributionsTable({
  distributions,
  violetOrderId,
  onSync,
  isSyncing,
}: DistributionsTableProps) {
  return (
    <div className="distributions-table">
      <div className="distributions-table__header">
        <h3 className="distributions-table__title">Distributions — Order {violetOrderId}</h3>
        <button
          className="distributions-table__sync-btn"
          onClick={() => onSync(violetOrderId)}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing…" : "Sync from Violet"}
        </button>
      </div>

      {distributions.length === 0 ? (
        <p className="distributions-table__empty">
          No distributions synced yet. Click "Sync from Violet" to fetch.
        </p>
      ) : (
        <table className="distributions-table__table">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Channel (gross)</th>
              <th scope="col">Stripe fee</th>
              <th scope="col">Channel (net)</th>
              <th scope="col">Merchant</th>
            </tr>
          </thead>
          <tbody>
            {distributions.map((d) => {
              const netChannel = d.channel_amount_cents - d.stripe_fee_cents;
              return (
                <tr
                  key={d.id}
                  className={`distributions-table__row distributions-table__row--${d.status.toLowerCase()}`}
                >
                  <td>{TYPE_LABELS[d.type] ?? d.type}</td>
                  <td>
                    <span
                      className={`distributions-table__status distributions-table__status--${d.status.toLowerCase()}`}
                    >
                      {STATUS_LABELS[d.status] ?? d.status}
                    </span>
                  </td>
                  <td>{formatPrice(d.channel_amount_cents)}</td>
                  <td className="distributions-table__fee">−{formatPrice(d.stripe_fee_cents)}</td>
                  <td className="distributions-table__net">{formatPrice(netChannel)}</td>
                  <td>{formatPrice(d.merchant_amount_cents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
