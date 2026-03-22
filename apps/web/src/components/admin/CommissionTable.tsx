/**
 * @module CommissionTable
 *
 * Displays per-merchant commission breakdown with totals row.
 *
 * Used on the admin dashboard to show revenue attribution across Violet.io merchants.
 * All monetary values arrive as cents and are formatted via `formatPrice`.
 *
 * Accessibility features:
 * - `scope="col"` on table headers for screen reader cell-header association (WCAG 1.3.1)
 */

import { formatPrice } from "@ecommerce/shared";
import type { CommissionSummary } from "@ecommerce/shared";

interface CommissionTableProps {
  data: CommissionSummary[];
}

/** Renders a commission breakdown table with per-merchant rows and a totals footer. */
export default function CommissionTable({ data }: CommissionTableProps) {
  const totals = data.reduce(
    (acc, row) => ({
      bagCount: acc.bagCount + row.bagCount,
      grossSubtotalCents: acc.grossSubtotalCents + row.grossSubtotalCents,
      commissionCents: acc.commissionCents + row.commissionCents,
    }),
    { bagCount: 0, grossSubtotalCents: 0, commissionCents: 0 },
  );

  if (data.length === 0) {
    return (
      <div className="commission-table commission-table--empty">
        <p>No commission data available yet.</p>
      </div>
    );
  }

  return (
    <div className="commission-table">
      {/* Table uses scope="col" on headers for screen reader cell-header association (WCAG 1.3.1) */}
      <table className="commission-table__table">
        <thead>
          <tr className="commission-table__header">
            <th scope="col">Merchant</th>
            <th scope="col">Orders</th>
            <th scope="col">Gross Subtotal</th>
            <th scope="col">Rate</th>
            <th scope="col">Commission</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.merchantName} className="commission-table__row">
              <td>{row.merchantName}</td>
              <td>{row.bagCount}</td>
              <td>{formatPrice(row.grossSubtotalCents)}</td>
              <td>{row.commissionRate}%</td>
              <td className="commission-table__commission">{formatPrice(row.commissionCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="commission-table__total">
            <td>Total</td>
            <td>{totals.bagCount}</td>
            <td>{formatPrice(totals.grossSubtotalCents)}</td>
            <td>—</td>
            <td className="commission-table__commission">{formatPrice(totals.commissionCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
