import { refreshAfterPurchase } from "@/lib/auth";

/**
 * Stripe Checkout's success URL (the Beyond BMI backend sends patients to
 * USER_APP_URL/checkout/success). Drop the cached tokens and patient so the
 * next page load picks up the new plan and its Cognito groups; activation
 * itself arrives by Stripe webhook on the backend.
 */
export async function GET(req: Request) {
  await refreshAfterPurchase();
  return Response.redirect(new URL("/?welcome=1", req.url), 303);
}
