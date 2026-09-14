import { ButtonLink } from "@/components/ui/button";
import type { JourneyView } from "@/lib/portal/journey";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** The one primary card per stage. Navy for "do this now", tinted for states, white otherwise. */
export function HeadlineCard({ headline }: { headline: JourneyView["headline"] }) {
  const tone = headline.tone;
  const cls = {
    navy: "bg-ink text-white border-ink-deep",
    positive: "bg-lime-soft text-ink border-[#c8e6b0]",
    notice: "bg-amber-soft text-ink border-[#f0d3ad]",
    warn: "bg-warn-soft text-ink border-[#efcfc8]",
    default: "bg-paper text-ink border-divider-soft shadow-card",
  }[tone];
  const bodyCls = tone === "navy" ? "text-dark-muted" : "text-ink-soft";
  return (
    <section className={cn("rounded-xl border p-6 fade-up", cls)}>
      <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-2xl">{headline.title}</h1>
      {headline.body ? <p className={cn("mt-2 max-w-[58ch] text-[15px] leading-relaxed", bodyCls)}>{headline.body}</p> : null}
      {headline.ctaHref ? (
        <div className="mt-5">
          <ButtonLink href={headline.ctaHref} variant={tone === "navy" ? "secondary" : "primary"} iconRight={<ArrowRight className="size-4" />}>
            {headline.ctaLabel}
          </ButtonLink>
        </div>
      ) : null}
    </section>
  );
}
