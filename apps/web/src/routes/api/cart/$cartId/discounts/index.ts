/**
 * API Route: POST /api/cart/:cartId/discounts
 *
 * Applies a discount/promo code to the cart.
 * Mobile proxy — validates input then delegates to VioletAdapter.
 *
 * ## KISS: pass-through to Violet
 * Violet expects `{ code, merchant_id: number, email? }` — we validate
 * with Zod then forward directly. No camelCase↔snake_case conversion needed
 * since the mobile client already sends Violet-format fields.
 *
 * Per Violet docs:
 * - Discount codes are validated against the merchant's e-commerce platform
 * - 6 statuses: PENDING, APPLIED, INVALID, NOT_SUPPORTED, ERROR, EXPIRED
 * - Non-blocking: invalid/expired discounts are auto-removed at submission
 * - email is optional, used for customer-restricted discounts ("Once Per Customer")
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts
 * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getAdapter } from "#/server/violetAdapter";
import type { DiscountInput } from "@ecommerce/shared";

/** Validates the mobile request body against Violet's expected format. */
const addDiscountBodySchema = z.object({
  code: z.string().min(1, "Discount code is required").max(100, "Code too long"),
  merchant_id: z.number().int().min(1, "Merchant ID is required"),
  email: z.string().email("Invalid email format").optional(),
});

export const Route = createFileRoute("/api/cart/$cartId/discounts/")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const raw = await request.json();
        const parsed = addDiscountBodySchema.safeParse(raw);

        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return Response.json({ data: null, error: { code: "VALIDATION", message } });
        }

        const { code, merchant_id, email } = parsed.data;
        const adapter = getAdapter();

        // Map to shared DiscountInput (camelCase, string merchantId)
        const input: DiscountInput = {
          code,
          merchantId: String(merchant_id),
          ...(email ? { email } : {}),
        };

        const result = await adapter.addDiscount(params.cartId, input);
        return Response.json({ data: result.data, error: result.error });
      },
    },
  },
});
