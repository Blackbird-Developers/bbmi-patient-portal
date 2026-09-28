"use client";

/** Last-resort boundary (errors in the root layout). Kept dependency-free on purpose. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IE">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "64px auto", padding: "0 16px", color: "#0f2430" }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p>We couldn&apos;t load the portal just now. Try again in a moment, or call the care team on +353 1 903 8441.</p>
        <button type="button" onClick={() => reset()} style={{ padding: "10px 16px", borderRadius: 999, border: 0, background: "#053F5C", color: "#fff" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
