/**
 * WalletCheckoutForm — Apple Pay / Google Pay checkout flow.
 *
 * Renders a PaymentRequestButtonElement that handles the full checkout flow
 * through the Apple Pay / Google Pay sheet: address, shipping, payment.
 *
 * ## Flow (per Violet docs)
 * 1. User taps Apple Pay / Google Pay button
 * 2. `shippingaddresschange`: apply customer address to cart, fetch shipping methods
 * 3. `shippingoptionchange`: apply selected shipping method to cart
 * 4. `paymentmethod`: confirm payment via Stripe, then submit to Violet
 *    with `order_customer` containing the full (unredacted) address
 *
 * ## Multi-merchant limitation
 * Wallet (Apple Pay / Google Pay) sheet cannot show different shipping methods per merchant.
 * For multi-bag carts, only the first bag's shipping methods are shown.
 * The doc recommends using the payment-only flow for multi-merchant carts.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-apple-pay
 * @see https://docs.violet.io/prism/payments/payment-integrations/supported-providers/apple-pay
 * @see https://docs.violet.io/prism/payments/payment-integrations/supported-providers/google-pay
 */
import { useState, useEffect, useRef } from "react";
import { PaymentRequestButtonElement, useStripe } from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";
import {
  setShippingAddressFn,
  getAvailableShippingMethodsFn,
  setShippingMethodsFn,
} from "../../server/checkout";
import { useOrderSubmit } from "./useOrderSubmit";

interface WalletCheckoutFormProps {
  clientSecret: string;
  appOrderId: string;
  cartTotal: number;
  currency: string;
  onSuccess: (orderId: string) => void;
}

