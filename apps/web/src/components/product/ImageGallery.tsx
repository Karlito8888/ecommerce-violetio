import { useState } from "react";
import type { ProductImage } from "@ecommerce/shared";

import "./ImageGallery.css";

/**
 * Product image gallery with hero image and thumbnail navigation.
 *
 * ## Anatomy
 * ```
 * ┌─────────────────────────┐
 * │                         │
 * │      [Hero Image]       │  ← 3:4 aspect ratio, eager-loaded (above fold)
 * │                         │
 * ├──┬──┬──┬──┬──┬──────────┤
 * │T1│T2│T3│T4│T5│          │  ← Thumbnails: horizontal scroll, lazy-loaded
 * └──┴──┴──┴──┴──┴──────────┘
 * ```
 *
 * ## Image Handling (Violet.io best practices)
 *
 * - Images come from `product.images[]`, sorted by `displayOrder`
 * - Primary image identified via `primary: true` flag
 * - Images are CDN URLs from merchant platforms (Shopify CDN, etc.) — served directly
 * - `thumbnailUrl` on the Offer is a convenience shortcut — may be `null`
 * - `default_image_url` does NOT exist on get-by-id responses — not used here
 * - Alt text generated as `"${productName} - Image N of M"` since Violet's
 *   `alt_text` field is not yet in our ProductImage type
 *
 * @see https://docs.violet.io/prism/catalog/media-transformations
 */
export default function ImageGallery({
  images,
  productName,
}: {
  images: ProductImage[];
  productName: string;
}) {
  const sorted = [...images].sort((a, b) => a.displayOrder - b.displayOrder);
  const primaryIndex = sorted.findIndex((img) => img.primary);
  const [activeIndex, setActiveIndex] = useState(primaryIndex >= 0 ? primaryIndex : 0);
  const total = sorted.length;

  if (total === 0) {
    return (
      <div className="image-gallery" role="region" aria-label="Product images">
        <div
          className="image-gallery__hero image-gallery__placeholder"
          role="img"
          aria-label={productName}
        >
          <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect width="48" height="48" rx="4" fill="var(--color-sand)" />
            <path d="M14 34l8-10 6 7 4-5 6 8H14z" fill="var(--color-stone)" />
            <circle cx="18" cy="18" r="3" fill="var(--color-stone)" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="image-gallery" role="region" aria-label="Product images">
      <div className="image-gallery__hero">
        <img
          src={sorted[activeIndex].url}
          alt={`${productName} - Image ${activeIndex + 1} of ${total}`}
          loading="eager"
        />
      </div>

      {total > 1 && (
        <div className="image-gallery__thumbs">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className={`image-gallery__thumb${i === activeIndex ? " image-gallery__thumb--active" : ""}`}
              onClick={() => setActiveIndex(i)}
              aria-label={`View image ${i + 1} of ${total}`}
            >
              <img src={img.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
