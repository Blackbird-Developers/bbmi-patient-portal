"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Embeds a Beyond BMI Tally form. Answers reach the backend through Tally's
 * signed webhook (the portal never sees them); when Tally reports the
 * submission we reload with ?submitted=1 and the server checks the backend.
 */
export function TallyEmbed({ src, title }: { src: string; title: string }) {
  const router = useRouter();
  const [height, setHeight] = useState(900);
  const done = useRef(false);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== "string" || !e.data.includes("Tally.")) return;
      try {
        const msg = JSON.parse(e.data) as { event?: string; payload?: { height?: number } };
        if (msg.event === "Tally.FormPageView" || msg.event === "Tally.Resize") if (msg.payload?.height) setHeight(Math.max(600, msg.payload.height + 40));
        if (msg.event === "Tally.FormSubmitted" && !done.current) {
          done.current = true;
          router.push("?submitted=1");
        }
      } catch {
        if (e.data === "Tally.FormSubmitted" && !done.current) {
          done.current = true;
          router.push("?submitted=1");
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);
  return <iframe src={`${src}${src.includes("?") ? "&" : "?"}transparentBackground=1&dynamicHeight=1`} title={title} className="w-full border-0" style={{ height }} allow="clipboard-write" />;
}

/** While the webhook lands: re-check a few times, then stop and offer a manual refresh. */
export function AutoRefresh({ everyMs = 3000, times = 6 }: { everyMs?: number; times?: number }) {
  const router = useRouter();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= times) return;
    const t = setTimeout(() => {
      router.refresh();
      setN((x) => x + 1);
    }, everyMs);
    return () => clearTimeout(t);
  }, [n, times, everyMs, router]);
  return n >= times ? (
    <button type="button" onClick={() => setN(0)} className="text-[13px] font-medium text-blue-text hover:underline">
      Check again
    </button>
  ) : null;
}
