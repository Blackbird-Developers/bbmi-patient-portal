import { currentUser } from "@/lib/auth";
import { getSemble, SembleAdapterError } from "@/lib/semble";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Shown in the browser; anything else downloads, so an uploaded HTML or SVG file can never run on the portal's origin. */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);
const LOCKED_DOWN = { "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'" };

/**
 * Opens a document the care team shared with the signed-in patient.
 * Semble's download URL is fetched and streamed here, so it never reaches the
 * browser; letters (which Semble stores as a body, not a file) are rendered.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  try {
    const doc = await getSemble().openDocument(user.semblePatientId, id);
    if (!doc) return new Response("Not found", { status: 404 });

    if (doc.kind === "html") {
      // Letter bodies are clinician-authored rich text; the sandboxing CSP stops anything in them from running.
      const page = `<!doctype html><html lang="en-IE"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#0f2430}</style></head><body><h1>${escapeHtml(doc.title)}</h1>${doc.html}</body></html>`;
      return new Response(page, { headers: { ...LOCKED_DOWN, "content-type": "text/html; charset=utf-8" } });
    }

    // Same-origin demo link (mock mode): a relative redirect keeps whatever host the portal was opened on.
    if (!doc.external) return new Response(null, { status: 302, headers: { location: doc.url, "cache-control": "no-store" } });

    const upstream = await fetch(doc.url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!upstream.ok || !upstream.body) return new Response("Document unavailable, please try again", { status: 502 });
    const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const inline = INLINE_TYPES.has(type);
    const filename = (doc.filename ?? "document").replace(/[^\w.\- ]+/g, "_");
    return new Response(upstream.body, {
      headers: {
        ...LOCKED_DOWN,
        // Chrome's PDF viewer breaks under a sandboxing or object-blocking CSP; a PDF cannot run script on this origin anyway.
        ...(type === "application/pdf" ? { "content-security-policy": "frame-ancestors 'none'" } : {}),
        "content-type": inline ? type : "application/octet-stream",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof SembleAdapterError || (e instanceof Error && e.name === "TimeoutError")) return new Response("The clinic system is busy, please try again", { status: 503 });
    throw e;
  }
}
