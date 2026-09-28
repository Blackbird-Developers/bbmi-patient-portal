/** Stripe Billing Portal's return URL is USER_APP_URL/dashboard. */
export function GET(req: Request) {
  return Response.redirect(new URL("/", req.url), 303);
}
