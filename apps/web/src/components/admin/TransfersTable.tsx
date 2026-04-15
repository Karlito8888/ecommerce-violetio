/**
 * @module TransfersTable
 *
 * Admin component for monitoring and retrying failed transfers.
 *
 * Displays transfer records with status badges, error details,
 * and retry buttons. Includes a sync button to fetch latest from Violet.
 *
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 */

import { useState } from "react";
import { formatPrice } from "@ecommerce/shared";
import type { TransferRow } from "@ecommerce/shared";

interface TransfersTableProps {
  transfers: TransferRow[];
  onSync: () => void;
  onRetryOrder: (violetOrderId: string) => void;
  onRetryBag: (violetBagId: string) => void;
  isSyncing: boolean;
  retryingIds: Set<string>;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SENT: "Sent",
  FAILED: "Failed",
  PARTIALLY_SENT: "Partially Sent",
  REVERSED: "Reversed",
  PARTIALLY_REVERSED: "Partially Reversed",
  BYPASSED: "Bypassed",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "transfers-table__status--pending",
  SENT: "transfers-table__status--sent",
  FAILED: "transfers-table__status--failed",
  PARTIALLY_SENT: "transfers-table__status--pending",
  REVERSED: "transfers-table__status--reversed",
  PARTIALLY_REVERSED: "transfers-table__status--reversed",
  BYPASSED: "transfers-table__status--bypassed",
};

export default function TransfersTable({
  transfers,
  onSync,
  onRetryOrder,
  onRetryBag,
  isSyncing,
  retryingIds,
}: TransfersTableProps) {
  const [showErrors, setShowErrors] = useState<string | null>(null);

  const failedTransfers = transfers.filter((t) => t.status === "FAILED");
  const hasFailed = failedTransfers.length > 0;

  return (
    <div className="transfers-table">
      <div className="transfers-table__header">
        <h3 className="transfers-table__title">
          Transfers
          {hasFailed && (
            <span className="transfers-table__badge transfers-table__badge--failed">
              {failedTransfers.length} failed
            </span>
          )}
        </h3>
        <button className="transfers-table__sync-btn" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? "Syncing…" : "Sync from Violet"}
        </button>
      </div>

      {transfers.length === 0 ? (
        <p className="transfers-table__empty">
          No transfers synced yet. Click "Sync from Violet" to fetch.
        </p>
      ) : (
        <table className="transfers-table__table">
          <thead>
            <tr>
              <th scope="col">Transfer ID</th>
              <th scope="col">Order</th>
              <th scope="col">Merchant</th>
              <th scope="col">Status</th>
              <th scope="col">Amount</th>
              <th scope="col">Errors</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => {
              const isRetrying =
                retryingIds.has(t.violet_transfer_id) ||
                retryingIds.has(t.violet_order_id) ||
                (t.violet_bag_id ? retryingIds.has(t.violet_bag_id) : false);
              const canRetry = t.status === "FAILED";

              return (
                <tr
                  key={t.id}
                  className={`transfers-table__row transfers-table__row--${t.status.toLowerCase()}`}
                >
                  <td className="transfers-table__mono">{t.violet_transfer_id}</td>
                  <td className="transfers-table__mono">{t.violet_order_id}</td>
                  <td>{t.merchant_id}</td>
                  <td>
                    <span className={`transfers-table__status ${STATUS_CLASSES[t.status] ?? ""}`}>
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </td>
                  <td>{formatPrice(t.amount_cents)}</td>
                  <td>
                    {t.errors && t.errors.length > 0 ? (
                      <>
                        <button
                          className="transfers-table__error-toggle"
                          onClick={() => setShowErrors(showErrors === t.id ? null : t.id)}
                        >
                          {t.errors.length} error{t.errors.length > 1 ? "s" : ""}
                        </button>
                        {showErrors === t.id && (
                          <ul className="transfers-table__errors">
                            {t.errors.map((e, i) => (
                              <li key={i}>
                                <strong>[{e.errorCode ?? "unknown"}]</strong>{" "}
                                {e.errorMessage ?? "No details"}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {canRetry && (
                      <div className="transfers-table__retry-group">
                        <button
                          className="transfers-table__retry-btn"
                          onClick={() => onRetryOrder(t.violet_order_id)}
                          disabled={isRetrying}
                        >
                          {isRetrying ? "Retrying…" : "Retry Order"}
                        </button>
                        {t.violet_bag_id && (
                          <button
                            className="transfers-table__retry-btn"
                            onClick={() => onRetryBag(t.violet_bag_id!)}
                            disabled={isRetrying}
                          >
                            {isRetrying ? "Retrying…" : "Retry Bag"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
