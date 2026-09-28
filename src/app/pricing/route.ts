/** The backend's Checkout cancel/return paths point at /pricing(?checkout=…); the portal's page is /plans. */
export function GET(req: Request) {
  const url = new URL(req.url);
  const to = new URL("/plans", url);
  const c = url.searchParams.get("checkout");
  if (c) to.searchParams.set("checkout", c);
  return Response.redirect(to, 303);
}
