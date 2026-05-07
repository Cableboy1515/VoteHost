import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { getResultsForElection } from "@/lib/results"
import ResultsDashboard from "@/components/admin/ResultsDashboard"
import Link from "next/link"
import type { ElectionStatus } from "@/lib/generated/prisma/client"

const STATUS_STYLE: Record<ElectionStatus, React.CSSProperties> = {
  DRAFT: { background: "var(--vh-surface-3)", color: "var(--vh-ink-soft)", borderColor: "var(--vh-line-strong)" },
  ACTIVE: { background: "var(--vh-success-soft)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.78 0.08 155)" },
  CLOSED: { background: "var(--vh-surface-3)", color: "var(--vh-muted)", borderColor: "var(--vh-line-strong)" },
  COMPLETED: { background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)", borderColor: "oklch(0.85 0.05 255)" },
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const election = await db.election.findUnique({ where: { id } })
  if (!election) notFound()

  const initialData = await getResultsForElection(id)

  return (
    <div className="p-8 max-w-[1040px]">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-medium border"
              style={STATUS_STYLE[election.status]}
            >
              {election.status === "ACTIVE" && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "oklch(0.55 0.13 155)", animation: "vhPulse 1.6s ease-in-out infinite" }}
                />
              )}
              {election.status === "ACTIVE" ? "Live" : election.status.charAt(0) + election.status.slice(1).toLowerCase()}
            </span>
            <span className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
              {election.status === "ACTIVE" ? "· updated just now" : ""}
            </span>
          </div>
          <h1 className="text-[26px] font-semibold">{election.title}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/elections/${id}/voters`}
            className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            ← Voters
          </Link>
          <Link
            href={`/admin/elections/${id}`}
            className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            Settings
          </Link>
        </div>
      </div>

      <ResultsDashboard
        electionId={id}
        initialData={initialData}
        endsAt={election.endsAt?.toISOString()}
        electionStatus={election.status}
      />
    </div>
  )
}
