-- Migration: add product info columns to cart_items
-- Story 4.2 — Cart Summary with Transparent Pricing
-- Timestamp: 20260315000000
--
-- Violet's cart API only returns sku_id + price — no product names or images.
-- We store product info at add-to-cart time and retrieve it at get-cart time.
-- Nullable columns: legacy rows (from before this migration) will have NULL
-- values and will fall back to "SKU {skuId}" display in the UI.

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS product_name  TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
