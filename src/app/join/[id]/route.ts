/** Reminder SMS/email links from the old system (/join/<eventId>) now open Appointments, where Join uses Semble's video link. */
export function GET(req: Request) {
  return Response.redirect(new URL("/appointments", req.url), 303);
}
