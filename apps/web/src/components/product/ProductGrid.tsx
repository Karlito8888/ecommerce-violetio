import type { Product } from "@ecommerce/shared";
import ProductCard from "./ProductCard";

import "./ProductGrid.css";

/**
 * Responsive product grid using CSS Grid.
 *
 * Column breakpoints (from UX spec):
 * - Mobile (< 768px): 2 columns, gap = --space-4 (16px)
 * - Tablet (768px+): 3 columns, gap = --space-6 (24px)
 * - Desktop (1024px+): 4 columns, gap = --space-8 (32px)
 *
 * Max width: 1200px centered — prevents overly wide grids on large screens.
 */
export default function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="product-grid" role="list">
      {products.map((product) => (
        <div key={product.id} role="listitem" style={{ minWidth: 0 }}>
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
