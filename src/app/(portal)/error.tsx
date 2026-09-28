"use client";

import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";

/** Shown when a page can't be built — usually the clinic system (Semble) not answering. */
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-[640px] py-6">
      <Callout
        tone="warn"
        title="We couldn't load this page"
        action={
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
        }
      >
        The clinic system didn&apos;t answer in time. Nothing you entered has been lost. If it keeps happening, call the care team on +353 1 903 8441.
      </Callout>
    </div>
  );
}
