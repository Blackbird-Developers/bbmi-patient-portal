import { switchPersona } from "@/app/actions";
import { STATE_LABEL, type MemberState } from "@/lib/portal/types";
import { FlaskConical } from "lucide-react";

/**
 * Demo-only: jump between synthetic patients at different journey stages.
 * Rendered only in mock mode; never ships against a real Semble tenant.
 */
export function PersonaSwitcher({ users, currentId, sembleMode }: { users: { userId: string; name: string; state: string; plan?: string }[]; currentId: string; sembleMode: "mock" | "graphql" }) {
  if (sembleMode !== "mock") return null;
  return (
    <details className="group rounded-lg border border-white/10 bg-ink-deep/60 text-[12px]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-dark-muted hover:text-white">
        <FlaskConical className="size-3.5" />
        <span className="flex-1 font-medium">Demo: switch patient</span>
        <span className="rounded-full bg-lime/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lime">mock Semble</span>
      </summary>
      <form action={switchPersona} className="space-y-0.5 px-2 pb-2">
        {users.map((u) => (
          <button
            key={u.userId}
            name="userId"
            value={u.userId}
            className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-white/8 ${u.userId === currentId ? "bg-white/10 text-white" : "text-dark-muted"}`}
          >
            <span className="font-medium">{u.name}</span>
            <span className="text-[11px] opacity-80">{STATE_LABEL[u.state as MemberState]}{u.plan ? ` · ${u.plan}` : ""}</span>
          </button>
        ))}
      </form>
    </details>
  );
}
