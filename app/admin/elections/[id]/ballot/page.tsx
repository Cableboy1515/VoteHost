import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import BallotBuilder from "@/components/admin/BallotBuilder"
import Link from "next/link"

export default async function BallotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const election = await db.election.findUnique({
    where: { id },
    include: {
      questions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!election) notFound()

  return (
    <div className="p-8 max-w-[860px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <Link href="/admin/dashboard">Elections</Link>
        <span className="mx-1.5">›</span>
        <Link href={`/admin/elections/${id}`}>{election.title}</Link>
        <span className="mx-1.5">›</span>
        <span>Ballot</span>
      </div>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-[26px] font-semibold mb-1">Ballot builder</h1>
          <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
            {election.questions.length} question{election.questions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/elections/${id}`}
            className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            Settings
          </Link>
          <Link
            href={`/admin/elections/${id}/voters`}
            className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            Voters →
          </Link>
        </div>
      </div>
      <BallotBuilder
        electionId={id}
        electionStatus={election.status}
        initialQuestions={election.questions.map((q) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          order: q.order,
          required: q.required,
          maxSelections: q.maxSelections ?? undefined,
          options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
        }))}
      />
    </div>
  )
}
