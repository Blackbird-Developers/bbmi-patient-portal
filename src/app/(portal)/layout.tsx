import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { LINKABLE_STAGES, listDemoUsers } from "@/lib/portal/store";
import { sembleMode, sembleTarget } from "@/lib/semble";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const j = await loadJourney(user);
  const badges = { "/": j.openTasks || undefined };
  return (
    <AppShell user={user} badges={badges} demoUsers={sembleMode() === "mock" ? listDemoUsers() : []} sembleMode={sembleMode()} sembleTarget={sembleTarget()} stages={LINKABLE_STAGES}>
      {children}
    </AppShell>
  );
}
