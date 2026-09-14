import { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";

/**
 * Demo stand-in for Semble's short-lived download URLs. In production the
 * portal backend fetches `Prescription.pdfDownloadUrl` (15 min) or
 * `PatientDocument.downloadUrl` (2 h) and STREAMS the bytes — the Semble URL
 * never reaches the browser. Here we generate a tiny valid PDF on the fly.
 */
function minimalPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "?");
  const content = ["BT", "/F1 18 Tf", "56 780 Td", `(${esc(lines[0] ?? "")}) Tj`, "/F1 11 Tf", ...lines.slice(1).flatMap((l) => ["0 -20 Td", `(${esc(l)}) Tj`]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind") ?? "document";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  // Prescriptions are never downloadable by the patient: the script goes from the
  // doctor to the pharmacy. Refused here too so a guessed URL cannot mint one.
  if (kind === "prescription") return new Response("Prescriptions are not available to download", { status: 403 });
  const title = kind === "invoice" ? "Receipt" : "Document";
  const pdf = minimalPdf([
    `Beyond BMI - ${title}`,
    `Reference: ${id}`,
    `Patient: ${user.firstName} ${user.lastName}`,
    `Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    "DEMO DOCUMENT - synthetic data, not a clinical record.",
    "In production this file is streamed from Semble's time-limited URL",
    "by the portal backend; the URL itself is never shown to the browser.",
  ]);
  return new Response(pdf.slice().buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="beyondbmi-${kind}-${id || "demo"}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
