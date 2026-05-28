export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { getProgress } from "@/lib/activationProgress"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const progress = getProgress(electionId)

  // While a send batch is active (or has just finished), report progress relative to
  // THAT batch — not the election-wide voter count. Otherwise the bar reads
  // "Sent 1 of 2" because the already-invited voter pre-counts toward "invited".
  let total: number
  let invited: number
  if (progress) {
    total = progress.total
    invited = progress.sent
  } else {
    ;[total, invited] = await Promise.all([
      db.voter.count({ where: { electionId } }),
      db.voter.count({ where: { electionId, invitedAt: { not: null } } }),
    ])
  }

  return NextResponse.json(
    {
      total,
      invited,
      failed: progress?.failed ?? 0,
      sending: progress?.running ?? false,
      stopped: progress?.stopped ?? false,
      stopReason: progress?.stopReason,
      lastError: progress?.lastError,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    }
  )
}
