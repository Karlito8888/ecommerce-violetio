import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * Order confirmation stub — Story 4.5 will implement the full UI.
 *
 * For Story 4.4, this minimal page shows the order ID and a link home.
 * The full confirmation (order details, bag statuses, email confirmation)
 * will be built in Story 5.1 (Order Confirmation & Data Persistence).
 */
export const Route = createFileRoute("/order/$orderId/confirmation")({
  component: OrderConfirmationStub,
});

function OrderConfirmationStub() {
  const { orderId } = Route.useParams();

  return (
    <div className="page-wrap">
      <div style={{ padding: "4rem 0", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "1rem" }}>
          Order Placed!
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--color-charcoal)", marginBottom: "0.5rem" }}>
          Thank you for your purchase.
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-steel)", marginBottom: "2rem" }}>
          Order ID: {orderId}
        </p>
        <Link
          to="/"
          style={{
            display: "inline-block",
            padding: "0.75rem 2rem",
            background: "var(--color-midnight)",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
