import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSemble } from "@/lib/semble";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/misc";
import { clinicianDisplay, fmtDateYear } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DocumentKind } from "@/lib/semble/types";
import { FileText, FileBadge, FileHeart, FlaskConical, FileCheck, File } from "lucide-react";

const KINDS: { key: DocumentKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "letter", label: "Letters" },
  { key: "insurance", label: "Insurance" },
  { key: "plan", label: "Plans" },
  { key: "consent", label: "Consent" },
  { key: "lab", label: "Results" },
];
const ICON: Record<DocumentKind, React.ReactNode> = {
  letter: <FileText className="size-5" />,
  insurance: <FileBadge className="size-5" />,
  plan: <FileHeart className="size-5" />,
  lab: <FlaskConical className="size-5" />,
  consent: <FileCheck className="size-5" />,
  other: <File className="size-5" />,
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const docs = await getSemble().listDocuments(user.semblePatientId);
  const kind = (KINDS.find((k) => k.key === sp.kind)?.key ?? "all") as DocumentKind | "all";
  const shown = kind === "all" ? docs : docs.filter((d) => d.kind === kind);

  return (
    <>
      <PageHeader title="Documents" sub="Letters from your doctor, your nutrition plan, insurance documentation and results." />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Document type">
        {KINDS.map((k) => {
          const n = k.key === "all" ? docs.length : docs.filter((d) => d.kind === k.key).length;
          const on = k.key === kind;
          return (
            <Link key={k.key} href={k.key === "all" ? "/documents" : `/documents?kind=${k.key}`} role="tab" aria-selected={on} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors", on ? "border-blue bg-blue-soft text-ink" : "border-divider bg-paper text-ink-soft hover:border-blue")}>
              {k.label}
              <span className="rounded-full bg-paper-soft px-1.5 text-[11px] tabular text-muted">{n}</span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {kind === "insurance" ? <Callout tone="info" title="For your private health-insurance claim">Send these with your claim form. Receipts are under Billing.</Callout> : null}
          <Card>
            <CardHeader title={KINDS.find((k) => k.key === kind)?.label ?? "All"} sub={`${shown.length} document${shown.length === 1 ? "" : "s"} · newest first`} />
            {shown.length ? (
              <ul className="divide-y divide-divider-soft">
                {shown.map((d) => (
                  <li key={d.id} className="flex items-start gap-3 py-3.5">
                    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-blue-soft text-blue-text">{ICON[d.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium leading-snug">{d.title}</div>
                      <div className="text-[12.5px] text-muted">
                        {fmtDateYear(d.createdAtUtc)}
                        {d.author ? ` · ${clinicianDisplay(d.author)}` : ""}
                      </div>
                      {d.summary ? <p className="mt-1 text-[13px] text-ink-soft">{d.summary}</p> : null}
                    </div>
                    {d.downloadable ? (
                      <a href={`/api/demo/pdf?kind=document&id=${d.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-divider bg-paper px-3.5 text-[13px] font-medium text-ink hover:border-blue hover:bg-blue-wash">
                        Open
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing here yet">Documents your care team shares with you appear here and by email.</EmptyState>
            )}
            <p className="mt-3 text-[11.5px] text-muted">Links open a copy minted for you and expire after 2 hours. Only documents your care team has shared appear here.</p>
          </Card>
        </div>
        <aside className="space-y-6">
          <Card tone="soft" className="!p-4">
            <div className="text-[13.5px] font-medium">Missing something?</div>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">
              Letters are shared after your doctor signs them off — usually within 2 working days of an appointment. Insurance documentation is issued once, in month 1. <Link href="/care" className="text-blue-text hover:underline">Ask the care team</Link> if you need something sooner.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
