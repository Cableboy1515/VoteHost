import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import VoterManager from "@/components/admin/VoterManager"
import Link from "next/link"

export default async function VotersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const election = await db.election.findUnique({
    where: { id },
    include: { voters: { orderBy: { name: "asc" } } },
  })
  if (!election) notFound()

  return (
    <div className="p-8 max-w-[1040px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <Link href="/admin/dashboard">Elections</Link>
        <span className="mx-1.5">›</span>
        <Link href={`/admin/elections/${id}`}>{election.title}</Link>
        <span className="mx-1.5">›</span>
        <span>Voters</span>
      </div>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-[26px] font-semibold mb-1">Voters</h1>
          <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
            {election.title} · {election.voters.length} voter{election.voters.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/elections/${id}/ballot`}
            className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            ← Ballot
          </Link>
          <Link
            href={`/admin/elections/${id}/results`}
            className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            Results →
          </Link>
        </div>
      </div>
      <VoterManager
        electionId={id}
        electionStatus={election.status}
        initialVoters={election.voters.map((v) => ({
          id: v.id,
          name: v.name,
          email: v.email,
          hasVoted: v.hasVoted,
          invitedAt: v.invitedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
