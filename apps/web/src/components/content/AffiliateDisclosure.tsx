/**
 * Affiliate disclosure banner — legally required on every page with product links (FR11).
 * Renders as an <aside> with role="note" for accessibility.
 */
export default function AffiliateDisclosure() {
  return (
    <aside className="affiliate-disclosure" role="note" aria-label="Affiliate disclosure">
      <p className="affiliate-disclosure__text">
        This page contains affiliate links. We may earn a commission on purchases made through these
        links at no extra cost to you.
      </p>
    </aside>
  );
}
