/**
 * Vitest configuration for Convex backend tests.
 *
 * Uses `convex-test` to run queries/mutations against an in-memory database
 * seeded with the Convex schema. No live backend needed.
 *
 * Run from monorepo root: `npx vitest run --root convex`
 *
 * @see https://docs.convex.dev/testing
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
