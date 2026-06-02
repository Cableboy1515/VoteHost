import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { computeTallyHash } from "@/lib/verification"
import { sendElectionResultsEmail } from "@/lib/sendElectionResultsEmail"
import { recordActivity } from "@/lib/recordActivity"
import { computeNormalizationManifestHash } from "@/lib/writeIn"

/**
 * POST /api/elections/[id]/finalize
 *
 * ADMIN-only. Transitions a PENDING_REVIEW election to COMPLETED by:
 *   1. Computing the tally hash over raw (unmodified) votes.
 *   2. Computing the normalization manifest hash (write-in merge overlay).
 *   3. Sealing the election as COMPLETED with finalizedAt/finalizedById.
 *   4. Optionally auto-sending results if autoSendResults is enabled.
 *
 * The normalization manifest (WriteInMerge rows) is exported alongside the
 * tally hash in the audit file so any observer can reproduce the merged
 * tally from the immutable raw votes + published manifest.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 })

  const { id } = await params

  const election = await db.election.findUnique({
    where: { id },
    select: { status: true, title: true, autoSendResults: true, resultsEmailSentAt: true },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status !== "PENDING_REVIEW") {
    return NextResponse.json(
      { error: `Election is ${election.status}, not PENDING_REVIEW.` },
      { status: 409 }
    )
  }

  const [votes, manifestHash] = await Promise.all([
    db.vote.findMany({ where: { electionId: id } }),
    computeNormalizationManifestHash(id),
  ])

  const tallyHash = computeTallyHash(votes)
  const now = new Date()

  // Seal the election atomically — prevent double-finalize races.
  const updated = await db.election.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: {
      status: "COMPLETED",
      tallyHash,
      tallyHashSetAt: now,
      normalizationManifestHash: manifestHash,
      finalizedAt: now,
      finalizedById: session.sub,
    },
  })

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Election was already finalized or status changed." },
      { status: 409 }
    )
  }

  const mergeCount = await db.writeInMerge.count({ where: { electionId: id } })

  await recordActivity({
    session,
    action: "election.finalize",
    electionId: id,
    targetType: "election",
    targetId: id,
    targetLabel: election.title,
    metadata: { tallyHash, normalizationManifestHash: manifestHash, mergeCount, voteCount: votes.length },
  })

  // Auto-send results if enabled and not already sent.
  if (election.autoSendResults && !election.resultsEmailSentAt) {
    sendElectionResultsEmail(id)
      .then(({ sentCount, failedCount }) =>
        recordActivity({
          session,
          action: "election.results_email_auto_sent",
          electionId: id,
          targetType: "election",
          targetId: id,
          targetLabel: election.title,
          metadata: { sentCount, failedCount },
        })
      )
      .catch((err) => console.error(`[finalize] results email failed for ${id}:`, err))
  }

  return NextResponse.json({ ok: true, tallyHash, normalizationManifestHash: manifestHash, mergeCount })
}
