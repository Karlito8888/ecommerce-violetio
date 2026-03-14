import { createFileRoute } from "@tanstack/react-router";

/**
 * /checkout — Placeholder route (implemented in Story 4.3).
 *
 * This stub exists so that `/checkout` is a valid TanStack Router destination
 * and "Proceed to Checkout" CTAs in CartDrawer and the cart page can link here
 * without TypeScript errors. Replace this component when Story 4.3 is implemented.
 *
 * @see apps/web/src/features/cart/CartDrawer.tsx — checkout CTA
 * @see apps/web/src/routes/cart/index.tsx — checkout CTA
 */
export const Route = createFileRoute("/checkout/")({
  component: CheckoutPage,
});

function CheckoutPage() {
  return (
    <div className="page-wrap">
      <p>Checkout coming soon — Story 4.3.</p>
    </div>
  );
}
