/**
 * Violet checkout operations: setCustomer, setBillingAddress,
 * getPaymentIntent, submitOrder.
 */

import type {
  ApiResponse,
  CustomerInput,
  PaymentIntent,
  ShippingAddressInput,
  OrderStatus,
  OrderSubmitResult,
  BagStatus,
  BagFinancialStatus,
} from "../types/index.js";
import { violetCartResponseSchema } from "../schemas/index.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";

/**
 * Sets guest customer info on the cart via POST /checkout/cart/{id}/customer.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/apply-guest-customer-to-cart
 */
export async function setCustomer(
  ctx: CatalogContext,
  violetCartId: string,
  customer: CustomerInput,
): Promise<ApiResponse<void>> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
  };

  if (customer.marketingConsent) {
    body.communication_preferences = [{ enabled: true }];
  }

  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/customer`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };
  return { data: undefined, error: null };
}

/**
 * Sets a billing address different from the shipping address.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/set-billing-address
 */
export async function setBillingAddress(
  ctx: CatalogContext,
  violetCartId: string,
  address: ShippingAddressInput,
): Promise<ApiResponse<void>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/billing_address`,
    {
      method: "POST",
      body: JSON.stringify({
        address_1: address.address1,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: address.country,
      }),
    },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };
  return { data: undefined, error: null };
}

/**
 * Retrieves the Stripe PaymentIntent client secret from the cart.
 *
 * @see https://docs.violet.io/guides/checkout/payments
 */
export async function getPaymentIntent(
  ctx: CatalogContext,
  violetCartId: string,
): Promise<ApiResponse<PaymentIntent>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}`,
    { method: "GET" },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };

  const parsed = violetCartResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      data: null,
      error: { code: "VIOLET.VALIDATION_ERROR", message: "Invalid cart response" },
    };
  }

  const secret = parsed.data.payment_intent_client_secret;
  if (!secret) {
    return {
      data: null,
      error: {
        code: "VIOLET.NO_PAYMENT_INTENT",
        message: "Cart was not created with wallet_based_checkout: true. Recreate the cart.",
      },
    };
  }

  return {
    data: {
      id: `pi_from_cart_${violetCartId}`,
      clientSecret: secret,
      amount: parsed.data.total ?? 0,
      currency: parsed.data.currency ?? "USD",
      stripePublishableKey: parsed.data.stripe_key,
    },
    error: null,
  };
}

/**
 * Submits the order to Violet after Stripe payment authorization.
 *
 * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
 */
export async function submitOrder(
  ctx: CatalogContext,
  violetCartId: string,
  appOrderId: string,
): Promise<ApiResponse<OrderSubmitResult>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ app_order_id: appOrderId }),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const data = result.data as {
    id?: number;
    status?: string;
    payment_status?: string;
    payment_intent_client_secret?: string;
    payment_transactions?: Array<{
      payment_intent_client_secret?: string;
      metadata?: {
        payment_intent_client_secret?: string;
      };
    }>;
    bags?: Array<{
      id?: number;
      status?: string;
      financial_status?: string;
      total?: number;
    }>;
    errors?: Array<{
      id?: number;
      order_id?: number;
      bag_id?: number;
      entity_id?: string;
      entity_type?: string;
      type?: string;
      message?: string;
      date_created?: string;
      platform?: string;
      code?: string | number;
    }>;
  };

  const effectiveStatus: OrderStatus =
    data.payment_status === "REQUIRES_ACTION"
      ? "REQUIRES_ACTION"
      : ((data.status ?? "COMPLETED") as OrderStatus);

  const hasErrors = Array.isArray(data.errors) && data.errors.length > 0;

  if (hasErrors && effectiveStatus !== "COMPLETED") {
    const firstError = data.errors![0];
    return {
      data: null,
      error: {
        code: "VIOLET.ORDER_ERROR",
        message: firstError?.message
          ? `Order failed: ${firstError.message}`
          : "Order submission failed with errors",
      },
    };
  }

  const baseResult = {
    id: String(data.id ?? ""),
    status: effectiveStatus,
    paymentIntentClientSecret:
      data.payment_intent_client_secret ??
      data.payment_transactions?.[0]?.payment_intent_client_secret ??
      data.payment_transactions?.[0]?.metadata?.payment_intent_client_secret,
    bags: (data.bags ?? []).map((b) => ({
      id: String(b.id ?? ""),
      status: (b.status ?? "IN_PROGRESS") as BagStatus,
      financialStatus: (b.financial_status ?? "UNPAID") as BagFinancialStatus,
      total: b.total ?? 0,
    })),
  };

  if (hasErrors) {
    return {
      data: {
        ...baseResult,
        errors: data.errors!.map((e) => ({
          code: String(e.type ?? e.code ?? "UNKNOWN"),
          message: e.message ?? "",
          skuId: e.entity_type === "SKU" && e.entity_id ? String(e.entity_id) : undefined,
          bagId: e.bag_id != null ? String(e.bag_id) : undefined,
          type: e.type,
          entityType: e.entity_type,
          externalPlatform: e.platform,
        })),
      },
      error: null,
    };
  }

  return {
    data: baseResult,
    error: null,
  };
}
