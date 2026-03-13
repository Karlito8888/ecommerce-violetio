/**
 * Vitest configuration for @ecommerce/shared.
 *
 * ## Why this file exists
 *
 * The shared package's tests use Vitest-specific APIs (vi.stubGlobal,
 * vi.mocked, vi.useFakeTimers) that are NOT available in Bun's native
 * test runner. Without this config, running `bun test` from this directory
 * would use Bun's built-in runner instead of Vitest, causing 28+ failures.
 *
 * Always run tests via `bun run test` (which invokes `vitest run`) or
 * from the monorepo root via `bun --cwd=packages/shared run test`.
 *
 * @see https://vitest.dev/config/
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