export function WalletCheckoutForm({
  clientSecret,
  appOrderId,
  cartTotal,
  currency,
  onSuccess,
}: WalletCheckoutFormProps) {
  const stripe = useStripe();
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canMakePayment, setCanMakePayment] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Cache shipping methods between shippingaddresschange and shippingoptionchange (DRY). */
  const cachedMethods = useRef<Array<{
    bagId: string;
    shippingMethods: Array<{ id: string; label: string; carrier?: string; price: number }>;
  }> | null>(null);

  const { submitOrder } = useOrderSubmit({ stripe, appOrderId, onSuccess });

  // ── Create PaymentRequest ──────────────────────────────────────────
  useEffect(() => {
    if (!stripe || !clientSecret) return;

    // Country code of the Stripe platform account — determines Apple Pay/Google Pay availability.
    // US for sandbox (Violet's internal Stripe), FR for production (our Stripe platform account).
    // @see https://stripe.com/docs/js/payment_request
    const accountCountry = import.meta.env.VITE_STRIPE_ACCOUNT_COUNTRY || "US";

    const pr = stripe.paymentRequest({
      country: accountCountry,
      currency: currency.toLowerCase(),
      total: {
        label: "Order Total",
        amount: cartTotal,
      },
      requestPayerName: true,
      requestPayerEmail: true,
      requestShipping: true,
    });

    pr.canMakePayment().then((result) => {
      if (result) {
        setPaymentRequest(pr);
        setCanMakePayment(true);
      }
    });

    return () => {
      pr.off("shippingaddresschange");
      pr.off("shippingoptionchange");
      pr.off("paymentmethod");
    };
  }, [stripe, clientSecret, cartTotal, currency]);

  // ── shippingaddresschange ──────────────────────────────────────────
  // Wallet (Apple Pay / Google Pay) returns the shipping address but omits address_1 for privacy.
  // Violet allows empty string for address_1 on wallet-based carts at this stage.
  // The real address is provided after payment confirmation in the submit step.
  useEffect(() => {
    if (!paymentRequest) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = async (event: any) => {
      // Stripe PaymentRequest 'shippingaddresschange' event.
      // event.shippingAddress is available but address_1 is redacted by wallet (Apple/Google privacy).
      // @see https://stripe.com/docs/js/payment_request/events/shipping_address_change
      const addr = event.shippingAddress;

      try {
        // Step 1: Apply customer info with partial address (empty address_1)
        await setShippingAddressFn({
          data: {
            address1: "", // Wallet redacts this until payment confirmed (Apple/Google)
            city: addr.city ?? "",
            state: addr.region ?? "",
            postalCode: addr.postalCode ?? "",
            country: addr.country ?? "US",
          },
        });

        // Step 2: Fetch available shipping methods (also cached for shippingoptionchange)
        const methodsResult = await getAvailableShippingMethodsFn();

        if (methodsResult.error || !methodsResult.data) {
          cachedMethods.current = null;
          event.updateWith({ status: "invalid_shipping_address" });
          return;
        }

        const allMethods = methodsResult.data.flatMap((b) => b.shippingMethods);
        if (allMethods.length === 0) {
          cachedMethods.current = null;
          event.updateWith({ status: "invalid_shipping_address" });
          return;
        }

        // Cache for reuse in shippingoptionchange
        cachedMethods.current = methodsResult.data;

        const shippingOptions = allMethods.map((m, i) => ({
          id: m.id || String(i),
          label: m.label,
          detail: m.carrier ?? "",
          amount: m.price,
        }));

        const shippingCost = allMethods[0]?.price ?? 0;
        event.updateWith({
          status: "success",
          shippingOptions,
          total: { label: "Order Total", amount: cartTotal + shippingCost },
        });
      } catch {
        cachedMethods.current = null;
        event.updateWith({ status: "invalid_shipping_address" });
      }
    };

    paymentRequest.on("shippingaddresschange", handler);
    return () => {
      paymentRequest.off("shippingaddresschange", handler);
    };
  }, [paymentRequest, cartTotal]);

  // ── shippingoptionchange ──────────────────────────────────────────
  useEffect(() => {
    if (!paymentRequest) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = async (event: any) => {
      // Stripe PaymentRequest 'shippingoptionchange' event.
      // @see https://stripe.com/docs/js/payment_request/events/shipping_option_change
      try {
        // Use cached methods from shippingaddresschange if available (DRY)
        const cached = cachedMethods.current;
        const bags = cached;

        if (!bags) {
          event.updateWith({ status: "fail" });
          return;
        }

        const allMethods = bags.flatMap((b) => b.shippingMethods);
        const selected = allMethods.find(
          (m) => m.id === event.shippingOption.id || m.label === event.shippingOption.label,
        );

        if (!selected) {
          event.updateWith({ status: "fail" });
          return;
        }

        // Apply shipping method to all bags
        const selections = bags.map((bag) => ({
          bagId: bag.bagId,
          shippingMethodId: selected.id,
        }));

        await setShippingMethodsFn({ data: { selections } });

        event.updateWith({
          status: "success",
          total: { label: "Order Total", amount: cartTotal + selected.price },
        });
      } catch {
        event.updateWith({ status: "fail" });
      }
    };

    paymentRequest.on("shippingoptionchange", handler);
    return () => {
      paymentRequest.off("shippingoptionchange", handler);
    };
  }, [paymentRequest, cartTotal]);

  // ── paymentmethod (confirm + submit) ──────────────────────────────
  useEffect(() => {
    if (!paymentRequest) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = async (ev: any) => {
      // Stripe PaymentRequest 'paymentmethod' event.
      // @see https://stripe.com/docs/js/payment_request/events/payment_method
      setSubmitting(true);
      setError(null);

      if (!stripe) {
        ev.complete("fail");
        setError("Stripe not loaded");
        setSubmitting(false);
        return;
      }

      try {
        // Step 1: Confirm the payment intent with the wallet payment method
        const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false },
        );

        if (confirmError) {
          ev.complete("fail");
          setError(confirmError.message ?? "Payment failed");
          setSubmitting(false);
          return;
        }

        // Report success to close the Apple Pay / Google Pay sheet
        ev.complete("success");

        // Step 2: Handle 3D Secure if required (first pass)
        if (paymentIntent?.status === "requires_action") {
          const { error: actionError } = await stripe.confirmCardPayment(clientSecret);
          if (actionError) {
            setError(actionError.message ?? "3D Secure authentication failed");
            setSubmitting(false);
            return;
          }
        }

        // Step 3: Build order_customer with the full (unredacted) address
        // Wallet now provides the real address (including address_1) after payment confirmation.
        const walletName = ev.paymentMethod.billing_details?.name ?? "";
        const nameParts = walletName.split(" ");
        const firstName = nameParts[0] || ev.payerName?.split(" ")[0] || "";
        const lastName =
          nameParts.slice(1).join(" ") || ev.payerName?.split(" ").slice(1).join(" ") || "";

        const shippingAddr = ev.shippingAddress;
        const billingAddr = ev.paymentMethod.billing_details?.address;
        const hasShippingAddress =
          shippingAddr && (shippingAddr.addressLine?.[0] || shippingAddr.city);

        // Step 4: Submit to Violet (shared hook handles 3DS + REJECTED + CANCELED)
        const submitError = await submitOrder(
          hasShippingAddress
            ? {
                orderCustomer: {
                  firstName,
                  lastName,
                  email: ev.payerEmail ?? "",
                  shippingAddress: {
                    address1: shippingAddr!.addressLine?.[0] ?? "",
                    city: shippingAddr!.city ?? "",
                    state: shippingAddr!.region ?? "",
                    postalCode: shippingAddr!.postalCode ?? "",
                    country: shippingAddr!.country ?? "US",
                  },
                  sameAddress: true,
                  ...(billingAddr && billingAddr.line1
                    ? {
                        sameAddress: false as const,
                        billingAddress: {
                          address1: billingAddr.line1,
                          city: billingAddr.city ?? "",
                          state: billingAddr.state ?? "",
                          postalCode: billingAddr.postal_code ?? "",
                          country: billingAddr.country ?? "US",
                        },
                      }
                    : {}),
                },
              }
            : undefined,
        );

        if (submitError) {
          setError(submitError);
          setSubmitting(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        setSubmitting(false);
      }
    };

    paymentRequest.on("paymentmethod", handler);
    return () => {
      paymentRequest.off("paymentmethod", handler);
    };
  }, [paymentRequest, clientSecret, stripe, submitOrder]);

  if (!canMakePayment || !paymentRequest) {
    return null;
  }

  return (
    <div className="checkout__wallet">
      <PaymentRequestButtonElement
        options={{
          paymentRequest,
          style: {
            paymentRequestButton: {
              type: "default",
              theme: "dark",
              height: "48px",
            },
          },
        }}
      />
      {isSubmitting && <p className="checkout__wallet-status">Processing your order…</p>}
      {error && <p className="checkout__wallet-error">{error}</p>}
    </div>
  );
}
