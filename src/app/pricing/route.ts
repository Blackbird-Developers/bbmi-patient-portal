import { refreshAfterPurchase } from "@/lib/auth";

/**
 * The backend's Checkout return paths point at /pricing?checkout=success|cancelled (one-off tiers like €399);
 * the portal's page is /plans. A successful purchase also drops cached tokens so the new plan's groups load.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const c = url.searchParams.get("checkout");
  if (c === "success") {
    await refreshAfterPurchase();
    return Response.redirect(new URL("/?welcome=1", url), 303);
  }
  const to = new URL("/plans", url);
  if (c) to.searchParams.set("checkout", c);
  return Response.redirect(to, 303);
}
