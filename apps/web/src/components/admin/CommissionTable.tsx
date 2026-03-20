import { formatPrice } from "@ecommerce/shared";
import type { CommissionSummary } from "@ecommerce/shared";

interface CommissionTableProps {
  data: CommissionSummary[];
}

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
      <table className="commission-table__table">
        <thead>
          <tr className="commission-table__header">
            <th>Merchant</th>
            <th>Orders</th>
            <th>Gross Subtotal</th>
            <th>Rate</th>
            <th>Commission</th>
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
