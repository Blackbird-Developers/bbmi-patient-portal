import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { listDemoUsers } from "@/lib/portal/store";
import { sembleMode } from "@/lib/semble";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const j = await loadJourney(user);
  const badges = { "/": j.openTasks || undefined };
  return (
    <AppShell user={user} badges={badges} demoUsers={listDemoUsers()} sembleMode={sembleMode()}>
      {children}
    </AppShell>
  );
}
