-- M2: Add commission_rate to order_bags
--
-- Stores the Violet commission rate at time of order (snapshot).
-- DEFAULT 10.0 covers existing rows for backwards compatibility.
-- Future rows will receive the real rate from Violet's API response.

ALTER TABLE order_bags
  ADD COLUMN commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.0;

COMMENT ON COLUMN order_bags.commission_rate IS
  'Commission rate (%) from Violet at time of order. Snapshot — not updated retroactively.';
