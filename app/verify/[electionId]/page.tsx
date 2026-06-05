import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"
import CopyButton from "@/components/ui/copy-button"
import ReceiptLookupForm from "./ReceiptLookupForm"
import { formatDateOnlyInTz, getDisplayTimeZone } from "@/lib/timezone"

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ electionId: string }>
  searchParams: Promise<{ code?: string }>
}) {
  const { electionId } = await params
  const { code } = await searchParams

  const [election, tz] = await Promise.all([
    db.election.findUnique({
      where: { id: electionId },
      select: {
        id: true,
        title: true,
        status: true,
        tallyHash: true,
        tallyHashSetAt: true,
        _count: { select: { voters: true } },
      },
    }),
    getDisplayTimeZone(),
  ])

  if (!election) notFound()

  const votedCount = await db.voter.count({
    where: { electionId, hasVoted: true },
  })

  const statusLabel =
    election.status === "ACTIVE" ? "Active" :
    election.status === "COMPLETED" ? "Completed" :
    election.status === "PENDING_REVIEW" ? "Pending Review" :
    "Draft"

  return (
    <div className="min-h-screen bg-vh-bg">
      <header className="px-4 sm:px-6 py-5 border-b border-vh-line bg-vh-surface">
        <BrandMark size={28} />
      </header>

      <div className="max-w-xl mx-auto px-4 py-10 sm:py-14 space-y-6">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--vh-muted)" }}>
            Election verification
          </p>
          <h1 className="text-2xl font-semibold text-vh-ink mb-1">{election.title}</h1>
          <div className="flex items-center gap-3 text-[13px]" style={{ color: "var(--vh-muted)" }}>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium border"
              style={{
                background: election.status === "COMPLETED" ? "var(--vh-accent-soft)"
                  : election.status === "PENDING_REVIEW" ? "oklch(0.96 0.06 75)"
                  : "var(--vh-surface-3)",
                color: election.status === "COMPLETED" ? "var(--vh-accent-strong)"
                  : election.status === "PENDING_REVIEW" ? "oklch(0.4 0.14 65)"
                  : "var(--vh-ink-soft)",
                borderColor: election.status === "COMPLETED" ? "oklch(0.85 0.05 255)"
                  : election.status === "PENDING_REVIEW" ? "oklch(0.82 0.10 75)"
                  : "var(--vh-line-strong)",
              }}
            >
              {statusLabel}
            </span>
            <span>{votedCount} of {election._count.voters} voters cast a ballot</span>
          </div>
        </div>

        {election.status === "COMPLETED" && election.tallyHash ? (
          <div
            className="rounded-[14px] p-5 space-y-3"
            style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line-strong)" }}
          >
            <p className="text-[13px] font-semibold text-vh-ink">Tally hash</p>
            <div
              className="flex items-center gap-3 rounded-[10px] px-4 py-3"
              style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
            >
              <code className="flex-1 text-[11px] font-mono break-all" style={{ color: "var(--vh-ink-soft)" }}>
                sha256:{election.tallyHash}
              </code>
              <CopyButton value={`sha256:${election.tallyHash}`} />
            </div>
            {election.tallyHashSetAt && (
              <p className="text-[12px]" style={{ color: "var(--vh-muted)" }}>
                Sealed {formatDateOnlyInTz(election.tallyHashSetAt, tz)}
              </p>
            )}
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--vh-muted)" }}>
              This SHA-256 hash was computed from all vote records at the moment the election closed.
              An auditor can download the audit export from the admin results page, recompute the hash from the
              <code className="mx-1 px-1 rounded" style={{ background: "var(--vh-surface-3)" }}>votes</code>
              array, and confirm it matches. If it matches, the published tally is intact.
            </p>
          </div>
        ) : (
          <div
            className="rounded-[14px] p-5"
            style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
              The tally hash will be published here when the election closes.
            </p>
          </div>
        )}

        <div
          className="rounded-[14px] p-5 space-y-4"
          style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line-strong)" }}
        >
          <div>
            <p className="text-[13px] font-semibold text-vh-ink mb-1">Check your ballot receipt</p>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--vh-muted)" }}>
              Enter the receipt code from your confirmation email to verify your ballot was recorded.
              This does not reveal what you voted for.
            </p>
          </div>
          <ReceiptLookupForm electionId={electionId} initialCode={code} timeZone={tz} />
        </div>
      </div>
    </div>
  )
}
