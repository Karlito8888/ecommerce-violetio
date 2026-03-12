import type { VioletAuthConfig } from "../types/index.js";
import type { SupplierAdapter } from "./supplierAdapter.js";
import { VioletTokenManager } from "../clients/violetAuth.js";
import { VioletAdapter } from "./violetAdapter.js";

/**
 * Configuration for the adapter factory.
 *
 * The `supplier` field selects which adapter implementation to instantiate.
 * Each supplier has its own optional config block with provider-specific credentials.
 *
 * Currently supported suppliers:
 * - `"violet"` — Violet.io multi-merchant commerce API (requires `violet` config)
 *
 * Planned future suppliers (see Architecture doc):
 * - `"firmly"` — firmly.ai (Story TBD)
 * - `"google-ucp"` — Google Universal Commerce Platform (Story TBD)
 */
export interface AdapterConfig {
  supplier: string;
  violet?: VioletAuthConfig;
}

/**
 * Factory function that returns the appropriate SupplierAdapter implementation
 * based on configuration.
 *
 * ## Usage
 *
 * ```typescript
 * const adapter = createSupplierAdapter({
 *   supplier: "violet",
 *   violet: { appId, appSecret, username, password, apiBase },
 * });
 * const products = await adapter.getProducts({ page: 1 });
 * ```
 *
 * ## Design decision
 *
 * The factory pattern allows the application to switch suppliers without
 * changing any consuming code. The `SupplierAdapter` interface is the
 * boundary — all supplier-specific logic (auth, data shapes, rate limits)
 * is encapsulated within each adapter implementation.
 *
 * @throws {Error} If `supplier` is not supported or required config is missing
 */
export function createSupplierAdapter(config: AdapterConfig): SupplierAdapter {
  switch (config.supplier) {
    case "violet": {
      if (!config.violet) {
        throw new Error(
          'Violet adapter requires "violet" config with appId, appSecret, username, password, apiBase',
        );
      }
      const tokenManager = new VioletTokenManager(config.violet);
      return new VioletAdapter(tokenManager, config.violet.apiBase);
    }
    default:
      throw new Error(`Unsupported supplier: "${config.supplier}". Supported suppliers: violet`);
  }
}
