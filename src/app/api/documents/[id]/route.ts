import { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { getSemble } from "@/lib/semble";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Opens a document the care team shared with the signed-in patient.
 * Semble's download URL is fetched and streamed here, so it never reaches the
 * browser; letters (which Semble stores as a body, not a file) are rendered.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  const doc = await getSemble().openDocument(user.semblePatientId, id);
  if (!doc) return new Response("Not found", { status: 404 });

  if (doc.kind === "html") {
    // Letter bodies are clinician-authored rich text; the CSP stops any script in them from running.
    const page = `<!doctype html><html lang="en-IE"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#0f2430}</style></head><body><h1>${escapeHtml(doc.title)}</h1>${doc.html}</body></html>`;
    return new Response(page, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:", "x-content-type-options": "nosniff" },
    });
  }

  if (!doc.external) return Response.redirect(new URL(doc.url, req.nextUrl.origin), 302);

  const upstream = await fetch(doc.url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return new Response("Document unavailable, please try again", { status: 502 });
  const filename = (doc.filename ?? "document").replace(/[^\w.\- ]+/g, "_");
  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
